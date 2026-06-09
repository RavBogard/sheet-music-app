---
phase: v11-04-consumer-surface-onboarding
plan: 01
subsystem: api
tags: [multi-tenant, firestore, org-scoping, ssr, perform, isr]
requires:
  - phase: v11-02-mcp-org-scoping
    provides: orgFrom/rowOrg seam, orgId on setlists, coerceOrgId, x-org-id header (proxy)
  - phase: v11-03-domain-branding
    provides: OrgProvider/useOrg, <html data-org>, coerceOrgId(header→org)
provides:
  - org-scoped public /perform setlist reads (SSR admin fetch + client subscription)
  - getAllSetlists opt-in org filter (preserves MCP broad-fetch contract)
  - per-host dynamic /perform (replaces shared path-keyed ISR)
  - (orgId,date) setlists composite index (deployed)
affects: [v11-04-02-branding, v11-04-03-onboarding, v11-06-isolation-audit]
tech-stack:
  added: []
  patterns: ["opt-in org filter (undefined=cross-tenant for MCP) at the data-access layer", "per-host dynamic SSR via x-org-id header"]
key-files:
  created: []
  modified:
    - src/lib/server-setlists.ts
    - src/app/perform/page.tsx
    - src/lib/setlist-firebase.ts
    - src/components/performance/PublicSetlistListing.tsx
    - firestore.indexes.json
    - src/lib/__tests__/server-setlists.test.ts
    - src/app/perform/__tests__/page.test.tsx
key-decisions:
  - "Org filter is OPT-IN (org provided→.where; absent→cross-tenant) to preserve the v11-02 MCP fetch-broad-then-rowOrg-filter contract with ZERO MCP changes"
  - "/perform goes per-host dynamic — the prior ISR revalidate=60 cache is path-keyed and shared across both domains, structurally unable to serve per-tenant data"
  - "Scoped getAllSetlists only (public /perform path); getUpcoming/getRecent/getSetlistsPage (authed dashboard) deferred to v11-04-03 — documented deviation from Task 1 wording"
  - "Detail route (/perform/setlist/[id]) NOT org-gated — public-by-design, err-public; cross-tenant direct-URL is a v11-06 audit item"
patterns-established:
  - "Public web read paths source caller org from headers() x-org-id → coerceOrgId (mirrors MCP orgFrom)"
duration: ~25min
started: 2026-06-08T21:00:00Z
completed: 2026-06-08T21:18:00Z
---

# Phase v11-04 Plan 01: Org-scope public setlist reads — Summary

**brotherslazaroff.live/perform now serves only Brothers Lazaroff setlists (currently empty) instead of CRC's — both the SSR admin fetch and the client Firestore subscription are tenant-scoped; CRC behavior unchanged.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~25 min |
| Tasks | 5 completed |
| Files modified | 7 |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: SSR read org-scoped | Pass (unit) / Pending live probe | `/perform` reads `x-org-id`→coerceOrgId, passes `org` to getAllSetlists; per-host dynamic. perform/page test asserts org forwarded. Live prod probe pending push. |
| AC-2: Client subscription org-scoped | Pass | `subscribeToAllSetlists(cb, onError, org)` adds `where('orgId','==',org)`; PublicSetlistListing passes `useOrg()` + org in effect deps |
| AC-3: Default-org / no CRC regression | Pass | Opt-in filter: org absent→cross-tenant (MCP unchanged). Public callers always pass coerced org (crc default). CRC /perform → orgId==crc, same data |
| AC-4: Cross-tenant non-leak (test) | Pass | server-setlists.test.ts: where('orgId','==',org) applied per tenant on both query branches; omitted when no org. 20/20 green |

## Verification Results

- `npx tsc --noEmit` → clean (exit 0)
- `vitest run server-setlists.test.ts` → 20/20 pass (4 new org-scoping cases)
- `vitest run public-view.test.tsx perform/page.test.tsx` → 22/22 pass
- Full unit suite → **3297 passed / 0 failed** / 78 skipped (was 3292; +5 new). One vitest-worker RPC reporter timeout (onTaskUpdate) under load — infrastructure noise, not a test failure
- `eslint` (changed files) → 0 errors
- `firebase deploy --only firestore:indexes` → deployed; (orgId,date) index present in config

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/lib/server-setlists.ts` | Modified | getAllSetlists opt-in `org` → `.where('orgId','==',org)` on both branches via `base()` helper |
| `src/app/perform/page.tsx` | Modified | per-host dynamic (`force-dynamic`, removed `revalidate=60`); reads `x-org-id`→coerceOrgId→getAllSetlists({org}) |
| `src/lib/setlist-firebase.ts` | Modified | subscribeToAllSetlists 3rd param `org` → conditional `where('orgId','==',org)` |
| `src/components/performance/PublicSetlistListing.tsx` | Modified | `useOrg()` → passes org to subscription + effect deps |
| `firestore.indexes.json` | Modified | added setlists (orgId ASC, date DESC) composite index |
| `src/lib/__tests__/server-setlists.test.ts` | Modified | +4 cross-tenant scoping tests |
| `src/app/perform/__tests__/page.test.tsx` | Modified | mock next/headers; +1 org-forward assertion |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Opt-in org filter (undefined=cross-tenant) | MCP list_setlists fetches broad then filters via rowOrg; a crc-default would break David's MCP reads. Opt-in = zero MCP changes, honors boundary | Future data-access callers MUST pass org to be scoped; secure-by-default deferred |
| /perform per-host dynamic | Shared path-keyed ISR can't serve two tenants different data | CRC loses /perform edge-cache (one Firestore query/request); correctness > cache |
| Scope only the public path now | Keep plan to one concern (the screenshotted /perform leak) | Authed dashboard reads still cross-tenant → v11-04-03 |

## Deviations from Plan

| Type | Count | Impact |
|------|-------|--------|
| Scope narrowing | 1 | Task 1 named getUpcoming/getRecent too; scoped only getAllSetlists (the /perform path). Others feed the AUTHED dashboard — deferred to v11-04-03. No leak introduced (opt-in = unchanged behavior) |
| Test fix | 1 | perform/page.test.tsx needed a next/headers mock (page now reads headers) — added |

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| perform/page.test.tsx threw "headers called outside request scope" | Added `vi.mock("next/headers")` returning a Headers with x-org-id; all 6 cases green |

## Next Phase Readiness

**Ready:**
- Public /perform tenant-scoped; v11-04-02 (branding/metadata) can build on the same `useOrg()` + `coerceOrgId(header)` seams

**Concerns:**
- Authed surfaces still cross-tenant: `getUpcomingSetlists`/`getRecentSetlists`/`getSetlistsPage` (server-auth + (main)/setlists + paged API route) and the non-/perform `subscribeToAllSetlists` callers (DashboardClient, SetlistDrawer, use-add-to-setlist, use-setlist-dashboard) — org-wire in v11-04-03
- Live deployed-surface probe still required post-push (no local dev; CRC-default masks BL misresolution — v11-03 lesson)

**Blockers:** None

---
*Phase: v11-04-consumer-surface-onboarding, Plan: 01*
*Completed: 2026-06-08*
