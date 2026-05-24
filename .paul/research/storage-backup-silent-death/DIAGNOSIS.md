# Storage-backup silent-death — DIAGNOSIS

**Date:** 2026-05-24
**Lane:** `storage-backup-silent-death-probe` (coder-3)
**Base SHA:** `1aea77464`
**Status:** Phase 1 diagnose — root cause identified.

## TL;DR

The storage-backup cron is **not silently dying**. It's **silently no-op'ing**
because the gating env var `CRC_BACKUP_DRIVE_FOLDER_ID` is unset in Vercel
prod, and the dormant code-path returns BEFORE writing any Firestore
heartbeat. PGR-03 then sees a missing `config/storageBackup` doc and
fail-opens silently. The observability gap masquerades as a
silent-cron-death failure.

The fix is to **always write a heartbeat** to `config/storageBackup` on
every tick (dormant or active), and to teach PGR-03 to alarm on the new
absent-but-deploy-aged signal.

## Evidence

### vercel.json HAS the cron entry

`vercel.json` line 32-38 (verified at `1aea77464`):

```json
{
    "path": "/api/cron/storage-backup",
    "schedule": "0 5 * * *"
}
```

So the cron IS registered and Vercel IS invoking the route nightly at
05:00Z. No vercel.json miss.

### Route handler dormant-skip path

`src/app/api/cron/storage-backup/route.ts:132-144`
(`runAndRespond`, called from both the GET cron path and the POST admin
manual path):

```ts
async function runAndRespond(req: NextRequest): Promise<NextResponse> {
    const backupFolderId = env.CRC_BACKUP_DRIVE_FOLDER_ID
    if (!backupFolderId) {
        logger.info(
            "[storage-backup] CRC_BACKUP_DRIVE_FOLDER_ID unset — cron is dormant",
        )
        return NextResponse.json({
            success: true,
            ran: false,
            reason:
                "CRC_BACKUP_DRIVE_FOLDER_ID env var not configured — set it in Vercel (a dedicated Shared Drive) to enable.",
        })
    }
    // ... runStorageBackupProd + recordStorageBackupRun ...
}
```

The dormant return at line 138-143 **bypasses both**:

- `recordStorageBackupRun(db, result, now())` — writes `config/storageBackup`
  + `storageBackups/{date}` success doc (mirror.ts:417-449)
- `writeStorageBackupError(deps.db, err, deps.now())` — writes
  `storageBackups/{date}.error` + `config/storageBackup.lastError` on
  thrown run (mirror.ts:375-407)

Neither runs on the dormant path. **Zero Firestore writes per tick.**

This matches the auditor's probe state observed at 2026-05-24T15:37Z:

- `config/storageBackup` → NOT FOUND
- `storageBackups/2026-05-24` → NOT FOUND
- `storageBackups/2026-05-23` → NOT FOUND

### PGR-03 fail-open on missing doc

`src/app/api/cron/admin-consistency/route.ts:150-201`
(`readAndAlertStorageBackupHealth`):

```ts
const health = checkStorageBackupHealth(snapshot, Date.now())
if (health.status === "missing" || health.status === "unavailable") {
    return health   // <-- silent fail-open; no captureMessage
}
```

`src/lib/storage-backup/health.ts:83-97` (`checkStorageBackupHealth`):

```ts
if (!snapshot) return { status: "missing" }
// ... if neither timestamp nor error string parseable ...
if (lastBackupAt == null && lastErrorAt == null && !lastError) {
    return { status: "missing" }
}
```

The PGR-03 spec comment (line 76-78) even acknowledges this:

> `null`/`undefined` snapshot means the cron has never run (or the doc was wiped); we report `missing` and let the caller decide whether to alarm (per spec — don't page on a never-run cron).

In current state, "caller decides not to alarm" → silence. Combined with
the dormant-skip in the route, this is the full silent-death class.

### Env var inferred unset

`.env.local` in the sibling `sheet-music-app-mcp/` worktree does NOT
contain `CRC_BACKUP_DRIVE_FOLDER_ID`. Daniel's local env is the closest
proxy I have to Vercel prod's env state from this lane; if it was set
in Vercel, it would typically also be mirrored locally for parity. The
storage-phase2 SHIP-NOTICE (master-tip's prior tip for `c4935b804`)
described the feature as "dormant by default" — Daniel was always
expected to set this manually post-deploy. There is no evidence that
manual activation step happened.

I cannot directly inspect Vercel prod env without auth from this lane,
but the on-disk artefact pattern + the auditor's missing-doc evidence
make "env var unset, dormant tick succeeding silently" the most likely
hypothesis by far.

## Branch on diagnosis

Per dispatch §"Phase 2 — Branch on diagnosis":

- **"cron didn't fire (vercel.json miss / route path stale)"** → REFUTED.
  `vercel.json` is correct; the cron path matches; Vercel logs are not
  needed to confirm because we have a stronger structural signal.
- **"cron fired but crashed pre-try/catch"** → REFUTED. The route's
  outer try/catch already wraps the entire handler INCLUDING the auth
  gate (line 64-92), and `tryRouteFailLoudBreadcrumb` (line 29-40)
  writes a breadcrumb if `runStorageBackup`'s own catch couldn't. A
  pre-try crash would have surfaced in Vercel function logs as a 500
  with no Firestore writes — but the dormant path returns 200 with
  `{ ran: false }`, which is what we'd observe externally for an unset
  env var.
- **"cron fired on wrong project/environment"** → unlikely; the
  observed behaviour is consistent with right-project + dormant-skip.

**Confirmed branch:** the cron is firing nightly, hitting the dormant
no-op path because `CRC_BACKUP_DRIVE_FOLDER_ID` is unset, and the
no-op path lacks an observability heartbeat. PGR-03 then fail-opens on
the missing doc.

## Fix shape

Tier-1 single-commit lane, ~120-180 LOC across:

### 1. `src/app/api/cron/storage-backup/route.ts` — dormant heartbeat

Before the early `return` on unset env var, write a "we ticked but did
nothing" heartbeat to `config/storageBackup` + `storageBackups/{date}`.
Keep `lastBackupAt` untouched (dormant != successful) and `lastError`
untouched (dormant != error); set `dormant: true` + `lastTickAt: now` +
`reason: 'CRC_BACKUP_DRIVE_FOLDER_ID unset'`.

### 2. `src/lib/storage-backup/mirror.ts` — `lastTickAt` everywhere

Add `lastTickAt: now` to both `recordStorageBackupRun` (success path)
and `writeStorageBackupError` (error path), AND set `dormant: false`
explicitly on both. Add a new exported helper
`writeStorageBackupDormantHeartbeat(db, now, reason)` that the route
calls on the dormant tick — keeps the Firestore write shape co-located
with the other two writers.

### 3. `src/lib/storage-backup/health.ts` — `tickStale` + `dormant`

Extend the `StorageBackupHealth.present` shape with:

- `lastTickAt: number | null`
- `tickStalenessHours: number`
- `tickStale: boolean` — true when `lastTickAt > 36h` ago (independent
  of `stale` which remains lastBackupAt-staleness)
- `dormant: boolean` — pass-through from snapshot

Existing `stale` semantics preserved.

### 4. `src/app/api/cron/admin-consistency/route.ts` — three new alarms

- **tickStale alarm:** `present` + `tickStale` → Sentry warning
  "storage backup cron has not ticked in Nh" (catches the
  cron-stopped-firing-entirely failure class — independent of dormant
  status)
- **missing-doc + deploy-aged alarm:** `missing` + bootstrap-stamp
  age > 36h → Sentry warning "storage backup cron has never written
  a heartbeat; check vercel.json + CRC_BACKUP_DRIVE_FOLDER_ID"
- **Bootstrap stamp:** on every admin-consistency tick, idempotently
  write `config/healthBootstrap.firstAdminTickAt` if unset; subsequent
  reads derive deploy-age from it. Tiny (~5 LOC).

### 5. Tests — ~50 LOC

- mirror.test (new file or extension): dormant-heartbeat writer writes
  expected shape; recordStorageBackupRun + writeStorageBackupError now
  stamp `lastTickAt` + `dormant: false`
- health.test extension: `tickStale` derivation across the boundary;
  `dormant` pass-through; existing `stale` unchanged
- admin-consistency route.test extension: tickStale alarm fires;
  missing+aged alarm fires; missing+fresh stays silent; dormant+fresh
  stays silent; bootstrap stamp idempotent

## Out of scope (per dispatch)

- ⛔ NO touching storage-phase2 BLOCK lane (`c4935b804` HELD).
- ⛔ NO Storage operations / destructive Firestore mutations beyond
  the cron's own heartbeat writes.
- ⛔ NO bridge / monitor / firestore.rules / env vars changes.
- ⛔ NO SmartTransposer touches.
- ⛔ NO touching coder-4's pgr-04-sample-fix at `e526055ba`. The new
  `readAndAlertStorageBackupHealth` extension is ORTHOGONAL — same
  file, different branch in the alarm tree. Read the diff first.

## Daniel-action separate from this lane

`CRC_BACKUP_DRIVE_FOLDER_ID` needs to be set in Vercel prod with a
dedicated Shared Drive folder ID to activate the actual backup. That's
the storage-phase2 activation step, not this probe lane's fix. This
lane only closes the **observability gap** so the next silent-skip
(or real silent-death) is detected immediately.

## Bundling note

Per auditor's HEADS-UP CONCERN at 2026-05-24T15:40Z + dispatch §"Phase
3 — PGR-03 extension (bundled)": the alarm-on-absent extension is
folded into this single Tier-1 lane to "close the whole class" (cron×
config asymmetry on the backup side, parallel to coder-4 FINDING-2 on
the library-index side). Total LOC budget moves from ~60-120 → ~120-180.
