---
phase: v11-05-collection-scoping
plan: 03
subsystem: api
tags: [multi-tenant, org-scoping, scheduling, assignments, firestore, mcp, roster]

requires:
  - phase: v11-02-mcp-org-scoping
    provides: orgFrom caller-org seam (MCP) + coerceOrgId host→org seam (web)
  - phase: v11-05-collection-scoping
    provides: v11-05-02 in-memory-filter pattern + rowOrgIds/rowOrg membership helpers
provides:
  - scheduling_assignments org-scoped READ + WRITE — org denormalized from the parent setlist
  - orgId stamped on assignment create (single create path: assignMusiciansService — HTTP + MCP)
  - single-org rowOrg(raw) helper (client-safe) in src/lib/org/membership.ts
  - cross-tenant assignment reads filtered in-memory (client subscription + 3 web routes + 4 MCP tools)
  - backfill-assignment-orgids.mjs (setlist-join; covers scheduling_assignments + scheduling_history)
affects: [v11-05-04-congregation, v11-05-05-creationwizard-vocab, v11-06-isolation-audit]

tech-stack:
  added: []
  patterns:
    - "Assignment org = SINGLE orgId denormalized from the parent setlist (rowOrg), NOT the orgIds[] membership array used for users — an assignment belongs to exactly one setlist = one org"
    - "Stamp-at-create from the in-tx setlist snapshot (transactionally consistent with the musicians[] rebuild); legacy rows read crc-default via rowOrg → backfill is a SOFT gate"
    - "Org-scope at the SETLIST seam for eventDate→setlists tools (list_musicians_on_date, list_service_personnel): dropping cross-tenant setlists walls their assignments too"

key-files:
  created:
    - scripts/backfill-assignment-orgids.mjs
  modified:
    - src/types/models.ts
    - src/lib/org/membership.ts
    - src/lib/scheduling/assignment-service.ts
    - src/lib/scheduling-firebase.ts
    - src/app/api/scheduling/suggest-band/route.ts
    - src/app/api/scheduling/history/route.ts
    - src/app/api/scheduling/remind/route.ts
    - src/lib/mcp/tools/roster.ts
    - src/lib/mcp/tools/service-personnel.ts
    - src/lib/mcp/tools/index.ts
    - src/hooks/use-calendar-data.ts
    - src/app/(main)/schedule/page.tsx
    - src/lib/__tests__/scheduling-firebase.test.ts
    - src/hooks/__tests__/use-calendar-data.test.ts
    - src/lib/mcp/__tests__/mcp-roster.emulator.test.ts

key-decisions:
  - "Single orgId via rowOrg (not orgIds[]) — assignment = one setlist = one org"
  - "Org denormalized at create from the in-tx setlist snapshot; in-memory crc-default filter on reads → SOFT backfill gate (CRC-safe un-run)"
  - "Scope the eventDate→setlists tools at the setlist seam so assignments inherit the wall"

patterns-established:
  - "rowOrg(raw): single-org doc normalizer (parallel to rowOrgIds) — missing → 'crc'; client-safe"

duration: ~75min
started: 2026-06-09
completed: 2026-06-09
---

# Phase v11-05 Plan 03: scheduling_assignments org-scoping Summary

**`scheduling_assignments` is now tenant-scoped READ + WRITE: each assignment carries a single `orgId` denormalized from its parent setlist (stamped at create in the one `assignMusiciansService` path that both HTTP `/assign` and MCP `assign_musician` delegate to), and every genuinely cross-tenant caller-facing read — the band-leader "all upcoming" client subscription, the suggest-band / history / remind web routes, and the `list_pending_assignments` / `list_musicians_on_date` / `suggest_band` / `list_service_personnel` MCP tools — filters in-memory via `rowOrg(doc.orgId)` (missing → 'crc'), so CRC is byte-identical with zero backfill.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~75 min |
| Tasks | 3 completed (all PASS) |
| Files modified | 14 modified + 1 created |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: assignment carries setlist's org at create | Pass | emulator: BL setlist → orgId='brotherslazaroff'; unstamped setlist → 'crc' |
| AC-2: cross-tenant reads org-scoped | Pass | emulator: listPendingAssignments + list_musicians_on_date exclude the other org; client-filter unit case; CRC byte-identical via crc-default (route tests unchanged) |
| AC-3: inherit/intentional reads unchanged | Pass | suggest(setlistId), calendar-feed(uid), suggestMusicians(setlistId), new-song-detector(uid), cron(all-tenant) untouched; full suite green |
| AC-4: backfill dry-run-first, idempotent, CRC-safe, reversible | Pass (script) | node-check clean; mirrors proven backfill-user-orgids; SOFT gate (crc-default); rollback documented; prod dry-run = phase-close |

## Verification Results

- `npx tsc --noEmit` → 0
- `npx eslint` (changed files) → 0
- `npx vitest run` (full) → **3312 passed / 0 failed** (78 skipped)
- `mcp-roster.emulator.test.ts` (incl. 4 new org cases) → **50/50**
- `node --check scripts/backfill-assignment-orgids.mjs` → clean

## Accomplishments

- Stamped `orgId` on assignment create from the in-transaction setlist snapshot — one edit covers BOTH the HTTP `/api/scheduling/assign` route and the MCP `assign_musician` tool (both delegate to `assignMusiciansService`).
- Added the client-safe single-org `rowOrg` helper to membership.ts (parallel to `rowOrgIds`).
- Org-scoped 8 cross-tenant caller-facing read sites in-memory (crc-default): client `subscribeToAllUpcomingAssignments`; web `suggest-band` (play-count + window), `history` (assignments analytics + `scheduling_history`), `remind`; MCP `listPendingAssignments`, `listMusiciansOnDate`, `suggestBand`, `listServicePersonnel`.
- Wrote `backfill-assignment-orgids.mjs` (setlist-join, dry-run-first, idempotent, covers `scheduling_assignments` + `scheduling_history`).
- Added 4 emulator org cases + 1 client-filter unit case; updated the use-calendar-data + scheduling-firebase fixtures for the new `(org, cb)` signature + `useOrg` dependency.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/types/models.ts` | Modified | `SchedulingAssignment.orgId?` |
| `src/lib/org/membership.ts` | Modified | `rowOrg` single-org helper (client-safe) |
| `src/lib/scheduling/assignment-service.ts` | Modified | stamp orgId in-tx from the setlist |
| `src/lib/scheduling-firebase.ts` | Modified | `subscribeToAllUpcomingAssignments(org, cb)` + in-memory filter |
| `src/app/api/scheduling/suggest-band/route.ts` | Modified | scope play-count/window to host org |
| `src/app/api/scheduling/history/route.ts` | Modified | scope assignments analytics + scheduling_history to host org |
| `src/app/api/scheduling/remind/route.ts` | Modified | scope pending to host org (both branches) |
| `src/lib/mcp/tools/roster.ts` | Modified | org param + filter on listPending/list_musicians_on_date/suggestBand |
| `src/lib/mcp/tools/service-personnel.ts` | Modified | wall both setlist-resolution paths by org |
| `src/lib/mcp/tools/index.ts` | Modified | thread `orgFrom(extra)` into 3 dispatch sites |
| `src/hooks/use-calendar-data.ts` | Modified | thread `useOrg()` into the planning subscription |
| `src/app/(main)/schedule/page.tsx` | Modified | thread `useOrg()` into the assignments subscription |
| `src/lib/__tests__/scheduling-firebase.test.ts` | Modified | fixture update + client org-filter case |
| `src/hooks/__tests__/use-calendar-data.test.ts` | Modified | `(org, cb)` mock + useOrg mock |
| `src/lib/mcp/__tests__/mcp-roster.emulator.test.ts` | Modified | seed orgId + 4 org-scoping cases |
| `scripts/backfill-assignment-orgids.mjs` | Created | phase-close: stamp legacy assignments/history orgId from the setlist |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Single `orgId` (rowOrg), not orgIds[] | An assignment belongs to one setlist = one org | simpler equality scope; mirrors setlist/track precedent |
| Stamp-at-create from in-tx setlist + in-memory crc-default reads | transactionally consistent; CRC-safe with no backfill / no composite index | backfill is SOFT (data-hygiene), not a hard gate |
| Scope eventDate→setlists tools at the setlist seam | dropping cross-tenant setlists walls their assignments too | one filter point per tool |

## Deviations from Plan

| Type | Count | Impact |
|------|-------|--------|
| Scope addition (audit-defensive) | 2 | strictly safer; no CRC change |

**1. `remind` route scoped BOTH branches.** The plan scoped only the no-`setlistId` "remind all" branch; I also filter the `setlistId` branch by org so a cross-org `setlistId` can't trigger another tenant's reminders. No-op for the correct-org case (the query is already setlist-keyed); closes an enumeration vector ahead of the v11-06 audit.

**2. `list_service_personnel` walls the `setlistId` path too.** The plan called for scoping the eventDate→setlists resolution; I also made `fetchSetlistById` return not-found for a cross-org setlist (mirrors v11-02's get_setlist not-found wall). Closes the same enumeration vector.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Signature change broke `scheduling-firebase.test.ts` (3 calls) + `use-calendar-data.test.ts` mock (old `(cb)` shape, no useOrg mock) | Updated fixtures for the new `(org, cb)` signature + added a `useOrg` mock — the documented "shared-signature change breaks pre-existing fixtures" gotcha |

## Next Phase Readiness

**Ready:** `rowOrg` single-org helper + the stamp-at-create + setlist-seam scoping patterns carry into v11-05-04 (congregation singleton) and v11-06 (isolation audit; reusable probe at `scripts/e2e-bl-tenant-probe.mjs`).

**Concerns / coverage note:** the web routes (suggest-band/history/remind) are scoped via the same `rowOrg` helper that IS emulator-tested, but their BL-vs-CRC branch is not individually emulator-cased (their existing unit tests pass under the crc-default, confirming no regression). The `config/congregation` reads in suggestBand/suggest-band remain cross-tenant by design → v11-05-04.

**Phase-close (batched, SOFT):** `node scripts/backfill-assignment-orgids.mjs` dry-run → inspect per-org counts → `--apply` (stamps legacy scheduling_assignments + scheduling_history). CRC-safe un-run.

**Blockers:** None.

---
*Phase: v11-05-collection-scoping, Plan: 03*
*Completed: 2026-06-09*
