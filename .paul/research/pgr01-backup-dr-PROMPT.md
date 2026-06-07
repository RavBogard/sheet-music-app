# Lane: pgr01-backup-dr (coder-5) — Tier 1

## Context
PGR-01 — the **#1 CRITICAL** robustness gap from your own
`.paul/research/product-gap-robustness-FINDINGS.md`. CRC has **no working
backup/DR**. This **gates band onboarding** (roadmap Phase 1).

Verified at origin/master (`5dd02b555`):
- `src/app/api/cron/backup/route.ts` EXISTS: `GET` (cron, `CRON_SECRET` bearer auth)
  + `POST` (manual admin). BUT:
  - **Not registered in `vercel.json` crons** → it never runs automatically.
  - `runBackup()` reads `process.env.BACKUP_BUCKET` (route.ts:98); when **unset** it
    returns only a *logical* record: "Set BACKUP_BUCKET env var for full GCS exports."
    (route.ts:180) — i.e. it does NOT actually export.
  - `BACKUP_BUCKET` is `z.string().optional()` in `src/env.mjs:34,88`.
  - **No admin UI trigger** (grep of `src/components/admin/**` + `manage/**` = none).

This lane ships **DORMANT-safe** like a3-ai-enrichment: ZERO prod behavior change
until Daniel provisions the bucket. The cron registration is the only live change
(and it 401s without `CRON_SECRET`).

## Scope — EDIT
1. **`vercel.json`** — register `/api/cron/backup` at `"0 3 * * *"` (3am daily,
   off-peak; matches the route.ts doc-comment). Append to the existing `crons` array.
   **CLAIM `vercel.json`** (shared file).
2. **`src/app/api/cron/backup/route.ts`** — make `runBackup()` perform a REAL
   Firestore→GCS managed export when `BACKUP_BUCKET` IS set (Firestore
   `databases.exportDocuments` admin/REST API; SA needs
   `roles/datastore.importExportAdmin` + `roles/storage.admin`). Keep the
   `BACKUP_BUCKET`-unset branch as a safe no-op logical record (dormant). On every
   run write a `backups/{YYYY-MM-DD}` Firestore audit doc (ts, collections, status,
   bucket path, export op name) so staleness is observable (feeds PGR-03 later).
   Route failures through Sentry `captureException` (Sentry is confirmed live in prod).
3. **`firestore.rules`** — `backups/{id}` block: admin-read + server-only-write
   (mirror the `webVitalsObservations` block). **CLAIM `firestore.rules`** — coder-4
   (PGR-04) also touches it for an `aiSpend` block; disjoint blocks, coordinate via
   the claims table, trivial merge.
4. **NEW `.paul/research/backup-restore-runbook.md`** — exact restore steps
   (`gcloud firestore import gs://…`), Storage Object Versioning recommendation,
   RPO/RTO note, and the Daniel console checklist (below).

## Daniel console (document in the runbook; do NOT block on it)
Create GCS bucket `centralreform-backups`; set `BACKUP_BUCKET` in Vercel; grant the
SA `roles/datastore.importExportAdmin` + `roles/storage.admin`; enable Storage
Object Versioning.

## Acceptance
- `vercel.json` has the backup cron; `next build --webpack` clean.
- BACKUP_BUCKET-**unset** → logical-record no-op, no throw (emulator/unit test).
- BACKUP_BUCKET-**set** (mocked export client) → invokes the Firestore export API
  with the bucket (test asserts the call).
- `backups/{date}` audit doc written each run.
- `firestore.rules` `backups/` admin-read + server-only-write (rules test).
- Restore runbook committed.
- **Deployed probe (post-merge):** `GET https://www.centralreform.live/api/cron/backup`
  with NO auth → **401** (cron auth intact). Paste this in the SHIP-NOTICE `## Repros`.

## Hard rules
`bridge/**` untouched; `errors.ts`/`error-envelopes.ts` read-only; `CRON_SECRET` GET
auth UNCHANGED; dormant-safe (no prod behavior change until Daniel sets the bucket).
Do not run a real export against prod from your dev box.

## Tier 1
Tests + build + the one deployed 401 probe. Auditor confirms dormant-safe + export
call shape + cron auth.
