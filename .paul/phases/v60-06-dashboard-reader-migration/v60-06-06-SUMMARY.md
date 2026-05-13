---
phase: v60-06-dashboard-reader-migration
plan: 06
subsystem: ui-admin
tags: [firestore-web-sdk, client-tracks, fetch-tracks, admin-templates, ssot]

requires:
  - phase: v60-05-01
    provides: getTracksForSetlistClient (Dexie-aware) + client-tracks.ts module
  - phase: v60-04
    provides: server-tracks.ts (Admin SDK 2-branch reader) — shape ported here
provides:
  - fetchTracksForSetlistClient(setlistId, setlistData) — Web SDK 2-branch async helper
  - TemplatesSection.handlePickSetlist async migration; SetlistSummary.hydrated field
affects:
  - v60-07 writer removal — admin Import-from-Setlist flow no longer depends on embedded `setlist.tracks[]` (only as fallback inside the helper)
  - v60-08 cleanup — the helper's `setlistData.tracks` fallback branch can be dropped after backfill
  - Future admin / one-shot Firestore surfaces — can reuse fetchTracksForSetlistClient as the canonical Web-SDK direct-fetch path

tech-stack:
  added: []
  patterns:
    - "Three-tier client reader inventory: Dexie-aware (getTracksForSetlistClient, 3-branch) for surfaces with snapshot-listener pre-population; Web-SDK direct-fetch (fetchTracksForSetlistClient, 2-branch) for admin / one-shot getDocs flows lacking Dexie; bulk Dexie subscription (useDexieTracksForSetlists) for multi-setlist render-time consumers"
    - "Type-narrowing fix for spread-with-id pattern: when `...data(), id: d.id` collapses TS inference to `{ id: string }`, declare the rows variable explicitly as `Record<string, unknown>[]` to keep dynamic-field access type-safe"

key-files:
  created: []
  modified:
    - src/lib/client-tracks.ts
    - src/lib/__tests__/client-tracks.test.ts
    - src/components/admin/TemplatesSection.tsx

key-decisions:
  - "fetchTracksForSetlistClient (NEW Web SDK helper) instead of reusing getTracksForSetlistClient or server-tracks.ts::getTracksForSetlist — admin getDocs flow lacks Dexie pre-population (no snapshot listener), so the existing 3-branch helper would always fall through to embedded; server-tracks is Admin-SDK only. The new helper fills the missing reader pattern."
  - "2-branch (NOT 3-branch) for the new helper. Admin / one-shot Firestore flows have no Dexie middle branch — skip it. Mirrors server-tracks shape exactly."
  - "Single combined commit (session precedent v53-02 / v60-01..06-05) — 3 files, ≤500 LOC."
  - "Per-file LOC ceilings exceeded across all three files. Documented as deviation. Combined-test+prod ceiling +148 vs +100 (+48 over)."
  - "/ui-ux-pro-max transitively satisfied (loaded earlier this session); pure-logic refactor of one admin handler + new helper module."

patterns-established:
  - "Client reader inventory is now complete: Dexie-aware 3-branch (getTracksForSetlistClient), Web-SDK 2-branch direct-fetch (fetchTracksForSetlistClient), bulk Dexie subscription (useDexieTracksForSetlists). Each consumer pattern (perf-view single, dashboard multi, drawer click-time-with-Dexie, admin click-time-no-Dexie) has its canonical reader. Future surfaces pick by mounting context."
  - "When a Firestore data() spread + id override narrows TS inference incorrectly, declare the receiver array as `Record<string, unknown>[]` to keep raw access for the sort-then-cast pattern."

duration: ~30min (Task 1 helper + tests + 1 tsc iteration, Task 2 consumer migration, qualify+verify)
started: 2026-05-12T21:30:00-05:00
completed: 2026-05-12T21:40:00-05:00
---

# Phase v60-06 Plan 06: TemplatesSection admin migration + new Web-SDK direct-fetch reader

**Adds `fetchTracksForSetlistClient` — the Web SDK 2-branch counterpart to `server-tracks.ts::getTracksForSetlist`. Migrates the admin Import-from-Setlist flow (TemplatesSection.handlePickSetlist) to consume it. Completes the client reader inventory: every consumer pattern (Dexie-aware single, Dexie-aware bulk, Web-SDK direct-fetch) now has its canonical reader. Only v60-06-07 (matrix/route.ts server-side) and v60-06-08 (backfill script) remain in the phase before v60-07 writer removal.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~30 min |
| Started | 2026-05-12T21:30:00-05:00 |
| Completed | 2026-05-12T21:40:00-05:00 |
| Tasks | 2 of 2 executed (Task 1 DONE/PASS; Task 2 DONE_WITH_CONCERNS for AC-6 LOC overshoot) |
| Files modified | 3 |
| Net production LOC | +41 (helper) + +20 (consumer) = +61 |
| Test LOC | +91 |
| Combined delta | 148 LOC |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: fetchTracksForSetlistClient 2-branch contract | ✅ Pass | Hydrated → getDocs against top-level tracks + sort by order; unhydrated → embedded fallback |
| AC-2: ≥3 unit tests | ✅ Pass (over-delivered) | 5 new tests passing in 4ms: hydrated sorted, unhydrated embedded, unhydrated missing, hydrated empty, null/undefined |
| AC-3: SetlistSummary.hydrated | ✅ Pass | Field added; populated via `data.hydrated === true` at construction |
| AC-4: handlePickSetlist async + fetchTracksForSetlistClient | ✅ Pass | Async signature, try/catch with `toast.error("Failed to load setlist tracks")`, convertSetlistToTemplate consumed verbatim |
| AC-5: baselines held | ✅ Pass | tsc EXIT=0; build clean; main suite 1591 pass / 52 fail (1586 baseline + 5 new tests, zero new failures); HFG 0/3 |
| AC-6: LOC ceilings | ⚠️ FAIL (per-file + combined) | client-tracks +41 vs +30; test +91 vs +60; TemplatesSection +20 vs +12; combined +148 vs +100. See Deviations. |
| AC-7: prior migrations untouched | ✅ Pass | Empty `git diff` for all 11 boundary files (SetlistCards, HeroCard, PrepRecommendations, UpcomingTimeline, NextServiceCard, PublicSetlistListing, SetlistDrawer, use-upcoming-prep, use-dexie-tracks-for-setlists, SetlistGridHydrator, server-tracks). Existing getTracksForSetlistClient function in client-tracks.ts is byte-identical to v60-05-01 (only new export added). |
| AC-8: PENDING-UAT | ⏳ Deferred to PENDING-UAT | Admin imports setlist as template; hydrated path queries top-level tracks; legacy path uses embedded. UAT deferable to Daniel's next template-management session. |

## Accomplishments

- **Client reader inventory complete.** With this plan, every consumer pattern has its canonical reader: `getTracksForSetlistClient` (Dexie-aware 3-branch, for perf-view + dashboard surfaces); `useDexieTracksForSetlists` (bulk Dexie subscription, for multi-setlist dashboard surfaces); `fetchTracksForSetlistClient` (Web-SDK direct fetch 2-branch, for admin / one-shot getDocs). Future plans pick by mounting context, not by inventing new patterns.
- **Web-SDK port of server-tracks.ts shape.** The new helper mirrors `server-tracks.ts::getTracksForSetlist` exactly — same 2-branch decision, same hydrated → top-level tracks query, same embedded fallback. Server (Admin SDK) and client (Web SDK) now have parallel reader implementations.
- **Admin Import-from-Setlist flow future-proofed for v60-07.** Post-v60-07 setlists will have no embedded array. TemplatesSection.handlePickSetlist now correctly reads from the top-level `tracks` collection for hydrated setlists, so the admin's "Import from Setlist" workflow continues to work after writer removal.
- **Type-narrowing pattern documented.** TS narrows `{ ...data, id: d.id }` to `{ id: string }` because the trailing `id` overrides the spread. Declaring the receiver as `Record<string, unknown>[]` preserves raw-field access for the sort-then-cast pattern. Captured in patterns-established for future plans hitting the same shape.

## Task Commits

Single combined commit per session precedent:

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Task 1 + Task 2 + SUMMARY + STATE/ROADMAP docs | (see Git State in STATE.md) | feat(v60-06-06) | fetchTracksForSetlistClient + TemplatesSection.handlePickSetlist migration |

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/lib/client-tracks.ts` | Modified (+41 net) | 4 new Firestore imports (collection/query/where/getDocs) + db import; new async fetchTracksForSetlistClient export with 2-branch logic + sort by order |
| `src/lib/__tests__/client-tracks.test.ts` | Modified (+91 net) | vi.mock for firebase/firestore + @/lib/firebase; 5 new tests in dedicated v60-06-06 describe block (hydrated sorted, unhydrated embedded, unhydrated missing, hydrated empty, null/undefined) |
| `src/components/admin/TemplatesSection.tsx` | Modified (+20 net) | New fetchTracksForSetlistClient import; SetlistSummary.hydrated field; construction populates hydrated; handlePickSetlist async + try/catch + await fetchTracksForSetlistClient |
| `.paul/phases/v60-06-dashboard-reader-migration/v60-06-06-PLAN.md` | Created | Plan artifact |
| `.paul/phases/v60-06-dashboard-reader-migration/v60-06-06-SUMMARY.md` | Created | This file |
| `.paul/STATE.md` | Modified | Loop position → UNIFY ✓; session continuity updated |
| `.paul/ROADMAP.md` | Modified | v60-06 row reflects v60-06-06 closure |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| New helper fetchTracksForSetlistClient (NOT reuse getTracksForSetlistClient or server-tracks) | Admin getDocs flow has no snapshot listener → no Dexie pre-population → existing 3-branch helper always falls through to embedded fallback. server-tracks is Admin-SDK-typed and can't run client-side. The new helper fills the missing reader pattern. | Three readers in the client inventory, each with a clear use case |
| 2-branch (NOT 3-branch) for the new helper | Admin / one-shot flows have no middle Dexie branch — match the server-tracks shape exactly. | Cleaner contract; mirrors server reader; no spurious Dexie checks |
| Toast error specifically "Failed to load setlist tracks" | Matches the existing toast.error pattern at line 61 ("Failed to fetch setlists"); distinguishes the two failure paths for ops debugging | Better error observability without UI flow change |
| Type-narrowing fix via explicit `Record<string, unknown>[]` annotation | The `{ ...data, id: d.id }` spread collapsed TS inference to `{ id: string }` only. Explicit annotation on the rows variable keeps the raw access (`a.order`, `b.order`) type-safe. | Documented pattern for future Firestore spread-with-id sites |
| AC-6 LOC ceilings exceeded across all 3 files | Per-file ceilings were estimates set at PLAN time; actual deltas include JSDoc, try/catch, comments, and mock infrastructure (test file) that the estimates didn't fully budget. Pattern persists from v60-06-04/05. | DONE_WITH_CONCERNS reporting; future plan ceilings should account for these floors |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | TS type-narrowing on spread-with-id pattern; resolved by explicit `Record<string, unknown>[]` annotation |
| LOC overshoot (per-file) | 3 | All three modified files exceeded their ceilings |
| LOC overshoot (combined) | 1 | +148 vs +100 ceiling (+48 over) |
| Scope additions | 1 | 5th test (null/undefined setlistData) — minor edge-case coverage, ~4 LOC |
| Deferred | 0 | — |

**Total impact:** AC-6 ceiling miss across all three files. All functional ACs (1-5, 7, 8) pass. No production behavior compromise.

### Auto-fixed Issues

**1. [TS] Spread-with-id type narrowing in fetchTracksForSetlistClient**
- **Found during:** Task 1 verification — `tsc --noEmit` produced 4× `TS2339: Property 'order' does not exist on type '{ id: string; }'` errors
- **Issue:** The `{ ...(d.data() as Record<string, unknown>), id: d.id }` literal narrowed TS inference to `{ id: string }` because the trailing `id` property overrides the spread's any-shaped value, and TS can't infer the spread fields. The subsequent `.sort` callback accessed `a.order` / `b.order` which don't exist on the narrowed type.
- **Fix:** Declared `const rows: Record<string, unknown>[] = ...` to keep dynamic-field access type-safe; sort callback accesses `a.order` / `b.order` against the wider type with `typeof === 'number'` guards.
- **Files:** src/lib/client-tracks.ts (the new fetchTracksForSetlistClient helper only; existing getTracksForSetlistClient untouched)
- **Verification:** tsc EXIT=0 after fix; 12/12 client-tracks tests pass.
- **Commit:** part of the v60-06-06 combined commit

### Per-File LOC Overshoots

**1. [LOC] `src/lib/client-tracks.ts` — +41 net vs +30 ceiling (+11 over)**
- **Found during:** Task 1 verification — `git diff --stat`
- **Issue:** New function body (~30 LOC) + 4 imports + 13-line JSDoc + post-fix type annotation pushed delta to +41.
- **Resolution:** Accept and document. JSDoc explains when to use this helper vs the existing one — critical for future plan authors. Trimming would degrade discoverability of the reader inventory.

**2. [LOC] `src/lib/__tests__/client-tracks.test.ts` — +91 net vs +60 ceiling (+31 over)**
- **Found during:** Task 1 verification
- **Issue:** vi.mock setup (~12 LOC) + describe block + 5 tests × ~15 LOC each = +91. Same boilerplate-floor pattern as v60-06-04 test file overshoot.
- **Resolution:** Accept and document. 5th test (null/undefined setlistData) added beyond AC-2's ≥3 floor — covers an edge case that would otherwise silently crash on `setlistData?.hydrated` access against a null parent. Worth ~4 LOC for crash-safety.

**3. [LOC] `src/components/admin/TemplatesSection.tsx` — +20 net vs +12 ceiling (+8 over)**
- **Found during:** Task 2 verification
- **Issue:** Async handler envelope + try/catch + 3-line explanatory comment + interface field + construction field + new import = +20.
- **Resolution:** Accept and document. Same pattern as v60-06-05 (drawer try/catch envelope inflates LOC vs estimate). Future ceilings should budget ~6-8 LOC floor for try/catch + comment + multi-line await.

### Scope Additions

**5th test added: null/undefined setlistData → []**
- Plan AC-2 specified "≥3 tests"; shipped 5 (4 covering the AC's specified branches + 1 edge case for null/undefined).
- ~4 LOC; protects against a crash class that would emerge if a caller (current or future) ever passed nullish setlistData. The existing getTracksForSetlistClient tests cover this case; the new helper should match.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Initial tsc failure: 4 errors on `a.order`/`b.order` in sort callback | Added explicit `Record<string, unknown>[]` annotation on the rows variable to preserve raw-field type access. Captured the pattern in patterns-established for future Firestore-spread sites. |

## Skill Audit

| Expected | Invoked | Notes |
|----------|---------|-------|
| /ui-ux-pro-max | ✓ | Loaded earlier this session (v60-06-03 APPLY); transitively satisfied per SPECIAL-FLOWS BLOCKING gate. Cleared as no-op — zero visual / layout / styling / copy changes; pure-logic refactor + new helper module. |

## Next Phase Readiness

**Ready (remaining v60-06 plans):**
- **v60-06-07** — matrix/route.ts server-side reader (deferred from v60-05). Server-side surface; uses the existing `server-tracks.ts::getTracksForSetlist` Admin SDK helper. Distinct code path from this plan's client helpers — no new helper needed, just helper consumption swap.
- **v60-06-08** — 15-setlist backfill script + `migration_snapshots/{setlistId}` rollback collection. Writes denormalized fields + top-level tracks for historical setlists. Enables v60-08 cleanup (drop embedded `setlist.tracks[]` array, drop fallback branches in helpers).

**Concerns:**
- AC-6 LOC ceiling miss pattern is now established across v60-06-04/05/06. Future ceilings should explicitly budget the irreducible floors: try/catch + comment ≈ 8-10 LOC; JSDoc on new exported helpers ≈ 10-13 LOC; vitest mock setup ≈ 12-15 LOC. Combined-only ceilings (as used in v60-06-04 AC-7) are more meaningful than per-file ceilings.
- TemplatesSection has no test file; the try/catch error path is unverified in CI. Acceptable per the admin-only / low-frequency framing.
- The new `fetchTracksForSetlistClient` helper makes a synchronous Firestore query at click-time. For setlists with many tracks (rare in CRC use, ≤50), this is sub-second. For pathological cases (hundreds of tracks), the picker would show no loading state. Could add a spinner in v60-06-07/08 if needed — not warranted by current scale.

**Blockers:**
- None.
- **v6.0 PENDING-UAT carry:** Daniel (next template-management session) — admin opens Templates → "Import from Setlist" → picks recent setlist → confirms template editor populates correctly. Hydrated setlist (post-v50-05) imports tracks via top-level Firestore collection; legacy setlist imports via embedded fallback. UAT deferable; admin-only surface. Joins v5.0 / v5.2 / v5.3 / v5.4 / v60-01..06-05 PENDING-UAT bundle.

---
*Phase: v60-06-dashboard-reader-migration, Plan: 06*
*Completed: 2026-05-12*
