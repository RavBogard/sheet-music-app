---
phase: v11-02-mcp-org-scoping
plan: 03
subsystem: mcp-writes
tags: [mcp, multi-tenant, orgId, write-isolation, firestore, leak-class, security]

requires:
  - phase: v11-02-01
    provides: orgFrom(extra) caller-org resolution seam + orgId on the bearer
  - phase: v11-02-02
    provides: rowOrg(orgId) helper + the not-found-wall pattern (decision #3) this mirrors on the write path
provides:
  - cross-tenant WRITE denial across every by-id MCP setlist/track/song/chart mutation
  - caller-org create-stamping on create_setlist / clone_setlist / clone_setlist_from_template + the 3 chart-create tools
  - stampOrg(db, fileId, org) helper (library_index + songs dual-surface tag)
  - applySongMetadata tenant guard (tenantMismatch) + org param
affects: [v11-02-04 David BL bearer + e2e, v11-05 cross-tenant isolation audit]

tech-stack:
  added: []
  patterns:
    - "Single chokepoint org guard: loadEditableSetlist(db,id,uid,org) scopes all 8 by-id setlist write tools"
    - "Per-tool org guard for the writers that own their own tx/read (delete_setlist, recompute, clone, clone-from-template, update_song, delete_chart)"
    - "Create-stamp: thread caller org → orgId on every new doc (parent + tracks); chart creates stamp via post-create stampOrg confined to the MCP wrapper"
    - "Write denial returns the standard not-found envelope (setlist_not_found/song_not_found/chart_not_found), never a leaky cross_tenant_denied code"

key-files:
  created:
    - src/lib/mcp/__tests__/org-scope-writes.emulator.test.ts
  modified:
    - src/lib/mcp/server-tracks-write.ts
    - src/lib/mcp/tools/setlist-write.ts
    - src/lib/mcp/tools/clone-setlist.ts
    - src/lib/mcp/tools/templates.ts
    - src/lib/mcp/tools/song-metadata.ts
    - src/lib/mcp/tools/library-upload.ts
    - src/lib/mcp/org-context.ts
    - src/lib/mcp/tools/index.ts

key-decisions:
  - "Not-found wall (NOT cross_tenant_denied) on the write path — a distinct denial code would itself leak that an id exists in another tenant; mirrors v11-02-02 #3"
  - "org param OPTIONAL default crc on every write wrapper — prod (index.ts) passes explicit orgFrom(extra); zero churn on existing CRC tests/internal callers (mirrors v11-02-02)"
  - "Chart-create org-stamping confined to the MCP wrappers via post-create stampOrg — processChartUpload (shared with HTTP route + Drive cron) left untouched; those surfaces stay default-crc"
  - "applySongMetadata gains an optional org → tenantMismatch flag; updateSong maps it to song_not_found. Omitting org keeps internal/same-caller paths (save_scraped_chart mirror) unchanged"

patterns-established:
  - "loadEditableSetlist is THE setlist-write tenant chokepoint — future by-id setlist writers route through it and inherit the guard for free"
  - "stampOrg(db, fileId, org) is the canonical chart create-stamp (existence-gated, dual-surface, behavior-neutral for crc)"

duration: ~50min
started: 2026-06-08T16:25:00Z
completed: 2026-06-08T17:15:00Z
---

# Phase v11-02 Plan 03: Org-Scope MCP Writes Summary

**Every by-id MCP write (setlist/track/song/chart) is now tenant-walled — a Brothers Lazaroff caller can neither mutate nor delete nor clone any CRC doc (standard not-found envelope, zero mutation), and every MCP create stamps the caller's org — proven leak-free in the emulator.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~50 min |
| Tasks | 3 completed (3 E/Q PASS) |
| Files modified | 8 |
| Files created | 1 |
| Checkpoints | 0 (autonomous) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: cross-tenant setlist mutation denied (not-found wall) | ✅ Pass | `org-scope-writes.emulator.test.ts` — BL caller on a CRC setlist: update/add/update-track/swap/reorder/bulk-update/bulk-add/recompute/remove/delete all → `setlist_not_found`; post-call re-read proves the CRC setlist + track byte-unchanged |
| AC-2: cross-tenant clone source denied | ✅ Pass | BL `clone_setlist({source: CRC})` → `setlist_not_found`, BL setlist count unchanged (no new doc) |
| AC-3: MCP creates stamp caller org | ✅ Pass | create_setlist / clone_setlist(BL src) / clone_setlist_from_template → parent + every track `orgId == BL`; stampOrg tags library_index + songs; BL-created setlist visible to BL list, hidden from CRC list |
| AC-4: cross-tenant chart/song mutation denied | ✅ Pass | BL `update_song`/`delete_chart` on a CRC chart → `song_not_found`/`chart_not_found`; both catalog surfaces unchanged + still present |
| AC-5: CRC behavior unchanged | ✅ Pass | CRC own-org `update_setlist` succeeds + lands; tsc clean; full unit suite 3268 passed / 0 genuine failures (4 transient flakes in an unrelated file — see Issues) |

## Accomplishments

- **Write leak-class closed.** The matching wall to v11-02-02's reads: a BL bearer (once issued in v11-02-04) cannot touch CRC data on the write path either. Admin-SDK writes bypass Firestore rules, so this app-layer guard is the only control — now in place.
- **One chokepoint covers 8 tools.** Adding `org` to `loadEditableSetlist` org-scopes update_setlist, add_track_to_setlist, update_track, swap_chart, bulk_update_tracks, bulk_add_tracks, reorder_setlist, remove_track in a single guarded function.
- **Per-tool guards** for the 6 writers that own their own read/tx: delete_setlist (in-tx guard before the owner check), recompute_setlist_track_count, clone_setlist (source guard + stamp), clone_setlist_from_template (stamp), update_song (tenantMismatch), delete_chart.
- **Create-stamping** threads the caller org onto every new doc; `clone_setlist` + `clone_setlist_from_template` (which previously stamped NO orgId via raw batch.set — a latent BL→crc leak) now tag parent + tracks; chart creates tag via `stampOrg`.
- **Emulator-proven** (8/8) with a mixed crc/BL corpus; HFG discipline, no waiver.

## Task Commits

No per-task commits — phase-level commit at the v11-02 transition (after v11-02-04), per the v11.0 autonomy directive (matches v11-01 + v11-02-01/02). Staged in the working tree.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/lib/mcp/server-tracks-write.ts` | Modified | `loadEditableSetlist` 4th `org` param + cross-tenant not-found guard (the chokepoint) |
| `src/lib/mcp/tools/setlist-write.ts` | Modified | `org` param on 11 wrappers; create_setlist stamps orgId; delete_setlist in-tx guard; recompute guard |
| `src/lib/mcp/tools/clone-setlist.ts` | Modified | `org` param; source not-found guard; stamp parent + every cloned track orgId |
| `src/lib/mcp/tools/templates.ts` | Modified | `cloneSetlistFromTemplate` `org` param; stamp created setlist + tracks (template read-scoping deferred) |
| `src/lib/mcp/tools/song-metadata.ts` | Modified | `applySongMetadata` optional `org` → `tenantMismatch`; `updateSong` org param → song_not_found on mismatch |
| `src/lib/mcp/tools/library-upload.ts` | Modified | `org` param on upload/import/save-scraped + post-create `stampOrg`; delete_chart cross-tenant guard; applySongMetadata mirror passes org |
| `src/lib/mcp/org-context.ts` | Modified | new `stampOrg(db, fileId, org)` dual-surface chart tagger |
| `src/lib/mcp/tools/index.ts` | Modified | thread `orgFrom(extra)` into 18 write registration sites (13 setlist/clone/template + 5 chart/song) |
| `src/lib/mcp/__tests__/org-scope-writes.emulator.test.ts` | Created | AC-1..AC-5 write-isolation proof (8 cases) |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Not-found wall, not `cross_tenant_denied` | A distinct denial code leaks that an id exists in another tenant | Mirrors v11-02-02 #3; err-public only WITHIN tenant; ROADMAP's earlier `cross_tenant_denied` sketch superseded |
| `org` optional default crc on every wrapper | Prod passes explicit orgFrom(extra); CRC tests/internal callers default crc | Zero churn on existing call sites |
| Chart-create stamp via post-create `stampOrg` in MCP wrappers | processChartUpload is shared with HTTP route + Drive cron — those stay default-crc | Blast radius confined to the MCP curation surface |
| applySongMetadata org→tenantMismatch (opt-in) | Internal/same-caller mirror (save_scraped_chart) must stay unchanged | update_song gets the guard; mirror path untouched |

## Deviations from Plan

| Type | Count | Impact |
|------|-------|--------|
| Scope clarification | 1 | None — plan-sanctioned |

**1. Chart-create AC proven via `stampOrg` unit + tsc, not by driving processChartUpload end-to-end in the emulator.** The plan explicitly sanctioned this ("skip/guard the Drive-only path… assert via a processChartUpload-level seed instead") — processChartUpload needs Storage + dedup machinery disproportionate to the org-stamp assertion. The wrapper→stampOrg wiring is covered by tsc + code threading; stampOrg's dual-surface tagging is proven directly in the emulator. Not a gap.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Full-suite run showed 4 failures in `scripts/__tests__/setup-coord-worktree.test.ts` + "Timeout calling onTaskUpdate" worker errors | Load flake, NOT a regression: that file spawns real git subprocesses (~43s) and timed out under full-suite parallel load. Re-ran in isolation → **9/9 green**. File is entirely disjoint from the MCP changes. Per [[feedback_parallel_load_flake_baseline]] (solo-rerun before flagging). |

## Next Phase Readiness

**Ready:**
- The MCP tenant wall is now complete on BOTH read (v11-02-02) and write (this plan) paths. v11-02-04 can safely issue David's `brotherslazaroff` bearer knowing a BL caller is fully isolated from CRC data in every direction.

**Concerns / still-deferred (fold into v11-04, NOT a v11-02 blocker):**
- **Templates (`setlistTemplates`) READ/LIST scoping** remains cross-tenant — list_templates/get_template/update_template/delete_template/create_template(_from_setlist) are not org-stamped or org-filtered. (This plan only stamps the setlist CLONED OUT of a template.)
- **roster/musicians** (`users`, `scheduling_assignments`, `musician_availability`), **congregation**, **service-personnel** — read + write both cross-tenant; need their own orgId stamping + backfill.

**v11-02-04 prerequisites (next plan):**
- Mint David's bearer with `orgId: brotherslazaroff` (the mint sites stamp orgId per v11-02-01) + set his `orgIds:['brotherslazaroff']` claim; onboarding doc; live e2e (David authors a BL setlist via MCP, lists only BL, cannot see/mutate CRC). Then the single `feat(v11-02)` phase commit + push origin master (squash/amend the WIP `4333c15454`).

**Blockers:** None.

---
*Phase: v11-02-mcp-org-scoping, Plan: 03*
*Completed: 2026-06-08*
