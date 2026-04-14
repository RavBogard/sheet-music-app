---
phase: 03-stage-ux
plan: 01
subsystem: ui
tags: [react, keyboard-nav, accessibility, ios-safari, swap-flow]

requires:
  - phase: 02-weekly-workflow-polish
    provides: stable swap/perform UI surface
provides:
  - SwapPicker keyboard-driven selection (Esc/Enter/Arrow) with highlight
  - Empty initial search query on open
  - iOS Safari autofocus hardening (setTimeout + rAF two-step)

affects: [03-02-pdfoverlay, 04-editor-cleanup]

tech-stack:
  added: []
  patterns:
    - "Selection-by-index + data-selected attribute for keyboard-navigable lists"
    - "Two-step focus workaround (setTimeout past animation + requestAnimationFrame refocus) for iOS Safari"

key-files:
  created: []
  modified:
    - src/components/performance/SwapPicker.tsx

key-decisions:
  - "Scoped keydown to search input (not window) to avoid colliding with perform-page shortcuts"
  - "Mouseenter syncs selectedIndex so mouse + keyboard share one highlight"

patterns-established:
  - "data-selected=true + ring-inset + bg-muted for highlight (works inside scroll containers)"

duration: ~15min
completed: 2026-04-13
---

# Phase 03 Plan 01: SwapPicker Polish Summary

**SwapPicker is now keyboard-first and iOS-reliable: empty-start query, Esc/Enter/Arrow bindings with visible highlight and scroll-into-view, and a two-step autofocus that survives the slide-in animation.**

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Empty initial query | Pass | `useState("")`; default slice (first 20 PDFs) still shown |
| AC-2: Keyboard bindings | Pass | Esc/Enter/ArrowUp/ArrowDown wired on input; wrap-around; scrollIntoView on selection change |
| AC-3: iOS autofocus hardening | Pass (user-approved on human-verify) | Retained 100ms setTimeout, added chained `requestAnimationFrame` refocus |

## Accomplishments

- Removed pre-fill friction: leader types replacement name immediately, no Clear tap.
- Full keyboard control for iPad + Bluetooth-keyboard users (arrows / Enter / Esc).
- Selection highlight distinct from hover, kept in view on arrow nav (`scrollIntoView({ block: "nearest" })`).
- Accessibility polish: `aria-label` on close button and search input, `type="button"` on all buttons, `cursor-pointer` on rows.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/components/performance/SwapPicker.tsx` | Modified | Empty initial query, keyboard bindings + selection state, scrollIntoView, iOS autofocus two-step, a11y labels |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Input-scoped keydown (not window) | Avoid colliding with perform-page shortcuts; picker is modal so input owns focus anyway | No listener cleanup needed; cleaner teardown |
| Mouseenter syncs selectedIndex | Unifies hover + keyboard highlight so Enter always picks the visually-highlighted row | Predictable Enter behavior under mixed input |
| `data-selected` + Tailwind `data-[selected=true]:*` | Lets one className string express both states; no className arithmetic | Reduces re-render churn |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 0 | — |
| Scope additions | 2 | Minor a11y polish (aria-label, type=button) — within plan spirit |
| Deferred | 0 | — |

**Total impact:** Followed plan. Added small a11y improvements while in the file (close button + input aria-labels, explicit `type="button"`). No scope creep.

### Auto-fixed Issues

None.

### Deferred Items

None.

## Issues Encountered

None. Typecheck and lint clean on first run.

## Skill Audit

| Expected | Invoked | Notes |
|----------|---------|-------|
| /ui-ux-pro-max | ✓ | Loaded before edit; guided a11y and token-only styling |

## Verification

- `npx tsc --noEmit` — clean (no errors touching SwapPicker)
- `npx eslint src/components/performance/SwapPicker.tsx` — clean
- No existing SwapPicker tests to regress
- Human-verify: user approved on 2026-04-13 after prod deploy

## Next Phase Readiness

**Ready:**
- Phase 3 progressing (1/4 plans complete).
- Selection-by-index pattern available for reuse in future list UIs.

**Concerns:**
- None surfaced.

**Blockers:**
- None.

**Next plan:** `03-02 PDFOverlay hardening` (ErrorBoundary + Esc-to-close + unify `/perform` route wrappers).

---
*Phase: 03-stage-ux, Plan: 01*
*Completed: 2026-04-13*
