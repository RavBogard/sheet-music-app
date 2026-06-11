---
phase: bug12-qr-code-validator
plan: 01
type: execute
autonomous: true    # Deploy is a prod side-effect (auth endpoint), but the request explicitly waived the gate: "deploy when green. autonomous go. deploy whenever." → run straight through APPLY incl. commit/push/deploy once gates are green.
---

<objective>
## Goal
Widen the `GET /api/auth/qr` code-format validator so it admits BOTH legitimate
code shapes — the 6-char device-handoff QR code AND the 32-char base64url
test-login code that `create_test_account({loginable:true})` mints — while
keeping the BUG-7 guarantee that malformed / path-char codes 400 before
Firestore. Fixes BUG-12 (loginable `/test-login` consume re-broken by BUG-7's
over-broad `^[A-Z0-9]{6}$` gate).
</objective>

<context>
@.paul/PROJECT.md
@src/app/api/auth/qr/route.ts                         # the validator (GET handler, line ~92)
@src/app/api/auth/qr/__tests__/route.test.ts          # existing BUG-7 regression suite
@src/lib/mcp/tools/test-tokens.ts                      # authoritative mint shape (line 307)
@.paul/research/STRESS-TEST-REPORT-2026-06-11-run3-B.md # §BUG-12 (lines 119-162)

## Authoritative code shapes (read from source, NOT loosened)
- **Device-handoff QR** — `generateCode()` (route.ts:22-29): 6-char uppercase
  alphanumeric → `^[A-Z0-9]{6}$`. POST/PUT only ever handle this shape.
- **Test-login mint** — `randomBytes(24).toString("base64url")` (test-tokens.ts:307):
  24 bytes → **exactly 32** base64url chars. Alphabet = `A-Z a-z 0-9 - _`
  (base64url replaces `+`→`-` and `/`→`_`, so a `/` is NEVER produced) →
  `^[A-Za-z0-9_-]{32}$`. Written directly to `qr-sessions` by the admin SDK,
  bypassing POST/PUT; consumed only by GET.

## Why GET only
The 32-char code never travels through POST (client-code path is 6-char-gated)
or PUT (device approval is 6-char). Only the GET poll consumes it. POST/PUT stay
pinned to the 6-char shape — widening them is out of scope and would be wrong.

## BUG-7 guarantee preserved
Both accepted shapes are anchored (`^…$`) with fixed lengths (6 or 32) and char
classes that exclude `/` and `.`. `..%2Fetc` → `../etc` matches neither → 400
before `initAdmin()`/Firestore. Guarantee intact.
</context>

<acceptance_criteria>

## AC-1: Test-login (32-char) code reaches the lookup
```gherkin
Given a 32-char base64url code (e.g. "HTeAcKgffxbPycjgFgIQXkSgfuFT7GvP")
When GET /api/auth/qr?code=<32char> is called and no session doc exists
Then the format guard does NOT reject it (no 400 "Invalid code format")
And it reaches the Firestore lookup → 404 "Session not found"
```

## AC-2: Device-handoff (6-char) code still reaches the lookup (BUG-7 §regression)
```gherkin
Given a valid 6-char code "ABC123"
When GET /api/auth/qr?code=ABC123 is called and no session doc exists
Then it reaches the lookup → 404 "Session not found" (unchanged)
```

## AC-3: Malformed / path-char code → 400 before Firestore (BUG-7 guarantee held)
```gherkin
Given a code containing '/' ("foo%2Fbar") OR any length/charset not matching
      the two legitimate shapes (e.g. "abc", a 31- or 33-char string, "..%2Fetc")
When GET /api/auth/qr?code=<malformed> is called
Then it returns 400 "Invalid code format"
And no Firestore access occurs (collection() not called)
```

## AC-4: Original BUG-7 repro stays fixed
```gherkin
Given the exact BUG-7 repro "?code=foo%2Fbar" (a '/'-bearing code)
When GET /api/auth/qr is called
Then it returns 400 (not 500), guard runs before initAdmin()/Firestore
```

</acceptance_criteria>

<tasks>

<task type="auto">
  <name>Widen the GET validator to the two legitimate code shapes + add regression tests</name>
  <files>src/app/api/auth/qr/route.ts, src/app/api/auth/qr/__tests__/route.test.ts</files>
  <action>
    **route.ts:**
    1. Add two named, commented regex constants near the top (below COLLECTION):
       ```ts
       // 6-char device-handoff QR code (generateCode() output; POST/PUT path).
       const DEVICE_CODE_RE = /^[A-Z0-9]{6}$/
       // 32-char base64url test-login code minted by create_test_account({loginable:true})
       // (test-tokens.ts: randomBytes(24).toString("base64url")). base64url's alphabet is
       // A-Z a-z 0-9 - _ and NEVER contains '/', so the BUG-7 path-char guard still holds.
       const TEST_LOGIN_CODE_RE = /^[A-Za-z0-9_-]{32}$/
       ```
    2. In the GET handler, replace the single-shape guard
       `if (!/^[A-Z0-9]{6}$/.test(code)) { return 400 "Invalid code format" }`
       with a both-shapes guard:
       `if (!DEVICE_CODE_RE.test(code) && !TEST_LOGIN_CODE_RE.test(code)) { return 400 "Invalid code format" }`
       Keep the BUG-7 comment block; update it to note the GET endpoint serves TWO
       code namespaces (6-char device handoff + 32-char test-login) and both are
       validated before Firestore.
    3. DO NOT touch POST (line ~50) or PUT (line ~177): they only ever handle the
       6-char device-handoff code; widening them is out of scope and incorrect.
       (Optional: POST/PUT may reuse DEVICE_CODE_RE for the inline literal — a
       pure no-op refactor, only if it keeps behaviour byte-identical.)

    **route.test.ts:** extend the existing BUG-7 suite (keep all current cases —
    they cover AC-2/AC-3/AC-4):
    - NEW: a 32-char base64url code (use the report's
      "HTeAcKgffxbPycjgFgIQXkSgfuFT7GvP", mixed-case, exactly 32) → 404 "Session
      not found", and assert `mockDoc` was called with that code (proves it
      reached the lookup, not the guard) [AC-1].
    - NEW: a 32-char code containing '-' and '_' (base64url chars) → 404 (reaches
      lookup) [AC-1, charset breadth].
    - NEW boundary 400s (assert collection() NOT called) [AC-3]: a 31-char and a
      33-char base64url string (length boundary), a 5-char and 7-char uppercase
      string (6-char boundary), and a 32-char string containing '/' ("…%2F…")
      (path-char inside the right length).
    Avoid: loosening to "anything without '/'" — assert the boundary 400s so the
    validator stays exactly-two-shapes.
  </action>
  <verify>npx vitest run src/app/api/auth/qr/__tests__/route.test.ts  (all green, incl. new AC-1 + boundary cases) ; then npx tsc --noEmit ; then SKIP_ENV_VALIDATION=1 npx next build (route compiles)</verify>
  <done>AC-1, AC-2, AC-3, AC-4 satisfied: GET admits both the 6-char and the 32-char base64url shapes, rejects every other length/charset (incl. '/') with 400 before Firestore; original BUG-7 repro still 400; tsc + build green.</done>
</task>

</tasks>

<verification>
Before declaring complete:
- [ ] `npx vitest run src/app/api/auth/qr/__tests__/route.test.ts` — all pass (existing BUG-7 cases + new AC-1 + boundary 400 cases)
- [ ] `npx tsc --noEmit` — clean
- [ ] `SKIP_ENV_VALIDATION=1 npx next build` — the qr route compiles (auth-endpoint change → verify bundle)
- [ ] Manual reasoning recheck: base64url(24 bytes) is always exactly 32 chars, alphabet excludes '/'
</verification>

<output>
After completion (gates green): commit + push to `origin master`, then **deploy to
prod** (the request's "Deploy when green" — STOP-gate, surfaced as the APPLY
continuation step). Then create `.paul/phases/bug12-qr-code-validator/bug12-01-SUMMARY.md`.

Post-deploy live confirmation (append to `.paul/UAT-PENDING.md` — non-blocking unless
trivially runnable): mint `create_test_account({loginable:true})` → open the `loginUrl`
→ `GET /api/auth/qr?code=<32char>` returns `{status:"approved", token}` (200, not 400)
→ persona signs in. Then re-fire the four BUG-12-blocked stress cells (§7 of the report).
</output>
