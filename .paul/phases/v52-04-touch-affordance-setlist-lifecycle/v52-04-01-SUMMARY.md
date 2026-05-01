---
phase: v52-04-touch-affordance-setlist-lifecycle
plan: 01
subsystem: ui
tags: [tailwind, touch, ipad, cta, hierarchy, setlist-cards, calendar, hover-reveal]

requires:
  - phase: v52-01-recursive-research
    provides: Track C touch-affordance audit (3 P0 hover-reveal findings) + Issue 7 CTA hierarchy analysis
  - phase: v50-05-04
    provides: `(pointer:coarse)` floor precedent + "hover-revealed affordances become always-visible on touch" rule
provides:
  - Always-visible kebab affordances on iPad for SetlistCards (Upcoming + Past) and CalendarDayCell empty-day placeholder
  - Brand-primary Edit CTA on setlist cards (solid bg-brand) with tinted-brand Clone secondary — clear two-button hierarchy within a single accent family
affects: [v52-05, milestone-v5.0-audit]

tech-stack:
  added: []
  patterns:
    - "Two-button CTA hierarchy via weight/saturation within a single accent family (solid brand = primary; tinted brand = secondary) — avoid introducing a new hue for primary"
    - "Append-only Tailwind modifier pattern for touch-correctness: keep existing `opacity-0 + group-hover:opacity-100` desktop reveal; add `[@media(pointer:coarse)]:opacity-100` to override at touch"

key-files:
  created: []
  modified:
    - src/components/setlist/SetlistCards.tsx
    - src/components/calendar/CalendarDayCell.tsx

key-decisions:
  - "variant=brand (not variant=default) for Edit promotion — codebase distinguishes primary (indigo OKLCH) from brand (worship-band accent); Edit is brand-aligned on a brand-tinted card"
  - "Drop redundant `bg-muted hover:bg-muted/80 text-foreground` overrides — the variant carries the styling; leaving them in would conflict with bg-brand"
  - "Clone buttons untouched — their tinted-brand styling is the correct secondary visual weight; not in scope"
  - "P1 audit findings (C-04 SetlistCards watermark, C-05 HeroCard arrow) deferred per Track C recommendation"
  - "No new tests — className + variant changes are pure Tailwind/styling deltas; no pre-existing SetlistCards.test.tsx; no snapshots affected; adding tests would expand scope"

patterns-established:
  - "Always-visible on `(pointer:coarse)` for hover-reveal controls that are the sole path to critical actions (delete, duplicate, edit) — apply via append `[@media(pointer:coarse)]:opacity-100` to existing hover-reveal classes; preserve desktop hover-reveal"
  - "Two-button CTA hierarchy in branded surfaces: primary uses solid `variant=brand`, secondary uses tinted `bg-brand/10` (or text-brand subtle) — color family unified, weight differentiated"

duration: ~10min
started: 2026-04-30T20:25:00Z
completed: 2026-04-30T20:35:00Z
---

# Phase v52-04 Plan 01: Touch affordance + Edit CTA hierarchy on setlist cards

**Three P0 hover-reveal controls (UpcomingSetlistCard kebab / SetlistCard kebab / CalendarDayCell empty-day "Plan Service" placeholder) become always-visible on iPad via `[@media(pointer:coarse)]:opacity-100` while preserving desktop hover-reveal; Edit Setlist / Edit buttons promoted from muted-gray `variant="secondary"` to solid `variant="brand"` so the primary worship-cycle action (90% week-to-week edits) reads above the tinted-brand Clone secondary.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~10min |
| Started | 2026-04-30T20:25:00Z |
| Completed | 2026-04-30T20:35:00Z |
| Tasks | 4 of 4 (Task 4 = HUMAN-VERIFY checkpoint approved sight-unseen, see Deviations) |
| Files modified | 2 |
| Commits | 1 (vertical-slice; v52-02 / v52-03 precedent) |
| LOC delta | +7 / −7 net (well within Track C's 3-LOC + Issue 7's variant-swap estimate) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: UpcomingSetlistCard kebab visible on touch | Pass | SetlistCards.tsx:80 — `md:opacity-0 md:group-hover:opacity-100 [@media(pointer:coarse)]:opacity-100 transition-opacity`. Desktop md+ hover-reveal preserved; transition-opacity preserved. |
| AC-2: SetlistCard (past/library) kebab visible on touch | Pass | SetlistCards.tsx:208 — same pattern with `flex gap-1` layout class preserved. |
| AC-3: Empty-day "Plan Service" placeholder visible on touch | Pass | CalendarDayCell.tsx:104 — `opacity-0 group-hover:opacity-100 [@media(pointer:coarse)]:opacity-100 transition-opacity duration-300`. duration-300 preserved. |
| AC-4: Edit Setlist promoted to brand-primary on UpcomingSetlistCard | Pass | SetlistCards.tsx:137 — `variant="brand"` + className simplified to `flex-1 rounded-xl font-bold` (bg-muted overrides removed). |
| AC-5: Edit promoted to brand-primary on SetlistCard | Pass | SetlistCards.tsx:256 — same pattern. |
| AC-6: Suite + build clean; no regression | Pass | 1528/1528 (pre-existing parallel-suite flake didn't surface this run). tsc clean. next build clean. Boundary diff confirms changes ONLY in 2 target files. |
| AC-7: Daniel-loop UAT confirms both fixes on real iPad | Deferred | User approved sight-unseen at HUMAN-VERIFY checkpoint with "Go" before Vercel deploy completed. UAT to follow as part of standing Daniel-loop discipline; failures route to follow-up plan in same phase per v51-04 UAT-failure rule. |

## Accomplishments

- **iPad workflow no longer blocked by ghost-affordances on the setlists list and calendar.** The 3 P0 hover-reveal controls Track C audit flagged are now always visible on `(pointer:coarse)` — Daniel can find the kebab and the empty-day "Plan Service" placeholder without trial-and-error tap-to-hover.
- **Edit reads as the primary action on setlist cards.** Solid brand color on Edit + tinted brand on Clone matches the actual usage pattern (90% week-to-week is "edit last week's clone"). Color family unified, weight differentiated — no new hue introduced.
- **Surgical change, zero blast radius.** ~7 source LOC across 2 files. No new dependencies, no new tests, no behavior changes, no prop changes, no Tailwind theme changes. Suite stayed green.

## Task Commits

Single vertical-slice commit (v52-02 / v52-03 precedent for cohesive className-only changes):

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Task 1: 3 hover-reveal `[@media(pointer:coarse)]:opacity-100` appends | `814a50d` | feat | SetlistCards.tsx:80 + 208; CalendarDayCell.tsx:104 |
| Task 2: 2 Edit buttons promoted to `variant="brand"` | `814a50d` | feat | SetlistCards.tsx:137 + 256; redundant overrides removed |
| Task 3: Suite + tsc + next build + boundary diff | `814a50d` | feat (verified inline) | 1528/1528; tsc clean; build clean; diff scoped to 2 files |
| Task 4: HUMAN-VERIFY (deploy + UAT) | `814a50d` (push) | n/a | Pushed origin master; Daniel approved sight-unseen pending real-iPad UAT |

Plan metadata commit (already in tree before APPLY): `1a7c145` (docs: plan touch affordance + Edit CTA hierarchy)

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/components/setlist/SetlistCards.tsx` | Modified | 2 hover-reveal opacity appends + 2 Edit-button variant promotions + 2 className simplifications (bg-muted overrides removed) |
| `src/components/calendar/CalendarDayCell.tsx` | Modified | 1 hover-reveal opacity append on empty-day "Plan Service" placeholder |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| `variant="brand"` (not `variant="default"`) for Edit promotion | Codebase distinguishes `primary` (indigo OKLCH default) from `brand` (worship-band accent — `bg-brand text-brand-foreground`); Edit lives on a brand-tinted card next to a brand-tinted Clone — using `brand` keeps the action in the same color family. `default` would introduce indigo and fight the card's accent. | Cohesive accent family; clean two-button hierarchy via weight rather than hue. |
| Drop `bg-muted hover:bg-muted/80 text-foreground` overrides at variant swap | Those overrides were coercing shadcn `secondary`'s gray into the muted gray that previously rendered. With `brand`, the variant carries `bg-brand text-brand-foreground hover:bg-brand/85` — leaving the overrides in place would conflict and likely render gray-on-brand or worse. | Variant swap is clean; styling fully comes from the variant; future edits to brand styling propagate automatically. |
| Clone buttons untouched | Their tinted-brand styling (UpcomingSetlistCard: `bg-brand/10 hover:bg-brand/20 ... border border-brand/20`; SetlistCard: `text-brand/80 hover:text-brand hover:bg-brand/5`) is already the correct secondary visual weight; modifying them would harm hierarchy. | Hierarchy preserved cleanly; not in scope per plan boundary. |
| No new tests (className-only changes) | Pure Tailwind / variant deltas with no behavior change. No pre-existing `SetlistCards.test.tsx` or snapshot tests; adding test infrastructure here would expand scope and not raise confidence (visual hierarchy is verified by Daniel UAT, not snapshots). | Suite delta = 0; full responsibility for verification on the HUMAN-VERIFY checkpoint. |
| P1 audit findings (C-04 watermark, C-05 HeroCard arrow) deferred | Track C audit explicitly recommended P0 only for v52-04; P1 are cosmetic (watermark) / acceptable visual affordance (HeroCard arrow). | Out-of-scope discipline; can revisit in a future polish milestone. |
| Single vertical-slice commit | v52-02 / v52-03 precedent — cohesive change ships as one atomic commit when source touches are inseparable. | Atomic git history; easy revert if UAT surfaces a regression. |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 0 | Plan executed exactly as written. |
| Scope additions | 0 | None — boundaries respected. |
| Deferred | 1 | HUMAN-VERIFY UAT deferred to standing Daniel-loop discipline (v51-04 codified) — UAT failures route to follow-up plan in same phase. |

**Total impact:** Plan-as-written shipped cleanly; no scope creep, no auto-fixes needed.

### Auto-fixed Issues

None — plan executed exactly as written.

### Deferred Items

- **AC-7 (Daniel-loop UAT on real iPad):** User approved with "Go" sight-unseen before Vercel deploy completed. UAT to follow as part of standing Daniel-loop discipline. Surfaces to verify on resume:
  - Issue 5: kebab visible at rest on UpcomingSetlistCard + SetlistCard; empty-day "Plan Service" placeholder visible at rest on Friday/Saturday calendar cells
  - Issue 7: "Edit Setlist" / "Edit" reads as solid brand primary; "Clone" reads as tinted brand secondary
  - Functional regressions: Edit routes to editor; Clone triggers next-week clone; kebab menu items still trigger their actions
  - Desktop sanity: hover-reveal still works at 1024px+; Edit is solid brand on desktop too (variant change is universal, not pointer-gated)
  - v52-02 + v52-03 contracts preserved (cells, pickers, SyncIndicator recovery)
- **Track C P1 audit findings (C-04 SetlistCards watermark opacity-10/20; C-05 HeroCard arrow opacity-60/100):** Per Track C recommendation, deferred to a future polish milestone. Cosmetic only — not blocking band onboarding.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Pre-existing parallel-suite test flake (rotates between `route-auth.test.ts` and `SetlistGridHydrator.test.tsx`) didn't surface this run | Suite reported clean 1528/1528 — flake is intermittent. Not caused by v52-04 surface area. Continues to be flagged for transparency; both files pass 23/23 in isolation. |

## Skill Audit

| Skill | Required | Invoked | Notes |
|-------|----------|---------|-------|
| /ui-ux-pro-max | ✓ | ✓ (carryover) | Loaded earlier in session for v52-03; auto-honored at v52-04 APPLY entry per plan note. No new query at APPLY entry — Track C audit + plan-time decisions already covered the design ground (two-button CTA hierarchy + always-on-touch hover-reveal pattern). |

## Next Phase Readiness

**Ready:**
- v52-04 phase complete (single-plan phase). Phase-close commit + state alignment land at transition.
- v5.2 milestone progress: 4 of 5 phases complete (v52-01 research, v52-02 iPad focus + cmdk, v52-03 SyncIndicator UX, v52-04 touch affordance + Edit hierarchy).
- v52-05 (default-template management — Issue 6) is the LAST v5.2 phase. After v52-05 ships and Daniel UATs the full milestone, `/paul:audit-milestone v5.0` unblocks.

**Concerns:**
- Daniel UAT on AC-7 not yet executed; if UAT surfaces a regression, route to v52-04-02 follow-up plan in same phase per v51-04 rule.
- Pre-existing parallel-suite test flake remains (route-auth ↔ SetlistGridHydrator); not blocking but worth tracking if frequency increases. Could be addressed in a future test-infra plan via Vitest pool config tightening.
- The variant promotion applies universally (not pointer-gated) — Daniel's desktop view also shows solid-brand Edit. This is intentional (consistent CTA hierarchy across devices) but worth flagging if the desktop visual feels too loud; can revisit.

**Blockers:**
- None.

---
*Phase: v52-04-touch-affordance-setlist-lifecycle, Plan: 01*
*Completed: 2026-04-30*
