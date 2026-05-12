---
phase: v60-06-dashboard-reader-migration
plan: 01
subsystem: ui-dashboard
tags: [dashboard, trackCount, denormalization, count-display]

requires:
  - phase: v54-01-03
    provides: trackCount reconciler on SetlistGridHydrator that maintains `setlist.trackCount` on every track-count change
provides:
  - HeroCard dashboard count migrated to read denormalized trackCount with embedded-array fallback
  - CompactSetlistRow dashboard count migrated to same pattern
affects:
  - v60-06-02..N (remaining dashboard surfaces — different patterns: filtered counts, full-list iterations, queue construction)

tech-stack:
  added: []
  patterns:
    - "Dashboard count display reads denormalized parent-doc field (setlist.trackCount) with embedded-array fallback for legacy setlists"

key-files:
  created: []
  modified:
    - src/components/dashboard/HeroCard.tsx
    - src/components/dashboard/CompactSetlistRow.tsx

key-decisions:
  - "Use setlist.trackCount with fallback chain instead of introducing a denormalized songCount field. trackCount is total-count (not filtered); HeroCard + CompactSetlistRow both show total. Filtered-count surfaces (NextServiceCard, PublicSetlistListing) belong in a different plan with different solution."
  - "Embedded-array fallback `setlist.tracks?.length || 0` preserved for legacy setlists pre-v54-01-03 reconciler. v60-08 cleanup will drop the fallback after v60-06-N backfills every setlist."
  - "No denormalized songCount introduction — would be over-engineering per CARL global rule 8 (Avoid over-engineering)"

patterns-established:
  - "Dashboard count migration pattern: `setlist.trackCount ?? (setlist.tracks?.length || 0)` — denormalized read with safe fallback"

duration: ~10min
started: 2026-05-12T18:20:00-05:00
completed: 2026-05-12T18:30:00-05:00
---

# Phase v60-06 Plan 01: Dashboard count migrations (HeroCard + CompactSetlistRow)

**Migrated the 2 dashboard surfaces that show total track counts to read `setlist.trackCount` (maintained by the v54-01-03 reconciler) with embedded-array fallback. Net +3 LOC. Smallest-fix entry into v60-06; remaining dashboard surfaces (filtered counts, full-list iterations, queue construction, hooks, matrix route, backfill) follow as separate plans.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~10 min |
| Tasks | 3 of 3 completed (all PASS) |
| Files modified | 2 |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: HeroCard reads trackCount with fallback | ✅ Pass | Single-expression swap at line 95 |
| AC-2: CompactSetlistRow reads trackCount with fallback | ✅ Pass | Single-expression swap at line 46 |
| AC-3: Type compatibility preserved | ✅ Pass | tsc exit 0; Setlist type already includes trackCount |
| AC-4: Net production LOC ≤+10 | ✅ Pass | Net +3 (5 added / 2 removed) |
| AC-5: tsc + build + suites baseline | ✅ Pass | tsc / next build / vitest 1581/52 / emulator green / HFG 0/3 |
| AC-6: No visual regression | ⏳ Deferred to PENDING-UAT | Daniel iPad browser-smoke |

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/components/dashboard/HeroCard.tsx` | Modified (+3 / -1) | Read denormalized trackCount with embedded-array fallback |
| `src/components/dashboard/CompactSetlistRow.tsx` | Modified (+2 / -1) | Same pattern |

## Deviations from Plan

None. Plan executed exactly as written.

## Next Phase Readiness

**Ready (separate plans within v60-06):**
- v60-06-02 — Filtered-count surfaces (NextServiceCard, PublicSetlistListing) — different pattern; song-typed filter requires either accepting embedded staleness, denormalizing songCount, or iterating via helper.
- v60-06-03 — Full-list iterations (UpcomingTimeline, PrepRecommendations, SetlistCards, use-upcoming-prep) — these need actual track list, not just count.
- v60-06-04 — SetlistDrawer queue construction (perf-view navigation) — sensitive surface; needs current data.
- v60-06-05 — TemplatesSection.tsx admin template conversion.
- v60-06-06 — matrix/route.ts server-side reader (deferred from v60-05).
- v60-06-07 — 15-setlist backfill script + migration_snapshots/{setlistId} rollback collection.
- v60-06-08 — use-add-to-setlist.ts is WRITER path; defers to v60-07 strip.

**Concerns:**
- For legacy setlists never edit-opened since v54-01-03 shipped, `trackCount` may be undefined or zero. Fallback chain handles this.

**Blockers:**
- None.

---
*Phase: v60-06-dashboard-reader-migration, Plan: 01*
*Completed: 2026-05-12*
