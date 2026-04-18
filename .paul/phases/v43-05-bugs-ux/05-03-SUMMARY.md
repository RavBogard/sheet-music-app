---
phase: v43-05-bugs-ux
plan: 03
subsystem: ui
tags: [a11y, wcag, touch-targets, tailwind, regression-test]

requires:
  - phase: v43-01-recursive-research
    provides: FINDINGS.md U01 (perform-view touch targets <44px)

provides:
  - 44px touch-target floor on musician-on-stage surfaces
  - Reusable audit script (scripts/audit-touch-targets.ts) classifying all interactive elements in perform/nav/setlist surfaces
  - Regression test locking the floor against reintroduction

affects: future frontend plans touching /perform, /setlists, MobileTabBar, SetlistRow

tech-stack:
  added: []
  patterns:
    - "44px sizing idiom: `h-11 min-w-11` for icon buttons; `min-h-11` for full-width rows"
    - "AST-based className audit via @babel/parser + @babel/traverse (no new deps)"

key-files:
  created:
    - scripts/audit-touch-targets.ts
    - .paul/phases/v43-05-bugs-ux/05-03-AUDIT.md
    - src/__tests__/a11y/touch-targets.test.tsx
  modified:
    - src/components/performance/MetronomeControl.tsx
    - src/app/perform/setlist/[id]/page.tsx

key-decisions:
  - "Narrowed U01 scope to musician-on-stage surfaces only; desktop-only editor buttons (TrackSheet, MusicianPicker, SetlistToolbar) left at h-8/h-9 — out of U01 scope per FINDINGS text"
  - "Mixed verification: DOM rendering for SetlistRow + source-level className scans for pages/components with heavy Firestore/zustand dependencies"

patterns-established:
  - "Icon-only interactive elements must use h-11 min-w-11 (or size-11+) on mobile surfaces"
  - "Decorative icons inside buttons (h-4/h-5) are fine as long as the button itself hits 44px"

duration: ~40min
started: 2026-04-14T20:15:00Z
completed: 2026-04-14T20:35:00Z
---

# Phase 5 Plan 03: U01 Touch Targets Summary

**WCAG 2.5.5 44px floor enforced on perform-view musician surfaces; audit script + regression test guard against regression.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~40 min |
| Started | 2026-04-14T20:15:00Z |
| Completed | 2026-04-14T20:35:00Z |
| Tasks | 3 auto + 1 human-verify — all complete |
| Files modified | 5 (2 new scripts/tests, 2 component fixes, 1 plan doc) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Audit coverage complete and reproducible | PASS | 78 files scanned, 211 interactive elements enumerated, written to 05-03-AUDIT.md |
| AC-2: Every offender ≥ 44×44 | PASS (scoped) | All 4 musician-on-stage offenders fixed. 29 remaining offenders are desktop-only editor surfaces — explicitly deferred per FINDINGS scope |
| AC-3: Regression test locks the floor | PASS | 6 new tests in src/__tests__/a11y/touch-targets.test.tsx all green |
| AC-4: Real-device verification | PASS | User verified on iPhone + iPad prod deploy (Vercel auto-deploy from commit da503cb) |

## Accomplishments

- Metronome play/pause, perform-view back link, Gig Packet & Edit buttons all bumped from h-8/h-9 to h-11 (44px) on the on-stage surface
- Verified FINDINGS-cited SetlistRow swap/header and MobileTabBar outer tabs were already compliant (prior work)
- Audit script is reusable: any future frontend plan can run `npx tsx scripts/audit-touch-targets.ts` to re-classify
- Regression test mixes rendered DOM checks (SetlistRow) with source-level scans (perform page, Metronome, MobileTabBar) to avoid heavy mock setup

## Task Commits

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Task 1: Audit script + initial report | `16036f1` | chore(audit) | AST scan of perform/nav/setlist/app — 32 initial offenders classified |
| Task 2: Remediate musician-facing offenders | `1ad8ff8` | fix(u01) | MetronomeControl + perform page header → 44px |
| Task 3: Regression test | `f67e9b1` | test(a11y) | 6 tests guard the floor against reintroduction |
| (ancillary) Build artifacts | `da503cb` | chore | package.json / build-info.json version bump |
| (ancillary) State update | `6a63473` | docs | STATE.md — APPLY complete |

All on `origin/master`, Vercel auto-deployed.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `scripts/audit-touch-targets.ts` | Created | AST-based touch-target classifier, reusable |
| `.paul/phases/v43-05-bugs-ux/05-03-AUDIT.md` | Created | Snapshot: 37 compliant / 29 offenders / 145 unknowns post-fix |
| `src/__tests__/a11y/touch-targets.test.tsx` | Created | 6 regression tests |
| `src/components/performance/MetronomeControl.tsx` | Modified | `h-9` → `h-11 min-w-11` on togglePlay Button |
| `src/app/perform/setlist/[id]/page.tsx` | Modified | Back Link h-9 w-9 → h-11 w-11 (+aria-label); Gig Packet & Edit h-8 → h-11 min-w-11; icons h-3.5/4.5 → h-4/5 |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Scope U01 to on-stage perform surfaces only; leave desktop editor buttons at h-8/h-9 | FINDINGS text: "musicians operating on-stage / holding an instrument". Desktop editor is leader-with-mouse, 44px not required | 29 audit "offenders" deferred as desktop-only; not regressions |
| Mixed DOM + source-level regression tests | MobileTabBar, MetronomeControl, and perform page all depend on Firestore/zustand; mocking them is more surface than a sizing check warrants | Cheaper test; equivalent coverage for the classname-centric concern |
| Regex-based audit trailing `\b` behavior | `\b` after `]` in arbitrary-value classes fails (non-word ↔ non-word); leaves some compliant items in UNKNOWN bucket | Cosmetic only — OFFENDER list remains accurate; documented for future audit v2 |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 0 | — |
| Scope additions | 0 | Stayed within U01 scope |
| Deferred | 1 category | Desktop-only editor touch targets (documented) |

**Total impact:** Focused execution; audit surfaced more offenders than FINDINGS anticipated, and we correctly narrowed rather than expanded scope.

### Deferred Items

- **Desktop editor touch targets** (29 offenders): SetlistToolbar, TrackSheet, MusicianPicker, AddGuestForm, SetlistHistoryPanel, SetlistTopBar, OverflowMenu, BatchActionBar, TrackPrintOptionsList, ImporterModal, AddSongsModal, SetlistMatrixView, RehearsalToolbar. All h-8/h-9/h-10. These are leader-with-mouse surfaces. If a later plan decides iPad leader usage warrants tightening, the audit script is ready to re-run.
- **Audit regex v2**: trailing `\b` on arbitrary-value min-h-[56px] patterns causes some compliant items to be classified UNKNOWN. Non-blocking; tightens a future audit pass.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Pre-existing env-vars test suite fails on `createEnv` | Unchanged since v4.2 Phase 4; documented in STATE.md; not caused by this plan |
| First regression-test run flagged h-8 Loader2 spinner inside a button | Tightened regex to scan only `<Button>/<Link>/<button>/<a>` open tags and skip classNames containing `animate-spin` |

## Next Phase Readiness

**Ready:**
- 6/10 v4.3 P0 findings closed (S01, S03, D03, D02, B01, B02, now U01 — actually 7/10)
- Audit tooling is in-tree for future a11y passes
- Regression test pattern is reusable (rendered + source-level scans)

**Concerns:**
- None on U01. For U02 next, the `visualViewport` keyboard hide pattern already exists in MobileTabBar — AddBar just needs to reuse it.

**Blockers:** None.

---
*Phase: v43-05-bugs-ux, Plan: 03*
*Completed: 2026-04-14*
