---
phase: 02
slug: monitor-mixing-implementation
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-07
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (via vitest.config.ts) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | MIX-01, MIX-02, MIX-03, MIX-05, MIX-06 | unit | `npx vitest run src/components/monitor/__tests__/channel-starring.test.ts src/components/monitor/__tests__/default-channels.test.ts` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | MIX-01, MIX-03, MIX-05 | unit | `npx vitest run src/components/monitor/__tests__/visible-channels.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 2 | MIX-04 | unit | `npx vitest run src/components/monitor/__tests__/fader-interaction.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-02 | 02 | 2 | MIX-07 | manual | Manual: open setlist/PDF, verify monitor button visible, tap to open popup | N/A | ⬜ pending |
| 02-03-01 | 03 | 1 | MIX-10 | unit | `npx vitest run src/components/monitor/__tests__/connection-status.test.ts` | ❌ W0 | ⬜ pending |
| 02-03-02 | 03 | 1 | MIX-08, MIX-09, MIX-11 | unit+integration | `npx vitest run src/components/monitor/__tests__/graceful-degradation.test.ts bridge/src/__tests__/reconnect.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/components/monitor/__tests__/channel-starring.test.ts` — stubs for MIX-03 (starring persistence)
- [ ] `src/components/monitor/__tests__/default-channels.test.ts` — stubs for MIX-05 (default channel config)
- [ ] `src/components/monitor/__tests__/visible-channels.test.ts` — stubs for MIX-04 (channel visibility logic)
- [ ] `src/components/monitor/__tests__/fader-interaction.test.ts` — stubs for MIX-01, MIX-02 (fader + mute interaction)
- [ ] `src/components/monitor/__tests__/connection-status.test.ts` — stubs for MIX-10 (indicator states)
- [ ] `src/components/monitor/__tests__/graceful-degradation.test.ts` — stubs for MIX-11 (offline behavior)
- [ ] `bridge/src/__tests__/reconnect.test.ts` — stubs for MIX-09 (auto-reconnection)
- [ ] Verify vitest environment supports `jsdom` for component tests (may need config update)

*Existing infrastructure covers MIX-06 (BusAssignmentPanel already tested) and MIX-08 (Electron installer — manual verification only).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Monitor popup accessible from setlist view in 1-2 taps | MIX-07 | Requires real UI navigation context | Open a setlist in performance view, verify Audio/Monitor button is visible, tap to open popup, confirm faders appear |
| Monitor popup accessible from PDF view in 1-2 taps | MIX-07 | Requires real UI navigation context | Open a PDF from within a setlist, verify monitor button is visible without leaving PDF, tap to open popup |
| Bridge install is simple (one-click) | MIX-08 | Requires testing on clean machine | Download Electron installer, run on clean Windows PC, verify auto-config with setup code |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
