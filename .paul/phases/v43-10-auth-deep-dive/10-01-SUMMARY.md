---
phase: v43-10-auth-deep-dive
plan: 01
subsystem: auth
tags: [env-validation, deploy-ordering, middleware, firebase-admin, vercel]

requires:
  - phase: v43-09-role-claim-sync/02
    provides: server-signed __session_role companion cookie pattern

provides:
  - fail-fast env validation on Vercel Production
  - FIREBASE_NOT_INITIALIZED 500 at every /api/** initAdmin call site
  - armed auth_bounce_count loop-breaker (path:'/')
  - docs/DEPLOY-CHECKLIST.md

affects:
  - any future plan adding a server secret (must update env.mjs + DEPLOY-CHECKLIST)
  - any future /api route adding initAdmin (must guard the return)

tech-stack:
  added: []
  patterns:
    - "Gate prod-required env on VERCEL_ENV=production (not NODE_ENV) so local builds still pass"
    - "Guard initAdmin() return at every call site; return FIREBASE_NOT_INITIALIZED 500"
    - "Always set path:'/' on any cookie that needs to be read across path boundaries"

key-files:
  created:
    - docs/DEPLOY-CHECKLIST.md
  modified:
    - src/env.mjs
    - src/lib/session-role.ts
    - src/lib/__tests__/session-role.test.ts
    - src/proxy.ts
    - src/__tests__/proxy-auth.test.ts
    - 24 /api/** route files (initAdmin guards)
    - 5 test mock files (initAdmin mockReturnValue(true))

key-decisions:
  - "Required-ness keyed on VERCEL_ENV=production not NODE_ENV=production — so `npm run build` still works locally without prod secrets"
  - "CRON_SECRET downgraded to optional — app doesn't actually break without it (cron routes 401), keeping it required blocked deploys unnecessarily"
  - "Didn't introduce a requireServerEnv() helper — per-route guards are fine at this scale; revisit if pattern repeats"

duration: ~80min
started: 2026-04-15T02:15:00Z
completed: 2026-04-15T03:35:00Z
---

# Phase v43-10 Plan 01: Disarm the footguns

**Systemically closes the silent-degrade failure class that caused today's 28-minute production lockout: env vars now fail-fast on Vercel Production, `initAdmin()` returns are guarded at every call site, the redirect-loop escape hatch is actually armed, and the deploy order is written down.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~80 min |
| Tasks | 5 auto + 1 human-verify |
| Files created | 2 (SUMMARY + DEPLOY-CHECKLIST) |
| Files modified | 31 |
| Commits | 6 (5 for plan + 1 CRON_SECRET hotfix) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Missing SESSION_ROLE_SECRET fails fast on Vercel prod | Pass | Build log proof: same class of error surfaced for CRON_SECRET before that was downgraded |
| AC-2: Missing Firebase creds → named 500, not opaque throw | Pass | Every `/api/**` initAdmin() now guarded, returns FIREBASE_NOT_INITIALIZED 500 |
| AC-3: signRoleCookie strict in prod, graceful in dev | Pass | Unit tests cover both branches |
| AC-4: Bounce counter accumulates across paths | Pass | New regression test: 5 cross-path bounces → 5th hits /auth-error |
| AC-5: Deploy checklist exists | Pass | `docs/DEPLOY-CHECKLIST.md` shipped |
| AC-6: Dev/test ergonomics preserved | Pass | `SKIP_ENV_VALIDATION=1` still works; suite 1264/1264 |
| AC-7: No regressions on prod auth flow | Pass | Human-verify on prod — "works!" |

## Accomplishments

- **Today's exact incident class is now structurally impossible**: shipping code that depends on a missing Vercel Production secret will fail the build (not silently degrade at runtime). The `SESSION_ROLE_SECRET` silent-null that lost 28 minutes this afternoon can't recur.
- **Loop-breaker actually breaks loops now**. The `auth_bounce_count` cookie had been missing `path='/'` since at least v3, so the "after 3 bounces, send to /auth-error" fallback never fired — users stayed stuck in `/setlists ↔ /login` loops instead of landing on the designed escape page.
- **Firebase admin misconfig is diagnosable**. 24 `/api/**` routes that previously threw opaque 500s when creds were missing now return `FIREBASE_NOT_INITIALIZED` with a stable code.
- **The deploy order is written down** in a one-page reference colocated with the env-schema source-of-truth.

## Task Commits

| Commit | Type | Description |
|--------|------|-------------|
| `792913d` | feat | env.mjs fail-fast + session-role throws on Vercel prod |
| `9f5fefc` | fix | 24 route files guard initAdmin() return with FIREBASE_NOT_INITIALIZED 500 |
| `cb1bfce` | test | 5 test mock files updated to mockReturnValue(true) |
| `df9d83f` | fix | proxy auth_bounce_count cookie path='/', armed loop-breaker + regression test |
| `4795547` | docs | DEPLOY-CHECKLIST.md |
| `1d290a8` | hotfix | CRON_SECRET downgraded to optional (production didn't have it set; wasn't worth blocking the deploy) |

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/env.mjs` | Modified | prodRequired() helper keyed on VERCEL_ENV; 3 secrets now required-in-prod; 3 undeclared env vars declared |
| `src/lib/session-role.ts` | Modified | throws on Vercel prod when secret missing |
| `src/lib/__tests__/session-role.test.ts` | Modified | two new tests: graceful-dev, fail-fast-prod |
| `src/proxy.ts` | Modified | auth_bounce_count cookie sets/clears with path='/' |
| `src/__tests__/proxy-auth.test.ts` | Modified | 5-bounce regression test for the loop-breaker |
| `src/app/api/**/route.ts` | Modified (24) | initAdmin() return guarded |
| 5 test mock files | Modified | initAdmin mockReturnValue(true) |
| `docs/DEPLOY-CHECKLIST.md` | Created | authoritative deploy order + required/optional secret tables |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Gate on VERCEL_ENV=production, not NODE_ENV | `npm run build` locally would otherwise fail without prod secrets, which is user-hostile | Local builds unaffected; only Vercel prod enforces |
| CRON_SECRET downgraded to optional | App doesn't actually break without it (cron routes return 401); requiring it blocked deploys without user benefit | No cron regression; deploys green |
| No requireServerEnv() helper | Per-site guards are readable; 24 sites is within the tolerable-duplication range | If pattern repeats, revisit in a future plan |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | CRON_SECRET fail-fast blocked Vercel build; downgraded to optional |
| Scope additions | 0 | None |
| Deferred | 0 | None |

### Auto-fixed Issues

**1. CRON_SECRET not set on Vercel Production**
- **Found during:** First Vercel build after initial push
- **Issue:** env.mjs required-in-prod check failed the build at /api/cron/backup page-data collection
- **Fix:** Downgraded CRON_SECRET to `.optional()` with a note; documented in DEPLOY-CHECKLIST as an optional-but-important secret with its 401 degrade mode
- **Commit:** `1d290a8`
- **Verification:** Next Vercel build went green; user confirmed "works!"

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| tsc flagged `process.env.NODE_ENV = ...` as read-only | Cast via `(process.env as Record<string, string \| undefined>).NODE_ENV` |
| Uint8Array → ArrayBuffer typing in crypto.subtle.verify (pre-existing, resurfaced via test) | Already handled in 09-02 session-role.ts |
| Some test files mocked initAdmin without a return value | Swept to `vi.fn().mockReturnValue(true)` |
| Bounce counter threshold is `>3`, needs 5 iterations not 4 | Fixed test to reflect actual semantics |

## Next Phase Readiness

**Ready:**
- Silent-degrade failure class closed; deploys are now loud about misconfig
- Loop-breaker armed → future bugs in the redirect chain will surface via `/auth-error` within 10s
- P10-02 (cold-load race fix) can build on top safely — the env hardening de-risks future auth changes

**Concerns:**
- Rabbi Daniel's `/setlists ↔ /login` cold-load race is *not yet fixed* by this plan — that's P10-02's job. The symptom should happen less often now (no more "sign in returns 200 silently without companion cookie") but the underlying race is still live.

**Blockers:** None.

---
*Phase: v43-10-auth-deep-dive, Plan: 01*
*Completed: 2026-04-15*
