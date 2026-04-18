---
phase: 20
slug: add-song-to-existing-setlist-from-library-view
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-18
---

# Phase 20 — Validation Strategy

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
| 20-01-01 | 01 | 1 | AddToSetlistSheet component | unit | `npx vitest run src/components/library/__tests__/add-to-setlist*` | ❌ W0 | ⬜ pending |
| 20-01-02 | 01 | 1 | use-add-to-setlist hook | unit | `npx vitest run src/hooks/__tests__/use-add-to-setlist*` | ❌ W0 | ⬜ pending |
| 20-02-01 | 02 | 2 | Context menu integration | unit | `npx vitest run src/components/library/__tests__/song-charts*` | ✅ | ⬜ pending |
| 20-02-02 | 02 | 2 | Batch + search integration | unit | `npx vitest run src/components/library/__tests__/*` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/components/library/__tests__/add-to-setlist-sheet.test.tsx` — stubs for sheet component
- [ ] `src/hooks/__tests__/use-add-to-setlist.test.ts` — stubs for shared logic hook

*Existing vitest infrastructure covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Bottom sheet slides up smoothly | UX quality | Animation is visual | Right-click song → "Add to Setlist..." → verify sheet animates from bottom |
| Toast with undo appears and works | Feedback flow | Cross-component integration | Add song → verify toast → click Undo → verify song removed |
| Search filters setlists in picker | Search UX | Interactive behavior | Open picker → type partial name → verify list filters |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
