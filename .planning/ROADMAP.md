# Roadmap: CentralReform.Live — Outline & Stability

## Overview

This milestone transforms CentralReform.Live from a chart-centric sheet music app into an outline-first worship performance tool. The core shift: musicians glance at a service outline (tune, key, lead) 90% of the time and only drill into charts for unfamiliar pieces. Phase 1 adds the missing `tune` field and fixes critical stability bugs before the upcoming Bat Mitzvah. Phases 2 and 3 run in parallel -- the live outline view (phone/tablet during performance) and printed outline (music stand replacement for the Excel spreadsheet). Phase 4 fixes the monitoring/leader interface. Phase 5 hardens type safety after features ship. Phase 6 evaluates the full feature set for future improvements.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Data Foundation + Critical Stability** - Add tune field to data model and fix cache/publish bugs before Bat Mitzvah
- [ ] **Phase 2: Live Outline View** - Redesign performance view to outline-first with tune, key, lead at a glance
- [ ] **Phase 3: Printed Outline** - Redesign PDF cover page to clean columnar outline readable from a music stand
- [ ] **Phase 4: Live Monitoring** - Fix Firebase connection bug and ensure reliable leader-to-musician real-time sync
- [ ] **Phase 5: Type Safety + Technical Debt** - Replace unsafe type assertions and silent error swallowing across the codebase
- [ ] **Phase 6: Feature Evaluation** - Comprehensive review of all features with documented improvement suggestions

## Phase Details

### Phase 1: Data Foundation + Critical Stability
**Goal**: Musicians can enter and save tune/arrangement names on setlist tracks, and the print pipeline produces correct (non-stale) PDFs with surfaced errors
**Depends on**: Nothing (first phase)
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04, STAB-01, STAB-02
**Success Criteria** (what must be TRUE):
  1. User can type a tune name (e.g., "Friedman") into any setlist track and it persists across page reloads
  2. Tune field appears in the track editor, and existing setlists with no tune data load without errors (blank field, no crashes)
  3. Reprinting a setlist after changing only the tune name produces an updated PDF (not a stale cached version)
  4. When email delivery fails during publish, the user sees an error message instead of a silent success
**Plans**: TBD

Plans:
- [ ] 01-01: TBD
- [ ] 01-02: TBD
- [ ] 01-03: TBD

### Phase 2: Live Outline View
**Goal**: Musicians on phone/tablet can glance at the app during a live service and see the full service order with tune, key, and lead -- without scrolling through charts
**Depends on**: Phase 1
**Requirements**: LIVE-01, LIVE-02, LIVE-03, LIVE-04, LIVE-05, LIVE-06, LIVE-07
**Success Criteria** (what must be TRUE):
  1. Performance view defaults to a scannable outline list showing tune, key, and lead for every track -- charts are not shown by default
  2. The current track is clearly highlighted as NOW and the next track is visible as NEXT, with visual hierarchy distinguishing them from upcoming items
  3. Tapping any track in the outline drills down to its chart view; returning to the outline preserves position
  4. All text is readable from arm's length (24-36 inches) on a phone mounted on a music stand -- minimum 14px body, 18px+ for current track
  5. PageDown/PageUp (foot pedal) advances through the outline without requiring touch
**Plans**: TBD

Plans:
- [ ] 02-01: TBD
- [ ] 02-02: TBD
- [ ] 02-03: TBD

### Phase 3: Printed Outline
**Goal**: Musicians can print a clean, columnar service outline that replaces the Excel spreadsheet on music stands
**Depends on**: Phase 1
**Requirements**: PRNT-01, PRNT-02, PRNT-03, PRNT-04, PRNT-05
**Success Criteria** (what must be TRUE):
  1. Printed outline shows Song, Tune, Key, and Lead in aligned columns for every track, with section headers as bold dividers
  2. Outline fits on standard letter paper and is readable from a music stand at arm's length (12pt+ font size)
  3. Services with 30+ tracks paginate correctly onto multiple pages without truncating items
  4. User can print outline-only mode (no charts attached) as a standalone print option
**Plans**: TBD

Plans:
- [ ] 03-01: TBD
- [ ] 03-02: TBD

### Phase 4: Live Monitoring
**Goal**: The leader/host can reliably control the live service from their device, with all connected musician devices updating in real-time
**Depends on**: Phase 1
**Requirements**: MON-01, MON-02, MON-03, MON-04
**Success Criteria** (what must be TRUE):
  1. Leader opens /monitor and successfully connects to Firebase live state without connection errors or hangs
  2. When the leader advances the setlist, all connected musician devices show the updated NOW/NEXT within 2 seconds
  3. Advancing through the setlist requires minimal taps (single tap or swipe per advancement)
  4. Connection status indicator shows connected/disconnected/reconnecting state clearly on the monitoring interface
**Plans**: TBD

Plans:
- [ ] 04-01: TBD
- [ ] 04-02: TBD

### Phase 5: Type Safety + Technical Debt
**Goal**: Critical code paths have proper types and error handling instead of unsafe assertions and silent failures
**Depends on**: Phase 2, Phase 3 (runs after feature work ships)
**Requirements**: STAB-03, STAB-04, STAB-05, STAB-06, TYPE-01, TYPE-02, TYPE-03, TYPE-04
**Success Criteria** (what must be TRUE):
  1. The critical npm vulnerability in opensheetmusicdisplay is resolved (no critical CVEs in `npm audit`)
  2. API routes validate incoming requests with Zod schemas and return structured error responses instead of crashing
  3. Firestore Timestamp conversions use a shared `toTimestamp()` utility instead of `as any` casts -- no `as any` in API routes or admin components
  4. Critical paths (publish, Firestore writes, data loads) log errors instead of silently swallowing them with `.catch(() => {})`
**Plans**: TBD

Plans:
- [ ] 05-01: TBD
- [ ] 05-02: TBD
- [ ] 05-03: TBD

### Phase 6: Feature Evaluation
**Goal**: The full feature set is evaluated with documented improvement suggestions for the next milestone
**Depends on**: Phase 5
**Requirements**: EVAL-01
**Success Criteria** (what must be TRUE):
  1. Every existing feature (auth, library, setlist editor, live view, print, transposition, monitoring) has been reviewed with strengths and gaps documented
  2. Improvement suggestions are prioritized and ready to inform the next milestone's requirements
**Plans**: TBD

Plans:
- [ ] 06-01: TBD

## Progress

**Execution Order:**
Phases 2 and 3 can run in parallel after Phase 1 completes. Phase 4 can run in parallel with 2/3 or after. Phase 5 runs after feature phases. Phase 6 is last.

Sequence: 1 -> (2 + 3 in parallel) -> 4 -> 5 -> 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Data Foundation + Critical Stability | 0/3 | Not started | - |
| 2. Live Outline View | 0/3 | Not started | - |
| 3. Printed Outline | 0/2 | Not started | - |
| 4. Live Monitoring | 0/2 | Not started | - |
| 5. Type Safety + Technical Debt | 0/3 | Not started | - |
| 6. Feature Evaluation | 0/1 | Not started | - |
