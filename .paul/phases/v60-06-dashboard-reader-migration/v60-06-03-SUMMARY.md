---
phase: v60-06-dashboard-reader-migration
plan: 03
subsystem: ui-dashboard
tags: [denormalization, dexie, songCount, fileIds, filtered-counts, offline-cache, prep-tracking]

requires:
  - phase: v60-06-02
    provides: Setlist.songCount + Setlist.fileIds optional fields + SetlistGridHydrator reconciler producing both
  - phase: v60-06-01
    provides: dashboard read pattern (`setlist.{field} ?? embedded fallback`)
provides:
  - SetlistCards offline-cache check migrated to denormalized fileIds with embedded fallback
  - use-upcoming-prep cross-setlist fileIds collection migrated (drives Firestore songPreferences batch query)
  - use-upcoming-prep per-setlist enrichment migrated (`total` via songCount + viewed iteration via fileIds)
affects:
  - v60-06-04 (PrepRecommendations + UpcomingTimeline.ExpandedTrackList — title-aware readers; architectural decision pending: denormalize titles vs. bulk Dexie hook vs. per-render fetch)
  - v60-06-07 (15-setlist backfill) — same denormalized fields will be written by backfill script
  - v60-08 cleanup — drops embedded-array fallback from these readers when writer goes away

tech-stack:
  added: []
  patterns:
    - "Consumer-side read migration: single derivation `s.fileIds ?? embedded.filter().map()` shared between total-count (`s.songCount ?? derived.length`) and per-item iteration; avoids double-filter on legacy path"

key-files:
  created: []
  modified:
    - src/components/setlist/SetlistCards.tsx
    - src/hooks/use-upcoming-prep.ts

key-decisions:
  - "Single combined commit (v53-02/v60-01..05/06-01/06-02 precedent) — 2 files, +9 LOC, tightly coupled to the v60-06-02 reconciler producer"
  - "Per-setlist derivation reuses fileIdsForSetlist for both `total` and viewed iteration — avoids re-running the embedded filter twice on legacy fallback path; on hydrated path `s.songCount === fileIdsForSetlist.length` invariant holds"
  - "Embedded fallback filter aligned with reconciler semantics (`t.fileId && t.type !== 'header'`); the original cross-setlist loop in use-upcoming-prep did NOT exclude headers but headers have no fileIds in practice → no-op for real data, brings fallback into parity with reconciler"
  - "PrepRecommendations + UpcomingTimeline.ExpandedTrackList LEFT UNTOUCHED — they read `track.title` (and `track.key` for the timeline); architectural decision deferred to v60-06-04 (denormalize titles vs. bulk Dexie hook vs. per-render fetch)"
  - "/ui-ux-pro-max skill gate cleared as pure-logic refactor — no visual / layout / styling changes; no UX guidance applies"

patterns-established:
  - "When a reader needs both a count and a per-item iteration over the same denormalized array: derive the embedded fallback ONCE into a local const, then drive `total = s.songCount ?? local.length` and per-item loop from the same local. Saves one filter pass on legacy and keeps invariant explicit."

duration: ~15min (single context, no checkpoints, no deviations)
started: 2026-05-12T19:18:00-05:00
completed: 2026-05-12T19:33:00-05:00
---

# Phase v60-06 Plan 03: SetlistCards + use-upcoming-prep readers migrated to denormalized fileIds/songCount

**Two more dashboard read surfaces (SetlistCards offline-cache + use-upcoming-prep cross-setlist + per-setlist enrichment) consume the v60-06-02 reconciler's `setlist.fileIds` + `setlist.songCount` with embedded-array fallback for legacy. Net +9 production LOC, single commit, no test changes (existing 16/16 use-upcoming-prep suite passes via fallback path). Title-aware surfaces (PrepRecommendations + UpcomingTimeline.ExpandedTrackList) explicitly deferred to v60-06-04 architectural decision.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~15 min |
| Started | 2026-05-12T19:18:00-05:00 |
| Completed | 2026-05-12T19:33:00-05:00 |
| Tasks | 2 of 2 completed (both PASS qualify, 0 GAP / 0 DRIFT / 0 escalations) |
| Files modified | 2 (1 component, 1 hook) |
| Net production LOC | +9 (under +25 ceiling) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: SetlistCards offline-cache reads `setlist.fileIds ?? embedded` | ✅ Pass | Mirrors HeroCard pattern verbatim; deps array updated to `[setlist.fileIds, setlist.tracks]` |
| AC-2: use-upcoming-prep cross-setlist fileIds uses denormalized field | ✅ Pass | Loop body migrated; fallback aligned to reconciler filter (`t.fileId && t.type !== 'header'`) |
| AC-3: use-upcoming-prep per-setlist enrichment uses songCount + fileIds | ✅ Pass | Single `fileIdsForSetlist` derivation feeds both `total = s.songCount ?? fileIdsForSetlist.length` and viewed iteration |
| AC-4: Existing use-upcoming-prep test suite preserved | ✅ Pass | 16/16 tests passing in 44ms via fallback path; zero test edits |
| AC-5: tsc + build + main suite + emulator + HFG baselines held | ✅ Pass | tsc exit 0 / next build "Compiled with warnings in 11.1s" (Sentry deprecations pre-existing) / main suite 1581 pass / 52 fail (EXACT baseline) / HFG 0/3 held / emulator sanity skip justified (zero engine-touch) |
| AC-6: Net production LOC ≤ +25 | ✅ Pass | +9 net (SetlistCards +2, use-upcoming-prep +7) — 64% under ceiling |
| AC-7: PrepRecommendations + UpcomingTimeline.ExpandedTrackList untouched | ✅ Pass | `git diff` returns empty for both files; boundary respected |
| AC-8: PENDING-UAT carry | ⏳ Deferred to PENDING-UAT | Daniel browser-smoke on iPad: dashboard offline indicator on SetlistCards + upcoming prep percentages — to verify against deployed commit over upcoming worship cycle |

## Accomplishments

- **Filtered-count consumer pattern proven on a hook** — v60-06-02 migrated components; this plan extends the same `s.fileIds ?? embedded` / `s.songCount ?? derived.length` shape into a memoizing hook (`useMemo` over `setlists`). No new pattern needed; the existing dependency-array shape (`[setlists, songPrefs, lastVisitedAt, nowMinute]`) already covers re-computation when denormalized fields change because they propagate through the `setlists` reference.
- **Single-derivation invariant** — `fileIdsForSetlist` is computed once per setlist and drives both `total` and viewed iteration. On hydrated path `s.songCount === fileIdsForSetlist.length` (reconciler invariant); on legacy path both fall through to the same embedded filter — no double-filter, no inconsistency.
- **Title-aware boundary preserved** — PrepRecommendations and UpcomingTimeline.ExpandedTrackList stayed byte-identical. The v60-06-04 architectural decision (denormalize titles vs. bulk Dexie hook vs. per-render fetch) is correctly isolated to its own plan, rather than smuggled into this read-site migration.
- **HFG 0/3 held without ceremony** — zero engine touch, zero new test files, zero new tests. The plan deliberately leaned on existing fixtures (use-upcoming-prep test fixtures with `tracks:[]` arrays exercise the fallback path) for AC-4 coverage.

## Task Commits

Single combined commit per session precedent (v53-02 / v60-01 / v60-02 / v60-03 / v60-04 / v60-05 / v60-06-01 / v60-06-02):

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Task 1 + Task 2 + SUMMARY + STATE/ROADMAP docs | (see Git State in STATE.md) | feat(v60-06-03) | SetlistCards offline-cache + use-upcoming-prep cross-setlist + per-setlist enrichment migrated to denormalized fileIds/songCount |

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/components/setlist/SetlistCards.tsx` | Modified (+4 / -2 = +2) | Offline-cache useEffect derives fileIds via `setlist.fileIds ?? embedded.map().filter()`; deps array updated |
| `src/hooks/use-upcoming-prep.ts` | Modified (+17 / -10 = +7) | Cross-setlist fileIds collection loop body migrated; per-setlist enrichment derives `fileIdsForSetlist` once and feeds both `total` and viewed-iteration |
| `.paul/phases/v60-06-dashboard-reader-migration/v60-06-03-PLAN.md` | Created | Plan artifact |
| `.paul/phases/v60-06-dashboard-reader-migration/v60-06-03-SUMMARY.md` | Created | This file |
| `.paul/STATE.md` | Modified | Loop position → APPLY ✓ UNIFY ✓; session continuity updated |
| `.paul/ROADMAP.md` | Modified | v60-06 row updated to reflect v60-06-03 closure |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Single combined commit (no per-task split) | 2-file, +9 LOC, tightly coupled consumers of v60-06-02's reconciler output; splitting would orphan readers transiently. Matches every prior v60-0X precedent. | Single revert isolation; clean history |
| Per-setlist `fileIdsForSetlist` derived once | Drives both `total` and viewed iteration. On hydrated path `s.songCount === fileIdsForSetlist.length` invariant holds; on legacy path both branches share one filter. Avoids re-filtering embedded array twice. | Cheaper on legacy path; explicit invariant in code |
| Embedded fallback uses `t.type !== 'header'` filter (cross-setlist loop) | Original loop did NOT exclude headers, but headers carry no fileIds in practice → effectively no-op. New code aligns fallback with reconciler semantics; future readers can rely on consistent filtering. | Minor; brings fallback into parity with hydrated path |
| PrepRecommendations + UpcomingTimeline.ExpandedTrackList left untouched | They read `track.title` (and `track.key` for the timeline) — fields not denormalized today. v60-06-04 carries the architectural decision; bundling here would conflate read-site migration with a denormalization-vs-Dexie-hook architectural call. | Clean separation of concerns; v60-06-04 scope reserved |
| /ui-ux-pro-max skill gate cleared as no-op for this plan | Pure-logic refactor — zero visual, layout, styling, copy, accessibility, or interaction changes. SPECIAL-FLOWS gate is satisfied by skill being loaded; no UX guidance applies to consumer-side derivation logic. | Skill audit: ✓ invoked; gap closed without UX work |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 0 | — |
| LOC overshoot | 0 | +9 net vs +25 ceiling (64% under) |
| Scope additions | 0 | — |
| Deferred | 0 | — |

**Total impact:** Plan executed exactly as written. Two tasks, both PASS on first qualify, no escalation statuses used.

### Auto-fixed Issues

None.

### Deferred Items

None new in this plan. Already deferred (per plan SCOPE LIMITS, carrying forward to v60-06-04):
- PrepRecommendations.tsx title-aware reader migration
- UpcomingTimeline.tsx `ExpandedTrackList` title + key reader migration
- Architectural decision: denormalize song titles on `setlist.*` vs. introduce `useDexieTracksForSetlists(setlistIds)` bulk hook vs. per-render `getTracksForSetlistClient` fetch

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Bash CWD confusion when running verify commands with relative `sheet-music-app/` prefix | Resolved by switching to absolute paths (`/c/Users/dsbog/centralreform.live/sheet-music-app`) and `git -C ...`; no impact on code |

## Skill Audit

| Expected | Invoked | Notes |
|----------|---------|-------|
| /ui-ux-pro-max | ✓ | Loaded at APPLY start per SPECIAL-FLOWS BLOCKING gate; cleared as no-op (zero visual change in this plan) |

## Next Phase Readiness

**Ready (remaining v60-06 plans):**
- **v60-06-04** — Title-aware reader migration for PrepRecommendations + UpcomingTimeline.ExpandedTrackList. Carries the architectural decision (denormalize titles vs. bulk Dexie hook vs. per-render fetch). Likely sized as standard with a checkpoint:decision.
- **v60-06-05** — SetlistDrawer perf-view navigation queue.
- **v60-06-06** — TemplatesSection admin template conversion.
- **v60-06-07** — matrix/route.ts server-side reader (deferred from v60-05).
- **v60-06-08** — 15-setlist backfill script + `migration_snapshots/{setlistId}` rollback collection.

**Concerns:**
- The `fileIdsForSetlist` derivation in use-upcoming-prep's `enriched` useMemo runs per setlist per render. Cheap (filter over typically ≤50-element array), and the surrounding useMemo deps keep it stable across renders. No concern unless prep-list balloons to hundreds of setlists, which won't happen in CRC use.
- v60-06-04's PrepRecommendations + UpcomingTimeline migration is the only remaining read site that needs MORE than fileIds + songCount. Once that architectural call is made, the dashboard-reader migration spine is effectively done and v60-06-05/06/07 are routine surface migrations.

**Blockers:**
- None.
- v6.0 PENDING-UAT: Daniel browser-smoke on iPad — verify upcoming setlists list shows correct prep percentages and SetlistCards offline indicator (full/partial/none) matches baseline against the v60-06-03 deployed commit. Carries alongside v5.0 / v5.2 / v5.3 / v5.4 / v60-01 / v60-02 / v60-04 / v60-05 / v60-06-01 / v60-06-02 PENDING-UAT bundle.

---
*Phase: v60-06-dashboard-reader-migration, Plan: 03*
*Completed: 2026-05-12*
