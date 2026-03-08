# Requirements: CRC Music v2.0

**Defined:** 2026-03-07
**Core Value:** A musician sets their tablet on a music stand, sees this week's service at a glance, drills into PDFs when needed, and adjusts their monitor mix in 1-2 taps.

## Setlist Performance View

- [ ] **SET-01**: Musician sees the full service flow at a glance on a portrait tablet: song title, their transposed key, tempo/feel, and notes — without tapping into anything
- [ ] **SET-02**: Non-song items (readings, prayers, transitions, Torah service) appear as first-class items in the service flow alongside songs
- [ ] **SET-03**: Current position is clearly highlighted so musician never loses their place during a service
- [ ] **SET-04**: Musician taps a song to open the PDF viewer immersively (full-screen, setlist gets out of the way)
- [ ] **SET-05**: Musician can return to the setlist view quickly and fluidly from the PDF viewer (slide-out drawer, back gesture, or equivalent)
- [ ] **SET-06**: Screen stays awake during performance mode (wake lock)
- [ ] **SET-07**: Each musician sees every song in their instrument's key automatically based on their profile (auto-transposition at a glance)

## Setlist Editor

- [ ] **EDIT-01**: Band leader can create a new setlist from a service template that pre-fills the liturgical skeleton (16 templates: 7 regular, 9 holiday)
- [ ] **EDIT-02**: Band leader can duplicate a previous setlist and modify it (the primary weekly workflow)
- [ ] **EDIT-03**: Band leader can add songs from the library, set key, tempo/feel, lead musician, and notes for each song
- [ ] **EDIT-04**: Band leader can add, reorder, and edit non-song items (readings, prayers, transitions) in the service flow
- [ ] **EDIT-05**: Band leader can drag-drop to reorder all items in the service flow
- [ ] **EDIT-06**: Band leader can publish a setlist, making it visible to all assigned musicians
- [ ] **EDIT-07**: Band leader can edit a published setlist (changes propagate to musicians)
- [ ] **EDIT-08**: Setlist creation is faster than a spreadsheet — minimal clicks, keyboard-friendly, tab-through fields
- [ ] **EDIT-09**: AI can auto-fill a setlist from a template with reasonable defaults via natural language command
- [ ] **EDIT-10**: AI accepts chat commands for setlist modifications ("add Mi Chamocha in Am after the responsive reading")

## Monitor Mixing

- [ ] **MIX-01**: Musician can see their assigned monitor channels and adjust fader levels from their tablet
- [ ] **MIX-02**: Musician can mute/unmute individual channels in their personal monitor mix
- [ ] **MIX-03**: Configure mode: musician can star/select which channels (6-8) they want to see during live performance
- [ ] **MIX-04**: Live mode: only starred channels are visible — clean, fast, no clutter
- [ ] **MIX-05**: Sound engineer can pre-configure which channels each musician sees
- [ ] **MIX-06**: Sound engineer can assign monitor bus mappings to individual musicians via the app
- [ ] **MIX-07**: Monitor controls are always 1-2 taps away from any screen in the app (setlist, PDF, home)
- [ ] **MIX-08**: Bridge/proxy architecture is stupid simple to install on the production PC or LAN device
- [ ] **MIX-09**: Bridge auto-starts, auto-reconnects, and requires zero technical troubleshooting during a service
- [ ] **MIX-10**: App shows clear connection status — if X32 isn't reachable, musician sees an obvious indicator, not silent failure
- [ ] **MIX-11**: App functions normally (setlist, library, everything) when X32/bridge is offline — mixing degrades gracefully
- [x] **MIX-12**: Bridge architecture validated through research spike before any implementation code is written

## PDF Viewer (Existing — No Changes)

- [ ] **PDF-01**: Existing PDF viewer with AI chord detection, transposed overlays, and annotations continues to work as-is
- [ ] **PDF-02**: PDF view is immersive — when open, it owns the full screen
- [ ] **PDF-03**: Monitor quick-adjust and setlist navigation remain accessible from within PDF view without breaking immersion

## Library & Drive Sync

- [ ] **LIB-01**: Musician can browse and search the music library
- [ ] **LIB-02**: New files added to Google Drive appear in the app library via sync
- [ ] **LIB-03**: Drive sync is robust with retry logic and error recovery — no silent failures, no admin duct tape needed
- [ ] **LIB-04**: Library management in-app: upload and organize files directly (in addition to Drive sync)

## Authentication & Profiles

- [ ] **AUTH-01**: User can sign in with Google OAuth
- [ ] **AUTH-02**: User can sign in via QR code
- [ ] **AUTH-03**: User session persists across browser refresh
- [x] **AUTH-04**: Role-based access: admin (Daniel), band leader, musician, sound engineer
- [x] **PROF-01**: Musician profile includes name, instrument(s), transposition preferences
- [x] **PROF-02**: Profile settings (instrument, transposition) are applied automatically across the entire app

## Public Access

- [ ] **PUB-01**: Band leader can mark a setlist as public (no authentication required to view)
- [ ] **PUB-02**: Community members can access a public setlist and view PDFs without signing in
- [ ] **PUB-03**: Public view is read-only: setlist + PDFs only (no monitoring, no editing, no transposition)

## Scheduling & Notifications

- [ ] **SCHED-01**: Band leader can assign musicians to a service
- [ ] **SCHED-02**: Musicians can see who else is playing at each service
- [ ] **NOTIF-01**: Musicians receive notifications (push and/or SMS) when assigned to a service
- [ ] **NOTIF-02**: Musicians receive notifications when a setlist is published or updated

## Home Screen

- [ ] **HOME-01**: When a musician opens the app, they see this week's upcoming service with the setlist, who's playing, and quick access to perform
- [ ] **HOME-02**: Home screen is focused on the next service — not a dashboard with multiple competing sections

## Print Pipeline

- [ ] **PRINT-01**: Band leader can generate PDF gig packets for a setlist
- [ ] **PRINT-02**: Gig packets can be emailed to musicians (especially guest musicians)

## Code Quality & Architecture

- [ ] **CODE-01**: Codebase audit — identify and remove dead code, unused components, abandoned features
- [ ] **CODE-02**: Consolidate Zustand stores from 8 fragmented stores to a focused architecture
- [ ] **CODE-03**: Backend systems are robust enough that admin duct-tape tools are unnecessary
- [ ] **CODE-04**: Admin tooling simplified to essentials: user management and library management

## v2 (After Launch)

- **SCHED-V2-01**: Musicians can mark dates they're unavailable
- **SCHED-V2-02**: AI-powered musician suggestions based on availability
- **SCHED-V2-03**: iCal feed export
- **MIX-V2-01**: Musicians can save and recall personal mix presets
- **PERF-V2-01**: Live follow mode — all musicians' views advance together when leader changes position
- **LIB-V2-01**: Key and topic filters for library browsing
- **OFFLINE-01**: Full offline support — all setlist data and PDFs cached proactively

## Out of Scope

| Feature | Reason |
|---------|--------|
| Task management system | Over-engineered for 10-person user base |
| Analytics/usage dashboard | No users yet to analyze |
| 8-week rotation matrix | Premature optimization |
| Multi-tenancy / multi-congregation | Build for CRC first |
| Real-time collaborative editing | One person builds setlists, others consume |
| Replacing Mixing Station | Sound engineer keeps Mixing Station for full board control |
| Availability calendar | v2 feature — simple assign-and-notify is enough for launch |
| AI musician suggestions | v2 feature |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SET-01 | Phase 3 | Pending |
| SET-02 | Phase 3 | Pending |
| SET-03 | Phase 3 | Pending |
| SET-04 | Phase 3 | Pending |
| SET-05 | Phase 3 | Pending |
| SET-06 | Phase 3 | Pending |
| SET-07 | Phase 3 | Pending |
| EDIT-01 | Phase 4 | Pending |
| EDIT-02 | Phase 4 | Pending |
| EDIT-03 | Phase 4 | Pending |
| EDIT-04 | Phase 4 | Pending |
| EDIT-05 | Phase 4 | Pending |
| EDIT-06 | Phase 4 | Pending |
| EDIT-07 | Phase 4 | Pending |
| EDIT-08 | Phase 4 | Pending |
| EDIT-09 | Phase 4 | Pending |
| EDIT-10 | Phase 4 | Pending |
| MIX-01 | Phase 2 | Pending |
| MIX-02 | Phase 2 | Pending |
| MIX-03 | Phase 2 | Pending |
| MIX-04 | Phase 2 | Pending |
| MIX-05 | Phase 2 | Pending |
| MIX-06 | Phase 2 | Pending |
| MIX-07 | Phase 2 | Pending |
| MIX-08 | Phase 2 | Pending |
| MIX-09 | Phase 2 | Pending |
| MIX-10 | Phase 2 | Pending |
| MIX-11 | Phase 2 | Pending |
| MIX-12 | Phase 1 | Complete |
| PDF-01 | — | Existing |
| PDF-02 | — | Existing |
| PDF-03 | Phase 3 | Pending |
| LIB-01 | Phase 5 | Pending |
| LIB-02 | Phase 5 | Pending |
| LIB-03 | Phase 5 | Pending |
| LIB-04 | Phase 5 | Pending |
| AUTH-01 | — | Existing |
| AUTH-02 | — | Existing |
| AUTH-03 | — | Existing |
| AUTH-04 | Phase 1 | Complete (01-03) |
| PROF-01 | Phase 1 | Complete (01-03) |
| PROF-02 | Phase 1 | Complete (01-03) |
| PUB-01 | Phase 3 | Pending |
| PUB-02 | Phase 3 | Pending |
| PUB-03 | Phase 3 | Pending |
| SCHED-01 | Phase 6 | Pending |
| SCHED-02 | Phase 6 | Pending |
| NOTIF-01 | Phase 6 | Pending |
| NOTIF-02 | Phase 6 | Pending |
| HOME-01 | Phase 3 | Pending |
| HOME-02 | Phase 3 | Pending |
| PRINT-01 | Phase 5 | Pending |
| PRINT-02 | Phase 5 | Pending |
| CODE-01 | Phase 1 | Pending |
| CODE-02 | Phase 1 | Pending |
| CODE-03 | Phase 5 | Pending |
| CODE-04 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 53 total (excluding 3 already existing)
- Mapped to phases: 53
- Unmapped: 0

---
*Requirements defined: 2026-03-07*
