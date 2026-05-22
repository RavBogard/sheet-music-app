# Lane A — Storage→Drive backup architecture + options (coder-2)

**Read `PARENT.md` in this directory first** (verified current state + ratified scope + HARD constraints). This prompt assumes it.

**Lane:** A — forward backup-sync design.
**Tier:** 0, READ-ONLY research. Output = `.paul/research/storage-backup/LANE-A-FINDINGS.md` (+ optional diagrams). NO src/ changes, NO prod mutation, NO new cron deployed.
**Sibling:** Lane B (coder-5) owns forensics + restore. You own the FORWARD path (what to back up, where, how). Coordinate on the boundary; don't both write the restore runbook (that's B).

## Your charter — design the durable backup, leading with Google Drive

Daniel wants "sync to Google Drive so there's always a backup if we need it," covering **files + metadata**. Produce a concrete, deliberate architecture proposal.

### Research questions (answer each with evidence + a recommendation)

1. **What exactly must be backed up, and how big is it?** Enumerate the protected set: Firebase Storage chart bytes (PDF/MusicXML/images under the chart-storage prefix) + the Firestore metadata that resolves them (`library_index`, `setlists`, song docs). Estimate object count + total bytes from read-only probes (Storage list, `library_index` count). Map how `library_index.fileId` ↔ Storage object ↔ (optional) Drive id, citing `src/lib/firebase-storage.ts`, `src/lib/library-upload.ts`, `src/lib/mcp/tools/reconcile-library.ts`.

2. **Storage→Drive mirror design (the lead option).** Using the EXISTING `DriveClient` (`src/lib/google-drive.ts` `files.create`/`files.update`/`files.list`, scope `…/auth/drive`) and the existing cron pattern (`src/app/api/cron/backup/route.ts` + vercel.json), design how to mirror Storage bytes into a Drive backup folder (`GOOGLE_DRIVE_ROOT_FOLDER_ID` or a new dedicated folder). Specify: folder structure in Drive (mirror collections? flat? dated?), naming (use `library_index` stem so it's human-browsable + reconcile-friendly), **incremental vs full** (skip already-mirrored via md5/size — note Drive `files.list` md5Checksum), idempotency, dedup, **change detection** (how a NEW or REPLACED chart gets mirrored — piggyback on `library_signals`? a nightly diff cron? both?), and how it coexists with the EXISTING Drive→Storage import (avoid a sync loop — Storage is canonical; the backup folder must NOT be a drive-sync watch folder).

3. **Metadata backup.** How to capture the Firestore metadata so a restore can rebuild `library_index`/`setlists`. Assess REPAIRING/ACTIVATING the existing `/api/cron/backup` (set `BACKUP_BUCKET` + IAM, confirm `:exportDocuments` actually runs vs the dormant logical fallback) AND/OR a JSON snapshot of key collections written alongside the Drive file mirror (so the backup is self-contained in Drive). Recommend which.

4. **Auth / service-account model.** Which credential mirrors to Drive (`GOOGLE_SERVICE_ACCOUNT_EMAIL`+`GOOGLE_PRIVATE_KEY` vs the Firebase SA), what Drive sharing/ownership the backup folder needs so Daniel can browse it, Drive API quota/rate limits at our object count, and Drive storage capacity (Workspace vs consumer limits) for the total byte estimate from Q1. Flag any env that must be set in Vercel (don't assume current state — list what to verify).

5. **Compare alternatives (deliberate choice, not default).** Briefly evaluate GCS-native protection against the Drive mirror: bucket **Object Versioning**, **soft-delete / retention policy**, **lifecycle**, and a **second/dual bucket**. Trade-offs: Drive = human-browsable + Daniel-restorable + off-Firebase-blast-radius; GCS-native = cheaper, automatic, but invisible to Daniel and same-vendor blast radius. **Recommend a primary** (the brief expects Drive to lead) and note whether a layered approach (GCS versioning as the always-on floor + Drive mirror as the human-visible copy) is worth it.

6. **Failure modes + observability.** How the backup is monitored (reuse the `backups/{YYYY-MM-DD}` audit-doc pattern + Sentry `captureException` already in the backup route), how a SILENT backup failure becomes visible (staleness alert), and what guarantees the design gives ("a chart is recoverable within N hours of upload").

### Required reading (verify @ origin/master `7eb1b2d9e`)
- `src/app/api/cron/backup/route.ts` · `src/app/api/cron/drive-sync/route.ts` · `src/lib/drive-sync/poller.ts`
- `src/lib/google-drive.ts` (the write-capable DriveClient) · `src/lib/firebase-storage.ts` · `src/lib/library-upload.ts`
- `src/lib/mcp/tools/reconcile-library.ts` · `src/env.mjs` (env surface) · `vercel.json` (crons)
- PARENT.md prior-art list (skim B's territory for the boundary; B owns it).

### Deliverable — `LANE-A-FINDINGS.md`
A proposal containing: the protected-set inventory + size estimate; the recommended Drive-mirror architecture (with the loop-avoidance + incremental design spelled out); the metadata-backup recommendation; the auth/quota/capacity assessment + env-to-set list; the alternatives comparison + primary recommendation; failure-mode/observability design; and a **phased, Daniel-gated implementation plan** (what ships first, what's a console/env step, what's optional). End with the open questions only Daniel can answer.

### Definition of done
FINDINGS written; every cited path/tool/env verified against origin/master; a clear recommended way forward; SHIP-NOTICE → `inbox/supervisor.md` (research-lane notices go to supervisor, not auditor). Sign `from coder-2`. **No src/ changes. No prod writes.**
