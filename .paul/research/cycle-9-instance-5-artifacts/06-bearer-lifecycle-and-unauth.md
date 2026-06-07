# C9I5 — Bearer lifecycle, unauth, audit view

## §A — Bearer-lifecycle round-trip (mint → use → revoke → confirm 401)

Could not mint a fresh admin child via `mint_admin_bearer` — daily quota
exhausted (rich 429, see §C). Used a `create_test_account` bearer instead;
same observable property (token doc deletion → verifyBearer reject).

Sequence:

1. `create_test_account({role:"band_leader", uidPrefix:"c9i5",
   ttlSec:7200})` → minted bearer (tokenId `YqUFGZvLTG1WUrxLRsBF`).
2. `list_setlists` via curl with the new bearer → `200`, JSON-RPC `result`
   array of 3 setlists.
3. `cleanup_all_test_data({prefix:"c9i5"})` → `{removed:3, failures:[],
   aggregate:{mcpTokens:3, setlists:1, ...}}`.
4. Re-issue `list_setlists` via curl with the now-deleted bearer → `HTTP
   401`, body `{"error":"invalid_token","error_description":"No
   authorization provided"}`.

Done for all three test bearers (band_leader, musician, member) — all `401`
after cleanup.

Body-shape note: the 401 body for a **revoked-but-was-valid** bearer is
identical to the **no-bearer** body — message `"No authorization
provided"`. Slight copy nit (a bearer WAS provided, but rejected), no data
leak. INFO.

## §B — `list_minted_bearers` audit view (C8I1-001 follow-up)

Called via session MCP. Returned 11 rows. Shape per row:

```
{ tokenId, parentTokenId, purpose, mintedByUid, mintedAt, ttlExpiresAt,
  revokedAt, lastUsedAt, status: "active"|"revoked"|"expired" }
```

Token hashes NEVER returned. ✓ (matches firestore.rules — `mcpTokens` is
server-only.)

C8I1-001 finding was: "cascade-dead children wrongly show
`status:'active'`". The audit view DOES NOT compute parent revocation —
`status` is computed only from the child's own `revokedAt` + `ttlExpiresAt`.
If the parent root is revoked, `verifyBearer` lazily rejects children on
use (per `mint_admin_bearer` docstring) — but `list_minted_bearers` will
still show those children as `status: "active"` until they're individually
TTL-expired or revoked.

Could not reproduce end-to-end without minting a fresh root (which I
couldn't do — see §C). But the *structural* gap is observable from the
audit shape: there's no `cascadeRevoked` or `effectiveStatus` field
computed against the parent. Confirms C8I1-001 is still unfixed at
deployed SHA `db208948f`. Tagging as MED, not regression-of-shipped-fix
(was never claimed fixed in cycle-9 hardening A/B or cycle-8-fixes Lane 1).

## §C — Rich 429 from `mint_admin_bearer` (closes C8I1-002 prod-probe gap)

`mint_admin_bearer({purpose:"cycle-9-instance-5 role-matrix admin curl +
bearer lifecycle round-trip", ttlSec:3600})` →

```json
{
  "ok": false,
  "error": {
    "code": 429,
    "machine_code": "rate_limited",
    "message": "Mint rate limit reached — 10/10 bearers minted today."
  },
  "mintsToday": 10,
  "resetAtUtc": "2026-05-20T00:00:00.000Z",
  "hint": "Wait until 2026-05-20T00:00:00.000Z, or free quota by revoking unused bearers with revoke_minted_bearer."
}
```

Confirms rich envelope: `code`, `machine_code`, `message`, `mintsToday`,
`resetAtUtc`, `hint`. ✓ C8I1-002 had been "never prod-probed" — now is.

Bonus observation: the 10-mint cap is uid-scoped, not bearer-scoped — my
session bearer and every sibling instance share `mintedByUid:
"93Xn3DbS0bSNb8zmfzLyfOMX1A13"`, so the 10 daily quota is global across the
five sweep instances + concurrent coder lanes (cycle-8-fixes,
cycle-9-hardening A/B). Worth flagging to triage as an OPS observation:
the cap-per-uid means parallel-instance workloads need either (a) more
generous quota (`max:50`?), (b) a higher trusted-leader bypass (per
`[[feedback_admin_rate_limit_bypass]]`), or (c) instances mint test
bearers instead of admin children (works fine, what I did).

## §D — Unauth probes (no bearer / bad bearer / malformed Authorization)

Three calls to `POST /api/mcp` `tools/call list_setlists`:

| Variant      | HTTP | Body                                                                       |
|---           |---   |---                                                                         |
| no bearer    | 401  | `{"error":"invalid_token","error_description":"No authorization provided"}` |
| bad bearer   | 401  | (same shape; "No authorization provided") |
| malformed    | 401  | (same shape; "No authorization provided") |

OAuth-style RFC 6750 error body. No data leak. ✓

Other surfaces probed unauthenticated:

- `/api/library/file/<id>` → 401 + rich envelope including a `hint` that
  spells out both bearer formats (Firebase ID token for this route,
  `crl_live_*` for `/api/mcp`). Helpful for developer experience; the
  bearer format is also visible in the public MCP error envelope, so no
  marginal info leak.
- `/api/cron/scheduling-reminder` → 401 (cron secret gate active). ✓
- `/api/library/chord-cache?fileId=...` → 401 (member-gated). ✓
- `/api/users`, `/api/musicians`, `/api/admin/tokens`,
  `/api/monitor/state` → 404 (routes don't exist). No info disclosure
  about whether they exist or not.
- `/api/auth/test-session` → 405 (Method Not Allowed; needs POST). ✓
- `/perform/setlist/<id>` → 200 text/html (public per
  `[[feedback_setlist_public_policy]]`). ✓
