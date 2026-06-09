---
phase: v11-03-domain-branding
plan: 01
subsystem: infra
tags: [multi-tenant, edge-middleware, next-proxy, react-context, theming-seam]

requires:
  - phase: v11-01-tenant-foundation
    provides: resolveOrgIdByDomain / ORGS registry / OrgId type
provides:
  - Edge host→org resolution forwarded as the x-org-id request header
  - <html data-org="…"> CSS hook for tenant theming
  - client OrgProvider / useOrg() seam carrying the resolved org to components
affects: [v11-03-02-branding, v11-03-03-vocab, v11-04-consumer-surface]

tech-stack:
  added: []
  patterns:
    - "Edge→RSC org propagation via x-org-id request header (mirrors the existing x-nonce seam)"
    - "Host-derived org for the browser surface; token-derived org for MCP/API (two independent resolvers)"

key-files:
  created:
    - src/lib/org/org-context.tsx
    - src/lib/org/__tests__/org-context.test.tsx
  modified:
    - src/proxy.ts
    - src/app/layout.tsx

key-decisions:
  - "Browser org source = host only (no cookies/claims at the Edge); MCP/API keeps its token-based org resolver"
  - "Edge .set('x-org-id') overwrites any client-supplied header → Edge is authoritative (trust boundary)"
  - "Layout re-runs resolveOrgIdByDomain on the header value to stay total+typed (unknown → crc)"

patterns-established:
  - "data-org on <html> is the single CSS hook v11-03-02 themes against"
  - "useOrg() throws outside <OrgProvider> — missing provider is a loud error, never a silent wrong-tenant render"

duration: ~10min
started: 2026-06-08T19:11:00Z
completed: 2026-06-08T19:21:00Z
---

# Phase v11-03 Plan 01: Org-context foundation Summary

**brotherslazaroff.live now resolves to the `brotherslazaroff` tenant end-to-end on the browser surface (Edge `x-org-id` → `<html data-org>` → client `useOrg()`), with zero visual change — the CSS/vocab hooks for v11-03-02/03 are in place.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~10 min |
| Tasks | 3 completed |
| Files modified | 2 modified, 2 created |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Host resolves to org at Edge and reaches server render | Pass | proxy forwards `x-org-id`; layout reads it → `<html data-org="brotherslazaroff">` for BL host/www |
| AC-2: Default tenant preserved for CRC / non-tenant hosts | Pass | centralreform.live / www / localhost / *.vercel.app / unknown → `crc`; covered by registry.test.ts matrix; no visual/behavioral change (data-org inert) |
| AC-3: Client components can read the current org | Pass | `useOrg()` returns provided org (3/3 org-context tests); throws "useOrg must be used within <OrgProvider>" outside provider |

## Accomplishments

- Wired `resolveOrgIdByDomain(host)` into the Edge proxy and forwarded the result as `x-org-id`, reusing the exact request-header seam the CSP nonce already uses — every matched route carries it.
- Stamped `<html data-org={orgId}>` in the root layout: the single, inert CSS hook v11-03-02's dark+photographic BL theme will key off.
- Added a tiny data-only `OrgProvider`/`useOrg` client context so v11-03-03's `label(org,key)` and any client theming can read the tenant without prop-drilling.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/proxy.ts` | Modified | Import `resolveOrgIdByDomain`; resolve host and `requestHeaders.set('x-org-id', orgId)` right after the `x-nonce` set |
| `src/app/layout.tsx` | Modified | Read `x-org-id` (via resolver, total+typed); add `data-org` to `<html>`; wrap subtree in `<OrgProvider>` (outside ThemeProvider; no reorder) |
| `src/lib/org/org-context.tsx` | Created | Client `OrgProvider` + `useOrg()` (+ exported `OrgContext`) |
| `src/lib/org/__tests__/org-context.test.tsx` | Created | Provider/hook tests (provides org; throws outside provider) |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Browser org = host only at the Edge | Browser surface is host-addressed; cookies/claims are the API/MCP path | Keeps the two org resolvers cleanly separate; no firebase-admin import at the Edge |
| Unconditional `.set('x-org-id')` | `new Headers(request.headers)` copies a client-supplied value; overwrite makes the Edge authoritative | Closes a header-spoof trust gap |
| Re-resolve the header in layout | Makes `orgId` total+typed (unknown → `crc`) with no casts | Robust to a missing/garbage header |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 0 | — |
| Scope additions | 0 | — |
| Deferred | 1 | Test-coverage relocation, no functional impact |

**Total impact:** Minimal — one test-scope adjustment, no scope creep.

### Deferred / adjusted Items

- **Resolver host-matrix tests:** Task 3 specified adding the brotherslazaroff/www/port/localhost/vercel/null matrix. That matrix **already exists in full** in `src/lib/org/__tests__/registry.test.ts` (verified). Re-adding would duplicate, so the new `org-context.test.tsx` covers only the provider/hook. No coverage lost.

## Issues Encountered

None.

## Next Phase Readiness

**Ready:**
- `data-org` CSS hook + `useOrg()` available for **v11-03-02** (BL dark+photographic branding — `/ui-ux-pro-max` BLOCKING; brand source = brotherslazaroff.com navy + live photos on dark canvas, per CONTEXT.md).
- Same org seam available for **v11-03-03** (`label(org,key)` + per-tenant rabbi/service-type hiding).

**Concerns:**
- v11-03-02 is the genuine visual/product taste call — recommend a quick human look at the rendered BL chrome (the sanctioned product-ambiguity review point) once `/ui-ux-pro-max` produces the design.

**Blockers:** None.

**Verification note:** Local `next build` is NOT used as the gate (pre-existing `/api/cron/aggregate-corrections` CRON_SECRET issue, Vercel-injected) — `tsc --noEmit` clean + full unit suite 3282 pass/0 fail is the gate. Vercel prod build will exercise the full build on phase-close commit.

---
*Phase: v11-03-domain-branding, Plan: 01*
*Completed: 2026-06-08*
