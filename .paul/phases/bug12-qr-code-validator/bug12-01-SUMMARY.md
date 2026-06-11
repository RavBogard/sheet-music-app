# SUMMARY — bug12-01: widen `GET /api/auth/qr` code validator (BUG-12)

**Status:** ✅ COMPLETE — gates green, committed, pushed to `master` (Vercel prod deploy).
**Date:** 2026-06-11. **Track:** quick-fix. **Plan:** `bug12-01-PLAN.md`.

## What changed
`src/app/api/auth/qr/route.ts` — the GET poll handler's BUG-7 format guard was
`^[A-Z0-9]{6}$`, which 400'd the **32-char base64url** test-login codes that
`create_test_account({loginable:true})` writes into the shared `qr-sessions`
collection → `/test-login` consume was dead (BUG-12). Replaced the single-shape
guard with a both-shapes guard via two named constants:
- `DEVICE_CODE_RE = /^[A-Z0-9]{6}$/` — 6-char device-handoff QR (`generateCode()`).
- `TEST_LOGIN_CODE_RE = /^[A-Za-z0-9_-]{32}$/` — `randomBytes(24).toString("base64url")`
  (test-tokens.ts:307), exactly 32 chars, base64url alphabet.
GET now `400`s only when a code matches **neither** shape.

**POST/PUT untouched** — they only ever handle the 6-char device-handoff code;
the 32-char code is written by the admin SDK directly and consumed only by GET.

## BUG-7 guarantee held
base64url's alphabet (`A-Z a-z 0-9 - _`) never contains `/`. Both accepted shapes
are anchored + fixed-length, so a `/`-bearing code, `..%2Fetc`, or a 31/33-char
string all still `400` before `initAdmin()`/Firestore. Confirmed by boundary tests.

## Acceptance (all met)
- **AC-1** 32-char base64url code (incl. one with `-`/`_`) → reaches lookup → 404 (not 400). ✅
- **AC-2** 6-char code → reaches lookup → 404 (unchanged). ✅
- **AC-3** malformed/boundary (5/7-char, lowercase-6, 31/33-char, 32-len-with-`/`) → 400, collection() not called. ✅
- **AC-4** original BUG-7 repro `?code=foo%2Fbar` → 400 before Firestore. ✅

## Gates
- `vitest` qr route suite: **11/11** (3 original BUG-7 + 8 new BUG-12/boundary).
- `tsc --noEmit`: clean.
- `SKIP_ENV_VALIDATION=1 next build`: exit 0 (`/api/auth/qr` + `/test-login` compile).

## Decisions
- **GET-only widening** (not POST/PUT): the 32-char namespace is GET-consumed only;
  widening the device-handoff approve/create paths would be incorrect scope.
- **Exactly-two-shapes, not "anything without `/`"**: per the request; boundary
  400 tests lock the validator to the two legitimate lengths/charsets.

## Deploy + UAT
Committed + pushed to `origin master` → Vercel prod deploy (request: "deploy when
green. autonomous go. deploy whenever.").

**Post-deploy live confirmation (UAT-PENDING):** mint `create_test_account({loginable:true})`
→ open `loginUrl` → `GET /api/auth/qr?code=<32char>` returns `{status:"approved",token}`
(200) → persona signs in. Then re-fire the 4 BUG-12-blocked stress cells (report §7:
BUG-9 e2e consume, leader authoring walk, QR single-use real-claim, B3 leader publish UI).
