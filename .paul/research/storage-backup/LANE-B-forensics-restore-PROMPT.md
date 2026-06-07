# Lane B — Loss-surface forensics + restore guarantee (coder-5)

**Read `PARENT.md` in this directory first** (verified current state + ratified scope + HARD constraints). This prompt assumes it.

**Lane:** B — current-state forensics + recovery.
**Tier:** 0, READ-ONLY research. Output = `.paul/research/storage-backup/LANE-B-FINDINGS.md`. NO src/ changes, NO prod mutation.
**Sibling:** Lane A (coder-2) owns the forward Storage→Drive design. You own WHAT CAN GO WRONG (and did) + HOW WE RECOVER. Don't design the forward mirror (that's A); instead, define the requirements the forward design must satisfy to make recovery real.

## Your charter — root-cause past loss, inventory current exposure, define the restore guarantee

Daniel's fear is concrete: "another situation where we lose a whole lot of PDFs." Tell us how loss happens here, how exposed we are right now, and exactly how we'd recover — building on the substantial prior art, not re-deriving it.

### ★ Start from the prior art (READ THESE FIRST — do NOT re-derive)
- `.paul/research/backup-restore-runbook.md` (the existing PGR-01 runbook — assess it: is it current? does it cover Storage bytes or only Firestore?)
- `.paul/research/storage-recovery-B-report.md` · `.paul/research/storage-canonical-migration-PLAN.md`
- `.paul/research/orphan-recovery-manifest.{md,json}` · `orphan-bond-map.json` · `orphan-tracks-VERIFICATION.{md,json}` · `orphan-tracks-sweep-FINDINGS.md`
- Memory baseline ([[project_orphan_baseline]]): prior sweep healed 271 + purged 108 + backfilled metadata; active-row reconcile orphans = 0; BUT ~297 `library_index` rows already marked `orphaned` + 9 duplicate await a hard-delete sweep. The "Shireinu scare" (resolved, source was local) is the motivating incident.

### Research questions (answer each with evidence)

1. **Loss-mode taxonomy.** Enumerate the concrete ways chart bytes / metadata are lost or become unreachable in THIS system: Storage object deleted (by whom/what path — `test-delete-storage-object`, reconcile compensating-delete, manual console, lifecycle), `library_index` row vs Storage object drift (orphan classes), the v10/upgrade-class corruption, Drive-source disappearance, accidental overwrite (replace path / md5 advance), bad dedup/force deletes. For each: trigger, blast radius, current detectability, current recoverability. Reference `src/lib/chart-heal.ts`, `reconcile-library.ts`, `library-upload.ts` (atomic-guard + compensating-delete contract), `drive-sync/poller.ts`.

2. **Current coverage inventory (read-only).** What fraction of today's library is recoverable RIGHT NOW and from where? Cross-check `library_index` against (a) Storage presence and (b) any Drive copy. Quantify: how many charts are Storage-only (no Drive fallback = unrecoverable if Storage is lost) vs Drive-backed (legacy). This is the headline exposure number. Use Firebase MCP read-only + `library-verify`/`reconcile-library` logic (read paths only — NEVER run a heal/write).

3. **Audit the existing backup.** Is `/api/cron/backup` actually protecting anything? Check `config/backup` + `backups/{YYYY-MM-DD}` audit docs (read-only) for recent successful GCS exports vs the dormant `logical` fallback (i.e. is `BACKUP_BUCKET` set?). State plainly what is and isn't currently backed up, and the staleness/observability gap.

4. **Restore path assessment.** Given Lane A will mirror Storage→Drive, how well does the EXISTING recovery tooling close the loop? `reconcile_library` already heals Drive→Storage on existing rows — does it cover a FULL-WIPE restore (rows gone too), or only row-exists-bytes-missing? What's missing for a true "Storage bucket emptied, rebuild from Drive + metadata snapshot" recovery? Define the gap Lane A's metadata-backup must fill.

5. **Recovery runbook + RPO/RTO.** Update/replace the runbook for the target design: step-by-step "we lost Storage, here's how Daniel (or an agent) restores," with realistic RPO (how much could we lose between backups) and RTO (how long to restore). Include the safe verification (read-verify + dedup) so a restore doesn't itself corrupt.

6. **Cheap wins available now (flag, don't do).** Identify low-risk hardening that could land independently of the big design (e.g. enable GCS bucket Object Versioning / soft-delete as an immediate floor; set `BACKUP_BUCKET` to activate the dormant Firestore export; sweep the 297 orphaned rows). Mark each as a candidate fast-follow for Daniel — do NOT execute.

### Required reading (verify @ origin/master `7eb1b2d9e`)
- The prior-art docs above (first).
- `src/lib/chart-heal.ts` · `src/lib/mcp/tools/reconcile-library.ts` · `src/lib/mcp/tools/library-verify.ts` · `src/lib/library-upload.ts` · `src/lib/firebase-storage.ts` · `src/app/api/cron/backup/route.ts`
- PARENT.md verified-state section.

### Deliverable — `LANE-B-FINDINGS.md`
Loss-mode taxonomy; the current-coverage exposure number (Storage-only vs Drive-backed); the honest state of the existing backup; the restore-path gap analysis; an updated recovery runbook with RPO/RTO; and the prioritized list of cheap immediate wins (flagged for Daniel). End with the requirements Lane A's forward design MUST meet to make recovery real.

### Definition of done
FINDINGS written; prior art reused (not re-derived); exposure quantified from read-only probes; every cited path verified against origin/master; SHIP-NOTICE → `inbox/supervisor.md`. Sign `from coder-5`. **No src/ changes. No prod writes. No heals/sweeps — flag them only.**
