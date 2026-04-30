# Track C — Touch affordance discoverability sweep (Issue 5 + audit)

## Executive Summary

**Total findings: 5 | P0: 2 | P1: 2 | P2: 1**

The app has critical hover-to-reveal affordances blocking iPad workflows. Two P0 issues: SetlistCards kebab menu hidden at md+ breakpoint on `md:opacity-0 md:group-hover:opacity-100`; CalendarDayCell "Plan Service" button hidden on `opacity-0 group-hover:opacity-100`. Fix: always-show on `(pointer: coarse)` per v50-05-04 precedent. Est. 3 LOC total.

Issue 7 is not a hover-to-reveal problem—it's CTA hierarchy (Edit button visually secondary). Out of scope for this audit.

## Audit Method

Pattern searches: `group-hover:opacity-`, `md:opacity-0 md:group-hover:opacity-100`, `opacity-0` hover reveals, JS-driven `onMouseEnter/Leave`. Files examined: SetlistCards.tsx, CalendarDayCell.tsx, SetlistGridTopBar.tsx, DragHandleCell.tsx, MobileRowCard.tsx, UserRow.tsx, CompactSetlistRow.tsx, and all grid cells. Key assumption: iPad at any width is `(pointer: coarse)`. Per v50-05-04: "Touch detection keys on (pointer: coarse) media query, NOT viewport width."

## Audit Findings

| ID | Surface | Component:Lines | Control | Mechanism | Severity | Fix |
|----|---------|-----------------|---------|-----------|----------|-----|
| C-01 | Setlist list (upcoming) | SetlistCards.tsx:80 | Kebab menu | `md:opacity-0 md:group-hover:opacity-100` | **P0** | Add `[@media(pointer:coarse)]:opacity-100` |
| C-02 | Setlist list (past/lib) | SetlistCards.tsx:208 | Kebab menu | `md:opacity-0 md:group-hover:opacity-100` | **P0** | Add `[@media(pointer:coarse)]:opacity-100` |
| C-03 | Calendar planning | CalendarDayCell.tsx:104 | Plan Service button | `opacity-0 group-hover:opacity-100` | **P0** | Add `[@media(pointer:coarse)]:opacity-100` |
| C-04 | Setlist card | SetlistCards.tsx:58 | Watermark icon | `opacity-10 group-hover:opacity-20` | P1 | Fine as-is (cosmetic) |
| C-05 | HeroCard | HeroCard.tsx:201,216 | Arrow icon | `opacity-60 group-hover:opacity-100` | P1 | Fine as-is (visual affordance) |

## Issue 7 Surface Analysis

**Reported:** "Edit setlist" should be primary CTA, not secondary.

**Finding:** No "Close setlist" button exists. The issue is in setlist list cards (SetlistCards.tsx). "Edit Setlist" button is `variant="secondary"` (muted gray) at lines 136-143 and 255-262. "Clone" is featured with `bg-brand/10`. This is CTA hierarchy mismatch, not hover-to-reveal.

**Verdict:** Out of scope for this audit. Recommend bundling styling fix in v52-04 as companion to hover-to-reveal sweep.

## Recommended Unified Policy

Always-show on touch: append `[@media(pointer:coarse)]:opacity-100` to any hover-reveal control that is the sole path to critical actions (delete, duplicate, edit).

Pattern:
```
md:opacity-0 md:group-hover:opacity-100 [@media(pointer:coarse)]:opacity-100 transition-opacity
```

Reference v50-05-04: "hover-revealed affordances become always-visible on touch." DragHandleCell already always-visible; ChartCell unbound contrast bumped on coarse.

## Phase Recommendation

### P0 (v52-04)
- C-01: SetlistCards.tsx:80 — 1 LOC
- C-02: SetlistCards.tsx:208 — 1 LOC
- C-03: CalendarDayCell.tsx:104 — 1 LOC
- Total: 3 LOC, <5 min

### P1 (defer)
- C-04, C-05 to v52-05+

### Issue 7 (optional companion)
- Styling fix in SetlistCards.tsx (swap button variant)
- Recommend in v52-04

## Files That Would Change

1. `src/components/setlist/SetlistCards.tsx` line 80: add `[@media(pointer:coarse)]:opacity-100`
2. `src/components/setlist/SetlistCards.tsx` line 208: add `[@media(pointer:coarse)]:opacity-100`
3. `src/components/calendar/CalendarDayCell.tsx` line 104: add `[@media(pointer:coarse)]:opacity-100`

## Open Questions

1. Confirm iPad at md (768px) should always see kebab—YES (iPad is always touch).
2. Should "Plan Service" be visible at rest or only on hover? Recommend: always-visible on coarse (reduces friction).
3. Add C-04, C-05 to next polish milestone ROADMAP?

## Sources

- Files: SetlistCards.tsx, CalendarDayCell.tsx, SetlistGridTopBar.tsx, DragHandleCell.tsx, MobileRowCard.tsx, UserRow.tsx, CompactSetlistRow.tsx
- Docs: v50-05-04 SUMMARY.md (TouchOrPopover, ContextMenu long-press, useMediaQuery(pointer:coarse) precedent)

---
Audit completed 2026-04-30. Confidence: HIGH on P0 findings.
