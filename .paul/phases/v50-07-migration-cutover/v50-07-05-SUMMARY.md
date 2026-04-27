---
phase: v50-07-migration-cutover
plan: 05
subsystem: observability
tags: [sentry, observability, alerts, uat, ship-checklist, monitoring, dexie, sync-engine]

requires:
  - phase: v1.5
    provides: Sentry SDK wired (conditional withSentryConfig + dynamic import in sentry.client.config.ts) — captureException callable from anywhere in v5.0 substrate
  - phase: v50-03
    provides: engine.ts dead-letter transition path (5-attempt MAX_ATTEMPTS) — capture site #2
  - phase: v50-06-03
    provides: snapshot-listener.ts 4 silent-error sites — capture sites #3-6
  - phase: v50-07-03
    provides: SetlistGridHydrator lazy-hydration catch block — capture site #1

provides:
  - src/lib/sync/sentry-capture.ts: thin captureSyncFailure helper centralizing tag/level/extra across all v5.0 substrate captures
  - 6 Sentry capture sites wired (lazy-hydration + dead-letter + 4 snapshot-listener swallow sites)
  - 6 unit tests proving tag string-coercion, level mapping, and Sentry-throws-don't-crash-engine contract
  - .paul/phases/v50-07-migration-cutover/v50-07-05-UAT-PLAN.md: 15-item Day-1 smoke + 7 weekly-workflow scenarios + coverage map
  - .paul/phases/v50-07-migration-cutover/v50-07-05-SHIP-CHECKLIST.md: 8-step deploy verification + 1-page band onboarding doc + first-week Sentry monitoring playbook with rollback procedure
  - Production deploy with new Sentry instrumentation (Vercel auto-deployed on push)

affects:
  - v5.0 milestone close — gate condition: UAT execution success post-plan
  - v5.1 (or v5.0 hotfix if needed) — UAT outcomes drive any follow-up work; band onboarding doc should migrate to a public help system in v5.1
  - First-week production monitoring — Sentry dashboard alert rules user-configured against the 4 documented feature tags (lazy-hydration, dead-letter, snapshot-listener, write-atomicity)

tech-stack:
  added: []  # no new deps; @sentry/nextjs already in package.json from v1.5 P6
  patterns:
    - "Centralized capture wrapper (captureSyncFailure) over direct Sentry.captureException calls — enforces tag/level/extra consistency across all silent-failure sites"
    - "Tag string-coercion at the wrapper layer (Sentry's tag indexer requires strings; numbers and undefineds handled here so call sites don't repeat the dance)"
    - "Telemetry try/catches its own SDK calls — sync engine MUST NOT crash because Sentry is uninitialized or throwing"
    - "Per-feature non-capture discipline ('conflict' state, per-attempt drains, payload contents) — alert-fatigue prevention + PII discipline"

key-files:
  created:
    - src/lib/sync/sentry-capture.ts (~70 LOC including types + comments)
    - src/lib/sync/__tests__/sentry-capture.test.ts (~120 LOC; 6 cases)
    - .paul/phases/v50-07-migration-cutover/v50-07-05-UAT-PLAN.md
    - .paul/phases/v50-07-migration-cutover/v50-07-05-SHIP-CHECKLIST.md
  modified:
    - src/components/setlist/grid/SetlistGridHydrator.tsx (+1 import + 1 capture call after the existing logger.warn)
    - src/lib/sync/engine.ts (+1 import + 1 capture call BEFORE existing dispatch('DRAIN_BUDGET_EXHAUSTED'))
    - src/lib/sync/snapshot-listener.ts (+1 import + 4 capture calls after the existing logger.warn calls)

key-decisions:
  - "Centralize via captureSyncFailure wrapper rather than calling Sentry.captureException at each site directly. Tag/level/extra shape would drift across 6+ sites otherwise. ~70 LOC of helper + types beats 6 copy-pastes that each subtly diverge in tag spelling or level convention."
  - "Tag values are string-coerced inside the helper. Sentry's tag indexer requires strings; numbers like attempts:5 must become '5' for filter dropdowns to work. Call sites pass natural types; the wrapper handles coercion."
  - "Telemetry wraps its own SDK calls in try/catch. The engine MUST NOT crash because Sentry is uninitialized (in tests, when DSN env is absent) or because the SDK throws on transport failure. Test 'Sentry throws → captureSyncFailure swallows' asserts this contract."
  - "Capture on dead-letter transition (5th attempt → 'failed' status), NOT on every retry attempt. Per-attempt would alert-fatigue. The dead-letter signal IS the user-visible failure (their edit didn't land at all after retries)."
  - "Do NOT capture 'conflict' state transitions. Conflict is a user-facing UX condition (reconciliation modal opens), not a backend failure. The reconciliation modal IS the response."
  - "Do NOT capture payload contents (user-authored notes, song titles). Only stable identifiers (setlistId, docId, op) reach Sentry. PII discipline."
  - "UAT plan + ship checklist live in .paul/phases/ for v5.0 milestone close. Band onboarding doc explicitly notes 'Move to public help system in v5.1' — drafted in .paul/ for completeness, will relocate when a public help system exists."
  - "Ship checklist uses tag → meaning → severity → response table format for the monitoring playbook. The user (Daniel) wires Sentry alerting rules in the dashboard UI against the documented feature tags; the plan does NOT configure those rules itself (out-of-process, dashboard work)."
  - "Sentry SDK's dynamic import (per v1.5 P6) means there's a ~500ms window at boot where captures may not flow. Acceptable per the same v1.5 decision; the helper's try/catch swallow handles the case where Sentry isn't initialized yet."

patterns-established:
  - "captureSyncFailure(err, context) wrapper for all v5.0 substrate Sentry captures — single source of truth for tag/level/extra shape"
  - "Sentry capture goes BEFORE engine state dispatches (not after) — captures the error context with the row state intact"
  - "Sentry capture goes AFTER logger.warn (not before, not replacing) — preserves dev console behavior for local debugging"
  - "Per-feature non-capture discipline documented in PLAN boundaries — conflict state, per-attempt drains, payload contents are explicitly NOT captured"
  - "First-week monitoring playbook format: alert tag → meaning → severity → response table + recommended dashboard saved-view filter + rollback procedure"

duration: ~50min
started: 2026-04-27T15:00:00Z
completed: 2026-04-27T15:50:00Z
---

# Phase v50-07 Plan 05: Sentry Alarms + UAT Plan + Ship Checklist Summary

**FINAL plan in v50-07 + v5.0 milestone. Ships Sentry observability via a centralized captureSyncFailure helper wired at 6 silent-failure sites in the v5.0 sync substrate (lazy-hydration + dead-letter + 4 snapshot-listener sites), plus a UAT test plan (15-item smoke + 7 weekly-workflow scenarios) and a ship checklist (deploy verification + 1-page band onboarding + first-week monitoring playbook). Pushed to production. v5.0 milestone close gated on Rabbi Daniel + one band member executing UAT post-plan.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~50 min |
| Started | 2026-04-27T15:00:00Z |
| Completed | 2026-04-27T15:50:00Z |
| Tasks | 3 of 3 completed |
| Files modified/created | 7 (3 src + 1 test + 2 docs + 1 schema) |
| New tests | +6 (sentry-capture cases) |
| Suite | 1474 / 1474 passing (+6 from 1468) |
| Commits | 3 (PLAN + APPLY feat + STATE chore; UNIFY close lands next) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Sentry-capture helper centralizes the capture pattern | Pass | New `src/lib/sync/sentry-capture.ts` exports `captureSyncFailure(err, context)` with try/catch around the SDK call, level mapping (dead-letter + write-atomicity → error; lazy-hydration + snapshot-listener → warning), and tag string-coercion. 6 unit tests prove all properties. |
| AC-2: Lazy-hydration fan-out failures reach Sentry | Pass | Capture call added after the existing `logger.warn` in SetlistGridHydrator's lazy-hydration catch block; passes setlistId + trackCount; logger.warn preserved (dev console behavior unchanged); catch still doesn't re-throw. |
| AC-3: Dead-letter transitions reach Sentry | Pass | Capture call added BEFORE the existing `dispatch('DRAIN_BUDGET_EXHAUSTED')` in engine.ts; passes collection + docId + op + attempts; row update + dispatch behavior unchanged. |
| AC-4: Snapshot listener errors reach Sentry across all 4 sites | Pass | Capture calls added after each of the 4 `logger.warn` calls in snapshot-listener.ts (setlist-apply / tracks-apply / setlist-subscribe / tracks-subscribe); each tagged with the corresponding `site` string; no-throw-out-of-callback contract preserved. |
| AC-5: UAT test plan covers weekly workflow scenarios | Pass | UAT-PLAN.md ships at the expected path with 15-item smoke checklist + 7 scenarios (1 clone+tweak; 2 add new song; 3 bind chart; 4 transpose perf-view; 5 mobile flow; 6 historical legacy lazy-hydration; 7 cross-leader race) + per-scenario format setup/steps/expected/pass/if-fail + coverage map mapping each scenario to the v50-XX phase + invariant it validates + out-of-scope section folding in deferred-smokes #4 + #7. |
| AC-6: Ship checklist + onboarding + monitoring playbook ship | Pass | SHIP-CHECKLIST.md ships at the expected path with all 3 sections: 8-step deploy verification, 1-page band onboarding doc (plain English, sync indicator states named in user terms), first-week Sentry monitoring playbook (alert tag → meaning → severity → response table + dashboard saved-view recommendation + rollback procedure). Includes a placeholder row for `feature:write-atomicity` (currently NOT wired — future capture site). |
| AC-7: All existing tests still pass + sentry-capture coverage | Pass | 1474/1474 (+6 from 1468 baseline). tsc --noEmit clean. next build clean. Pre-existing v50-06 + v50-07-04 substrate tests + SetlistGridHydrator + snapshot-listener tests all unchanged + green. |
| AC-8: Pushed to production | Pass | Commits 9987bc5 + bdd0e1b pushed `b2cbb16..bdd0e1b master -> master`; Vercel auto-deploys. Sentry tags become filterable in dashboard after first prod capture (or via saved-view dropdown facets earlier). |

## Accomplishments

- **Bulletproof loop becomes observable in production.** v50-04 + v50-06 + v50-07-04 prove invariants AT THE TEST LAYER. v50-07-05 turns that into a measurable property in production: if a failure mode fires, we see it in minutes; if Sentry is quiet for a week, the loop is whole. The user (Daniel) wires alert rules in the Sentry dashboard against the documented feature tags.
- **6 silent-failure sites instrumented.** Lazy-hydration cascade failures (warning), dead-letter rows (error), and the 4 snapshot-listener swallow paths (warning) all flow to Sentry with consistent tag shapes, levels, and extra context. Telemetry NEVER crashes the engine — the wrapper try/catches its own SDK calls.
- **UAT plan + ship checklist + onboarding doc + monitoring playbook all ship.** UAT execution itself is post-plan (Rabbi Daniel + one band member over 1–2 weekly cycles); v5.0 milestone close fires after UAT succeeds via `/paul:audit-milestone`. Until then, milestone is PENDING-UAT.
- **Per-feature non-capture discipline documented.** 'conflict' state transitions (UX, not failure), per-attempt drains (alert-fatigue), and payload contents (PII) are explicitly NOT captured — both the plan boundaries AND the monitoring playbook tell future-Daniel why these are absent so he doesn't go hunting.

## Task Commits

This plan landed as 3 commits + the UNIFY close lands next.

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Plan checkpoint | `b2cbb16` | chore | v50-07-05 PLAN — Sentry alarms + UAT prep + ship-to-band |
| Tasks 1+2+3 (cohesive vertical slice) | `9987bc5` | feat | Sentry alarms + UAT plan + ship checklist (sentry-capture helper + 6 wired sites + 6 unit tests + UAT-PLAN.md + SHIP-CHECKLIST.md) |
| APPLY ✓ STATE update | `bdd0e1b` | chore | STATE update before UNIFY |
| UNIFY close (this) + transition | _pending_ | chore | v50-07-05 SUMMARY + STATE/ROADMAP/PROJECT — phase v50-07 COMPLETE; v5.0 milestone PENDING-UAT |

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/lib/sync/sentry-capture.ts` | Created | captureSyncFailure(err, context) wrapper — single source of truth for tag/level/extra shape across all v5.0 substrate captures |
| `src/lib/sync/__tests__/sentry-capture.test.ts` | Created | 6 unit cases: dead-letter level=error + tag string-coercion + extra; lazy-hydration level=warning; snapshot-listener level=warning + site tag; write-atomicity level=error; Sentry-throws-doesn't-crash; undefined fields dropped from tags |
| `src/components/setlist/grid/SetlistGridHydrator.tsx` | Modified | +1 import + 1 capture call after existing logger.warn in lazy-hydration catch (passes setlistId + trackCount; warning level) |
| `src/lib/sync/engine.ts` | Modified | +1 import + 1 capture call BEFORE existing dispatch('DRAIN_BUDGET_EXHAUSTED') at the dead-letter transition (passes collection + docId + op + attempts; error level) |
| `src/lib/sync/snapshot-listener.ts` | Modified | +1 import + 4 capture calls after existing logger.warn calls (sites: setlist-apply / tracks-apply / setlist-subscribe / tracks-subscribe; warning level; setlistId in context) |
| `.paul/phases/v50-07-migration-cutover/v50-07-05-UAT-PLAN.md` | Created | 15-item smoke checklist + 7 weekly-workflow scenarios + coverage map + out-of-scope section |
| `.paul/phases/v50-07-migration-cutover/v50-07-05-SHIP-CHECKLIST.md` | Created | 8-step deploy verification + 1-page band onboarding doc + first-week Sentry monitoring playbook with rollback procedure |
| `.paul/STATE.md` | Modified | Loop position v50-07-05 → APPLY ✓ then UNIFY ✓; transition to phase v50-07 COMPLETE; milestone PENDING-UAT |
| `.paul/ROADMAP.md` | Modified | v50-07 status row 5/5 ✅; v50-07-05 ✓ entry; v5.0 milestone marked PENDING-UAT (not 100%) |
| `.paul/PROJECT.md` | Modified | v50-07 phase moved from "Active" to "Validated (Shipped this cycle)"; v5.0 milestone status updated to PENDING-UAT |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Centralize captures via captureSyncFailure helper | Tag/level/extra shape would drift across 6+ direct call sites otherwise; ~70 LOC of helper + types beats 6 copy-pastes that subtly diverge | Single source of truth; enforced via 6 unit tests |
| Tag values string-coerced inside the helper | Sentry's tag indexer requires strings; call sites pass natural types (numbers like attempts:5) and the wrapper handles coercion | Filter dropdowns in the Sentry dashboard work correctly without per-site discipline |
| Telemetry wraps its own Sentry calls in try/catch | The engine MUST NOT crash because Sentry is uninitialized or transport-failed; "Sentry throws → captureSyncFailure swallows" is asserted by a unit test | Telemetry failures are silent + bounded; engine + UI keep working |
| Capture on dead-letter transition (5th attempt → 'failed'), NOT on every retry | Per-attempt would alert-fatigue (transient errors are normal); dead-letter is the user-visible "your edit didn't land" signal | Sentry dashboard stays signal, not noise |
| Do NOT capture 'conflict' state transitions | Conflict is user-facing UX (reconciliation modal opens), not a backend failure; the modal IS the response | No false-alarm pages on legitimate two-writer races |
| Do NOT capture payload contents | Stable identifiers only (setlistId/docId/op); user-authored notes + song titles are PII | PII discipline preserved across the v5.0 substrate |
| UAT plan + ship checklist live in .paul/phases/ for milestone close | Drafted as completion artifacts for v5.0; band onboarding doc explicitly noted "Move to public help system in v5.1" | Captured for milestone audit; future migration path documented |
| Ship checklist uses tag → meaning → severity → response table for the monitoring playbook | Recognizable runbook format; user (Daniel) wires Sentry alerting rules in the dashboard UI from the documented tags | Plan does not configure dashboard rules (out-of-process) — table tells the user what to configure |
| Plan does NOT close v5.0 milestone — gates on UAT | The user's bar is "bulletproof and easy and intuitive before onboarding the band"; UAT proves the latter; milestone close requires both | Milestone marked PENDING-UAT after this plan; closes via /paul:audit-milestone post-UAT |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 0 | None — plan executed exactly as written |
| Scope additions | 0 | None |
| Deferred | 0 | None |

**Total impact:** Plan executed exactly as written. Zero deviations. The mid-build experience contrasts cleanly with v50-07-04's runaway counterexample — observability + docs work has a much narrower failure surface than property-test + chaos.

### Auto-fixed Issues

None.

### Deferred Items

None.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Memory rule "never use local dev server" prevents running Playwright locally | Per v50-07-04 precedent: skipped local Playwright run; CI exercises existing smoke spec on push (no new spec added by this plan; the lazy-hydration cascade is exercised by the v50-07-04 kitchen-sink at the harness layer, validated end-to-end via UAT scenario 6 post-plan). No AC verification path lost. |

## Skill Audit (v50-07-05)

| Expected | Invoked | Notes |
|----------|---------|-------|
| /ui-ux-pro-max | not required | SPECIAL-FLOWS.md gates on "any phase that touches frontend UI/UX". v50-07-05 modifies (a) sync-substrate observability wiring (Sentry SDK calls in engine + listener + hydrator catch blocks; no visible component changes), and (b) markdown documentation. No production component, style, or user-facing visual behavior changed. Same precedent as v50-06-01 + v50-07-02 + v50-07-04. |

All required skills invoked ✓ (none required for this plan).

## Verification Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit -p tsconfig.json` | Clean |
| `npx vitest run` | 1474 / 1474 passing in 51.18s wall; +6 new sentry-capture cases vs. 1468 baseline; zero regressions |
| `npx vitest run src/lib/sync/__tests__/sentry-capture.test.ts` | 6 / 6 in <1s |
| `npx next build` | Clean |
| `npx playwright test` | Not run locally (memory rule). CI runs existing smoke spec on push. |
| Commit + push | `9987bc5` + `bdd0e1b` pushed `b2cbb16..bdd0e1b master -> master` (Vercel auto-deploys) |

## Phase v50-07 Closeout (5 of 5 plans complete)

| Plan | Outcome | Commit |
|------|---------|--------|
| v50-07-01 | Production audit + dry-run report (29 setlists; 24 with embedded tracks; 0 songIds; pre-existing MARKER_PATH bug discovered) | `a82affb` |
| v50-07-02 | MARKER_PATH patch + liveState scrub (10 setlists' liveState removed; rollback snapshots) | `db00d61` |
| v50-07-03 | Lazy hydration in SetlistGridHydrator + perf-view dual-read (Option C Hybrid; 24 legacy setlists migrate on first edit-open) | `60de2ff` |
| v50-07-04 | Kitchen-sink fast-check property + OfflineToggleAdapter lift (50 CI iterations; 4 invariants; harness-only path per Task 0 decision) | `47ae779` |
| v50-07-05 | Sentry alarms + UAT plan + ship checklist (this plan; 6 capture sites + UAT-PLAN.md + SHIP-CHECKLIST.md; pushed to prod) | `9987bc5` |

**Phase v50-07 net delivery:**
- New code: ~+750 LOC (audit script + scrub script + lazy-hydration + perf-view dual-read + kitchen-sink describe + sentry-capture + capture sites + 2 docs)
- New tests: +52 (lazy-hydration coverage + perf-view coverage + scrub-livestate + kitchen-sink + sentry-capture)
- Suite delta: 1442 → 1474 (+32; some replaced existing dead-letter unit tests)
- Production data shape: 24 legacy setlists primed for lazy-migration; liveState scrubbed from 10; songs/tracks collections ready to populate as the editor uses them
- Sentry observability: 6 silent-failure sites instrumented with consistent tag/level/extra
- Documentation: UAT plan + ship checklist drafted for milestone close

## Next Phase Readiness

**Ready (v5.0 milestone close path):**
- Production deploy with v5.0 substrate + sentry instrumentation is live.
- UAT-PLAN.md ready for Rabbi Daniel + one band member to execute over 1–2 weekly worship cycles.
- SHIP-CHECKLIST.md Section 1 ready to walk through within 10 minutes of the v50-07-05 deploy.
- SHIP-CHECKLIST.md Section 2 (band onboarding) can be shared with Rabbi when the band is brought in.
- SHIP-CHECKLIST.md Section 3 (monitoring playbook) ready for Daniel to use as his Week 1 Sentry response runbook.
- After UAT succeeds + any hotfix plans land: run `/paul:audit-milestone` (or `/paul:plan-milestone-gaps` if available) to verify v5.0 scope was fully delivered, then close v5.0.

**Concerns:**
- UAT may surface real-world scenarios the harness didn't model (e.g., a specific legacy setlist with malformed embedded track data that triggers `feature:lazy-hydration` warnings repeatedly). Hotfix plan ready to absorb if needed.
- The single-writer offline self-conflict gap from v50-06-03 Block B SUMMARY is still parked. UAT scenario 5 (mobile) may surface it under realistic flaky-wifi conditions; if so, additive plan ships in v5.1.
- Songs/* still empty in production; songId still missing on legacy tracks. Sticky-memory benefits only kick in for songs the v5.0 editor explicitly creates from now on. UAT scenario 3 (bind chart) is the propagation test — the FIRST chart-bind will start populating songs/{id}.

**Blockers:**
- None. v5.0 milestone close is single-step away post-UAT.

---
*Phase: v50-07-migration-cutover, Plan: 05*
*Completed: 2026-04-27*
*PHASE v50-07 COMPLETE — final plan in v5.0 milestone; milestone PENDING-UAT*
