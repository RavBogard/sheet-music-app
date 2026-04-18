---
phase: v43-05-bugs-ux
plan: 02
subsystem: state
tags: [zustand, firestore, onSnapshot, b02]

provides:
  - alert-store init guard that doesn't latch on null db
  - diagnostic logging on subscription errors

duration: ~8min
completed: 2026-04-14
---

# v4.3 P5 Plan 02: alert-store init hardening (B02)

**Two B02 bugs closed in `src/lib/alert-store.ts`:**

1. `initialized = true` was set before the `!db` null check — if db wasn't available on first call, init() permanently latched without subscribing. Moved the assignment after the db check so a later call can retry when db is ready.
2. Snapshot error callback silently set `loading: false` — permission/rule failures were invisible in prod. Now `logger.warn` captures the error.

## Performance
- Duration: ~8 min
- Commits: 1 atomic
- New tests: 3

## AC results — all pass
- Null-db init doesn't latch
- Duplicate init after successful sub is a no-op (no listener stacking)
- destroy → re-init works
- tsc clean, 1200 tests green, `npm run build` green

## Commit
`305adac` — fix(v4.3-P5-02): alert-store init guard + error context

## Decision
Bundled fix + test in a single commit. B02 is a 10-line change; splitting would be noise.

---
*Phase: v43-05-bugs-ux, Plan: 02*
