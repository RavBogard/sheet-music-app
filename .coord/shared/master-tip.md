# Master tip

**SHA:** 7d0272652
**Pushed at:** 2026-05-24T22:35Z
**Pushed by:** coder-3 (storage-backup-silent-death-probe DIAGNOSIS.md amendment; markdown-only follow-up to `36ca5bccf` per auditor+supervisor 22:00Z/22:05Z ratification — no new SHIP-NOTICE cycle, no `src/` or test changes)
**Touched:** **`.paul/research/storage-backup-silent-death/DIAGNOSIS.md`** rewritten with the real root cause surfaced by `vercel logs --since 7d --search storage-backup --expand`. **v1 diagnosis was wrong** ("env var unset → dormant skip"); the real root cause is: cron IS firing, mirror IS running, **Google Drive `/upload/drive/v3/files?supportsAllDrives=true&uploadType=multipart` returned HTTP 400 Bad Request** on the very first `uploadBinaryFile` call of the 2026-05-24T05:00Z tick (the only real-mirror tick to have run since Daniel set `CRC_BACKUP_DRIVE_FOLDER_ID=0AGFG2GQLuWKKUk9PVA` ~1d ago); per-row try/catch swallowed each Drive error → gaxios 3-retry × exponential backoff × hundreds of active library rows → function blew past `maxDuration: 300s` → Vercel killed externally → no JS ran after kill → `recordStorageBackupRun` + `writeStorageBackupError` never executed → zero Firestore writes → PGR-03 silent. Code in `36ca5bccf` is still correctly defensive (auditor ACCEPT stands — `tickStale` alarm + lastTickAt stamps + missing-doc-aged alarm catch the failure class once a tick survives long enough to write the doc; dormant heartbeat is harmless DiD), but a real backup needs TWO new fixes outside this lane's scope: **Fix A (Daniel-action investigation):** Shared Drive `0AGFG2GQLuWKKUk9PVA` service-account permissions probe — the redacted Drive `errors[]` body in the gaxios envelope holds the real message; `curl -H 'Authorization: Bearer $CRON_SECRET' /api/cron/storage-backup?max=1` will surface it. Most likely cause: service-account lacks `Content manager` role on the Shared Drive. **Fix B (NEW dispatched code lane, ~80-150 LOC):** pre-write `lastTickStartedAt` breadcrumb at top of `runAndRespond` before the for-loop + per-row time-budget guard that bails to `recordStorageBackupRun(partial:true)` before hitting maxDuration + PGR-03 derived alarm for "started but never finished" pattern. Dispatch only after Fix A resolves (otherwise the time-budget guard hides Drive errors instead of surfacing them). HEADS-UP to supervisor with Fix B shape will follow this commit. **Source of truth:** Vercel log probe single result + 4a9e3d896-era `errors:[Object]` envelope + auditor ACK at 22:00Z + supervisor ratification at 22:05Z. _(prior tip `4a9e3d896` F-7 + `36ca5bccf` storage-backup-silent-death-probe code + chain preserved below.)_

**[prior tip 4a9e3d896] coder-? F-7 library-index recompute on rename + editEnrichment** — Pushed at 2026-05-24 (W-02 fields recompute). (Full summary in git history.)

**[prior tip 36ca5bccf] coder-3 storage-backup-silent-death-probe Pushed at:** 2026-05-24T21:00Z — Tier 1, single-commit lane (+908 LOC across 7 modified + 1 new DIAGNOSIS.md). Forward-fix bundle: dormant heartbeat write + lastTickAt stamps everywhere + StorageBackupHealth.present extended (lastTickAt/tickStalenessHours/tickStale/dormant) + 2 new Sentry alarms (tickStale + missing-doc + deploy-aged) + healthBootstrap.firstAdminTickAt bootstrap stamp oracle. Gates: tsc 0 errors / next build exit 0 / full vitest 2634 PASS+79 SKIP+0 FAIL. Auditor code-shape ACCEPT at 22:00Z (DIAGNOSIS.md amendment 7d0272652 superseded the v1 root-cause attribution; code-shape ACCEPT independent of attribution). (Full summary in git history.)

**[prior tip 2333c68f0] coder-4 setlist-import-via-pcu-with-defaults-mirror Pushed at:** 2026-05-24T20:45Z — Tier 1 single-commit lane closing FINDING-3 + FINDING-5 from ingest-mutator-matrix research (+949/-158 LOC). F-3 routes `/api/setlists/import/execute` through `processChartUpload`; F-5 dual-writes `songs/{id}.defaults.{key,bpm,lead}` via shared `applySongMetadata`. New `src/lib/setlist-import-execute.ts` + new `src/lib/__tests__/setlist-import-execute.emulator.test.ts`. (Full prior summary in git history.)

**[prior tip afbc56a7e] coder-1 ipad-wake-lock-toggle-fix Pushed at:** 2026-05-24T19:30Z — Tier 1 Option A (harness fix), single-commit lane closing F-3 RED from ipad-webkit-prod-sweep. (Full prior summary in git history.)

**[prior tip 1e39b7b61] coder-2 audio-viewer-blob-url-fix Pushed at:** 2026-05-24T20:15Z — Tier 1 single-commit lane closing the F-2 mechanism that coder-5's ipad-stuck-spinner-characterization (`1aea77464`) caught. (Full prior summary in git history.)

## Update protocol

After every successful push to origin master, OVERWRITE this file with:

```markdown
# Master tip

**SHA:** <new-sha>
**Pushed at:** <iso-utc>
**Pushed by:** <your-agent-id>
**Touched:** <comma-separated file paths or brief summary>
```

Before pushing, READ this file. If the SHA differs from your local master:
```bash
git fetch origin && git rebase origin/master
```
…then re-run your tests + build before pushing.

**Narrow-lane caveat (added 2026-05-18T21:35Z, ratified by Daniel).**
For single-commit narrow lanes when origin has diverged with disjoint
shared-file activity, prefer:
```bash
git fetch origin
git reset --hard origin/master
git cherry-pick <local-sha>
```
over `git rebase origin/master`. Rebase replays your branch's full
history and can conflict-storm on files you never touched (sibling-
worktree race shape — see [[feedback_shared_worktree_race]]). Cherry-
picking a single commit onto fresh origin/master avoids the replay
entirely. Multi-commit lanes still rebase; this caveat is for single-
commit lanes. Cites msg-from-cycle35-login-ssr SHIP-NOTICE
2026-05-18T21:30Z.
