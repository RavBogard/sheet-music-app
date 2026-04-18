---
phase: 03-stage-ux
plan: 04
subsystem: ui
tags: [performance, setlist-row, offline-idb, transposition, accessibility]

requires:
  - phase: 01_2-offline-truthiness
    provides: IndexedDB store with listFileIds/hasFile used as ground truth
  - phase: 03-stage-ux
    provides: SetlistRow, PerformanceOfflineIndicator from prior 03-0N plans

provides:
  - Per-track transposition override surfaced in the setlist key badge
  - Full-opacity amber cue-note text for stage legibility
  - ≥44px leader-only tap target on liturgical headers
  - IDB-grounded "OFFLINE — N/M CHARTS READY" indicator
affects: 04-editor-cleanup (if an editor-side transposition-override UI ships later)

tech-stack:
  added: []
  patterns:
    - Live-view components read IDB once per offline transition (not per render)
    - Native <button> with min-h-11 preferred over role="button" divs for touch targets

key-files:
  created:
    - src/components/performance/__tests__/PerformanceOfflineIndicator.test.tsx
  modified:
    - src/components/performance/SetlistRow.tsx
    - src/components/performance/PerformanceOfflineIndicator.tsx
    - src/app/perform/setlist/[id]/page.tsx
    - src/components/performance/__tests__/setlist-row.test.tsx

key-decisions:
  - "Per-track transposition precedence mirrors use-musician-transposition (track override > profile default > 0)"
  - "Bumped cue-note text from amber-400/70 to amber-300 for stage legibility"
  - "Native <button> with min-h-11 for leader headers; non-leaders get a plain div"
  - "PerformanceOfflineIndicator owns offline state — inline banner in page.tsx removed"

patterns-established:
  - "Key-display logic respects the same precedence chain as the PDF transposition hook"
  - "Offline indicators read IDB ground truth via listFileIds, once per offline transition"

duration: ~25min
started: 2026-04-14T07:50:00Z
completed: 2026-04-14T08:00:00Z
---

# Phase 03 Plan 04: Performance View Polish Summary

**Per-track transposition override surfaces in the setlist key badge; amber cue-notes bumped to stage-legible contrast; liturgical headers get ≥44px leader-only tap targets; `PerformanceOfflineIndicator` now reads IDB and reports `OFFLINE — N/M CHARTS READY` with graceful fallbacks.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~25min |
| Tasks | 3 auto + 1 human-verify checkpoint |
| Files modified | 5 |
| Tests added | 12 (8 row + 5 indicator, –1 replaced) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Per-chart transposition override shows in the setlist row | Pass | Precedence matches `use-musician-transposition`. Public view ignores override. 3 new row tests. |
| AC-2: Amber cue-notes legible at stage distance | Pass | `text-amber-400/70` → `text-amber-300`. Verified in test. |
| AC-3: Liturgical header hit area ≥44px and leader-actionable | Pass | Native `<button type="button">` with `min-h-11 w-full`. Non-leader renders plain div. 3 new row tests. |
| AC-4: Offline indicator reports N/M charts ready from IDB | Pass | `listFileIds` intersected with song fileIds; graceful fallback when list empty or IDB throws. 5 indicator tests. |

## Accomplishments

- Stage view now honours the `track.transposition` field that previously only influenced the PDF viewer.
- Offline musicians see an honest count of cached charts rather than an ambiguous "setlist may be outdated" banner.
- Leader headers are tappable anywhere on the row (≥44px); musicians see no ghost-interactive affordance.
- One source of truth for offline state — inline banner in `page.tsx` removed.
- Full suite 1132/1132, TypeScript clean.

## Task Commits

Single atomic commit (matching prior-plan conventions in this phase).

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/components/performance/SetlistRow.tsx` | Modified | Track-level transposition precedence, amber-300 notes, <button> headers for leaders |
| `src/components/performance/PerformanceOfflineIndicator.tsx` | Modified | setlistFileIds prop, IDB read on offline transition, graceful fallback |
| `src/app/perform/setlist/[id]/page.tsx` | Modified | Removed duplicate inline banner; indicator now owns offline state |
| `src/components/performance/__tests__/setlist-row.test.tsx` | Modified | +8 tests (transposition override, public override, amber-300, leader header button, non-leader plain, Enter activation) |
| `src/components/performance/__tests__/PerformanceOfflineIndicator.test.tsx` | Created | 5 tests pinning N/M display, graceful fallback, IDB throw |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Mirror transposition precedence from `use-musician-transposition` | Canonical logic lives there; reimplementing it would drift | Future key-display consumers should also read the same chain |
| Bump cue-note class directly, no new CSS var | The app doesn't have a semantic "stage-amber" token yet; premature to introduce one for a single use | Simple, visible change; revisit when a proper stage-color scale exists |
| Native `<button>` over `role="button"` div for headers | Free keyboard/ARIA, simpler, smaller diff | Pattern replicated for any future leader-only inline control |
| Offline indicator reads IDB on offline transition only | Polling would waste cycles; online state rarely matters for cache count | Low overhead, accurate enough for a stage view |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 0 | — |
| Scope additions | 0 | — |
| Deferred | 0 | — |

**Total impact:** Plan executed as written.

### Auto-fixed Issues

None.

### Deferred Items

None. Editor-side UI for *setting* `track.transposition` remains explicitly out of scope per the plan (belongs to a future editor polish plan).

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Pre-existing `song-charts-library.test.tsx` env-vars failure | Unchanged — still out of scope; confirmed untouched by this plan. |

## Next Phase Readiness

**Ready:**
- Phase 3 closed (4/4 plans). Stage-UX gate cleared for band onboarding.
- Phase 4 (Editor ergonomics + noise cleanup) can begin — no dependency issues from Phase 3 output.

**Concerns:**
- No UI yet for musicians or leaders to *set* per-track transposition — display-only today. Worth a dedicated plan in Phase 4 or a deferred-issue triage.

**Blockers:**
- None.

**Skill audit:** /ui-ux-pro-max required and invoked ✓

---
*Phase: 03-stage-ux, Plan: 04*
*Completed: 2026-04-14*
