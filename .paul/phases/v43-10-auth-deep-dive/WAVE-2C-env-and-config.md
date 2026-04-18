# WAVE-2C: Environment Variables, Config, and Deploy Hygiene Audit

**Date:** 2026-04-14  
**Scope:** Full env/config/deploy dependency audit to prevent "works in dev, broke in prod" incidents.

## Executive Summary

**Critical Finding:** `SESSION_ROLE_SECRET` marked optional in `env.mjs` but required at runtime—caused today's incident.

**Deploy Risk:** Build artifact (`build-info.json`) stale commit hash could complicate forensics.

**Cookie Hygiene:** All session/role cookies consistent; but bounce-count cookie lacks explicit path—FIX REQUIRED.

**Rate Limiting:** Safe—cold sign-in is ~4 reqs, limit is 60/min per user.

**Firebase Admin:** `initAdmin()` returns false on missing creds, but callers don't check → potential 500s.

---

## 1. Environment Variable Inventory

### Critical Tier (Produce 500 if missing)

| Variable | Declared As | Read By | Current Risk |
|---|---|---|---|
| SESSION_ROLE_SECRET | `.optional()` | /api/auth/session, /api/auth/refresh-session | **CRITICAL—silent 200, no role cookie, proxy redirects to /** |
| FIREBASE_CLIENT_EMAIL | `.optional()` | src/lib/firebase-admin.ts | **HIGH—Admin SDK fails** |
| FIREBASE_PRIVATE_KEY | `.optional()` | src/lib/firebase-admin.ts | **HIGH—Admin SDK fails** |
| CRON_SECRET | `.optional()` | All /api/cron/* | **HIGH—all crons 401 silently** |

### High Tier (Graceful degradation with user impact)

| Variable | Declared As | Status | Risk |
|---|---|---|---|
| RESEND_WEBHOOK_SECRET | NOT in env.mjs | Unvalidated | **MEDIUM—webhook auth fails** |
| BACKUP_BUCKET | NOT in env.mjs | Unvalidated | **MEDIUM—cron backup 500s** |
| GOOGLE_DRIVE_ROOT_FOLDER_ID | NOT in env.mjs | Unvalidated | **MEDIUM—sync cron fails** |

### Medium Tier (Full fallback)

- UPSTASH_REDIS_REST_URL/TOKEN — in-memory fallback works
- RESEND_API_KEY/FROM_EMAIL — email returns {ok:false}
- GOOGLE_GENERATIVE_AI_API_KEY — AI features error on client

---

## 2. Vercel Config (vercel.json)

Three cron routes declared; all require CRON_SECRET.

**Risk:** If CRON_SECRET not set, crons fail silently (401). Vercel retries 3x, then marks failed. No user visibility.

**Recommendation:** Require CRON_SECRET before deployment.

---

## 3. Cookie Attribute Audit

### Critical Issue: auth_bounce_count Missing Path

| Cookie | Path | sameSite | secure | httpOnly |
|---|---|---|---|---|
| __session | "/" | lax | NODE_ENV=prod | true |
| __session_role | "/" | lax | NODE_ENV=prod | true |
| auth_bounce_count | **MISSING** | (default) | (default) | false |

**CRITICAL FIX NEEDED:** `src/proxy.ts` line 79 sets bounce-count without `path: "/"`. May default to request path, making it unreadable on next middleware run.

**Fix:** Change to `{ maxAge: 10, path: "/" }`

---

## 4. /api/auth/session Failure Modes

| Condition | Status | Sets Cookies | Issue |
|---|---|---|---|
| No SESSION_ROLE_SECRET | 200 | Only __session | **CRITICAL—proxy can't verify, redirects pending to /** |
| Missing idToken | 400 | No | Normal |
| Token expired | 401 | No | Normal |
| Firestore read fails | 200 | Both | Degraded but OK |

**Key Issue:** Session route returns 200 with only `__session` when SESSION_ROLE_SECRET missing. Proxy sees no companion → can't verify role → pending user loops to `/`.

---

## 5. Rate Limit Analysis

- /api/auth/session uses 'api' tier: 60 req/min per user
- Cold sign-in burst: ~4 requests
- **Safe—ample margin**
- Redis fallback to in-memory: graceful but not globally consistent

---

## 6. Firebase Admin Init Issue

**CRITICAL:** Most callers do `initAdmin()` without checking return value.

```typescript
// WRONG:
initAdmin()
const auth = getAuth()  // May throw

// RIGHT:
if (!initAdmin()) return NextResponse.json({error: "Firebase not configured"}, {status: 503})
const auth = getAuth()
```

Affected routes:
- /api/auth/session (line 37)
- /api/auth/refresh-session (line 29)
- src/lib/firebase-admin.ts:verifyIdToken (line 37)

---

## 7. Build Artifact Skew

**Current:** package.json v2.11.4, build-info.json v2.11.4, commit 302525f.

**Risk:** In Vercel shallow clone, if `git describe --tags` fails, falls back to package.json. If stale, forensics delayed.

**Prevention:**
- Always tag releases: `git tag v2.11.4 && git push --tags`
- Or commit build-info.json
- Or unshallow in CI (already in update-build-info.js)

---

## 8. Immediate Action Items

### CRITICAL (Do now)

1. Mark SESSION_ROLE_SECRET required in env.mjs; fail-fast in session route if missing
2. Change logging for missing SESSION_ROLE_SECRET from warn to error
3. Fix auth_bounce_count path attribute
4. Audit all initAdmin() call sites; must check return value
5. Create pre-deploy checklist

### HIGH (Before next release)

6. Add undeclared env vars to env.mjs schema
7. Disable SKIP_ENV_VALIDATION in production
8. Add startup health check
9. Tag every release

### MEDIUM (P10 phase)

10. Cold-load session refresh
11. Drift repair retries + telemetry
12. E2E auth smoke test on deploy

---

## 9. Required Env Vars Summary

| Variable | Should Be |
|---|---|
| SESSION_ROLE_SECRET | REQUIRED (prod) |
| FIREBASE_CLIENT_EMAIL | REQUIRED |
| FIREBASE_PRIVATE_KEY | REQUIRED |
| CRON_SECRET | REQUIRED |
| RESEND_WEBHOOK_SECRET | REQUIRED (add to schema) |
| BACKUP_BUCKET | REQUIRED (if backup enabled) |
| GOOGLE_DRIVE_ROOT_FOLDER_ID | REQUIRED (if sync enabled) |

---

## 10. Files to Fix

1. src/env.mjs — Add missing vars; mark SESSION_ROLE_SECRET required
2. src/lib/firebase-admin.ts — Check all getAuth() calls
3. /api/auth/session — Validate SESSION_ROLE_SECRET on startup
4. /api/auth/refresh-session — Same
5. src/proxy.ts — Add path to bounce-count cookie
6. src/lib/session-role.ts — Change warning to error
7. docs/DEPLOY-CHECKLIST.md — Create

---

**Status:** Audit complete. Ready for implementation.

