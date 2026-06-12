---
phase: bug13-qr-code-generator
plan: 01
type: execute
autonomous: true    # Ends in a prod Vercel deploy of /api/auth/qr; deploy pre-authorized by the request ("Deploy when green") + binding autonomy posture → run straight through APPLY incl. commit/push/deploy once gates are green.
---

<objective>
## Goal
Make the server fallback `generateCode()` (`src/app/api/auth/qr/route.ts:22`) always
emit exactly 6 chars from `[A-Z0-9]`, so it can never produce the <6-char codes the
`^[A-Z0-9]{6}$` validators (POST/GET/PUT) then reject. Fixes BUG-13 (run3-B report
§11; live repro `"HEBFW"`).
</objective>

<context>
@.paul/PROJECT.md
@src/app/api/auth/qr/route.ts                         # generateCode() at line 22; validators at 50/92/177
@src/app/api/auth/qr/__tests__/route.test.ts          # existing GET BUG-7/BUG-12 suite
@src/components/auth/QRSignIn.tsx                      # client generator (VERIFY-FIRST — already correct)
@.paul/research/STRESS-TEST-REPORT-2026-06-11-run3-B.md # §11 BUG-13

## VERIFY-FIRST RESOLVED (done at plan time)
The client `generateClientCode()` (QRSignIn.tsx:31) is **correct** — it loops exactly
6× over a fixed `[A-Z0-9]` readable subset (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`),
appending one char per iteration → always 6 chars in `[A-Z0-9]`. **No client fix
needed.** Real device-QR sign-in POSTs this valid client code, so it is NOT affected by
BUG-13. The defect is ONLY the SERVER fallback `generateCode()`, reached only when POST
gets no body / an invalid (non-6-char) client code (rare in real usage; my empty-body
test POST triggered the `"HEBFW"` repro).

## Root cause
`generateCode()` = `randomBytes(4).toString("base64url").replace(/[^A-Za-z0-9]/g,"").slice(0,6).toUpperCase()`.
The `.replace` strips any `-`/`_` from the ~6-char base64url draw, so a draw containing
them collapses to ≤5 chars. The `.slice(0,6)` only caps, never pads → variable length.

## Consequence to also close
A short server-generated code POSTed creates a `qr-sessions` doc whose id the GET-expiry
cleanup can never delete (the format guard 400s before the expired-delete) → permanent
orphan. Real prod orphans are ~nonexistent (client always sends valid codes; only
server-fallback POSTs make short codes — just the now-deleted `HEBFW`). A verify-first
prod sweep confirms zero remain.
</context>

<acceptance_criteria>

## AC-1: generateCode always emits a valid 6-char code (distribution)
```gherkin
Given the fixed generateCode()
When it is called 1000 times
Then every output matches /^[A-Z0-9]{6}$/ (length exactly 6, charset [A-Z0-9])
And no output contains '-' or '_' or is shorter than 6 (the BUG-13 / "HEBFW" class)
```

## AC-2: Generated codes pass the route validators end-to-end
```gherkin
Given a server-generated code (POST /api/auth/qr with no body → generateCode())
When the code is later polled via GET /api/auth/qr?code=<code>
Then the format guard does NOT 400 it (reaches the Firestore lookup → 404 when absent)
And the same code shape is accepted by POST's client-code guard and PUT's guard (all /^[A-Z0-9]{6}$/)
```

## AC-3: BUG-7 / BUG-12 behavior unchanged
```gherkin
Given the existing GET validator (both-shapes, from BUG-12)
When a malformed code ("foo%2Fbar") or a 32-char test-login code is polled
Then malformed → 400 before Firestore; 32-char base64url → reaches lookup (unchanged)
```

## AC-4: No legacy short-code orphans remain in prod (verify-first)
```gherkin
Given prod qr-sessions
When listed and filtered for ids matching NEITHER /^[A-Z0-9]{6}$/ NOR /^[A-Za-z0-9_-]{32}$/
Then the count is 0 (delete any expired non-conforming docs found; expect none — HEBFW already removed)
```

</acceptance_criteria>

<tasks>

<task type="auto">
  <name>Fix generateCode to fixed 6-char [A-Z0-9] + distribution/validator regression tests</name>
  <files>src/app/api/auth/qr/route.ts, src/app/api/auth/qr/__tests__/route.test.ts</files>
  <action>
    **route.ts:**
    Replace the body of `generateCode()` (line ~22) with a fixed-length generator that
    mirrors the client's approach (QRSignIn.tsx) — loop exactly 6× over a fixed charset:
    ```ts
    function generateCode(): string {
        // 6 chars from a readable [A-Z0-9] subset (no I/O/0/1), one per iteration —
        // mirrors the client generator (QRSignIn.tsx). BUG-13 (run-3 §BUG-13): the old
        // base64url + .replace(/[^A-Za-z0-9]/g,"") could drop '-'/'_' and emit a <6-char
        // code that the ^[A-Z0-9]{6}$ validators (POST/GET/PUT) then reject. A fixed loop
        // guarantees exactly 6 chars in [A-Z0-9].
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
        const bytes = randomBytes(6)
        let code = ""
        for (let i = 0; i < 6; i++) code += chars[bytes[i] % chars.length]
        return code
    }
    ```
    EXPORT `generateCode` (add `export`) so the distribution test can call it directly.
    `randomBytes` is already imported. Do NOT touch the validators (DEVICE_CODE_RE /
    TEST_LOGIN_CODE_RE / POST line 50 / PUT line 177) — they are correct; this aligns the
    generator to them. Charset is a strict subset of [A-Z0-9], so all output passes.

    **route.test.ts:** add a `generateCode` describe block (import the now-exported fn):
    - AC-1 distribution: call generateCode() 1000× → assert EVERY result matches
      /^[A-Z0-9]{6}$/ and has length 6 (cite BUG-13). Also assert none contains '-'/'_'.
    - AC-2 round-trip: assert each of N generated codes satisfies the GET guard
      (DEVICE_CODE_RE.test(code) === true). Optionally exercise the POST path with no body
      (Firestore mocked): capture the code passed to mockDoc and assert it matches
      /^[A-Z0-9]{6}$/, proving the server-generated code reaches the .doc(code).set() write
      (i.e. would not be self-rejected by a later GET).
    Keep all existing BUG-7/BUG-12 GET cases (AC-3 — unchanged).
    Avoid: re-deriving randomness in the test; just assert the contract on real output.
  </action>
  <verify>npx vitest run src/app/api/auth/qr/__tests__/route.test.ts (all green incl. 1000-draw distribution) ; npx tsc --noEmit ; SKIP_ENV_VALIDATION=1 npx next build (route compiles)</verify>
  <done>AC-1, AC-2, AC-3 satisfied: generateCode is fixed-length 6-char [A-Z0-9], distribution-proven over 1000 draws, accepted by the validators; BUG-7/BUG-12 GET behavior unchanged; tsc + build green.</done>
</task>

</tasks>

<verification>
Before declaring complete:
- [ ] `npx vitest run src/app/api/auth/qr/__tests__/route.test.ts` — all pass (1000-draw distribution + round-trip + existing BUG-7/BUG-12 cases)
- [ ] `npx tsc --noEmit` — clean
- [ ] `SKIP_ENV_VALIDATION=1 npx next build` — qr route compiles
- [ ] AC-4 prod sweep (post-deploy, via Firebase MCP): list `qr-sessions`, filter ids
      matching neither /^[A-Z0-9]{6}$/ nor /^[A-Za-z0-9_-]{32}$/ → expect 0; delete any
      expired non-conforming doc found (none expected — HEBFW already removed).
</verification>

<success_criteria>
- generateCode emits exactly 6 [A-Z0-9] chars, 1000/1000 draws conform
- No regression to BUG-7 (malformed→400) or BUG-12 (32-char→lookup) GET behavior
- tsc clean · qr route tests green · next build green
- Prod qr-sessions free of non-conforming short-id orphans (verify-first)
- Deployed to prod master (request: "Deploy when green")
</success_criteria>

<output>
After gates green: commit + push `origin master` → Vercel prod deploy. Run the AC-4
prod sweep. Then create `.paul/phases/bug13-qr-code-generator/bug13-01-SUMMARY.md`.
</output>
