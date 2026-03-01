---
phase: 01-data-foundation
plan: 03
subsystem: ui, api
tags: [sonner, toast, email, resend, next-api, zod, rate-limit]

# Dependency graph
requires:
  - phase: none
    provides: existing PublishDialog and email infrastructure
provides:
  - "Yellow warning toast when publish succeeds but email delivery fails"
  - "Resend Emails button in PublishDialog for retrying failed email delivery"
  - "POST /api/setlist/resend-email endpoint with auth, rate limiting, and Zod validation"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Conditional toast pattern: warning for partial failures, success for full success"
    - "Resend endpoint pattern: reuse emailAllMembers with same recipient logic as publish"

key-files:
  created:
    - "src/app/api/setlist/resend-email/route.ts"
  modified:
    - "src/components/setlist/PublishDialog.tsx"

key-decisions:
  - "Re-send to ALL recipients (not just failed) for simplicity -- Resend handles dedup at ESP level"
  - "Used api rate limit tier (60/min) rather than custom resend-specific limiter"

patterns-established:
  - "Conditional toast: check response field to choose warning vs success toast"
  - "Resend endpoint: lightweight POST that reuses existing emailAllMembers function"

requirements-completed: [STAB-02]

# Metrics
duration: 3min
completed: 2026-03-01
---

# Phase 1 Plan 3: Email Error Surfacing Summary

**Yellow warning toast on email failures with resend button, backed by authenticated resend-email API endpoint**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-01T20:38:51Z
- **Completed:** 2026-03-01T20:41:30Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- PublishDialog now shows a yellow warning toast when publish succeeds but email delivery fails, instead of burying the error in a green success toast description
- Added a "Resend Emails" button with loading state that appears in the post-publish dialog when email errors occurred
- Created POST /api/setlist/resend-email endpoint with full auth (owner/leader/admin), rate limiting, Zod validation, and published-state verification

## Task Commits

Each task was committed atomically:

1. **Task 1: Add conditional warning toast and resend button to PublishDialog** - `45b2092` (feat)
2. **Task 2: Create resend-email API endpoint** - `41f5a64` (feat)

## Files Created/Modified
- `src/components/setlist/PublishDialog.tsx` - Conditional warning/success toasts, emailError state tracking, resend button with loading state, handleResendEmails handler
- `src/app/api/setlist/resend-email/route.ts` - New POST endpoint for re-sending email notifications with auth, rate limiting, Zod validation, and emailAllMembers integration

## Decisions Made
- **Re-send to ALL recipients:** Rather than tracking which specific recipients failed (which would require persistent storage of failure state), the resend endpoint re-sends to all email recipients. Resend (the ESP) handles deduplication at the delivery level, and musicians receiving a duplicate notification email is low-impact. This follows the recommendation from RESEARCH.md Open Question 1.
- **Used existing api rate limit tier:** Rather than creating a custom rate limiter for the resend endpoint, used the existing `api` tier (60 req/min). This is sufficient to prevent spam while being simple to implement.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- STAB-02 (email error surfacing) is complete
- The resend-email endpoint follows the same patterns as the publish route and is ready for production use
- No blockers for subsequent phases

## Self-Check: PASSED

All files verified present. All commits verified in git log.

---
*Phase: 01-data-foundation*
*Completed: 2026-03-01*
