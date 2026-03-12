# PAUL Handoff

**Date:** 2026-03-12
**Status:** paused

---

## READ THIS FIRST

**Project:** sheet-music-app (CentralReform.live)

---

## What Was Done This Session

1. **Phase 8 completed:** Monitor tab on mobile bottom bar opens QuickMonitorPanel popover instead of navigating to /monitor. Removed non-functional speaker icon from setlist perform header. Drawer scroll fix verified by user.

2. **Fixed 2 flaky tests:** use-upcoming-prep urgency label tests needed `vi.setSystemTime()` and midnight event times for deterministic `Math.ceil` behavior.

3. **Phase 9 completed:** Print cover page now excludes chartless items (only shows tracks with fileId + headers). Sticky key assignments — `lastUsedKey`/`lastUsedTransposition` saved to `library_index` when key changed, loaded when adding songs from library.

4. **Phase 10 verified complete:** Public setlist access already works — middleware allows /perform/*, Firestore rules allow public reads, file proxy accepts same-origin browser requests. No code changes needed.

5. **Phase 10.1 designed (not implemented):** Full design discussion with user for mobile action bar redesign.

---

## Phase 10.1 Design Spec

Transform MobileTabBar from navigation links into a live-resources action bar:

| Slot | Icon | Action | Details |
|------|------|--------|---------|
| Left | `Search` | Library song search popup | Search all songs, open chart directly |
| Center | `ListMusic` | Navigate to current setlist | Slightly larger (w-7 h-7), subtle glow |
| Right | `Radio` | QuickMonitorPanel popup | Already built from Phase 8 |

**Setlist navigation logic:**
1. If user opened a setlist this session → go to that one (in perform mode)
2. Otherwise → nearest future `eventDate` setlist (in perform mode)

**Constraints:**
- Mobile only (hidden on md:)
- Hidden during PDF view (PerformanceToolbar takes over)
- Aesthetic consistency with PerformanceToolbar: material-thick, border-brand/10, same icon sizing
- Center setlist button gets subtle glow/elevation (not dramatic)
- Search and Monitor are popovers, Setlist is navigation

**Key files to modify:**
- `src/components/nav/MobileTabBar.tsx` — full rewrite
- May need a session store or context for "last opened setlist" tracking
- Existing `useContentSearch` hook may provide search functionality

---

## What's Next

1. `/paul:plan` for Phase 10.1 (Mobile Action Bar Redesign)
2. After 10.1: Phase 11 (Component Tests), Phase 12 (AI & Integration Tests)

---

## Git State

Last commit: 8650480
Branch: master
All changes pushed to origin.

---

*Handoff created: 2026-03-12*
