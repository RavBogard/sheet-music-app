---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: milestone
status: in-progress
stopped_at: Completed 03-02-PLAN.md
last_updated: "2026-03-08T03:12:00.000Z"
last_activity: 2026-03-08 -- Completed 03-02 (PDF overlay, bottom bar, setlist drawer, 7 new tests)
progress:
  total_phases: 6
  completed_phases: 2
  total_plans: 9
  completed_plans: 8
  percent: 44
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-07)

**Core value:** A musician sets their tablet on a music stand, sees this week's service at a glance, drills into PDFs when needed, and adjusts their monitor mix in 1-2 taps.
**Current focus:** Phase 3 - Setlist Performance View

## Current Position

Phase: 3 of 6
Plan: 2 of 3 in current phase (complete)
Status: Phase 3 in progress -- Plan 02 complete (PDF overlay, bottom bar, setlist drawer)
Last activity: 2026-03-08 -- Completed 03-02 (PDF overlay, bottom bar, setlist drawer, 7 new tests)

Progress: [████░░░░░░] 44%

## Performance Metrics

**Velocity:**
- Total plans completed: 8
- Average duration: ~6 min
- Total execution time: ~1 hour

## Accumulated Context

### Decisions

- [Project]: Tablet-first (portrait, music stands), not phone-first
- [Project]: PDF viewer kept as-is — don't rebuild what works
- [Project]: Monitor mixing is the #1 priority — research spike before any implementation
- [Project]: Three pillars: setlist experience, monitor mixing, code quality
- [Project]: Public access for jam sessions — no auth, setlist + PDFs only
- [Project]: Template-based setlist creation (16 templates: 7 regular, 9 holiday)
- [Project]: Duplicate-and-tweak is the primary weekly workflow
- [Project]: Cut: task management, analytics, rotation matrix
- [Project]: Backend open for rework — simplify so admin duct tape is unnecessary
- [Roadmap]: Monitor research is Phase 1, not Phase 5
- [Roadmap]: Phases 2 and 3 can parallelize after Phase 1
- [01-03]: soundEngineer is orthogonal boolean flag on UserProfile — not a role hierarchy level
- [01-03]: INSTRUMENT_PRESETS has 18 presets (not 17): 7 core + 8 occasional + 3 other
- [01-03]: bridge-latency.test.ts is a browser dev utility — renamed to .util.ts to exclude from vitest
- [01-02]: setlist-store.ts retained as staging buffer for library-to-setlist workflow — remove in Phase 4
- [01-02]: Store consolidation documented in codebase-audit.md — plan-now-execute-later per CONTEXT.md
- [01-02]: Admin triage: 7 essential, 7 duct-tape (remove when backend fixed), 4 simplify in Phase 5
- [01-02]: recharts dependency orphaned after analytics deletion — remove when TimelineChart.tsx is deleted in Phase 3
- [Phase 01-monitor-research-code-audit]: Firestore-only transport: zero iPad config wins over WebSocket latency
- [Phase 01-monitor-research-code-audit]: Production PC deployment: Electron installer and auto-start already handle it
- [Phase 01-monitor-research-code-audit]: Hybrid WebSocket fallback: implement only if P95 server-confirmed latency exceeds 300ms in production
- [Phase 01-monitor-research-code-audit]: Sound engineer as boolean flag orthogonal to role hierarchy: AUTH-04 satisfied by current implementation
- [02-01]: Keep pinnedChannels Firestore field name, use star terminology in UI only -- avoids data migration
- [02-01]: Show ALL bus sends in configure mode so musicians can star any channel
- [02-01]: DefaultChannelPicker integrated in both monitor page engineer section and admin SoundSystemSection
- [02-03]: Colored dot indicator (w-2 h-2) preferred over Wifi icons for subtle connection status during services
- [02-03]: Bridge backoff starts at 2s for fast recovery, caps at 60s for sustained outages
- [02-03]: vitest.config.ts expanded to include bridge/src tests in unified test runner
- [02-02]: Separate VerticalFaderStrip component (not parameterized FaderStrip) -- clientY vs clientX geometry is fundamentally different
- [02-02]: Master fader onMuteToggle is no-op in live popup to prevent accidental bus mute during services
- [03-01]: Transposed key shows just note name (Bb) not semitone offset -- offset is noise during performance
- [03-01]: Header tracks as inline dividers (hr with label), not sticky collapsible sections
- [03-01]: Leader position advance via tap-to-set on any row (updateLiveTrack Firestore write)
- [03-01]: activeSongIndex state as hook point for Plan 02 PDF overlay
- [03-02]: Old SetlistDrawer preserved as SetlistDrawerLegacy for v1 PerformanceToolbar compatibility
- [03-02]: Monitor panel opens as Radix Dialog sheet above bottom bar with glass morphism
- [03-02]: PDFViewer dynamically imported via next/dynamic SSR disabled to avoid worker issues
- [03-02]: Drawer closes automatically after song selection for fluid one-tap switching

### Blockers/Concerns

- Phase 1: X32 bridge architecture is the single biggest technical risk — needs thorough research
- Phase 6: iOS PWA push notifications may be unreliable — SMS is the backup

## Session Continuity

Last session: 2026-03-08T03:12:00Z
Stopped at: Completed 03-02-PLAN.md
Resume file: .planning/phases/03-setlist-performance-view/03-03-PLAN.md
