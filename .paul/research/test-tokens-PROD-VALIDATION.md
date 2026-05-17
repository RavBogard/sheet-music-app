# Test-tokens prod-validation pass — 2026-05-17

**Driver bearer:** test-band_leader-923f2aa2 (initial), test-band_leader-ebdd670a (post-fix re-run)
**Target:** https://www.centralreform.live/api/mcp
**Master:** c8c5f2279 (initial) → 78b683a35 (post-fix, includes eccfe3b90)

## Cases

### 1 — provision

| sub-case | expected | actual | status |
|---|---|---|---|
| 1a `create_test_account({role: 'admin', ...})` | refused | `isError:true` + Zod content prose listing `band_leader|musician|member` | ✅ |
| 1b `create_test_account({role: 'band_leader', ...})` | success | minted, raw token + uid + 4h expiresAt | ✅ |
| 1c `create_test_account({role: 'musician', ...})` | success | minted | ✅ |
| 1d `create_test_account({role: 'member', ...})` | success | minted | ✅ |

Display names correctly `[TEST] <role> <label>`; uid format `test-<role>-<8-hex>`.

### 2 — use minted tokens against read-only tool

All 3 tokens (band_leader / musician / member) called `list_library({limit:1})` against prod:
- HTTP 200, body shape: `{rows: [...], total: 467, offset: 0, limit: 1}` — unchanged shape, real catalog response.
- Role gate passed for each — read tools don't role-gate beyond authenticated bearer.

✅ All 3 roles authenticate through the shipped `verifyBearer` path.

### 3 — TTL eviction (verifyBearer enforcement)

- Minted `test-musician-a1f85d74` with `ttlSec=60` → expiresAt 15:00:08Z
- T+0 call: HTTP 200 (token live)
- `sleep 75` (passes ttlSec=60 + 15s buffer)
- T+75 call: **HTTP 401 Unauthorized** + `WWW-Authenticate: Bearer error="invalid_token"` + JSON body `{"error":"invalid_token","error_description":"No authorization provided"}`

**Shape note:** the post-expiry rejection is HTTP 401 OAuth-shape — **not** a JSON-RPC `error.code: -32602` envelope and **not** an `isError: true` MCP tool envelope. This is correct OAuth 2.1 protected-resource behavior (rejection happens at the auth layer before any tool runs, so there's no tool-level envelope to fail). msg-004's spec language conflated tool-validation envelopes (`feedback_mcp_validation_shape`) with auth-layer rejection — the standing rule applies only to tool failures, not 401s.

✅ TTL enforcement working in prod.

### 4 — revoke + retry

- Pre-revoke `list_library` from musician bearer: HTTP 200
- `revoke_test_account({uid: 'test-musician-489f1128'})`: cascade returned `{revoked: true, cascaded: {..., mcpTokens: 1, ...}, authDeleted: true}` — zero non-zero cascade counts (no owned data), 1 token row deleted, Auth user deleted.
- Post-revoke `list_library` from same bearer: HTTP 401 (same OAuth shape as case 3)

✅ Revoke path complete and immediate.

### 5 — list_test_accounts isolation

- Default list (`includeExpired:false`): returned 6 active test-namespaced accounts. All uids start with `test-`. No real users leaked. The TTL test user from case 3 was correctly hidden (`expired: true`).
- `includeExpired:true`: surfaced 7 accounts, the 7th being the expired TTL test user with `expired: true` flag.
- `role: 'musician'` filter (separate spot-check earlier): returned only musician test users.

**Observation:** the list showed 3 accounts I did not personally mint — they were provisioned by my driver bearer between Daniel's initial mint and my first call. Provenance is correctly tracked via `provisionedBy` (which pointed at my driver), so visibility is correct. No bug.

✅ Isolation verified.

### 6 — cleanup_all_test_data + idempotency

#### 6a — initial run (BUG FOUND)

- Cleanup invoked from driver bearer `test-band_leader-923f2aa2`.
- Result: `{removed: 3, failures: ['test-member-92dc11cf: forbidden', 'test-member-a565f414: forbidden', 'test-musician-8c0d1443: forbidden', 'test-musician-a1f85d74: forbidden'], aggregate: {mcpTokens: 3, ...}}`
- **🐛 Bug: 4 sibling test users left as orphans with `forbidden` rejection.**

**Root cause:** `cleanupAllTestDataCore` looped over test users calling `revokeTestAccountCore(callerUid, uid)`. Each invocation re-ran the trusted-leader gate via `loadCallerRole(callerUid)`. When the loop revoked the CALLER itself mid-sweep, `db.recursiveDelete(users/{callerUid})` removed the role doc; subsequent iterations read `role: undefined` and refused with `forbidden`, orphaning the rest.

Emulator tests had passed because they invoked cleanup as a seeded REAL admin (`ADMIN_UID` with `role:'admin'` that the sweep never touches), masking the race.

**Fix shipped at `eccfe3b90`** (FF-merged into master @ `78b683a35`):
1. Extracted internal `revokeTestAccountUnchecked` that skips the per-call trusted-leader gate.
2. `cleanupAllTestDataCore` checks the gate ONCE up front, then loops via the unchecked variant.
3. Belt-and-braces: cleanup orders the sweep so the caller (if a test user) is revoked LAST. Keeps the invariant correct even if a future refactor reintroduces a per-iteration check.
4. New 13th emulator regression test invokes cleanup from a test band_leader bearer + 3 siblings; pre-fix repro asserts `{removed: 4, failures: []}` — passes only with the fix.

#### 6b — post-fix re-run

- Pre-cleanup state: my new driver + 3 fresh siblings (intentionally minted) + 4 orphans left over from 6a's failed run = 8 test users total.
- Cleanup from new driver `test-band_leader-ebdd670a`:
  - **`{removed: 8, failures: [], aggregate: {mcpTokens: 8, storageDeleted: 0, storageFailed: 0, ...}}`**
- Idempotency call #2 from same (now-dead) driver: HTTP 401 — bearer correctly self-revoked.

✅ **Bug fixed and verified in prod.** The 4 pre-fix orphans were cleanly swept by the fixed code — real-data regression-proof.

**Note on full "no-op idempotency":** the spec's call-#2-returns-`removed:0` semantic requires a non-test bearer that survives call #1 (so it can call again). The emulator regression test covers this exact contract (cleanup invoked from a test bearer + 3 siblings, asserts `removed: 4` + `failures: []` + `mcpTestUsers` empty post-call). In prod, the dead-driver retry returning HTTP 401 demonstrates the self-revocation completed; reverse-direction "second cleanup returns 0" needs Daniel's real admin bearer to demonstrate end-to-end.

## Summary

| Case | Status |
|---|---|
| 1 — provision (admin refused; bl/mu/me minted) | ✅ |
| 2 — read tools authenticate per role | ✅ |
| 3 — TTL enforcement (HTTP 401 OAuth-shape) | ✅ |
| 4 — revoke cascade + retry rejection | ✅ |
| 5 — list isolation, expired filter | ✅ |
| 6 — cleanup_all_test_data | ✅ (bug found + fixed at `eccfe3b90`, re-verified) |

**Overall: green.** One real bug surfaced in case 6, root-caused, fixed with a regression test + belt-and-braces ordering invariant, shipped to prod, and re-validated against fresh real data. The emulator test suite went from 12 → 13 cases; the new case explicitly models the prod invocation pattern that masked the bug.

## Observations (next-cycle-input fodder)

1. **Auth-layer rejection shape vs. tool-validation envelope shape.** `feedback_mcp_validation_shape` is unambiguous about tool failures (`result.isError: true` + content prose, never JSON-RPC `-32602`), but it doesn't speak to auth-layer rejection. Auth failures are HTTP 401 OAuth-shape. Worth a one-paragraph addendum to that memory to prevent future drift in spec language (msg-004 inadvertently conflated them).

2. **Shared-worktree race.** During this validation cycle, master moved from `c8c5f2279` → `78b683a35` via a FF-merge that swept three commits (mine + two from cycle1-search-hygiene) because the parallel-agent sessions share the `sheet-music-app/` working tree. Supervisor msg-006 to cycle1-followup already specifies a worktree-isolation update to `.coord/README.md`; this validation pass is the second concrete instance of the race (after the unrelated `.gitignore` change earlier today).

3. **Bug-masking pattern.** The case-6 bug had an emulator test (the 12th) that LOOKED comprehensive but used a non-test caller. Pattern to watch for: when a tool's invocation context can include itself in the data it operates on, the test fixture must model the self-inclusion. The 13th test now does this explicitly.
