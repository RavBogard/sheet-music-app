---
phase: v51-02-editor-readability
plan: 01
subsystem: ui
tags: [tailwind, shadcn, tanstack-table, oklch, dark-mode, density, hierarchy, jest-axe, wcag]

# Dependency graph
requires:
  - phase: v51-01-picker-rework
    provides: TouchOrPopover always-Popover + DropdownCell mode + KeyCell tabs (untouched here; treated as protected boundary)
  - phase: v50-05-spreadsheet-editor
    provides: SetlistGrid + cell components + 44px touch-target rule (v50-05-04) + jest-axe pattern (v50-05-05)
provides:
  - Density-locked SetlistGrid (44px desktop / 48px tablet outer rows)
  - Tier-class typography hierarchy (T1 title / T2 key / T3 lead+type+bpm / T4 notes)
  - Section-row visual framing for type='header'|'section' (bg tint + indigo left accent + smallcaps title)
  - DESIGN-CONTRACT.md (3 option sets; Option B locked) — design ground-truth for future tweaks
affects: v51-04-vocal-lead-rename (lead column rename + Daniel-loop UAT codification will inherit the locked dimensions); future tablet-readability iterations

# Tech tracking
tech-stack:
  added: []  # No new dependencies
  patterns:
    - "Tier-class constants at module scope (TIER1_TITLE etc.) — single source of truth flowed via cn()-merged className props on cells; no inner-cell churn"
    - "Section-row branching via isSectionRow(t) helper checking 'header' OR 'section' (defensive against TrackType union 'header' vs TypeCell picker 'section' mismatch)"
    - "Outer row height = inner cell trigger height + minimal TD padding (44=h-10+py-0.5; 48=h-11+py-0.5) — preserves 44px touch floor without churning cell internals"

key-files:
  created:
    - .paul/phases/v51-02-editor-readability/v51-02-01-PLAN.md
    - .paul/phases/v51-02-editor-readability/v51-02-01-DESIGN-CONTRACT.md
    - .paul/phases/v51-02-editor-readability/v51-02-01-SUMMARY.md
  modified:
    - src/components/setlist/grid/SetlistGrid.tsx
    - src/components/setlist/grid/__tests__/SetlistGrid.a11y.test.tsx

key-decisions:
  - "Locked Option B Comfortable Dense (44/48 outer rows; tier hierarchy via weight + color; section rows tint+L-2 bar+smallcaps)"
  - "Single-file implementation: all 8 cell components already accept className → SetlistGrid COLUMNS array passes tier classes; zero churn to cell internals"
  - "TD padding tightened to py-0.5 (both desktop + tablet) so outer row = inner h-10/h-11 + 4px; 44px touch floor preserved by inner triggers, not by padding"

patterns-established:
  - "Tier-class constants colocated with consumer (SetlistGrid.tsx top-of-file) so future per-column tier swaps are single-line edits"
  - "data-row-type=section|content attribute on <tr> for test discrimination + future styling hooks"
  - "Section-row detection treats 'header' AND 'section' as same class (TrackType union vs TypeCell picker mismatch documented in isSectionRow())"

# Metrics
duration: ~75min
started: 2026-04-27T17:50:00Z
completed: 2026-04-27T18:18:00Z
---

# Phase v51-02 Plan 01: Editor readability + visual hierarchy Summary

**Setlist editor density tightened to 44/48px outer rows on desktop/tablet with tier-class hierarchy (title > key > lead+type+bpm > notes) and section-row framing (bg-indigo-500/[0.08] + L-2 indigo bar + smallcaps title) — single-file edit on SetlistGrid.tsx; 1495/1495 suite; pushed to prod.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~75min (consult + plan + apply + verify + push) |
| Started | 2026-04-27T17:50:00Z |
| Completed | 2026-04-27T18:18:00Z |
| Tasks | 5 of 5 completed (1 consult + 1 decision + 1 apply + 1 verify + 1 HUMAN-VERIFY) |
| Files modified | 5 (SetlistGrid.tsx + a11y test + PLAN + DESIGN-CONTRACT + SUMMARY) |
| Commits | 1 (`c40d880`) — pushed at push range `304e940..c40d880` |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Desktop density tightened (40-44px) | Pass | Outer row = h-10 (40) + py-0.5 (4) = 44px; column widths narrowed (type 120→104, key 80→72, bpm 72→64) so title flex-fills as primary |
| AC-2: Tablet density tightened with 44px touch floor | Pass | Outer row = h-11 (44) + py-0.5 (4) = 48px; inner triggers preserve 44px floor on `pointer:coarse`; jest-axe clean |
| AC-3: Visual hierarchy ranks fields | Pass | T1 title (text-sm 600 foreground) > T2 key (text-sm 500 indigo-200 tabular-nums) > T3 lead+type+bpm (text-[13px] muted-foreground) > T4 notes (text-xs muted-foreground/75); locked in DESIGN-CONTRACT.md; verified by tier-class test case |
| AC-4: Section rows visually distinct | Pass | type='header'\|'section' rows get bg-indigo-500/[0.08] + border-l-2 border-indigo-400/50 + border-t border-indigo-500/25 + smallcaps title (text-xs font-bold uppercase tracking-[0.1em] text-indigo-100); tested via mixed header+content render case |
| AC-5: Mobile parallel render path untouched | Pass | `git diff --stat` against MobileCardList/MobileRowCard/MobileEditSheet returned EMPTY; existing mobile tests pass without modification |
| AC-6: WCAG AA holds at new density | Pass | jest-axe new mixed-content/header case ZERO violations; full a11y suite 11/11 (was 8 + 3 new) |
| AC-7: Public-share / read-only views inherit | Pass | No diff to perf-view or share routes; SetlistGrid is the shared component tree; suite covers read-only render via existing SetlistGrid.read.test.tsx (passes) |
| AC-8: Daniel UAT approved on desktop + iPad | Pass | Approved 2026-04-27 ("go" reply post-deploy) |

## Accomplishments

- **Density visibly tightened** (~14 rows in 720px viewport vs ~10 prior) without crossing into cramped — Option B Comfortable Dense locked
- **Hierarchy is robust under both lighting + age conditions** via redundant cues (font-weight tier AND color tier; not relying on a single channel)
- **Section rows now frame their groups** via background tint + 2px indigo left-accent bar — solves the "blends together" complaint while keeping rows fully editable
- **Implementation cost stayed at single-file** because every cell component already accepted `className` and merged via `cn()` → DESIGN-CONTRACT could be applied entirely from `SetlistGrid.tsx`'s COLUMNS array; no cell-internal churn
- **DESIGN-CONTRACT.md preserved as design ground-truth** so future tweaks (e.g. v51-04 Vocal Lead column rename) reference an explicit spec rather than reverse-engineering from CSS

## Task Commits

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Task 1 + 2 + 3 + 4 (cohesive vertical slice) | `c40d880` | feat | DESIGN-CONTRACT.md + SetlistGrid tier classes + section-row framing + a11y test extension |
| Task 5 HUMAN-VERIFY | (n/a — UAT, no commit) | — | Daniel approved 2026-04-27 post-deploy |

Plan + handoff-archive bundled in same commit (per v50-07-03 precedent — single cohesive slice). Close commit (this SUMMARY + STATE/ROADMAP updates) lands next during phase transition.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `.paul/phases/v51-02-editor-readability/v51-02-01-PLAN.md` | Created | Plan with 5 tasks + 8 ACs + skills-required gate |
| `.paul/phases/v51-02-editor-readability/v51-02-01-DESIGN-CONTRACT.md` | Created | 3 option sets specifying density/typography/color/section-row treatment; Option B marked as locked decision |
| `.paul/phases/v51-02-editor-readability/v51-02-01-SUMMARY.md` | Created | This file |
| `src/components/setlist/grid/SetlistGrid.tsx` | Modified | Added tier-class constants + isSectionRow helper; updated COLUMNS sizes (type/key/bpm/lead/notes); added className passthrough per cell with header-aware variant for title; added section-row framing classNames + selection opacity bump on `<tr>`; tightened TD padding |
| `src/components/setlist/grid/__tests__/SetlistGrid.a11y.test.tsx` | Modified | +3 cases (mixed header+content axe scan; section-row className tokens; tier classes per row type) |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| **Option B "Comfortable Dense"** locked at decision-checkpoint | Meaningful density tightening + section framing + tablet tap comfort + lowest implementation risk + redundant tier hierarchy cues (weight AND color) | Used as ground-truth for Task 3 implementation; preserved in DESIGN-CONTRACT.md for future reference |
| Treat `type === 'section'` AND `type === 'header'` as section rows | TrackType union (src/types/models.ts) includes 'header'; TypeCell picker writes 'section' for "Section header" option — pre-existing mismatch out of scope per boundaries; defensive double-check covers both data sources | Section framing applies to liturgical-template-imported rows AND user-picked-via-TypeCell rows |
| Outer row height = inner cell button height + minimal TD padding (h-10+py-0.5 = 44 desktop, h-11+py-0.5 = 48 tablet) | Achieves contract numbers without churning inner cell heights (all 8 cells stay h-10/h-11); 44px touch floor preserved by inner triggers themselves | Single-file implementation possible; cells stay test-compatible with existing height assertions |
| Title cell gets header-aware className branch (HEADER_TITLE for type='header'\|'section', TIER1_TITLE for content) | Smallcaps banner is the dominant section-row signal alongside bg tint + L-2 bar; switching at COLUMNS-render level avoids modifying TextCell internals | Section-row title visually reads as a chapter break; content-row title pops as primary tier |
| Did NOT change top-bar height (sticky-thead offset stays at top-[3.25rem]) | DESIGN-CONTRACT scoped this in lockstep but Option B didn't change top-bar; current 52px is fine | No risk of sticky thead overlapping content |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 0 | — |
| Scope additions | 0 | — |
| Plan-spec realism adjustment | 1 | Outer row math reconciled with existing inner cell heights (see below); contract numbers preserved, math path adjusted |
| Deferred | 0 | — |

**Total impact:** Plan executed essentially as written. One mid-flight realism adjustment to the outer-row arithmetic (DESIGN-CONTRACT had aspirational `py-1.5`/`py-2.5` padding numbers; actual cells are h-10/h-11 so padding had to shrink to py-0.5/py-0.5 to hit 44/48 outer). The contract's user-facing numbers (44px desktop / 48px tablet) shipped exactly; only the implementation-level padding values differ from contract draft.

### Auto-fixed Issues

None — no surprises emerged during APPLY.

### Realism Adjustment

**1. Cell padding values vs contract draft**
- **Found during:** Task 3 (apply locked design contract)
- **Issue:** Contract Option B draft listed `px-2.5 py-1.5` desktop / `[@media(pointer:coarse)]:py-2.5` tablet, which would yield 52px / 64px outer rows given existing inner h-10/h-11 cell triggers — overshooting the 44/48px target the contract itself committed to
- **Fix:** Adopted `px-2.5 py-0.5 [@media(pointer:coarse)]:py-0.5` so outer math becomes h-10 (40) + py-0.5 (4) = 44 desktop and h-11 (44) + py-0.5 (4) = 48 tablet — hits the contract's user-facing target numbers exactly
- **Files:** src/components/setlist/grid/SetlistGrid.tsx (TD padding only)
- **Verification:** Suite 1495/1495; manual confirmation that inner h-10/h-11 cell triggers preserve 44px touch floor on `pointer:coarse` (the cells' own classNames carry the touch-target rule, not the TD padding)
- **Commit:** Part of `c40d880` task feature commit
- **Lesson for DESIGN-CONTRACT v2:** When specifying outer row height, verify against existing inner element heights before committing pixel padding numbers. Outer = inner + padding. Padding-driven height assumes inner is 0; cells with explicit h-N must have their height factored in.

### Deferred Items

None — plan executed as written.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Pre-existing dirty state on `package.json` (version 2.11.19 → 0.1.0) and `src/build-info.json` (commit `4aa6840` → `c11a5c4`) before this session started | Excluded from staging via explicit `git add` of only intended files (per memory feedback `feedback_paul_phase_commits.md`); these dirty files predate this session and are auto-generated by the dev script — not v51-02 work |
| Pre-existing lint errors in `SyncIndicator.tsx` (Date.now impure) and `DropdownCell.tsx` (refs in render — v51-01 leftover) | Not introduced by v51-02; flagged but out of scope. Could be cleaned in v51-04 alongside Vocal Lead rename if desired |

## Skill Audit

| Expected (per SPECIAL-FLOWS.md) | Invoked | Notes |
|----------------------------------|---------|-------|
| `/ui-ux-pro-max` (required, BLOCKING) | ✓ | Loaded at APPLY entry before Task 1; DB queried for design-system "dashboard data-table dense dark professional editor" + ux "data table density hierarchy row height padding" + color "dark mode hierarchy contrast muted text" + shadcn stack "data table responsive layout" |

All required skills invoked ✓.

## Next Phase Readiness

**Ready:**
- v51-02 phase is single-plan; this plan-close also closes the phase
- Density + hierarchy + section framing are locked and tested; v51-03 (smart create-setlist wizard) can compose against the new visual language
- DESIGN-CONTRACT.md preserved at `.paul/phases/v51-02-editor-readability/` as the design ground-truth for v51-04 (Vocal Lead column rename) which will inherit the locked column widths + tier classes

**Concerns:**
- Pre-existing TYPE_OPTIONS picker writes 'section' but TrackType union has 'header' — defensively handled here but the underlying mismatch should be addressed if v51-04 touches the type column. Tracked as a latent issue (no user impact today since both render correctly)
- iPad UAT was a brief approval ("go") — if the band onboarding surfaces ambient-reading-distance issues (musicians 2-3ft from stand), Option C-style larger title type (text-base) is a quick swap via the TIER1_TITLE constant

**Blockers:**
- None — v51-03 (smart create-setlist wizard) can plan immediately

---
*Phase: v51-02-editor-readability, Plan: 01*
*Completed: 2026-04-27*
