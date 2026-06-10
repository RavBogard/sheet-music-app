---
phase: loginable-test-accounts
plan: 02
type: execute
wave: 1
depends_on: ["01"]
files_modified:
  - src/app/api/cron/disable-expired-test-accounts/route.ts
  - vercel.json
  - src/app/api/auth/session/route.ts
  - src/lib/mcp/__tests__/mcp-test-tokens.emulator.test.ts
autonomous: true
---

<objective>
## Goal
Enforce the test-account TTL for **browser-logged-in** loginable accounts, which
`verifyBearer`'s TTL check (MCP-bearer only) does not cover. An expired loginable
account must lose all access — new logins, AND any live browser session.

## Purpose
A loginable account is an enabled, real-login credential in production. Client
Firestore reads authorize via the Firebase **ID token**, not the app session
cookie, so a session-mint-only block leaves Firestore readable until the ID
token's natural expiry. The only true cutoff is disabling the Auth user +
revoking refresh tokens, so outstanding ID tokens die within their ≤1h lifetime
and `checkRevoked` session verification rejects live sessions. (Daniel decision
2026-06-10: Option 1 + revokeRefreshTokens + checkRevoked confirmation.)

## Output
- `GET /api/cron/disable-expired-test-accounts` (hourly Vercel cron): disables +
  `revokeRefreshTokens` for loginable test accounts past `ttlExpiresAt`.
- `/api/auth/session` POST: refuses to mint a session for an expired loginable
  test account (immediate effect).
- Confirmation that data-gating session-cookie verification uses
  `verifySessionCookie(cookie, true)` (checkRevoked).
</objective>

<context>
## Project Context
@.paul/PROJECT.md
@.paul/STATE.md
@.paul/research/TOOLING-BRIEF-test-account-login.md

## Prior Work (genuine dependency)
@.paul/phases/loginable-test-accounts/01-PLAN.md
# Plan 01 introduces the `loginable` flag + `ttlExpiresAt` on users/{uid} +
# mcpTestUsers/{uid}; this plan queries those.

## Source Files (deployed, verified 2026-06-10)
@src/lib/mcp/tools/test-tokens.ts
@src/app/api/auth/session/route.ts
@src/lib/server-auth.ts
@src/lib/drive-file-auth.ts
@src/lib/test-isolation.ts
@vercel.json
@src/app/api/cron/storage-backup/route.ts
</context>

<acceptance_criteria>

## AC-1: Cron disables + revokes expired loginable accounts
```gherkin
Given a loginable test account whose ttlExpiresAt is in the past
When GET /api/cron/disable-expired-test-accounts runs
Then the Auth user is disabled AND its refresh tokens are revoked
     (auth.updateUser(uid,{disabled:true}) + auth.revokeRefreshTokens(uid)),
     and the response reports the count; a not-yet-expired loginable account and
     every non-loginable (disabled:true) account are left untouched
```

## AC-2: Session mint refuses an expired loginable account
```gherkin
Given a loginable test account past its ttlExpiresAt (cron not yet run)
When the client POSTs its ID token to /api/auth/session
Then the mint is refused (401) — no session cookie is issued
```

## AC-3: Revoke still hard-deletes cleanly (regression)
```gherkin
Given any loginable test account
When revoke_test_account runs
Then the Auth user is deleted and a subsequent login URL / sign-in fails cleanly
     (404/410 from the consumed-or-deleted qr-session; deleted Auth user cannot
     sign in) — unchanged from Plan 01
```

## AC-4: Live browser session dies on disable+revoke
```gherkin
Given a live browser session for a loginable account
When the cron disables the account and revokes its refresh tokens
Then data-gating reads fail: every server path that authorizes a session cookie
     uses verifySessionCookie(cookie, true) so the revoked session is rejected,
     and the ID token cannot refresh (revoked) — total exposure ≤ ~2h
     (≤1h cron cadence + ≤1h ID-token lifetime)
```

</acceptance_criteria>

<tasks>

<task type="auto">
  <name>Task 1: Cron route — disable + revoke expired loginable accounts</name>
  <files>src/app/api/cron/disable-expired-test-accounts/route.ts, vercel.json</files>
  <action>
    Create `GET /api/cron/disable-expired-test-accounts` following the EXISTING
    cron-route pattern (copy the auth/guard + response shape from
    `src/app/api/cron/storage-backup/route.ts` — same Vercel-cron secret guard,
    `runtime`/`maxDuration` conventions, initAdmin, logger).

    Logic:
    - Query `mcpTestUsers` where `loginable == true` (Plan 01 stamps this) and
      filter in-memory to docs whose `ttlExpiresAt` (Timestamp) is <= now. (Walk
      the index, not Auth — small collection; mirrors list_test_accounts.)
    - For each expired uid: `auth.updateUser(uid, { disabled: true })` THEN
      `auth.revokeRefreshTokens(uid)` (revoke kills outstanding Web SDK ID tokens
      within their ≤1h lifetime — Daniel's addition 1). Best-effort per uid:
      catch + count failures, never throw the whole sweep.
    - Idempotent: an already-disabled account is a no-op (updateUser disabled:true
      again is harmless); still safe to re-revoke.
    - Do NOT delete data here — hard-delete stays with revoke_test_account /
      cleanup_all_test_data. This is the TTL *cutoff*, not the *sweep*.
    - Return `{ scanned, disabled, revoked, failures: [...] }`.

    vercel.json: add `{ "path": "/api/cron/disable-expired-test-accounts",
    "schedule": "0 * * * *" }` (hourly) to the `crons` array.

    Avoid: touching non-loginable (disabled:true) accounts; deleting any data;
    paging Firebase Auth (use the index).
  </action>
  <verify>`SKIP_ENV_VALIDATION=1 npx next build` registers the cron route; vercel.json parses (valid JSON); tsc clean.</verify>
  <done>AC-1 + AC-4 (token-revoke half) satisfied.</done>
</task>

<task type="auto">
  <name>Task 2: Session-mint rejection + checkRevoked audit</name>
  <files>src/app/api/auth/session/route.ts</files>
  <action>
    (a) In the `/api/auth/session` POST handler, after the ID token is verified
    and BEFORE the session cookie is minted: if the decoded uid is a test uid
    (`isTestUid(uid)` from "@/lib/test-isolation"), read `users/{uid}` and, when
    `loginable === true` and `ttlExpiresAt` is in the past, return 401
    (`{ error: "Unauthorized" }`, same shape as the existing failure) — no cookie.
    This is the immediate-effect gate (AC-2) for the window before the hourly
    cron runs. Keep the cost off the hot path for normal users: the users/{uid}
    read happens ONLY when `isTestUid(uid)` is true (real users short-circuit).

    (b) AUDIT — do NOT change unless a gap is found. Confirm every server path
    that authorizes a SESSION COOKIE for data access uses
    `verifySessionCookie(cookie, true)` (checkRevoked):
      - src/lib/server-auth.ts:39  → already `(sessionCookie, true)` ✅
      - src/lib/drive-file-auth.ts:45 → already `(cookie, true)` ✅
      - src/app/api/auth/session/route.ts:118 → this is the DELETE (sign-out)
        handler; checkRevoked is irrelevant there (clearing the cookie). Leave it.
    If grep surfaces any OTHER data-gating call site using the 1-arg form, switch
    it to `(cookie, true)`. Record the audit result in the SUMMARY.
  </action>
  <verify>tsc clean; grep `verifySessionCookie(` across src/ — every data-gating reader uses the 2-arg checkRevoked form; `SKIP_ENV_VALIDATION=1 npx next build` clean.</verify>
  <done>AC-2 (mint rejection) + AC-4 (checkRevoked confirmation) satisfied.</done>
</task>

<task type="auto">
  <name>Task 3: Emulator coverage for TTL enforcement</name>
  <files>src/lib/mcp/__tests__/mcp-test-tokens.emulator.test.ts</files>
  <action>
    Add cases (factor the cron's core into a testable exported function if the
    route handler is awkward to call directly — e.g. export
    `disableExpiredLoginableAccounts(db, auth, now)` and have the route call it):
    - expired loginable account → after the cron core runs: Auth user
      `disabled === true` and refresh tokens revoked (assert via
      `auth.getUser(uid).tokensValidAfterTime` advanced, or that a stale ID token
      is rejected by `verifyIdToken(..., true)`); a non-expired loginable account
      and a non-loginable account are untouched (AC-1).
    - revoke of a loginable account still deletes the Auth user (AC-3 regression).
    Honor uidPrefix isolation + self-inclusion fixture rules.
    (AC-2 session-mint rejection is an API-route concern — assert the guard
    predicate via a small unit on the extracted check, or add a route test if the
    harness supports it; otherwise note it as a UAT-PENDING line.)
  </action>
  <verify>Emulator suite green (new cases + no regression in Plan 01's cases).</verify>
  <done>AC-1 + AC-3 proven; AC-2/AC-4 covered by unit/audit + UAT-PENDING where route-level.</done>
</task>

</tasks>

<boundaries>
## DO NOT CHANGE
- The hard-delete cascade (revoke_test_account / cleanup_all_test_data) — this
  plan adds the TTL *cutoff*, not deletion.
- Non-loginable accounts (disabled:true) — the cron must never touch them.
- The `/api/auth/session` DELETE sign-out path (line 118) — checkRevoked is
  intentionally absent there.
- Normal (non-test) user login latency — the users/{uid} read in Task 2(a) is
  gated behind `isTestUid(uid)` so real users are unaffected.

## SCOPE LIMITS
- No new MCP tools; no UI changes.
- No data deletion in the cron.
</boundaries>

<verification>
Before declaring plan complete:
- [ ] `npx tsc --noEmit` clean
- [ ] `SKIP_ENV_VALIDATION=1 npx next build` clean (cron route registered; vercel.json valid)
- [ ] mcp-test-tokens emulator suite green (new cases + Plan 01 + existing, no regression)
- [ ] verifySessionCookie audit recorded — all data-gating readers use checkRevoked
- [ ] All acceptance criteria met
</verification>

<success_criteria>
- Expired loginable accounts are disabled + refresh-revoked hourly
- Session mint refuses expired loginable accounts immediately
- Live browser sessions die on disable+revoke (checkRevoked confirmed)
- Total exposure bounded to ~2h; hard-delete tooling unchanged
</success_criteria>

<output>
After completion, create `.paul/phases/loginable-test-accounts/02-SUMMARY.md`.
</output>
