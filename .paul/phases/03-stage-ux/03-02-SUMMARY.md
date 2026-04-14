---
phase: 03-stage-ux
plan: 02
subsystem: ui
tags: [react, error-boundary, keyboard-nav, nextjs-routing, pdf]

requires:
  - phase: 03-stage-ux
    provides: SwapPicker keyboard convention (Esc closes)
provides:
  - PDFOverlay Esc-to-close with PrintModal precedence
  - SectionErrorBoundary around PDFViewer/SmartScoreViewer (toolbar preserved outside)
  - Single `fixed inset-0 z-50` wrapper on /perform/[fileId]

affects: [03-03-notifications, 03-04-performance-polish]

tech-stack:
  added: []
  patterns:
    - "Boundary remount via key={track.fileId} as a resetKey substitute on a minimal ErrorBoundary"
    - "Child-modal-aware Escape handler: close topmost layer first, stopPropagation, respect defaultPrevented"

key-files:
  created: []
  modified:
    - src/components/performance/PDFOverlay.tsx
    - src/app/perform/[fileId]/page.tsx

key-decisions:
  - "Boundary scope = viewer only, not whole overlay — toolbar must stay reachable as the escape hatch after a crash"
  - "`key={track.fileId}` to reset boundary on track change (SectionErrorBoundary has no resetKeys prop; adding one would violate SCOPE LIMITS)"

patterns-established:
  - "Modal Escape handlers should stopPropagation + check defaultPrevented so nested modals compose predictably"

duration: ~20min
completed: 2026-04-14
---

# Phase 03 Plan 02: PDFOverlay Hardening Summary

**PDFOverlay now survives a viewer crash without blanking the stage screen: SectionErrorBoundary around PDFViewer/SmartScoreViewer (toolbar stays outside), Escape closes PrintModal-first-then-overlay, and the `/perform/[fileId]` route no longer double-wraps with `fixed inset-0 z-50`.**

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Esc closes PDFOverlay (with PrintModal precedence) | Pass | document keydown; guards defaultPrevented; PrintModal-first close |
| AC-2: ErrorBoundary catches PDFViewer crashes | Pass | SectionErrorBoundary with `key={track.fileId}`; toolbar stays functional outside boundary |
| AC-3: Single wrapper on /perform/[fileId] | Pass | Outer `<div className="fixed inset-0 z-50 bg-background">` removed; PDFOverlay's own root is the sole wrapper |

## Accomplishments

- Crash-survivable viewer: if PDF.js / OSMD throws, musicians see a labeled "Chart failed to load" card with Retry, and the bottom toolbar still lets them return home.
- Consistent Esc convention across SwapPicker (03-01) and PDFOverlay (03-02).
- Removed latent double-wrap on `/perform/[fileId]` — safe-area padding and z-index stacks now single-sourced through PDFOverlay.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/components/performance/PDFOverlay.tsx` | Modified | Import SectionErrorBoundary, add Esc keydown effect, wrap viewer in boundary with `key={track.fileId}` |
| `src/app/perform/[fileId]/page.tsx` | Modified | Remove redundant `fixed inset-0 z-50 bg-background` wrapper; return PDFOverlay directly |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Boundary wraps viewer only, not toolbar | Toolbar must remain reachable after a viewer crash so leader can navigate out | Error fallback retains working exit path |
| `key={track.fileId}` as reset strategy | SectionErrorBoundary has no resetKeys prop; modifying it was out of SCOPE LIMITS; remount on track change is equivalent for this use case | Users can navigate past a crashed chart by picking another track |
| `document` listener, not window | Matches modal-escape convention; composes cleanly with child modals | PrintModal's own close on Esc still wins because PrintModal binds its own handler and would `preventDefault()` if needed; our guard respects that |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 0 | — |
| Scope additions | 0 | — |
| Deferred | 0 | — |

**Total impact:** Followed plan exactly.

### Auto-fixed Issues

None.

### Deferred Items

None.

## Issues Encountered

None.

## Skill Audit

| Expected | Invoked | Notes |
|----------|---------|-------|
| /ui-ux-pro-max | ✓ | Loaded earlier in session; guided a11y + boundary placement |

## Verification

- `npx tsc --noEmit` — clean.
- `npx eslint src/app/perform/[fileId]/page.tsx src/components/performance/PDFOverlay.tsx` — clean.
- `npx vitest run src/components/performance/__tests__/pdf-overlay.test.tsx` — 12/12 passed (1.24s).
- Human-verify approved by user on 2026-04-14 checkpoint.

## Next Phase Readiness

**Ready:**
- 2/4 plans of Phase 3 complete.
- Keyboard-close convention now established across SwapPicker + PDFOverlay.

**Concerns:**
- None.

**Blockers:**
- None.

**Next plan:** `03-03 Setlist-updated notification` (fix Firestore-rules-blocked `users` query in `notifySetlistUpdated`; musician-side "Setlist updated" toast on swap).

---
*Phase: 03-stage-ux, Plan: 02*
*Completed: 2026-04-14*
