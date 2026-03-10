---
phase: 02-security-api-consistency-v15
plan: 01
subsystem: security, api
tags: [csp, hsts, permissions-policy, error-sanitization, npm-audit]

requires:
  - phase: 01-critical-bug-fixes-v15
    provides: stable codebase with fixed bugs
provides:
  - Security headers (CSP, HSTS, Permissions-Policy)
  - Sanitized API error responses (no internal detail leaks)
  - Reduced npm audit vulnerability count
affects: [phase-02 remaining plans, deployment security posture]

tech-stack:
  added: []
  patterns: [generic-error-responses, security-headers-in-next-config]

key-files:
  created: []
  modified: [next.config.ts, src/app/api/library/rename/route.ts, src/app/api/chat/route.ts, src/app/api/drive/file/[fileId]/route.ts, package.json, package-lock.json]

key-decisions:
  - "CSP includes unsafe-inline and unsafe-eval for Next.js compatibility"
  - "npm audit fix without --force only — breaking upgrades deferred"
  - "Remaining 20 vulnerabilities all require semver-major upgrades"

patterns-established:
  - "API error responses return generic messages; full errors logged server-side"
  - "Security headers configured in next.config.ts headers() function"

duration: ~5min
completed: 2026-03-10
---

# Phase 2 Plan 01: Security Headers, Error Sanitization & npm Audit Summary

**Added CSP/HSTS/Permissions-Policy headers, sanitized 3 API routes leaking error details, and reduced npm vulnerabilities from 24 to 20 via safe upgrades.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~5 min |
| Completed | 2026-03-10 |
| Tasks | 3 completed |
| Files modified | 6 |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Security Headers Present | Pass | CSP, HSTS, Permissions-Policy all configured in next.config.ts |
| AC-2: Error Messages Sanitized | Pass | 3 routes return generic errors; 0 error.message leaks found |
| AC-3: npm Audit Vulnerabilities Reduced | Pass | 24 → 20 (removed 1 critical, 1 moderate, 2 high) |

## Accomplishments

- Added Content-Security-Policy restricting script/connect/frame sources to known domains (Google APIs, Firebase)
- Added HSTS (max-age=31536000) and Permissions-Policy (camera/geolocation/payment disabled)
- Sanitized error responses in library/rename, chat stream, and drive/file proxy routes
- Safe npm audit fix removed 36 packages, added 27, changed 22

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `next.config.ts` | Modified | Added 3 security headers (CSP, HSTS, Permissions-Policy) |
| `src/app/api/library/rename/route.ts` | Modified | Replaced `error.message` with generic "Rename failed" |
| `src/app/api/chat/route.ts` | Modified | Replaced `err.message` with generic "Stream error", added logger.error |
| `src/app/api/drive/file/[fileId]/route.ts` | Modified | Removed `reason` field from error response, log full error object |
| `package.json` | Modified | npm audit fix dependency updates |
| `package-lock.json` | Modified | npm audit fix lockfile updates |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| CSP uses unsafe-inline/unsafe-eval | Required for Next.js to function | Still restricts script sources to known domains |
| No --force for npm audit | Avoids breaking semver-major upgrades | 20 vulnerabilities remain (all need --force) |
| microphone=(self) in Permissions-Policy | Potential future audio features | Can tighten later if unused |

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness

**Ready:**
- Security headers in place for all routes
- Error sanitization pattern established for future route migrations
- Foundation set for Plan 02-02 (withAuth → createApiHandler migration, bridge credentials, etc.)

**Concerns:**
- 20 npm vulnerabilities remain (all require --force / semver-major)
- serialize-javascript, next, tar, firebase-admin chains are the main holdouts

**Blockers:**
- None

---
*Phase: 02-security-api-consistency-v15, Plan: 01*
*Completed: 2026-03-10*
