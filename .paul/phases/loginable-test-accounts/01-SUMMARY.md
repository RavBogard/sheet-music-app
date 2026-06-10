# 01-SUMMARY — loginable mint + one-time login URL

**Plan:** `.paul/phases/loginable-test-accounts/01-PLAN.md`
**Status:** ✅ LOOP COMPLETE (3 tasks). All gates green.

## What shipped

`create_test_account` gained an opt-in `loginable: true`:
- **Enabled account:** `disabled: !loginable` (default still `disabled:true`, byte-identical). No password set — login is custom-token only, so the Firebase Email/Password provider is never relied upon (no new auth surface).
- **One-time login URL:** when loginable, after the user doc + claims are set, the tool mints `getAuth().createCustomToken(uid)` and writes a PRE-APPROVED, single-use `qr-sessions/{code}` doc (`status:"approved"`, `customToken`, `testUid`, 5-min `expiresAt`) with a high-entropy code (`randomBytes(24).base64url` — NOT the QR 6-char code, since this link grants a session). Returns `loginUrl: /test-login?code=…` + `loginable` on the result.
- **`loginable` flag** stamped on both `users/{uid}` and `mcpTestUsers/{uid}` (consumed by Plan 02's cron + session-mint gate).
- **Cleanup (AC-4):** `qr-sessions` (by `testUid`) added to `CASCADE_FIELDS` + `RevokeTestAccountResult.cascaded`, so revoke/cleanup sweeps any un-consumed login doc.

New **`/test-login`** route (`page.tsx` + `TestLoginClient.tsx`): a headless variant of `QRSignIn`'s consume logic — reads `?code=` from `window.location.search` (avoids the `useSearchParams` CSR-bailout), GETs `/api/auth/qr?code=` once (pre-approved, no poll), `signInWithCustomToken`, then `syncSessionCookie(user)` (production session-cookie path) before `router.replace(next ?? "/setlists")`. Missing/invalid/expired/consumed → clean "Invalid or expired login link" state. `robots: noindex`, not linked from public `/login` or nav.

## AC proof
- **AC-1 (server half):** emulator — loginable mint → Auth user `disabled===false`, role claim, both docs `loginable===true`, a `qr-sessions` doc `status:approved` + `customToken` + `testUid` + `expiresAt>now`, result `loginUrl` matches `/test-login?code=…`. Browser end-to-end → UAT-PENDING.
- **AC-2 (default unchanged):** emulator — no-flag mint → `disabled===true`, `loginUrl` undefined, no qr-session doc.
- **AC-3 (admin refused):** emulator — `role:admin, loginable:true` → `admin_test_user_refused`, no qr-session leaked.
- **AC-4 (cleanup):** emulator — revoke of a loginable account → `cascaded["qr-sessions"]>=1`, login doc gone. (library_index/songs already cascade — verified, no gap widened.)

## Gates
- `tsc --noEmit` clean.
- `SKIP_ENV_VALIDATION=1 next build` clean — `/test-login` registered (ƒ dynamic).
- emulator `mcp-test-tokens` 32/32 (28 prior + 4 new), no regression.
- /ui-ux-pro-max invoked for the `/test-login` UI (loading + failure states; matches app theme — `bg-background`, `text-brand`, `role="alert"`/`aria-live`).
- CRC byte-identical: default `create_test_account` path unchanged.

## Deviations
- **Brief's "generated strong password, returned once" → SUPERSEDED** by Daniel's Option 4 (2026-06-10): the one-time custom-token URL is the credential. No password, no Email/Password provider. AC-1 redefined from "use credentials on the login page" to "open the one-time login URL." Verified-first: the QR PUT-approval path mints a token for the *approver's own uid* and needs a second signed-in device → hard-coupled to physical-device handoff, so we reuse only the `qr-sessions` store + GET-consume endpoint and add `/test-login`; public `/login` + `/qr/[code]` untouched.

## Output
Browser end-to-end check → `.paul/UAT-PENDING.md`.
