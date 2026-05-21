# Backup / Disaster-Recovery Runbook (PGR-01)

**Owner:** Rabbi Daniel (single maintainer)
**Subsystem:** `/api/cron/backup` + Firestore managed export → GCS + Storage Object Versioning
**Lane:** `pgr01-backup-dr` (cycle robustness, Tier 1)
**Status as shipped:** code live + cron registered, but **DORMANT** until the
Daniel-console steps below are done. Until `BACKUP_BUCKET` is set, the daily cron
runs a *logical* no-op (counts only) — it does **not** export bytes.

---

## What ships in this lane (code)

1. **`vercel.json`** — `/api/cron/backup` registered at `0 3 * * *` (03:00 UTC
   daily, off-peak). Runs automatically once deployed. With no `CRON_SECRET`
   configured the route 401s (and Vercel cron sends the secret automatically when
   `CRON_SECRET` is set), so an un-provisioned cron is harmless.
2. **`src/app/api/cron/backup/route.ts`**
   - `GET` (Vercel cron, `CRON_SECRET` bearer) and `POST` (manual, admin token).
   - When `BACKUP_BUCKET` **is set**: real Firestore managed export via the
     `databases/(default):exportDocuments` REST API → `gs://$BACKUP_BUCKET/backups/<ts>`.
     Captures the long-running operation name.
   - When `BACKUP_BUCKET` is **unset**: logical no-op (collection counts only),
     no throw — dormant-safe.
   - Every run writes a dated audit doc `backups/{YYYY-MM-DD}` (ts, status, type,
     bucket path, export op name, counts) so **staleness is observable** — a missing
     recent date means the cron stopped. Also keeps the existing `config/backup`
     "last backup" pointer.
   - Failures route through Sentry `captureException` (Sentry is live in prod).
3. **`firestore.rules`** — `backups/{id}`: admin-read, server-only-write
   (Admin SDK bypasses rules; clients — admins included — cannot forge records).

---

## Daniel console checklist (one-time, un-dormants the backup)

Do these in the GCP / Vercel consoles for project `crcmusiccharts`. Until then
the cron is a logical no-op (safe).

1. **Create the GCS bucket.**
   ```bash
   gcloud storage buckets create gs://centralreform-backups \
     --project=crcmusiccharts \
     --location=us \
     --uniform-bucket-level-access
   ```
   (Pick a region near the Firestore location. Single-region `us` is fine for a
   shul-scale dataset.)

2. **Grant the Firebase/export service account the export + storage roles.**
   The export runs as the SA whose `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY`
   the app already uses. Grant it:
   ```bash
   SA="<FIREBASE_CLIENT_EMAIL value from Vercel env>"
   gcloud projects add-iam-policy-binding crcmusiccharts \
     --member="serviceAccount:${SA}" --role="roles/datastore.importExportAdmin"
   gcloud storage buckets add-iam-policy-binding gs://centralreform-backups \
     --member="serviceAccount:${SA}" --role="roles/storage.admin"
   ```

3. **Set `BACKUP_BUCKET` in Vercel** (Production scope) to `centralreform-backups`.
   Redeploy (env-only change needs a new deploy to take effect). The next 03:00 UTC
   cron run will perform a real export.

4. **Set `CRON_SECRET` in Vercel** (if not already) so the cron authenticates.
   Vercel cron automatically sends `Authorization: Bearer $CRON_SECRET`.

5. **Enable Storage Object Versioning** on the *Firebase Storage* bucket (the
   chart-bytes bucket, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`) — this is separate
   from the Firestore export and protects chart PDFs/MusicXML from accidental
   overwrite/delete:
   ```bash
   gcloud storage buckets update gs://<NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET> \
     --versioning
   ```
   Optionally add a lifecycle rule to expire noncurrent versions after N days to
   cap cost.

6. **(Optional) Bucket retention / lifecycle** on `centralreform-backups` to age
   out old Firestore exports (e.g. delete exports older than 90 days).

---

## Restore procedure (Firestore)

> ⚠️ A Firestore import **overwrites** documents with matching paths and is
> effectively irreversible. Practice on a scratch project first if unsure.

1. **Find the export to restore from.**
   ```bash
   gcloud storage ls gs://centralreform-backups/backups/
   ```
   Each `backups/<timestamp>/` prefix is one daily export. Cross-reference the
   `backups/{YYYY-MM-DD}` Firestore audit docs (or `config/backup`) for the op name
   / path of a known-good run.

2. **Import into the live database** (or a recovery DB):
   ```bash
   gcloud firestore import \
     gs://centralreform-backups/backups/<timestamp> \
     --project=crcmusiccharts
   ```
   To restore only specific collections:
   ```bash
   gcloud firestore import \
     gs://centralreform-backups/backups/<timestamp> \
     --collection-ids=setlists,users \
     --project=crcmusiccharts
   ```

3. **Verify** via the app (read a recent setlist) and the `backups/` audit trail.

### Storage (chart bytes) restore
With Object Versioning enabled, restore an overwritten/deleted chart by copying a
noncurrent version back over the live name:
```bash
gcloud storage ls --all-versions gs://<storage-bucket>/<path>
gcloud storage cp gs://<storage-bucket>/<path>#<generation> gs://<storage-bucket>/<path>
```

---

## RPO / RTO

- **RPO (recovery point objective):** ≤ 24h — daily 03:00 UTC export. Acceptable
  for a weekly-cadence shul app (setlists change ~weekly; see project cadence).
  Tighten to twice-daily by adding a second cron entry if Daniel wants.
- **RTO (recovery time objective):** ~minutes-to-an-hour — a `gcloud firestore
  import` of a shul-scale dataset is fast; the bound is mostly human (locate the
  export, confirm, run, verify).
- **Coverage gap:** the managed export captures **Firestore**. Chart **bytes** in
  Firebase Storage are protected by Object Versioning (step 5), not by this export.
  Both are required for full DR.

---

## Observability (feeds PGR-03 later)

The `backups/{YYYY-MM-DD}` collection is the staleness signal: a healthy system has
a doc for *today* (or yesterday before 03:00 UTC) with `status: export_initiated`.
A missing recent date, or a run with `status: error`, means backups stopped — a
future PGR-03 alert reader can watch this collection (no reader is wired yet; the
Sentry `captureException` on failure is the interim signal).
