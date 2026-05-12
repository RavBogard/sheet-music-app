# Milestone Context — v6.0 Tracks Single-Source-of-Truth

**Generated:** 2026-05-12
**Status:** Ready for /paul:milestone (after v5.4 closes via /paul:complete-milestone)
**Source research:** `RESEARCH/TRACKS-MIGRATION-AUDIT-2026-05-12.md` + four scope-narrowed audits (`audit-writes.md`, `audit-reads.md`, `audit-sync.md`, `audit-hotpaths.md`)
**Master HEAD at definition time:** `4ee6e70`
**Predecessor:** v5.4 — Hotfix + Harness Fidelity (closing cleanly; v54-01 ✅ + v54-02-01 ✅ shipped; v54-02-02 / v54-03 / Mobile AddBar fold forward into v6.0)

---

## Why this milestone exists

The v50-05 data-model migration (tracks: embedded `setlists/{S}.tracks[]` array → top-level `tracks/{id}` collection) was started but never finished. As of HEAD `4ee6e70`, the codebase has:

- **27 production writers**: 11 embedded-only, 14 top-level-only, 2 dual (the `4ee6e70` library mirror).
- **~28 production readers**: 2 top-level (SSR `fetchTopLevelTracks` + snapshot listener) and ~26 embedded — including all the high-stakes surfaces (publish, print/personal, print/public, email-packets, scheduling-assign, perform-view SetlistDrawer playback queue, dashboard cards).

The result is a chronic P0 bug pattern that today's session triggered five times: deletes resurrect, library-added tracks invisible in editor, mid-edit reload destroys typed text, "Conflict — review" pill latches with no exit, modal popups (now muted but the FSM still trips).

Today's session shipped 8 patch commits trying to address symptoms; each band-aid exposed the next. The user explicitly halted further patching and required a coherent design doc before any new code. Four parallel scope-narrowed audits + one synthesizer produced that doc. **This milestone executes its recommendation, plus folds in the orthogonal v5.4 deferrals so v6.0 ends with the data model, the library sync, and the mobile add-track surface all coherent.**

Major-version bump (v6.0 vs v5.5) reflects the data-model nature of the change: top-level `tracks/{id}` becomes single source of truth, replacing the half-migrated dual-source state that's been the dominant source of regressions since v50-05.

---

## Features to Build

### F1 — Single-source-of-truth tracks read path
- Every server-side reader of "the live track list" routes through one helper (`getTracksForSetlist`).
- Every client-side reader hits Dexie, which is fed from top-level `tracks/{id}` via the existing snapshot listener.
- The legacy embedded `setlists/{S}.tracks[]` array is no longer read anywhere.

### F2 — Single-source-of-truth tracks write path
- Every writer (create / clone / duplicate / template / import / publish / rename / transfer) routes per-track writes through `applyEdit({collection:'tracks'})`.
- The cascading `/api/setlist/delete` route is taught to sweep top-level `tracks/{id}` docs by `setlistId` (currently orphans them).
- `setlistService.updateSetlist` stops accepting a `tracks` field.

### F3 — One-time backfill of the 15 most-recent setlists
- A migration script that, for each of the 15 most-recent setlists by `updatedAt`:
  - Writes any missing top-level `tracks/{id}` docs from the embedded array.
  - Sets `hydrated: true` and reconciles `trackCount`.
  - Strips the embedded `tracks` field via `FieldValue.delete()` in a second pass once all readers are off it.
- Older historical setlists are intentionally not backfilled (per locked decision #3).
- A `migration_snapshots/{setlistId}` doc captures the pre-strip embedded array for safety.

### F4 — Symptom 3 fix: SyncIndicator conflict pill has an exit
- Click on `state === 'conflict'` now calls `retryFailedHandler` (not the dead `resolveConflictHandler` that opens the muted modal).
- On retry, if VersionMismatch fires again, silently clear (last-write-wins-on-retry) and dispatch a Sentry capture. No user-visible loop.
- 2-line UI change + one engine policy decision.

### F5 — Symptom 4 fix: mid-edit text protection
- `pagehide` / `visibilitychange` listener on the focused `<input>` / `<textarea>` blurs it (forcing the cell's burst-flush + outbox enqueue) before unload.
- `whenEngineIdle()` waits for the post-blur outbox row as well, so the SW `controllerchange` reload coordination genuinely captures in-progress typing.
- ~15 LOC patch in `MobileRowCard` + `TextCell` plus the engine-side wait change.

### F6 — Decommission the dual-write bridge
- After Phase 4 readers are migrated, the `mirrorTracksToTopLevel` helper added in commit `4ee6e70` is deleted.
- `c9e92a5`'s SSR branching becomes dead code (only the top-level branch runs); remove the `serialized.hydrated === true ?` ternary.
- `useSetlistPerformance`'s embedded-array fallback dies in the same wave.

### F7 — Harness Fidelity Gate closure (resumes deferred v54-02-02)
- Install Java JDK 21 locally so `firebase emulators:start --only firestore` can run.
- Resume the v54-02-02 H-SL-7 regression canary test on the Firebase Local Emulator Suite (infra already shipped in `a693d23`).
- Pass the canary green; HFG counter resets to 0 of 3.
- This phase BLOCKS Wave 3 (engine-touching migration phases) — Wave 2's HFG closure must land before any phase touches engine seams or burns clause-(b) waivers.

### F8 — Cross-device library sync (folded in from v54-03)
- Extend the v54-01 one-shot `library_index → songs/*` bootstrap into a listener-driven continuous sync.
- Hooked into `/api/library/upload` and `/api/library/rename` write paths so new charts and renames propagate to `songs/*` cross-device without requiring a manual bootstrap rerun.
- Different data domain from the tracks migration; lands as its own phase after the migration spine is stable.

### F9 — Mobile AddBar variant (folded in from v5.4 deferral)
- Parallel-render the v53-03 polymorphic AddBar (split-button + 5 colored tiles) for mobile breakpoints (`<768px` or `(pointer:coarse)` per the existing density rules).
- Frontend phase; /ui-ux-pro-max BLOCKING gate; needs Daniel-loop UAT iteration.
- v53-03 Q1 originally surfaced this; deferred behind v5.4's other priorities; resurrected here so v6.0 leaves the mobile surface in the same shape as desktop.

### F10 — Browser-smoke acceptance per phase
- Each phase ships with a written browser-smoke checklist that Daniel runs against the deployed commit before marking the phase PENDING-UAT.
- Smoke covers (per phase, derived from F1-F9): delete persistence × 10 reloads, library-add visibility in editor + perform view + publish email + PDF, mid-edit deploy → typed text survives, induced conflict → pill clears silently within 10s, deleted setlist leaves zero orphan track docs, library renames propagate cross-device, mobile AddBar tiles render at correct touch targets.
- Browser smoke is mandatory; vitest green is necessary but not sufficient. This is the user's explicit fatigue-with-bandages discipline made permanent.

---

## Scope

**Suggested name:** v6.0 — Tracks Single-Source-of-Truth (locked per user decision)
**Estimated phases:** 10, organized in 4 waves
**Focus:** Finish the v50-05 tracks migration so every read and every write of "the live track list" routes through `tracks/{id}` only; close the two orthogonal UX bugs (stuck conflict pill + mid-edit text loss) that surfaced during the audit; satisfy the Harness Fidelity Gate; absorb the deferred v54-03 library sync + Mobile AddBar variant so v6.0 lands the app in a coherent end state.
**Theme:** *One source of truth, one read path, one write path — no more bandages on a half-migrated model, plus the orthogonal cleanups that have been waiting.*

---

## Phase Mapping (10 phases, 4 waves)

### Wave 1 — Orthogonal UX fixes (parallel-safe, ship first)

| Phase | Focus | Features | Notes |
|-------|-------|----------|-------|
| **v60-01** | Symptom 3 — SyncIndicator conflict click → retryFailedHandler + silent last-write-wins-on-retry | F4 | Truly orthogonal to migration. 2-line UI + small engine policy tweak. Ships first because it unblocks Daniel's testing of every subsequent phase. |
| **v60-02** | Symptom 4 — pagehide blur + whenEngineIdle wait | F5 | Orthogonal. ~15 LOC patch. Ships in parallel with v60-01. |

### Wave 2 — Harness Fidelity Gate closure (BLOCKING for Wave 3+)

| Phase | Focus | Features | Notes |
|-------|-------|----------|-------|
| **v60-03** | Install Java JDK 21 + ship the v54-02-02 H-SL-7 emulator canary | F7 | Resumes the BINDING deferral from the v5h3-01-04 postmortem. HFG counter resets to 0/3 on green canary. **No Wave 3 phase ships until this is green.** Human-action step for the Java install; per memory the Firebase CLI itself is automatable. |

### Wave 3 — Migration spine (sequential by dependency)

| Phase | Focus | Features | Notes |
|-------|-------|----------|-------|
| **v60-04** | Server-side reader migration | F1 | One commit per route: `getTracksForSetlist` helper / publish / print-personal / print-public / email-packets / resend-email / scheduling-assign / new-song-detector. Each ≤30 LOC net. Server-only — no client touches; no HFG exposure even though Wave 2 is closed. |
| **v60-05** | Editor + perform-view reader migration | F1 | SetlistDrawer playback queue switches to top-level sub; `useSetlistPerformance` embedded fallback removed. Highest-stakes client phase — live performance surface. HFG counter exercise: should be 0/3 after Wave 2, so this phase touches engine seams cleanly without burning a waiver. |
| **v60-06** | Dashboard reader migration + 15-setlist backfill | F1, F3 | Dashboard cards keep using `trackCount` field; substrate search-by-track-title intentionally drops during this window (per locked decision #2). Backfill script + DRY-RUN against production. |
| **v60-07** | Embedded-array writer removal + immediate FieldValue.delete strip | F2 | W1 createSetlist / W3-W6 duplicate-clone-template / W7 import-execute / W11 delete-cascade. THEN the backfill script's strip-pass. **Delete pass runs only after every reader is migrated** — preserves the rollback path through v60-06. |
| **v60-08** | Migration cleanup | F6 | Delete `mirrorTracksToTopLevel`, drop `tracks` from `setlistConverter`, drop SSR ternary in `page.tsx`. Schema is now single-source. Pattern-locking commit. |

### Wave 4 — Folded-in v5.4 deferrals (parallel-safe after Wave 3)

| Phase | Focus | Features | Notes |
|-------|-------|----------|-------|
| **v60-09** | Cross-device library sync (`library_index ↔ songs/*` continuous) | F8 | Extends v54-01 one-shot bootstrap into listener-driven sync. Different data domain from tracks migration; ships after Wave 3 stabilizes. |
| **v60-10** | Mobile AddBar variant | F9 | Parallel-render v53-03 split-button + 5-tile popover for mobile breakpoints. /ui-ux-pro-max BLOCKING. Frontend UAT iteration expected. |

All phases ship under standard PAUL discipline (research → plan → apply → verify) with per-phase HUMAN-VERIFY checkpoints. F10's browser-smoke checklist becomes the AC-N row in each phase's PLAN.md.

---

## Constraints

- **No engine touches in v60-01/02/04.** The state machine, snapshot listener, outbox lifecycle, and per-doc serialization are off-limits in Wave 1 and Wave 3-Phase-1 (server-only). Engine seam re-opens at v60-05.
- **Wave 2 is BLOCKING for Wave 3 engine phases.** v60-03 (Java install + emulator canary) must close before v60-05 starts. v60-04 can proceed in parallel because it's server-only.
- **≤30 LOC net per commit in v60-04.** Reader migration commits are pure swaps from `setlist.tracks` to `getTracksForSetlist(db, setlistId)`. Anything bigger is a sign the helper isn't right.
- **Each commit independently revertible.** No commit depends on the previous commit in a way that requires a revert-revert. v60-07's strip is the only commit where revert means re-running backfill in reverse — and the `migration_snapshots/` collection makes that mechanically possible.
- **Browser smoke before phase close.** Per the user's explicit fatigue-with-bandages: vitest green is necessary but not sufficient. Each phase ships with a Daniel-runs-this-in-Safari checklist (F10). No phase closes PENDING-UAT without smoke executed.
- **Harness Fidelity Gate counter starts at 1/3 (clause-(b) waiver from v53-02).** v60-03 closes the gate → counter resets to 0/3 before Wave 3 client phases begin. Wave 3 should consume ZERO waivers if v60-03 lands clean.
- **No preview branches.** Per user instruction. Every phase pushes to master and deploys to production.
- **Friday/Shabbat cadence respected.** Phase commits land Sunday through Thursday. No risky deploys after Thursday afternoon until Sunday — Daniel needs publish/print/email functional for the worship cycle.
- **Backfill scope: 15 most-recent setlists only** (locked decision #3). Older setlists do not get top-level docs; the new-song-detector (R9) treats those setlists as "no tracks known" — acceptable per audit.
- **Embedded array is stripped, not frozen** (locked decision #5). FieldValue.delete fires in the same v60-07 pass. `migration_snapshots/` preserves rollback.
- **Conflict retry is silent last-write-wins** (locked decision #4). Sentry capture for visibility, no user-facing modal or banner. Sole-admin app; true two-writer conflicts are essentially impossible.
- **Dashboard search-by-track-title acceptably degrades** during v60-06 → v60-08 window (locked decision #2). Comes back via Dexie scan in v60-08 cleanup or a follow-up.

---

## Additional Context

### Predecessor milestone close (v5.4 — Hotfix + Harness Fidelity)

v5.4 closes via `/paul:complete-milestone` BEFORE v6.0 opens. Closure scope:

- **Archive as shipped:** v54-01 (picker bootstrap + thead hotfix at `a693d23`) and v54-01-02 (perform-view fix-up at `6735f48`). PENDING-UAT for both clears with the upcoming Daniel-loop worship cycle.
- **Archive as shipped (infra):** v54-02-01 (Firebase Local Emulator Suite infra + build-info cleanup, pending push at v5.4 close time).
- **Fold-forward, NOT cancel:** v54-02-02 (emulator canary) → v60-03 in v6.0. v54-03 (cross-device library sync) → v60-09 in v6.0. Mobile AddBar variant → v60-10 in v6.0.

This preserves the discipline of "every milestone closes" while honoring the reconciliation decision that the deferred work belongs in v6.0 alongside the migration.

### Patterns this milestone will exercise

- **One-helper-per-source-of-truth migration.** `getTracksForSetlist` is the canonical abstraction; every reader migrates through it, never directly to the underlying query. Pattern reusable for the eventual Y.js pivot.
- **Strip-after-readers-migrate sequencing.** The embedded-array strip happens AFTER every reader is off it, not before, not in parallel. Inverse of the v50-05 cutover sequence (which started writes-first and never finished reads).
- **`migration_snapshots/` rollback collection.** Before any destructive change, snapshot. Future cutovers (Y.js) reuse this pattern.
- **Browser-smoke acceptance criteria.** Per the user's fatigue with bandages, vitest green is necessary but not sufficient. Each AC line is something Daniel runs in Safari on a real setlist before phase-close.
- **Silent-resolution policy for sole-admin apps.** v60-01's conflict-retry-silent-clear formalizes "if you're the only user, surface conflicts as Sentry captures, not modals."
- **Wave-gated phase ordering.** Wave 2 BLOCKS Wave 3 engine phases via the HFG closure. Future milestones with engine-seam work can reuse this gating pattern.
- **Fold-forward of deferred phases on milestone reconciliation.** When a new master plan supersedes an in-progress milestone, deferred-but-relevant phases get explicit fold-forward labels in the new milestone's PROJECT.md update rather than living-but-orphaned in the old milestone's deferred bucket.

### Decisions already locked (do NOT re-litigate during /paul:milestone)

| # | Decision | Source |
|---|---|---|
| 1 | Mid-edit text protection ships in parallel with the migration (Wave 1) | User answer to design-doc OQ #1 |
| 2 | Dashboard search-by-track-title acceptably degrades during the migration window | User answer to design-doc OQ #2 |
| 3 | Backfill scope = 15 most-recent setlists only | User answer to design-doc OQ #3 |
| 4 | Conflict retry → silent last-write-wins + Sentry capture | User answer to design-doc OQ #4 |
| 5 | Embedded `tracks` field stripped immediately (no freeze period) | User answer to design-doc OQ #5 |
| 6 | Option A (finish migration), NOT Option B (rollback) | Recommendation in `TRACKS-MIGRATION-AUDIT-2026-05-12.md` |
| 7 | Top-level `tracks/{id}` becomes the single source of truth | Derived from #6 |
| 8 | Per-phase browser-smoke testing is mandatory for phase close | User instruction this session — "stop with the bandaids" |
| 9 | v5.4 closes cleanly via /paul:complete-milestone first | User answer to reconciliation Q1 |
| 10 | Java JDK 21 installs, v54-02-02 emulator canary ships before Wave 3 engine phases | User answer to reconciliation Q2 |
| 11 | v54-03 cross-device library sync + Mobile AddBar variant fold INTO v6.0 (not deferred to v6.1) | User answer to reconciliation Q3 |
| 12 | Milestone is v6.0 (major version bump), not v5.5 | User answer to reconciliation Q4 |

### Out of scope

- **Tier 3 Y.js pivot.** Stays on its own track. v6.0 is the prerequisite, not a substitute. Y.js will rewrite `applyEdit` and the engine; v6.0 just gets the data model into the shape Y.js expects (per-doc tracks). Y.js pivot becomes v7.0 when it ships.
- **Admin Templates UI (R13) and admin matrix UI (R12).** Out of scope per project memory (admin panels left unstyled).
- **A user-facing "Discard local edit" affordance for failed/conflict rows.** Not needed under decision #4; surfaces only if Sentry shows recurring conflicts (extremely unlikely for sole admin).
- **Backfill of historical setlists older than top-15.** Per decision #3.
- **Re-printing / re-publishing already-sent gig packets after migration.** If any historical email/PDF needs to be regenerated post-migration, it's a manual re-send via the existing UI — not a v6.0 phase.

---

## Open questions for /paul:milestone

These are sequencing details the milestone command may want to confirm; not blocking decisions.

1. **First commit timing:** Daniel's worship cycle is Friday evening + Shabbat morning. Target Monday for the first commit (v60-01 — SyncIndicator click rewire)? That gives the full week for v60-02 + v60-03 + v60-04 server migrations before the next worship cycle.
2. **Backfill DRY-RUN gate:** the v60-06 backfill script should run with `--dry-run` first, output diff to Daniel, then `--apply` only after Daniel reviews. Confirm this is the cadence (matches v54-01-01 bootstrap precedent).
3. **v60-07 timing:** the embedded-array strip is irreversible without invoking the `migration_snapshots/` collection. Confirm this lands as a single phase (writers + strip) and not as v60-07a writers + v60-07b strip with a gating UAT in between.
4. **v60-03 Java install:** is this a fully-attended human-action step (Daniel runs `winget install Microsoft.OpenJDK.21` with admin rights), or does the milestone PLAN.md treat the install as out-of-band-prerequisite and start v60-03 from "Java is installed, run the canary"?
5. **v60-10 sequencing within Wave 4:** v60-09 + v60-10 can run in either order. v60-10 (Mobile AddBar) needs /ui-ux-pro-max consultation; v60-09 (library sync) needs Firebase emulator green. Preference for which ships first, or let plan-time research decide?

---

*This file is temporary. It will be deleted after `/paul:milestone` creates the milestone.*
