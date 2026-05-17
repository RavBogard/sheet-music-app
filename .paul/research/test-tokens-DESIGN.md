# MCP Test-Identity Provisioning — DESIGN

**Author:** test-tokens session (parallel agent)
**Date:** 2026-05-17
**Status:** ✅ approved 2026-05-17 (Daniel: "go with your recommendation re best practice and best usability and stability in the future")

## DECISIONS LOCKED (post sign-off)

1. **TTL enforcement in `verifyBearer`:** ENABLED in this PR (small additive change
   to `src/lib/mcp/auth.ts`). Unenforced TTL is a footgun — future cowork runs
   assume expired tokens are dead. Real tokens have no `ttlExpiresAt` field, so
   the check is a no-op for them. (Coordinated: cycle1-followup confirms they
   don't touch `auth.ts` in their queue.)
2. **TTL default 4h, cap 24h.** Matches marathon cowork run profile.
3. **Collection name: `mcpTestUsers`** — camelCase consistent with `mcpTokens` /
   `mcpOAuthClients` / `mcpOAuthCodes`. One doc per user, not per token.
4. **HTTP endpoint admin-only** — principle of least privilege at the HTTP edge.
   MCP tool-path stays trusted-leader (admin OR band_leader).
5. **Cascade list (final, schema-verified):**
   1. `mcpTokens` where `testUid == uid` (hard delete)
   2. `mcpTestUsers/{uid}`
   3. `setlists` where `ownerId == uid` → cascade `tracks` where `setlistId == ...`
   4. `library_index` where `uploadedBy == uid` (best-effort Storage delete)
   5. `songs` where `uploader == uid`
   6. `proposal_stages` where `createdBy == uid`
   7. `bond_flags` where `flaggedBy == uid`
   8. `bond_corrections` where `correctedBy == uid`
   9. `scheduling_assignments` where `musicianUid == uid`
   10. `musician_availability` where `musicianUid == uid`
   11. `users/{uid}` via `firestore.recursiveDelete` (sweeps subcollections —
       `notifications`, `songPreferences`, `annotations`, `preferences`)
   12. `getAuth().deleteUser(uid)`

   Skipped (no MCP write surface for test users): `recordings`, `live_sessions`,
   `monitor-live/commands`, `setlists/{id}/history`, `setlists/{id}/emailEvents`,
   `songUsage`.

---


**Branch (planned):** `feat/mcp-test-tokens`

## 0. The gap this closes

Cycle-1 cowork marathon (`sheet-music-app-mcp/outputs/autonomous-run/cycle-1/cowork-report.md`)
sampled non-admin role boundaries auth-side only — no `musician`, `member`, or non-admin
`band_leader` accounts existed to actually exercise tools as. Every future cowork run has
the same blind spot until Claude can mint test identities autonomously, without Daniel
hand-provisioning fixtures in the Firebase console.

## 1. Decisions

### 1.1 Real Firebase Auth users — yes

Test users are created via `getAuth().createUser({uid, displayName, disabled: true})`
with `setCustomUserClaims(uid, {role, soundEngineer})`.

**Why real:** custom claims propagate through every existing role gate —
`firestore.rules` reads `request.auth.token.role`, `api-auth.ts` reads `decoded.role`,
`loadUploader` reads `users/{uid}.role`. A JWT-minted Firestore-only fake would diverge
from how production roles actually flow, which is exactly what the stress test must NOT
do (we're sampling real role boundaries, not faked ones).

**`disabled: true`** is set so the test user cannot sign in via the browser UI
(no password, no provider). The MCP path uses `verifyBearer` reading `mcpTokens` —
which does NOT call `verifyIdToken` — so `disabled: true` does not block MCP calls.
It's a defense-in-depth marker that flips to "denied" on every UI surface.

### 1.2 Separate `mcp_test_tokens` collection — yes (as an index)

Tokens themselves remain in `mcpTokens` (so `verifyBearer` is **unchanged**),
carrying a `kind: 'test'` flag plus `provisionedBy`, `ttlExpiresAt`, `testUid`.
A parallel `mcp_test_tokens/{uid}` doc is the **admin-discovery index**: one row per
test user with metadata only (no token hash) for `list_test_accounts` /
`cleanup_all_test_data` to walk.

**Why dual-write rather than only `mcpTokens` with a flag:** clean separation —
real-user token listing (`/api/mcp/tokens`) never sees test rows, list_test_accounts
never scans real rows. Equally important: keeps the change footprint small. We do
**not** touch `src/lib/mcp/auth.ts` (out of scope, owned by cycle1-followup's lane).

### 1.3 Namespace

| Surface | Pattern |
|---|---|
| Firebase Auth `uid` | `test-<role>-<8-hex>` — e.g. `test-musician-a1b2c3d4` |
| Firebase Auth `displayName` | `[TEST] <role> <label?>` |
| `users/{uid}.displayName` | same as Auth displayName |
| `users/{uid}.email` | `test-<role>-<8-hex>@test.centralreform.live` (synthetic) |
| `mcpTokens/{docId}` | normal doc + `kind: 'test'`, `provisionedBy`, `ttlExpiresAt`, `testUid` |
| `mcp_test_tokens/{uid}` | index row — role, soundEngineer, provisionedBy, createdAt, ttlExpiresAt, mcpTokenId, revoked |

The `test-` uid prefix is the load-bearing namespace — every cascade-delete + cleanup
sweep keys off `uid.startsWith('test-')` PLUS the `mcp_test_tokens` index for belt-and-
braces.

### 1.4 TTL is advisory in this PR

`ttlSec` (default 4h, max 24h) stamps `ttlExpiresAt` on both docs. We do NOT extend
`verifyBearer` to enforce it (that's `src/lib/mcp/auth.ts` — out of scope here).
Operators read `ttlExpiresAt` via `list_test_accounts` and revoke manually, or call
`cleanup_all_test_data` to sweep. **Followup:** add `ttlExpiresAt < now()` check to
`verifyBearer` — captured in TODO block at bottom of `test-tokens.ts`.

### 1.5 Cascade-delete scope (per Daniel's brief)

`revoke_test_account({uid})` removes, in order, best-effort:

1. `mcpTokens` doc(s) where `testUid == uid` — hard delete (not soft-revoke).
2. `mcp_test_tokens/{uid}` — hard delete.
3. `setlists` where `ownerId == uid` — delete + cascade `tracks` where `setlistId == ...`.
4. `library_index` where `uploader == uid` (best-effort Storage delete).
5. `songs` where `uploader == uid`.
6. `proposal_stages` where `authorUid == uid`.
7. `bond_flags` where `flaggedBy == uid`.
8. `users/{uid}` — Firestore doc.
9. `getAuth().deleteUser(uid)` — Firebase Auth user.

Bonds where the test user PARTICIPATED (e.g. flaggedBy=admin, fromSongId=their-song)
are NOT touched per Daniel's brief.

### 1.6 Hard safety constraints (handler-enforced, not just doc text)

| Constraint | Where | Failure shape |
|---|---|---|
| Caller must be admin OR band_leader | `assertTrustedLeader(uid)` inside every tool | `{error, message, context: {role}, hint}` |
| `role === 'admin'` refused for new test user | inside `create_test_account` | `{error: 'admin_test_user_refused', ...}` |
| `ttlSec > 86400` refused | Zod `max(86400)` AND runtime check | Zod envelope OR `{error: 'ttl_too_long', ...}` |
| Per-user rate limit stays on minted token | nothing to do — `checkUserRateLimit(uid, ..., {bypass: isTrustedLeader})` already keys on uid; musician/member test users have `isTrustedLeader=false` ⇒ standard tier applies | n/a |
| Sentry breadcrumb `mcp:test-token` | every mint/list/revoke/cleanup | n/a |

## 2. Surface

### 2.1 MCP tools — `src/lib/mcp/tools/test-tokens.ts`

```
create_test_account({role, soundEngineer?, label?, ttlSec?}) → {uid, token, expiresAt}
list_test_accounts({role?, includeExpired?})                → {accounts: [{uid, role, soundEngineer, label, createdAt, ttlExpiresAt, revoked, provisionedBy}]}
revoke_test_account({uid})                                  → {revoked: true, cascaded: {setlists, tracks, charts, songs, stages, flags}}
cleanup_all_test_data()                                     → {removed: N, cascaded: {...aggregate counts...}}
```

All four return MCP `isError: true` with content prose on failure (per
`feedback_mcp_validation_shape`); success returns `jsonResult({...})`.

### 2.2 HTTP endpoint — `src/app/api/mcp/oauth/mint-test-token/route.ts`

Pattern mirrors `src/app/api/mcp/oauth/token/route.ts`. Wrapped in `createApiHandler`
with `role: 'admin'` (Firebase ID-token auth, not MCP bearer). Body is the Zod schema
shared with `create_test_account`. Returns the same shape. Lets Daniel `curl` from a
shell without first minting an MCP token.

Both paths funnel through a shared `provisionTestAccount(params, callerUid)` core
function inside `test-tokens.ts`.

### 2.3 Tool registration

End of `src/lib/mcp/tools/index.ts` (claim file first):

```ts
import { registerTestTokenTools } from "./test-tokens"
// ...existing register*Tools calls...
registerTestTokenTools(server)
```

### 2.4 Firestore rules

End of `firestore.rules` (claim file first), before the deny-all fallback:

```
// MCP TEST TOKENS — server-only (Admin SDK)
// Admin discovery index for test-identity provisioning. One doc per test user
// (id == testUid). Created/listed/deleted exclusively via the MCP
// create_test_account / list_test_accounts / revoke_test_account /
// cleanup_all_test_data tools (Admin SDK). No client access.
match /mcp_test_tokens/{testUid} {
  allow read, write: if false;
}
```

## 3. Tests (Phase C)

Emulator tests in `src/lib/mcp/__tests__/mcp-test-tokens.emulator.test.ts`:

- admin can mint / list / revoke / cleanup ✓
- band_leader can (trusted-leader gate) ✓
- musician REFUSED with `{error, ...}` envelope ✓
- minted musician-role test token IS rate-limited at standard tier (mock
  `checkUserRateLimit` and assert it's called WITHOUT `bypass:true` for the test
  uid's musician role)
- `create_test_account({role: 'admin'})` refused
- `create_test_account({ttlSec: 86401})` refused (Zod)
- `revoke_test_account` cascades to owned setlists, tracks, library_index rows
- `cleanup_all_test_data` removes every `test-*` user including their Auth records

## 4. Open questions for Daniel

1. **TTL enforcement followup OK to defer?** Per §1.4 — `verifyBearer` enforcement
   lives in a followup that touches `src/lib/mcp/auth.ts` (cycle1-followup's lane).
   Default: yes, defer. Document in TODO.
2. **TTL default — 4h, 24h cap?** Marathon cowork runs are typically 2–4 hours;
   24h cap matches the brief. Adjust if you want shorter.
3. **`mcp_test_tokens` collection name OK?** Or prefer `mcpTestUsers` to match the
   resource granularity (one doc = one user, not one token)?
4. **HTTP endpoint admin-only OK?** Brief says "Admin auth required" for the endpoint
   while MCP tools allow band_leader. If you want band_leader on the endpoint too,
   change to `role: 'band_leader'`.
5. **Cascade list complete?** §1.5 includes setlists/tracks/library_index/songs/
   proposal_stages/bond_flags. Anything I'm missing — recordings? scheduling_assignments?
   monitor commands?

## 5. Out-of-scope (deferred to followup PR)

- `publish_setlist` audience filtering: exclude `test-*` uids from default recipient
  derivation so test musicians don't get spammed by real publishes.
- `list_setlists` / search surfaces: default-hide setlists owned by `test-*` uids
  unless a `includeTestData` flag is passed.
- Sentry alerting / Slack notification when a test token is used for a write to a
  REAL (non-test-owned) setlist — guardrail against accidental cross-contamination.

These will be a single integration PR after cycle1-followup settles, per the brief.
TODO block at the bottom of `test-tokens.ts` will list these.

## 6. Workflow note

I'm pausing here. When Daniel acknowledges (or amends) this design, I'll:

1. Cut `feat/mcp-test-tokens` off master.
2. Claim `src/lib/mcp/tools/index.ts` + `firestore.rules` in `.coord/shared/claims.md`.
3. Build the tool module, endpoint, rules, tests.
4. `vitest emulator` + `npx next build --webpack` both green.
5. Rebase on master, push, open PR, update master-tip.
