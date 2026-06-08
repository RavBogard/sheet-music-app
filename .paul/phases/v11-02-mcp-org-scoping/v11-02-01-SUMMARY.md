---
phase: v11-02-mcp-org-scoping
plan: 01
subsystem: mcp-auth
tags: [mcp, multi-tenant, orgId, bearer, firestore, backfill]

requires:
  - phase: v11-01-tenant-foundation
    provides: org model (DEFAULT_ORG_ID, OrgId, ORGS registry), default-crc backward-compat contract, backfill pattern
provides:
  - verifyBearer returns a resolved orgId (default crc) on every MCP request
  - AuthInfo.extra now carries orgId alongside uid/tokenId/parentTokenId
  - orgFrom(extra) — the single caller-org resolution seam for v11-02-02/03
  - orgId stamped at all 4 mcpTokens mint sites (minted children inherit caller org)
  - prod mcpTokens fully backfilled to orgId="crc" (117 docs)
affects: [v11-02-02 read filtering, v11-02-03 write stamping, v11-02-04 David BL bearer]

tech-stack:
  added: []
  patterns:
    - "Caller-org resolution from the bearer token doc (not Auth claims) — a bearer is org-pinned"
    - "orgFrom(extra) seam mirrors uidFrom's unauthenticated-throws contract"

key-files:
  created:
    - src/lib/mcp/org-context.ts
    - src/lib/mcp/backfill-token-orgid.ts
    - scripts/backfill-token-orgid.mjs
    - src/lib/mcp/__tests__/org-context.test.ts
    - src/lib/mcp/__tests__/backfill-token-orgid.emulator.test.ts
  modified:
    - src/lib/mcp/auth.ts
    - src/lib/mcp/tokens.ts
    - src/app/api/mcp/route.ts
    - src/lib/mcp/tools/mint-admin-bearer.ts
    - src/lib/mcp/tools/admin-test-session.ts
    - src/lib/mcp/tools/test-tokens.ts
    - src/lib/mcp/tools/index.ts

key-decisions:
  - "Org resolved from the mcpTokens doc, not Auth custom claims (bearer is org-pinned; zero extra reads)"
  - "Absent/empty orgId field → DEFAULT_ORG_ID (crc) — mirrors v11-01 backward-compat; behavior-neutral"
  - "Minted-admin children inherit the root caller's orgId; test/admin-test mints default crc"

patterns-established:
  - "orgFrom(extra): the one seam read/write tools call to learn their tenant"
  - "db-injected backfill core + thin .mjs prod runner + emulator test (v11-01-03 pattern, reused)"

duration: ~50min
started: 2026-06-08T20:55:00Z
completed: 2026-06-08T21:12:00Z
---

# Phase v11-02 Plan 01: Caller-Org Resolution Foundation Summary

**Every `/api/mcp` request now carries the caller's resolved tenant (`orgId`, default crc) from the bearer token through to a single `orgFrom(extra)` handler seam — behavior-neutral spine for v11-02 read filtering + write stamping.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~50 min |
| Tasks | 3 completed (3 PASS) |
| Files modified | 7 |
| Files created | 5 |
| Checkpoints | 0 (autonomous) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Existing CRC bearer resolves to crc (backward-compat) | ✅ Pass | `auth.test.ts` — no-orgId-field + empty-string both → "crc"; full suite behavior unchanged |
| AC-2: Tenant-stamped bearer resolves to its org | ✅ Pass | `auth.test.ts` — orgId "brotherslazaroff" → "brotherslazaroff"; route plumbs to extra |
| AC-3: orgFrom(extra) reads resolved org | ✅ Pass | `org-context.test.ts` 4/4 — present→returned, absent→crc, empty→crc, no-uid→throws |
| AC-4: Every mint site stamps orgId | ✅ Pass | createMcpToken (+oauth via it), mint_admin_bearer (inherits), admin-test-session, provisionTestAccount |
| AC-5: Prod backfill idempotent + crc-stamping | ✅ Pass | emulator 3/3 + prod run: 117 scanned → 117 stamped → re-verify wouldStamp:0 |

## Accomplishments

- **Resolution spine plumbed end-to-end:** `verifyBearer` resolves `orgId` from the token doc (default crc) → MCP route stashes it on `AuthInfo.extra` → `orgFrom(extra)` exposes it to any handler. v11-02-02/03 now have a single seam to consume.
- **All 4 mint sites stamp orgId** with the right semantics: minted-admin children inherit the root caller's org; the user-facing `createMcpToken` (and OAuth, which routes through it) + test + admin-test mints default crc.
- **Prod mcpTokens backfilled:** 117 live bearers stamped `orgId="crc"`; idempotency verified live (re-run wouldStamp:0). No unstamped bearers remain.
- **Behavior-neutral confirmed:** full unit suite 3272 passed / 0 failed; every existing CRC bearer authenticates and behaves exactly as before (no read filtered, no write restricted — that is v11-02-02/03).

## Task Commits

No per-task commits. Per the v11.0 autonomy directive (auto-commit per **phase**, matching v11-01), all v11-02 plans are committed together at the phase transition after v11-02-04. Code is staged in the working tree.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/lib/mcp/auth.ts` | Modified | verifyBearer resolves + returns `orgId` (default crc); `VerifiedBearer.orgId` |
| `src/app/api/mcp/route.ts` | Modified | Plumb `orgId` onto `AuthInfo.extra` |
| `src/lib/mcp/tokens.ts` | Modified | `createMcpToken(uid,label,orgId=crc)` stamps orgId |
| `src/lib/mcp/tools/mint-admin-bearer.ts` | Modified | `MintAdminBearerCaller.orgId`; child inherits caller org; `tokenIdentityFrom` reads orgId |
| `src/lib/mcp/tools/admin-test-session.ts` | Modified | Stamp `orgId: crc` on the minted bearer |
| `src/lib/mcp/tools/test-tokens.ts` | Modified | Stamp `orgId: crc` on provisioned test bearer |
| `src/lib/mcp/tools/index.ts` | Modified | Re-export `orgFrom` for the tool import site |
| `src/lib/mcp/org-context.ts` | Created | `orgFrom(extra)` resolution seam + `AuthExtra` type |
| `src/lib/mcp/backfill-token-orgid.ts` | Created | db-injected idempotent mcpTokens orgId backfill core |
| `scripts/backfill-token-orgid.mjs` | Created | Prod runner (dry-run default; temp-ADC RUNBOOK header) |
| `src/lib/mcp/__tests__/org-context.test.ts` | Created | AC-3 (4 cases) |
| `src/lib/mcp/__tests__/backfill-token-orgid.emulator.test.ts` | Created | AC-5 (dry-run / apply / idempotent) |
| `src/lib/mcp/__tests__/auth.test.ts` | Modified | AC-1/AC-2 + updated exact-match for new orgId field |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Resolve org from the **mcpTokens doc**, not Auth claims | A bearer is the unit of MCP authoring identity; verifyBearer already reads the token doc (zero extra reads); David's BL bearer always acts as BL | v11-02-04 mints David's bearer with `orgId: brotherslazaroff`; no per-request getUser() |
| Absent/empty orgId → crc | Mirrors v11-01's default-crc backward-compat; avoids the lock-out class v11-01-04 caught | Behavior-neutral; every legacy bearer keeps working |
| Minted children inherit caller org | A child bearer must act in the same tenant as the root | mint_admin_bearer stays correct cross-tenant |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Scope reduction | 1 | None — planned file needed no change |
| Scope addition (test-only) | 1 | Essential — kept emulator suite green |
| Conformant clarification | 1 | None — matches v11-01-03 |

**Total impact:** Minor; no scope creep, no behavior change.

### Details

**1. `src/app/api/mcp/tokens/route.ts` NOT modified (planned in files_modified).**
- `createMcpToken`'s new `orgId` param defaults to crc, so the existing 2-arg call from the route is correct unchanged. No edit needed.

**2. Fixed exact-match `toEqual` assertions in 4 emulator test files (not in the plan's files_modified).**
- `mcp-mint-admin-bearer.emulator.test.ts` (caller objects — tsc-breaking without orgId), `mcp-token-flow`, `mcp-test-tokens`, `mcp-oauth-flow` (verifyBearer `toEqual` now needs `orgId: "crc"`). Necessary because `VerifiedBearer`/`MintAdminBearerCaller` gained `orgId`; test-only, essential to keep the suite green.

**3. Backfill core signature is db-injected `(db, {dryRun})` rather than the plan sketch's `({apply})`.**
- The plan said "mirror the v11-01-03 backfill shape exactly" — db-injection IS that shape (emulator-testable). Conformant clarification, not drift.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Adding `orgId` to `VerifiedBearer`/`MintAdminBearerCaller` broke 5 token-flow test files | Updated caller objects + exact-match assertions to include `orgId: "crc"`; tsc + suite green |

## Skill Audit

SPECIAL-FLOWS.md gates /ui-ux-pro-max on frontend UI/UX phases only. v11-02-01 is an MCP auth / data-layer plan with no UI — **no required skills (N/A)**.

## Next Phase Readiness

**Ready:**
- `orgFrom(extra)` is the tested seam v11-02-02 (read filtering) and v11-02-03 (write stamping) consume.
- Every prod bearer carries an explicit `orgId`; David's BL bearer (v11-02-04) just needs `orgId: "brotherslazaroff"`.

**Concerns:**
- v11-02-02 must thread `orgId` into the read data layer (setlists/library/songs/templates/roster/congregation). Reads are currently UNFILTERED — once BL data exists, an unscoped read would leak cross-tenant. This is the security-critical core of the next plan.

**Blockers:** None.

---
*Phase: v11-02-mcp-org-scoping, Plan: 01*
*Completed: 2026-06-08*
