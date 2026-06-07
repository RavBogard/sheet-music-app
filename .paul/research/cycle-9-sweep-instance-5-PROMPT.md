# Cycle-9 Sweep — Instance 5: Security / auth / multi-role / public-vs-private

**Read `cycle-9-sweep-PARENT.md` first.** Sign `from cycle-9-instance-5`.
uidPrefix: `c9i5`. Bearer: pool row `ASSIGNMENT=cycle-9-instance-5`.

## Why this axis

Before the band (real humans, multiple roles) onboards, the role/auth boundaries
must hold. The catch: several "exposures" are INTENTIONAL (PARENT §4) — your job
is to verify gates fire where they should WITHOUT false-flagging the by-design
public surfaces. Precision matters here.

## Surface

4 roles: `admin` / `band_leader` / `musician` / `member`. Auth paths: MCP bearer
(`crl_live_*`), Firebase session, `/api/auth/test-session` cookie. Gates:
`requireAuth`, role checks across MCP tools, rate limits (mint 10/day/uid;
trusted-leader bypass `[[feedback_admin_rate_limit_bypass]]`), bearer lifecycle
(mint / list / revoke / root-revocation cascade), `firestore.rules`.

## Probes

1. **Role matrix.** For a representative set of MCP tools (read + write +
   admin-only), call each as admin / band_leader / musician / member (mint test
   accounts per role, uidPrefix `c9i5`). Build a matrix: does each gate
   allow/deny correctly? Flag any tool that over-permits (a musician doing an
   admin action = HIGH) or wrongly denies a legit role.
2. **Machine_code consistency.** C8I2-006 found admin denials split between
   `forbidden` and `forbidden_role` across tools shipped in the same SHA. Map
   which tools use which; recommend the standard. Confirm validation surfaces as
   `isError:true` (Zod) vs rich `{ok:false,error}` business gates
   (`[[feedback_mcp_validation_shape]]`).
3. **Bearer lifecycle / cascade.** mint a child → use → revoke → confirm 401.
   Confirm `list_minted_bearers` audit view (C8I1-001: cascade-dead children
   wrongly show `status:'active'` — confirm/quantify). Rate-limit: is the 10/day
   cap enforced with a rich 429 (C8I1-002 was never prod-probed — probe it IF
   budget allows without starving siblings; coordinate, the cap is shared per
   uid). Confirm trusted-leader bypass works as specced.
4. **Unauth probes.** Hit protected routes/tools with no/!invalid bearer →
   clean 401s, no data leak in the error body.
5. **By-design boundaries (VERIFY, don't flag as vuln):** chart bytes public via
   `fileId`; `/perform/setlist/<id>` public. Confirm these behave as intended
   (PARENT §4). If you find a NON-chart, NON-setlist private surface leaking
   (e.g. user PII, other users' bearers, monitor config), THAT is a real HIGH.
6. **firestore.rules spot-check.** `mcpTokens` server-only (`allow read,write:
   if false`); confirm no client-reachable path exposes token hashes or other
   users' private docs.

Do NOT actually exfiltrate or damage real data; demonstrate gaps with minimal
proof. Cleanup: `cleanup_all_test_data({prefix:"c9i5"})`; revoke every minted
child. Deliverables per PARENT §6.
