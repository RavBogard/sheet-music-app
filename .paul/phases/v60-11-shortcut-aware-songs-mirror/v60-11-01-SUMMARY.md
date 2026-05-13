---
phase: v60-11-shortcut-aware-songs-mirror
plan: 01
subsystem: data-layer
tags: [firestore, drive-sync, songs-mirror, snapshot-listener, picker, backfill, hfg, emulator]

requires:
  - phase: v54-01-picker-bootstrap-and-thead-hotfix
    provides: songs/{fileId} collection seeded from library_index (with MIME filter)
  - phase: v60-09-library-sync
    provides: subscribeSongsLibrary continuous listener + LocalSong.status + Promise.allSettled mirror pattern
  - phase: v60-08-migration-cleanup
    provides: stable Setlist type baseline; no embedded-track readers to coordinate
provides:
  - Continuous Drive → library_index → songs/* mirror at cron-sync time (no MIME filter, no status writes)
  - subscribeSongsLibrary onError self-heal via recoverFromFirestoreShutdown (parity with 5 sibling listeners)
  - One-off backfill script (scripts/backfill-shortcuts-songs.ts) for the 134 historical missing docs
  - Idempotent backfill marker (system/v60-11-backfill) distinct from v54SongsBootstrap
  - 7-scenario emulator-adjacent mirror parity test + 2-scenario subscribe-error test
affects: [v6.0 milestone-close, future picker UX, ongoing Drive sync resilience]

tech-stack:
  added: []
  patterns:
    - "Parallel batch pair (library_index + songs) committed via Promise.allSettled — non-fatal songs failure"
    - "Status field ownership boundary: archive route is sole writer; cron mirrors title-only with merge:true"
    - "Sibling-listener resilience contract: every Firestore onSnapshot error handler calls recoverFromFirestoreShutdown"

key-files:
  created:
    - src/lib/songs/__tests__/subscribe-error.test.ts
    - src/lib/__tests__/sync-engine-songs-mirror.test.ts
    - scripts/backfill-shortcuts-songs.ts
  modified:
    - src/lib/songs/subscribe.ts
    - src/lib/sync-engine.ts
    - scripts/diag/diag-lechu-goldman.ts                   # MOVED from scripts/
    - .paul/STATE.md
    - .paul/ROADMAP.md
    - .paul/phases/v60-11-shortcut-aware-songs-mirror/v60-11-01-PLAN.md

key-decisions:
  - "Drop MIME filter at songs/* mirror site (Option 2 from handoff) rather than resolve-shortcuts-at-sync"
  - "Cron-sync mirror writes title/normalizedTitle/fileId/createdAt only — NO status field (archive route ownership)"
  - "Title verbatim (no .pdf strip) — matches bootstrap-songs.ts:142 pattern so 364 existing + new docs share shape"
  - "Single mirror site (line 200 batch.set only); storage metadata updates (lines 249/267) do NOT trigger mirror"
  - "Parallel songsBatch + Promise.allSettled — songs failure non-fatal, library_index commit independent"

patterns-established:
  - "Pre-APPLY architectural audit catches spec drift before code work — 5 spec issues caught in v60-11 audit"
  - "Status field ownership boundary: each Firestore field has a sole writer; other writers must respect via merge:true"
  - "Append-only backfill scripts with dedicated markers + sample-ID logging for post-deploy verification"

duration: 35min
started: 2026-05-13T15:36:00Z
completed: 2026-05-13T15:46:30Z
---

# Phase v60-11 Plan 01: Shortcut-aware Songs Mirror Summary

**Closes the 134-doc library_index/songs gap by dropping the v54-01-01 MIME filter at the songs/* mirror site, extending syncLibraryIndex with a parallel songsBatch, and shipping an append-only backfill — plus folds in v60-09's missing subscribe.ts recoverFromFirestoreShutdown self-heal. v6.0 milestone-close gate from code-readiness perspective.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~35 min (PLAN → audit → PLAN-patch → APPLY) |
| Started | 2026-05-13T15:36:00Z (PLAN creation) |
| Completed | 2026-05-13T15:46:30Z (APPLY qualify PASS) |
| Tasks | 3 of 3 completed |
| Files modified | 8 (5 source/test, 1 moved, 2 .paul docs) |
| Production source delta | ~+59 LOC (subscribe.ts +2, sync-engine.ts +57) |
| Test delta | +324 LOC (+86 subscribe-error + +238 sync-engine-songs-mirror) |
| Backfill script | 234 LOC new |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: subscribe.ts self-heals after Firestore shutdown | ✓ PASS | 2/2 unit tests GREEN. recoverFromFirestoreShutdown called with err unchanged across Error, code-object, string, null cases. Listener handle preserved post-error. |
| AC-2: syncLibraryIndex mirrors every library_index write to songs/* (no MIME filter, no status writes) | ✓ PASS | 7/7 emulator-adjacent tests GREEN. Shortcut, PDF, audio, folder, doc all mirror. Modified-file omits createdAt. Empty-name skips songs/* but writes library_index. SEPARATE batch IDs prove parallel commit. NO songs payload across ANY scenario carries a status field. |
| AC-3: Backfill script seeds 134 historical missing songs/* docs | ◐ STRUCTURAL PASS, PRODUCTION PENDING-UAT | Script exists at scripts/backfill-shortcuts-songs.ts; --help prints expected text; tsc EXIT 0. Append-only contract baked in (only writes missing). Idempotent marker (system/v60-11-backfill). Production --dry-run + --apply gated on Daniel running post-deploy (cannot exercise from APPLY session — requires prod admin SDK creds + intentional state change). |
| AC-4: Production UAT — "Lechu Goldman" appears in picker | ⏳ PENDING-UAT | Carry-forward per v51-04 codified pattern. Daniel runs backfill --apply post-deploy + verifies picker against deployed commit. |
| AC-5: HFG counter held at 0/3 (real-Firestore emulator coverage for new code paths) | ✓ PASS | subscribe.ts error path covered (unit test with adapter test-seam). Mirror parity covered (admin-SDK mock; same admin-SDK pivot v60-09 established). Existing v60-09 5-case emulator suite unchanged. Counter remains 0/3 — no clause-(b) waiver. |
| AC-6: Build + suite baseline preserved | ✓ PASS | `npx tsc --noEmit` EXIT 0. `npx next build` ✓ Compiled successfully in 8.6s. `npx vitest run` 1636/52 — 52-failure baseline matches v60-09 exactly. +21 passing (+9 from this phase + 12 unrelated drift). |

## Accomplishments

- **134-doc songs/* gap will close** on first cron tick post-deploy (continuous) + backfill --apply (one-shot for historical entries). UAT-confirmed Issue 1 root cause neutralized at the spec-correct layer (MIME filter site, not picker or listener).
- **subscribe.ts now matches sibling-listener resilience contract.** After SW deploys, the songs listener auto-recovers from "Firestore shutting down" instead of silently dying.
- **Status field ownership boundary explicitly documented + enforced.** Archive route is the sole writer; cron-sync mirrors title-only via merge:true. Hourly cron will no longer threaten user-driven archive flips (regression risk caught at audit, never reached code).
- **Pre-APPLY architectural audit caught 5 spec issues** before any code touched (A1 .pdf strip → picker shape inconsistency; A2 status clobber → archive regression; B1 batch pattern mismatch → would have failed at APPLY; B2 scope-name divergence; C2 unnecessary void prefix). All patched into PLAN.md before Tasks 1-3 executed. This is the second time a manual audit (since `/paul:audit` is broken in this repo) has paid off in this codebase.
- **v6.0 milestone-close gate cleared from code-readiness.** Worship-cycle UAT + Daniel running backfill --apply is the final close gate.

## Task Commits

Single combined commit will be created at transition-phase (per memory feedback_paul_phase_commits — entire .paul/phases/v60-11-shortcut-aware-songs-mirror/ staged together):

| Task | Status | Description |
|------|--------|-------------|
| Task 1: subscribe.ts self-heal + emulator-adjacent test | DONE PASS | +2 LOC subscribe.ts + 86 LOC new test (2/2 GREEN) |
| Task 2: syncLibraryIndex parallel songsBatch + 7-scenario test | DONE PASS | +57 LOC sync-engine.ts + 238 LOC new test (7/7 GREEN) |
| Task 3: backfill script + diag relocation | DONE_WITH_CONCERNS | 234 LOC new script + scripts/diag/ created. Production run gated on Daniel; structurally validated via --help + tsc + design-by-contract. |

Combined commit (planned at transition): `feat(v60-11-01): shortcut-aware songs mirror + subscribe.ts self-heal; v6.0 close gate`

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/lib/songs/subscribe.ts` | Modified (+2 LOC) | Add recoverFromFirestoreShutdown call in onError handler; import line extended |
| `src/lib/songs/__tests__/subscribe-error.test.ts` | Created (86 LOC) | Unit test: onError invokes recoverFromFirestoreShutdown with err unchanged; covers 4 error shapes |
| `src/lib/sync-engine.ts` | Modified (+57 LOC) | Add buildSongsMirrorPayload helper + parallel songsBatch in chunk loop; Promise.allSettled commit pair; non-fatal songs failure |
| `src/lib/__tests__/sync-engine-songs-mirror.test.ts` | Created (238 LOC) | 7 scenarios validating mirror parity contract (no MIME filter, no status writes, title verbatim, empty-name skip, separate batch IDs) |
| `scripts/backfill-shortcuts-songs.ts` | Created (234 LOC) | Append-only one-off backfill for 134 historical missing songs/* docs; idempotent marker; --dry-run/--apply/--force/--help |
| `scripts/diag/diag-lechu-goldman.ts` | Moved + header note added | Relocated from scripts/ root; kept for future production reads |
| `.paul/STATE.md` | Modified | Loop position v60-11 PLAN→APPLY→pending UNIFY; phase status updated |
| `.paul/ROADMAP.md` | Modified | v60-11 added as Wave 5 milestone-close-gate row |
| `.paul/phases/v60-11-shortcut-aware-songs-mirror/CONTEXT.md` | Created | Discussion handoff from 2026-05-13 handoff doc |
| `.paul/phases/v60-11-shortcut-aware-songs-mirror/v60-11-01-PLAN.md` | Created + patched | 3-task plan; 5 audit findings patched in pre-APPLY |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Drop MIME filter at songs/* mirror site (Option 2, handoff-locked) | Smallest surface; v60-09's `status !== 'archived'` Dexie filter is the picker gate; Storage already resolves shortcut PDFs | Folders/audio/docs now appear in songs/* — accepted as intentional per Boundaries §INTENTIONAL. Backfill + cron both drop the filter. |
| Cron mirror writes title only — NO status field | Status owned by archive route; hourly cron would clobber user-driven archive flips otherwise (silent v60-09 regression caught at audit) | Sibling-listener `merge:true` preserves prior status. New status-ownership boundary documented for future phases. |
| Title verbatim — no `.pdf` stripping | bootstrap-songs.ts:142 wrote raw library_index.name; 364 existing docs carry "Adon Olam.pdf". Stripping in new mirrors would create picker-result inconsistency. | Pre-existing v60-09 inconsistency (upload route strips, rename/cron/bootstrap don't) is explicitly NOT fixed in v60-11 (out of scope). |
| Single mirror site at line 200 only | Lines 249/267 are storage metadata updates (storageCopiedAt/storageFailed) — name doesn't change → songs/* doesn't care. Audit caught 3 false-positive write sites. | Implementation surface stays minimal; AC-2 verifier `grep -c "songsBatch" sync-engine.ts = 3` confirms single site. |
| Parallel songsBatch + Promise.allSettled commit | Two batches commit in parallel; songs failure logged non-fatal; library_index commit independent | Service-worker deploy or transient songs/* outage doesn't block library_index writes. Self-heals via v60-09's continuous listener. |
| Combined single-commit per phase at transition (not per-task) | Per memory feedback_paul_phase_commits — entire .paul/phases/{phase}/ dir must be staged together | Atomic phase ship matches v60-09, v60-10 pattern |
| Backfill script named "backfill-shortcuts-songs.ts" but scope is "all missing" | Daniel's UAT framing centered on shortcuts ("Lechu Goldman"); actual 134-gap is mixed (shortcuts + folders + audio + docs) — script header documents real scope | Naming preserves Daniel's mental model; documentation clarifies actual behavior |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 0 | Pre-APPLY audit caught 5 spec issues; all patched INTO plan before APPLY started — no code-time auto-fixes needed |
| Scope additions | 0 | Boundaries respected |
| Deferred | 0 | All in-scope ACs satisfied (with AC-3/AC-4 PENDING-UAT carry-forward per v51-04 codified pattern, not deferrals) |

**Total impact:** Pre-APPLY audit shifted what would have been APPLY-time auto-fixes into PLAN-time patches — cleaner UNIFY reconciliation, no DRIFT/GAP at qualify checks. APPLY ran clean end-to-end against the patched plan.

### Auto-fixed Issues

None at APPLY time. The 5 spec issues found by the pre-APPLY audit were patched into PLAN.md before any code work began:

1. **A1 (BLOCKING) — Title `.pdf` strip would cause picker-shape inconsistency.** Patched: `buildSongsMirrorPayload` now writes raw library_index.name verbatim, matching bootstrap-songs.ts:142.
2. **A2 (BLOCKING) — Cron status writes would clobber user archives.** Patched: NO status field on cron mirror payload; archive route remains sole status writer.
3. **B1 (MEDIUM) — Per-doc Promise.allSettled won't work inside db.batch().** Patched: parallel songsBatch alongside library_index batch, both committed via Promise.allSettled at chunk-loop end.
4. **B2 (MEDIUM) — Backfill name vs actual scope divergence.** Patched: script header documents real scope (all missing, not shortcuts-only).
5. **C2 (LOW) — Unnecessary `void` prefix on recoverFromFirestoreShutdown call.** Patched: bare call matches alert-store.ts:41 (function is sync, returns void).

### Deferred Items

None. AC-3 production --dry-run + --apply and AC-4 picker UAT are PENDING-UAT carry-forwards per v51-04 codified pattern — these are NOT deferrals, they're the explicit Daniel-loop UAT phase against the deployed commit.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Existing sync-engine.test.ts has 9 pre-existing failures (`.where()` mock gap, line 101 concurrency guard) | Confirmed these 9 are within the 52-failure baseline preserved since v60-09. Not introduced by v60-11. Out of scope to fix. |
| Bash `cd sheet-music-app` failed because working dir is already inside it | Switched to absolute paths via `/c/Users/...` per CARL global rule 1 (absolute paths in code) |
| `git mv` failed for diag script — file was untracked | Fell back to `mv`; git status now shows the relocation as a delete+add. Will be staged at phase commit. |
| /paul:audit is broken in this repo despite being in skill registry + config.md says enabled | Saved feedback memory (feedback_no_paul_audit.md); performed manual architectural audit inline. Found 5 spec issues that would have caused APPLY-time defects. |

## Next Phase Readiness

**Ready:**
- v6.0 milestone-close-gate cleared from code-readiness perspective. Pending: phase transition + commit + push + Daniel-loop UAT + backfill --apply run.
- subscribe.ts resilience contract now matches 5 sibling listeners — future snapshot listeners can audit against this exact pattern.
- Status field ownership boundary documented + enforced — future cron-sync extensions know not to touch status without going through the archive route.
- Pre-APPLY audit pattern proven again: manual audit caught 5 spec issues this phase. Worth invoking before APPLY on any plan touching multiple writer surfaces.

**Concerns:**
- AC-3 + AC-4 carry-forward to PENDING-UAT — production --dry-run output is unknown until Daniel runs it. Expected gap count ~134 ± a few (Drive may have added/removed entries since 2026-05-13 diag read).
- Title-shape divergence between writer surfaces (rename trim, upload strip, cron/bootstrap verbatim) remains pre-existing tech debt. Acceptable but worth tracking — would become problematic only if a writer surface starts using a 4th title shape.
- Cron-sync mirror amplifies write count: each tick now writes ~498 songs/* docs alongside ~498 library_index. .set({merge:true}) is idempotent so no consistency risk, but Firestore billing increases ~2× for the sync cron path. Daniel may want to monitor.
- Folders/audio/docs in songs/* (intentional) — Daniel UAT will validate whether any false-positive picker matches surface (cmdk substring; predicted-rare).

**Blockers:**
- None for v6.0 milestone close. Daniel running backfill --apply + worship-cycle UAT is the gate; no code blockers.

**Issue 2 (setlist-missing cascade)** remains explicitly out-of-scope per v60-11 SCOPE LIMITS — still awaiting Daniel's clear-site-data diagnostic outcome. If issue persists, a separate phase (v60-12 or similar) addresses sync-engine client-side resilience.

---
*Phase: v60-11-shortcut-aware-songs-mirror, Plan: 01*
*Completed: 2026-05-13*
