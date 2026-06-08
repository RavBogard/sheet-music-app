---
phase: v11-02-mcp-org-scoping
plan: 02
subsystem: mcp-reads
tags: [mcp, multi-tenant, orgId, read-isolation, firestore, leak-class]

requires:
  - phase: v11-02-01
    provides: orgFrom(extra) resolution seam + rowOrg helper + orgId on the bearer
provides:
  - tenant-scoped MCP reads across the 5 stamped collections (6 read tools)
  - SongRecord.orgId surfaced through getAllSongs/getSongById
  - rowOrg(orgId) comparison helper
  - cross-tenant get-by-id not-found wall (get_setlist / get_song)
affects: [v11-02-03 write stamping + cross-tenant write denial, v11-02-04 David e2e]

tech-stack:
  added: []
  patterns:
    - "Two read-scope patterns: list/search → filter to callerOrg; get-by-id → verify-or-not-found"
    - "In-memory orgId filter (no composite-index churn; admin-SDK reads bypass rules so app-layer is the control)"
    - "org param optional, defaults DEFAULT_ORG_ID — prod passes explicit orgFrom(extra), tests/internal default crc"

key-files:
  created:
    - src/lib/mcp/__tests__/org-scope-reads.emulator.test.ts
  modified:
    - src/lib/mcp/server-songs.ts
    - src/lib/mcp/org-context.ts
    - src/lib/mcp/tools/setlists.ts
    - src/lib/mcp/tools/library.ts
    - src/lib/mcp/tools/chart-text-search.ts
    - src/lib/mcp/tools/index.ts
    - src/lib/mcp/tools/bond-corrections.ts

key-decisions:
  - "In-memory filter over query-level .where (avoids new composite indexes; catalog is small; rules don't backstop admin-SDK reads anyway)"
  - "org param OPTIONAL default crc — prod always passes orgFrom(extra); keeps CRC-data tests unchanged; mirrors milestone default-crc philosophy"
  - "get-by-id mismatch → not-found (null), never 403 — don't leak cross-tenant existence"
  - "bond-corrections alternatives scoped to the SETLIST's org (not the caller's) — alternatives must match the setlist's tenant"

patterns-established:
  - "rowOrg(orgId) = orgId || DEFAULT_ORG_ID for tenant comparison"
  - "chordData collectionGroup matches dropped by resolving the parent library_index orgId in the existing title-batch fetch"

duration: ~35min
started: 2026-06-08T21:18:00Z
completed: 2026-06-08T21:30:00Z
---

# Phase v11-02 Plan 02: Org-Scope MCP Reads Summary

**Every MCP read over the 5 stamped collections is now tenant-isolated — a caller sees only their own org's setlists/library/songs; cross-tenant get-by-id is a not-found wall — proven leak-free in the emulator.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~35 min |
| Tasks | 3 completed (3 PASS) |
| Files modified | 7 |
| Files created | 1 |
| Checkpoints | 0 (autonomous) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: CRC bearer reads only CRC (6 tools) | ✅ Pass | `org-scope-reads.emulator.test.ts` 7/7 — list_setlists/search_library/list_library/search_chart_text(metadata+chords) all return only crc rows |
| AC-2: BL bearer reads only BL | ✅ Pass | Same test — BL caller returns only BL rows, zero crc leak |
| AC-3: get-by-id cross-tenant wall | ✅ Pass | get_setlist/get_song → null for the other org's id; own-org reads unchanged |
| AC-4: behavior-neutral for CRC | ✅ Pass | Full unit suite 3272 passed / 0 failed (baseline held) |

## Accomplishments

- **Leak-class core closed:** all 6 read tools (list_setlists, get_setlist, search_library, get_song, list_library, search_chart_text) scope to the caller's tenant. The two patterns — list/search filter, get-by-id verify-or-not-found — cover every read path over the stamped collections.
- **chordData cross-tenant drop:** search_chart_text's chords scope resolves each match's parent `library_index` orgId (reusing the existing title-batch fetch) and drops cross-tenant parents.
- **Shared helper surfaced orgId additively** (SongRecord.orgId) without changing behavior for app/print callers.
- **Internal caller scoped:** bond-corrections' alternatives search is bound to the reviewed setlist's tenant.
- **Emulator-proven isolation** (7/7) with a real mixed crc/BL corpus — HFG discipline, no clause-(b) waiver.

## Task Commits

No per-task commits — phase-level commit at the v11-02 transition (after v11-02-04), per the v11.0 autonomy directive (matches v11-01). Staged in the working tree.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/lib/mcp/server-songs.ts` | Modified | `SongRecord.orgId` + populate in `toSongRecord` (additive) |
| `src/lib/mcp/org-context.ts` | Modified | `rowOrg(orgId)` comparison helper |
| `src/lib/mcp/tools/setlists.ts` | Modified | listSetlists org filter + getSetlist not-found wall (org param, default crc) |
| `src/lib/mcp/tools/library.ts` | Modified | searchLibrary/listLibrary org filter + getSong not-found wall |
| `src/lib/mcp/tools/chart-text-search.ts` | Modified | metadata scan org filter + chords parent-org drop |
| `src/lib/mcp/tools/index.ts` | Modified | import orgFrom locally + 6 read call sites pass `orgFrom(extra)` |
| `src/lib/mcp/tools/bond-corrections.ts` | Modified | thread setlist's org into the internal searchLibrary call |
| `src/lib/mcp/__tests__/org-scope-reads.emulator.test.ts` | Created | AC-1/2/3 isolation proof (7 cases) |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| In-memory filter, not query `.where("orgId",...)` | No composite-index churn; catalog small; admin-SDK reads bypass rules so app filter IS the control | Index-free; v11-02-03 writes follow the same app-layer approach |
| `org` param OPTIONAL (default crc) | Prod (index.ts) always passes orgFrom(extra); CRC-data tests + internal callers default crc (correct); mirrors milestone default-crc | 0 churn on 136 existing test call sites |
| get-by-id mismatch → not-found | Don't leak cross-tenant doc existence | Hard wall, err-public only WITHIN tenant |
| bond-corrections scoped to setlist's org | Alternatives must match the setlist's tenant, not the caller's | Correct once BL data exists |

## Deviations from Plan

| Type | Count | Impact |
|------|-------|--------|
| Scope reduction | 1 | None — planned file needed no change |
| Design clarification | 1 | None — optional-default baked per milestone philosophy |
| Scope addition (correctness) | 1 | Essential — 1 internal caller |

**1. `src/lib/server-setlists.ts` NOT modified (planned).** `serializeSetlist` spreads `...deepSerialize(data)`, so setlist rows already carry `orgId` — `getAllSetlists` needed no change. listSetlists filters on the already-present field.

**2. `org` made optional (default crc) rather than required.** The plan sketched a threaded org param; making it optional-default avoided editing 136 CRC-scoped test call sites (all of which correctly default to crc) and matches v11-01's default-crc contract. Production always passes the explicit caller org.

**3. bond-corrections.ts threaded (not in files_modified).** Its internal `searchLibrary` call is now scoped to the reviewed setlist's org — essential correctness so BL bond review never surfaces CRC alternatives.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Adding `org` param broke 137 call sites (136 tests + 1 prod) | Made `org` optional-default-crc; threaded explicit org in prod (index.ts ×6 + bond-corrections); tsc clean, suite green |
| getChartHealth probe fails (no Drive creds) under emulator | Fails soft → 'unreachable' → bindable → rows kept (existing not-punish-a-blip behavior); isolation assertions unaffected |

## Next Phase Readiness

**Ready:**
- orgFrom + rowOrg seam consumed; v11-02-03 (writes) uses the same to stamp creates + deny cross-tenant mutation.

**Concerns:**
- **MCP WRITES ARE STILL UNSCOPED.** update_setlist / add_track_to_setlist / update_track / delete_setlist / library-upload / song-metadata / clone resolve targets by id with NO org check — a BL caller could currently mutate a CRC doc via the admin SDK (rules don't backstop admin-SDK writes). v11-02-03 is the matching write-side wall and is security-critical.
- **Deferred (not org-stamped):** templates (setlistTemplates), roster/musicians, congregation, service-personnel reads remain cross-tenant — they need their own orgId stamping + backfill (out of v11-02 scope; flag for a follow-up or v11-04).

**Blockers:** None.

---
*Phase: v11-02-mcp-org-scoping, Plan: 02*
*Completed: 2026-06-08*
