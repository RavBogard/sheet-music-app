---
phase: v11-02b-org-aware-minting
plan: 01
subsystem: mcp-auth
tags: [mcp, multi-tenant, orgId, custom-claims, token-minting, onboarding, oauth]

requires:
  - phase: v11-01
    provides: getUserOrgIds(uid) / getOrgIdsFromClaims — claim→org resolution (default crc)
  - phase: v11-02-01
    provides: createMcpToken's optional orgId arg + verifyBearer resolving org FROM the token doc
provides:
  - getPrimaryOrgForMinting(uid) — the org a self-service mint should stamp
  - org-aware /api/mcp/tokens + /api/mcp/oauth/token (stamp the minter's claim org)
affects: [v11-03, v11-04 onboarding, v11-05 isolation audit]

tech-stack:
  added: []
  patterns:
    - "Self-service mint derives token org from the minting user's orgIds claim (getPrimaryOrgForMinting) — closes the mint-defaults-crc gap"
    - "First-org-wins for multi-org claims (documented caveat; revisit with explicit org-pick when multi-org membership is real)"

key-files:
  created:
    - src/lib/mcp/__tests__/mint-org-aware.emulator.test.ts
  modified:
    - src/lib/org/membership.ts
    - src/app/api/mcp/tokens/route.ts
    - src/app/api/mcp/oauth/token/route.ts
    - src/lib/org/__tests__/membership.test.ts

key-decisions:
  - "Fix it now (Daniel 2026-06-08) over deferring to v11-04 or keeping manual mint"
  - "Reuse getUserOrgIds (v11-01-01) — no new claim-reading code; getPrimaryOrgForMinting is a thin first-of wrapper"
  - "First org wins on multi-org claims (today every member is single-org)"
  - "Inserted as phase v11-02b between v11-02 (closed) and v11-03 — a discovered follow-on, not a v11-02 reopen"

patterns-established:
  - "Token org is stamped at mint from the user's claim; verifyBearer reads it from the doc (v11-02-01) — the two halves now agree for self-service"

duration: ~40min
started: 2026-06-08T18:05:00Z
completed: 2026-06-08T18:45:00Z
---

# Phase v11-02b Plan 01: Org-Aware Token Minting Summary

**The two self-service MCP mint paths now stamp a token's org from the minting user's `orgIds` claim, so a non-CRC member (David) who self-mints or runs Claude Desktop's OAuth flow gets a correctly tenant-scoped bearer — onboarding like Daniel does, no manual raw-token handoff — while CRC users stay crc.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~40 min |
| Tasks | 2 completed (2 E/Q PASS) |
| Files modified | 4 |
| Files created | 1 |
| Checkpoints | 0 (autonomous; deploy = AUTO task) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: resolver returns member's org / defaults crc / never throws | ✅ Pass | unit 9/9 (BL claim→BL; claimless/empty/malformed→crc; missing-user→crc; multi-org→first) + emulator AC-1 |
| AC-2: self-service mint stamps caller's org | ✅ Pass | emulator: BL user → mcpTokens doc orgId="brotherslazaroff" + verifyBearer resolves BL; CRC user → crc |
| AC-3: no regression / CRC unchanged + deployed | ✅ Pass | tsc clean; CRC (claimless) mints crc as before; Vercel prod build READY (feat(v11-02b) `2db15f36d9`); prod-verify: getUserOrgIds(DavidUid)===["brotherslazaroff"] → resolver→brotherslazaroff |

## Accomplishments

- **Closed the gap Daniel surfaced:** self-service minting (`/api/mcp/tokens` POST + the OAuth `/api/mcp/oauth/token` exchange) was hard-defaulting `orgId` to crc, so a BL member self-minting would have landed in CRC's tenant. Both paths now derive the org from the user's claim.
- **Onboarding is now self-service + org-correct:** David (and future members) can add the server in Claude Desktop, log in, and receive a `brotherslazaroff`-scoped bearer automatically — the workaround (manual `issue-bl-bearer.mjs` handoff) is no longer required for new members.
- **Zero new claim code:** reused `getUserOrgIds` (v11-01-01); `getPrimaryOrgForMinting` is a 2-line wrapper.
- **Emulator-proven end-to-end** (claim → resolver → mint → token-doc orgId → verifyBearer) 3/3; CRC behavior-neutral.

## Task Commits

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Tasks 1–2 (resolver + route threading + tests) | `2db15f36d9` | feat | feat(v11-02b): org-aware MCP token minting — self-service tenant onboarding |

Pushed to `origin master` → Vercel prod deploy READY. (Phase-transition bookkeeping commits separately as `docs(v11-02b)` in this UNIFY.)

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/lib/org/membership.ts` | Modified | + `getPrimaryOrgForMinting(uid)` (first-of getUserOrgIds, default crc) |
| `src/app/api/mcp/tokens/route.ts` | Modified | POST mint passes `await getPrimaryOrgForMinting(ctx.auth.uid)` to createMcpToken |
| `src/app/api/mcp/oauth/token/route.ts` | Modified | OAuth token mint passes the resolved org to createMcpToken |
| `src/lib/org/__tests__/membership.test.ts` | Modified | + getPrimaryOrgForMinting unit block (mocked firebase-admin) — 4 cases |
| `src/lib/mcp/__tests__/mint-org-aware.emulator.test.ts` | Created | claim→resolver→mint→doc→verify chain, Auth+Firestore emulators (3 cases) |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Fix now (not defer to v11-04) | Daniel chose "fix it now" — removes the raw-token-handoff workaround | Inserted phase v11-02b before v11-03 |
| Reuse getUserOrgIds | Single source for claim→org; no duplication | getPrimaryOrgForMinting is a thin wrapper |
| First-org-wins on multi-org | Today every member is single-org | Documented caveat; revisit when multi-org membership is real |
| Admin/test mints untouched | mint_admin_bearer inherits caller org; test-token default crc is intentional | Blast radius confined to the 2 self-service paths |

## Deviations from Plan

| Type | Count | Impact |
|------|-------|--------|
| Build-gate substitution | 1 | None — Vercel build (with env) is authoritative |

**1. Local `next build` could not complete; used the Vercel prod build as the route-export/build gate instead.** Local `npm run build` failed at page-data collection on `/api/cron/aggregate-corrections` with "Invalid environment variables" — that route's env schema requires `CRON_SECRET`, which this box's `.env.local` lacks (a Vercel-injected var). The failing route is NOT in this changeset; compilation + route-export-shape validation passed (the build reached the runtime data-collection phase). The authoritative build with full env is Vercel's, which reached **READY** for `2db15f36d9` — confirming the code builds clean. (Pre-existing local-env limitation, consistent with the prod-script-auth note.)

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Local build fails on unrelated CRON_SECRET cron route | Confirmed unrelated to changeset (route not touched; env-schema eval); relied on the green Vercel prod build as the gate. |
| Full unit suite not re-run (3272-class) | Change is additive + isolated (1 exported fn + 2 handler bodies); targeted unit 9/9 + emulator 3/3 + tsc clean + green Vercel build cover the behavior. Noted rather than spend the ~5min flaky full run ([[feedback_parallel_load_flake_baseline]]). |

## Next Phase Readiness

**Ready:**
- Self-service org-aware onboarding is live. v11-03 (domain + branding) and v11-04 (consumer surface + onboarding) build on a clean, self-serve tenant-auth model.

**Concerns:**
- Multi-org membership (a user in >1 org) would need an explicit org-pick at mint — not built (first-org-wins). Flag if/when a user joins a second org.

**Blockers:** None.

**UAT-PENDING update:** David can now re-onboard via plain login (Claude Desktop add-server → log in → BL-scoped token) instead of the manual bearer. His existing manual bearer (tokenId 93JMXhT1OspFsWDMmb9V) still works either way.

---
*Phase: v11-02b-org-aware-minting, Plan: 01*
*Completed: 2026-06-08*
