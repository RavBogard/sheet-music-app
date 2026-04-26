---
phase: v44-05-observability
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/api-wrapper.ts
  - src/lib/api-auth.ts
  - src/lib/logger.ts
  - src/lib/request-id.ts
  - src/app/api/chat/route.ts
  - src/lib/api-client.ts
  - src/lib/__tests__/request-id.test.ts
  - src/lib/__tests__/api-wrapper-request-id.test.ts
autonomous: true
---

<objective>
## Goal
Every API request gets a traceable request ID that flows through logs, error responses, and SSE streams. When a musician reports "chart didn't load last Shabbat" or "chat stopped mid-answer," we can pull one ID from the browser's network tab (or from a toast) and grep it across server logs to reconstruct what happened.

## Purpose
Closes R1D **L-001** (Request-ID propagation) and R1A **S-004** (chat route SSE status). Both are Phase 5 scope from the v4.4 ROADMAP. With the band onboarding imminent, prod triage needs to go from "I don't know why that failed" to "here's the exact chain." Zero user-visible UX change — pure debuggability infrastructure.

## Output
- `x-request-id` header accepted on every inbound request; generated if absent.
- ID echoed back on every response (success + error) in `x-request-id` header and inside `ApiErrorResponse.requestId`.
- ID threaded into logger calls for the duration of the handler via `AsyncLocalStorage`, so every `logger.error/warn/info` inside a handler is automatically annotated with the ID (no manual plumbing at every call site).
- Chat SSE stream emits an initial `event: meta` frame with `{ requestId }` and a terminal `event: done` frame; heartbeat pings every 15s so proxies don't cut the connection.
- Client fetch helper (`api-client`) logs the `x-request-id` of failed responses so `logger.error` on the client carries the server's ID too.
- Tests lock the ID-propagation invariant.
</objective>

<context>
## Project Context
@.paul/PROJECT.md
@.paul/ROADMAP.md
@.paul/STATE.md
@.paul/phases/v44-00-full-audit/SUMMARY.md

## Source Files
@src/lib/api-wrapper.ts
@src/lib/api-auth.ts
@src/lib/logger.ts
@src/lib/api-client.ts
@src/app/api/chat/route.ts
</context>

<skills>
## Required Skills (from SPECIAL-FLOWS.md)

| Skill | Priority | When to Invoke | Loaded? |
|-------|----------|----------------|---------|
| /ui-ux-pro-max | not-required | N/A — backend observability, no UI changes | ✓ (already loaded this session) |

No frontend UI/UX work. This is server-side middleware + logging + SSE protocol. `/ui-ux-pro-max` not applicable.
</skills>

<acceptance_criteria>

## AC-1: Every inbound request carries a request ID end-to-end
```gherkin
Given any route wrapped by createApiHandler (or the auth-only withAuth pattern)
When a request arrives with or without an `x-request-id` header
Then the handler runs inside an AsyncLocalStorage context whose requestId is either
     the inbound header value (validated as a safe short string) OR a freshly generated UUIDv4
  And every logger.{log,warn,error,info,debug} call emitted by the handler carries that ID
     as a structured field in the output
  And the Response returned (success or error, JSON or SSE) has an `x-request-id` response header
     set to the same ID
```

## AC-2: Error responses include the request ID in the body
```gherkin
Given an API route that fails with apiError(...) (validation, auth, handler throw)
When the caller receives the JSON error body
Then the body shape is { error, code?, details?, requestId }
  And requestId matches the `x-request-id` response header exactly
```

## AC-3: Chat SSE stream emits meta + heartbeat + done events
```gherkin
Given the chat SSE route is open with an active stream
When the server begins streaming
Then the first SSE frame is `event: meta\ndata: {"requestId":"<uuid>"}\n\n`
  And every 15 seconds the server emits `: heartbeat\n\n` (comment line — no payload, keeps proxies alive)
  And when the assistant response is fully flushed, the server emits `event: done\ndata: {"requestId":"<uuid>"}\n\n` before closing
  And the response headers include `x-request-id`
```

## AC-4: Client fetch helper surfaces the server's request ID on failures
```gherkin
Given the client uses apiFetch/apiClient and the request returns a non-2xx status
When the error path runs
Then logger.error is called with { requestId, status, url, error }
     where requestId is the server's response `x-request-id` header
  And the server-reported requestId (from the JSON body if present) is preferred
     over the header (they should match, but body is canonical)
```

## AC-5: Regression tests lock the invariants
```gherkin
Given the new test files
When the suite runs
Then they cover:
  - generateRequestId returns a UUIDv4 format string
  - validateInboundRequestId accepts short safe IDs, rejects >128 chars, rejects control chars
  - createApiHandler sets x-request-id on success response
  - createApiHandler sets x-request-id on validation-error response
  - createApiHandler sets x-request-id on auth-failure response
  - createApiHandler echoes inbound x-request-id when present
  - createApiHandler generates a new ID when inbound is absent
  - AsyncLocalStorage context binds the request ID for the handler duration
  And all pass.
```

## AC-6: Zero regression in the existing 1297 tests
```gherkin
When the full vitest suite runs
Then 1297 pre-existing tests still pass
  And at least +8 net tests from the new request-id test files pass
  And `npx tsc --noEmit`, `npm run lint`, `npm run build` are clean.
```

</acceptance_criteria>

<tasks>

<task type="auto">
  <name>Task 1: request-id module + logger integration</name>
  <files>
    src/lib/request-id.ts,
    src/lib/logger.ts,
    src/lib/__tests__/request-id.test.ts
  </files>
  <action>
    Create `src/lib/request-id.ts` exporting:
    - `generateRequestId(): string` — uses `crypto.randomUUID()` (Node 18+ / Edge runtime compatible, already used elsewhere in codebase — grep to confirm before importing).
    - `validateInboundRequestId(raw: string | null | undefined): string | null` — returns `raw` if:
      - non-null string
      - length 1..128
      - matches `/^[a-zA-Z0-9_-]+$/` (safe characters, no control chars, no header smuggling)
      Otherwise returns null.
    - `requestIdStorage: AsyncLocalStorage<{ requestId: string }>` (from `node:async_hooks`).
    - `getCurrentRequestId(): string | undefined` — reads from requestIdStorage; returns undefined outside a request.
    - `runWithRequestId<T>(requestId: string, fn: () => T): T` — convenience wrapper around requestIdStorage.run.

    Update `src/lib/logger.ts`:
    - Each method (log/warn/error/info/debug) reads `getCurrentRequestId()` and, if present, prepends `[req=<id>]` to the first arg. If first arg is an object, spread a `requestId` field into a wrapper `{ ...firstArg, requestId }`.
    - Keep the existing dev-only gating for log/info/debug; warn/error always fire.
    - DO NOT break any existing `logger.log(obj)` call sites — prepending the tag via string concat when the first arg is a string, or via object-spread when it's an object, is additive-only.

    Test file `src/lib/__tests__/request-id.test.ts` covers:
    - generateRequestId returns a 36-char UUIDv4 (regex check)
    - validateInboundRequestId accepts "abc123", rejects null, rejects "", rejects 129-char string, rejects "bad\x00char"
    - runWithRequestId + getCurrentRequestId round-trip inside and outside the scope
    - logger.warn emits the requestId when inside runWithRequestId (spy console.warn)

    Avoid:
    - Using `Math.random()` for ID generation.
    - Importing `node:async_hooks` into client code (this module is server-only — document at the top of the file).
    - Changing the existing logger signature or return type.
  </action>
  <verify>
    - `npx vitest run src/lib/__tests__/request-id.test.ts` — all cases green.
    - `npx tsc --noEmit` clean.
    - `grep -n "node:async_hooks\|async_hooks" src/lib/request-id.ts` — exactly one import.
  </verify>
  <done>AC-1 (logger half), AC-5 (first 4 test cases) satisfied.</done>
</task>

<task type="auto">
  <name>Task 2: wire request ID through createApiHandler + apiError + withAuth</name>
  <files>
    src/lib/api-wrapper.ts,
    src/lib/api-auth.ts,
    src/lib/__tests__/api-wrapper-request-id.test.ts
  </files>
  <action>
    Update `src/lib/api-wrapper.ts`:

    1. At the top of the returned async handler in `createApiHandler`:
       ```ts
       const inboundId = validateInboundRequestId(req.headers.get('x-request-id'))
       const requestId = inboundId ?? generateRequestId()
       return requestIdStorage.run({ requestId }, async () => {
           const response = await runHandler()  // existing body
           response.headers.set('x-request-id', requestId)
           return response
       })
       ```
       — wrap the entire existing try/catch so auth failures, validation errors, and thrown handler errors all get the header.

    2. Update `apiError(...)` to include `requestId: getCurrentRequestId()` in the JSON body when a context exists. Signature stays backward-compatible — callers outside a request context get `requestId: undefined` which is omitted by JSON.stringify.
       ```ts
       export function apiError(error, status, code?, details?): NextResponse {
           const requestId = getCurrentRequestId()
           const body: ApiErrorResponse = { error, ...(code && { code }), ...(details !== undefined && { details }), ...(requestId && { requestId }) }
           const res = NextResponse.json(body, { status })
           if (requestId) res.headers.set('x-request-id', requestId)
           return res
       }
       ```
       Update `ApiErrorResponse` type to add optional `requestId?: string`.

    3. In `src/lib/api-auth.ts`, for the standalone `withAuth` path (used by a few routes that don't use createApiHandler — chat, drive/file, streaming): export a small `wrapWithRequestId<T>(req, handler)` helper that does the same storage.run + header-set dance. DO NOT rewrite withAuth itself — additive helper only, so callers can opt in one route at a time. Apply it in Task 3 for the chat route.

    Test file `src/lib/__tests__/api-wrapper-request-id.test.ts`:
    - createApiHandler success — response carries x-request-id
    - createApiHandler validation error — JSON body has requestId, header matches
    - createApiHandler thrown error (mock handler throws) — body has requestId, header present
    - inbound x-request-id is echoed (when valid)
    - inbound x-request-id is replaced with a fresh one (when invalid — e.g. too long)
    Use a minimal fake NextRequest (see existing api-auth.test.ts pattern for reference).

    Avoid:
    - Changing the response shape for success responses (no new body field — header is sufficient).
    - Breaking any existing test that asserts on response.headers — new header is additive.
    - Leaking requestIdStorage into client bundles (only imported by server-side files in src/lib and src/app/api).
  </action>
  <verify>
    - `npx vitest run src/lib/__tests__/api-wrapper-request-id.test.ts` — 5+ cases green.
    - Full suite: `npx vitest run` — 1297 + ≥8 = 1305+ green, no regressions.
    - `npx tsc --noEmit` clean.
    - `grep -rn "x-request-id" src/lib/api-wrapper.ts` — at least 2 references (set + read).
  </verify>
  <done>AC-1, AC-2, AC-5 (all cases), AC-6 satisfied.</done>
</task>

<task type="auto">
  <name>Task 3: chat SSE meta/heartbeat/done events + client request-ID surfacing</name>
  <files>
    src/app/api/chat/route.ts,
    src/lib/api-client.ts
  </files>
  <action>
    **src/app/api/chat/route.ts:**

    Wrap the existing streaming handler body in `wrapWithRequestId(req, ...)` from Task 2. Then inside the ReadableStream start():

    1. Emit meta frame first:
       ```ts
       controller.enqueue(encoder.encode(`event: meta\ndata: ${JSON.stringify({ requestId })}\n\n`))
       ```
    2. Set up a heartbeat interval:
       ```ts
       const heartbeat = setInterval(() => {
           try { controller.enqueue(encoder.encode(': heartbeat\n\n')) } catch { /* closed */ }
       }, 15000)
       ```
       Cleared in cancel() AND after the final done event.
    3. After the existing stream body flushes, emit done + close:
       ```ts
       controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify({ requestId })}\n\n`))
       clearInterval(heartbeat)
       controller.close()
       ```
    4. Response init headers: include `'x-request-id': requestId` alongside `'Content-Type': 'text/event-stream'`.

    Pass the requestId through any internal logger.error calls inside the chat handler so prompt-injection blocks, upstream LLM failures, etc. tag the same ID.

    Do NOT change the SSE message shape for assistant tokens themselves (ChatPanel parses a specific format — keep it). Only add the meta, heartbeat, and done frames.

    **src/lib/api-client.ts:**

    In the error path (response.ok === false), extract the server's request ID:
    ```ts
    const headerId = response.headers.get('x-request-id') ?? undefined
    let bodyId: string | undefined
    try {
        const errJson = await response.clone().json()
        bodyId = errJson?.requestId
    } catch { /* non-JSON error body */ }
    const requestId = bodyId ?? headerId
    logger.error({ event: 'api-fetch-failed', url, status: response.status, requestId, error: ... })
    ```
    Keep the existing error-throw behavior — just enrich the log line.

    Avoid:
    - Breaking the ChatPanel consumer — it should continue to ignore unknown `event:` types (verify by reading ChatPanel's EventSource handler before changing anything).
    - Emitting heartbeats inside the chunked JSON payload (use SSE comment lines `: heartbeat\n\n`, which are spec-compliant and ignored by event listeners).
    - Adding heartbeat to every streaming route — chat only for this plan.
  </action>
  <verify>
    - Manual: `curl -N -H "Authorization: Bearer $TOK" ${SITE}/api/chat -d '{"messages":[{"role":"user","content":"hi"}]}' | head -20` shows `event: meta` first. (Skip if no live token — rely on tests for regression lock.)
    - `npx tsc --noEmit` clean.
    - `npx vitest run` full suite green (chat route has existing tests — ensure they still pass; the meta/done frames are additive, so token-parsing tests should be unaffected).
    - `grep -n "event: meta\|event: done\|heartbeat" src/app/api/chat/route.ts` — all three literals present.
    - `grep -n "requestId" src/lib/api-client.ts` — appears in the error branch.
  </verify>
  <done>AC-3, AC-4 satisfied.</done>
</task>

</tasks>

<boundaries>

## DO NOT CHANGE
- UI components or visuals — zero user-facing change.
- ChatPanel's EventSource message-parsing logic. Only the server-side SSE emissions change; ChatPanel must keep working unmodified because unknown event types are ignored by EventSource listeners.
- Firestore rules, Firebase admin paths, auth flow.
- The 1297 existing tests — new tests are additive.
- `withAuth`'s core signature — only add the `wrapWithRequestId` helper alongside it.

## SCOPE LIMITS
- NOT retrofitting every existing logger.error call site with a manual requestId field — AsyncLocalStorage does that implicitly.
- NOT adding Sentry/DataDog integration. logger still logs to console; Vercel logs pick it up.
- NOT propagating request IDs across sub-fetches (e.g., Drive, Gemini) unless it's a one-line header add. Out of scope.
- Heartbeat only on the chat SSE route; not on any other streaming endpoint (if there are others).
- No new dependencies.

</boundaries>

<verification>
Before declaring plan complete:
- [ ] `npx vitest run` — ≥1305 green (1297 + ≥8 new).
- [ ] `npx tsc --noEmit` — clean.
- [ ] `npm run lint` — clean.
- [ ] `npm run build` — clean.
- [ ] Deploy to Vercel (auto on master push); smoke check one API call: browser devtools → Network → any API request → Response Headers include `x-request-id`.
- [ ] Smoke the chat route: open the chat panel, send a message, confirm it still works (tokens stream normally despite added meta/done frames).
</verification>

<success_criteria>
- Every API request observably carries an ID from inbound header through logs through response.
- Failed requests show the ID in both header and JSON body so users/devs can report it.
- Chat SSE emits meta + heartbeat + done, making stream-cut debugging possible.
- Client logs the server's ID on fetch failures for cross-reference.
- 8+ new regression tests, all passing.
- No user-visible UX change.
</success_criteria>

<output>
After completion, create `.paul/phases/v44-05-observability/v44-05-SUMMARY.md` with:
- Per-file diff summary.
- Request-ID flow diagram (inbound → ALS → logger → response header/body).
- Test count before/after.
- Chat SSE frame sequence (meta/token×N/done) with a live curl sample.
- Commit hashes pushed to origin/master.
- Any deferred follow-ups (e.g., propagating to sub-fetches — explicitly out of scope here).
</output>
