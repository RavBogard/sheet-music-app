---
phase: 01-auth-routing-audit
plan: 01
subsystem: auth
tags: [firebase-auth, session-cookie, middleware, avatar, radix-ui]

requires:
  - phase: none
    provides: first plan in v1.9
provides:
  - Comprehensive audit report documenting 3 auth regressions with root causes
  - Actionable fix recommendations for Phase 2 planning
affects: [02-auth-flow-rebuild, 03-avatar-system-fix]

tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - .paul/phases/01-auth-routing-audit/01-01-AUDIT-REPORT.md
  modified: []

key-decisions:
  - "Session cookie race is the root cause of Monitor redirect — not middleware logic"
  - "Radix Avatar (UserRow pattern) is the correct avatar approach — standardize everywhere"
  - "Phase 2 should split into two plans: session+login (Plan 01) and avatars (Plan 02, parallel)"

patterns-established: []

duration: ~5min
started: 2026-03-11
completed: 2026-03-11
---

# Phase 1 Plan 01: Auth & Routing Regression Audit Summary

**Full audit of 3 auth regressions with root causes, code-level evidence, and fix recommendations for Phase 2.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~5min |
| Tasks | 3 completed |
| Files modified | 0 (audit only) |
| Files created | 1 (AUDIT-REPORT.md) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Session Timing Race Documented | Pass | Full timeline, code references (auth-context.tsx:97-103, middleware.ts:53-56) |
| AC-2: Login Flow Cascade Documented | Pass | Popup→redirect flow traced, 4 problems identified |
| AC-3: Avatar Inconsistencies Cataloged | Pass | 4 implementations compared in table, 3 fragile / 1 correct |
| AC-4: Fix Recommendations Actionable | Pass | 3 fixes with exact files, changes, and issue mapping |

## Accomplishments

- Identified root cause of Monitor redirect: async fire-and-forget session cookie creation (auth-context.tsx:97-103) races with middleware cookie check
- Documented login cascade: no platform detection causes every mobile login to silently fail popup before falling back to redirect
- Cataloged 4 avatar implementations — only UserRow (Radix Avatar) handles errors correctly; DesktopHeader, MobileMenuDrawer, and Settings use fragile manual DOM manipulation
- Produced structured fix recommendations with Phase 2 plan ordering

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `.paul/phases/01-auth-routing-audit/01-01-AUDIT-REPORT.md` | Created | Full audit report with 3 issues, root causes, and fix recommendations |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Session race is root cause (not middleware logic) | Middleware correctly checks cookie; problem is cookie doesn't exist yet | Fix targets auth-context.tsx, not middleware.ts |
| Phase 2 should be 2 parallel plans | Session+login (same subsystem) vs avatars (UI components) are independent | Allows parallel execution in Phase 2 |
| Radix Avatar is canonical pattern | Already works in UserRow; declarative error handling vs imperative DOM hacks | Simple replacement in 3 files |

## Deviations from Plan

None — plan executed exactly as written. Audit-only, no code changes.

## Issues Encountered

None.

## Additional Finding: Session Cookie Refresh Gap

The `__session` cookie is only set on initial login (onAuthStateChanged). There's no periodic refresh. If a user keeps a tab open for 14+ days, the cookie expires silently. Low priority but noted for Phase 2 consideration.

## Next Phase Readiness

**Ready:**
- Audit report provides surgical target list for Phase 2 (Auth Flow Rebuild)
- Fix recommendations specify exact files and changes
- Avatar fix (Phase 3) can be planned independently

**Concerns:**
- Fix 1 (session await) changes the auth initialization flow — must not introduce new loading delays
- Fix 2 (platform detection) needs testing on actual mobile devices

**Blockers:**
- None

---
*Phase: 01-auth-routing-audit, Plan: 01*
*Completed: 2026-03-11*
