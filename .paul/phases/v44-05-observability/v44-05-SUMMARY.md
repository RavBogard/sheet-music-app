# v44-05 Observability — SUMMARY

Phase complete. All 3 tasks shipped. Pushed to `origin/master` → auto-deploys to Vercel production.

## Per-file diff

| File | Change |
|---|---|
| `src/lib/request-id.ts` | **NEW**. `generateRequestId()`, `validateInboundRequestId()`, `requestIdStorage` (AsyncLocalStorage), `getCurrentRequestId()`, `runWithRequestId()`. Registers `globalThis.__requestIdGetter__` so the logger can read the current ID without statically importing this server-only module. |
| `src/lib/logger.ts` | Every log/warn/error/info/debug call now auto-annotates with the current request ID — string args get `[req=<id>]` prefix, plain-object args get a `requestId` field merged in. Reads resolver off `globalThis` (NO static import of `request-id` / `node:async_hooks` — keeps client bundle clean). |
| `src/lib/api-wrapper.ts` | `createApiHandler` wraps the entire handler (including auth + validation) in `requestIdStorage.run(...)`. Every response — success, validation error, auth failure, thrown error — gets `x-request-id` header. `apiError()` now includes `requestId` in the JSON body and header when called inside a request scope. `ApiErrorResponse` gets optional `requestId?: string`. |
| `src/lib/api-auth.ts` | Additive `wrapWithRequestId(req, handler)` helper for routes that don't use `createApiHandler`. `withAuth` signature untouched. |
| `src/app/api/chat/route.ts` | SSE stream now emits `event: meta\ndata: {requestId}\n\n` first, `: heartbeat\n\n` every 15s (comment lines — ignored by EventSource), and `event: done\ndata: {requestId}\n\n` before close. Both SSE paths (template fast-path and main LLM streaming path) updated. Response init sets `x-request-id`. Assistant `data:` token shape unchanged. Route still uses `createApiHandler`, so ALS is already scoped — uses `getCurrentRequestId()` rather than adding a redundant `wrapWithRequestId`. |
| `src/lib/api-client.ts` | On non-OK responses, extracts the server's request ID (body `requestId` preferred, falls back to `x-request-id` header) and emits `logger.error({ event: 'api-fetch-failed', url, status, requestId })`. Defensive guards against test-stubbed responses without `headers`/`clone`. Original return-the-response behaviour preserved. |
| `src/lib/__tests__/request-id.test.ts` | **NEW**. 15 tests covering UUID generation, inbound validation (safe/unsafe chars, length bounds), ALS round-trip (sync + async), logger annotation (string prefix, object merge, no-scope no-op). |
| `src/lib/__tests__/api-wrapper-request-id.test.ts` | **NEW**. 9 tests covering header set on success/validation-error/thrown-error/auth-failure paths, inbound echo vs replace, body `requestId` on errors, `getCurrentRequestId()` visible from handler, `apiError()` outside scope still backward-compatible. |

## Request-ID flow

```
┌──────────────────┐         ┌──────────────────────────────────────────┐
│ Inbound Request  │         │ createApiHandler(req) / wrapWithRequestId│
│ x-request-id?    │──────▶──│   1. validateInboundRequestId(header)    │
└──────────────────┘         │   2. id ← inbound ?? generateRequestId() │
                             │   3. requestIdStorage.run({id}, ...)     │
                             └──────────────┬───────────────────────────┘
                                            │  ALS scope active
            ┌───────────────────────────────┼───────────────────────────┐
            ▼                               ▼                           ▼
┌────────────────────────┐   ┌──────────────────────────┐   ┌─────────────────────┐
│ logger.error/warn/...  │   │ apiError(msg, 400)       │   │ Chat SSE stream     │
│ reads globalThis getter│   │ reads getCurrentReq..()  │   │ reads getCurrent... │
│ → annotates w/ [req=X] │   │ → body.requestId + hdr   │   │ → meta + done frames│
└────────────────────────┘   └──────────────────────────┘   └─────────────────────┘
                                            │
                                            ▼
                             ┌──────────────────────────────────────────┐
                             │ Outbound Response                        │
                             │ Headers: x-request-id: <id>              │
                             │ JSON body (errors): { ..., requestId }   │
                             └──────────────────────────────────────────┘
                                            │
                                            ▼
                             ┌──────────────────────────────────────────┐
                             │ Client apiFetch                          │
                             │   if !response.ok:                       │
                             │     id = body.requestId ?? header        │
                             │     logger.error({ ..., requestId: id }) │
                             └──────────────────────────────────────────┘
```

## Chat SSE frame sequence

```
event: meta
data: {"requestId":"abc12345-..."}

: heartbeat

data: {"chunk":"Hello","accumulated":"Hello"}

data: {"chunk":" world","accumulated":"Hello world"}

: heartbeat

data: {"done":true,"message":"...","commands":[...]}

event: done
data: {"requestId":"abc12345-..."}
```

Response headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, `x-request-id: abc12345-...`.

Live curl sample (skip — no live token available in this session; locked by regression tests instead):
```bash
curl -N -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
     https://centralreform.live/api/chat \
     -d '{"messages":[{"role":"user","content":"hi"}],"libraryFiles":[],"currentSetlist":[]}' | head -20
```
Expected first line: `event: meta`.

## Test count

| Stage | Count |
|---|---|
| Before (baseline) | 1297 |
| After | **1321** |
| Net added | **+24** (15 request-id + 9 api-wrapper) |

Plan required ≥+8; delivered +24. All green. `npx tsc --noEmit`, `npm run lint`, `npm run build` clean.

## Commits pushed to origin/master

| Hash | Task | Subject |
|---|---|---|
| `c5200a6` | 1 | feat(observability): add request-id module + ALS logger integration |
| `e7e568c` | 2 | feat(observability): wire request-id through createApiHandler + apiError + wrapWithRequestId |
| `f15cb18` | 3 | feat(observability): chat SSE meta/heartbeat/done frames + client request-id surfacing |

## Deviations from plan

1. **Logger integration uses `globalThis` resolver, not a direct import.** The plan implied `logger.ts` would `import { getCurrentRequestId }` directly. That broke the webpack build: `logger.ts` is imported by `src/components/error-boundary.tsx` (a client component), which transitively pulled `node:async_hooks` into the browser bundle. Fixed by having `request-id.ts` register `globalThis.__requestIdGetter__` at import time, and `logger.ts` reads from there. Net effect identical; client bundle unaffected.
2. **Chat route did not need `wrapWithRequestId`.** It already runs inside `createApiHandler`, so the ALS scope is already active. Used `getCurrentRequestId()` directly. `wrapWithRequestId` is still exported in `api-auth.ts` for future opt-in by other non-`createApiHandler` routes (drive/file streaming etc.).
3. **`api-client.ts` error path wraps extraction in try/catch.** Some existing tests (e.g. `users-firebase.test.ts`) mock `fetch` with a minimal `{ok, status, text}` stub — they lack `.headers` and `.clone`. Defensive guards keep those tests passing while still grabbing the request ID from real Response objects in prod.

## Deferred / explicitly out-of-scope

- **Sub-fetch propagation** (Drive API, Gemini API, etc. receiving the ID as an outbound header for distributed tracing). Not done. Can be added as a one-line `headers.set('x-request-id', getCurrentRequestId() ?? '')` per sub-fetch call-site when needed.
- **Heartbeat on other streaming routes.** Only the chat route has heartbeat. Other SSE endpoints (if any added later) would need the same pattern.
- **Sentry / DataDog request-ID tagging.** Out of scope — `logger` still logs to console, Vercel picks it up. Future phase could enrich Sentry breadcrumbs with `getCurrentRequestId()`.
- **Audit L-001 / S-004 closure.** This phase closes them — confirm by updating ROADMAP/STATE in a follow-up doc phase.

## ChatPanel regression check

ChatPanel's parser (`src/components/setlist/ChatPanel.tsx:192`) only processes lines starting with `data: `. The new frames (`event: meta`, `event: done`, `: heartbeat`) all fail that prefix test and are silently skipped — confirmed by reading the parser before shipping. No code change to ChatPanel required; assistant token format is byte-identical to pre-phase behaviour.
