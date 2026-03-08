# Roadmap: CRC Music v2.0

## Overview

CRC Music v2.0 focuses on three pillars: the setlist experience (editor + performance view), bulletproof monitor mixing, and code quality. The PDF viewer and backend (Firebase, Drive sync, AI chord detection, transposition) are kept. The build order puts the highest-risk, highest-value work first: monitoring research, then code cleanup, then the three pillars, then supporting features.

## Phases

- [x] **Phase 1: Monitor Research Spike + Code Audit** — Deep research into X32 bridge architecture; audit codebase for cleanup
- [ ] **Phase 2: Monitor Mixing Implementation** — Build the bridge, configure mode, and live mode based on research findings
- [ ] **Phase 3: Setlist Performance View** — Tablet-first setlist-at-a-glance with service flow, transposition, PDF integration, public access
- [ ] **Phase 4: Setlist Editor** — Template-based creation, duplicate-and-tweak workflow, AI integration, drag-drop service flow builder
- [ ] **Phase 5: Backend Hardening & Library** — Drive sync robustness, library management, print pipeline, admin simplification, code cleanup execution
- [ ] **Phase 6: Scheduling, Notifications & Polish** — Assign musicians, notifications, home screen, final polish for launch

## Phase Details

### Phase 1: Monitor Research Spike + Code Audit
**Goal**: Answer every open question about how to connect to the X32 reliably and simply, and identify all code cleanup work across the codebase
**Depends on**: Nothing (first phase)
**Requirements**: MIX-12, CODE-01, CODE-02, AUTH-04, PROF-01, PROF-02
**Plans:** 3/3 plans complete
**Success Criteria:**
  1. A written technical document answers: what bridge architecture, what deployment model (Raspberry Pi vs production PC vs other), what install experience, what failure modes, what auto-recovery strategy
  2. A working proof-of-concept demonstrates: connect to X32 from a browser via the chosen bridge, read a fader value, set a fader value, survive a 30-second network interruption
  3. The bridge install process has been tested by a non-technical person (or documented to that standard)
  4. Codebase audit document identifies: dead code to remove, stores to consolidate, components to cut, backend duct-tape to eliminate
  5. User profiles with instrument/transposition preferences work (foundation for Phase 3 auto-transposition)

Plans:
- [x] 01-01-PLAN.md — Bridge architecture research spike, PoC validation, architecture decision document
- [x] 01-02-PLAN.md — Codebase audit document and dead code removal
- [x] 01-03-PLAN.md — Profile and auth role verification with tests

**This phase is research-heavy.** The monitor research determines the entire architecture of Phase 2. Do not write production monitor code until the research is validated with a working proof-of-concept.

### Phase 2: Monitor Mixing Implementation
**Goal**: Musicians can adjust their personal monitor mix from their tablets during rehearsal and services — configure mode for setup, live mode for performance, bulletproof connection
**Depends on**: Phase 1 (bridge architecture validated)
**Requirements**: MIX-01, MIX-02, MIX-03, MIX-04, MIX-05, MIX-06, MIX-07, MIX-08, MIX-09, MIX-10, MIX-11
**Success Criteria:**
  1. Musician opens configure mode, sees all X32 channels, and can star 6-8 channels they care about
  2. Sound engineer can assign monitor bus mappings and pre-configure channel visibility for each musician
  3. Musician opens live mode and sees only their starred channels as clean faders — adjusts a fader and hears the change in their wedge within 200ms
  4. Monitor controls are accessible from the setlist view and PDF view in 1-2 taps
  5. Bridge/proxy runs on the LAN, auto-starts, auto-reconnects after network interruption, and requires zero manual intervention during a service
  6. When X32 is unreachable, the app shows a clear status indicator and all non-monitor features continue working normally

Plans:
- [ ] 02-01-PLAN.md — Configure mode data layer and UI (starring, default channels, monitor page)
- [ ] 02-02-PLAN.md — Live mode popup with vertical faders and simplified QuickMonitorPanel
- [ ] 02-03-PLAN.md — Connection reliability, graceful degradation, and bridge hardening

### Phase 3: Setlist Performance View
**Goal**: A musician sets their tablet on a music stand and sees the full service at a glance — songs in their key, tempo, notes, liturgical flow items — with immersive PDF drill-down and public access for jam sessions
**Depends on**: Phase 1 (profiles with transposition, code audit informs component structure)
**Requirements**: SET-01, SET-02, SET-03, SET-04, SET-05, SET-06, SET-07, PDF-03, PUB-01, PUB-02, PUB-03, HOME-01, HOME-02
**Plans:** 2/3 plans executed

**Success Criteria:**
  1. Musician sees the full service flow at a glance on a portrait tablet: song title, their transposed key, tempo, notes, and non-song liturgical items — without tapping anything
  2. A trumpet player and a guitarist looking at the same setlist see different keys for the same song
  3. Musician taps a song → PDF opens immersively (full screen). Musician can return to setlist fluidly without losing their place
  4. Monitor quick-adjust is accessible from within the PDF view (1-2 taps) without breaking immersion
  5. A community member at a jam session navigates to centralreform.live on their phone, sees the public setlist, and views PDFs — no sign-in required
  6. Home screen shows this week's upcoming service focused, not a busy dashboard

Plans:
- [ ] 03-01-PLAN.md — Dense setlist view with transposition, position highlighting, and wake lock
- [ ] 03-02-PLAN.md — Immersive PDF overlay with bottom bar, setlist drawer, and monitor access
- [ ] 03-03-PLAN.md — Public access for jam sessions and focused home screen redesign

### Phase 4: Setlist Editor
**Goal**: Daniel can build a complete service — songs, readings, prayers, keys, tempos, leads — faster than a spreadsheet, using templates, duplication, and AI assistance
**Depends on**: Phase 3 (performance view validates the setlist data model before building the editor on top of it)
**Requirements**: EDIT-01, EDIT-02, EDIT-03, EDIT-04, EDIT-05, EDIT-06, EDIT-07, EDIT-08, EDIT-09, EDIT-10
**Plans:** 2/3 plans executed
**Success Criteria:**
  1. Band leader selects a service template (from 16 options) and gets a pre-filled liturgical skeleton with the correct structure
  2. Band leader duplicates last week's setlist and swaps 2-3 songs in under 2 minutes
  3. Adding a song: search library → tap to add → set key/tempo/lead inline. No modals, no extra screens unless needed
  4. Drag-drop reordering works for songs and non-song items (readings, prayers, transitions)
  5. AI command: "add Mi Chamocha in Am after the responsive reading" executes correctly
  6. Publishing a setlist makes it immediately visible in musicians' performance view

Plans:
- [ ] 04-01-PLAN.md — Inline accordion editing, search-first song adding, auto-publish, and change notifications
- [ ] 04-02-PLAN.md — Complete 16 liturgical templates and enhance duplicate-and-tweak workflow
- [ ] 04-03-PLAN.md — AI template auto-fill and enhanced chat commands for setlist modifications

### Phase 5: Backend Hardening & Library
**Goal**: Backend systems are robust enough to run without admin duct tape — Drive sync is reliable, library management works in-app, print pipeline is clean, admin is simplified to essentials
**Depends on**: Phases 1-4 (cleanup work identified in Phase 1, executed here alongside library/print work)
**Requirements**: LIB-01, LIB-02, LIB-03, LIB-04, PRINT-01, PRINT-02, CODE-03, CODE-04
**Success Criteria:**
  1. A PDF added to Google Drive appears in the app library within one sync cycle without manual intervention or admin action
  2. Drive sync recovers from transient errors automatically (retry, backoff) — no silent failures
  3. Band leader can upload and organize files directly in the app (not just via Drive)
  4. Band leader can generate and email gig packets for a setlist
  5. Admin interface has exactly two sections: user management and library management — nothing else

Plans:
- [ ] 05-01: TBD
- [ ] 05-02: TBD
- [ ] 05-03: TBD

### Phase 6: Scheduling, Notifications & Polish
**Goal**: Band leader can assign musicians to services, musicians get notified, and the entire app is polished and ready for the band to use at real services
**Depends on**: Phases 2-5 (all features exist, this phase connects them and polishes)
**Requirements**: SCHED-01, SCHED-02, NOTIF-01, NOTIF-02
**Success Criteria:**
  1. Band leader assigns musicians to a service; musicians see who else is playing
  2. Musicians receive push/SMS notification when assigned to a service
  3. Musicians receive notification when a setlist is published or updated
  4. A new musician (or substitute) can sign in, set up their profile, and see their setlist within 5 minutes
  5. End-to-end flow works: create setlist → assign musicians → publish → musicians see it on their tablets → perform with monitor mixing → done

Plans:
- [ ] 06-01: TBD
- [ ] 06-02: TBD

## Dependency Graph

```
Phase 1: Monitor Research + Code Audit
  |
  +---> Phase 2: Monitor Mixing Implementation
  |       |
  |       +---> Phase 6: Scheduling, Notifications & Polish
  |
  +---> Phase 3: Setlist Performance View
  |       |
  |       +---> Phase 4: Setlist Editor
  |               |
  |               +---> Phase 6
  |
  +---> Phase 5: Backend Hardening & Library
          |
          +---> Phase 6
```

**Critical path:** 1 → 2 and 1 → 3 → 4 (can run in parallel after Phase 1)
**Phase 5** can run in parallel with Phases 3-4
**Phase 6** is the convergence point — everything must be done before final polish

## Risk Flags

| Phase | Risk | Mitigation |
|-------|------|------------|
| Phase 1 | X32 bridge architecture may have no good simple answer | Research multiple approaches; accept complexity if needed but document install process thoroughly |
| Phase 2 | X32 OSC protocol has non-obvious behaviors (no self-echo, keepalive timeout, meter data format) | Phase 1 proof-of-concept must exercise all critical paths |
| Phase 3 | Setlist/PDF coexistence UX on portrait tablet needs design exploration | Prototype multiple approaches (drawer, split view, overlay) before committing |
| Phase 4 | dnd-kit + React 19 compatibility not verified | Test early in phase; have fallback drag-drop approach |
| Phase 6 | iOS PWA push notifications historically unreliable | SMS as primary notification channel; push as enhancement |

## Coverage

All 53 new requirements mapped to exactly one phase:

| Phase | Requirements | Count |
|-------|-------------|-------|
| 1. Monitor Research + Code Audit | 3/3 | Complete   | 2026-03-08 | 2. Monitor Mixing Implementation | MIX-01..11 | 11 |
| 3. Setlist Performance View | 2/3 | In Progress|  | 4. Setlist Editor | 2/3 | In Progress|  | 5. Backend Hardening & Library | LIB-01..04, PRINT-01..02, CODE-03..04 | 8 |
| 6. Scheduling, Notifications & Polish | SCHED-01..02, NOTIF-01..02 | 4 |
| **Total** | | **52** |

Existing (no phase needed): AUTH-01, AUTH-02, AUTH-03, PDF-01, PDF-02 (5 requirements already working)

Note: 53 new + MIX-12 counted in Phase 1 = 52 mapped (MIX-12 is research, rest of MIX in Phase 2). Total trackable: 52.

## Progress

| Phase | Plans | Status |
|-------|-------|--------|
| 1. Monitor Research + Code Audit | 3/3 | Complete |
| 2. Monitor Mixing Implementation | 0/3 | Not started |
| 3. Setlist Performance View | 0/3 | Not started |
| 4. Setlist Editor | 0/3 | Not started |
| 5. Backend Hardening & Library | 0/3 | Not started |
| 6. Scheduling, Notifications & Polish | 0/2 | Not started |

---
*Roadmap created: 2026-03-07*
