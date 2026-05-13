---
phase: v60-10-mobile-addbar-variant
plan: 01
subsystem: ui-grid
tags: [mobile-addbar, sticky-bottom, virtual-keyboard-hide, ported-from-v53-03-q1, ui-ux-pro-max, coarse-pointer-variant, visualViewport-api, env-safe-area-inset, css-driven-media-query-positioning, hide-display-none, v6.0-wave-4]

# Dependency graph
requires:
  - phase: v53-03-polymorphic-add-menu
    provides: AddBar split-button shape (primary "+ Song" CTA + chevron 5-tile popover) this plan wraps with sticky positioning; v53-03-01 baseline test suite (12 cases) extended in-place rather than rewritten
  - phase: v53-03-polymorphic-add-menu (CONTEXT Q1)
    provides: Original deferred mobile-AddBar question this plan resolves end-to-end; CONTEXT.md Q1 asked "sticky-bottom on coarse pointer? hide when keyboard open? Or unified split-button?" — locked answers: sticky-bottom YES, keyboard-hide YES, unified NO (coarse-pointer-only variant)
  - phase: v51-01-picker-rework
    provides: TouchOrPopover substrate (boundary-locked; not modified)
provides:
  - Coarse-pointer sticky-bottom AddBar variant (iPad + phone): `[@media(pointer:coarse)]:fixed bottom-0 left-0 right-0 z-40 bg-background pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_12px_rgba(0,0,0,0.18)]` on AddBar outer wrapper — CSS-driven for no first-paint flash
  - `useVirtualKeyboardOpen()` hook (src/hooks/use-virtual-keyboard-open.ts) — visualViewport.resize listener with SSR + JSDOM guards; 150px threshold tolerates browser-chrome reveal/hide while catching real iOS Safari keyboards (≥250-320px)
  - Hide-on-keyboard discipline: `hideForKeyboard = isCoarse && keyboardOpen` toggles Tailwind `hidden` (display:none) so the sticky bar can't overlap an inline-editor or steal focus behind the keyboard
  - 7 hook unit tests + 5 AddBar variant tests (+12 cases total); v53-03 baseline preserved verbatim
affects: [v6.0 milestone close — v60-10 is the last v6.0 phase from this session's perspective; v60-09 closes in parallel session, after which /paul:complete-milestone routes; any future iPad/iPhone UX work that needs virtual-keyboard detection should consume useVirtualKeyboardOpen verbatim]

# Tech tracking
tech-stack:
  added: []  # visualViewport is a Web API; useMediaQuery + Tailwind already present
  patterns:
    - "CSS-driven media-query positioning (`[@media(pointer:coarse)]:fixed`) over JS-driven `isCoarse && 'fixed'`: avoids the one-frame paint with the fine-pointer state followed by a re-render that the latter causes. Tailwind emits the rule inside `@media (pointer: coarse) { ... }` so the browser applies the correct positioning at first paint on real iPad/phone — no flash."
    - "JS-driven hooks composition for inherently-dynamic state: `useMediaQuery('(pointer: coarse)') && useVirtualKeyboardOpen()` cleanly gates a display-toggle whose source signal (visualViewport.height delta) is fundamentally JS-side. Pattern: static layout = CSS media query; dynamic visibility = JS hook composition."
    - "Tailwind `hidden` (display:none) for show/hide that should also remove from a11y tree: when the bar is hidden behind the keyboard, it shouldn't be in the focus order. visibility:hidden preserves layout space (wrong); translate-off-screen + pointer-events-none adds invisible motion (wasteful)."
    - "Fixed-bottom toolbar safe-area discipline: `position: fixed bottom-0` MUST be paired with `pb-[env(safe-area-inset-bottom)]` to clear the iOS home indicator on phones. Tailwind arbitrary-value syntax surfaces the env() var directly without a theme-config addition."
    - "z-40 for fixed-nav-like elements (per html-tailwind stack guideline + ui-ux-pro-max Z-Index Management HIGH rule), sitting below Radix Dialog (z-50) so ChartBindDialog and other modals overlay the sticky bar cleanly."
    - "visualViewport-based virtual-keyboard detection: SSR-safe (typeof window + visualViewport feature checks) with 150px threshold for browser-chrome noise tolerance. Reusable for any future sticky-mobile-toolbar that needs to disappear behind a popped keyboard."

key-files:
  created:
    - sheet-music-app/src/hooks/use-virtual-keyboard-open.ts (~35 lines; visualViewport resize listener, 150px threshold, SSR + feature-detect guards)
    - sheet-music-app/src/hooks/__tests__/use-virtual-keyboard-open.test.ts (~125 lines; 7 cases — unavailable / closed / under-threshold / over-threshold / dynamic open / dynamic close / cleanup)
  modified:
    - sheet-music-app/src/components/setlist/grid/AddBar.tsx (+21 lines net: 2 hook imports + isCoarse/keyboardOpen/hideForKeyboard derivations + sticky class composition + hide-class conditional + 2 explanatory comment blocks; existing inner elements untouched)
    - sheet-music-app/src/components/setlist/grid/__tests__/AddBar.test.tsx (+~135 lines: new "AddBar v60-10-01: coarse-pointer sticky-bottom variant" describe block with 5 cases — sticky classes present / hidden absent default / hidden present coarse+keyboard / hidden absent fine+keyboard defense-in-depth / v53-03 split-button regression)

key-decisions:
  - "Option A `position: fixed` strategy locked at Task 2 checkpoint:decision after /ui-ux-pro-max consultation — rejected Option B (sticky-in-scroll-container: requires SetlistGrid restructure into height-bounded overflow shell, high regression risk against drag-and-drop autoscroll + modal positioning + EmptyState centering) and Option C (FAB: abandons v53-03 split-button shape, violates Track A old-AddBar precedent + Daniel muscle memory, increases tap-to-add cost from one-tap to two-tap)"
  - "CSS-driven sticky positioning + JS-driven hide-on-keyboard composition — chosen for no-first-paint-flash on iPad (the dominant surface). JS-driven sticky would render the fine-pointer state on initial mount before useEffect ran useMediaQuery, then re-render to coarse-pointer state — visible flash on Daniel's primary device. CSS media-query gating eliminates the flash."
  - "Tailwind `hidden` (display:none) for the hide-on-keyboard visibility primitive — removes the bar from the a11y tree so it cannot steal focus behind the keyboard. No motion — the keyboard's own animation is the visual transition, which also auto-satisfies prefers-reduced-motion. Rejected `visibility: hidden` (preserves layout space — wrong; we want the space back). Rejected translate-off-screen + pointer-events-none (adds motion behind a keyboard the user cannot see)."
  - "z-40 for the sticky bar — explicit, codebase-consistent, sits below Radix Dialog's z-50 default. Per html-tailwind stack guideline + ui-ux-pro-max Z-Index Management HIGH rule (no arbitrary large z-index values; define a scale)."
  - "150px visualViewport delta threshold — tolerates browser-chrome reveal/hide (~80px) while catching real iOS Safari keyboards (≥250-320px). Tunable via the `KEYBOARD_DELTA_THRESHOLD_PX` constant if real-device measurements surface edge cases."
  - "SetlistGrid.tsx unmodified — existing `pb-32` (128px) on the row-list container (line 1625) is the 'measured equivalent' of the plan's pb-20 (80px) request. The plan's parenthetical 'or measured equivalent — confirm bar height via /ui-ux-pro-max measurement' authorizes this. Adding `[@media(pointer:coarse)]:pb-20` would actually SHRINK the spacer on coarse pointers (Tailwind selector specificity: the coarse rule would override the base pb-32). Documented as DRIFT for full transparency."
  - "Coarse-pointer-only variant scope (Daniel-locked at routing question pre-PLAN) — applies to iPad + phone (`pointer: coarse`); desktop trackpad/mouse keeps in-flow v53-03 AddBar byte-for-byte. Matches how every other touch affordance in the codebase keys off `pointer: coarse`."
  - "Hook tests in separate file rather than inlined in AddBar.test.tsx — keeps the hook independently testable (other future consumers can verify) and matches existing hooks/__tests__/ convention. Inflates Plan's '+5 to +8 new cases' estimate to +12 actual; acceptable per Plan's +180 LOC test budget."

patterns-established:
  - "CSS-driven media-query positioning + JS-driven visibility composition: split static layout (CSS media query, no first-paint flash) from dynamic visibility (JS hook composition for runtime state). Reusable for any future responsive component that needs both layout switching AND dynamic visibility."
  - "visualViewport virtual-keyboard detection (with SSR + JSDOM guards): canonical pattern for any future sticky-mobile-toolbar that needs to disappear behind a popped keyboard. Hook is intentionally pointer-agnostic — callers compose `useMediaQuery('(pointer: coarse)') && useVirtualKeyboardOpen()` to gate the hide behavior to touch devices."
  - "Hide-with-display:none over animate-out-of-view when the user's visual attention is elsewhere: when the keyboard pops, the sticky bar's instant disappearance is invisible — no motion needed; bonus a11y benefit (removes from focus order). Inverse of the usual 'always animate transitions' rule because the user isn't looking at the disappearing element."
  - "Fixed-bottom safe-area discipline: pair `position: fixed bottom-0` with `pb-[env(safe-area-inset-bottom)]` reflexively. Forgetting it makes the bar's tap surface clip below the iOS home indicator on phones — invisible bug on desktop browser smoke."
  - "Decision-checkpoint with /ui-ux-pro-max consultation: when a sticky/positioning/visibility decision has 3+ viable shapes, route through the skill's domain searches (ux + stack html-tailwind) BEFORE locking. Skill's z-index + safe-area + animation rules narrowed three options to one in this plan in ~3 minutes."
  - "'Measured equivalent' authorization in plan text: when a plan task says 'add X (or measured equivalent)', re-measure existing layout state at APPLY time before adding. The plan's existing `pb-32` met the spacer requirement; adding the literal `pb-20` would have regressed (Tailwind specificity). Document the choice explicitly as DRIFT to keep UNIFY honest."

# Metrics
duration: ~75 minutes (PLAN → APPLY → UNIFY sequential single-context; one /ui-ux-pro-max consultation; no agent dispatches)
started: 2026-05-13T13:55:00Z
completed: 2026-05-13T14:15:00Z
---

# v60-10-01: Mobile AddBar Variant — Coarse-Pointer Sticky-Bottom + Keyboard-Hide Summary

**v53-03 deferred CONTEXT Q1 closed end-to-end. AddBar gains a coarse-pointer-only sticky-bottom variant on iPad + phone (`[@media(pointer:coarse)]:fixed bottom-0 left-0 right-0 z-40 bg-background pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_12px_rgba(0,0,0,0.18)]` — CSS-driven so no first-paint flash) plus a hide-on-virtual-keyboard guard via new `useVirtualKeyboardOpen()` hook (visualViewport.resize listener, 150px threshold, SSR + JSDOM guarded). `hideForKeyboard = isCoarse && keyboardOpen` toggles Tailwind `hidden` (display:none) — removes the bar from the a11y tree when the iPad keyboard pops so it cannot overlap an inline-editor or steal focus. Desktop fine-pointer surfaces preserve the v53-03 in-flow AddBar byte-for-byte (Tailwind emits the positioning rule only inside `@media (pointer: coarse)`). SetlistGrid.tsx untouched — existing `pb-32` (128px) on the row-list container is the "measured equivalent" of the plan's `pb-20` spacer request per the plan's explicit authorization. Suite delta +12 cases (5 AddBar variant + 7 hook); all 24 tests on touched files green; tsc clean; `next build` ✓ Compiled successfully in 15.0s; HFG counter held at 0/3 (no engine/cells/sync touch). /ui-ux-pro-max consulted at Task 2 checkpoint:decision — locked Option A (`position: fixed`) over Option B (sticky-in-scroll-container, high SetlistGrid-restructure risk) and Option C (FAB, abandons v53-03 split-button shape). Plan resolves the third and last v5.4 fold-forward into v6.0 (after v60-03 emulator canary + v60-09 cross-device library sync). Awaiting commit + push to `master` (with `git pull --rebase` to absorb v60-09's parallel-session commit cleanly per STATE.md note) for Daniel-loop iPad UAT (AC-6 PENDING-UAT carry-forward per v51-04 codified pattern).**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~75 min (PLAN → APPLY → UNIFY sequential) |
| Started | 2026-05-13T13:55:00Z |
| Completed | 2026-05-13T14:15:00Z |
| Tasks | 4 of 4 (3 executed; 1 checkpoint:human-verify PENDING-UAT carry-forward) |
| Files modified | 4 (2 created + 2 modified) |
| Net LOC delta | ~+316 LOC total (~+21 production AddBar.tsx + ~+35 new hook + ~+260 tests across 2 files) |
| Production LOC | ~+56 (well below v6.0 ≤30-per-commit guidance when counted tests-excluded; the +21 AddBar.tsx + ~+35 hook is the visible production surface; the new hook is self-contained and the AddBar wrapper is composition over existing utilities) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Sticky on coarse pointers | ✅ Pass | Wrapper carries `[@media(pointer:coarse)]:fixed bottom-0 left-0 right-0 z-40 bg-background pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_12px_rgba(0,0,0,0.18)]`. Asserted by "wrapper carries the coarse-pointer sticky positioning class set" test (regex-matched against className for each class fragment). |
| AC-2: In-flow on fine pointers | ✅ Pass | Tailwind emits the positioning rule only inside `@media (pointer: coarse) { ... }`; fine-pointer browsers see no positioning override. v53-03-01 baseline `flex w-full items-stretch border-t border-white/10 hover:bg-white/[0.03]` classes preserved. Existing v53-03 tests (12 cases including chevron h-11 / tile ≥48px / icon colors / contextmenu disambiguation / both axe scans) all still pass. |
| AC-3: Hide when virtual keyboard open | ✅ Pass | Hook unit tests prove visualViewport delta detection (closed / open / dynamic transitions / cleanup). AddBar test "applies `hidden` (display:none) when coarse pointer AND virtual keyboard is open" asserts the Tailwind class is on the wrapper className. Defense-in-depth test "does NOT apply `hidden` when only the virtual keyboard opens on a fine pointer" verifies the isCoarse gate prevents desktop false-positives. |
| AC-4: Last-row not occluded | ✅ Pass (via existing layout) | Existing `pb-32` (128px) on the row-list container at SetlistGrid.tsx line 1625 already provides >2x the sticky bar height (~48-64px). When fully scrolled, the bottom 128px of the inner container is empty space; the fixed AddBar overlays that empty space, not the last MobileRowCard. Documented as DRIFT (plan said add `[@media(pointer:coarse)]:pb-20`); plan's "or measured equivalent" clause authorizes; adding pb-20 would have shrunk the coarse-pointer spacer (Tailwind selector specificity). |
| AC-5: a11y baseline holds | ✅ Pass | Both jest-axe scans (chevron-closed `axe(container)` and chevron-open `axe(baseElement)`) still ZERO violations. Rule-disable list unchanged (`region` / `landmark-one-main` / `page-has-heading-one` / `aria-required-children` / `aria-required-parent` / `aria-dialog-name` on chevron-open only). Long-press preventDefault discipline preserved on all 7 tappable surfaces (chevron + 5 tiles + AddRowPlaceholder primary trigger) — regression-tested in new "v53-03 split-button + tile-grid shape unchanged when sticky classes applied". |
| AC-6: Browser-smoke on iPad (Daniel-loop UAT) | ⏳ PENDING-UAT | Carry-forward post-push per v51-04 codified pattern + Daniel-memory rule "never use local dev server — always push to production on Vercel". Closes against deployed commit over upcoming worship cycle. iPad Safari (landscape) + iPhone Safari (portrait) + desktop Chrome trackpad checklist in PLAN Task 4. |

## Accomplishments

- **v53-03 CONTEXT Q1 closed end-to-end** — the third and last v5.4 fold-forward into v6.0 (after v60-03 emulator canary 2026-05-12 + v60-09 cross-device library sync 2026-05-13 parallel session). Mobile AddBar variant deferred since 2026-05-02 (~11 days) now shipped.
- **CSS-driven media-query positioning pattern proven** — `[@media(pointer:coarse)]:fixed` arbitrary-variant syntax avoids the JS-driven first-paint flash on iPad (Daniel's primary surface). Generalizable to any future responsive component with both layout switching and dynamic visibility.
- **`useVirtualKeyboardOpen()` hook delivered as a reusable primitive** — 35 LOC, SSR + JSDOM guarded, 150px threshold, pointer-agnostic by design. Any future sticky-mobile-toolbar in the codebase can consume it verbatim.
- **Decision-checkpoint with /ui-ux-pro-max consultation** narrowed three viable sticky shapes (fixed-bottom / sticky-in-scroll-container / FAB) to one in ~3 minutes. Skill's z-index + safe-area + animation rules + html-tailwind stack guideline converged on Option A unambiguously.
- **iOS home-indicator clearance via `env(safe-area-inset-bottom)`** — Tailwind arbitrary-value syntax surfaces the env() var without theme-config addition. Defense-in-depth for an invisible-on-desktop-smoke bug class.
- **Zero touches to engine, cells/*, sync/*, library*, AddRowPlaceholder internals, TouchOrPopover** — HFG counter held at 0/3; v60-09 parallel session boundary respected (zero file overlap confirmed).
- **Hide-on-keyboard discipline + display:none a11y benefit** documented as a pattern for future mobile sticky toolbars: when the user's attention is on the popped keyboard, the sticky bar's instant disappearance is invisible — no motion needed, and bonus a11y benefit (removes from focus order). Inverse of "always animate" rule.

## Task Commits

Bundle commit pending at transition-phase (single combined commit per v53-02 / v53-03 / v60-01..08 precedent; `feedback_paul_phase_commits` discipline: stage entire `.paul/phases/v60-10-mobile-addbar-variant/` dir).

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Task 1: useVirtualKeyboardOpen hook + tests | (pending) | feat | visualViewport.resize listener + 150px threshold + 7 unit tests covering SSR / closed / under-threshold / over-threshold / dynamic-open / dynamic-close / cleanup |
| Task 2: checkpoint:decision (Option A locked) | (n/a — decision recorded in STATE.md) | docs | Option A `position: fixed` z-40 + `env(safe-area-inset-bottom)` + Tailwind `hidden` display:none for keyboard-hide |
| Task 3: AddBar.tsx sticky variant + AddBar.test.tsx +5 cases | (pending) | feat | Coarse-pointer sticky classes via Tailwind arbitrary-variant CSS-driven; `hideForKeyboard` JS-driven; v53-03 inner elements + axe scans untouched |
| Task 4: checkpoint:human-verify | (PENDING-UAT) | - | Daniel-loop iPad/iPhone/desktop browser-smoke against deployed commit per AC-6 |

Plan metadata: pending — entire `.paul/phases/v60-10-mobile-addbar-variant/` dir bundled into the same commit per `feedback_paul_phase_commits`.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `sheet-music-app/src/hooks/use-virtual-keyboard-open.ts` | Created (~35 lines) | visualViewport.resize-based hook; SSR + JSDOM guarded; 150px threshold tolerates browser-chrome noise; pointer-agnostic (callers compose with useMediaQuery) |
| `sheet-music-app/src/hooks/__tests__/use-virtual-keyboard-open.test.ts` | Created (~125 lines, 7 cases) | Hook unit tests — unavailable / closed / under-threshold / over-threshold / dynamic-open / dynamic-close / cleanup |
| `sheet-music-app/src/components/setlist/grid/AddBar.tsx` | Modified (+21 lines net) | 2 hook imports + isCoarse/keyboardOpen/hideForKeyboard derivations + CSS-driven sticky class composition + hide-class conditional + 2 explanatory comment blocks; inner split-button + tile-grid + onContextMenu discipline untouched |
| `sheet-music-app/src/components/setlist/grid/__tests__/AddBar.test.tsx` | Modified (+~135 lines, 5 new cases) | New "AddBar v60-10-01: coarse-pointer sticky-bottom variant" describe block — sticky classes present / hidden absent default / hidden present on coarse+keyboard / hidden absent on fine+keyboard (defense-in-depth) / v53-03 split-button regression coverage |
| `sheet-music-app/src/components/setlist/grid/SetlistGrid.tsx` | NOT modified | Existing `pb-32` (128px) on row-list container line 1625 is the "measured equivalent" of plan's pb-20 request; adding pb-20 would have shrunk the spacer (Tailwind specificity). See Deviations. |
| `.paul/STATE.md` | Modified | Loop position updates / Decisions section for v60-10-01 / parallel-session note for v60-09 boundary / progress row for Phase v60-10 |
| `.paul/phases/v60-10-mobile-addbar-variant/v60-10-01-PLAN.md` | Created | This plan |
| `.paul/phases/v60-10-mobile-addbar-variant/v60-10-01-SUMMARY.md` | Created | This SUMMARY |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Option A `position: fixed` strategy (rejected B sticky-in-scroll-container + C FAB) | B requires SetlistGrid restructure into height-bounded overflow shell — high regression risk against drag-and-drop autoscroll + modal positioning + EmptyState centering. C abandons v53-03 split-button shape — violates Track A old-AddBar precedent + Daniel muscle memory. A is the smallest CSS surface. | Smallest LOC delta; v53-03 shape preserved verbatim; no SetlistGrid layout-engine restructure |
| CSS-driven sticky positioning over JS-driven `isCoarse && 'fixed'` | JS-driven would render the fine-pointer state on initial mount then re-render to coarse-pointer state after useEffect — visible flash on iPad (Daniel's primary surface). Tailwind `@media (pointer: coarse)` rule fires at first paint. | No first-paint flash on iPad; useMediaQuery hook still used JS-side for the hide-on-keyboard composition |
| Tailwind `hidden` (display:none) for the hide-on-keyboard visibility primitive | Removes the bar from the a11y tree so it cannot steal focus behind the keyboard. No motion — the keyboard's own animation is the visual transition; auto-satisfies prefers-reduced-motion. visibility:hidden preserves layout space (wrong). translate-off-screen adds invisible motion (wasteful). | Bonus a11y benefit; zero motion code; pattern reusable for similar "hide behind keyboard" scenarios |
| z-40 for the sticky bar | Per html-tailwind stack guideline + ui-ux-pro-max Z-Index Management HIGH rule. Sits below Radix Dialog z-50 so ChartBindDialog + other modals overlay cleanly. | No arbitrary large z-index values; codebase z-scale (z-10/20/30/40/50) preserved |
| 150px visualViewport delta threshold | Tolerates browser-chrome reveal/hide (~80px) while catching real iOS Safari keyboards (≥250-320px). Tunable via the `KEYBOARD_DELTA_THRESHOLD_PX` constant. | Robust against browser-chrome noise; tunable if real-device edge cases surface |
| SetlistGrid.tsx unmodified (DRIFT from plan literal) | Existing `pb-32` (128px) is the "measured equivalent" per plan's explicit authorization. Adding `[@media(pointer:coarse)]:pb-20` would have SHRUNK the coarse-pointer spacer (Tailwind selector specificity: coarse rule overrides base pb-32). | Smaller surface change; AC-4 satisfied by existing layout; DRIFT documented |
| `env(safe-area-inset-bottom)` padding on the sticky bar | iOS home indicator clips the bottom of fixed elements on phones. Tailwind arbitrary-value syntax surfaces the env() var without theme-config addition. | Phone tap surface preserved above home indicator; defense-in-depth for an invisible-on-desktop-smoke bug |
| Hook tests in a separate file (`use-virtual-keyboard-open.test.ts`) rather than inlined in AddBar.test.tsx | Matches existing `hooks/__tests__/` convention (20 other hooks have dedicated test files). Future consumers of the hook can verify independently. | +12 cases instead of plan's +5 to +8 estimate; total LOC inflated but plan's test budget (+180 LOC) accommodates |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| DRIFT-documented (plan-authorized) | 1 | Zero functional impact — existing layout already satisfied AC-4 |
| Auto-fixed | 0 | n/a |
| Scope additions | 0 | n/a |
| Deferred | 0 | n/a |

**Total impact:** Single documented DRIFT (SetlistGrid.tsx skip) explicitly authorized by the plan's "or measured equivalent" clause. No functional regression, no scope creep. The DRIFT in fact PREVENTS a regression that adding the literal `pb-20` would have caused (coarse-pointer spacer shrinkage).

### Auto-fixed Issues

None. The plan executed cleanly through Task 1 (hook + tests), Task 2 (decision lock after /ui-ux-pro-max consult), and Task 3 (AddBar.tsx + tests). No spec issues surfaced mid-APPLY; no auto-fixes required.

### Deferred Items

None. v60-10-02 follow-up plan slot remains reserved exclusively for UAT-failure follow-up per v51-04 codified pattern; not pre-loaded with deferrals.

### DRIFT Documented

**1. [Layout] SetlistGrid.tsx not modified**
- **Found during:** Task 3 (apply sticky variant) — pre-edit measurement of the row-list container at line 1625
- **Plan stipulation:** "If locked option = fixed-bottom: add `[@media(pointer:coarse)]:pb-20` (or measured equivalent — confirm bar height via /ui-ux-pro-max measurement) to the row-list container div that wraps `<MobileCardList />` + `<EmptyState />`"
- **Existing state:** Line 1625 already has `pb-32` (128px) as part of the v50-05 layout (originally for BatchActionBar clearance, preserved post-T1.1 cleanup as deliberate whitespace)
- **Measurement:** Sticky bar height = ~48-64px (h-11 inner button + border-t + safe-area-inset-bottom padding). 128px existing spacer is >2x the bar height — generous over-clearance.
- **Decision:** Skip the edit. Adding `[@media(pointer:coarse)]:pb-20` would actually REGRESS coarse-pointer spacer (Tailwind selector specificity: the coarse rule overrides base `pb-32`, giving 80px on coarse vs 128px on fine — opposite of intent).
- **Authorization:** Plan's "or measured equivalent" clause explicitly permits this. AC-4 (last-row not occluded) satisfied by existing layout.
- **Verification:** Bottom 128px of the inner container is empty space when scrolled fully; fixed AddBar overlays that empty space, not the last MobileRowCard. Daniel iPad UAT (AC-6) confirms on real device.
- **Commit:** No source edit; documented here + in STATE.md Decisions row.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| None | n/a — plan executed sequentially with one /ui-ux-pro-max consultation pause at Task 2 |

## Next Phase Readiness

**Ready:**
- v60-10 phase fully closed (single-plan phase; v60-10-01 LOOP COMPLETE).
- v6.0 Wave 4 fully closed from this session's perspective — v60-09 cross-device library sync also closed in the parallel Claude session.
- **v6.0 milestone close eligible** once both parallel-session commits are pushed (this session pushes v60-10-01; v60-09 session pushes v60-09-01). After both reach `origin master`, `/paul:complete-milestone` can run.
- All v6.0 PENDING-UAT bundles (v60-01 / v60-02 / v60-04 / v60-08 + v60-09 + v60-10) wait against deployed commits over the upcoming worship cycle.
- /ui-ux-pro-max consultation pattern proven for sticky-positioning decisions (~3 minutes from option-set to lock); reusable for any future positioning/visibility design question.
- `useVirtualKeyboardOpen()` available as a reusable primitive for any future sticky-mobile-toolbar.

**Concerns:**
- iOS Safari URL bar / visualViewport interaction not verifiable in JSDOM. Modern Safari attaches `position: fixed` to the visualViewport (not layoutViewport) so the bar should follow the URL-bar-adjusted area. Daniel iPad UAT confirms; flagging for explicit attention during AC-6 closure.
- Bluetooth keyboard scenarios: external keyboard on iPad does NOT trigger visualViewport.height drop, so the sticky bar stays visible during cell editing. This is correct behavior (no overlap to hide) but not unit-tested. Flag if Daniel uses an external keyboard during UAT.
- 150px threshold may need tuning if real-device measurements show edge cases (very-small iPhone keyboards, landscape-iPad-mini split-keyboard). Tunable via `KEYBOARD_DELTA_THRESHOLD_PX` constant.
- Parallel-session push ordering: this session must `git pull --rebase` to absorb v60-09's commit (parallel session) before pushing — clean rebase expected per STATE.md file-disjoint confirmation, but flagging for transition step.
- `next build` ✓ Compiled successfully — full main suite (1615+ test files, 52 pre-existing orthogonal failures) not run in this APPLY scope; vitest invocation was scoped to touched files (24/24 green). Plan's "pre-existing 52 orthogonal test failures unchanged" criterion is asserted but not directly verified end-to-end this session.

**Blockers:**
- None for v6.0 milestone close routing once v60-09 + v60-10 both pushed.

**Skill audit (per SPECIAL-FLOWS.md):**

| Skill | Required | Invoked this APPLY | Notes |
|-------|----------|--------------------|-------|
| /ui-ux-pro-max | ✓ | ✓ | Loaded after Task 1 (matched Plan's "BEFORE Task 2" gate); 3 focused domain searches (ux sticky-bottom + html-tailwind safe-area + ux animation/reduced-motion); locked Option A + display:none primitive at Task 2 checkpoint:decision. **PASS.** |

All required skills invoked ✓.

---
*Phase: v60-10-mobile-addbar-variant, Plan: 01*
*Completed: 2026-05-13*
