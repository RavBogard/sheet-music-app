# Storage Backup / "Sync to Google Drive" — research program (PARENT)

**Dispatched:** 2026-05-22 (supervisor, on Daniel's directive)
**Tier:** 0 — READ-ONLY research. NO src/ changes, NO prod-data mutation, NO new crons. Output is FINDINGS docs + a proposed way forward. Implementation is a SEPARATE, post-launch, Daniel-gated phase.
**Why now:** Daniel: *"I don't want to run into another situation where we lose a whole lot of PDFs or other storage. I think it's time for us to come up with a storage solution, ideally some sort of 'sync to Google Drive' type of thing so there's always a backup for us if we need it."*

## Ratified scope (Daniel, 2026-05-22 via supervisor AskUserQuestion)

1. **Coverage = FILES + METADATA (full safety net).** Back up the Firebase **Storage** chart bytes (PDF / MusicXML / images — *the actual loss vector*) **AND** the Firestore **metadata** that points at them (`library_index`, `setlists`, song docs) so a full wipe is recoverable end-to-end.
2. **Target = LEAD WITH GOOGLE DRIVE, but compare alternatives.** Design the Drive sync Daniel wants, AND sanity-check it against GCS-native options (bucket Object Versioning, soft-delete / retention, lifecycle, dual-bucket) so the recommendation is deliberate, not default. Drive's appeal: Daniel can browse/restore files himself in a familiar UI.
3. **Two parallel researchers** (this program): Lane A forward-sync design, Lane B loss-forensics + restore.

## Verified current state (supervisor pre-flight @ origin/master `7eb1b2d9e` — TRUST, then re-verify)

- **Firebase Storage chart bytes have NO backup.** Nothing mirrors `gs://<NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET>` chart files anywhere. This is the loss vector.
- **A Firestore backup cron EXISTS but is Firestore-only and likely DORMANT:** `src/app/api/cron/backup/route.ts` (vercel.json cron `0 3 * * *`). It calls Firestore `:exportDocuments` → `gs://$BACKUP_BUCKET/backups/<ts>` **only if `BACKUP_BUCKET` is set**; otherwise it falls back to `logicalBackup()` (just records doc COUNTS, no bytes). It records `config/backup` + dated `backups/{YYYY-MM-DD}` audit docs. It NEVER backs up Storage bytes, and never targets Drive.
- **Google Drive is currently an IMPORT SOURCE, not a backup target:** `/api/cron/drive-sync` (`*/5 * * * *`) + `src/lib/drive-sync/poller.ts` mirror David's Drive drop-folder → Firebase Storage via `processChartUpload` (atomic-guard + dedup). `reconcile_library` (`src/lib/mcp/tools/reconcile-library.ts`) heals Drive→Storage on existing `library_index` rows. **Direction is Drive→Storage.**
- **The Drive client CAN already write:** `src/lib/google-drive.ts` (468 lines) holds a full read/write `DriveClient` — `files.create` (line ~453), `files.export`, `files.get`, `files.list` — scope `https://www.googleapis.com/auth/drive` (NOT readonly). Auth via `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_PRIVATE_KEY` (both optional env). So Storage→Drive mirror is buildable on existing primitives.
- **Restore is HALF-BUILT:** if charts are mirrored to Drive, `reconcile_library` already restores Drive→Storage. `library_index.fileId` abstracts both backends (`upload-{uuid}` = Storage, Drive-id = legacy/Drive).
- **Relevant env (all optional in `src/env.mjs`):** `BACKUP_BUCKET`, `GOOGLE_DRIVE_ROOT_FOLDER_ID`, `DAVID_DRIVE_DROP_FOLDER_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `CRON_SECRET`. **Which are actually SET in Vercel prod is UNKNOWN — flag for Daniel; don't assume.**

## ★ Prior art on master — READ FIRST, do NOT re-derive (esp. Lane B)

- `.paul/research/backup-restore-runbook.md` (PGR-01 runbook — already exists!)
- `.paul/research/storage-recovery-B-report.md`
- `.paul/research/storage-canonical-migration-PLAN.md`
- `.paul/research/orphan-recovery-manifest.{md,json}` · `orphan-bond-map.json` · `orphan-tracks-VERIFICATION.{md,json}` · `orphan-tracks-sweep-FINDINGS.md`
- Memory context: a prior storage-recovery sweep healed **271 charts + purged 108 junk + backfilled metadata**; active-row reconcile orphans now **0**, but ~**297 `library_index` rows were marked `orphaned` + 9 duplicate** awaiting a hard-delete sweep ([[project_orphan_baseline]]). The "Shireinu data-loss scare" (resolved — source found local) is the motivating incident.

## Lanes

- **Lane A — Storage→Drive backup architecture + options** → coder-2. Prompt: `LANE-A-drive-sync-design-PROMPT.md`. FINDINGS: `.paul/research/storage-backup/LANE-A-FINDINGS.md`.
- **Lane B — Loss-surface forensics + restore guarantee** → coder-5. Prompt: `LANE-B-forensics-restore-PROMPT.md`. FINDINGS: `.paul/research/storage-backup/LANE-B-FINDINGS.md`.

Lanes are disjoint + parallel-safe (A = forward design; B = current-state + recovery). They feed a supervisor synthesis → `STORAGE-BACKUP-SYNTHESIS.md` (one fork for Daniel: the recommended way forward + phased plan).

## HARD constraints (binding on both lanes)

- **READ-ONLY.** No writes to prod Firestore/Storage/Drive. Firebase MCP read-only probes + code reading only. If a lane wants to *measure* (e.g. count Storage objects), use read/list only — never delete/move/create.
- **Launch-eve safety.** Today is Friday; the 6-iPad fleet + real setlists launch tonight/Shabbat. Do NOT touch live data or run anything that could perturb the running app. This research must be invisible to the launch.
- **No service-day writes** to the monitor desk (irrelevant here, but the standing rail holds).
- Verify every file:line / tool / env claim against `origin/master` `7eb1b2d9e` (or later) before relying on it ([[feedback_cowork_prompt_verify_before_write]]). The canonical `sheet-music-app/` cwd is on a STALE branch — read source from a worktree cut from origin/master or via `git show origin/master:<path>`.
- Deliverable is a PROPOSAL, not code. Recommend a phased, Daniel-gated implementation plan; do not implement.
