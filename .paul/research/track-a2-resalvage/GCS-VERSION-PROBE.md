# GCS Object Versioning probe — Track A2 re-salvage prereq

**Lane:** gcs-version-probe-track-a2 (one-commit lane, branch `feat/gcs-version-probe-track-a2` off `e9442cae1`)
**Author:** coder-2
**Probe time:** 2026-05-23T21:12:26.907Z
**Posture:** Tier-0 READ-ONLY (no writes; no actual restore; per-fileId metadata listing + restore-command shape only)
**Bucket:** `crcmusiccharts.firebasestorage.app` (US-CENTRAL1, `versioning.enabled=true` confirmed live)
**SA used:** `firebase-adminsdk-fbsvc@crcmusiccharts.iam.gserviceaccount.com` (from `sheet-music-app-mcp/.env.local` → `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY`). No fallback needed — Path A worked on first try.
**Reproducer:** `scripts/probe-gcs-versions.mjs` (committed alongside) — re-run any time with the same env to widen the probe to other fileIds.
**Raw output:** `gcs-version-probe-output.json` (committed alongside) — full JSON dump.

---

## Verdict — **RESTORE PATH IS LIVE FOR ALL 4 ROWS**

All 4 vanished bare-UUID Storage objects have **exactly 1 prior generation** intact in GCS Object Versioning, all created during Daniel's 2026-05-20 healChartBytes salvage, all deleted today at ~14:04Z (the cron's first post-versioning-enable sweep — see "Bleed window" below), all sizes + MD5 hashes preserved, all well within the 30-day versioning TTL.

**A2 disposition:** **restore from versioning, not re-ingest.** Re-ingest from `C:\Users\dsbog\OneDrive\Desktop\INDIVIDUAL PDFs\` is NOT required and would be lossier (page-1 strip on subset).

---

## Per-fileId table

| # | fileId | Title | Has prior version? | size (bytes) | md5Hash | timeCreated (salvage) | timeDeleted (bleed) | generation | Within 30d TTL? | Restore verdict |
|---|--------|-------|--------------------|--------------|---------|-----------------------|---------------------|------------|------------------|-----------------|
| 1 | `6ca6e82c-e3be-4e6b-b6c1-63f60b3ac5cc` | Eili Eili (Zahavi) | ✅ Yes (1) | 818,041 | `4WT6mkd0Y61OqXuctz40tg==` | 2026-05-20T19:38:53.363Z | 2026-05-23T14:04:14.468Z | `1779305933358550` | ✅ ~7h ago | RESTORE |
| 2 | `ae83649a-718d-4fc4-ace8-82a9f6c2a400` | Shiru Ladonai (Neimark-Gumer) | ✅ Yes (1) | 325,620 | `Y8M1RgChEG2KrywoumFUHA==` | 2026-05-20T19:41:59.506Z | 2026-05-23T14:04:24.619Z | `1779306119500106` | ✅ ~7h ago | RESTORE |
| 3 | `72a7aa6a-7b08-4c78-862c-197bbffb9515` | Adon Olam (Folk) | ✅ Yes (1) | 388,911 | `RX2D+DZ2tJNg77/q6jAUiw==` | 2026-05-20T19:45:47.682Z | 2026-05-23T14:04:15.839Z | `1779306347679435` | ✅ ~7h ago | RESTORE |
| 4 | `c9efe661-9eb8-42fc-89d5-13f026629dc7` | Adon Olam (Hitman-Ben-Hur)/medley | ✅ Yes (1) | 1,114,724 | `9/rqiWbGwYlu8nVciHQ5gA==` | 2026-05-20T19:45:50.224Z | 2026-05-23T14:04:29.240Z | `1779306350220997` | ✅ ~7h ago | RESTORE |

**All `contentType: application/pdf`. All `crc32c` recorded** (Eili Eili `EauZLQ==`, Shiru Ladonai `rGgKVA==`, Adon Olam Folk `2TPItw==`, Adon Olam HBH `iWmy4Q==`) — enables tamper-free copy verification.

---

## Bleed window analysis

The **`timeDeleted` clusters tightly at 2026-05-23T14:04:14-29.240Z** (a single 15-second window). That matches **one cron tick of `/api/cron/sync`** firing the sweep-delete on all 4 rows in sequence.

This is **earlier than coder-3's track-a1 audit reported** (their `sync_runs.deletedFiles[]` evidence was for the 18:00Z / 19:00Z / 20:00Z tick logs — those were subsequent ticks that re-recorded the fileIds in `sync_runs` even though the underlying Storage objects were already gone). The 14:04Z tick is the **actual delete event**; subsequent ticks just re-listed the now-absent rows.

**Consequence for restore correctness:** after restore, the active cron schedule was just disarmed at `e9442cae1` (legacy `/api/cron/sync` removed from `vercel.json`). Re-salvaged bytes will not be re-deleted while the new Storage-canonical `/api/cron/drive-sync` is the only active sweeper (which has the atomic-guard and DOES NOT delete salvaged bytes). Restore + disarm = stable end state for Kabbalat Shabbat tomorrow.

---

## Restoration command shape

GCS provides three restore paths from a non-current generation. **All three preserve `md5Hash` + `crc32c`** automatically (server-side copy, no byte transfer through the client).

### Option 1 — gsutil (NOT available on Daniel's machine per `[[project_backup_floors]]`)

```sh
gsutil cp \
  "gs://crcmusiccharts.firebasestorage.app/library/<fileId>.pdf#<generation>" \
  "gs://crcmusiccharts.firebasestorage.app/library/<fileId>.pdf"
```

### Option 2 — REST `rewriteTo` / `copyTo` (the canonical programmatic path)

> Source: [Google Cloud Storage JSON API — Objects: rewrite / Objects: copy](https://cloud.google.com/storage/docs/json_api/v1/objects/rewrite) — `sourceGeneration` query param selects the non-current generation.

```http
POST https://storage.googleapis.com/storage/v1/b/crcmusiccharts.firebasestorage.app/o/library%2F<fileId>.pdf/rewriteTo/b/crcmusiccharts.firebasestorage.app/o/library%2F<fileId>.pdf?sourceGeneration=<generation>
Authorization: Bearer <token>
Content-Type: application/json

{}
```

Effect: makes the non-current `<generation>` the new live generation; the prior live (which was deleted at 14:04Z) becomes another non-current; the restored bytes are the live ones again. **Idempotent** if you re-run with the same generation.

### Option 3 — `@google-cloud/storage` (Daniel-friendly node script; reuses the same SA + auth path as this probe)

```js
import { Storage } from '@google-cloud/storage';
const storage = new Storage({ projectId: 'crcmusiccharts', credentials: { client_email, private_key } });
const bucket = storage.bucket('crcmusiccharts.firebasestorage.app');

// Restore one fileId:
const objectName = `library/${fileId}.pdf`;
await bucket
  .file(objectName, { generation: <generation> })   // SOURCE generation
  .copy(bucket.file(objectName));                    // DEST = current live
```

`File.copy()` defaults `sourceGeneration` to the file's `generation` and writes the dest as a new live generation. The current live (which is the tombstone / absent) is replaced by a fresh live copy of the prior bytes.

### Recommended for A2 execution

**Option 3** — Daniel can adapt the `probe-gcs-versions.mjs` script in this lane into a `restore-gcs-versions.mjs` sibling that takes the 4 generations from the JSON output and fires the 4 copies in one run. Idempotent + verifiable + uses creds we already verified work.

---

## Verification checklist post-restore (for A2)

After firing the 4 restores, A2 should verify:

1. **`bucket.file(name).exists()` returns `[true]`** for each of the 4 objects (currently `[false]`).
2. **`bucket.file(name).getMetadata()` md5Hash matches** the prior generation's md5Hash listed in this report (byte-identical restore).
3. **`get_chart_status` MCP tool** for each row returns `chartHealth.status: 'ok'` (or whatever the healthy status is — `[[project_chart_loss_reports_are_display_bugs]]` recalls that the bytes-vs-display distinction matters; A2 should confirm Daniel's iPad fetch resolves the chart, not just that GCS has bytes).
4. **`verify_setlist_charts` on tomorrow's KS + Yizkor setlists** returns all-green for these 4 fileIds.
5. **A second `bucket.getFiles({ versions:true })` probe** (re-run this lane's script) — expect each object to now show 2 versions: the restored live generation + the prior non-current (the tombstone that was created when restore overwrote it briefly… wait, no — restore promotes the non-current to live without creating a new tombstone, so still 2 versions: the new live `~timeCreated 21:??Z`, and the original non-current `timeCreated 19:38-45Z, timeDeleted 14:04Z`).

---

## Out-of-scope honored

- **No writes.** Probe is strictly `getFiles({ versions:true })` + `getMetadata()`.
- **No probe of other fileIds.** Only the 4 from the dispatch. Wider blast-radius sweep is coder-3 / A2 scope.
- **No `dedupe_library` / `reconcile_library` / `runStorageBackup` invocations.**
- **No app-surface changes.** Only `.paul/research/` + a one-off `scripts/probe-gcs-versions.mjs` reproducer.

---

## Risks / caveats

1. **Cross-project storage permissions** — the `music-app-reader@crcmusicbooks` SA was the lane prompt's primary recommendation, but `firebase-adminsdk-fbsvc@crcmusiccharts` worked first try with full `storage.objects.list` + `storage.objects.get` versioning visibility on the chart bucket. The music-app-reader cred would likely also work for read; not tested since the firebase-admin path succeeded. **Restore (Option 3) will need the firebase-admin SA's `storage.objects.create` / `storage.objects.delete`** — both should be granted by default to the project's Firebase Admin SDK SA, but A2 should confirm or use a bucket-admin SA explicitly.

2. **One-generation-per-object cap in this snapshot** is consistent with: Object Versioning was only enabled 2026-05-22 (per `[[project_backup_floors]]`), and the 2026-05-23 14:04Z cron deletion was the **first** post-enable delete to retain a generation. Any prior cron deletions of these objects (Daniel's healChartBytes wrote them fresh on 2026-05-20 onto paths previously created by the legacy 2026-03-15 sync; any 2026-05-20→2026-05-22 cron sweeps deleted bytes BEFORE versioning was enabled) **did not leave generations behind and are unrecoverable from versioning**. Not material for this restore — Daniel's salvaged 2026-05-20 bytes ARE what we want to restore.

3. **`timeDeleted` of 14:04Z** is the actual delete event; the cron's claimed deletes at 18:00Z / 19:00Z / 20:00Z (per coder-3's `sync_runs` evidence) are **post-tombstone re-listings** that did not change the version state. Subsequent runs of the now-disarmed cron WILL NOT touch the restored bytes (cron is OFF at `e9442cae1`).

4. **Versioning TTL ≠ retention policy** — GCS Object Versioning has no auto-expiry on its own; the lifecycle rule on the bucket controls when non-current versions get hard-deleted. Worth confirming the lifecycle rule (`30d` per `[[project_backup_floors]]` if set) so Daniel knows the deadline. **Not verified in this probe** (`bucket.getMetadata()` returned versioning enabled but I did not pull the lifecycle config); A2 or a follow-up cheap MCP probe should pull the bucket's lifecycle rules before any operational reliance on the 30-day floor.

---

## Files in this commit

- `.paul/research/track-a2-resalvage/GCS-VERSION-PROBE.md` — this report.
- `.paul/research/track-a2-resalvage/gcs-version-probe-output.json` — raw JSON dump from the probe (the load-bearing evidence — every claim in this report derives from this file).
- `scripts/probe-gcs-versions.mjs` — reproducer (~120 LOC, READ-ONLY, narrow scope, safe to re-run for additional fileIds by editing the `FILE_IDS` array).

No `src/`, no `bridge/`, no app-surface change.
