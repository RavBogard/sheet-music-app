# SUMMARY — bug13-01: fixed-length `generateCode()` (BUG-13)

**Status:** ✅ COMPLETE — gates green, committed, pushed to `master` (Vercel prod deploy).
**Date:** 2026-06-11. **Track:** quick-fix. **Plan:** `bug13-01-PLAN.md`.

## What changed
`src/app/api/auth/qr/route.ts` — `generateCode()` (server fallback) was
`randomBytes(4).toString("base64url").replace(/[^A-Za-z0-9]/g,"").slice(0,6)`, which
**stripped any `-`/`_`** from the base64url draw → could emit a <6-char code (live
repro `"HEBFW"`) that the `^[A-Z0-9]{6}$` validators (POST/GET/PUT) then 400. Replaced
with a fixed loop over a readable `[A-Z0-9]` subset (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`,
new `CODE_CHARS` const), one char per iteration over `randomBytes(6)` → **always exactly
6 chars in `[A-Z0-9]`**. Mirrors the client generator's approach. `generateCode` is now
exported for the distribution test. Validators untouched (the generator was aligned to
them, not vice-versa).

## VERIFY-FIRST (resolved at plan time)
The client `generateClientCode()` (QRSignIn.tsx:31) is **correct** — fixed 6× loop over
`[A-Z0-9]` → always 6 valid chars. **No client fix needed.** Real device-QR sign-in
POSTs this valid client code, so it was never affected by BUG-13; only the server
fallback (empty/invalid-body POST) could mint a short code.

## Acceptance (all met)
- **AC-1** distribution: 1000 draws of `generateCode()` all match `/^[A-Z0-9]{6}$/`, length 6, no `-`/`_`. ✅
- **AC-2** round-trip: generated codes pass the device validator; POST-with-no-body → 200, code `/^[A-Z0-9]{6}$/`, written to `qr-sessions/<code>`, GET does NOT 400 it (reaches lookup → 404). ✅
- **AC-3** BUG-7/BUG-12 GET behavior unchanged (malformed→400, 32-char→lookup). ✅
- **AC-4** prod orphan sweep — verify-first, see below.

## Gates
- `vitest` qr route suite: **14/14** (3 BUG-7 + 8 BUG-12 + 3 BUG-13: distribution / validator / POST round-trip).
- `tsc --noEmit`: clean. `SKIP_ENV_VALIDATION=1 next build`: exit 0.

## Decisions
- **Server fallback only** (client already correct, verified) — fixed-length generator
  aligned to the existing `^[A-Z0-9]{6}$` validators rather than relaxing the validators.
- **Readable subset** (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, no I/O/0/1) matching the
  client — strict subset of `[A-Z0-9]`, so all output passes; tiny modulo bias is
  irrelevant for a 5-min single-use device-handoff code (security is in PUT-approve auth
  + TTL + single-use, not code entropy).

## Deploy + AC-4 sweep
Committed + pushed `origin master` → Vercel prod deploy (request: "Deploy when green").
**AC-4 prod sweep (post-deploy):** list `qr-sessions`, filter ids matching neither
`/^[A-Z0-9]{6}$/` nor `/^[A-Za-z0-9_-]{32}$/` → delete any expired non-conforming doc.
Expected 0 (the only short-code orphan, `HEBFW`, was already deleted during the BUG-12
re-fire). See post-deploy verification appended below.
