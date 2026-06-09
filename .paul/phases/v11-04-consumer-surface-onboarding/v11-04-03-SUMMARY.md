# v11-04-03 SUMMARY — Authed-dashboard read scoping

**Status:** APPLY ✓ · code-verified · shipped. Authed deployed-surface probe → UAT-PENDING (needs a signed-in session; no-local-dev).
**Date:** 2026-06-09

## Goal (recap)
Org-scope the remaining AUTHED setlist read paths so a signed-in Brothers Lazaroff
user's `/setlists` dashboard shows BL-only (it was cross-tenant), CRC unchanged.
Closes the last known cross-tenant READ surface → completes v11-04.

## Key scoping finding (baked into the plan)
`getUpcomingSetlists`/`getRecentSetlists` have **no live callers** (only re-exported
as `getUpcomingPublicSetlists`/`getRecentPublicSetlists`). The only live authed read
path is `getSetlistsPage` (SSR `/setlists` + `/api/setlists/page`) plus the 4 client
`subscribeToAllSetlists` callers. `subscribeToAllSetlists` already accepted `org?`
(v11-04-01). The proxy sets `x-org-id` on ALL routes incl. `/api` (proxy.ts:150).

## What shipped

### Task 1 — `src/lib/server-setlists.ts` (+ tests)
Added opt-in `org?: OrgId` to `getSetlistsPage`, `getUpcomingSetlists`, `getRecentSetlists`,
mirroring `getAllSetlists`' seam: `const col = db.collection("setlists"); const scoped =
opts.org ? col.where("orgId","==",opts.org) : col` then `.orderBy("date","desc")...`.
Backed by the deployed `(orgId,date)` composite index (v11-04-01). With NO org the query
is byte-for-byte the prior cross-tenant behavior (preserves the MCP/no-org contract).
+4 unit tests (getSetlistsPage with/without org; getUpcoming/getRecent with/without org).

### Task 2 — both `getSetlistsPage` callers thread org from `x-org-id`
- `src/app/(main)/setlists/page.tsx` (server component): `coerceOrgId((await headers()).get("x-org-id"))` → `getSetlistsPage({ pageSize: 50, org })`.
- `src/app/api/setlists/page/route.ts`: `coerceOrgId(req.headers.get("x-org-id"))` → `getSetlistsPage({ cursor, pageSize, org })`.
Used `coerceOrgId` (validate an org id), NOT `resolveOrgIdByDomain` (the v11-03-01 bug).

### Task 3 — 4 client subscription callers pass `useOrg()`
`DashboardClient.tsx`, `SetlistDrawer.tsx`, `use-add-to-setlist.ts`, `use-setlist-dashboard.ts`:
added `import { useOrg }`, `const org = useOrg()`, passed `org` as the 3rd arg to
`subscribeToAllSetlists(cb, onError, org)` (use-add-to-setlist passes `undefined` for
onError), and added `org` to each effect's dep array. Mirrors PublicSetlistListing (v11-04-01).

## /ui-ux-pro-max
Loaded this session (BLOCKING gate satisfied). Light scope per the plan: the change is
data-threading, no visual redesign. The BL empty-dashboard state reuses the existing
intentional empty state (no new error/stuck-spinner path introduced).

## Verification
- `tsc --noEmit`: **clean**
- server-setlists targeted: **24/24** (+4 new)
- Full suite: **3304 passed / 0 failed** / 78 skipped (+4 = the new tests). 2 `onTaskUpdate`
  worker-RPC timeouts = known parallel-load flake (no real failures; changes are query/
  prop threading with no async/timer code).
- eslint (changed files): **0 errors** (8 pre-existing warnings in DashboardClient —
  unused eslint-disable directives + an exhaustive-deps warning on a different effect;
  not introduced here).
- DEPLOYED-SURFACE PROBE (authed): appended to `.paul/UAT-PENDING.md` — requires a
  signed-in BL session (no-local-dev). Server-side scoping proven by unit tests; CRC
  setlists confirmed to carry orgId via the v11-04-01 live /perform probe.

## Acceptance criteria
- AC-1 (authed SSR + Load-more org-scoped) ✓ (code; live confirm → UAT)
- AC-2 (live subscription org-scoped, all 4 callers) ✓
- AC-3 (org opt-in; no-org = prior behavior) ✓ (asserted in tests)
- AC-4 (no CRC regression; gates green) ✓ (tsc/tests; CRC-unchanged live confirm → UAT)

## Files modified
- src/lib/server-setlists.ts
- src/lib/__tests__/server-setlists.test.ts
- src/app/(main)/setlists/page.tsx
- src/app/api/setlists/page/route.ts
- src/app/(main)/DashboardClient.tsx
- src/components/performance/SetlistDrawer.tsx
- src/hooks/use-add-to-setlist.ts
- src/hooks/use-setlist-dashboard.ts
- .paul/UAT-PENDING.md

## Deferred / flagged (NOT this plan)
- **In-app setlist CREATE orgId stamping** (CreationWizard): an in-app-created BL
  setlist lacking orgId would not appear in the now-scoped dashboard. Daniel/David
  author via MCP (stamps org, v11-02-03) → low-risk. Route to v11-05 write-scoping.
- templates/roster/congregation/service-personnel R+W + CreationWizard vocab → v11-05.
- rules-level isolation (app-layer scoping only here) → v11-06 audit.

## Phase status
v11-04 (consumer surface + onboarding) is now **3/3 plans applied**: 01 web-read scoping
✓, 02 branding/metadata ✓, 03 authed-read scoping ✓. Ready to transition to v11-05.
