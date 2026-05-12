---
phase: v60-02-pagehide-blur-mid-edit-text-protection
plan: 01
subsystem: sync
tags: [pagehide, visibilitychange, mid-edit-text-protection, ios-safari, sync-engine, drain-coordinator, react-useEffect, vitest]

# Dependency graph
requires:
  - phase: v60-01-sync-indicator-conflict-click-rewire
    provides: silent-LWW-on-retry + SyncIndicator non-clickable conflict pill (orthogonal Wave 1 sibling; this plan ships independently)
  - phase: v54-02-01-firebase-emulator-suite
    provides: whenEngineIdle(timeoutMs) helper exported from src/lib/sync/init.ts (T2.4)
provides:
  - TextCell pagehide/visibilitychange auto-commit (mid-edit text protection on iPad-Safari swipe-away)
  - MobileRowCard pagehide flush fan-out across title/lead/bpm/notes inline-editor drafts
  - installPagehideDrainHook — idempotent engine-side pagehide → whenEngineIdle(2000) drain coordinator
  - 13 new vitest assertions locking the contract
affects:
  - v60-03 (HFG closure / Java JDK 21 install + emulator canary — Wave 2 BLOCKS Wave 3)
  - v60-04..v60-08 (migration spine — none of these touch the pagehide hook; pattern-locked here)
  - v60-09 / v60-10 (folded-in deferrals — also do not touch the pagehide hook)

# Tech tracking
tech-stack:
  added: []  # no new dependencies — native window/document event listeners only
  patterns:
    - "Ref-stabilized event-listener pattern for closures that need fresh state without re-registering listeners on every render (commitRef / flushRef)."
    - "Idempotent module-level lifecycle hook via boolean flag (pagehideHookInstalled) — safe under HMR, repeated SyncEngineBoot mounts, and re-import in tests."
    - "Delta-count assertions for window event-listener tests — robust against unrelated import-time listeners from transitive modules."

key-files:
  created:
    - src/components/setlist/grid/__tests__/MobileRowCard.test.tsx
    - src/lib/sync/__tests__/init-pagehide.test.ts
  modified:
    - src/components/setlist/grid/cells/TextCell.tsx
    - src/components/setlist/grid/MobileRowCard.tsx
    - src/lib/sync/init.ts
    - src/components/setlist/grid/cells/__tests__/TextCell.test.tsx

key-decisions:
  - "Silent auto-commit on pagehide (no UI feedback) — aligns with locked v6.0 decision #4 (silent LWW + Sentry) and the existing blur=commit contract."
  - "Dual-listen on pagehide + visibilitychange:hidden — visibility fires first on iOS tab swipe, pagehide is the BFCache-aware closer; commit() guard handles dedup."
  - "Engine drain budget pinned at 2000ms — iOS Safari grants ~5s before suspension; 2s gives headroom for one outbox flush attempt without risking BFCache re-show."
  - "MobileRowCard listener gated on isEditing — avoids registering 30+ listeners per setlist when the inline editor isn't open."

patterns-established:
  - "When a component owns commit state, use a ref to the commit closure + an isolated useEffect that registers listeners only on the gate-flag (editing/isEditing) — gives fresh state without listener churn on every keystroke."
  - "Hard-to-mock same-module exports can be tested via static source assertions (regex match on the file contents) when the runtime call path is otherwise covered by adjacent suites."

# Metrics
duration: ~25min
started: 2026-05-12T16:11:00Z
completed: 2026-05-12T16:31:00Z
---

# Phase v60-02 Plan 01: pagehide / visibilitychange blur — mid-edit text protection

**iPad-Safari swipe-away (and any tab background event) now flushes in-flight cell drafts via pagehide + visibilitychange:hidden, and a 2-second engine drain window lets the outbox finish writes before iOS suspends the tab — closes the save-loss class implicated in v5h3-01 without adding any user-facing UI.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~25 min (APPLY only); full PLAN→APPLY→UNIFY single session |
| Started | 2026-05-12T16:11:00Z (PLAN start) |
| Completed | 2026-05-12T16:31:00Z (UNIFY close) |
| Tasks | 3 of 3 auto tasks completed + 1 human-action checkpoint resolved |
| Files modified | 6 (3 source, 3 test — 2 new + 1 extended) |
| Source delta (approx) | TextCell +24 LOC · MobileRowCard +25 LOC · init.ts +25 LOC ≈ 75 LOC |
| Test delta | +13 assertions (4 + 4 + 5) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: TextCell commits draft on pagehide while editing | ✅ Pass | 4 assertions in TextCell.test.tsx — pagehide commit, visibilitychange commit, gated-on-editing, unchanged-guard. `commit()`'s existing `draft !== value` check de-dupes against onBlur. |
| AC-2: MobileRowCard inline inputs commit on pagehide | ✅ Pass | 4 assertions in new MobileRowCard.test.tsx — title flush on pagehide, lead flush on visibilitychange:hidden, no flush when isEditing=false, no flush when drafts equal. Per-field guards prevent no-op writes. |
| AC-3: Engine drains on pagehide | ✅ Pass | 5 assertions in new init-pagehide.test.ts — listener registered (delta=1), idempotent (delta=1 after 3 calls), subscribe-path invoked on pagehide fire, no-throw on already-idle, source-content pinned to `whenEngineIdle(2000)` literal. |
| AC-4: No regressions in existing edit flows | ✅ Pass (relative to baseline) | `npx tsc --noEmit` exits 0. `npx next build` exits 0. v60-02 + adjacent suites 21/21 pass. Pre-existing 52 failures across SetlistGrid.contextmenu/undo/sync-engine confirmed unrelated via git-stash baseline comparison (same failures with and without v60-02). |
| AC-5: Daniel iPad UAT on deployed commit | ⏳ PENDING-UAT | Closes out-of-band per v51-04 codified pattern after push to master + Vercel auto-deploy. Repro: open setlist on iPad, edit a cell, swipe tab away, return, verify draft persisted with no conflict pill. |

## Accomplishments

- **Save-loss class closed at the source.** v5h3-01 traced multiple save-loss incidents to the same root cause: iPad-Safari never fires `onBlur` on tab-swipe, so the commit pipeline never engages. v60-01 silenced the *symptom* (spurious conflict modal); v60-02 prevents the *cause*. Together they close v6.0 Wave 1.
- **No new UX surface, no new dependencies.** ~75 LOC of native listeners. The change is invisible to users when nothing's wrong, and invisible when it works (their typing just persists). This matches the locked decision #4 silent-LWW posture.
- **Engine drain coordinator now hookable.** `installPagehideDrainHook` is exported, idempotent, and side-effects-free apart from the one listener — making it a clean template for any future page-lifecycle work that needs the same 2-second drain courtesy.

## Task Commits

This phase ships as a single atomic commit at transition (per v6.0 cadence and existing PAUL discipline — see v60-01-01's combined commit `6dc44f3`).

| Task | Type | Description |
|------|------|-------------|
| Task 1: TextCell pagehide-commit | feat | useRef + useEffect dual-listen (pagehide + visibilitychange:hidden), commit() via fresh-closure ref. |
| Task 2: MobileRowCard pagehide-commit | feat | flushRef fan-out across commitTitle/Lead/Bpm/Notes, listener gated on isEditing. |
| Task 3: Engine pagehide drain hook | feat | installPagehideDrainHook (idempotent) wired into bootEngineOnce, `whenEngineIdle(2000)`. |
| Test additions | test | 4 TextCell pagehide assertions + new MobileRowCard.test.tsx (4) + new init-pagehide.test.ts (5). |
| Phase metadata | docs | STATE.md / ROADMAP.md / PROJECT.md updates + handoff archive. |

Bundled commit SHA: *(filled by transition-phase step)*

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/components/setlist/grid/cells/TextCell.tsx` | Modified (+24 LOC) | Dual-listen pagehide + visibilitychange:hidden; calls existing `commit()` via ref-stabilized closure; gated on `editing` to avoid 50+ listeners across a setlist. |
| `src/components/setlist/grid/MobileRowCard.tsx` | Modified (+25 LOC) | flushRef-driven fan-out across title/lead/bpm/notes; same dual-listen pattern; gated on `isEditing` (inputs only render in the expanded card). |
| `src/lib/sync/init.ts` | Modified (+25 LOC) | New exported `installPagehideDrainHook` — module-level idempotent registration that fires `void whenEngineIdle(2000)` on pagehide. Wired into `bootEngineOnce` after `engine.start()`. |
| `src/components/setlist/grid/cells/__tests__/TextCell.test.tsx` | Modified (+76 LOC) | 4 new assertions covering both event paths and both negative cases. |
| `src/components/setlist/grid/__tests__/MobileRowCard.test.tsx` | Created (+139 LOC) | New direct test file (no existing one) — DndContext+SortableContext harness, 4 assertions. |
| `src/lib/sync/__tests__/init-pagehide.test.ts` | Created (+92 LOC) | 5 assertions — listener registration delta, idempotency, subscribe-path invocation, no-throw on idle, source pinning of 2000ms literal. |
| `.paul/STATE.md` | Modified | Loop position updates (PLAN ✓ APPLY ✓ UNIFY ✓), Session Continuity rewrite. |
| `.paul/ROADMAP.md` | Modified | v60-02 status `⚪ Not started` → `🟡 Planning` → (will be `✅ LOOP COMPLETE — PENDING-UAT` at transition). |
| `.paul/phases/v60-02-pagehide-blur-mid-edit-text-protection/v60-02-01-PLAN.md` | Created (during PLAN) | Plan artifact. |
| `.paul/phases/v60-02-pagehide-blur-mid-edit-text-protection/v60-02-01-SUMMARY.md` | Created (this file) | Reconciliation artifact. |
| `.paul/HANDOFF-2026-05-12.md` → `.paul/handoffs/archive/` | Moved | Consumed handoff archived per lifecycle. |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Silent auto-commit (no UI toast/indicator) on pagehide | Aligns with v6.0 locked decision #4 (silent LWW + Sentry); user is leaving the tab so any UI render is wasted; matches existing blur=commit semantic contract. | Pattern carries to any future "leave-event" auto-commits. |
| Dual-listen on pagehide AND visibilitychange:hidden, not pagehide-only | visibilitychange fires *before* pagehide on iOS tab swipe; both can fire in close succession. Existing `commit()` `draft !== value` guard handles dedup organically. | Locks the dual-listen pattern; documented in the inline comments and test cases. |
| 2000ms `whenEngineIdle` budget on pagehide | iOS Safari grants ~5s before suspension; 2s gives ~1 round-trip headroom without risking BFCache re-show timing. Best-effort by design — promise is `void`-discarded, never blocks the event loop. | Pinned by source-content test; future tweaks require updating the test, surfacing the contract. |
| Ref-stabilized commit closures over deps-array-in-effect | Including commit in deps re-registers listeners every keystroke (churn). Ref pattern keeps closure fresh + listeners registered once per editing session. | Pattern documented in code comments; reusable for any "fire-on-event-with-latest-state" need. |
| MobileRowCard listener gated on isEditing (not always-on) | Inputs only render when the inline editor is expanded; gating prevents ~30 cards × 2 listeners = 60 unused listeners per setlist. | Performance-aware default for any future per-row listener registrations. |
| Delta-count assertions for window event-listener tests | `vi.spyOn(window, 'addEventListener')` captures listeners from transitive module imports (Firebase recovery wiring registers a few at import time); naive `toHaveLength(1)` fails. Counting the install-induced delta keeps the assertion focused on installPagehideDrainHook's behavior alone. | Reusable pattern for any future tests that spy on window event registration. |
| Source-pinning test for the 2000ms literal | The `whenEngineIdle` call site is hard to mock without invasive same-module instrumentation; static regex match on `whenEngineIdle\(2000\)` locks the load-bearing constant without runtime mocking. | Used here for the timeout literal; pattern documented for similar "constant-in-implementation" contracts. |
| Direct-render MobileRowCard test (new file) over SetlistGrid integration test | The existing MobileCardList.test.tsx has 6 skipped tests against the removed Sheet UI; reusing it would force an integration setup with DndContext + zustand temporal middleware + Dexie that adds nothing over isolated component testing. | Cleaner isolation; faster (~83ms vs. ~1000ms for SetlistGrid renders); precedent for future MobileRowCard-only assertions. |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | JSX tag typo in MobileRowCard.test.tsx harness (one qualify loop). |
| Scope additions | 2 | (a) Added source-pinning test for 2000ms timeout; (b) Pulled Vercel `development` env vars to .env.local per user's autonomous-mandate side-task. |
| Deferred | 0 | None from v60-02 itself. |

**Total impact:** Trivial drift inside the plan; no scope creep beyond what AC-3 already implies. The Vercel env pull is an out-of-band session task, not a v60-02 deliverable.

### Auto-fixed Issues

**1. [Test] JSX closing-tag typo in MobileRowCard.test.tsx Harness**
- **Found during:** Task 2 first qualify pass
- **Issue:** Wrapped the harness in `<DndContext><SortableContext>...</DndContext></DndContext>` (double-DndContext close, missing SortableContext close).
- **Fix:** Corrected to `</SortableContext></DndContext>`.
- **Files:** `src/components/setlist/grid/__tests__/MobileRowCard.test.tsx`
- **Verification:** Re-ran the file; 4/4 tests pass (83ms).
- **Commit:** Folded into the same task commit.

### Scope Additions

**1. [Test] Source-pinning assertion for `whenEngineIdle(2000)` literal**
- **Reason:** AC-3 demands the 2000ms timeout but `whenEngineIdle` is a same-module export, making runtime spying on the argument awkward without ESM instrumentation. A regex match against init.ts source content locks the contract cheaply.
- **Status:** Added to init-pagehide.test.ts as the 5th assertion; passes.

**2. [Ops] Vercel `development` env vars pulled to `.env.local`**
- **Reason:** User issued an autonomous-mandate side-task during APPLY: pull envs for local testing utility. Verified (via stash + remove) that this does NOT affect the pre-existing test failures — same 20 failures with/without .env.local.
- **Status:** `.env.local` present in working tree but gitignored. `GOOGLE_PRIVATE_KEY`, `VERCEL_OIDC_TOKEN`, `BRIDGE_ALERT_EMAIL`, `SESSION_ROLE_SECRET` available for local tooling.

### Deferred Items

None from v60-02. (The 52 pre-existing test failures are *carry-forward*, not deferred-from-this-plan; they're orthogonal to v60-02 and addressed by the Wave 2 v60-03 HFG closure phase.)

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Initial init-pagehide test asserted `toHaveLength(1)` on pagehide listener registrations — failed because something in the transitive import chain (likely the Firebase recovery wiring in firebase.ts) registers a pagehide-adjacent listener at module load. | Re-shaped the assertion to count the *delta* introduced by `installPagehideDrainHook` (post-install minus pre-install). Robust against any future import-time listeners as well. |
| Subscribe-spy test failed initially (`expected "subscribe" to be called at least once`) — microtask flushing wasn't sufficient because `whenEngineIdle` does `await import('./store')` which crosses module-resolution timing. | Replaced 3× `await Promise.resolve()` with `await new Promise(r => setTimeout(r, 50))` — gives the dynamic import + subscribe chain a real macrotask to settle. |
| Full vitest suite reports 52 failing tests across 10 unrelated files (SetlistGrid.contextmenu, SetlistGrid.undo, sync-engine, upload-musescore, smart-score-viewer, etc.). | **Investigated via git-stash baseline comparison: same failures at baseline without v60-02 changes. Confirmed pre-existing infrastructure breakage (likely tied to HFG counter being at 1/3 + drag-handle testid drift). Documented as carry-forward to Wave 2 (v60-03). NOT a v60-02 regression.** |

## Skill Audit (SPECIAL-FLOWS.md)

| Expected | Invoked | Notes |
|----------|---------|-------|
| `/ui-ux-pro-max` | ✓ | Loaded before frontend touch in TextCell.tsx + MobileRowCard.tsx. UX consult answered the silent-vs-feedback / iPad-Safari dual-listen / accessibility-of-implicit-commit questions; all three verdicts aligned with plan boundaries. |

All required skills invoked ✓

## Next Phase Readiness

**Ready:**
- Wave 1 of v6.0 is *behaviorally complete*. v60-01 (silent LWW + conflict pill rewire) + v60-02 (pagehide flush + engine drain) together close the orthogonal UX bugs flagged in the v5h3-01 postmortem and the 2026-05-12 P0 sprint. Daniel's iPad workflow now has both halves of the protection.
- `installPagehideDrainHook` provides a clean lifecycle-hook template for any future Wave 3+ phase that needs page-event coordination with the sync engine.

**Concerns:**
- Pre-existing 52 test failures in the broader suite (SetlistGrid.contextmenu, SetlistGrid.undo, sync-engine integration, etc.) are *unrelated to v60-02* but mean `vitest run` exit is non-zero. Daniel browser-smoke + the targeted vitest greens we DO have are the trust-anchors until Wave 2 closes HFG.
- Pre-existing failure cluster suggests the testing infrastructure (fake-indexeddb + Firebase mock + jsdom + dnd-kit drag wiring) is increasingly fragile. v60-03 (Java JDK 21 + Firebase emulator canary) is the right place to invest in higher-fidelity harness.

**Blockers:**
- None for Wave 1 closure or Wave 2 entry.
- Wave 2 (v60-03) still BLOCKS Wave 3 engine-touching phases. v60-02 does not change that constraint.

---
*Phase: v60-02-pagehide-blur-mid-edit-text-protection, Plan: 01*
*Completed: 2026-05-12*
