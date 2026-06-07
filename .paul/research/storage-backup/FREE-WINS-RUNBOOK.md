# Storage backup — FREE-WINS runbook (Daniel-run, console/env only)

**Purpose:** the immediate, near-zero-risk safety nets from `STORAGE-BACKUP-SYNTHESIS.md`. **No app code changes.** These close the worst of the gap (we currently have *zero* backups) while the full Drive byte-mirror build is queued for post-launch.

**Verified facts this runbook relies on (origin/master + Firebase MCP, 2026-05-22):**
- Chart bucket: `gs://crcmusiccharts.firebasestorage.app` · Project: `crcmusiccharts`
- `/api/cron/backup` exists (vercel.json cron `0 3 * * *`) but is **DEAD** — `config/backup.lastBackupAt = 2026-02-24`, `logical` mode, `BACKUP_BUCKET` unset, `backups/{date}` audit empty.
- Prod host: `https://www.centralreform.live`

**Safety note:** CW-1 + CW-3-diagnosis are read-safe/additive and fine to run **anytime, including now** — they don't touch the running app and protect immediately. CW-2 needs a Vercel **redeploy** (env change) — fine any calm moment; if you'd rather not redeploy mid-service-weekend, do CW-1 + CW-3 now and CW-2 after Shabbat.

---

## CW-1 — Enable GCS Object Versioning + soft-delete (the floor; highest bang/buck)

Turns "overwrite or delete = permanent loss" into "restore the prior generation." One command.

Prereq: `gcloud` authed (`gcloud auth login`) — or run these in **GCP Cloud Shell** (already authed). Then:

```bash
gcloud config set project crcmusiccharts

# 1. See current state first (proof of before)
gcloud storage buckets describe gs://crcmusiccharts.firebasestorage.app \
  --format="yaml(versioning, soft_delete_policy)"

# 2. Enable Object Versioning (keeps overwritten/deleted generations)
gcloud storage buckets update gs://crcmusiccharts.firebasestorage.app --versioning

# 3. (optional) extend soft-delete retention from the 7-day default to 30 days
gcloud storage buckets update gs://crcmusiccharts.firebasestorage.app --soft-delete-duration=30d

# 4. Verify (proof of after) — expect versioning.enabled: true
gcloud storage buckets describe gs://crcmusiccharts.firebasestorage.app \
  --format="yaml(versioning, soft_delete_policy)"
```

**Optional cost cap** (versioning keeps every old generation forever otherwise). Save as `lifecycle.json`:
```json
{ "rule": [
  { "action": {"type": "Delete"},
    "condition": {"daysSinceNoncurrentTime": 90, "numNewerVersions": 3} }
] }
```
then `gcloud storage buckets update gs://crcmusiccharts.firebasestorage.app --lifecycle-file=lifecycle.json`
(keeps the 3 newest old versions + anything ≤90 days; our whole library is <1 GB so cost is negligible regardless).

✅ **Done when:** step-4 describe shows `versioning: enabled: true`. From that moment, any accidental overwrite/delete of a chart is recoverable.

---

## CW-3 — Diagnose why `/api/cron/backup` died 2026-02-24

The route returns **401 and never backs up** if `CRON_SECRET` is unset (`backup/route.ts`: `if (!cronSecret || ...) 401`). Vercel cron auto-sends `Authorization: Bearer $CRON_SECRET` **only if `CRON_SECRET` is set in env.** That's the prime suspect.

1. **Vercel → Project → Settings → Environment Variables:** is **`CRON_SECRET`** present for **Production**?
   - **Missing → that's the cause.** Add it (any long random string, e.g. `openssl rand -hex 32`), Production scope.
2. **Vercel → Project → Settings → Cron Jobs:** confirm `/api/cron/backup` is listed at `0 3 * * *` with a recent run + status. (Crons need the vercel.json cron on a Production deploy; confirm the plan supports crons.)
3. **Vercel → Logs** (filter `/api/cron/backup`): look for `401` or thrown errors at ~03:00 UTC.
4. **Manual confirm the route works** (after CRON_SECRET is set — use the real value):
   ```bash
   curl -i -H "Authorization: Bearer <CRON_SECRET>" https://www.centralreform.live/api/cron/backup
   ```
   - `200 {"success":true,"type":"logical",...}` → route + auth now work; it's just bytes-blind until CW-2.
   - `401` → secret mismatch (env value ≠ what you passed).
5. **Confirm it recorded:** `config/backup.lastBackupAt` should advance to now and a `backups/<today>` doc should appear (check via Firebase console or ask me to read it via MCP).

⚠️ **The staleness ALARM** (auto-detect a future silent death) is **code** → it's Phase 1 of the build (post-launch), not a console toggle. For now, CW-3 just gets backups *running* again; I can read `config/backup.lastBackupAt` on request to confirm freshness until the alarm ships.

✅ **Done when:** a manual trigger returns `200 success` and `config/backup.lastBackupAt` is today.

---

## CW-2 — Make the backup actually export (Firestore metadata → GCS) — *needs a redeploy*

CW-3 gets the cron *running*; this makes it back up real data (not just counts). Still Firestore-only — chart **bytes** are the Phase-2 Drive mirror.

```bash
# 1. Create a dedicated backup bucket (pick a location near the DB)
gcloud storage buckets create gs://crcmusiccharts-backups \
  --project=crcmusiccharts --location=us-central1 --uniform-bucket-level-access

# 2. Grant the Firebase service account the export + bucket roles
#    (find <FIREBASE_CLIENT_EMAIL> in Vercel env — it's the FIREBASE_CLIENT_EMAIL value)
gcloud projects add-iam-policy-binding crcmusiccharts \
  --member="serviceAccount:<FIREBASE_CLIENT_EMAIL>" \
  --role="roles/datastore.importExportAdmin"

gcloud storage buckets add-iam-policy-binding gs://crcmusiccharts-backups \
  --member="serviceAccount:<FIREBASE_CLIENT_EMAIL>" \
  --role="roles/storage.admin"
```
3. **Vercel env:** set `BACKUP_BUCKET=crcmusiccharts-backups` (Production) → **redeploy** (env changes need a new deployment).
4. **Verify:** re-run the CW-3 step-4 curl → expect `"type":"gcs"` + `outputUri: gs://crcmusiccharts-backups/backups/<ts>`. The export is then `gcloud firestore import`-restorable.

✅ **Done when:** a triggered run returns `type:"gcs"` and an export folder appears under `gs://crcmusiccharts-backups/backups/`.

---

## What this does and does NOT cover

| | After CW-1 | After CW-3 | After CW-2 | Needs the Phase-2 build |
|---|---|---|---|---|
| Accidental chart overwrite/delete recoverable | ✅ | | | |
| Backup cron actually runs (not silently dead) | | ✅ | | |
| Firestore **metadata** backed up + restorable | | | ✅ | |
| Chart **bytes** mirrored to **Google Drive** (browsable, you-restore-it) | | | | ⏳ Phase 2 |
| Full-wipe restore tool (`backupDriveId` pointer) | | | | ⏳ Phase 3 |

The chart-bytes Drive mirror (the "sync to Google Drive" you asked for) is the real build — queued post-launch per the synthesis. These three wins make us materially safer in the meantime with no code and no app risk.
