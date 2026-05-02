# Research Findings: Polymorphic Add Menu and Chart-Peek Interaction

## Pass 1 | Mode: Broad

**Target:** v53-01 recursive research; Track C  
**Date:** 2026-05-02

## Current State

**AddRowPlaceholder.tsx (1–181):** Single cmdk picker with Library Songs + Custom free-text. Both hardcode `type: 'song'` (SetlistGrid.tsx:1444, 1481).

**TrackType union (models.ts:34):** 6 values — `'song' | 'header' | 'reading' | 'prayer' | 'transition' | 'note'`.

**TypeCell.tsx (20–51):** TYPE_OPTIONS defines icon vocabulary (Music, BookOpen, Heart, ArrowRight, Heading, StickyNote).

**ChartCell.tsx (1–52):** 40×44px FileText button. Bound: indigo-400. No peek affordance.

**ChartBindPopover.tsx (1–152):** Modal picker, searchable library songs, highlights current songId (line 130).

**Sticky-memory (defaults.ts, SongDefaults):** Stores key, lead, bpm only — NO chartId. Chart binding is manual, per-setlist.

## Polymorphic Add — 3 Options [Rank: 1/2/3]

### Option A: Grouped CommandList [Rank: 1 — STRONGEST]

One picker with CommandGroups: Library, Service items (Reading/Prayer/Transition), Structure (Header/Note), Custom. Type-prefix search (/r, /p, etc.).

**Pros:** Zero substrate, TYPE_OPTIONS reuse, single mental model, power-user fast.  
**Cons:** Service/Structure undiscoverable, type-prefix needs escape logic.  
**Touch target:** CommandItems py-1 (~16px) — MUST bump to min-h-[44px] on touch.  
**Recommendation:** Minimal change, reuses patterns.

### Option B: Split-Button [Rank: 2]

Primary "Add Song" + chevron-popover with type tiles (48×48px, 2-column).

**Pros:** One-tap Add Song (matches old-editor).  
**Cons:** Two layers, non-song types 2 taps, layout tight.  
**Risk:** Long-press conflict with row context-menu.  
**Recommendation:** VIABLE if one-tap is critical.

### Option C: Type-Prefixed Shortcuts [Rank: 3 — WEAKEST]

Extend CommandInput: /r → Reading, /p → Prayer, etc.

**Cons:** UNDISCOVERABLE, slash conflicts with song titles.  
**Recommendation:** Hidden power-user path, not primary flow.

## Chart-Peek — 3 Options [Rank: 1/2/3]

### Option A: Row-Side Thumbnail [Rank: 2]

32×40px PDF first-page inline if bound.

**Pros:** Zero-tap verify.  
**Cons:** Layout density (row forced to 48+ height), perf cost (N PDF.js workers), too small for readability.  
**Risk:** Perf unvalidated; in-memory adapter hides races.

### Option B: Tap ChartCell → Peek Modal [Rank: 1 — STRONGEST]

Modal/sheet showing first-page (300×400px) + "Open" + "Re-bind" buttons.

**Pros:** Zero idle perf, readable, re-bind one tap, reuses PDF infra.  
**Cons:** 1 tap to peek.  
**Recommendation:** Balances ease with zero perf cost.

### Option C: Hover-Card + Long-Press [Rank: 3 — WEAKEST]

Desktop hover (100ms) + iPad long-press (500ms).

**Cons:** Long-press CONFLICT (row context 500ms), UNDISCOVERABLE, keyboard GAP.  
**Recommendation:** iPad undiscoverable, keyboard excludes users.

## Sticky-Memory Auto-Bind: NO

Contract (types.ts:38–50): key, lead, bpm only — NO chartId.

**Reason:** Chart binding is setlist-specific. Auto-bind last-used clobbers per-setlist choice.

## Open Questions for Daniel

1. Polymorphic Add (A/B/C)? Old split-button critical or grouped picker OK? If A: recency-first or alphabetical library?
2. Chart-peek (A/B/C)? Always-on thumbnail worth perf cost, or one-tap modal sufficient?
3. Sticky-memory auto-bind when re-adding song? Stay manual (recommended).
4. Touch-target CommandItems? Bump to min-h-[44px] [@media(pointer:coarse)]:py-2? (Required.)

## Risks (Summary)

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Option A: 44px floor violated (CommandItem py-1) | HIGH | REQUIRED: bump to min-h-[44px]. Code change. |
| Option A: Service/Structure undiscoverable | MEDIUM | Hint row or expand Library. |
| Option B: Long-press conflicts row context | HIGH | Disambiguate. Test. |
| Peek A: Perf cost (N PDF renders) | MEDIUM | Firebase emulator test. |
| Peek C: iPad long-press undiscoverable | HIGH | Keyboard gap. Reject. |

## Sources

- AddRowPlaceholder.tsx (1–181)
- ChartBindPopover.tsx (1–152)  
- ChartCell.tsx (1–52)
- TypeCell.tsx (20–51)
- DropdownCell.tsx (45, 264)
- models.ts (34)
- defaults.ts, types.ts (38–50)
- SetlistGrid.tsx (487–497, 1430–1486)

