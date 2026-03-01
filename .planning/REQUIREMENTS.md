# Requirements: CentralReform.Live — Outline & Stability

**Defined:** 2026-03-01
**Core Value:** Musicians can glance at the app during a live service and instantly know tune, key, and lead — without fumbling through paper or charts.

## v1 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### Data Model

- [x] **DATA-01**: Setlist track has a `tune` field for arrangement/version name (e.g., "Klepper", "Friedman", "Moshav")
- [x] **DATA-02**: Tune field threads through all 3 type hierarchies: `SetlistTrack`, `QueueItem`, `PrintTrack`
- [ ] **DATA-03**: Tune field is editable in the track editor (TrackSheet) with free-text input
- [x] **DATA-04**: Existing setlists with no tune data display gracefully (no errors, empty field shown as blank)

### Live Performance View

- [ ] **LIVE-01**: Performance view defaults to an outline mode showing all tracks in a scannable list
- [ ] **LIVE-02**: Outline shows tune name, key, and lead for each track at a glance
- [ ] **LIVE-03**: Section headers (liturgical groupings) visually separate the outline into service sections
- [ ] **LIVE-04**: Current track is highlighted with clear NOW indicator; next track visible as NEXT
- [ ] **LIVE-05**: User can drill down from outline to chart view for any individual track
- [ ] **LIVE-06**: Text is readable from music-stand distance (arm's length, ~24-36 inches) — minimum 14px body, 18px+ for current track
- [ ] **LIVE-07**: Foot pedal / keyboard navigation (PageDown/PageUp) advances through outline

### Printed Outline

- [ ] **PRNT-01**: Printed outline has clean columnar format: Song, Tune, Key, Lead per row
- [ ] **PRNT-02**: Section headers render as bold section dividers in the printed outline
- [ ] **PRNT-03**: Outline fits on standard letter paper, readable from a music stand (~arm's length)
- [ ] **PRNT-04**: Print outline is available as a standalone print mode (outline only, no charts)
- [ ] **PRNT-05**: Font size is 12pt+ for readability at distance

### Critical Stability

- [ ] **STAB-01**: Print cache hash (`computeContentHash`) includes all cover page fields (title, key, lead, tune, notes) to prevent stale PDFs
- [ ] **STAB-02**: Publish route surfaces email delivery failures to user instead of silent swallowing
- [ ] **STAB-03**: Fix npm critical vulnerability in opensheetmusicdisplay dependency chain
- [ ] **STAB-04**: Replace `as any` type assertions in API routes with proper Firestore Timestamp type guards (~10 instances in scheduling/admin routes)
- [ ] **STAB-05**: Add Zod schema validation to API routes that currently skip it (publish, tasks/update)
- [ ] **STAB-06**: Replace silent `.catch(() => {})` in critical paths (publish, Firestore writes) with logged error handling

### Type Safety

- [ ] **TYPE-01**: Create shared `toTimestamp()` utility for safe Firestore Timestamp conversion, replacing all `(value as any).seconds` patterns
- [ ] **TYPE-02**: Fix `as any` assertions in setlist/library page components (~5 instances)
- [ ] **TYPE-03**: Fix `as any` assertions in admin components (LiveServiceSection, UserRow, etc.)
- [ ] **TYPE-04**: Replace `Promise.all()` in critical data loads with `Promise.allSettled()` and error handling

### Live Monitoring

- [ ] **MON-01**: Live monitoring connects reliably from the host/leader device to the Firebase live state system
- [ ] **MON-02**: Leader can advance through the setlist and all connected devices update in real-time
- [ ] **MON-03**: Monitoring interface is fast, intuitive, and requires minimal taps to advance
- [ ] **MON-04**: Connection status is clearly visible (connected/disconnected/reconnecting)

### Feature Evaluation

- [ ] **EVAL-01**: Comprehensive evaluation of existing features with improvement suggestions documented

## v2 Requirements

Deferred to future milestone. Tracked but not in current roadmap.

### Outline Enhancements

- **OUTL-01**: Lead-in / cue notes as a dedicated field on SetlistTrack
- **OUTL-02**: Tune library autocomplete from accumulated tune names
- **OUTL-03**: Per-musician transposed keys displayed on printed outline
- **OUTL-04**: Cumulative time tracking per section and total service duration
- **OUTL-05**: Real-time outline sync across devices (leader advances, musicians follow)
- **OUTL-06**: Liturgical section templates for pre-populating service structure

### Remaining Technical Debt

- **DEBT-01**: Refactor MusicianPicker.tsx (855 lines) into smaller components
- **DEBT-02**: Refactor print-pipeline.ts (701 lines) — extract chord caching and result caching
- **DEBT-03**: Refactor SetlistEditorV2.tsx (617 lines) into smaller components
- **DEBT-04**: Add comprehensive E2E tests for core user journeys
- **DEBT-05**: Fix remaining `as any` assertions beyond API routes (~20 instances in hooks/components)
- **DEBT-06**: Implement offline sync conflict resolution
- **DEBT-07**: Add backup/restore functionality

## Out of Scope

| Feature | Reason |
|---------|--------|
| MIDI integration | No musicians use programmable gear; zero users benefit |
| Backing track player | Live musicians only; audio engine adds massive scope |
| Lyrics projection / ProPresenter | Congregation uses siddur (prayer book), not projected lyrics |
| Autoscroll / teleprompter | Outline fits one screen; foot pedal handles charts |
| Song requests during performance | Services follow fixed liturgical structure |
| Multi-band / multi-project | Single congregation, single team |
| Stage messaging / flash alerts | Musicians communicate musically, not via screen flashes |
| Complex timeline automation | Services flow organically; rigid timelines break |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01 | Phase 1 | Complete |
| DATA-02 | Phase 1 | Complete |
| DATA-03 | Phase 1 | Pending |
| DATA-04 | Phase 1 | Complete |
| STAB-01 | Phase 1 | Pending |
| STAB-02 | Phase 1 | Pending |
| LIVE-01 | Phase 2 | Pending |
| LIVE-02 | Phase 2 | Pending |
| LIVE-03 | Phase 2 | Pending |
| LIVE-04 | Phase 2 | Pending |
| LIVE-05 | Phase 2 | Pending |
| LIVE-06 | Phase 2 | Pending |
| LIVE-07 | Phase 2 | Pending |
| PRNT-01 | Phase 3 | Pending |
| PRNT-02 | Phase 3 | Pending |
| PRNT-03 | Phase 3 | Pending |
| PRNT-04 | Phase 3 | Pending |
| PRNT-05 | Phase 3 | Pending |
| MON-01 | Phase 4 | Pending |
| MON-02 | Phase 4 | Pending |
| MON-03 | Phase 4 | Pending |
| MON-04 | Phase 4 | Pending |
| STAB-03 | Phase 5 | Pending |
| STAB-04 | Phase 5 | Pending |
| STAB-05 | Phase 5 | Pending |
| STAB-06 | Phase 5 | Pending |
| TYPE-01 | Phase 5 | Pending |
| TYPE-02 | Phase 5 | Pending |
| TYPE-03 | Phase 5 | Pending |
| TYPE-04 | Phase 5 | Pending |
| EVAL-01 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 31 total
- Mapped to phases: 31
- Unmapped: 0

---
*Requirements defined: 2026-03-01*
*Last updated: 2026-03-01 after roadmap creation*
