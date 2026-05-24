# Storage-backup silent-death — DIAGNOSIS

**Date:** 2026-05-24 (amended 2026-05-24T22:30Z post Vercel-log probe)
**Lane:** `storage-backup-silent-death-probe` (coder-3)
**Base SHA:** `1aea77464` (initial diagnosis shipped at `36ca5bccf`)
**Status:** Phase 1 diagnose — **AMENDED.** First-pass hypothesis was wrong; real root cause identified via Vercel log probe.

## TL;DR (amended)

The storage-backup cron **IS firing nightly** and **IS reaching the real
mirror code** (not the dormant path). On the 2026-05-24T05:00Z tick — the
**only** real-mirror tick to have run since Daniel set
`CRC_BACKUP_DRIVE_FOLDER_ID` in Vercel env ~1d ago — Google Drive's
`/upload/drive/v3/files` endpoint returned **HTTP 400 Bad Request** on
the very first `uploadBinaryFile` call. Mirror's per-row try/catch swallowed
the error, incremented `failed`, and moved to the next row. With gaxios's
3-retries × exponential backoff per row × hundreds of `library_index`
active rows, the function blew past its `maxDuration: 300s` and **Vercel
killed it externally → `recordStorageBackupRun` never executed →
`writeStorageBackupError` never executed → zero Firestore writes per tick
→ PGR-03 fail-opens on the missing-doc → silent.**

The fix from `36ca5bccf` (alarm tree + `lastTickAt` heartbeat) is still
correct defense-in-depth: once a tick survives long enough to write
`config/storageBackup`, the new `tickStale` alarm catches a recurrence
of this exact failure mode. But it does NOT solve the underlying problem
— a real backup needs to fix BOTH the Drive 400 AND the externally-killed-
function silent-death gap. Both are NEW dispatched lane scope, not this
lane's continuation.

## Evidence (amended)

### vercel.json HAS the cron entry (unchanged from v1)

`vercel.json` line 32-38 at `origin/master`:

```json
{ "path": "/api/cron/storage-backup", "schedule": "0 5 * * *" }
```

### Env vars confirmed via `vercel env ls production`

- `CRC_BACKUP_DRIVE_FOLDER_ID` — Encrypted, Production scope, **updated 1d ago**
- `CRON_SECRET` — Encrypted, Production scope, **updated 1d ago**

(My v1 inference from a missing `.env.local` entry in `sheet-music-app-mcp/`
was wrong; Daniel maintains prod-only env vars separately and `.env.local`
parity is not enforced.)

### Real-mirror tick: 2026-05-24T05:00Z — single, killed by `maxDuration`

`vercel logs --environment production --since 7d --no-branch --search "storage-backup" --expand` returned **one log row** over the entire 7-day window:

```
TIME         HOST                                                  LEVEL   STATUS
00:00:12.08  sheet-music-5e1x9ftcr-ravbogards-projects.vercel.app  error   504
GET /api/cron/storage-backup
[Drive] Binary upload error: Error: Bad Request
    at m._request (.next/server/chunks/5230.js:10:2422)
    at async i.requestAsync (.next/server/chunks/5230.js:13:39642)
    at async n (.next/server/chunks/8344.js:8:1923)
    at async j (.next/server/chunks/7947.js:1:883)
    at async k.uploadBinaryFile (.next/server/chunks/7947.js:1:6557)
    at async k (.next/server/app/api/cron/storage-backup/route.js:1:9009)
    ...
  config: {
    url: 'https://www.googleapis.com/upload/drive/v3/files
          ?fields=id%2C%20name%2C%20md5Checksum%2C%20size
          &supportsAllDrives=true
          &uploadType=multipart',
    method: 'POST',
    ...
  },
  response: {
    status: 400,
    statusText: 'Bad Request',
    data: { error: [Object] }   // (the embedded errors[] detail was truncated by gaxios redactor)
  },
  code: 400,
  status: 400,
  [cause]: { message: 'Bad Request', code: 400, status: 'Bad Request', errors: [Object] }
}
```

The single log row is consistent with: pre-env-var-set, the cron hit the
dormant early return at `route.ts:132-144` (returns 200 with no log), so
no error logs surfaced. Once Daniel set the env var ~1d ago, the 05:00Z
tick on 2026-05-24 was the first real-mirror run — and it died.

### Why "no Firestore writes" follows from the 504

The `runStorageBackup` per-row try/catch (`mirror.ts:238-325`) catches each
Drive throw and continues. The audit doc write happens AFTER the for-loop
in `recordStorageBackupRun` (`mirror.ts:417-449`), called from
`runStorageBackupProd` (`mirror.ts:456-477`). When Vercel kills the function
externally at `maxDuration`, no JavaScript runs after the kill — the route's
outer try/catch (`route.ts:64-92`) **never fires** because there's no error
to catch; the runtime is terminated. Hence zero `config/storageBackup` and
zero `storageBackups/{date}` writes for the tick.

The `tryRouteFailLoudBreadcrumb` at `route.ts:29-40` is unreachable for the
same reason — it lives inside the outer try/catch and runs only after a
caught throw.

## Branch on diagnosis (amended)

Per dispatch §"Phase 2 — Branch on diagnosis":

- **"cron didn't fire (vercel.json miss / route path stale)"** → **REFUTED.**
  vercel.json is correct; the cron fired (we have the log).
- **"cron fired but crashed pre-try/catch"** → **REFUTED.** The crash was
  mid-execution, deep in the mirror's per-row loop. The outer try/catch
  works; it just never gets a chance to run when Vercel kills the function
  externally.
- **"cron fired on wrong project/environment"** → **REFUTED.** Log host
  `sheet-music-5e1x9ftcr-ravbogards-projects.vercel.app` is the
  ravbogards-projects/sheet-music-app prod deployment.
- **NEW (not in original dispatch branches):** "cron fired, mirror ran,
  Drive rejected the upload, mirror's per-row swallow-and-continue ate
  every error, function externally killed by maxDuration before audit doc
  write." → **CONFIRMED** by the Vercel log + the gaxios retryConfig
  visible in the error envelope.

## Two-headed real fix (NEW dispatched lane scope, NOT this lane)

### Fix A — Drive 400 root cause (Daniel-action + investigation lane)

The Drive API rejected `POST /upload/drive/v3/files?supportsAllDrives=true&uploadType=multipart` with HTTP 400. Possibilities:

1. **Shared Drive `0AGFG2GQLuWKKUk9PVA` setup:** the service account
   (`FIREBASE_CLIENT_EMAIL`) may lack `writer` access on the Shared Drive,
   or the Shared Drive may not have "Members outside your organization"
   enabled. Daniel verify in the Shared Drive's Members panel.
2. **Folder-id semantics:** `0AGFG2GQLuWKKUk9PVA` is a Shared-Drive root ID
   (starts with `0A`). The mirror calls `ensureFolder({ name: 'charts', parentId: backupFolderId })`
   first — this creates a folder inside the Shared Drive ROOT. If the
   service account has only `commenter`/`reader` permissions (not `writer`),
   the ensureFolder succeeds OR fails with 403; the subsequent
   `uploadBinaryFile` into that folder could 400 if the API requires
   `driveId` explicitly for Shared Drive uploads.
3. **Multipart body shape:** `google-api-nodejs-client/8.0.1` is current,
   but a regression in the multipart serializer is possible. Compare
   request shape against a known-working `uploadBinaryFile` call in the
   non-backup paths (e.g. drive-sync writer).
4. **Quota / billing:** the Shared Drive might be over quota; Drive returns
   400 for quota exhaustion on some paths.

The redacted `errors: [Object]` in the error envelope holds the real Drive
message. A manual curl with `CRON_SECRET` against the prod endpoint OR
a one-off script that exercises `uploadBinaryFile` against
`0AGFG2GQLuWKKUk9PVA` will surface it.

### Fix B — Externally-killed silent-death observability gap (CODE LANE)

Independent of Fix A's outcome, the route has a real bug: **when Vercel
externally kills the function at `maxDuration: 300s`, no breadcrumb is
written.** The existing fail-loud catches only fire on caught throws, not
on hard-kill. To close the gap:

- **Pre-write a "run started" breadcrumb at the TOP of `runAndRespond`
  before the for-loop starts.** Single Firestore write to
  `config/storageBackup.lastTickStartedAt = now` + `storageBackups/{date}.startedAt = now`.
  If the function is later killed, the breadcrumb survives as the last
  evidence — "we started at X, never reported done."
- **Per-row time-budget guard:** check `Date.now() - startedAt > budgetMs`
  every N rows; if approaching `maxDuration`, bail the for-loop early and
  call `recordStorageBackupRun` with `partial: true` + `bailedAt: now`.
  Avoids ever hitting the external kill in the first place.
- **PGR-03 derived alarm:** `lastTickStartedAt` exists but no matching
  `lastBackupAt` / `lastError` within 36h → "cron started but never
  finished" alarm (different from `tickStale` which only fires when
  `lastTickAt` itself is stale).

This is a NEW dispatched lane (~80-150 LOC: ~30 LOC route start-stamp +
~40 LOC time-budget guard + ~20 LOC PGR-03 alarm + ~50 LOC tests). Should
be dispatched only AFTER Fix A is resolved (otherwise the per-row time
budget hides the Drive 400 instead of surfacing it).

## What `36ca5bccf` actually delivered (revised honest assessment)

- ✅ **Right code, wrong root-cause attribution in the doc.** The alarm
  tree (`tickStale` + missing-doc + deploy-aged) + `lastTickAt` stamps +
  bootstrap-stamp oracle are correct defensive observability and would
  catch a *future* failure of the actual class diagnosed above. Auditor's
  code-shape ACCEPT stands.
- ✅ **The dormant-heartbeat write is HARMLESS in current prod** — env
  var is set, so the dormant path doesn't fire. The helper exists as
  defense-in-depth for any future scenario where the env var gets unset.
- ❌ **Does NOT solve the actual prod failure.** A real backup tick still
  needs Fix A (Drive 400) + Fix B (externally-killed silent-death) to
  start succeeding.
- ❌ **`config/healthBootstrap.firstAdminTickAt` deploy-age oracle is now
  irrelevant for the missing-doc-aged alarm in this specific scenario** —
  the doc will populate within 24h of next deploy via the dormant path
  if env var ever gets unset, or via the start-stamp from Fix B if env
  var stays set. The deploy-age oracle is still useful defense-in-depth.

## Daniel-action checklist (updated)

1. ~~Set `CRC_BACKUP_DRIVE_FOLDER_ID` in Vercel prod~~ — ✅ already done
2. **NEW:** Verify the service account (`FIREBASE_CLIENT_EMAIL`) is added
   as a `Content manager` or `Manager` of the Shared Drive
   `0AGFG2GQLuWKKUk9PVA`. Drive 400 on `uploadBinaryFile` is most commonly
   a Shared-Drive-permissions issue. (If the service account isn't a
   Member, Drive returns 404 or 403 instead — 400 suggests the SA IS a
   member, but maybe with insufficient role.)
3. **NEW:** Once Daniel confirms (2), trigger a manual fire to surface the
   redacted Drive error body:
   `curl -H "Authorization: Bearer $CRON_SECRET" -i https://www.centralreform.live/api/cron/storage-backup?max=1`
   (`max=1` keeps it to a single row so the redacted Drive errors[] body
   shows in the response without timeout pollution.)

## Out of scope (per dispatch — unchanged)

- ⛔ NO touching storage-phase2 BLOCK lane (`c4935b804` HELD; classification
  amended to "UNKNOWN-CAUSE silent-death" per auditor → now amended to
  "Drive 400 + externally-killed-function silent-death" per this probe).
- ⛔ NO Storage operations / destructive Firestore mutations beyond the
  cron's own writes.
- ⛔ NO bridge / monitor / firestore.rules / env vars changes.
- ⛔ NO SmartTransposer touches.

## Audit-trail notes

- **v1 of this doc** (shipped in `36ca5bccf`): claimed root cause was
  `CRC_BACKUP_DRIVE_FOLDER_ID` unset → dormant-skip → no heartbeat. Wrong.
  Caught at 2026-05-24T21:10Z when Daniel corrected me that the env var
  IS set with value `0AGFG2GQLuWKKUk9PVA`.
- **HEADS-UP** sent to `inbox/supervisor.md` + `inbox/auditor.md` at
  2026-05-24T21:15Z recalling the v1 diagnosis.
- **Auditor ACK** at 2026-05-24T22:00Z: code-shape ACCEPT on `36ca5bccf`
  STANDS; DIAGNOSIS.md amendment is mine to push directly.
- **Supervisor ratification** at 2026-05-24T22:05Z: push amendment
  directly to master; if Fix B's src/ shape proceeds, that's a NEW
  dispatched lane (HEADS-UP with shape + LOC).
- **This amendment** committed 2026-05-24T22:30Z after Vercel log probe
  surfaced the Drive 400 + maxDuration kill mechanism.
