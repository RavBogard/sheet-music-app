---
phase: v11-05-collection-scoping
plan: 01
subsystem: api
tags: [multi-tenant, org-scoping, firestore, mcp, templates, firebase]

requires:
  - phase: v11-02-mcp-org-scoping
    provides: orgFrom/rowOrg caller-org seam + MCP read/write tenant wall + create-stamp pattern
  - phase: v11-01-tenant-foundation
    provides: backfillOrgId helper + TENANT_COLLECTIONS + orgs registry
provides:
  - setlistTemplates collection org-scoped (list filter + not-found walls + create-stamp)
  - templates (liturgical override) collection org-namespaced by doc-id (CRC bare-key)
  - setlistTemplates added to the orgId backfill (TS lib + prod runner)
  - reusable client namespacing primitives: keyFor + selectOrgOverrides
affects: [v11-05-02-roster, v11-05-03-congregation, v11-06-isolation-audit]

tech-stack:
  added: []
  patterns:
    - "Cross-tenant access = SAME resource not-found error (never cross_tenant_denied) — no existence leak"
    - "Client collections keyed by liturgical/shared doc-id are isolated via ${org}__${key} namespacing with the default org (crc) on the BARE key — zero migration / no CRC lockout"

key-files:
  created:
    - src/lib/mcp/__tests__/mcp-templates-org.emulator.test.ts
    - src/lib/template-firebase.test.ts
  modified:
    - src/lib/mcp/tools/templates.ts
    - src/lib/mcp/tools/index.ts
    - src/lib/template-firebase.ts
    - src/app/(main)/manage/templates/TemplateEditor.tsx
    - src/lib/org/backfill-orgid.ts
    - scripts/backfill-orgid-v11.mjs

key-decisions:
  - "templates (liturgical) isolated by doc-id namespacing, NOT an orgId+filter — doc-ids ARE liturgical keys so two orgs would collide; CRC keeps bare key = no migration"
  - "createTemplateFromSetlist also walls the SOURCE setlist read (cross-tenant setlist→template exfiltration vector), not just the template write"

patterns-established:
  - "keyFor(org,key) + selectOrgOverrides(org,docs): pure, unit-testable tenant doc-id namespacing for client collections"

duration: ~75min
started: 2026-06-09
completed: 2026-06-09
---

# Phase v11-05 Plan 01: Templates org-scoping Summary

**Both template collections are now tenant-isolated: `setlistTemplates` (MCP) via an org list-filter + not-found walls on get/update/delete/clone-from-template + caller-org create-stamp, and the client `templates` liturgical overrides via per-org doc-id namespacing (CRC keeps the bare key → zero migration). CRC behavior unchanged.**

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: setlistTemplates list is org-scoped | Pass | emulator: CRC list excludes BL template and vice-versa |
| AC-2: cross-tenant get/update/delete/clone → not-found wall, no mutation | Pass | emulator: `template_not_found` (get/update/clone) + idempotent `deleted:false` (delete); BL doc unmodified after a CRC update attempt |
| AC-3: create stamps caller org | Pass | emulator: `createTemplate`/`createTemplateFromSetlist` doc.orgId == caller org |
| AC-4: client `templates` overrides isolated, CRC unmigrated | Pass | unit (keyFor + selectOrgOverrides 6/6): CRC bare-key, BL `${org}__key`, no cross-surfacing |
| AC-5: backfill safe + idempotent | Pass | existing backfill emulator suite now iterates `setlistTemplates`: dry-run writes nothing, apply stamps, re-run no-op |

Bonus: `create_template_from_setlist` source-setlist cross-tenant wall proven (`setlist_not_found`).

## Verification Results

- `npx tsc --noEmit` → exit 0
- `npx eslint` (7 changed/new files) → exit 0
- `npx vitest run` (full) → **3310 passed / 0 failed** (78 skipped)
- `mcp-templates-org.emulator.test.ts` → 7/7
- `backfill-orgid.emulator.test.ts` (regression after TENANT_COLLECTIONS change) → 5/5
- `template-firebase.test.ts` → 6/6

## Accomplishments

- Threaded caller org (`orgFrom(extra)`) into the 6 MCP template handlers + dispatcher (clone already had it).
- Added the not-found wall to get/update/delete/clone-from-template via `rowOrg(doc.orgId) !== callerOrg`, returning the SAME existing error (no `cross_tenant_denied` leak).
- Closed the template READ-scoping deferral explicitly flagged in `cloneSetlistFromTemplate` by v11-02-03.
- Walled the `create_template_from_setlist` source-setlist read (a cross-tenant setlist could otherwise be template-ified into the caller's org).
- Org-namespaced the client `templates` liturgical-override collection with CRC on the bare key (no migration); extracted `keyFor` + `selectOrgOverrides` as pure unit-testable primitives.
- Extended the orgId backfill (TS `TENANT_COLLECTIONS` + prod `backfill-orgid-v11.mjs`) to cover `setlistTemplates`.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/lib/mcp/tools/templates.ts` | Modified | org param + list filter + not-found walls + create-stamp on 6 handlers |
| `src/lib/mcp/tools/index.ts` | Modified | thread `orgFrom(extra)` into 5 template dispatch calls |
| `src/lib/template-firebase.ts` | Modified | `keyFor`/`selectOrgOverrides`; org-threaded get/save/delete/sync + org-filtered `useCustomTemplates` |
| `src/app/(main)/manage/templates/TemplateEditor.tsx` | Modified | `useOrg()` → save/delete custom template |
| `src/lib/org/backfill-orgid.ts` | Modified | `+setlistTemplates` in TENANT_COLLECTIONS |
| `scripts/backfill-orgid-v11.mjs` | Modified | `+setlistTemplates` (lockstep) |
| `src/lib/mcp/__tests__/mcp-templates-org.emulator.test.ts` | Created | 7 emulator isolation tests |
| `src/lib/template-firebase.test.ts` | Created | 6 unit tests (keyFor + selectOrgOverrides) |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| `templates` isolated by doc-id namespacing (not orgId filter) | Doc-ids ARE liturgical keys (shabbat_morning) — two orgs collide; can't filter a getDoc-by-key | CRC bare-key = zero migration; future client collections keyed by shared ids should follow the keyFor pattern |
| Wall the source setlist in create_template_from_setlist | Cross-tenant setlist→template was an exfiltration path beyond the template write itself | v11-06 audit should treat "read-join" tools as cross-tenant surfaces |

## Deviations from Plan

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | Essential — source-setlist wall (within templates scope) |
| Scope additions | 0 | — |
| Deferred | 0 | — |

**1. Source-setlist read wall in `create_template_from_setlist`** — the plan named the template not-found wall; while threading org I confirmed the handler also reads a `setlists/{id}` doc cross-tenant, so I added a `setlist_not_found` wall there too. In-scope (templates slice; closes a real cross-tenant read).

## Issues Encountered

None.

## Next Phase Readiness

**Ready:**
- Pattern proven for the remaining v11-05 slices (02 roster, 03 congregation): orgFrom + not-found wall + backfill extension; keyFor for any shared-key client collection.

**Concerns:**
- The prod `setlistTemplates` backfill (`node scripts/backfill-orgid-v11.mjs --apply`) has NOT been run yet — 3 prod templates (Randy Shabbat / B'nai Mitzvah / Shir Shabbat per [[feedback_mcp_template_management]]) currently lack orgId and would vanish from CRC's `list_templates` once this deploys. **Run the dry-run, inspect, then --apply BEFORE or immediately with the deploy** (carried as the phase deploy/backfill task). v11-05-02 (roster) involves the large `users` collection + multi-org membership on the auth claim, not the user doc — needs a filter-source decision.

**Blockers:** None.

---
*Phase: v11-05-collection-scoping, Plan: 01*
*Completed: 2026-06-09*
