---
phase: v70-03-per-track-media-affordances
plan: 01
subsystem: ui
tags: [setlist-grid, mobile-row-card, chart-click-through, anchor-link, new-tab, parseFileId]

requires:
  - phase: v6.0 (post-0ec6773c)
    provides: the MobileCardList/MobileRowCard render path (the desktop TanStack table was deleted; MobileRowCard is the sole live render path)
provides:
  - Chart click-through — MobileRowCard's chart indicator is an `<a target="_blank">` to the chart serving URL when a chart is bound
  - Reuses the existing `/api/drive/file/[fileId]` + `/api/library/file/[id]` serving routes (no new route, no rules change)
affects:
  - v70-03-02 (recording-bind UI) — same finding applies: SetlistGrid's TanStack table is dead code; v70-03-02 will need the same re-spec to target MobileRowCard
  - any future phase touching the setlist row card — MobileRowCard.tsx is the live path

tech-stack:
  added: []
  patterns:
    - "Per-row media affordance = conditional inside MobileRowCard's JSX (bound → interactive `<a>`, unbound → plain `<span>`); link `onClick` calls `e.stopPropagation()` so the card's tap-to-edit handler does not fire."
    - "Chart serving URL is built client-side via `parseFileId(contentId).apiUrl` — `db-` ids → `/api/library/file/{id}`, all others → `/api/drive/file/{id}`."

key-files:
  modified:
    - src/components/setlist/grid/MobileRowCard.tsx (chart indicator → conditional click-through link)
    - src/components/setlist/grid/__tests__/MobileRowCard.test.tsx (4 new tests)

key-decisions:
  - "Re-spec in place (Spec-issue diagnostic): the original PLAN targeted SetlistGrid's `columns`/`ChartCell`/`ChartBindPopover` — all dead code (SortableRow has zero call sites post-0ec6773c). Reverted the dead-code edits via git checkout, rewrote the PLAN to target MobileRowCard.tsx."
  - "Link semantics over button+window.open: real `<a target=_blank rel=noopener noreferrer>` gives native middle-click / cmd-click and free a11y."
  - "stopPropagation (not preventDefault) on the link onClick — the click must NOT bubble to the card's tap-to-edit, but the anchor must still navigate."
  - "Unbound chart indicator left byte-identical — binding stays 100% context-menu → ChartBindDialog + edit-pane 'Bind Chart' button (no inline popover exists in the live path; the original AC-2 was mis-specified against dead code and was corrected)."

patterns-established:
  - "When a PLAN targets a file region, verify it is in the live render path first — SetlistGrid.tsx carries a large dead TanStack-table block (COLUMNS, SortableRow, useReactTable) that is never rendered; MobileCardList → MobileRowCard is the sole path."

duration: ~50min (includes mid-APPLY re-spec)
started: 2026-05-14T15:30:00Z
completed: 2026-05-14T16:20:00Z
---

# Phase v70-03 Plan 01: Chart Click-Through Summary

**The setlist row card's chart indicator is now a click-through link — a bound chart opens its file in a new browser tab via the existing Storage-backed serving route; unbound rows keep the plain non-interactive icon, and the link does not hijack the card's tap-to-edit / long-press gestures.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~50min (includes a mid-APPLY re-spec — see Deviations) |
| Started | 2026-05-14T15:30:00Z |
| Completed | 2026-05-14T16:20:00Z |
| Tasks | 2 auto PASS + 1 checkpoint:human-verify carried forward |
| Files modified | 2 |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Bound chart opens in a new tab | Pass | MobileRowCard renders `<a href={parseFileId(contentId).apiUrl} target="_blank" rel="noopener noreferrer">` when `track.songId` is set. `contentId` = `track.fileId` (if string) else `track.songId`. `next build` ✓. Test asserts href = `/api/drive/file/song-abc`, `target="_blank"`, `rel` contains `noopener`; a `db-` fileId routes to `/api/library/file/db-xyz`. |
| AC-2: Unbound chart indicator is unchanged | Pass | The unbound branch is the byte-identical `<span aria-label="No chart bound">` + `<FileText>`. Test asserts `queryByRole('link')` is null and `getByLabelText('No chart bound')` is present. Binding affordances (context-menu "Bind chart", edit-pane "Bind Chart" button) untouched. |
| AC-3: The chart link does not hijack the card's gestures | Pass | The link's `onClick` calls `e.stopPropagation()` (no `preventDefault` — navigation still happens). Test passes an `onTap` spy, clicks the link, asserts the spy was NOT called. Long-press / drag-handle pointer logic untouched. |

## Accomplishments

- **Chart click-through shipped on the live render path.** A bound chart in the setlist row card is now a real link to the chart file — the band can open the chart from the setlist without going through the bind dialog.
- **Caught and corrected a dead-code spec defect mid-APPLY.** The original PLAN was written against `SetlistGrid.tsx`'s TanStack `columns` + `ChartCell` + `ChartBindPopover` — all dead code (`SortableRow` has zero call sites; the desktop table was deleted post-0ec6773c). QUALIFY on Task 1 surfaced it; the plan was re-spec'd in place and the dead-code edits reverted.
- **Zero new regressions.** `next build` ✓; `MobileRowCard.test.tsx` 8/8 (4 new); `MobileCardList.test.tsx` 10/10 (7 skipped) — both live-path files green. The 41 grid-dir failures are entirely the pre-existing dead-table baseline (part of the project-wide 52-failing baseline).

## Task Commits

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Task 1 + Task 2 | `<phase-commit>` | feat | MobileRowCard chart indicator → click-through link + 4 tests |

Not yet committed — this is plan 1 of 2 in phase v70-03. Per the project's phase-bundled commit pattern, the commit + push happens at the v70-03 phase transition (after v70-03-02's loop closes). Until then nothing is pushed/deployed.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/components/setlist/grid/MobileRowCard.tsx` | Modified | Chart indicator `<span>` → conditional: bound = `<a target="_blank">` click-through to the chart serving URL with `stopPropagation`; unbound = unchanged non-interactive icon. Added `parseFileId` import. |
| `src/components/setlist/grid/__tests__/MobileRowCard.test.tsx` | Modified | `Harness` extended to accept an `onTap` spy; new `describe('v70-03-01 chart click-through')` with 4 cases (bound→link+href, db- id→library route, unbound→plain icon, link click does not toggle edit). |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Re-spec the PLAN in place rather than patch dead code | The original PLAN targeted `ChartCell.tsx` + `SetlistGrid.tsx` columns — never rendered. This is a Spec-issue per the diagnostic-classification taxonomy: fix the spec before the code. | Dead-code edits reverted via `git checkout`; PLAN rewritten to target `MobileRowCard.tsx`; AC-2 corrected (no inline popover exists in the live path). |
| Real `<a>` link semantics, not a button + `window.open` | Native middle-click / cmd-click "open in new tab" and free a11y; matches /ui-ux-pro-max guidance. | Bound chart indicator is keyboard- and pointer-accessible with no extra JS. |
| `stopPropagation` (not `preventDefault`) on the link `onClick` | The click must not bubble to the card's `handleCardClick` (tap-to-edit) but the anchor must still navigate. | AC-3 satisfied; card gestures isolated from the new link. |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 0 | — |
| Scope additions | 0 | — |
| Re-spec (spec defect) | 1 | Significant — plan target was dead code; corrected mid-APPLY with user approval |
| Deferred | 1 | The human-verify checkpoint carried forward to `.paul/UAT-PENDING.md` (new standing pattern) |

**Total impact:** One significant mid-APPLY deviation — the original plan's target files were dead code. Caught at Task 1 QUALIFY (not silently patched), classified as a Spec issue, escalated to the user, re-spec'd in place. Final delivered scope matches the corrected ACs exactly.

### Re-spec (Spec defect)

**1. [Spec] Original PLAN targeted dead code**
- **Found during:** Task 1 QUALIFY (re-read output + compare against AC).
- **Issue:** The PLAN's tasks + ACs targeted `SetlistGrid.tsx`'s TanStack `columns` chart cell, `ChartCell.tsx`, and `ChartBindPopover`. `SortableRow` (which would render that column) has zero call sites — the desktop table was deleted post-0ec6773c; `SetlistGrid → MobileCardList → MobileRowCard` is the sole live render path. `SetlistGrid.read.test.tsx` already has 2 tests failing on exactly this. The first APPLY attempt's `next build` passed but the edited code path is never rendered, so AC-1 could not be satisfied.
- **Fix:** Reverted the first-attempt edits to `ChartCell.tsx` + `SetlistGrid.tsx` via `git checkout`. Rewrote `v70-03-01-PLAN.md` — new target `MobileRowCard.tsx`, corrected ACs (AC-2 no longer references a non-existent inline popover), added a RENDER-PATH NOTE to the plan's context. Re-executed APPLY against the corrected plan.
- **Files:** `v70-03-01-PLAN.md` (rewritten); `ChartCell.tsx` + `SetlistGrid.tsx` (reverted to HEAD).
- **Verification:** `git status` clean for the reverted files; re-executed APPLY → `next build` ✓ + 8/8 MobileRowCard tests.

### Deferred Items

- **v70-03-01 human-verify checkpoint** → appended to `.paul/UAT-PENDING.md`. New standing pattern (Daniel, 2026-05-14): `checkpoint:human-verify` tasks no longer block APPLY — they accumulate in `.paul/UAT-PENDING.md` and Daniel verifies the whole list against the deployed build at milestone end. Saved to memory as `feedback-uat-checklist`.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| First APPLY attempt's `next build` passed but the edited path (`SetlistGrid` columns + `ChartCell`) was dead code | Caught at Task 1 QUALIFY by comparing output against AC, not just trusting the green build. Classified as Spec issue, re-spec'd (see Deviations). |
| Bash shell cwd kept resetting to repo root (not `sheet-music-app/`) | Prefixed build/test commands with an absolute `cd` into `sheet-music-app/`. |

## Skill Audit (per .paul/SPECIAL-FLOWS.md)

| Expected | Invoked | Notes |
|----------|---------|-------|
| /ui-ux-pro-max | ✓ | Invoked this session before Task 1. Guidance applied: real link semantics (`<a target="_blank" rel="noopener noreferrer">`), aria-label announces new-tab, `cursor-pointer`, hover opacity shift, ≥44px touch target on coarse pointers (`h-10 w-10` → `h-11 w-11`), color not the only interactivity signal. |

## Next Phase Readiness

**Ready:**
- v70-03-02 (recording-bind vertical slice) — next plan in this phase.

**Concerns:**
- **v70-03-02 has the SAME dead-code problem.** Its PLAN says "wire into the SetlistGrid recording column" + new meta fields — but SetlistGrid's table is dead code. v70-03-02 must be re-spec'd to add the recording affordance to `MobileRowCard.tsx` (and likely the per-card edit pane), NOT a SetlistGrid column. The FILE-COLLISION NOTE in v70-03-02's boundaries is now moot (v70-03-01 no longer touches SetlistGrid) but should be replaced with the MobileRowCard re-spec.
- Nothing is committed/pushed yet — phase commit + push happens at v70-03 transition (after v70-03-02). The `.paul/UAT-PENDING.md` entry has no deployed commit SHA until then.
- The dead `SetlistGrid` TanStack-table block (COLUMNS, SortableRow, useReactTable, ChartCell, ChartBindPopover in-cell usage) is real tech debt — a future phase should delete it. Out of scope for v70-03.

**Blockers:** None.

---
*Phase: v70-03-per-track-media-affordances, Plan: 01*
*Completed: 2026-05-14*
