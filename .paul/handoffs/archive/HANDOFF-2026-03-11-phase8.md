# PAUL Handoff

**Date:** 2026-03-11
**Status:** context-limit

---

## READ THIS FIRST

You have no prior context. This document tells you everything.

**Project:** sheet-music-app (CentralReform.live)
**Core value:** Musicians can instantly access setlists, transpose charts, and control monitor mixes — live on any device, no paper or prep needed.

---

## Current State

**Milestone:** v2.5 Bugsweep & Test Coverage
**Phase:** 8 of 14 — Performance UX Fixes
**Plan:** 08-01 — APPLY in progress (3 auto tasks done, 1 human-verify checkpoint pending)

**Loop Position:**
```
PLAN ──▶ APPLY ──▶ UNIFY
  ✓        ◐        ○     [APPLY in progress — checkpoint pending]
```

---

## What Was Done This Session

- Phase 8.1 (Setlist Access Bug Fixes) — full loop completed:
  - Firestore rules: added isAdmin() + isBandLeader() to setlist read, isAdmin() to update
  - Server page: guarded ownerId with truthiness check (missing = legacy accessible)
  - Created scripts/backfill-owner-id.js (needs service-account.json to run)
  - Improved auto-save error messaging (removed misleading "check internet")
  - Firestore rules deployed, code pushed, commit ecf74b8
- Phase 8 (Performance UX Fixes) — 3 of 4 tasks complete:
  - Task 1: "Audio" → "Monitor", "Metronome" → "BPM" in toolbar (commit 4d573c9)
  - Task 2: SetlistDrawer ScrollArea replaced with flex layout (fix attempt, commit 02987f5)
  - Task 3: Monitor mix speaker button added to setlist perform page header (commit 02987f5)

---

## What's In Progress

- **Phase 8 human-verify checkpoint BLOCKED — two issues found:**
  1. **Setlist drawer still problematic:** Shows content briefly then goes blank, or shows but isn't scrollable. Root cause: the flex height chain (min-h-0, overflow-auto) fix was attempted but needs more debugging. The virtualizer's parentRef div needs a concrete height from its parent chain.
  2. **Speaker icon not visible** in setlist perform view header. Changed `size="sm"` to `size="icon"` but user still doesn't see it. May need to check the actual Button component variants or the icon might be too subtle (muted-foreground color on dark background).

---

## What's Next

**Immediate:** Debug and fix the two Phase 8 issues:
1. SetlistDrawerLegacy.tsx — virtualizer scroll fix (inspect the flex/height chain from SheetContent down to parentRef)
2. Speaker icon visibility in src/app/perform/setlist/[id]/page.tsx — check Button size="icon" variant, possibly increase icon size or add visible styling

**After that:**
- Get human-verify checkpoint approved
- Run /paul:unify for Phase 8
- Continue to Phase 9 (Print View & Sticky Keys)

---

## Decisions Made This Session

| Decision | Rationale |
|----------|-----------|
| All existing setlists assigned to admin UID | Rabbi Daniel created them all |
| Band leaders granted read on all setlists | Randy needs non-public setlist access |
| Missing ownerId = legacy accessible (truthiness guard) | Don't redirect on old data |
| Phase 8.1 inserted as decimal phase | Urgent production bugs before UX work |

---

## Key Files

| File | Purpose |
|------|---------|
| `.paul/STATE.md` | Live project state |
| `.paul/ROADMAP.md` | Phase overview |
| `.paul/phases/08-performance-ux-fixes/08-01-PLAN.md` | Current plan being executed |
| `src/components/performance/SetlistDrawerLegacy.tsx` | Broken drawer — needs scroll fix |
| `src/app/perform/setlist/[id]/page.tsx` | Missing speaker icon |
| `src/components/performance/PerformanceToolbar.tsx` | Labels updated (done) |
| `src/components/performance/MetronomeControl.tsx` | BPM label (done) |

---

## Git State

Last commit: 02987f5
Branch: master
All changes pushed to origin.

---

## Resume Instructions

1. Run `/paul:resume`
2. Focus on fixing the two Phase 8 issues (drawer scroll + speaker icon)
3. After fixes verified, complete the human-verify checkpoint
4. Then /paul:unify to close Phase 8

---

*Handoff created: 2026-03-11*
