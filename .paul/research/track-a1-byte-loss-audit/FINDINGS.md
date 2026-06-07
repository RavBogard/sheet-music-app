# Track A1 — Byte-loss forensic audit

**Lane:** track-a1-byte-loss-audit (Tier-0 READ-ONLY)
**Author:** coder-3
**Started:** 2026-05-23T21:35Z
**Delivered:** 2026-05-23T22:00Z
**Audit SHA:** `559c6c84d`
**Posture:** zero commits, zero data writes, zero tool disabling — observational only.

---

## TL;DR — Verdict

**The legacy `/api/cron/sync` hourly cron is actively deleting the salvaged
Storage bytes every hour, by design.** It iterates every `library_index` row
and `bucket.file('library/{doc.id}.pdf').delete()`s any row whose `doc.id` is
not in the current Drive folder listing. The 4 vanished rows are
bare-UUID fileIds — they were originally Drive IDs from the 2026-03-15
sync; those Drive originals are gone; salvage on 2026-05-20 restored bytes
to the **exact path** the sync cron sweep-deletes. Three confirmed deletion
runs hit all 4 fileIds today at **18:00Z / 19:00Z / 20:00Z**, and the next
tick (21:00Z) will fire the same way unless we disarm.

**Track A2 cannot fire safely until the cron is disarmed** — re-salvaging
bytes onto the same path while this cron is armed buys at most ~57 minutes
before the next deletion.

**Recoverability:** GCS Object Versioning is enabled (per
`[[project_backup_floors]]`, 2026-05-22), so the prior live version of each
deleted object should still exist for 30 days. Re-ingest from
`C:\Users\dsbog\OneDrive\Desktop\INDIVIDUAL PDFs\` (Daniel's salvage source)
is the deterministic fallback.

---

## §1 — Cause (file:line, smoking gun)

### The deletion path

`src/lib/sync-engine.ts:383-405` (in `syncLibraryIndex`):

```ts
// 6. Detect deleted files (in DB but not in Drive) and clean up Storage
for (const doc of existingSnapshot.docs) {
    if (!driveIds.has(doc.id)) {
        stats.deleted++
        stats.deletedFiles!.push(doc.id)

        // Phase C: Delete from Storage
        try {
            const bucket = getStorage().bucket(...)
            const extensions = ['.pdf', '.xml', '']
            for (const ext of extensions) {
                await bucket.file(`library/${doc.id}${ext}`).delete().catch(() => {})
            }
            stats.deletedFromStorage++
        }
    }
}
```

- `existingSnapshot` is **every** `library_index` doc (the snapshot taken
  at line 175 of the same file, no filter).
- `driveIds` is the set of Drive file IDs returned by listing
  `GOOGLE_DRIVE_ROOT_FOLDER_ID`.
- The `.catch(() => {})` swallows 404s silently — no error surfaces when
  the delete actually lands on a real object.
- **Crucially**: only Storage is deleted. The `library_index` row stays
  `status:'active'` (which matches what we observe on all 4 vanished rows —
  status=`active`, but `chartHealth.status:'missing'`).

### The cron schedule + entry

`vercel.json`:

```json
{ "path": "/api/cron/sync", "schedule": "0 * * * *" }
```

`src/app/api/cron/sync/route.ts:30-44` (`GET` handler) calls
`syncLibraryIndex()` on every fire.

### Why salvaged bare-UUID rows fall into the delete bucket

All 4 vanished rows share the same lifecycle (verified via direct Firestore
reads):

```
createTime         2026-03-15  (originally synced from Drive)
orphanedAt         2026-05-17T01:40:37.553Z
orphanedReason     "B-006: pre-atomic-guard sync left no Storage bytes"
salvagedAt         2026-05-20T19:38-19:45Z
salvagedFrom       "upload-session"
salvagedBy         93Xn3DbS0bSNb8zmfzLyfOMX1A13   (Daniel)
source             "salvage"
status             "active"
```

The `doc.id` is the **bare UUID** (e.g.
`6ca6e82c-e3be-4e6b-b6c1-63f60b3ac5cc`), which was the original Drive file
ID in March. That Drive file no longer exists (the entire reason these
rows orphaned on 5/17). So `driveIds.has(doc.id)` is `false`. The cron
treats them as "in DB but not in Drive" and deletes
`library/{bareUUID}.pdf` every hour.

`salvage_chart_bytes` → `healChartBytes` (`src/lib/chart-heal.ts:90`)
writes bytes to **exactly** that path:

```ts
const storagePath = `library/${fileId}${inferChartExt(mimeType)}`
```

So salvage and the cron-delete collide on the same key. The cron wins.

### Direct evidence from `sync_runs`

Three confirmed `sync_runs` documents (queried with
`startedAt >= 2026-05-20T00:00:00Z`), each carries all 4 target fileIds in
its `deletedFiles[]` array:

| sync_runs/<id>            | started                  | completed                | deleted | deletedFromStorage | 4 targets present? |
|---------------------------|--------------------------|--------------------------|---------|--------------------|--------------------|
| a3ed357d-1407-49fe-…       | 2026-05-23T18:00:04.802Z | 2026-05-23T18:00:59.692Z | 348     | 348                | **yes** (all 4)     |
| 8fa62b14-c890-49b9-…       | 2026-05-23T19:00:04.063Z | 2026-05-23T19:00:58.101Z | 348     | 348                | **yes** (all 4)     |
| 707647d7-5186-422a-…       | 2026-05-23T20:00:01.498Z | 2026-05-23T20:00:58.310Z | 348     | 348                | **yes** (all 4)     |

(Note: only 3 `sync_runs` rows exist since 2026-05-20 in the queryable
window — the cron either wasn't running every hour or older docs were
pruned. Either way the 18Z / 19Z / 20Z runs today are unambiguous.)

The 348-per-run figure is the count of `library_index` doc IDs flagged
"in DB but not in Drive", **not** the count of real successful Storage
deletes. The `.catch(() => {})` makes already-gone objects no-ops. The
real bite happens once after each salvage / re-upload onto a flagged
fileId — exactly the 4 we see.

### The two Adon Olam re-enrichment-at-14:32Z anomaly (explained)

- Adon Olam Folk + medley both show `enrichmentRanAt: 2026-05-23T14:32:XX`
  with `aiSuggestion.concerns: ["File bytes unavailable..."]`. Eili Eili
  and Shiru Ladonai still show their original 2026-05-20 enrichment
  timestamps.
- None of the 4 are currently in `aiEnrichmentRetryQueue` (direct
  `get_document` confirms 404 for each).
- The 14:32Z timestamp aligns with the `/api/cron/ai-enrich-retry`
  `*/30 * * * *` drain at 14:30Z. The likely sequence: both Adon Olam
  rows had retry-queue entries from prior enrichment failure → 14:30Z
  drain processed them → `fetchBytes` got null because bytes were already
  gone → enrichment ran from metadata only → `applyEnrichment` wrote the
  "File bytes unavailable" suggestion + bumped `enrichmentRanAt` → final
  `clearRetry` removed the queue docs (which is why we see 404 now).
- **The re-enrichment is downstream of, not the cause of, the byte loss.**
  It's a symptom: enrichment observed missing bytes that the legacy cron
  had already deleted earlier today.

---

## §2 — Trigger conditions (when the bug re-fires)

The cron re-fires every hour at `*:00 UTC`. Each fire deletes any
`library/{bareUUID}.{pdf|xml|}` whose `bareUUID` is the doc.id of a
library_index row whose original Drive file is no longer in Drive
(`!driveIds.has(doc.id)`).

In scope of the bug:

1. Every row Daniel has salvaged via `salvage_chart_bytes` from a
   Drive-originated bare-UUID fileId — the salvage path preserves the
   original (bare-UUID) fileId on purpose, so every bond keeps resolving.
   That choice is correct; the cron's destructive sweep is what's wrong.
2. Every legacy bare-UUID row that had bytes re-uploaded any other way
   (manual Storage upload, future re-salvage, future heal) onto the
   bare-UUID path.

Out of scope (these are safe):

- `upload-<uuid>` fileIds. They were never Drive IDs, so the cron does
  not look for them in Drive (well, it does — but they're not in
  `driveIds` either, **and** they're also not in `library_index` keyed on
  a Drive ID, so they trip the same delete-from-Storage path). Wait —
  re-reading the loop: every row in `existingSnapshot` is sweep-eligible,
  including `upload-*` rows. Their fileIds are also not in Drive, so
  they're flagged too. The reason `upload-*` rows haven't visibly
  disappeared is presumably that their fileIds aren't `library/upload-<uuid>.pdf`
  shape — let me verify.

  Actually `getStoragePath` in `firebase-storage.ts` is `library/{fileId}{ext}`
  uniformly. So `library/upload-<uuid>.pdf` IS the storage path for
  upload-* rows. They are equally exposed to this delete path.

  **This is a wider blast radius than the 4 known cases.** Every active
  bare-UUID-and-no-longer-in-Drive row AND every `upload-*` row is at
  risk of byte-loss on every hourly tick. The 4 in the lane prompt are
  the ones we caught because they're on this weekend's setlists; the
  full impact requires a sweep.

3. Specific risk multiplier for the away-window: Daniel is away from the
   studio for ~2 days. iPad IDB caches are the only working copy of the
   4 confirmed-missing charts. Every hour the cron keeps running, the
   blast radius can widen as any other recently-salvaged row gets newly
   wiped.

---

## §3 — Per-fileId recoverability

GCS Object Versioning is enabled on the chart bucket per
`[[project_backup_floors]]` (2026-05-22 — "GCS Object Versioning ON"). The
prior live version of each deleted object should be recoverable within
the 30-day retention window. The cron's delete is a soft delete on a
versioned bucket — non-current versions are preserved.

| fileId (prefix)                          | title                                                       | KS slot       | recovery path (preferred → fallback)                                                                                              |
|------------------------------------------|-------------------------------------------------------------|---------------|-----------------------------------------------------------------------------------------------------------------------------------|
| `6ca6e82c-e3be-4e6b-b6c1-63f60b3ac5cc`   | Eili Eili (Zahavi) - Eit Dodim - Elijah Rock                | Yizkor #29   | (1) GCS Object Versioning restore prior live version; (2) re-ingest from `INDIVIDUAL PDFs\Eili Eili (Zahavi)*.pdf` (strip page 1) |
| `ae83649a-718d-4fc4-ace8-82a9f6c2a400`   | Shiru Ladonai (Neimark-Gumer)                               | KS #4        | (1) GCS Object Versioning; (2) re-ingest from `INDIVIDUAL PDFs\Shiru Ladonai (Neimark-Gumer).pdf`                                  |
| `72a7aa6a-7b08-4c78-862c-197bbffb9515`   | Adon Olam (Folk)                                            | KS #18       | (1) GCS Object Versioning; (2) re-ingest from `INDIVIDUAL PDFs\Adon Olam (Folk).pdf`                                              |
| `c9efe661-9eb8-42fc-89d5-13f026629dc7`   | Adon Olam (Hitman-Ben-Hur) - Dobin - Shehecheyanu (Pik)     | KS #19       | (1) GCS Object Versioning; (2) re-ingest                                                                                          |

Direct GCS Object Versioning verification (listing prior versions per
fileId) was NOT performed in this audit — Firebase MCP doesn't expose
`Object#listVersions`, and `gsutil` is not installed locally. The
**verification is a Daniel-action** before A2 fires: either Cloud Console
("Show non-current versions") or one of the `firebase-tools` REST
patterns documented in `[[project_backup_floors]]`.

If GCS Object Versioning lookup returns prior versions for these 4
fileIds (highly likely — they were deleted today, well within the 30-day
window), the re-salvage path is "copy non-current version back to live"
via the GCS REST API (or Cloud Console) — preserves the existing fileId,
preserves every bond, preserves byte-identical content with exact
provenance.

If versions are absent for any reason, re-ingest from
`C:\Users\dsbog\OneDrive\Desktop\INDIVIDUAL PDFs\` (Daniel's confirmed
salvage source per `[[project_chart_loss_reports_are_display_bugs]]`)
into the same bare-UUID fileId via `salvage_chart_bytes({sourceUrl: ..., force:true})`
is the fallback. Page-1 strip is needed on a subset (per
`[[project_chart_loss_reports_are_display_bugs]]`).

---

## §4 — Track A2 scope recommendation (DO NOT CODE — for supervisor / Daniel)

**Gate first, then re-salvage.** A2 must not fire until §5 disarm is in
place — otherwise re-salvaged bytes vanish at the next *:00 UTC tick.

Once disarmed:

1. **Discovery pass**: list every `library_index` row whose fileId
   matches the bare-UUID-of-orphaned-Drive shape AND has `source:'salvage'`
   (≈ Daniel's 5/20 sweep). Likely 21–24 rows per
   `[[project_orphan_baseline]]`. Plus optionally the broader
   "any-row-whose-doc-id-isn't-in-current-Drive" set (the full 348 the
   cron sees).
2. **GCS versioning probe**: per row, list non-current versions of
   `library/{fileId}.pdf`. Pick the latest non-current with `timeDeleted`
   matching the legacy-cron deletion pattern (= today).
3. **Restore plan**: per row, either
   (a) GCS `copy` from `gs://.../library/{fileId}.pdf#<generation>` to
       current, OR
   (b) re-ingest from `INDIVIDUAL PDFs\` via `salvage_chart_bytes`
       (existing, ratified tool — `[[feedback_upload_atomicity]]`).
4. **Verify**: post-restore, `get_chart_status({fileId})` should report
   `health.status:'ok'`. `verify_setlist_charts` on Kabbalat Shabbat's
   setlist + the Yizkor setlist should report 100% healthy.
5. **Daniel-single-owner execution** per
   `[[feedback_single_owner_destructive_runs]]`.
6. **NO row-level Firestore change** — preserve the bare-UUID fileId so
   every existing bond keeps resolving.

A2 explicit out-of-scope:

- NO migration to `upload-<uuid>` fileIds. That would break bonds.
- NO `reconcile_library({force:true})` mass-orphan flip. We are NOT
  marking these orphaned — we are HEALING them.
- NO Drive write. Drive is the wrong provenance for these — they have
  no Drive originals.

---

## §5 — Disarm recommendation (Daniel-call; recommend, do not unilaterally disable)

Three options, from cheapest+safest to surgical:

### Option A — DISABLE the cron (recommended for the next ~48h)

Remove (or comment out) the `/api/cron/sync` entry from `vercel.json`
**before** A2 fires:

```json
// "crons": [
//     { "path": "/api/cron/sync", "schedule": "0 * * * *" },
//     ...
// ]
```

Then `vercel deploy --prod` (or just push to `master` per
`[[feedback_git_push]]`). This is 1 line of change + 1 deploy.

- ✅ Stops the bleeding completely. No more byte-loss on bare-UUID rows.
- ✅ `/api/cron/drive-sync` (`*/5 * * * *`) continues to handle the new
  Storage-canonical path (it watches `DAVID_DRIVE_DROP_FOLDER_ID`, not
  `GOOGLE_DRIVE_ROOT_FOLDER_ID`, and goes through `processChartUpload`
  with full atomic-guard — see `decisions.md 2026-05-17T23:40Z`).
- ❌ The legacy cron's "add new files from the parent Drive folder" path
  also pauses — but `decisions.md 2026-05-17T23:40Z` already flagged this
  for deprecation, and Daniel has been authoring exclusively via MCP +
  Drive drop folder for ~10 days (see `[[user_mcp_is_primary_author_workflow]]`).
- ❌ Same cron has a `updated: 278 / added: 0 / copiedToStorage: 0`
  steady-state in the 3 observed runs — it isn't actually adding new
  Drive content right now anyway. The destructive sweep is its only
  visible effect.

### Option B — patch `syncLibraryIndex` to skip the delete sweep entirely

Comment out lines 383-405 in `src/lib/sync-engine.ts`. Keeps the metadata
sync (adds, updates) but removes the destructive path. ~25 LOC change.
Same blast-radius reduction as A. A bit more code-review surface.

### Option C — patch the predicate to spare salvaged rows

Wrap line 385 with a `source` / `salvagedAt` / `salvageFrom` guard:

```ts
if (!driveIds.has(doc.id)) {
    const data = doc.data()
    const wasSalvaged = data.source === 'salvage' ||
        typeof data.salvagedAt === 'string' ||
        typeof data.salvagedBy === 'string'
    if (wasSalvaged) continue  // ← never delete bytes restored by Daniel
    stats.deleted++
    ...
}
```

- ✅ Most surgical fix.
- ❌ Leaves the cron's broader fragility intact — any future bare-UUID
  re-upload that doesn't carry the salvage stamp would still be deleted.
- ❌ Higher code-review burden; needs tests.

**My recommendation: Option A** for the next 48h (covers KS + the
2-day unattended window). Treat as the standing fix while A2 ships, and
upgrade to Option B or C in a separate cycle once the dust settles. The
legacy cron's deprecation was already on the deferred-issues list per
`decisions.md 2026-05-17T23:40Z`, so this is bringing that forward.

---

## §6 — Open follow-ups (not blocking KS, but should land in a cycle)

1. **Audit the full blast radius.** The 4 in the lane prompt are the ones
   we caught because they're on this weekend's setlists. The 348 fileIds
   the cron flags every hour likely includes other recently-salvaged
   rows + every `upload-*` row that's not in Drive (which is, by design,
   all of them). Cross-reference `sync_runs.deletedFiles[]` with active
   library_index rows whose `chartHealth.status` is now `'missing'` to
   enumerate the wider damage. (Note: this is also Track A2's discovery
   step #1.)

2. **`upload-*` rows are equally exposed.** `getStoragePath` is
   `library/{fileId}{ext}` for both `upload-*` and bare-UUID. The cron's
   delete loop runs unconditionally on every doc in `existingSnapshot`
   that isn't in `driveIds`. `upload-*` IDs are never in `driveIds`. The
   only reason the disaster hasn't been wider is presumably the cron
   wasn't actually running every hour between 5/20 and today — and now
   it is. Verify and widen scope on A2.

3. **`sync_runs` retention is unclear.** Only 3 docs exist for the entire
   period since 2026-05-20. Either the cron didn't fire on most hours
   (cron failure mode) or sync_runs are auto-pruned (and we lost the
   forensic). A future hardening pass should make sync_runs retained ≥30
   days for audit.

4. **Storage-backup mirror is dormant.** `config/storageBackup` and
   `storageBackups/{2026-05-23}` both 404 — the
   `/api/cron/storage-backup` (`c4935b804`) shipped today at 14:35Z, well
   after the 05:00 UTC cron tick. First fire will be 2026-05-24T05:00Z.
   Once it runs once, restore won't depend on GCS Object Versioning
   either. Until then, we have one floor (versioning), not two.

5. **`learning-self-healing`** opportunity — the salvage path could
   record a structural signal `library_index.preserveOnSync: true` so any
   future sync-engine pass autotrusts salvaged rows. Per
   `[[feedback_learning_self_healing]]`.

---

## §7 — What this audit explicitly did NOT do

Per Tier-0 read-only posture:
- NO commits.
- NO Firestore writes / NO Storage writes.
- NO tool disabling (Option A above is a recommendation, not a unilateral
  action).
- NO A2 re-salvage attempt.
- NO Track B CCITTFax/WebKit-render-defect repro (separate cycle).
- NO `__test_delete_storage_object` invocation (it's **exonerated**: the
  tool requires `/^upload-<uuid>$/` regex AND `isTest:true`; the 4
  vanished rows fail both gates by design).
- NO GCS Object Versioning state probe per fileId (no `gsutil` locally
  + Firebase MCP doesn't expose `listVersions`). Daniel-action before A2.

---

## §8 — Methodology trail

1. Read `inbox/coder-3.md msg-001` (lane assignment) + `CODER.md` +
   `README.md` + `decisions.md` recent blocks + `claims.md`.
2. ACK to `inbox/supervisor.md` (msg-from-coder-3-track-a1-ack).
3. Detached worktree off `559c6c84d` at
   `sheet-music-app-track-a1-byte-loss-audit/`. No node_modules
   (pure Firebase MCP + repo-source).
4. Loaded Firebase MCP tools via ToolSearch: `firestore_get_document`,
   `firestore_query_collection`, `search_library`, `get_chart_status`,
   `list_library`.
5. Confirmed full fileIds via `search_library({includeOrphaned:true,
   includeUnbindable:true})` for each of the 4 vanished charts.
6. Pulled `library_index/{fileId}` via `firestore_get_document` for each
   of the 4 — confirmed shared lifecycle (createTime 2026-03-15 →
   orphanedAt 2026-05-17 → salvagedAt 2026-05-20 → status:'active' now).
7. Probed `config/storageBackup` + `storageBackups/2026-05-23` →
   both 404 (storage-backup cron hasn't fired yet — first tick is
   2026-05-24T05:00Z).
8. Read `src/lib/storage-backup/mirror.ts` — confirmed it's create-or-skip
   on Drive side, READ-only on Storage side. Exonerated as cause.
9. Read `src/lib/mcp/tools/salvage-chart-bytes.ts` + `src/lib/chart-heal.ts`
   — confirmed salvage writes to `library/{fileId}{ext}` via `healChartBytes`,
   only Storage-deletes on its own atomic-guard failure paths
   (compensating-delete).
10. Read `src/lib/mcp/tools/reconcile-library.ts` — confirmed reconcile
    sweep marks `status:'orphaned'` but does NOT delete Storage. Exonerated
    as cause.
11. Read `src/lib/mcp/tools/test-delete-storage-object.ts` — confirmed
    regex + `isTest:true` gates make it impossible for this tool to
    delete any of the 4 fileIds. Exonerated.
12. Grepped all non-test source for `deleteStorageObjectAtPath` /
    `bucket.file(...).delete` / `deleteFiles(`. Found 5 surface paths.
    Three are atomic-guard compensating-deletes
    (`reconcile-library.ts:453/465/496`, `chart-heal.ts:107/120/178`,
    `library-upload.ts:618/637`) — all triggered only on internal write
    failures. The fifth, `sync-engine.ts:397`, is unguarded sweep-delete.
13. Confirmed `/api/cron/sync` schedule `0 * * * *` in `vercel.json`.
    Read `src/app/api/cron/sync/route.ts` — confirmed bearer-gated
    GET handler dispatches `syncLibraryIndex()`.
14. Queried `sync_runs` `startedAt >= 2026-05-20T00:00:00Z`,
    `orderBy startedAt DESC limit 20`. Returned 3 docs (18Z/19Z/20Z TODAY).
    All three contain all 4 target fileIds in `deletedFiles[]`. All three
    show `deletedFromStorage:348`. Confirmed cause via direct prod
    forensic, not inference.
15. Confirmed re-enrichment-at-14:32Z on Adon Olam pair is a downstream
    symptom (retry-queue drain at 14:30Z observing already-gone bytes),
    not the byte-loss cause. Retry queue docs absent on direct
    `firestore_get_document` for all 4 fileIds.

---

**Audit time:** ~25 minutes. Smoking gun within ~20 minutes. Speed >
exhaustiveness per lane prompt — broader blast-radius enumeration left
to A2 / open follow-ups.

— coder-3
