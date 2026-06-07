# C8I1 §1 — bearer-mint security probe transcripts

All probes against `https://www.centralreform.live/api/mcp` at prod SHA `edb24a47c10ef37fb216a0a5cb1f867532965e52` (matches master-tip `edb24a47c`). Wall-clock 2026-05-19T22:29Z–22:31Z. Wired bearer = root tokenId `by9YfvDgDI0WqZo1IDIc` (uid `93Xn3DbS0bSNb8zmfzLyfOMX1A13`). All raw `crl_live_*` values omitted per cycle-8 PARENT §5 — only tokenIds recorded.

---

## §1.1 — Happy mint + uid inheritance — PASS

Mint call (via MCP tool):

```
mint_admin_bearer({purpose:"c8i1 cycle-8 instance-1 working probe bearer for credential surface + template CRUD + publish gates", ttlSec:3600})
→ {ok:true, bearer:<redacted>, tokenId:"OpLJHUoSMRaLwDFsACOj", ttlExpiresAt:"2026-05-19T23:30:29.935Z", purpose:<echoed>}
```

Use the minted child on an admin-only call (via raw curl with child as Authorization):

```
POST /api/mcp  tools/call dump_collection_size({collection:"mcpTokens", maxDocs:10})
→ {result:{content:[{type:"text", text:"{...docCount:10, estimatedBytes:3277, scannedAt:"2026-05-19T22:30:47.632Z"...}"}]}, jsonrpc:"2.0", id:1}
```

**Verdict:** uid inheritance proven at deployed surface. The child resolves as admin via `users/{uid}.role` lookup on the shared uid.

---

## §1.2 — Depth-1 enforcement — PASS

Child (`OpLJHUoSMRaLwDFsACOj`) calls `mint_admin_bearer`:

```
POST /api/mcp  tools/call mint_admin_bearer({purpose:"c8i1 depth-1 enforcement check (child should refuse)", ttlSec:3600})
→ {result:{content:[{type:"text", text:"{
  \"ok\": false,
  \"error\": {
    \"code\": 403,
    \"machine_code\": \"non_root_bearer_cannot_mint\",
    \"message\": \"This bearer was itself minted (it has a parent), so it cannot mint further bearers. Minting is root-only (depth capped at 1).\"
  },
  \"parentTokenId\": \"by9YfvDgDI0WqZo1IDIc\",
  \"hint\": \"Use a root admin bearer (one Daniel/David handed you directly), not a minted child.\"
}"}]}, jsonrpc:"2.0", id:2}
```

**Verdict:** depth-1 enforcement proven at deployed surface. Rich envelope carries `parentTokenId` (the caller's root, which is itself my wired bearer — discovered incidentally that my c8i1 root tokenId is `by9YfvDgDI0WqZo1IDIc`).

---

## §1.3 — Root-revocation cascade — PROVEN at prod (corroborates auditor msg-028); audit-trail BUG corroborated

I cannot revoke my own root mid-session without killing this probe (`revoke_minted_bearer` refuses non-`minted_admin` tokens; revoking a root requires Daniel via /settings/mcp). The cascade was independently proven at prod by auditor msg-028 (2026-05-20T04:30Z): they minted Child-B from Root B, Daniel revoked Root B, Child-B then 401'd while Root A (control, untouched) still 200'd.

**Indirect re-verification at this probe's wall-clock:** `list_minted_bearers({includeRevoked:true, includeExpired:true})` still shows the auditor's Root-B child `RZT630CCsIsLLqVn0Zzp` (parent `eokB9VPTxtse6BX8RiNK` = Root B) with `revokedAt:null` and **`status:"active"`**, even though Root B is revoked. Per the lazy parent-check in `verifyBearer`, this child WILL 401 at auth-time, but the audit view is misleading — `status` derives only from the child's own `revokedAt`/TTL, not the parent. **This corroborates the bug auditor msg-028 already filed as non-blocking follow-up #1.** Re-tagged in findings as **C8I1-001**.

---

## §1.4 — Role gate (musician + band_leader both refuse) — PASS

Provisioned `test-c8i1-musician-0c83e8f9` and `test-c8i1-band_leader-9a2fde23` (both `uidPrefix:c8i1`, ttl 1h). Each calls `mint_admin_bearer` via raw curl:

Musician → mint:
```
{ok:false, error:{code:403, machine_code:"forbidden_role", message:"mint_admin_bearer requires admin role."}, callerRole:"musician", requiredRoles:["admin"], hint:"Only an admin can mint admin bearers. Ask Daniel/David, or use a root admin bearer."}
```

Band_leader → mint:
```
{ok:false, error:{code:403, machine_code:"forbidden_role", message:"mint_admin_bearer requires admin role."}, callerRole:"band_leader", requiredRoles:["admin"], hint:...}
```

**Verdict:** mint is admin-only, NOT widened to trusted-leader. Band_leader refusal carries `callerRole:"band_leader"` in the rich envelope; no privilege-propagation hole.

---

## §1.5 — Rate-limit boundary — NOT actively probed at prod (budget conservation)

Current state at 22:31Z: `list_minted_bearers({includeRevoked:true, includeExpired:true})` shows 6 mints today on uid `93Xn3DbS…` (mine + 2 c8i2 + auditor 2 + coder-2 ship 1). Cap is 10/day per uid. 4 mints remaining.

Per prompt §1.5 guidance ("Don't burn the whole budget if it starves later sub-tests") and auditor msg-028 OPEN-FOLLOWUP #2 ("10/day cap itself verified by emulator test #5; not re-run at prod to avoid burning quota"), I do NOT actively probe the cap. The handler logic (rate-limit step 5 in §5 of `bearer-mint-lane-PROMPT.md`) is verified by emulator `mcp-mint-admin-bearer.emulator.test.ts` case #5 (per coder-2 ship msg + auditor's static review #1).

Open prod verify (non-blocking): re-tagged as **C8I1-002** (INFO).

---

## §1.6 — TTL clamp + purpose validation — PASS at handler layer

Handler-layer probes via MCP tool (Zod schema accepts these; the handler rejects them):

Generic placeholder word:
```
mint_admin_bearer({purpose:"placeholder", ttlSec:3600})
→ {ok:false, error:{code:400, machine_code:"validation_error", message:"Invalid arguments — purpose: purpose must be descriptive, not a generic placeholder like 'test'/'probe'/'tmp'"}, issues:[{path:"purpose", message:"..."}], hint:"Re-call mint_admin_bearer with corrected arguments (see issues[])."}
```

Whitespace-only ≥8 chars:
```
mint_admin_bearer({purpose:"        ", ttlSec:3600})
→ {ok:false, error:{code:400, machine_code:"validation_error", message:"Invalid arguments — purpose: purpose must be at least 8 characters describing why the bearer is needed"}, issues:[{path:"purpose", message:"..."}], hint:"..."}
```

The handler does a `.trim()` before length check (8 spaces → 0 chars → "must be at least 8 characters"). Rich envelope; `issues[]` populated.

Zod-layer probes (`purpose` <8ch literal, `ttlSec` <3600 or >2592000) were exercised by auditor msg-028 row 4 at the same SHA; not re-probed (Zod schema is identical between MCP framework and handler, and the schema shipped to the client is the server's schema). Default TTL (omitted ttlSec → 604800) verified by emulator test #6 + auditor static-review #1.

---

## §1.7 — Audit trail (no secret leak) — PASS

`list_minted_bearers({includeRevoked:true, includeExpired:true})` at 22:31Z returns 6 rows. Row schema observed:

```
{tokenId, parentTokenId, purpose, mintedByUid, mintedAt, ttlExpiresAt, revokedAt, lastUsedAt, status}
```

- **No `tokenHash` field.** No raw `crl_live_*` value. (Matches §6 of spec + auditor msg-028 row 6.)
- `purpose` is the echoed audit string.
- `status` is `"active"` for live rows, `"revoked"` for soft-deleted (e.g. `lgeo03hrVc1eeT6qDkKq` shows `revokedAt:"2026-05-19T22:02:01.260Z"` + `status:"revoked"`).
- `lastUsedAt` populated on my child (`OpLJHUoSMRaLwDFsACOj`, `2026-05-19T22:30:49.034Z`) after the §1.1b curl call — proves verifyBearer is stamping it.

The C8I1-001 bug (cascade-dead child shows `status:"active"`) is the one known misleading row.

---

## §1.8 — Refusal envelope shape — PASS

Every refusal observed in §1.2 / §1.4 / §1.6 is shaped as:

```
{
  ok: false,
  error: { code, machine_code, message },
  ...domain-specific extras (parentTokenId, callerRole, issues[]),
  hint
}
```

Returned in `result.content[0].text` (stringified JSON). `result.isError` is **falsy** for business-logic gates (handler returns the rich envelope as content prose, per `[[feedback_mcp_validation_shape]]`); `isError:true` is reserved for Zod-schema validation failures. Auditor msg-028 documents this two-layer split as the intended invariant; this probe corroborates.

No JSON-RPC `error.code:-32602` envelopes observed.

---

## §1 verdict

| Sub-axis | Verdict | Evidence |
|---|---|---|
| §1.1 happy mint + uid inheritance | PASS | curl child → dump_collection_size → 200 |
| §1.2 depth-1 enforcement | PASS | child → mint → `non_root_bearer_cannot_mint` 403 |
| §1.3 root-revocation cascade | PASS (auditor msg-028 prod proof); **C8I1-001 audit-view bug corroborated** | list shows cascade-dead child as `status:"active"` |
| §1.4 role gate (musician + band_leader) | PASS | both → `forbidden_role` 403; mint NOT widened |
| §1.5 rate-limit | DEFERRED (budget); covered by emulator #5 + auditor msg-028; **C8I1-002** open prod verify | not re-probed |
| §1.6 TTL clamp + purpose validation | PASS | `placeholder` + 8-space → rich `validation_error` 400 |
| §1.7 audit trail no-leak | PASS; **C8I1-001 misleading status field** | no tokenHash; status correctly tracks own revoke; misleads on parent cascade |
| §1.8 envelope shape | PASS | rich `{ok:false}` content prose, isError falsy |

No HIGH findings on bearer-mint. One MED audit-view bug (C8I1-001) corroborating auditor msg-028 follow-up #1. One INFO open prod verify (C8I1-002).
