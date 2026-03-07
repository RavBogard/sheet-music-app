# Requirements: CRC Music v2.0

**Defined:** 2026-03-07
**Core Value:** A musician opens the app, sees exactly what's coming up — song title, their key, tempo, notes — and performs the entire service without flipping through a binder or asking "what key?"

## v1 Requirements

### Foundation

- [ ] **FOUND-01**: App uses consolidated 3-store Zustand architecture (auth, setlist, mixer) instead of 8 fragmented stores
- [ ] **FOUND-02**: App uses feature-based folder structure with clear component boundaries (~50-60 components, not 157)
- [ ] **FOUND-03**: App uses Tailwind v4 + shadcn/ui component system with premium visual design
- [ ] **FOUND-04**: App uses Motion (Framer Motion 11+) for smooth animations and swipe gestures
- [ ] **FOUND-05**: Service worker caches all static assets and setlist data for offline use via Serwist/Workbox
- [ ] **FOUND-06**: IndexedDB stores setlist data and song metadata for offline access
- [ ] **FOUND-07**: Mobile-first responsive design — primary experience is phone-sized, desktop is secondary

### Setlist Performance

- [ ] **PERF-01**: Musician sees their upcoming service setlist with song title, their transposed key, tempo/feel, and quick notes — at a glance
- [ ] **PERF-02**: Musician swipes to advance to next song/item during a live service
- [ ] **PERF-03**: Service flow includes non-song items (readings, prayers, transitions, announcements) as first-class items alongside songs
- [ ] **PERF-04**: Current position is clearly highlighted so musician never loses their place
- [ ] **PERF-05**: Performance view works fully offline after initial cache
- [ ] **PERF-06**: Musician can tap a song to drill into sheet music PDF if needed (secondary action)
- [ ] **PERF-07**: Screen stays awake during performance mode (wake lock)

### Setlist Creation

- [ ] **CREATE-01**: Band leader can create a new setlist by selecting songs from the library and ordering them
- [ ] **CREATE-02**: Band leader can drag-drop to reorder songs and service flow items
- [ ] **CREATE-03**: Band leader can add non-song items (readings, prayers, transitions) to the service flow
- [ ] **CREATE-04**: Band leader can set key, tempo/feel, and notes for each song
- [ ] **CREATE-05**: Band leader can publish a setlist, making it visible to all assigned musicians
- [ ] **CREATE-06**: Band leader can edit a published setlist (changes propagate to musicians)

### Transposition

- [ ] **TRANS-01**: Each musician sees every song in their instrument's key automatically based on their profile
- [ ] **TRANS-02**: Musician can set their instrument and transposition preference once in their profile
- [ ] **TRANS-03**: AI-detected chords are rendered as overlays on sheet music PDFs with accurate positioning
- [ ] **TRANS-04**: Musician can manually add, edit, or delete chord overlays if AI detection is wrong
- [ ] **TRANS-05**: Manual chord corrections persist across sessions and cache invalidations

### Monitor Mixing

- [ ] **MIX-01**: Musician can adjust their personal monitor mix levels from their phone during rehearsal/service
- [ ] **MIX-02**: Musician can mute/unmute individual channels in their monitor mix
- [ ] **MIX-03**: Sound engineer can assign monitor bus mappings to individual musicians via the app
- [ ] **MIX-04**: Music director (band leader) has monitor mix control like any musician
- [ ] **MIX-05**: X32 connection uses WebSocket-to-UDP proxy (x32-proxy on Raspberry Pi or LAN device) — no Electron
- [ ] **MIX-06**: Monitor mixing works reliably with X32 keepalive handling in the proxy, not the browser

### Library

- [ ] **LIB-01**: Musician can browse and search the music library (synced from Google Drive)
- [ ] **LIB-02**: Musician can view sheet music PDFs with transposed chord overlays
- [ ] **LIB-03**: New files added to Google Drive appear automatically in the app library via sync
- [ ] **LIB-04**: Drive sync is reliable with retry logic and error recovery

### Scheduling & Notifications

- [ ] **SCHED-01**: Band leader can assign musicians to a service
- [ ] **SCHED-02**: Musicians can see who else is playing at each service
- [ ] **NOTIF-01**: Musicians receive notifications when assigned to a service
- [ ] **NOTIF-02**: Musicians receive notifications when a setlist is published or updated

### Authentication & Profiles

- [ ] **AUTH-01**: User can sign in with Google OAuth
- [ ] **AUTH-02**: User session persists across browser refresh
- [ ] **AUTH-03**: Role-based access: admin (Daniel), band leader, musician
- [ ] **PROF-01**: Musician profile includes name, instrument(s), transposition preferences
- [ ] **PROF-02**: Profile settings are applied automatically across the entire app

## v2 Requirements

### Scheduling

- **SCHED-V2-01**: Musicians can mark dates they're unavailable (blockout periods)
- **SCHED-V2-02**: Leader sees availability when assigning musicians
- **SCHED-V2-03**: iCal feed export for musicians' personal calendars

### Monitor Mixing

- **MIX-V2-01**: Musicians can save and recall personal mix presets
- **MIX-V2-02**: Mix settings persist between services

### Performance

- **PERF-V2-01**: Live follow mode — all musicians' views advance together when leader changes position
- **PERF-V2-02**: Metronome/click track integrated into performance view

### Library

- **LIB-V2-01**: Key and topic filters for library browsing
- **LIB-V2-02**: Song usage analytics (how often each song is played)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Admin analytics dashboard | No users yet to analyze; premature optimization |
| Audio file library | Separate concern, not core to setlist/performance |
| Tasks dashboard | Over-engineered for 10-person user base |
| AI chat agent for setlist commands | Clever but unnecessary complexity |
| Multi-tenancy / multi-congregation | Build for CRC first, generalize later |
| QR code sign-in bridge | Unnecessary for known user base |
| Real-time collaborative editing | One person builds setlists, others consume |
| Print pipeline for gig packets | The whole point is replacing paper |
| Replacing Mixing Station | Sound engineer keeps Mixing Station for full board control |
| Song suggestions / AI setlist building | Nice-to-have, not core workflow |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 1 | Pending |
| FOUND-02 | Phase 1 | Pending |
| FOUND-03 | Phase 1 | Pending |
| FOUND-04 | Phase 1 | Pending |
| FOUND-05 | Phase 1 | Pending |
| FOUND-06 | Phase 1 | Pending |
| FOUND-07 | Phase 1 | Pending |
| PERF-01 | Phase 2 | Pending |
| PERF-02 | Phase 2 | Pending |
| PERF-03 | Phase 2 | Pending |
| PERF-04 | Phase 2 | Pending |
| PERF-05 | Phase 2 | Pending |
| PERF-06 | Phase 2 | Pending |
| PERF-07 | Phase 2 | Pending |
| CREATE-01 | Phase 3 | Pending |
| CREATE-02 | Phase 3 | Pending |
| CREATE-03 | Phase 3 | Pending |
| CREATE-04 | Phase 3 | Pending |
| CREATE-05 | Phase 3 | Pending |
| CREATE-06 | Phase 3 | Pending |
| TRANS-01 | Phase 2 | Pending |
| TRANS-02 | Phase 2 | Pending |
| TRANS-03 | Phase 4 | Pending |
| TRANS-04 | Phase 4 | Pending |
| TRANS-05 | Phase 4 | Pending |
| MIX-01 | Phase 5 | Pending |
| MIX-02 | Phase 5 | Pending |
| MIX-03 | Phase 5 | Pending |
| MIX-04 | Phase 5 | Pending |
| MIX-05 | Phase 5 | Pending |
| MIX-06 | Phase 5 | Pending |
| LIB-01 | Phase 4 | Pending |
| LIB-02 | Phase 4 | Pending |
| LIB-03 | Phase 4 | Pending |
| LIB-04 | Phase 4 | Pending |
| SCHED-01 | Phase 6 | Pending |
| SCHED-02 | Phase 6 | Pending |
| NOTIF-01 | Phase 6 | Pending |
| NOTIF-02 | Phase 6 | Pending |
| AUTH-01 | Phase 1 | Pending |
| AUTH-02 | Phase 1 | Pending |
| AUTH-03 | Phase 1 | Pending |
| PROF-01 | Phase 1 | Pending |
| PROF-02 | Phase 1 | Pending |

**Coverage:**
- v1 requirements: 42 total
- Mapped to phases: 42
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-07*
*Last updated: 2026-03-07 after initial definition*
