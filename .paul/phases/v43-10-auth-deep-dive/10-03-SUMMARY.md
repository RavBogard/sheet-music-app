---
phase: v43-10-auth-deep-dive
plan: 03
subsystem: auth
tags: [observability, retry, drift-repair, firebase-auth]
requires:
  - phase: v43-10-auth-deep-dive/02
    provides: router.refresh + cold-load mount refresh
provides:
  - repairDrift(user) module with per-step retry + telemetry
  - src/lib/session-cookie.ts extracted helper
affects:
  - any future drift-chain change
  - P10-05 Playwright scenarios that induce drift
tech-stack:
  added: []
  patterns:
    - "withRetry(step, fn) — 3-attempt exponential backoff (0/200/800ms) with uniform log shape"
    - "skipped ≠ failed — a prereq-failure short-circuit state distinct from terminal failure"
key-files:
  created:
    - src/lib/session-cookie.ts
    - src/lib/drift-repair.ts
    - src/lib/__tests__/drift-repair.test.ts
  modified:
    - src/lib/auth-context.tsx
key-decisions:
  - "sessionCookie failure does not skip refreshSession — they're independent cookie-mint paths"
  - "idTokenRefresh gates both cookie steps — a stale token would defeat the whole point"
  - "Real setTimeout delays + vi.useFakeTimers in tests — cheap + deterministic"
duration: ~20min
started: 2026-04-15T04:10:00Z
completed: 2026-04-15T04:30:00Z
---

# Phase v43-10 Plan 03: Drift-repair with retry + telemetry

**Extracted the four-step drift chain into `src/lib/drift-repair.ts` with 3× retry per step and a uniform `[drift] step=... attempt=... outcome=...` log shape. Vercel logs become grep-diagnosable; transient hiccups self-heal without stranding the user.**

## Acceptance Criteria Results

| Criterion | Status |
|-----------|--------|
| AC-1 Structured summary | Pass |
| AC-2 3× retry per step | Pass |
| AC-3 Uniform `[drift]` log shape | Pass |
| AC-4 Prereq-failure → skipped (not failed) | Pass |
| AC-5 No extra waits on happy path | Pass |
| AC-6 auth-context delegates to repairDrift | Pass |

## Task Commits

| Commit | Type | Description |
|--------|------|-------------|
| `012b3f2` | refactor | session-cookie.ts extracted (pure move) |
| `9e63d81` | feat | drift-repair.ts + 6 unit tests |
| `bac856d` | refactor | auth-context swapped to call repairDrift() |

## Deviations

None. Ship green on first push.

## Tests

Suite 1270/1270 (6 new).

## Next

P10-04 — restore Firestore `isMember()` gate on setlists reads.
