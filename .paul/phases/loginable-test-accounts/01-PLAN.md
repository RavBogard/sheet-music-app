---
phase: loginable-test-accounts
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/mcp/tools/test-tokens.ts
  - src/app/test-login/page.tsx
  - src/app/test-login/TestLoginClient.tsx
  - src/lib/mcp/__tests__/mcp-test-tokens.emulator.test.ts
autonomous: true
---

<objective>
## Goal
Give `create_test_account` an opt-in `loginable: true` that mints an **enabled**
test account plus a one-time, high-entropy **login URL** (built on the existing
QR custom-token mechanism), so the Playwright stress harness can open the URL and
obtain real Firebase **Web SDK auth state** + the normal app session cookie —
unblocking browser-side persona testing. Default behavior (no flag) is unchanged
(`disabled: true`, no login URL).

## Purpose
Stress-test run 1 (2026-06-10) `## INCOMPLETE` item 3: every `create_test_account`
mints `disabled: true`, so browser persona testing (login as test-member /
-musician / -musician-bus) is impossible. Real client-side Firestore reads
authorize via the Firebase **ID token**, not the app session cookie, so a
session-cookie-only shim (the existing `/api/auth/test-session`, META-003) does
NOT give Web SDK auth state. A genuine sign-in is required. (Source brief:
`.paul/research/TOOLING-BRIEF-test-account-login.md`; report:
`.paul/research/STRESS-TEST-REPORT-2026-06-10.md`.)

## Output
- `create_test_account({…, loginable?: true})` → enabled Auth user + a returned
  one-time `loginUrl` (shown ONCE, like the bearer token).
- A minimal `/test-login?code=…` client route that consumes the code via the
  existing `GET /api/auth/qr` path → `signInWithCustomToken` → the production
  session-cookie bootstrap → redirect. Clean failure on missing/invalid/expired.
- Revoke/cleanup cascade extended to sweep the login-link doc (AC-4 artifact).
</objective>

<context>
## Project Context
@.paul/PROJECT.md
@.paul/STATE.md
@.paul/research/TOOLING-BRIEF-test-account-login.md

## Source Files (deployed, verified 2026-06-10)
@src/lib/mcp/tools/test-tokens.ts
@src/app/api/auth/qr/route.ts
@src/components/auth/QRSignIn.tsx
@src/lib/test-isolation.ts
@docs/ACCESS-POLICY.md
</context>

<skills>
## Required Skills (from SPECIAL-FLOWS.md)

| Skill | Priority | When to Invoke | Loaded? |
|-------|----------|----------------|---------|
| /ui-ux-pro-max | required | Before building the `/test-login` page (Task 2) | ○ |

**BLOCKING:** `/ui-ux-pro-max` MUST be loaded before APPLY builds the
`/test-login` UI. It is a minimal harness-facing page (loading + clean-failure
states only — NOT a consumer surface), but it has visible UI states.

## Skill Invocation Checklist
- [ ] /ui-ux-pro-max loaded (run command or confirm)
</skills>

<acceptance_criteria>

## AC-1: Loginable account yields real browser sign-in
```gherkin
Given create_test_account({ role: "musician", loginable: true })
When the harness opens the returned one-time loginUrl
Then it signs in as that musician with real Firebase Web SDK auth state AND a
     normal /api/auth/session cookie (the production custom-token → session path),
     with role "musician" and ordinary consumer access
```
(Browser end-to-end is harness/UAT-verified → UAT-PENDING. The emulator test
proves the server side: an enabled Auth user + a pre-approved single-use
qr-session doc carrying a custom token for the test uid + a loginUrl in the
result.)

## AC-2: Default (no flag) is unchanged
```gherkin
Given create_test_account({ role: "musician" })   # loginable omitted
When the account is created
Then the Auth user is disabled: true, no loginUrl is returned, and no
     qr-session login doc is written (byte-for-byte the pre-change behavior)
```

## AC-3: admin loginable is refused
```gherkin
Given create_test_account({ role: "admin", loginable: true })
When the tool runs
Then it refuses with the structured "admin_test_user_refused" envelope and
     creates no Auth user, no token, and no login doc
```

## AC-4: Cleanup leaves no artifact (login doc included)
```gherkin
Given a loginable account that created content and a pending login doc
When revoke_test_account (or cleanup_all_test_data) runs
Then no artifact of that account remains — Auth user, mcpTokens, users/{uid},
     library_index uploads (+ Storage bytes), songs, and the qr-sessions login
     doc are all gone (verified: library_index/songs/etc. already cascade via
     CASCADE_FIELDS; this plan adds the qr-sessions login doc)
```

</acceptance_criteria>

<tasks>

<task type="auto">
  <name>Task 1: Add loginable mint + one-time QR-custom-token login URL to create_test_account</name>
  <files>src/lib/mcp/tools/test-tokens.ts</files>
  <action>
    Extend `provisionTestAccount` + `createTestAccountSchema` + the tool
    description with an opt-in `loginable`.

    Schema: add `loginable: z.boolean().optional()` to `createTestAccountSchema`
    with a description: enabled account + one-time login URL for browser persona
    testing; default false → disabled:true as today. Add `loginable?: boolean`
    to `CreateTestAccountArgs`.

    provisionTestAccount changes (keep the admin refusal + ttl + uidPrefix gates
    exactly as-is; admin is already refused before this point so AC-3 holds for
    loginable too):
    - `const loginable = args.loginable === true`
    - Step 1 createUser: set `disabled: !loginable` (loginable → false; default →
      true, unchanged). Do NOT set a password — login is custom-token only, so the
      Firebase Email/Password provider is never relied upon (no new auth surface).
    - users/{uid} doc (step 2) AND mcpTestUsers/{uid} doc (step 4): add
      `loginable` (boolean). These flags let Plan 02's cron + session-mint gate
      find loginable accounts; `ttlExpiresAt` is already written on both docs.
    - When `loginable`: after the user doc + claims are set, mint a one-time
      login link:
        * `const customToken = await getAuth().createCustomToken(uid)`
        * Generate a HIGH-ENTROPY code (NOT the 6-char QR code — this grants a
          session): `const loginCode = randomBytes(24).toString("base64url")`.
          (The GET /api/auth/qr consume path reads qr-sessions by doc id with no
          shape constraint; only POST/PUT enforce ^[A-Z0-9]{6}$, which we bypass
          by writing the doc directly with the admin SDK.)
        * Write `qr-sessions/{loginCode}` directly:
          `{ status: "approved", customToken, testUid: uid,
             userName: displayName, userPhoto: null,
             createdAt: now, expiresAt: now + 5*60*1000 }`
          (5-min single-use login link — once opened, the resulting session/refresh
          token carries the account TTL, enforced by Plan 02. GET consumes+deletes
          the doc on read, so it is inherently single-use.)
        * `const loginUrl = ` an app-relative path `/test-login?code=${loginCode}`.
          Return a path (not absolute) — the harness resolves it against the
          tenant origin it is driving.
    - Extend `CreateTestAccountResult` with `loginable: boolean` and an optional
      `loginUrl?: string` (present only when loginable). Return them.
    - Update the breadcrumb/log payload + the tool `description` string to
      document `loginable` (enabled account, one-time 5-min login URL via the QR
      custom-token path, role≠admin, returned ONCE).

    Revoke cascade (AC-4): add `{ collection: "qr-sessions", field: "testUid" }`
    to `CASCADE_FIELDS` and add `"qr-sessions": number` to the
    `RevokeTestAccountResult.cascaded` shape + the returned object
    (`cascaded["qr-sessions"] ?? 0`). This sweeps any un-consumed login doc.

    Avoid: setting a password; reusing the 6-char QR generator for the login
    code (too low-entropy for a session-granting link); altering the default
    (no-flag) path in any observable way.
  </action>
  <verify>`npx tsc --noEmit` clean for test-tokens.ts; manual read confirms disabled:!loginable, loginable flags on both docs, qr-session approved doc written only when loginable, qr-sessions in CASCADE_FIELDS.</verify>
  <done>AC-2 (default unchanged) + AC-3 (admin refused) + the server half of AC-1 (enabled user + pre-approved custom-token doc + loginUrl) + AC-4 (qr-sessions cascade) satisfied.</done>
</task>

<task type="auto">
  <name>Task 2: Build the /test-login consume route (headless QR consume)</name>
  <files>src/app/test-login/page.tsx, src/app/test-login/TestLoginClient.tsx</files>
  <action>
    Create a minimal client route that is a headless variant of `QRSignIn`'s
    consume logic — it takes the code from `?code=` instead of generating/
    displaying a QR.

    `page.tsx`: a thin server/page shell that renders `<TestLoginClient />`
    (mirror the `login/page.tsx` shell pattern; no metadata that links it from
    the public nav — this route is harness-only, never advertised).

    `TestLoginClient.tsx` ("use client"):
    - Read `code` from `useSearchParams()`. If absent → render a clean
      "Invalid or expired login link" failure state (no spinner loop).
    - On mount, `GET /api/auth/qr?code=<code>` ONCE (not a poll — the doc is
      pre-approved):
        * 200 + `{ status:"approved", token }` → `signInWithCustomToken(auth, token)`
          (import from "firebase/auth", `auth` from "@/lib/firebase" — same as
          QRSignIn). onAuthStateChanged in auth-context then bootstraps the
          /api/auth/session cookie exactly as the Google + QR flows do (proven by
          QRSignIn: "Auth state change will trigger the app to reload/redirect").
          Then `router.replace(next ?? "/setlists")` (honor a same-origin `?next=`
          like LoginClient does; default `/setlists`).
        * 404 / 410 / non-approved → clean "Invalid or expired login link"
          failure state with no retry loop (single-use semantics).
    - States: "loading" (spinner) → success-redirect | "failed" (static message).
      Keep it spartan; invoke /ui-ux-pro-max for the two visible states only.

    Avoid: polling/auto-refresh (that is the QR-display behavior — this link is
    pre-approved and single-use); exposing the code or token in any logged/visible
    text; linking this route from the public login or nav.
  </action>
  <verify>`SKIP_ENV_VALIDATION=1 npx next build` registers `/test-login` and is clean (client/server boundary check — this is the bundle-boundary gate per the v11 reusable lesson); tsc clean.</verify>
  <done>AC-1 browser path exists: opening loginUrl consumes the token, signs in via the production custom-token→session path, and redirects. (End-to-end browser run → UAT-PENDING.)</done>
</task>

<task type="auto">
  <name>Task 3: Emulator + unit coverage</name>
  <files>src/lib/mcp/__tests__/mcp-test-tokens.emulator.test.ts</files>
  <action>
    Extend the existing emulator suite (keep all current cases green):
    - loginable:true musician → Auth user `disabled === false`; role claim set;
      users/{uid} + mcpTestUsers/{uid} carry `loginable === true`; a
      `qr-sessions/{code}` doc exists with `status:"approved"`, a `customToken`,
      `testUid === uid`, and `expiresAt > now`; result has `loginable === true`
      and a `loginUrl` containing the code.
    - default (loginable omitted) musician → `disabled === true`; NO qr-session
      doc written; result `loginUrl` undefined (regression lock on AC-2).
    - admin + loginable:true → `admin_test_user_refused` envelope; no Auth user,
      no qr-session (AC-3).
    - revoke (or cleanup) of a loginable account that wrote a qr-session login
      doc → the qr-sessions doc is gone afterward; cascaded["qr-sessions"] >= 1
      (AC-4). Honor the self-inclusion fixture rule
      ([[feedback_self_inclusion_test_fixtures]]) and pass a uidPrefix so the
      sweep stays isolated ([[feedback_sandbox_test_isolation]]).
  </action>
  <verify>Run the emulator suite (Firebase emulator) — all cases green, no regression in the existing 28 mcp-test-tokens cases.</verify>
  <done>AC-1 (server half) + AC-2 + AC-3 + AC-4 proven under the emulator.</done>
</task>

</tasks>

<boundaries>
## DO NOT CHANGE
- src/app/login/** and src/app/qr/[code]/** — the public Google login + the
  band's physical-device QR onboarding are untouched (the QR PUT-approval path
  mints a custom token for the APPROVER's own uid and requires a second
  signed-in device — confirmed hard-coupled to device handoff; we do NOT alter
  it, we reuse only the qr-sessions store + the GET-consume endpoint).
- src/app/api/auth/qr/route.ts — GET already consumes approved sessions
  doc-id-keyed with no shape constraint; no change needed. Do not weaken its
  POST/PUT 6-char validation.
- The default (no-flag) create_test_account path — must stay byte-identical
  (disabled:true, no loginUrl).
- TTL ENFORCEMENT for browser sessions is OUT OF SCOPE here — Plan 02 owns the
  cron disable + revokeRefreshTokens + session-mint rejection + checkRevoked audit.

## SCOPE LIMITS
- No password / no Email-Password provider reliance — custom-token login only.
- No changes to publish/list test-data exclusion (existing isTestUser path +
  TODO(test-tokens-followup) already cover loginable accounts since they stay
  `test-` namespaced + isTestUser:true; ACCESS-POLICY invariant 5 holds).
- No new MCP tools; this extends create_test_account only.
</boundaries>

<verification>
Before declaring plan complete:
- [ ] `npx tsc --noEmit` clean
- [ ] `SKIP_ENV_VALIDATION=1 npx next build` clean (registers /test-login)
- [ ] mcp-test-tokens emulator suite green (new cases + no regression)
- [ ] /ui-ux-pro-max invoked for the /test-login UI
- [ ] CRC byte-identical: default create_test_account path unchanged
- [ ] All acceptance criteria met (browser end-to-end → UAT-PENDING entry added)
</verification>

<success_criteria>
- create_test_account({loginable:true}) returns an enabled account + one-time loginUrl
- /test-login consumes the link via the production custom-token → session path
- Default path provably unchanged; admin refused; cleanup sweeps the login doc
- Quality floor held (tsc + next build + emulator green)
</success_criteria>

<output>
After completion, create `.paul/phases/loginable-test-accounts/01-SUMMARY.md`
and append the browser end-to-end check to `.paul/UAT-PENDING.md`.
</output>
