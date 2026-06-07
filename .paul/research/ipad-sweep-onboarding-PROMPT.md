# Lane — iPad sweep: shared-device onboarding / QR sign-in (`ipad-sweep-onboarding`)

**Wave:** ipad-sweep (in-Claude-Code Playwright/WebKit bug sweep on the band's real iPad surface)
**Risk tier:** 1 (test-only `e2e/**`; the Web-SDK auth bridge already shipped — you consume it)
**Base SHA:** `9a6e6453c` (verify vs `.coord/shared/master-tip.md`)
**Lane id:** `ipad-sweep-onboarding` · **Branch:** `feat/ipad-sweep-onboarding` · **Worktree:** `sheet-music-app-ipad-sweep-onboarding/`
**Coder:** coder-2 · **Est:** ~3–4 hr

## Why this is the highest-value sweep lane
The band signs into **6 shared iPads** via the **QR flow** — iPad shows QR → musician's phone scans + approves → iPad signs in as that user. This is *literally how onboarding happens*. If this flow has a bug on iPad WebKit, onboarding fails at the door. Nobody has tested it at the real device profile.

## The foundation you build on (READ FIRST — verify, don't trust line numbers)
coder-5 shipped the harness at `9a6e6453c`: `e2e/helpers/auth.ts` (`mintTestAccount`, `loginAsTestUser` now does **Web-SDK sign-in** → `auth.currentUser` populated, `revokeTestAccount`), `e2e/perform-ipad.spec.ts` (reference pattern), `playwright.config.ts` `ipad-webkit` @ 820×1180 + landscape. The QR flow source: `src/app/api/auth/qr/route.ts` (POST create / GET poll / PUT approve→`createCustomToken`), `src/components/auth/QRSignIn.tsx` (client `signInWithCustomToken`), `src/app/qr/[code]/page.tsx`.

## What to probe
1. **QR display** — `/qr` (or wherever `QRSignIn` mounts) on iPad WebKit: QR renders instantly, code shows, countdown runs, no overflow.
2. **Full approve→sign-in cycle** — drive it end-to-end: POST `/api/auth/qr` (or let the client), then simulate the phone approving via `PUT /api/auth/qr` with an authed band_leader/admin bearer (mint a test approver). Assert the iPad page polls, receives the customToken, calls `signInWithCustomToken`, and lands **signed in as the approved test user** (`auth.currentUser.uid` matches).
3. **Role-gated landing** — after sign-in, the post-login view renders correctly **per role**: musician vs band_leader vs member. Probe each (mint one of each). Pending/unapproved role → blocked from approval (QR PUT gates to member/musician/band_leader/admin — verify a `member`-or-below is refused).
4. **Expiry / refresh** — let a code expire (or force `expiresAt` past); the iPad auto-refreshes a new code (no stuck state).
5. **Sign-out / switch-user** — sign out on the shared iPad; next user can sign in clean (no leaked prior-user state in `auth.currentUser` or the UI).
6. **`/login` page** on iPad WebKit — renders, touch-friendly, no overflow.
7. **Landscape** — QR + login render in landscape too.

## Isolation (MANDATORY)
- Track every minted uid + qr-session code; revoke/clean by id in `afterAll`. NEVER `cleanup_all_test_data` ([[feedback_sandbox_test_isolation]]). Bearer: dogfood `mint_admin_bearer` off root, revoke children post-run; never commit a token.

## Deliverable
- New spec(s) under `e2e/` (e.g. `e2e/onboarding-qr-ipad.spec.ts`).
- **Findings file** `.paul/research/ipad-sweep-onboarding-FINDINGS.md` (repro, severity, caught-by). Bugs are FINDINGS, not fixes — do NOT edit `src/` here (sweep ≠ fix). The onboarding flow is high-stakes: flag any sign-in/role bug as **HIGH** even if cosmetic-looking.
- SHIP-NOTICE to auditor + copy supervisor with prod run summary + finding count.

## Hard rules
- Stay in `e2e/**`. Do NOT edit `src/**` (incl. the QR route/component — you TEST them, not change them), `bridge/**`, repo-root `mcp/`, `SetlistGrid.tsx`, `errors.ts`, `error-envelopes.ts`. `playwright.config.ts` only with a claim.
- Prod runs only (`PLAYWRIGHT_USE_REMOTE=1 ... --project=ipad-webkit`); apex→www direct.

## Gates
`npm run test` (0 fail) + `playwright --list` + iPad prod run (green or findings). Push per narrow-lane caveat, OVERWRITE master-tip, SHIP-NOTICE.

## First actions
1. ACK in `supervisor.md` (sign `from coder-2`). 2. Cut worktree from `9a6e6453c`. 3. Read shipped `auth.ts` + QR route/component + `perform-ipad.spec.ts`. 4. Build.
