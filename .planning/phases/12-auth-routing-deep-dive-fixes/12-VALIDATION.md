---
phase: 12
slug: auth-routing-deep-dive-fixes
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.js |
| **Quick run command** | `npm run test` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run lint` and `npm run test`
- **After every plan wave:** Run `npm run build`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 12-01-01 | 01 | 1 | AUTH-04 | manual | N/A | ✅ | ⬜ pending |
| 12-01-02 | 01 | 1 | AUTH-07 | manual | N/A | ✅ | ⬜ pending |
| 12-02-01 | 02 | 2 | AUTH-04 | unit | `npm run test` | ✅ | ⬜ pending |
| 12-02-02 | 02 | 2 | AUTH-04 | unit | `npm run test` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Upload as admin | AUTH-07 | E2E Firebase Auth | Sign in as admin, upload file, assert 201 |
| Upload as musician | AUTH-07 | E2E Firebase Auth | Sign in as musician, upload file, assert 201 |
| Upload as public | AUTH-07 | E2E Firebase Auth | Sign in without roles, upload file, assert 403 |
| Trigger loop fallback | AUTH-04 | Edge Middleware testing | Simulate redirect loop with fake cookies, assert fallback UI renders |
| Test cache busting | AUTH-04 | Network inspection | Request `/login`, assert `Cache-Control: no-store` header is present |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
