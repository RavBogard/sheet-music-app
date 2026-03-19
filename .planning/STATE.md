---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: unknown
last_updated: "2026-03-19T00:33:00.000Z"
progress:
  total_phases: 8
  completed_phases: 2
  total_plans: 7
  completed_plans: 5
---

# Project State: Architecture Refinement & UX Polish

## Project Reference
**Core Value**: Frictionless, instant access for all users, blazing fast PDF loading, and zero UI layout shifts or authorization flashes.
**Current Focus**: Milestone v1.2 Library Expansion

## Current Position
**Phase**: 20 - Add Song to Existing Setlist from Library View
**Plan**: 1 of 2 complete
**Status**: In progress
**Last activity**: 2026-03-19 — Completed 20-01 (Core hook + bottom sheet component)

## Accumulated Context
### Decisions
- [20-01] Case-insensitive substring match for setlist search (simpler than fuse.js for small lists)
- [20-01] Undo re-reads current tracks via subscribeToSetlist, filters by added IDs (concurrent-edit safe)
- [20-01] Separate personalLoaded/publicLoaded flags for dual-subscription loading state
- [19-01] TransposeCalculator imported directly from opensheetmusicdisplay (confirmed exported from main package)
- [19-01] Reused existing toQueueItem from queue-utils for PDFOverlay file type detection
- Completed exhaustive UI/UX audit against `ui-ux-pro-max`.
- Fixed remaining minor UI/UX bugs (accessibility labels, anti-pattern hover states, edge-case routing for pending users).
- Project is stable and complete.
- [18-01] Used SaxonJS with pre-compiled SEF for XSLT transformation (faster than raw XSL at runtime)
- [18-01] TPC-based pitch mapping for accurate enharmonic note resolution
- [18-01] Quarter note = 1 division for MusicXML simplicity
- [Phase 18-02]: Extension-based MuseScore detection since browsers send generic MIME for .mscz
- [Phase 18-02]: Dual storage pattern: originals at library/originals/, converted at library/
- [Phase 19-02]: Used conditional render in PDFOverlay JSX (Option A) for file-type branching

### Todos
- None.

### Roadmap Evolution
- Phase 18 added: MuseScore file import and MusicXML conversion
- Phase 19 added: Native transposition for MusicXML and structured score files
- Phase 20 added: Add song to existing setlist from library view (requires /ui-ux-pro-max for UI design)

### Blockers
- None.