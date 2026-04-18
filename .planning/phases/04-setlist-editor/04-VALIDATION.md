---
phase: 4
slug: setlist-editor
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-07
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^3.2.1 |
| **Config file** | vitest.config.ts |
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
| 04-01-01 | 01 | 1 | EDIT-03 | unit | `npx vitest run src/components/setlist/__tests__/inline-editing.test.tsx -x` | No -- Wave 0 | pending |
| 04-01-02 | 01 | 1 | EDIT-04 | unit | `npx vitest run src/components/setlist/__tests__/flow-item-editing.test.tsx -x` | No -- Wave 0 | pending |
| 04-01-03 | 01 | 1 | EDIT-05 | manual-only | N/A -- dnd-kit browser-only | N/A | pending |
| 04-02-01 | 02 | 1 | EDIT-01 | unit | `npx vitest run src/lib/liturgical-templates.test.ts -x` | Yes (extend) | pending |
| 04-02-02 | 02 | 1 | EDIT-02 | unit | `npx vitest run src/lib/setlist-firebase.test.ts -x` | Yes (extend) | pending |
| 04-02-03 | 02 | 2 | EDIT-06 | unit | `npx vitest run src/lib/setlist-firebase.test.ts -x` | Yes (extend) | pending |
| 04-02-04 | 02 | 2 | EDIT-07 | unit | `npx vitest run src/lib/notification-store.test.ts -x` | Yes (extend) | pending |
| 04-03-01 | 03 | 2 | EDIT-09 | unit | `npx vitest run src/lib/liturgical-templates.test.ts -x` | Yes (extend) | pending |
| 04-03-02 | 03 | 2 | EDIT-10 | unit | `npx vitest run src/lib/chat-store.test.ts -x` | Yes (extend) | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `src/components/setlist/__tests__/inline-editing.test.tsx` -- stubs for EDIT-03
- [ ] `src/components/setlist/__tests__/flow-item-editing.test.tsx` -- stubs for EDIT-04
- [ ] Extend `src/lib/liturgical-templates.test.ts` -- tests for new templates (EDIT-01)
- [ ] Extend `src/lib/setlist-firebase.test.ts` -- tests for auto-publish (EDIT-06)
- [ ] Extend `src/lib/notification-store.test.ts` -- tests for significant change detection (EDIT-07)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Drag-drop reorder | EDIT-05 | dnd-kit requires browser DOM interaction | Open editor, drag song item to new position, verify order persists |
| Fast creation workflow | EDIT-08 | UX speed test requires real interaction | Duplicate setlist, swap 2-3 songs, time total -- must be under 2 minutes |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
