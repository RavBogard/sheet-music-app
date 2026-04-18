---
phase: 18
slug: musescore-file-import-and-musicxml-conversion
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-18
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~20 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 18-01-01 | 01 | 1 | Upload .mscz/.mscx | unit | `npx vitest run src/**/*musescore*` | ❌ W0 | ⬜ pending |
| 18-01-02 | 01 | 1 | MSCZ extraction | unit | `npx vitest run src/**/*mscz*` | ❌ W0 | ⬜ pending |
| 18-01-03 | 01 | 1 | MSCX-to-MusicXML conversion | unit | `npx vitest run src/**/*convert*` | ❌ W0 | ⬜ pending |
| 18-01-04 | 01 | 1 | Upload route validation | integration | `npx vitest run src/app/api/upload*` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/__tests__/musescore-convert.test.ts` — stubs for MSCZ extraction and MSCX-to-MusicXML conversion
- [ ] Test fixtures: sample .mscz and .mscx files for testing

*Existing vitest infrastructure covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Converted MusicXML renders correctly in OSMD | Visual fidelity | Rendering is visual | Upload a .mscz file, verify the score displays correctly in the viewer |
| Upload dialog accepts .mscz/.mscx files | File picker filter | Browser file dialog | Click upload, verify .mscz/.mscx appear in file type filter |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
