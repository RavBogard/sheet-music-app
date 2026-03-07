# Roadmap: CRC Music v2.0

## Overview

CRC Music v2.0 is a setlist-first rebuild of the worship music platform for Central Reform Congregation. The existing backend (Firebase Auth, Firestore, Google Drive sync, AI chord detection, transposition engine) is sound and stays. The UI layer gets a ground-up rebuild: from PDF-first to setlist-first, from desktop-assumed to mobile-first, from 157 accumulated components to ~50-60 purpose-built ones. The build follows a strangler fig migration -- v1 routes stay alive until v2 replacements are validated at actual Shabbat services. Six phases deliver the app from architectural foundation through the killer feature (X32 personal monitor mixing) to operational readiness.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation and Architecture** - Scaffold v2 with 3-store state, UI primitives, auth, profiles, offline infrastructure, and strangler fig strategy
- [ ] **Phase 2: Live Performance Setlist View** - The product: musicians open the app, see their setlist at a glance, swipe through the service, never lose their place
- [ ] **Phase 3: Setlist Creation and Service Flow Builder** - Admin tooling to replace the Google Doc workflow with drag-drop service flow building
- [ ] **Phase 4: Sheet Music, Library, and Drive Sync** - PDF viewer with transposed chord overlays, library browsing, and hardened Google Drive sync
- [ ] **Phase 5: X32 Monitor Mixing** - Personal monitor mix self-service from phones via WebSocket-to-UDP proxy on the LAN
- [ ] **Phase 6: Scheduling, Notifications, and Operations** - Who's playing this week, setlist alerts, and operational readiness for regular use

## Phase Details

### Phase 1: Foundation and Architecture
**Goal**: A working v2 scaffold exists with premium UI primitives, consolidated state management, Firebase auth with profiles, offline infrastructure, and documented strangler fig cutover strategy -- so every subsequent phase builds on a clean, consistent foundation
**Depends on**: Nothing (first phase)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, FOUND-04, FOUND-05, FOUND-06, FOUND-07, AUTH-01, AUTH-02, AUTH-03, PROF-01, PROF-02
**Success Criteria** (what must be TRUE):
  1. User can sign in with Google OAuth on a phone and their session persists across browser refreshes
  2. User can set their instrument and transposition preferences in their profile, and those settings are stored and recalled on next visit
  3. App shell loads on mobile with shadcn/ui components, smooth Motion animations, and responsive layout -- feels like a native app, not a web form
  4. App displays an offline fallback page when the network is unavailable (service worker caching is active)
  5. v1 routes remain accessible and functional alongside v2 routes (strangler fig pattern verified)
**Plans**: TBD

Plans:
- [ ] 01-01: TBD
- [ ] 01-02: TBD
- [ ] 01-03: TBD

### Phase 2: Live Performance Setlist View
**Goal**: A musician opens the app on their phone, sees the upcoming service setlist with every song displayed in their personal key, swipes through the service flow (songs and non-song items), and never loses their place -- this works offline after first load
**Depends on**: Phase 1 (auth, profiles, state stores, offline infrastructure)
**Requirements**: PERF-01, PERF-02, PERF-03, PERF-04, PERF-05, PERF-06, PERF-07, TRANS-01, TRANS-02
**Success Criteria** (what must be TRUE):
  1. Musician sees the full service setlist at a glance: song title, their transposed key, tempo/feel, and notes -- without tapping into anything
  2. Musician swipes to advance through the service flow; current item is clearly highlighted and next item is visible
  3. Non-song items (readings, prayers, transitions) appear as first-class items in the setlist alongside songs
  4. A trumpet player and a guitarist looking at the same setlist see different keys for the same song, matching their instrument profile
  5. Musician can tap a song to drill into the sheet music PDF (secondary action, not the default)
  6. The entire performance view works offline after the initial cache load, including screen wake lock
**Plans**: TBD

Plans:
- [ ] 02-01: TBD
- [ ] 02-02: TBD
- [ ] 02-03: TBD

**Note**: This is the first vertical slice validated at an actual Shabbat service. Musicians must abandon paper after this phase. Validate the non-song service item data model (Kabbalat Shabbat, Torah, D'var structure) before building the UI.

### Phase 3: Setlist Creation and Service Flow Builder
**Goal**: The band leader (Daniel) can build a complete service flow -- songs from the library, non-song items, ordering, keys, tempos, notes -- and publish it so all assigned musicians instantly see the setlist in Phase 2's performance view
**Depends on**: Phase 2 (Firestore setlist data model validated against the performance view)
**Requirements**: CREATE-01, CREATE-02, CREATE-03, CREATE-04, CREATE-05, CREATE-06
**Success Criteria** (what must be TRUE):
  1. Band leader can create a new setlist by searching the library and adding songs
  2. Band leader can drag-drop to reorder songs and non-song items (readings, prayers, transitions) in the service flow
  3. Band leader can set key, tempo/feel, and notes for each song in the setlist
  4. Band leader can publish a setlist; all assigned musicians see it appear in their performance view immediately
  5. Band leader can edit a published setlist and changes propagate to musicians without requiring them to refresh
**Plans**: TBD

Plans:
- [ ] 03-01: TBD
- [ ] 03-02: TBD
- [ ] 03-03: TBD

**Note**: Verify `dnd-kit` compatibility with React 19 and Server Components before starting drag-drop implementation. This phase makes the Google Doc setlist workflow obsolete.

### Phase 4: Sheet Music, Library, and Drive Sync
**Goal**: Musicians can browse the music library, view sheet music PDFs with AI-detected chords transposed to their key, correct chord errors that persist, and trust that new files added to Google Drive appear reliably in the app
**Depends on**: Phase 2 (performance view provides the drill-down entry point), Phase 1 (offline infrastructure)
**Requirements**: LIB-01, LIB-02, LIB-03, LIB-04, TRANS-03, TRANS-04, TRANS-05
**Success Criteria** (what must be TRUE):
  1. Musician can browse and search the music library and see all songs synced from Google Drive
  2. Musician can view a sheet music PDF with AI-detected chord symbols overlaid and transposed to their instrument's key
  3. Musician can add, edit, or delete chord overlays on a PDF when the AI detection is wrong, and those corrections persist across sessions
  4. A new PDF added to the Google Drive folder appears in the app library automatically within one sync cycle, without manual intervention
  5. Drive sync recovers gracefully from errors (retry logic, webhook renewal) without silent failures
**Plans**: TBD

Plans:
- [ ] 04-01: TBD
- [ ] 04-02: TBD
- [ ] 04-03: TBD

### Phase 5: X32 Monitor Mixing
**Goal**: Each musician can adjust their personal monitor mix levels from their phone during rehearsal and services, without touching the sound board or asking the sound engineer -- while the sound engineer retains full board control via Mixing Station
**Depends on**: Phase 2 (performance view is the context where mixing happens), Phase 1 (MixerStore, auth)
**Requirements**: MIX-01, MIX-02, MIX-03, MIX-04, MIX-05, MIX-06
**Success Criteria** (what must be TRUE):
  1. Musician can see their assigned monitor bus channels and adjust fader levels from their phone
  2. Musician can mute/unmute individual channels in their personal monitor mix
  3. Sound engineer can assign monitor bus mappings to individual musicians through the app's admin interface
  4. X32 connection is maintained reliably via WebSocket-to-UDP proxy on a LAN device with keepalive handling in the proxy (not the browser)
  5. App functions normally (setlist, library, everything else) when the X32 proxy is offline -- mixing degrades gracefully with a clear status indicator
**Plans**: TBD

Plans:
- [ ] 05-01: TBD
- [ ] 05-02: TBD
- [ ] 05-03: TBD

**RESEARCH REQUIRED**: X32 OSC protocol has non-obvious behaviors (no-self-echo, initial state polling, `/xremote` keepalive timeout, meter data as raw ArrayBuffer). Run a research spike before writing any bridge or client code. Document the exact OSC message sequence for: initial connect + state poll, fader set, mute toggle, and graceful disconnect. Verify whether `x32-proxy` 2.5.8 handles local broadcast natively or requires custom implementation.

**Risk Flags:**
- X32 keepalive expiry silently breaks monitor sessions mid-service if handled in browser instead of proxy
- X32 does not echo its own OSC commands back to the sender -- proxy must implement local state broadcast
- Raspberry Pi deployment adds operational complexity (PM2, systemd, physical hardware in the audio rack)
- Sound engineer needs a runbook for proxy management before this goes live

### Phase 6: Scheduling, Notifications, and Operations
**Goal**: Band leader can assign musicians to services, musicians know when they're playing and when the setlist is ready, and the system is operationally ready for regular weekly use without Daniel being the single point of failure
**Depends on**: Phase 3 (setlist publish is the trigger for notifications), Phase 1 (user model)
**Requirements**: SCHED-01, SCHED-02, NOTIF-01, NOTIF-02
**Success Criteria** (what must be TRUE):
  1. Band leader can assign musicians to a service and musicians can see who else is playing
  2. Musicians receive a notification when they are assigned to a service
  3. Musicians receive a notification when a setlist is published or updated for their service
  4. A substitute musician can be onboarded (sign in, set profile, see their setlist) within 5 minutes on their phone
**Plans**: TBD

Plans:
- [ ] 06-01: TBD
- [ ] 06-02: TBD

**Note**: iOS PWA push notifications have historically been unreliable. Verify current iOS 17+/18+ Safari push notification support before committing to the push notification architecture. Android PWA push is well-documented and reliable. Consider in-app notification as a fallback.

## Dependency Graph

```
Phase 1: Foundation
  |
  +---> Phase 2: Live Performance Setlist View
  |       |
  |       +---> Phase 3: Setlist Creation
  |       |       |
  |       |       +---> Phase 6: Scheduling & Notifications
  |       |
  |       +---> Phase 4: Sheet Music & Drive Sync
  |       |
  |       +---> Phase 5: X32 Monitor Mixing
  |
  (v1 routes remain live throughout all phases)
```

**Critical path:** 1 --> 2 --> 3 --> 6
**Parallel after Phase 2:** Phases 4 and 5 can execute in parallel with Phase 3 (architecturally independent)

## Research Flags

| Phase | Research Needed | Reason |
|-------|-----------------|--------|
| Phase 1 | None | Standard patterns; official docs are authoritative |
| Phase 2 | Light | Non-song service item data model (Jewish liturgical structure) needs design |
| Phase 3 | Light | Verify `dnd-kit` + React 19 compatibility |
| Phase 4 | None | PDF viewer and Drive webhook renewal are well-documented |
| Phase 5 | **FULL SPIKE** | X32 OSC protocol quirks, `x32-proxy` capabilities, proxy deployment model |
| Phase 6 | Moderate | iOS PWA push notification current status for iOS 17+/18+ |

## Coverage

All 44 v1 requirements mapped to exactly one phase:

| Phase | Requirements | Count |
|-------|-------------|-------|
| 1. Foundation and Architecture | FOUND-01..07, AUTH-01..03, PROF-01..02 | 12 |
| 2. Live Performance Setlist View | PERF-01..07, TRANS-01, TRANS-02 | 9 |
| 3. Setlist Creation and Service Flow Builder | CREATE-01..06 | 6 |
| 4. Sheet Music, Library, and Drive Sync | LIB-01..04, TRANS-03..05 | 7 |
| 5. X32 Monitor Mixing | MIX-01..06 | 6 |
| 6. Scheduling, Notifications, and Operations | SCHED-01..02, NOTIF-01..02 | 4 |
| **Total** | | **44** |

Mapped: 44/44
Unmapped: 0

**Note:** REQUIREMENTS.md states "42 total" but contains 44 unique requirement IDs (verified by checkbox count). Each requirement maps to exactly one phase with no orphans or duplicates.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 --> 2 --> 3 --> 4 --> 5 --> 6
(Phases 3, 4, 5 can potentially run in parallel after Phase 2 -- see dependency graph)

| Phase | Plans Complete | Status | Completed |
|-------|---------------|--------|-----------|
| 1. Foundation and Architecture | 0/3 | Not started | - |
| 2. Live Performance Setlist View | 0/3 | Not started | - |
| 3. Setlist Creation and Service Flow Builder | 0/3 | Not started | - |
| 4. Sheet Music, Library, and Drive Sync | 0/3 | Not started | - |
| 5. X32 Monitor Mixing | 0/3 | Not started | - |
| 6. Scheduling, Notifications, and Operations | 0/2 | Not started | - |

---
*Roadmap created: 2026-03-07*
*Last updated: 2026-03-07*
