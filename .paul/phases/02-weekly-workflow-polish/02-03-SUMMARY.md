---
phase: 02-weekly-workflow-polish
plan: 03
subsystem: dashboard
tags: [ordering, hero, next-service-card, navigation, router, referrer, role-aware]

requires:
  - phase: 01-recursive-research
    provides: ROADMAP Phase 2 items for dashboard-list ordering, hero CTA, back button

provides:
  - pastOrNoDate sorted DESC with null-trailing
  - NextServiceCard role-aware Edit shortcut for band leaders
  - Referrer-honoring back button in SetlistEditorV2

affects: [phase-2-plan-04, phase-3-stage-ux]

tech-stack:
  added: []
  patterns:
    - "Two-pass past/null partition + sort — explicit beats Array.sort comparator that also handles null"
    - "Same-origin referrer check before router.back() — prevents exiting the app via back"
    - "Role-aware secondary CTAs — keep primary stable; add role-gated shortcuts alongside"

key-files:
  created:
    - .paul/phases/02-weekly-workflow-polish/02-03-PLAN.md
  modified:
    - src/hooks/use-setlist-dashboard.ts
    - src/hooks/__tests__/use-setlist-dashboard.test.ts
    - src/components/home/NextServiceCard.tsx
    - src/app/(main)/DashboardClient.tsx
    - src/components/setlist/v2/SetlistEditorV2.tsx

key-decisions:
  - "Apply role-aware hero to NextServiceCard (the live hero), not HeroCard (dead code)"
  - "Keep Perform as primary CTA for ALL roles — musicians want to play; band leaders also perform. Role-aware change = ADDITIONAL Edit shortcut for leaders, not a primary-CTA swap"
  - "Two-pass partition + sort for pastOrNoDate — readable, null-trailing is explicit, avoids comparator subtlety"
  - "router.back() gated on same-origin + href-not-self to avoid leaving the app or looping"
  - "onBack prop escape hatch preserved — test harnesses and caller-specific routes still override"

patterns-established:
  - "Role-aware CTAs: add a secondary action gated on role, don't invert the primary"
  - "Referrer-based back navigation: `document.referrer` + same-origin gate + `router.back()` with a deterministic fallback"

duration: ~25min
started: 2026-04-13T22:25:00Z
completed: 2026-04-13T22:40:00Z
---

# Phase 2 Plan 03: List Ordering + Hero CTA + Back Button Summary

**Past setlists sort most-recent-first, band leaders get an Edit shortcut on the dashboard hero, and the editor back button honors same-origin referrer so tapping back returns to the page the user actually came from.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~25 min |
| Started | 2026-04-13T22:25:00Z |
| Completed | 2026-04-13T22:40:00Z |
| Tasks | 3 auto + 1 human-verify — all complete |
| Files modified | 5 |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Past setlists DESC, null-trailing | Pass | Two-pass partition; new unit test asserts order; regression test confirms upcoming-asc preserved |
| AC-2: Role-aware hero CTA | Pass (amended) | Applied to `NextServiceCard` (live hero) not `HeroCard` (dead). Musicians keep Perform-only; band leaders get an adjacent compact Edit button |
| AC-3: Referrer-based back button | Pass | Same-origin + not-self check; `router.back()` when safe; deterministic fallback otherwise; `onBack` prop escape hatch untouched |
| AC-4: Tests + typecheck + suite green | Pass | `tsc --noEmit` 0 errors; 1107/1107 tests pass; 2 new past-desc + upcoming-asc test cases in `use-setlist-dashboard.test.ts` |

## Accomplishments

- Past-list ordering now surfaces the natural clone source (last Saturday's setlist) at the top — no scrolling to find it.
- Band leaders no longer have to pass through Perform or the list view to start editing this week's setlist — one tap from the dashboard.
- Tapping back in the editor no longer teleports users out of the schedule grid, library, or perform view they came from.

## Task Commits

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Tasks 1–3 | `1c6bb59` | feat | Phase 2 P03: past-list desc + role-aware hero + referrer back |

Pushed: `72656c9..1c6bb59 master -> master`. Vercel auto-deploys `master` to production.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/hooks/use-setlist-dashboard.ts` | Modified | pastOrNoDate two-pass partition + desc sort |
| `src/hooks/__tests__/use-setlist-dashboard.test.ts` | Modified | 2 new tests (past-desc + null-trail, upcoming-asc regression) |
| `src/components/home/NextServiceCard.tsx` | Modified | New `isBandLeader` + `onEdit` props; adjacent Edit button on both card variants |
| `src/app/(main)/DashboardClient.tsx` | Modified | Destructures `isBandLeader` from `useAuth`; passes `onEdit` + `isBandLeader` to both NextServiceCard call sites |
| `src/components/setlist/v2/SetlistEditorV2.tsx` | Modified | `handleBack` honors same-origin `document.referrer` via `router.back()`; same deterministic fallback |
| `.paul/phases/02-weekly-workflow-polish/02-03-PLAN.md` | Created | Plan |
| `.paul/phases/02-weekly-workflow-polish/02-03-SUMMARY.md` | Created | This file |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Target `NextServiceCard`, not `HeroCard` | `HeroCard` import is commented out in `DashboardClient.tsx:28` — it's dead code. `NextServiceCard` is the live hero rendered under `{!setlistsReady ? … : tonightSetlist ? <NextServiceCard ... />}`. | Role-aware change applied where it actually ships |
| Keep primary CTA stable ("Perform"/"Practice"); role-gate a secondary | Today's hero already does the right thing for musicians. Flipping the primary for band leaders would regress the weekly flow for them too (during live service they also Perform). What they lack is quick edit access — add that without disturbing Perform. | Smaller diff, safer, respects existing muscle memory |
| Two-pass partition for `pastOrNoDate` | A single `sort` comparator that also sinks nulls is possible but fragile (stability across null pairs depends on engine). Explicit dated-vs-undated partition is trivial to reason about and the test asserts null order preservation. | ~10 lines, zero ambiguity |
| Same-origin + href-not-self check before `router.back()` | Bare `router.back()` from the editor can exit the app to Google (referrer-based back) or loop (if editor is the only history entry). Both fail modes observed in similar stacks. | Back button has deterministic behavior or deterministic fallback — never worse than today |
| Preserve `onBack` prop contract | Existing callers (tests, specific routes) may want to override | Zero breakage |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | Plan targeted wrong file (HeroCard → NextServiceCard); redirected to the live component |
| Scope additions | 0 | — |
| Deferred | 0 | — |

**Total impact:** Functionally equivalent; one discovery during apply pointed the UX change at the correct component.

### Auto-fixed Issues

**1. [scope-correction] `HeroCard` is dead code; `NextServiceCard` is the live hero**
- **Found during:** Task 2 after grepping for `<HeroCard` in `DashboardClient.tsx` and finding only a commented-out import (line 28).
- **Issue:** Plan specified editing `HeroCard.tsx`. That component is unused — `NextServiceCard` took over the hero slot at some point between v3 and v4.2 without `HeroCard` being deleted.
- **Fix:** Reverted the tentative HeroCard edits (`git checkout src/components/dashboard/HeroCard.tsx`), applied the role-aware `isBandLeader` + `onEdit` pattern to `NextServiceCard.tsx` instead. Because NextServiceCard's primary was already Perform (musician-ideal), the role-aware concept shifted from "swap primary CTA by role" to "add a secondary Edit action for band leaders". Documented in AC-2 notes.
- **Files:** `src/components/home/NextServiceCard.tsx`, `src/app/(main)/DashboardClient.tsx`; `src/components/dashboard/HeroCard.tsx` reverted to pre-plan state.
- **Verification:** Full suite 1107/1107; typecheck clean.
- **Commit:** `1c6bb59`
- **Follow-up:** Consider a cleanup plan to delete `src/components/dashboard/HeroCard.tsx` + `src/components/dashboard/index.ts` re-export if truly unreferenced. Not in scope for this plan; logged here.

### Deferred Items

None — AC-1 through AC-4 closed in-plan.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Pre-existing `song-charts-library.test.tsx` file-level env-ts collection noise | Unchanged from prior plans; not in scope |

## Production Smoke Checklist (pending human verification)

1. Dashboard as band leader: hero shows "Perform" + compact "Edit" button.
2. Dashboard as musician (test by temporarily setting custom claim to `musician`): hero shows "Perform" only — no Edit button.
3. Past list: most-recent-past first; null-dated trail at bottom.
4. From `/schedule` → open a setlist → back → returns to `/schedule`.
5. Direct URL to editor (empty referrer) → back → falls back to `/perform/setlist/{id}`.

## Deferred Human Smoke Tests (running list)

1. **v4.1** / **Phase 1.1** / **Phase 1.2** / **Phase 1.3**: prior unchanged.
2. **Phase 2 P01**: close-tab-within-1s keepalive flush; "Saved Ns ago" ticker.
3. **Phase 2 P02**: single-dialog wizard, Enter-to-create, template auto-fill, congregation-driven rabbi list, EditDetails modal.
4. **Phase 2 P03 (new)**: dashboard past-list DESC, role-aware hero Edit button, editor back → referrer.
5. **Phase 1.3 operator**: `firebase deploy --only storage` still pending.

## Skill Audit

SPECIAL-FLOWS.md required `/ui-ux-pro-max` for Task 2. Invoked; confirmed "Perform" label, ArrowRight affordance, secondary-link treatment mirroring the existing pattern. Design synthesis applied to `NextServiceCard` after the HeroCard/NextServiceCard clarification. ✓

## Next Phase Readiness

**Ready:**
- Plan 02-04 (OverflowMenu reorder + Save as Template + copy unification + service-notes-always + global undo/redo) — independent of dashboard + back-button changes.
- The role-aware secondary-CTA pattern is available for Plan 02-04's OverflowMenu reordering if role-specific items belong in specific slots.

**Concerns:**
- `HeroCard.tsx` remains in the tree but unused. Should be deleted in a cleanup plan. Leaving dead code is a chronic source of "which component ships?" confusion — next developer (or the next `/paul:plan` session) should prune it.
- `router.back()` relies on the browser's history stack. If the user opens a setlist in a new tab (no history), `router.back()` is a no-op — the same-origin guard catches the obvious case, but it's worth flagging. Fallback works.

**Blockers:** None for Plan 02-04.

---
*Phase: 02-weekly-workflow-polish, Plan: 03*
*Completed: 2026-04-13*
