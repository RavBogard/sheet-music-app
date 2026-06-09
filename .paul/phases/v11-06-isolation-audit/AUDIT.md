# v11-06 — Cross-Tenant Isolation Security Audit (milestone close gate)

**Milestone:** v11.0 Brothers Lazaroff Multi-Tenant · **Date:** 2026-06-09 · **Auditor:** PAUL executor (autonomous)
**Verdict: ✅ GO for milestone close** (one public-by-design UX item closes on this phase's deploy — see §Live).

---

## Scope & method

Adversarial check that Brothers Lazaroff (BL) is fully tenant-isolated from Central Reform Congregation
(CRC) and CRC is unregressed, across three axes (ROADMAP v11-06):
1. **Firestore-rules leakage** — can a client read/write another tenant's docs directly?
2. **MCP org-scope escape** — can an MCP caller reach another tenant via tools/args?
3. **Host-spoof tenant confusion** — can a forged header change the caller's resolved tenant?

Evidence: emulator-backed adversarial tests (blocking), plus a LIVE probe against
`https://www.centralreform.live/api/mcp`.

---

## Axis 1 — Firestore rules (v11-06-01) — CLOSED

Adversarial rules suite `firestore-rules-orgscope.emulator.test.ts` (19/19) across the v11-05 collections.
**Hardened + DEPLOYED** to `crcmusiccharts` (rules compiled + released 2026-06-09).

Per-collection enforcement layer:

| Collection | Client read path | Wall | Status |
|---|---|---|---|
| setlists / tracks | public (by design) | public read; write org-isolated (v11-01-04) | ✓ |
| songs / recordings | member | member read; write org-isolated | ✓ |
| `scheduling_assignments` | **yes** (subscribeToAllUpcomingAssignments) | **rules-walled** — `orgReadOk` on band_leader read (added v11-06-01) | ✓ HARDENED |
| `scheduling_history` | server | **rules-walled** — `orgReadOk` (defense-in-depth) | ✓ HARDENED |
| `config/congregation__{org}` | **yes** (congregation-store onSnapshot) | **fixed** — guarded `/config/{doc}` wildcard (was deny-by-default for BL) | ✓ FIXED |
| `setlistTemplates` | none (MCP/admin SDK) | role-gated; app-layer org scope (v11-05-01) | app-only (residual #1) |
| `users` | leader picker (server) | claim-based filter; no orgId field on doc | app-only (residual #3) |
| orgs / library_index | public-read / server-only | unchanged | ✓ |

CRC not regressed: claimless CRC leaders retain full write + read (no lock-out) — proven in the suite.

## Axis 2 — MCP org-scope escape (v11-06-02) — CLOSED + LOCKED

- **Argument-injection:** `mcp-org-arg-injection.test.ts` (2/2) — capturing-mock over all 6 `register*Tools`
  entrypoints (>50 tools) proves NO tool inputSchema exposes an `org`/`orgId`/`tenant` key. Caller org is
  exclusively `orgFrom(extra)` (bearer-derived), never caller-selectable. Invariant now CI-locked.
- **Per-tool isolation** (v11-02): reads/writes already org-walled (cross-tenant by-id → not-found wall,
  no `cross_tenant_denied` existence leak); org-scope-reads/writes emulator suites green.

## Axis 3 — Host-spoof tenant confusion (v11-06-02) — CLOSED

`host-spoof-org-authority.emulator.test.ts` (7/7): `verifyBearer` resolves caller org ONLY from the bearer
token doc and IGNORES a spoofed `x-org-id` header (both directions; legacy no-orgId → crc). `orgFrom`
defaults crc on absent orgId, throws on missing uid, ignores injected header-like extra keys. The MCP route
sources org solely from `verifyBearer(req).orgId` — never from a request header.

---

## Live deployed-surface probe (this slice)

`scripts/e2e-bl-tenant-probe.mjs` extended to the v11-05 collections, run against PROD with a **throwaway BL
bearer** (minted claim-free via `scripts/mint-throwaway-bl-bearer.mjs` — David's auth claim left untouched,
verified `orgIds=['crc','brotherslazaroff']` after; bearer revoked post-run) + a CRC bearer.

**Pre-deploy result: 18/19 PASS.** Isolated live:
- BL list_setlists BL-only; BL create stamped BL (invisible to CRC); BL cannot get/update/delete a CRC
  setlist by id (`setlist_not_found` wall, no mutation); CRC setlist unchanged after attack.
- `list_templates`: CRC intact (4); BL shares **0** ids with CRC's (no template leak).
- `get_congregation_context`: CRC identity = "Central Reform Congregation"; BL identity = "Brothers
  Lazaroff" (NOT CRC) — branding isolated.
- `list_musicians`: CRC intact (9); BL scoped. (David is multi-org, so roster overlap on David is expected,
  not a leak — strict roster isolation is emulator-covered in mcp-roster org cases.)
- AC-4 CRC unaffected (5 setlists, no lock-out).

**The 1 fail — NOT a security leak, closes on this phase's deploy:**
`BL leadHistory contains NO CRC setlist` FAILED (blHistory=10, 5 CRC). Cause: v11-06-01's `getCongregationContext`
leadHistory org-scope fix is committed LOCAL but **not yet deployed** (the phase push is part of this close).
Setlist names are **public-by-design** ([[feedback_setlist_public_policy]]) — v11-06-01 scoped leadHistory for
UX correctness, not secrecy — so a BL author transiently seeing CRC service *names* in their congregation-context
history is a UX nit, not a cross-tenant data leak. The fix is emulator-proven (mcp-congregation-context 11/11).
**Post-deploy re-run confirmation appended below.**

### Post-deploy re-run — ✅ 19/19
After the v11-06 phase push (`5e16e28a98`) deployed to Vercel, the live probe was re-run with a fresh
claim-free throwaway BL bearer + CRC bearer: **19/19 PASS**, including
`v11-06-03 BL leadHistory contains NO CRC setlist — blHistory=0 leaked=0`. The deploy-pending leadHistory
item is now CLOSED live; BL congregation-context leadHistory is fully tenant-scoped in production. Throwaway
bearer revoked; David's claim verified intact. **All 19 live isolation assertions pass — clean.**

---

## Residual-risk register

| # | Item | Risk | Disposition |
|---|---|---|---|
| 1 | `setlistTemplates` rules gate on role, not org | Low — no client read path (MCP/admin SDK only); app-layer org-scoped (v11-05-01) | ACCEPTED; add `orgReadOk` if a client read path ever lands |
| 2 | `scheduling_history` orgId-absent rows readable cross-tenant | Low — crc-safe today; rule already walls orgId-stamped rows; history writes don't yet stamp orgId | ACCEPTED; closes when history-write stamping lands |
| 3 | `users` claim-based (no orgId field) | Low — architectural; rules can't field-scope; app-layer claim filter is the wall | ACCEPTED (by design, v11-05-02) |

## Coverage map (collection × layer)

| Collection | rules | MCP read | MCP write | client read | live probe |
|---|---|---|---|---|---|
| setlists | ✓ | ✓(02) | ✓(02) | public | ✓ |
| setlistTemplates | app-only | ✓(05-01) | ✓(05-01) | none | ✓ (0-id-overlap) |
| users (roster) | claim-only | ✓(05-02) | n/a | leader | ✓ (CRC intact) |
| scheduling_assignments | ✓(06-01) | ✓(05-03) | server | ✓ walled | emulator |
| congregation | ✓(06-01) | ✓(05-04) | admin | ✓ fixed | ✓ identity isolated |

## Verdict

**GO.** All three adversarial axes are closed: rules-layer walls deployed + emulator-proven, MCP escape +
host-spoof closed and CI-locked, and the live probe confirms BL is isolated and CRC unregressed across every
v11-05 collection. The single live miss (BL leadHistory showing public-by-design CRC setlist names) is a
non-security UX item, already fixed and emulator-proven, that closes when this phase deploys. No cross-tenant
data leak and no CRC lock-out exist. v11.0 is cleared to close.
