# RETURN — Multi-tenant phase 4 (platform console and platform MCP), 2026-10-12

Executor: Claude Code (Opus 5.5), with three Opus lanes: the platform library plus `/api/platform/mcp`; the `/platform` console; per-tenant connector instructions plus OAuth refusal. Branch `claude/multitenant-2026-10-12`, merged to `master`.

Shipped: `a893bc30` (Vercel `dpl_CUikJJSorNB6d2vMmx5EGTc9A7bE`). Firestore rules and the `platformAudit` index were deployed, and the collection records were seeded.

## Gate

**PASS** in production. A throwaway tenant, `mtprobe2`, was created and removed again; only `crc` and `brotherslazaroff` remain.

### Every platform tool on the throwaway tenant, dry run first, audit row after

Called over `/api/platform/mcp` with a platform token minted for Daniel (since revoked). Every write ran as a dry run first (`changed:true`, nothing written), then applied, each apply leaving a `platformAudit` row. That covers:
- `create_tenant`, `update_tenant`, `set_tenant_features`
- `set_tenant_member_role` (by email), then `remove_tenant_member`
- `invite_tenant_admin`
- `set_collection_sharing`, `assign_collection`

The reads all returned correctly: `get_tenant`, `list_tenants`, `list_tenant_members`, `list_collections`, `list_platform_activity` (10 rows for the tenant).

`mint_tenant_view_bearer` returned a `crl_view_` key. At the tenant's address, `list_setlists` worked and `create_setlist` was refused with `read_only_token`.

The three domain tools ran and correctly refused a domain that isn't attached. Attaching a real custom domain wasn't attempted: it needs a real domain and the production Vercel token (see Needs Daniel).

The address itself was attached from this machine with the phase 3 script, because production has no `VERCEL_API_TOKEN`. `create_tenant` said so in its next steps.

### Every console action

The console's HTTP routes were driven with a signed-in platform owner. A throwaway account was added to `platform/owners` for the run, and the list was restored exactly afterwards. Each call ran as a dry run, then applied with an audit row:
- list, detail
- identity PATCH, features, status (dry run only)
- members, invites, collections sharing
- activity, view bearer

**The live run found two real bugs**, which the console's mocked unit tests had hidden:
- The identity form's `{patch}` body was read as an empty patch.
- The feature switches' `{features}` body got a 400.

Both are fixed in `c108ee38`, and the calls re-run clean.

No console page was clicked in a browser; no browser automation was available in this session. The screens are covered by component tests.

### The other gate items

- **`/api/platform/mcp` refuses a non-owner token, and a tenant token cannot call platform tools.**
  - A CRC tenant token gets 403: "This is a tenant connector token. /api/platform/mcp accepts only a platform token…".
  - A platform token on `/api/mcp` gets 401.
  - The owner check re-reads `platform/owners` on every request, and the mint script refuses non-owners.
- **A CRC-only user connecting through another tenant's address is refused rather than handed a CRC token.** A throwaway CRC musician calling `POST /api/mcp/tokens`:
  - at www.brotherslazaroff.live: **403** "This account isn't a member of Brothers Lazaroff. Ask its admin for access."
  - at the probe tenant's address: **403** with the same message, naming that tenant.
  - at www.centralreform.live: 200, a token stamped `crc`, then revoked.
  - OAuth authorize and token give the same refusal (lane 3 tests).
- **CRC's served MCP instructions match the golden capture.** The HTTP golden diff is identical for every CRC surface, `mcp_instructions` included.
- **BL's connector now describes BL.** It reads: "# Agent Guide — Brothers Lazaroff. This connection serves Brothers Lazaroff, a band… People who build sets here: Bryn Sentnor and David Lazaroff. A setlist is called a 'set' here. Each one is for a show." It contains none of CRC's congregation wording (Central Reform, Shabbat, Rabbi, CRC: 0 matches). That is the only golden difference.
- **The BL probe still passes 19/19.**

## Checklist

| Item | Result |
|---|---|
| `/platform`, platform owner only, checked on the server | PASS. Anyone else gets 404, and the nav link shows only for the platform owner. Screens: tenant list; tenant page (Identity generated from the config schema, Features, Status, Addresses, People, Collections, View as); New tenant (with optional copy of liturgy frames and books); Activity; and a "Claude platform connector" key card. |
| `platformAudit` (who, action, tenant, before, after, when, console or Claude); `auditLogs` gains `orgId` | PASS. `platformAudit` is server-only in the rules, with an index on `(orgId, at)`. `auditLogs` rows carry `orgId` since phase 2. |
| `/api/platform/mcp`, platform-owner tokens only, 17 tools, required tenant argument, dry-run writes with before/after/diff | PASS. A new token kind, `platform` (`crl_plat_…`). The tool list is exactly the 17. |
| Per-tenant generated agent guide; dispatch by token tenant; tools for features that are off drop out; existing connectors keep working | PASS. Handlers are cached per tenant and config (LRU, 50). **CRC is served verbatim** through a new config field `agentGuideMode`, because `.paul/AGENT-GUIDE.md` is CRC-specific in every section and has no clean seam. Other tenants get generated facts, then their own `agentGuide`, then a tenant-neutral core. The feature filter applies to tenants without a compiled config (that is, new ones). CRC's and BL's tool lists are unchanged at 97 tools; phase 6 finishes the flags. |
| OAuth refuses instead of falling back | PASS. authorize records the address's tenant; the token is minted only for that tenant; the `resolveMintOrg` fallback is removed there and in `/api/mcp/tokens`. The platform owner is exempt and gets the address's tenant. |

## Test tails (at `f8178ff3`, then the follow-ups)

- `npx vitest run`: 495 files passed. Two failed: the `ReconciliationProvider` load flake (passes 19/19 alone) and a console link assertion, which I updated. Tests: 5878 passed.
- `npm run test:emulator`: Test Files **111 passed**; Tests **2078 passed**.
- `npx tsc --noEmit`: 0. Clean `next build --webpack`: 0. `login-bundle`: 1 passed.
- After the follow-ups (`c108ee38`, `a893bc30`): platform route, console and lib suites 106/106 and 29/29; build 0.

## Commits

| Commit | What it is |
|---|---|
| `918f8e7d` | Platform library signatures |
| `69f3c104`, `796b6f8b`, `f28367a8`, `c9cbdc3f`, `1c40f316` | Lane 1: library, token kinds and the view-as read-only rule, platform MCP, console routes and invite page, rules, `platformAudit` index, collections seed and mint script |
| `94aa34fa`, `17f73a8c` | Lane 2: `/platform` console and its tests |
| `8c2cedaa`, `10bbd72a`, `d70c5bd4`, `608dd89a` | Lane 3: CRC instructions golden, per-tenant dispatch and instructions, OAuth/tokens refusal, `MCP_FEATURE_FILTER` declared |
| `f8178ff3` | Lead: read-only View as on the web, platform owner never files a join request, console calls aligned with routes |
| `c108ee38` | Lead: routes accept the console's `{patch}` and `{features}` bodies (found live) |
| `a893bc30` | Lead: console "Claude platform connector" key card |

## Decisions

1. **View as this tenant on the web**, per the ruling that it is read-only and as Daniel:
   - The console opens the tenant's address with `?viewAs=1`. The proxy sets a host-only cookie, and `?viewAs=0` clears it.
   - While the cookie is set, the platform owner's API writes on that address are refused (`read_only_view`), and the browser treats him as a member, with an amber banner offering "Stop viewing".
   - Firestore rules can't see a cookie, so a direct browser write is prevented by the UI (members get no edit controls), not by the rules. For Claude, the view key is read-only on the server.
2. **The platform owner never files a join request** when he opens a tenant's address. Without this he would show up as a pending request in every tenant he visits.
3. **There is no OAuth flow for the platform connector.** It uses a bearer header: mint a key in the console's "Claude platform connector" card, then add `https://www.centralreform.live/api/platform/mcp` with `Authorization: Bearer <key>`. Adding OAuth would have meant changing the authoring OAuth routes; it can come later if Claude Desktop needs it.
4. **New tenants inherit CRC's built-in service types** in their generated guide, because an empty list means all built-ins (phase 1 decision). Nava's own catalogue is set in phase 8, as the rulings say.
5. **Collection records are seeded but inert:** CRC core (443 charts), supplemental (272), nava (142), uploads (184); BL core (0) and uploads (82); all private. Phase 5 computes visibility from them. Nava has **142** rows, not the ruling's 140; phase 5 will reconcile which rows the ownership move covers.

## Carried forward

- **Open Graph alt text and `/manifest.json` carry CRC's name on new tenants** (from phase 3, and noted by lane 1). Fix before Nava goes live in phase 8.
- **Per-tenant feature gating** of handlers, UI, API and crons is phase 6. Phase 4 only drops tools from a new tenant's list.
- **Phase 2 step 5** (remove the legacy-claim fallback) is still pending.
- **The runtime address path** (Vercel token, plus the runtime service account's Identity Toolkit permission) is untested until the token below exists.

## Needs Daniel

Still the one credential from phase 3: create a Vercel API token in the dashboard and add it to the project as `VERCEL_API_TOKEN` (Production, Sensitive). Until then, the console's Addresses section and the platform domain tools report the token as missing, and I attach addresses with the script.
