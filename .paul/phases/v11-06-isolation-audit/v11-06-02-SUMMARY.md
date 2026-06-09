---
phase: v11-06-isolation-audit
plan: 02
status: complete
loop: APPLY done → UNIFY pending
date: 2026-06-09
---

# v11-06-02 SUMMARY — MCP org-scope-escape + host-spoof adversarial audit

## Result: BOTH TASKS PASS — no escape found, both invariants locked by tests

The MCP-layer adversarial axis of the close gate is complete. The caller's tenant is proven
un-spoofable (bearer-authoritative) and not caller-selectable (no org-accepting tool arg).
**Zero production code changed** — the invariants already held by construction; this plan proves
and locks them with tests.

## Task 1 — host-spoof / bearer authority (emulator) — PASS

New `host-spoof-org-authority.emulator.test.ts` (7 cases):
- **AC-1** verifyBearer derives orgId from the bearer TOKEN DOC and ignores a spoofed `x-org-id`
  header — both directions (BL bearer + `x-org-id: crc` → brotherslazaroff; CRC bearer +
  `x-org-id: brotherslazaroff` → crc) + a legacy no-orgId token defaults crc even with a spoofed
  BL header.
- **AC-2** orgFrom pure contract: returns the bearer-extra orgId; defaults 'crc' when absent;
  THROWS on missing uid; honors ONLY `orgId` (attacker-injected `xOrgId`/`x-org-id` extra keys
  ignored).
- **Verify:** emulator 7/7; tsc 0.

## Task 2 — no-arg-injection invariant (unit) — PASS

New `mcp-org-arg-injection.test.ts` (2 cases). A capturing-mock McpServer runs all 6
`register*Tools` entrypoints (registerReadTools/Write/Monitor/ChartUpload/Roster/Observability)
and introspects every tool's inputSchema:
- **AC-3** NO tool inputSchema exposes an org-selecting key (`/^(org|orgId|orgIds|tenant|tenantId)$/i`)
  → caller org is exclusively `orgFrom(extra)`, never read from args. Captured tool count guarded
  `> 50` (no vacuous pass).
- **Verify:** unit 2/2; tsc 0.

## Findings for v11-06-03 AUDIT.md

- **Host-spoof axis: CLOSED.** The MCP route (`src/app/api/mcp/route.ts`) sources caller org only
  from `verifyBearer(req).orgId` (token doc); `verifyBearer` reads only the `authorization` header.
  A forged `x-org-id` (or any header) cannot change the resolved tenant. Proven both directions.
- **Argument-injection axis: CLOSED + LOCKED.** No MCP tool accepts a caller-suppliable org/tenant
  param; the invariant is now enforced by a regression test (a future tool adding one fails CI).
- Combined with v11-06-01 (rules-layer wall) and v11-02 (per-tool read/write isolation), the MCP
  tenant wall is airtight: rules + per-tool scoping + un-spoofable, non-selectable caller org.

## Quality floor
- `npx tsc --noEmit`: 0 errors
- host-spoof emulator: 7/7 · arg-injection unit: 2/2
- Full emulator suite: **72/72 files, 941/941 tests** (was 71/934; +host-spoof file +7)
- Full non-emulator suite: **284 files, 3323 passed / 80 skipped, 0 failed** (was 283/3321; +arg-injection file +2)
- No production code change (no escape found); no rules/deploy needed.

## Deviations
None. Plan executed exactly as written; both invariants held with no code change required.

## Files created
- `src/lib/mcp/__tests__/host-spoof-org-authority.emulator.test.ts`
- `src/lib/mcp/__tests__/mcp-org-arg-injection.test.ts`

## Carries to v11-06-03
- AUDIT.md folds in: the host-spoof + arg-injection CLOSED findings above, plus v11-06-01's
  per-collection enforcement table and residual-risk register.
- Then: live deployed-surface probe (extend scripts/e2e-bl-tenant-probe.mjs to the v11-05
  collections, DAVID_BEARER+CRC_BEARER) → push the phase → /paul:complete-milestone.
