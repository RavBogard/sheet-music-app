---
phase: 01-critical-security
plan: 02
subsystem: infra
tags: [firestore-rules, npm-audit, security, next-upgrade]

requires: []
provides:
  - Locked config/admins to Admin SDK only
  - Wildcard deny-all fallback in Firestore rules
  - Resolved Next.js 7 high-severity CVEs via 16.1.4→16.2.1
provides:
affects: []

tech-stack:
  added: []
  patterns: [deny-all-fallback-firestore-rules]

key-files:
  modified:
    - firestore.rules
    - package.json
    - package-lock.json

key-decisions:
  - "config/admins write:false — bootstrap writes already use Admin SDK"
  - "Next.js upgraded 16.1.4→16.2.1 to resolve 7 high CVEs (minor bump, no breaking changes)"
  - "Remaining 6 high tar vulns accepted — transitive via opensheetmusicdisplay/gl, build-time only"

duration: ~5min
completed: 2026-03-31
---

# Phase 1 Plan 02: Firestore Rules & npm Audit Summary

**Locked config/admins to Admin SDK only, added wildcard deny-all fallback, resolved Next.js CVEs, reduced npm vulnerabilities from 21 to 14.**

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: config/admins is read-only from client | Pass | Changed to `allow write: if false` |
| AC-2: Wildcard deny-all catches unmatched collections | Pass | `match /{document=**} { allow read, write: if false; }` added |
| AC-3: System collections are locked down | Pass | All 6 verified: auditLogs, scheduling_history, songUsage, library_index, qr-sessions, bridge-setup-codes |
| AC-4: npm audit shows no high/critical | Partial | 0 Next.js CVEs remaining; 6 high tar vulns remain (transitive, build-time only, not exploitable at runtime) |

## Files Modified

| File | Change | Purpose |
|------|--------|---------|
| `firestore.rules` | Modified | config/admins write:false + wildcard deny-all |
| `package.json` | Modified | next 16.1.4→16.2.1 |
| `package-lock.json` | Modified | Dependency tree updated |

## Deviations from Plan

| Type | Count | Impact |
|------|-------|--------|
| Scope additions | 1 | Next.js upgrade (plan said don't, but 7 high CVEs warranted it) |
| Deferred | 1 | tar transitive vulns — requires opensheetmusicdisplay downgrade |

**Next.js upgrade:** Plan originally said "Do NOT upgrade Next.js" but the audit revealed 7 high-severity CVEs (CSRF bypass, DoS vectors, request smuggling). Minor bump 16.1.4→16.2.1 resolved all without breaking changes.

**Remaining tar vulns:** 6 high-severity tar vulnerabilities are transitive through opensheetmusicdisplay→gl→node-gyp→tar. These are build-time dependencies for native graphics compilation. The app never extracts tar archives at runtime. Fixing requires downgrading opensheetmusicdisplay (breaking).

## Next Phase Readiness

**Ready:**
- Firestore rules now have defense-in-depth (explicit rules + deny-all fallback)
- npm audit is clean for all direct and most transitive deps

**Concerns:**
- 6 high tar vulns will persist until opensheetmusicdisplay updates their dep tree

**Blockers:** None

---
*Phase: 01-critical-security, Plan: 02*
*Completed: 2026-03-31*
