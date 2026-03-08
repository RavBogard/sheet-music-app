---
phase: 01-monitor-research-code-audit
verified: 2026-03-08T01:27:35Z
status: human_needed
score: 4/5 must-haves verified
human_verification:
  - test: "Execute the PoC: start the X32 mock server (`ts-node bridge/src/__tests__/x32-mock-server.ts`), start the bridge (`cd bridge && npm run dev`), run the app (`npm run dev`), open the monitor mixer UI, and observe that: (1) ConnectionIndicator shows 'Connected', (2) fader values appear in FaderStrip, (3) dragging a fader causes an OSC command to appear in the mock server logs, (4) stopping the mock for 30 seconds then restarting causes ConnectionIndicator to transition through 'Reconnecting' back to 'Connected'"
    expected: "All four behaviors work correctly through the existing FaderStrip, QuickMonitorPanel, and ConnectionIndicator components without any code changes"
    why_human: "The latency utility (bridge-latency.util.ts) requires a live Firestore project and running bridge — it cannot be run in the Vitest environment. The SUMMARY explicitly states 'actual measurements need a live Firestore project with running bridge.' No execution log or recorded output exists. The ADR documents HOW to run the PoC but not that it WAS run. This is the sole unverified success criterion."
---

# Phase 1: Monitor Research Spike + Code Audit — Verification Report

**Phase Goal:** Answer every open question about how to connect to the X32 reliably and simply, and identify all code cleanup work across the codebase
**Verified:** 2026-03-08T01:27:35Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A written technical document answers: bridge architecture, deployment model, install experience, failure modes, auto-recovery | VERIFIED | `docs/bridge-architecture-decision.md` — 558 lines, 9 sections, covers all 7 research questions from CONTEXT.md. Sections: Transport Architecture, Deployment Model, Install Experience, Failure Modes, Write Rate Analysis, Dev Environment, PoC Validation, Open Risks, Decisions Summary. |
| 2 | A working PoC demonstrates: connect to X32 from browser, read/set fader, survive 30-second network interruption | HUMAN NEEDED | X32 mock server exists (593 lines, full UDP OSC implementation). Latency utility exists (610 lines). ADR Section 7 provides step-by-step PoC validation guide. No recorded execution output or test log confirms the PoC was actually run. SUMMARY explicitly notes latency measurements need live hardware. |
| 3 | Bridge install process documented to non-technical standard (CONTEXT.md: "Don't need actual user testing in Phase 1") | VERIFIED | ADR Section 3 (Install Experience): Step-by-step guide for non-technical user covering download, install, setup code entry, verification, and troubleshooting. Target audience explicitly stated: Daniel or sound engineer. Troubleshooting section covers all common failure scenarios. |
| 4 | Codebase audit document identifies dead code to remove, stores to consolidate, components to cut, backend duct-tape to eliminate | VERIFIED | `docs/codebase-audit.md` — 450 lines, all 8 required sections present. Inventories: 7 files deleted (1,041 lines), 7 safe-to-delete candidates, 6 needs-investigation items, 7 stores analyzed with target architecture, 155 components by directory with 9 oversized flagged, admin feature triage (7 essential / 7 duct-tape / 4 simplify), 66 API routes cataloged, dependency health analysis. |
| 5 | User profiles with instrument/transposition preferences work as foundation for Phase 3 auto-transposition | VERIFIED | `src/components/settings/MusicianProfileSettings.tsx` wired to `saveMusicianProfile()` and `subscribeToMusicianProfile()`. `use-musician-transposition.ts` applies priority chain (track > song pref > profile default > zero). `TransposerMenu` shows instrument label and auto-transposition indicator. 79 tests in `src/hooks/__tests__/use-musician-transposition.test.ts` verify the full chain. |

**Score:** 4/5 truths verified (Success Criterion 2 requires human execution)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `docs/bridge-architecture-decision.md` | ADR with latency data, deployment rec, install guide, failure modes | VERIFIED | 558 lines, 9 sections, all required content present. Latency data is analytical (code analysis + Firestore documentation) — actual measured numbers require live hardware (noted as open risk). |
| `bridge/src/__tests__/x32-mock-server.ts` | Full X32 OSC emulator for development | VERIFIED | 593 lines. Handles all OSC addresses used by bridge: `/xinfo`, `/xremote`, `/ch/XX/mix/YY/level`, `/bus/XX/mix/fader`, `/mtx/XX/mix/fader`, etc. Exports `X32MockServer` class for test use. No stubs or TODOs. |
| `src/lib/__tests__/bridge-latency.util.ts` | Firestore round-trip latency measurement utility | VERIFIED | 610 lines. Implements `runLatencyMeasurement()` and `runRapidDragTest()` correctly using `hasPendingWrites === false` for true server-confirmed latency. Named `.util.ts` (not `.test.ts`) to prevent Vitest pickup — correct. |
| `docs/codebase-audit.md` | Audit with all 8 sections, per-phase cleanup roadmap | VERIFIED | 450 lines, all 8 sections present. Substantive — not a skeleton. |
| `src/lib/__tests__/roles.test.ts` | Tests verifying all four role levels and sound engineer patterns | VERIFIED | 303 lines, 52 tests. Full 5x5 role matrix, legacy alias test, null/undefined edge cases, sound engineer orthogonality simulation. |
| `src/hooks/__tests__/use-musician-transposition.test.ts` | Tests verifying transposition priority chain | VERIFIED | 522 lines, 79 tests. All 18 INSTRUMENT_PRESETS validated, 4-level priority chain verified, auto-save guard, isAutoTransposed flag, MusicianProfile interface compliance. |
| `src/lib/roles.ts` | Updated with AUTH-04 role model documentation | VERIFIED | Has comprehensive comment block: hierarchy values (admin=100, band_leader=80, musician=60, member=40, pending=0), soundEngineer orthogonality note, research decision reference. |

---

### Key Link Verification

#### Plan 01-01: Bridge Architecture

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/lib/firestore-monitor-client.ts` | `bridge/src/firestore-transport.ts` | Firestore documents `monitor-live/state` and `monitor-live/commands/pending` | WIRED | Client writes to `monitor-live/commands/pending` (line 200), reads from `monitor-live/state` (line 60). Bridge reads commands from `monitor-live/commands/pending` (line 171) and writes state to `monitor-live/state` (line 84). Pattern `monitor-live` confirmed in both files. |

#### Plan 01-02: Codebase Cleanup

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/components/library/SongChartsLibrary.tsx` | `src/lib/setlist-store.ts` | `import { useSetlistStore }` | WIRED (intentional) | Store retained as active staging buffer for library-to-setlist workflow. TODO comment added for Phase 4 removal. This is correct per plan decision — not a gap. |
| `src/components/library/LibraryFileRow.tsx` | `src/lib/setlist-store.ts` | `import { useSetlistStore }` | WIRED (intentional) | Same rationale — active consumer, intentionally retained. |
| `src/components/setlist/v2/SetlistEditorV2.tsx` | `src/lib/setlist-store.ts` | `import { useSetlistStore }` | WIRED (intentional) | Same rationale. Phase 4 will rebuild this flow without the legacy store. |

#### Plan 01-03: Auth Roles and Transposition

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/lib/auth-context.tsx` | `src/lib/roles.ts` | `deriveRoles(profile?.role)` | WIRED | Import confirmed line 18, usage confirmed line 78. |
| `src/lib/auth-context.tsx` | `src/types/models.ts` | `profile?.soundEngineer` | WIRED | `soundEngineer` flag read at line 79, confirmed orthogonal to role hierarchy. |
| `src/hooks/use-musician-transposition.ts` | `src/lib/musician-profile.ts` | `subscribeToMusicianProfile, INSTRUMENT_PRESETS` | WIRED | Import confirmed line 5, subscription at line 55. |
| `src/hooks/use-musician-transposition.ts` | `src/lib/store.ts` | `useMusicStore().setTransposition` | WIRED | `setTransposition` used at lines 84 and 92 via `useMusicStore` destructure at line 24. |
| `src/components/music/TransposerMenu.tsx` | `src/hooks/use-musician-transposition.ts` | `useMusicianTransposition()` | WIRED | Import line 9, usage line 43. `isAutoTransposed`, `instrumentLabel`, `saving` all consumed. |
| `src/components/settings/MusicianProfileSettings.tsx` | `src/lib/musician-profile.ts` | `saveMusicianProfile, subscribeToMusicianProfile` | WIRED | Import line 6, subscription at line 23, save at line 55. Settings page renders component at line 292. |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| MIX-12 | 01-01 | Bridge architecture validated through research spike before any implementation code is written | SATISFIED | `docs/bridge-architecture-decision.md` (558 lines, ADR-001) exists. No production monitor code written — only research artifacts, mock server, and latency utility. User approved checkpoint 2026-03-07. |
| CODE-01 | 01-02 | Codebase audit — identify and remove dead code, unused components, abandoned features | SATISFIED | 7 files deleted (1,041 lines): tasks page, 3 tasks API routes, TaskSheet, UsageAnalyticsSection, leader redirect page. Cascade fixes applied to 5 additional files. Audit doc catalogs 7 additional safe-to-delete and 6 needs-investigation candidates. |
| CODE-02 | 01-02 | Consolidate Zustand stores from 8 fragmented stores to a focused architecture | SATISFIED (scoped) | Plan's own must_have truth explicitly scopes this to "planned and documented (not implemented)" for Phase 1. Target architecture for 7 stores defined with per-phase migration schedule in `docs/codebase-audit.md` Section 3. Store consolidation execution deferred to Phases 2-5 per CONTEXT.md decision: "Plan now, execute later." |
| AUTH-04 | 01-03 | Role-based access: admin, band leader, musician, sound engineer | SATISFIED | `src/lib/__tests__/roles.test.ts` — 52 tests verify full role hierarchy. `src/lib/roles.ts` updated with AUTH-04 documentation block. Sound engineer confirmed as boolean flag orthogonal to hierarchy. `useMonitorAccess` hook verified: `isAdmin \|\| isSoundEngineer \|\| hasBusAssigned`. |
| PROF-01 | 01-03 | Musician profile includes name, instrument(s), transposition preferences | SATISFIED | `MusicianProfile` interface has `instrument`, `defaultTransposition`, `preferCapo`, `preferredCapoFret`, `preferFlats`. `MusicianProfileSettings` component wired to `saveMusicianProfile()`. 18 `INSTRUMENT_PRESETS` with correct offsets verified by tests. |
| PROF-02 | 01-03 | Profile settings (instrument, transposition) are applied automatically across the entire app | SATISFIED | Full chain verified: Settings -> `saveMusicianProfile()` -> Firestore -> `subscribeToMusicianProfile()` -> `useMusicianTransposition()` -> `setTransposition()` in music store -> PDF chord overlays + `TransposerMenu`. 79 tests verify the 4-level priority chain. |

**Note on CODE-02:** The requirement text says "Consolidate Zustand stores" but the plan's success criteria explicitly redefines Phase 1 scope as "planned with target state and per-phase migration schedule (no refactoring in Phase 1)." The REQUIREMENTS.md marks CODE-02 as `[x] Complete` — this is consistent with the plan's definition of "complete" for this phase. The actual store consolidation happens in Phases 2-5 as the features using those stores are rebuilt.

---

### Dead Code Verification

All 7 deleted files confirmed absent from the filesystem:

| File | Confirmed Deleted |
|------|-----------------|
| `src/app/(main)/tasks/page.tsx` | YES |
| `src/app/api/tasks/` (directory + 3 routes) | YES |
| `src/components/setlist/tasks/TaskSheet.tsx` | YES |
| `src/components/admin/UsageAnalyticsSection.tsx` | YES |
| `src/app/(main)/leader/page.tsx` | YES |

No orphaned imports remain for deleted code. Grep for `TaskSheet`, `UsageAnalyticsSection`, `TaskStatus`, `SetlistTask` in `src/` returns zero matches.

---

### Commit Verification

All commits documented in SUMMARY files confirmed present in git log:

| Commit | Plan | Description |
|--------|------|-------------|
| `3d80459` | 01-01 Task 1 | X32 mock server and latency measurement utility |
| `2a0c400` | 01-01 Task 2 | Bridge architecture decision record (ADR-001) |
| `85f6326` | 01-02 Task 1 | Dead code deletion: tasks, analytics, leader route |
| `a413ae6` | 01-02 Task 1a | Cascade fix: creation wizard calling deleted tasks API |
| `6771969` | 01-02 Task 2 | Comprehensive codebase audit document |
| `859ed04` | 01-03 Task 1 | Role hierarchy tests (AUTH-04) — 52 tests |
| `4a7f0a8` | 01-03 Task 2 | Transposition priority chain tests (PROF-01, PROF-02) — 79 tests + bridge-latency rename |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/lib/setlist-store.ts` | 1 | `// TODO: Remove setlist-store dependency (Phase 4)` | INFO | Intentional — plan explicitly retained this file as an active staging buffer. Removal deferred to Phase 4 when setlist creation flow is rebuilt. Not a blocker. |
| `src/components/dashboard/TaskCards.tsx` | — | Will silently show 0 tasks (tasks collection has no write API) | INFO | Intentional per plan — "will silently show 0 tasks, clean up in Phase 5." Not a blocker. |

No other anti-patterns found in phase-created files. X32 mock server has no stubs, no empty implementations. Test files have no TODOs or placeholder tests.

---

### Notable Deviations (All Auto-Fixed Per Plan Rules)

1. **`bridge-latency.test.ts` renamed to `bridge-latency.util.ts`** — File was a dev utility with `.test.ts` extension causing Vitest "No test suite found" failure. Renamed to `.util.ts`. Correct fix.
2. **INSTRUMENT_PRESETS count: 18, not 17** — Plan said "all 17 instruments" but actual codebase has 18 (piano, ukulele, other added). Test updated to assert `toBe(18)`. Correct.
3. **Cascade cleanup applied** — `use-calendar-data.ts`, `CalendarDayCell.tsx`, `use-creation-wizard.ts`, `CreationWizard.tsx` modified to remove dependencies on deleted code. Build passes with zero orphaned imports.

---

### Human Verification Required

#### 1. PoC Execution: Connect, Read, Write, Survive Network Interruption

**Test:** Start the X32 mock server, bridge, and app locally. Open the monitor mixer UI in a browser. Verify the following sequence works:
1. `ts-node bridge/src/__tests__/x32-mock-server.ts` — mock starts on UDP port 10023
2. `cd bridge && X32_ADDRESS=127.0.0.1 npm run dev` — bridge connects to mock
3. `npm run dev` — open app in browser
4. Navigate to a page with the monitor panel
5. Observe ConnectionIndicator shows "Connected" (green) within 5 seconds
6. Observe FaderStrip shows fader values matching mock server initial state
7. Drag a fader — confirm mock server logs show OSC command received
8. Stop the mock server — confirm ConnectionIndicator transitions to "Reconnecting"
9. Wait 30 seconds — restart mock — confirm ConnectionIndicator returns to "Connected"

**Expected:** All 9 steps succeed without code changes. ConnectionIndicator, FaderStrip, and QuickMonitorPanel function correctly through the existing UI.

**Why human:** The latency utility (`bridge-latency.util.ts`) requires a live Firestore project and running bridge — it cannot run in Vitest's Node.js environment (explicit design decision). The ADR documents PoC validation steps (Section 7) but no execution log, screenshot, or terminal output confirms the PoC was ever run. The SUMMARY explicitly states: "The latency measurements required in Task 1 note that 'actual measurements' need a live Firestore project with running bridge."

This is the only item blocking full `passed` status. All automated artifacts (mock server, latency utility, ADR) exist and are substantive — the missing piece is confirmation that the system actually works end-to-end when wired together locally.

---

### Gaps Summary

No gaps block Phase 2 from proceeding. The one human-needed item (PoC execution) is the final validation of what the ADR analyzes and the tools enable — it is not a missing artifact.

The architecture decision is user-approved (2026-03-07). The X32 mock server and latency utility are the tools for PoC validation. Confirming the PoC works as documented is the remaining step before Phase 2 implementation begins.

**What Phase 2 depends on from Phase 1:**
- ADR: Architecture decision is clear. Firestore-only transport on production PC. Hybrid WebSocket as contingency if P95 > 300ms in production.
- X32 mock server: Ready for Phase 2 development without real hardware.
- Profile system: Wired and tested. Phase 3 auto-transposition foundation is in place.
- Codebase audit: Cleanup roadmap documented with per-phase execution schedule.

---

*Verified: 2026-03-08T01:27:35Z*
*Verifier: Claude (gsd-verifier)*
