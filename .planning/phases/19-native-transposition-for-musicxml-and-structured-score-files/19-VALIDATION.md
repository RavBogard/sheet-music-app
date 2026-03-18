---
phase: 19
slug: native-transposition-for-musicxml-and-structured-score-files
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-18
---

# Phase 19 — Validation Strategy

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
| 19-01-01 | 01 | 1 | TransposeCalculator wiring | unit | `npx vitest run src/components/music/__tests__/smart-score*` | ❌ W0 | ⬜ pending |
| 19-01-02 | 01 | 1 | File-type branching in PDFOverlay | unit | `npx vitest run src/components/performance/__tests__/pdf-overlay*` | ✅ | ⬜ pending |
| 19-01-03 | 01 | 1 | SmartTransposer suppression | unit | `npx vitest run src/components/performance/__tests__/pdf-overlay*` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/components/music/__tests__/smart-score-viewer.test.tsx` — stubs for TransposeCalculator and transposition behavior

*Existing vitest infrastructure covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Transposed MusicXML renders correctly | Visual fidelity | Rendering is visual | Open a MusicXML file, transpose +2 semitones, verify notes and chord symbols shift correctly |
| TransposerMenu looks identical for PDF vs MusicXML | UX parity | Visual comparison | Open a PDF file, then a MusicXML file — TransposerMenu should look the same |
| Print output reflects transposition | Print fidelity | Browser print | Transpose a MusicXML file, print it, verify printed output shows transposed notation |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
