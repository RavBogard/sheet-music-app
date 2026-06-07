# Lane prompt — `mint_admin_bearer` + companion audit/revoke tools

**Workstream:** programmatic admin-bearer mint for Claude Code agents
**Origin:** Daniel feature request 2026-05-20T02:23Z (relayed via
`msg-from-auditor-bearer-mint-feature-request` in `.coord/inbox/supervisor.md`)
**Supervisor design pass:** ratified by Daniel 2026-05-20 (4 AskUserQuestion
decisions below baked in).
**Scope size:** ~1 lane, 4-5h (3 tools + hot-path `auth.ts` change + emulator tests).

---

## §0 — Setup

You are a coder for the `.coord/` parallel-agent system at `sheet-music-app/`.

Read order:
1. `.coord/CODER.md` — generic coder role spec.
2. `.coord/README.md` — full protocol (pre-flight section is BINDING).
3. `.coord/shared/master-tip.md` — current SHA baseline (`326bc9114`).
4. `.coord/AUDITOR.md` §Validation workflow lines 106-117 — Decision 2
   deployed-surface evidence rule. Your SHIP-NOTICE MUST carry executed-at-prod
   REPROs, not "code-shape PASS; verifiable" placeholders. This is a security
   feature — auditor WILL independently prod-probe it.
5. `.coord/shared/claims.md` — claim `src/lib/mcp/auth.ts` + `src/lib/mcp/tools/index.ts`
   BEFORE editing (hot-path shared files; 2h TTL).

Branch + worktree per CODER.md §0. Cut from `origin/master` (`326bc9114`).

Bearer for your deployed-surface REPROs: Daniel will hand you an admin bearer
(2 spares currently in the pool — `.supervisor-bearers`). You need a **root**
(Daniel-handed, `parentTokenId == null`) admin bearer to exercise the mint path.

---

## §1 — Goal

Let an admin agent (supervisor / auditor / coder running with a root admin
bearer) mint fresh short-lived admin bearers on demand, eliminating the
Daniel-action latency on pool refill — WITHOUT opening a runaway-credential
hole.

---

## §2 — Ratified design parameters (Daniel decisions — do not deviate)

1. **uid model: child shares the caller's uid.** A minted bearer's `mcpTokens.uid`
   = the minting root bearer's `uid` (Daniel or David). It inherits admin role
   naturally via `users/{uid}.role`. No new service identity, no IAM, no rules
   change for role.
2. **Security caps: loose (per auditor sketch).** TTL default **7d**, max **30d**,
   min **1h**. Rate-limit **10 mints/day per uid**.
3. **Ship mint + list + revoke together** — 3 tools in this one lane.

---

## §3 — Security model (the load-bearing part)

**Depth capped at 1.** Only a *root* bearer may mint. A minted child calling
`mint_admin_bearer` is refused (`non_root_bearer_cannot_mint`). This means the
token graph is exactly root → direct children — no chains, no grandchildren.

**Root-revocation cascade at verify-time.** Extend `verifyBearer` so that when a
token carries a `parentTokenId`, it does ONE extra read of the parent doc and
rejects the child if the parent is missing / revoked / TTL-expired. Net effect:
revoking a root bearer instantly kills every child it minted. O(1) overhead on
the child path; zero overhead on the root path (no `parentTokenId`).

**To enforce root-only minting, `verifyBearer` must surface the caller's token
identity.** Extend its success return from `{ uid }` to
`{ uid, tokenId, parentTokenId }` (ADDITIVE — every existing caller destructures
only `uid`, so this is backward-compatible). `mint_admin_bearer` reads
`parentTokenId` from the verify result; if non-null → refuse.

---

## §4 — Schema additions to `mcpTokens`

New fields on minted-child docs (root + test docs leave them unset/null):
- `parentTokenId: string | null` — the root token doc id; null on roots.
- `purpose: string` — required audit field on children (min 8 chars; reject
  generic single words like "test"/"probe"/"x"/"tmp").
- `mintedByUid: string` — uid that minted (== `uid` for self-mint).
- `mintedAt: Timestamp`.
- `kind: "minted_admin"` — discriminates from test (`"test"`) + root (unset).
- `ttlExpiresAt: Timestamp` — `now + ttlSec` (reuses the EXISTING verifyBearer
  TTL check; no new verify logic needed for expiry).
- `revokedAt: Timestamp | null` — reuses existing revoke check.

---

## §5 — Tool 1: `mint_admin_bearer`

**Args:** `{ purpose: string (required, ≥8 chars), ttlSec?: number (default 604800 = 7d, min 3600, max 2592000 = 30d) }`

**Flow:**
1. `verifyBearer` → `{ uid, tokenId, parentTokenId }`.
2. Role gate: load `users/{uid}.role`; if not `admin` → `forbidden_role` rich envelope.
3. Root gate: if `parentTokenId != null` → `non_root_bearer_cannot_mint`.
4. Validation: `purpose` non-empty ≥8 chars + not a generic single word; `ttlSec`
   in `[3600, 2592000]` → else `validation_error` (rich, with `issues[]`).
5. Rate-limit: count `mcpTokens` where `mintedByUid == uid` AND `mintedAt >= startOfTodayUTC`;
   if ≥ 10 → `rate_limited` rich envelope (include `hint` with reset time).
6. Generate raw token (reuse the SAME generator `test-tokens.ts` uses — find
   the `crl_live_` mint helper; do NOT roll your own) + `hashToken`.
7. Write `mcpTokens` doc: `{ tokenHash, uid, parentTokenId: <callerTokenId>,
   purpose, mintedByUid: uid, mintedAt: serverTimestamp(), kind: "minted_admin",
   ttlExpiresAt: now+ttlSec, revokedAt: null }`.
8. Structured `logger.info("[mcp-mint] admin bearer minted", { tokenId, mintedByUid, purpose, ttlExpiresAt })` — never log the raw token.
9. Return `{ ok: true, bearer: "<raw>", tokenId, ttlExpiresAt: ISO, purpose }`.
   (Raw token returned ONCE; never retrievable again — same as test-token mint.)

## §6 — Tool 2: `list_minted_bearers`

**Args:** `{ includeRevoked?: boolean (default false), includeExpired?: boolean (default false) }`
**Admin-only.** Lists `mcpTokens` where `kind == "minted_admin"` (optionally
filtered by revoked/expired). Returns `{ ok: true, bearers: [{ tokenId,
parentTokenId, purpose, mintedByUid, mintedAt, ttlExpiresAt, revokedAt,
lastUsedAt, status: "active"|"revoked"|"expired" }] }`. NEVER returns tokenHash
or any raw secret.

## §7 — Tool 3: `revoke_minted_bearer`

**Args:** `{ tokenId: string }`
**Admin-only.** Stamps `revokedAt = serverTimestamp()` on the named
`minted_admin` token. Refuse with `not_found` if the tokenId doesn't exist or
isn't `kind == "minted_admin"` (do NOT allow revoking root/test tokens through
this tool — those have their own paths). Return `{ ok: true, tokenId, revoked: true }`.
Idempotent (re-revoking an already-revoked token returns ok).

---

## §8 — Refusal envelopes (rich per `[[feedback_mcp_validation_shape]]`)

All refusals are `{ ok: false, error: { code, machine_code, message }, ...extras, hint }`
via the `richError()` factory. Surfaces as `result.isError: true` content prose,
NEVER as JSON-RPC `error.code: -32602`.
- `forbidden_role` (403) — caller not admin. Extra: `callerRole`.
- `non_root_bearer_cannot_mint` (403) — caller token has `parentTokenId`. Extra: `parentTokenId`.
- `rate_limited` (429) — ≥10 mints today. Extra: `mintsToday`, `resetAtUtc`.
- `validation_error` (400) — purpose/ttlSec invalid. Extra: `issues[]`.
- `not_found` (404) — revoke target missing / wrong kind.

---

## §9 — Files

- NEW `src/lib/mcp/tools/mint-admin-bearer.ts` — all 3 tool implementations
  (or split list/revoke into a sibling if cleaner).
- `src/lib/mcp/auth.ts` — **CLAIM FIRST.** Extend `verifyBearer` return to
  `{ uid, tokenId, parentTokenId }` + add the child root-revocation read. Keep
  the structured `[mcp-auth]` warn logging that Lane 4 added intact.
- `src/lib/mcp/tools/index.ts` — **CLAIM FIRST.** Register all 3 tools
  (admin-only). Place near `registerTestTokenTools` / write-tools cluster.
- NEW `src/lib/mcp/__tests__/mcp-mint-admin-bearer.emulator.test.ts` — see §10.
- `firestore.rules` — verify `mcpTokens` is already server-only-write (it is per
  the test-tokens path); only touch if a gap exists.

**Hard rules (CODER.md standing):** no `bridge/**`, repo-root `mcp/`,
`SetlistGrid.tsx`, `src/lib/mcp/errors.ts`, `src/lib/mcp/error-envelopes.ts`.
Use the `richError()` factory; don't edit the envelope module.

---

## §10 — Emulator test coverage (required)

1. Happy path — root admin mints, raw bearer returned, doc has correct provenance.
2. Minted child resolves to admin via `verifyBearer` (uid inheritance works).
3. Role gate — non-admin (musician/band_leader) caller → `forbidden_role`.
4. Root gate — a minted child calling `mint_admin_bearer` → `non_root_bearer_cannot_mint`.
5. Rate-limit — 11th mint in a UTC day → `rate_limited`.
6. TTL clamp — ttlSec < 3600 or > 2592000 → `validation_error`; default applied when omitted.
7. purpose validation — empty / <8 chars / generic word → `validation_error`.
8. **Root-revocation cascade** — mint a child; revoke the ROOT; assert the child
   now fails `verifyBearer` (this is the critical security property).
9. `list_minted_bearers` — returns minted tokens, never tokenHash; status field correct.
10. `revoke_minted_bearer` — stamps revokedAt; child fails verify after; idempotent;
    refuses non-minted-kind tokenId.

---

## §11 — Deployed-surface REPROs (Decision 2 — MANDATORY in SHIP-NOTICE)

Using a Daniel-handed ROOT admin bearer at your ship SHA, executed at prod with
transcripts pasted verbatim:
1. `tools/list` confirms all 3 tools registered.
2. `mint_admin_bearer({purpose:"cycle-N coder probe bearer", ttlSec:3600})` →
   `{ok:true, bearer, tokenId, ttlExpiresAt, purpose}`. Then USE the returned
   bearer on a trivial admin call (e.g. `dump_collection_size`) → confirm it
   works (uid inheritance proven at deployed surface).
3. With the MINTED (child) bearer, call `mint_admin_bearer(...)` →
   `non_root_bearer_cannot_mint` (depth-1 enforcement proven).
4. With a non-admin test bearer (mint via `create_test_account({role:"musician"})`),
   call `mint_admin_bearer(...)` → `forbidden_role`.
5. `list_minted_bearers()` → shows your minted token; confirm no tokenHash leaks.
6. `revoke_minted_bearer({tokenId:<child>})` → `{ok:true, revoked:true}`; then
   retry the child bearer on any call → 401 (revocation proven at deployed surface).
7. **Root-revocation cascade at prod:** if feasible without burning Daniel's
   only root bearer — mint child A from root, then have Daniel revoke the root
   (or use a disposable root), confirm child A dies. If this can't be done
   safely at prod without killing the working bearer, note it explicitly and
   lean on the emulator test (#8) for this property + flag for auditor.
8. Cleanup: revoke any probe-minted bearers + `cleanup_all_test_data({uidPrefix})`
   for the musician fixture (per `[[feedback_sandbox_test_isolation]]`).

Run `next build --webpack` (not just tsc) per `[[feedback_nextjs_route_exports]]`
+ `npm run test:emulator` before SHIP. Both must be clean.

Push to `origin master` (NOT `master:main`) per `[[feedback_git_push]]`.
SHIP-NOTICE to `.coord/inbox/supervisor.md` with per-tool PASS/FAIL + the §11
REPRO transcripts + emulator results + build result.
