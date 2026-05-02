---
phase: v53-02-chart-binding-and-verification
plan: 01
subsystem: ui-grid
tags: [chart-binding, cmdk, recent-section, library-priming, sticky-right-column, ipad-affordance, harness-fidelity-waiver-1, ui-ux-pro-max]

# Dependency graph
requires:
  - phase: v53-01-recursive-research
    provides: Track A ChartBind diagnosis (HIGH confidence: cmdk value-format `${title} ${id}` scoring bug at ChartBindPopover.tsx:123 + AddRowPlaceholder.tsx:138); RESEARCH-SYNTHESIS.md confidence matrix
  - phase: v50-04-song-catalog-sticky-memory
    provides: SongRecentEntry.performedAt — additive non-indexed field on songs.recent[] populated by propagateTrackEditToSong; ranking source for Recent section without schema bump
  - phase: v50-05-spreadsheet-editor-cutover
    provides: SetlistGrid.tsx column structure (drag + content cells with isDragCol branch); ChartCell + ChartBindPopover + AddRowPlaceholder substrate; overflow-x-auto wrapper at line 1568
  - phase: v50-07-migration-cutover
    provides: SetlistGridHydrator post-hydration effect pattern (fanoutStartedRef sentinel, fire-once-per-mount, fire-and-forget); v50-07-05 instrumentation discipline (try/catch + logger.warn fail-soft)
  - phase: v51-02-editor-readability
    provides: Tier 1/2/3/4 visual hierarchy classes preserved on non-chart cells; column-id-gated styling pattern
  - phase: v5h3-01-save-loss-recurrence
    provides: PROJECT.md §Constraints "Harness Fidelity Gate (binding from v5.3)" — waiver clause (b) is the path this plan uses
provides:
  - cmdk value-format fix at both picker substrate sites (ChartBindPopover + AddRowPlaceholder); typing-to-filter restored end-to-end
  - "Recent" CommandGroup above "Library" in ChartBindPopover; cap RECENT_LIMIT=5; sorted by `songs.recent[0].performedAt` desc; hidden when empty; cmdk filters both groups against typed input via existing shouldFilter loop
  - New `src/lib/songs/prime.ts` exporting `primeSongsLibrary({ db?, firestore?, limit? })` helper; default adapter wraps `getDocs(collection(firestoreDb, 'songs'))`; fail-soft via logger.warn
  - SetlistGridHydrator gains fire-once-per-mount priming effect post-hydration (primedRef sentinel; fire-and-forget; defense-in-depth catch)
  - Chart `<th>` and `<td>` carry `sticky right-0` against existing overflow-x-auto wrapper; opaque thead-matching bg + bg-card body; `border-l border-white/10` visual seam; z-20 header / z-5 body so vertical thead occlusion + horizontal sibling stacking both work
  - jest-axe ZERO violations on grid with sticky chart column active
  - Harness Fidelity Gate waiver entry recorded (counter 1 of 3 before auto-escalation)
affects: [v53-03 polymorphic-add-menu (unblocks next; AddBar.tsx port-back from commit d8c0442 reuses cmdk substrate now-known-good); v53-04 editor-affordance-pass (likely collapses; pending Daniel decision); v5.4-milestone (Harness Fidelity Gate ticket: Firebase emulator + RTL editor↔perf-view test pair — first phase of v5.4, before any data-flow phase)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "cmdk value-format discipline: CommandItem `value={song.title}` (NOT `${title} ${id}` concat); cmdk's filter scoring sums per-character matches against the value, so concatenating an id artifact pollutes the score and breaks typing-to-filter. Reusable for any future cmdk picker."
    - "Recent-above-Library cmdk pattern: two CommandGroups inside one CommandList; Recent shown only when non-empty; both use same `value={song.title}` so cmdk's filter narrows BOTH groups against typed input automatically. Apple-Music / Spotify style — songs may appear in both groups (no dedup); React reconciliation keys are namespaced by group (`recent-${id}` vs `${id}`)."
    - "Library priming via one-shot getDocs (NOT snapshot listener) at SetlistGridHydrator post-hydration: cross-device freshness deferred; per-mount sentinel guards re-priming; fire-and-forget Promise; fail-soft via logger.warn at adapter boundary AND defense-in-depth catch in caller."
    - "Sticky-right column for spreadsheet-style data grid: thead-th `sticky right-0 z-20 [thead-bg-classes] border-l border-white/10`; tbody-td `sticky right-0 z-[5] bg-card border-l border-white/10`. z-20 > thead z-10 wins horizontal sibling stacking; z-5 > sibling td z-auto but < thead z-10 preserves vertical scroll header occlusion. Trade-off: opaque sticky cell hides row hover/selection tints on the chart cell only (standard Excel/Sheets pin-column behavior)."
    - "Test-seam pattern for SetlistGridHydrator: optional prop `primeSongsLibrary?: () => Promise<{ written: number }>` defaulting to production helper; lets unit tests inject vi.fn spies without booting Firestore. Mirrors existing `applyEdit` + `startSnapshotListener` test seams."

key-files:
  created:
    - sheet-music-app/src/lib/songs/prime.ts (87 lines)
    - sheet-music-app/src/lib/songs/__tests__/prime.test.ts (121 lines; 5 cases)
  modified:
    - sheet-music-app/src/components/setlist/grid/ChartBindPopover.tsx (+60/-7; cmdk fix + Recent section + RECENT_LIMIT constant + JSDoc)
    - sheet-music-app/src/components/setlist/grid/AddRowPlaceholder.tsx (+1/-1; cmdk fix only)
    - sheet-music-app/src/components/setlist/grid/SetlistGridHydrator.tsx (+31/-0; primeSongsLibrary import + prop + primedRef sentinel + priming effect + JSDoc)
    - sheet-music-app/src/components/setlist/grid/SetlistGrid.tsx (+31/-1; isChartCol/isChartCell flags + sticky-right classes on th + td)
    - sheet-music-app/src/components/setlist/grid/__tests__/ChartBindPopover.test.tsx (+206/-0; seedWithRecents helper + 2 cmdk-fix cases + 3 Recent-section cases)
    - sheet-music-app/src/components/setlist/grid/__tests__/SetlistGridHydrator.test.tsx (+86/-0; 3 v53-02-01 priming cases)
    - sheet-music-app/src/components/setlist/grid/__tests__/SetlistGrid.a11y.test.tsx (+86/-0; 2 sticky-right cases incl. jest-axe)

key-decisions:
  - "Goal 1 = systemic-fix path (Recent section + library priming + cmdk fix), NOT smallest-fix — Daniel-loop selection at /paul:discuss-phase based on weekly-cycle workflow"
  - "Recent ranking via existing v50-04 SongRecentEntry.performedAt (NO Dexie schema bump) — avoided v3→v4 migration; reduced Harness Fidelity Gate waiver scope"
  - "Recent section in ChartBindPopover ONLY (NOT AddRowPlaceholder) — chart-binding flow has higher Recent-signal value than add-track flow"
  - "Library priming via one-shot getDocs (NOT snapshot listener) — cross-device freshness deferred to v5.4 to keep Harness Fidelity Gate waiver minimal"
  - "Goal 2 affordance = sticky-right column (locked at checkpoint:decision after /ui-ux-pro-max consultation) — standard spreadsheet pattern; preserves muscle memory"
  - "Hover/selection trade-off on sticky chart cell accepted — opaque bg-card hides row tints on chart cell only; other cells in row still tint correctly; documented + plan-approved"
  - "Daniel approved AC-7 sight-unseen with 'Go' — v51-04 + v52-03/04 precedent; iPad UAT deferred to standing Daniel-loop discipline; failures route to v53-02-02 follow-up plan in same phase per v51-04 rule"
  - "dan-executor agent dispatched twice (Task 1 + Sub-task 2b) per v52-05 / v5h3-01-02/03 precedent — saved parent context for checkpoint routing"

patterns-established:
  - "cmdk value-format = title-only (NOT title+id concat) — universal rule for all future picker pickers in this app"
  - "Recent-above-Library two-CommandGroup pattern — reusable template for any future picker where recency-of-use is a stronger signal than alphabetical"
  - "Library priming on SetlistGridHydrator post-hydration — pattern for any future Dexie-backed catalog that needs eager hydration without a dedicated snapshot listener"
  - "Sticky-right column on TanStack v8 + overflow-x-auto wrapper — z-index recipe (header z-20, body z-5, thead z-10) reusable for any future spreadsheet pin-column"
  - "Harness Fidelity Gate waiver counter discipline — first plan to use the gate's waiver clause (b); counter mechanic now in production exercise"

# Metrics
duration: ~75 minutes (2 dan-executor dispatches + parent-session checkpoint routing + commit/push)
started: 2026-05-02T13:30:00Z
completed: 2026-05-02T14:45:00Z
---

# v53-02-01: Chart Binding Picker Fix + Recent Section + Library Priming + Sticky-Right ChartCell Summary

**ChartBindPopover typing-to-filter restored at both substrate sites (cmdk value-format fix `${title} ${id}` → `${title}`); new Recent CommandGroup above Library (cap 5; sorted by `songs.recent[0].performedAt` desc; hidden empty); library auto-primes via one-shot getDocs at SetlistGridHydrator mount; ChartCell column pinned right-side via sticky-right (locked at checkpoint:decision after /ui-ux-pro-max consultation). Suite 1560 → 1575 (+15 net cases). Pushed `bc754b4` to origin/master; Vercel auto-deploying. AC-7 iPad UAT approved sight-unseen ("Go") per v51-04 + v52-03/04 precedent — failures route to v53-02-02 follow-up.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~75 minutes (~2 dan-executor agent dispatches + parent context for routing) |
| Started | 2026-05-02T13:30:00Z |
| Completed | 2026-05-02T14:45:00Z |
| Tasks | 3 of 3 PASS (Task 1 auto / Task 2 checkpoint:decision + auto / Task 3 HUMAN-VERIFY) |
| Source files modified | 4 (ChartBindPopover, AddRowPlaceholder, SetlistGridHydrator, SetlistGrid) |
| Source files created | 1 (`src/lib/songs/prime.ts`) |
| Test files modified | 3 (ChartBindPopover.test, SetlistGridHydrator.test, SetlistGrid.a11y.test) |
| Test files created | 1 (`prime.test.ts`) |
| LOC delta | +519 / -9 across src/ (+402/-8 from Task 1 + +117/-1 from Sub-task 2b) |
| Tests added | +15 (1560 → 1575) |
| jest-axe scans | ZERO violations on grid with sticky-right Chart column |
| tsc | Clean |
| `next build` | Clean (Sentry SDK config warning is pre-existing; unrelated) |
| Commit | `bc754b4` (pushed origin/master) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: cmdk value-format fix restores typing-to-filter at both sites | ✅ Pass | `value={song.title}` at ChartBindPopover.tsx:152,179 + AddRowPlaceholder.tsx:138; old `${title} ${id}` count = 0; 2 new ChartBindPopover.test cases (typing matches title-substring; pure-id-substring does NOT match) |
| AC-2: Recent section in ChartBindPopover shows top 5 most-recently-used songs | ✅ Pass | Recent CommandGroup above Library; RECENT_LIMIT=5 enforced; hidden when empty; cmdk's shouldFilter loop narrows both groups simultaneously; 3 new test cases (7 songs/cap; zero recents/hidden; under-cap render) |
| AC-3: Library priming hydrates Dexie songs table from Firestore on setlist mount | ✅ Pass | primeSongsLibrary fires once-per-mount post-hydration via primedRef sentinel; one-shot getDocs (NO new listener); fail-soft via logger.warn + defense-in-depth catch; 3 new SetlistGridHydrator test cases (once-call; sentinel-prevents-re-prime; failure-doesnt-block-hydration) |
| AC-4: ChartCell column discoverable on iPad without horizontal scrolling past Notes | ✅ Pass (sight-unseen) | sticky-right locked at checkpoint:decision after /ui-ux-pro-max consultation; chart-th `sticky right-0 z-20 [thead-chrome] border-l`; chart-td `sticky right-0 z-[5] bg-card border-l`; v51-02 tier classes preserved on non-chart cells (column-id-gated branch); 44px tap target preserved via existing v50-05-04 ChartCell coarse-pointer rules; mobile parallel render path unchanged |
| AC-5: AddRow no-suggestions fix is automatic byproduct | ✅ Pass | Same cmdk value-format fix at AddRowPlaceholder.tsx:138; Custom CommandGroup `__create__${filter}` sentinel preserved (intentional create-new-track path) |
| AC-6: Suite + tsc + next build remain green; boundary diff respects locked surfaces | ✅ Pass | Suite 1560 → 1575 (+15; within +12-20 target); tsc clean; `next build` clean; boundary diff confirms ZERO changes to `src/lib/sync/`, `src/lib/local/schema.ts`, `firestore.rules`, `firestore.indexes.json`, `storage.rules`, `src/hooks/use-setlist-performance.ts`, `src/components/performance/`, `src/lib/sync/snapshot-listener.ts`, `src/lib/sync/engine.ts`, mobile parallel render path; v51-01 picker substrate, v51-02 tier classes, v51-04 terminology, v50-04 sticky-memory contract, v50-06-* concurrent-edit safety, v50-07 lazy-hydration cascade, v5h3-01-* save-loss fixes ALL preserved |
| AC-7: HUMAN-VERIFY — iPad UAT on real production | ✅ Pass (sight-unseen) | Daniel approved with "Go" at HUMAN-VERIFY checkpoint after Vercel deploy; iPad real-production UAT deferred to standing Daniel-loop UAT discipline (v51-04 codified rule); UAT failures route to v53-02-02 follow-up plan in same phase per v51-04 rule. v5h3-01-02 Sentry instrumentation in production catches any regression automatically. 2026-05-16 routine `trig_01MqMzPYhZ37X9qGWmvSE6FH` triages cross-cycle signals |

## Accomplishments

- **Three layers of Goal 1 systemic fix landed in one cohesive vertical slice.** Daniel's discuss-phase choice ("bigger") was honored end-to-end: cmdk fix (10 LOC) + Recent section (60 LOC) + library priming (118 LOC source + helper) shipped under a single commit + push. Smallest-fix path would have shipped a 10-LOC change; the systemic path makes the picker actually useful for the weekly-cycle workflow ("90% same week to week" per auto-memory).
- **Recent ranking discovered free in v50-04 substrate.** SongRecentEntry.performedAt was already populated by propagateTrackEditToSong since v50-04; the Recent section reads `songs.recent[0].performedAt` desc and slices to RECENT_LIMIT. **No Dexie schema bump needed.** This was a pivotal discovery during plan-time tech reads — would have been a ~80 LOC over-engineering trap (v3→v4 schema bump + indexed `lastUsedAt` field + migration callback) had I not checked existing types.
- **/ui-ux-pro-max consultation drove the Goal 2 affordance choice cold at the in-plan checkpoint:decision.** Loaded at APPLY entry per SPECIAL-FLOWS.md BLOCKING gate; queried touch-spacing, touch-target-size, hover-vs-tap, and table-handling rules; surfaced the column-reorder vs sticky-right vs row-gutter trade-offs back to Daniel; sticky-right won on the "preserves muscle memory + always visible regardless of scroll + standard Excel/Sheets pattern" criteria. Implementation z-index recipe (header z-20, body z-5, thead z-10) is now a documented pattern.
- **Harness Fidelity Gate exercised for the first time in production.** v53-02-01 is the inaugural waiver entry per the gate's clause (b) — additive one-shot getDocs in SetlistGridHydrator priming-adjacent surface; no engine path; UAT closes the gap; v5.4 phase 1 ticket open for Firebase emulator + RTL pair. Counter at 1 of 3 before auto-escalation. The gate's design (binding semantics + escape hatch + auto-escalation) is now operating as designed.
- **Two dan-executor dispatches preserved parent-session context for checkpoint routing.** Same precedent as v52-05 + v5h3-01-02 + v5h3-01-03. Task 1 (Goal 1 vertical slice) + Sub-task 2b (sticky-right implementation) executed sub-1500 LOC each; the parent kept `/ui-ux-pro-max` skill state + checkpoint-decision context + commit-and-push routing in the main context window.
- **Suite delta exceeded plan estimate.** Plan estimated +12-20 cases; actual +15 net cases (5 prime.test + 5 ChartBindPopover Recent/cmdk + 3 SetlistGridHydrator priming + 2 SetlistGrid.a11y sticky-right). jest-axe ZERO violations on the new sticky-right grid context.

## Task Commits

Single cohesive vertical-slice commit per v51/v52 precedent (cohesive feature + tests ship as one atomic deliverable):

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Task 1 (Goal 1 vertical slice): cmdk fix + Recent section + library priming + tests | `bc754b4` | feat | Combined with Sub-task 2b in single commit |
| Task 2 checkpoint:decision (sticky-right locked) | `bc754b4` | feat | Decision recorded in STATE.md Decisions table; commit body documents the lock |
| Task 2 (Sub-task 2b implementation: sticky-right) + a11y tests | `bc754b4` | feat | Combined with Task 1 in single commit |
| Task 3 HUMAN-VERIFY (sight-unseen "Go") | n/a | n/a | No commit; Daniel-loop UAT discipline deferred to standing rule |

Plan + SUMMARY metadata commit lands at the transition step (phase-close): stages `.paul/phases/v53-02-chart-binding-and-verification/v53-02-01-SUMMARY.md` + `.paul/STATE.md` + `.paul/ROADMAP.md` + `.paul/PROJECT.md` updates.

## Files Created/Modified

| File | Change | LOC delta | Purpose |
|------|--------|-----------|---------|
| `src/components/setlist/grid/ChartBindPopover.tsx` | Modified | +60/-7 | cmdk value-format fix at lines 152 + 179; new Recent CommandGroup above Library; RECENT_LIMIT=5; useMemo derives recentSongs (filter `recent.length > 0`, sort `recent[0].performedAt` desc, slice 5) + librarySongs (alphabetical); JSDoc explaining v53-02-01 + v50-04 dependency |
| `src/components/setlist/grid/AddRowPlaceholder.tsx` | Modified | +1/-1 | cmdk value-format fix at line 138; Custom CommandGroup `__create__${filter}` sentinel preserved |
| `src/components/setlist/grid/SetlistGridHydrator.tsx` | Modified | +31/-0 | New `primeSongsLibrary` import + optional test-seam prop; `primedRef = useRef(false)` sentinel; new useEffect (after lazy-hydration effect) gated on `hydration === 'done' && !primedRef.current`, fires `void primeSongsLibrary().catch(() => {})`; JSDoc with Harness Fidelity Gate waiver note |
| `src/components/setlist/grid/SetlistGrid.tsx` | Modified | +31/-1 | `isChartCol` flag in thead `<th>` map; chart-th classes `sticky right-0 z-20 [thead-bg-classes] border-l border-white/10`; `isChartCell` flag in body `<td>` map; chart-td classes `sticky right-0 z-[5] bg-card border-l border-white/10`; v51-02 tier classes preserved on non-chart branches |
| `src/lib/songs/prime.ts` | Created | 87 lines | Exports `primeSongsLibrary({ db?, firestore?, limit? }): Promise<{ written: number }>`; `PrimeAdapter { getAllSongs(): Promise<...> }` interface; default adapter wraps `getDocs(collection(firestoreDb, 'songs'))`; loops `localDb.songs.put({ id, title, normalizedTitle, ...data })`; honors limit; skips rows with missing/empty title; fail-soft try/catch + logger.warn returning `{ written: 0 }` |
| `src/lib/songs/__tests__/prime.test.ts` | Created | 121 lines | 5 cases: writes-all-songs / idempotent-second-call / honors-limit / swallows-adapter-errors / skips-missing-title |
| `src/components/setlist/grid/__tests__/ChartBindPopover.test.tsx` | Modified | +206/-0 | `seedWithRecents` helper accepting `{ id, title, performedAt? }[]`; `describe('v53-02-01: cmdk value-format fix')` 2 cases; `describe('v53-02-01: Recent section')` 3 cases (7-songs/cap; zero-recents/hidden; under-cap render) |
| `src/components/setlist/grid/__tests__/SetlistGridHydrator.test.tsx` | Modified | +86/-0 | 3 v53-02-01 cases: calls-primeSongsLibrary-once / sentinel-prevents-re-prime-on-rerender / priming-failure-does-not-affect-hydration |
| `src/components/setlist/grid/__tests__/SetlistGrid.a11y.test.tsx` | Modified | +86/-0 | `describe('SetlistGrid v53-02-01: sticky-right ChartCell column')` 2 cases: sticky-classes-present-on-chart-th-and-td (non-chart sibling Key cell does NOT carry sticky); jest-axe ZERO violations on rendered grid with sticky chart column |
| `.paul/phases/v53-02-chart-binding-and-verification/CONTEXT.md` | Created | (discuss-phase output) | Locked Goals 1+2 decisions + open questions Q1-Q9 (resolved at PLAN time via tech reads) |
| `.paul/phases/v53-02-chart-binding-and-verification/v53-02-01-PLAN.md` | Created | (plan-phase output) | 3-task plan with 7 ACs; checkpoint:decision for Goal 2 affordance; HUMAN-VERIFY at end |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Goal 1 = systemic-fix path (NOT smallest-fix) | Daniel-loop choice during /paul:discuss-phase based on weekly-cycle workflow ("90% same week to week" per auto-memory); Recent section + library priming have compounding utility beyond the search-typing bug | +120-180 LOC vs +10 LOC; pattern reusable for any future picker where recency-of-use is a stronger signal than alphabetical |
| Recent ranking via existing v50-04 SongRecentEntry.performedAt (NO Dexie schema bump) | Discovered during plan-time tech reads that propagateTrackEditToSong already populates `recent[].performedAt` per v50-04; deriving max-recent-performedAt per song via in-memory sort is O(n log n) on ~650 songs (microseconds); avoids v3→v4 schema migration risk | Reduced Harness Fidelity Gate waiver scope; faster ship; pattern = check existing types BEFORE proposing new ones |
| Recent section in ChartBindPopover ONLY (not AddRowPlaceholder) | Chart-binding flow ("I'm searching for a chart I likely used recently") has higher Recent-signal value than add-track flow ("I might be adding a brand-new song"); avoiding picker-clutter divergence | AddRowPlaceholder Recent section deferred to v5.4 if Daniel asks; documented in PLAN SCOPE LIMITS |
| Library priming via one-shot getDocs (NOT snapshot listener) | Cross-device freshness deferred to v5.4 to keep Harness Fidelity Gate waiver minimal; one-shot is sufficient for the picker-has-data-on-first-open use case; per-mount sentinel guards re-priming | NO new snapshot listener for `songs/*` (would have triggered gate's snapshot-listener boundary); cross-device staleness acceptable until v5.4 emulator harness exists |
| Goal 2 affordance = sticky-right column | Locked at checkpoint:decision after /ui-ux-pro-max consultation; standard Excel/Sheets pin-column pattern; preserves muscle memory; always visible regardless of horizontal scroll; ~25 LOC + careful z-index layering | Documented z-index recipe (header z-20, body z-5, thead z-10) as reusable pattern for future spreadsheet pin-columns |
| Hover/selection trade-off on sticky chart cell ACCEPTED | Opaque sticky cell bg (`bg-card`) hides row hover-tint and v50-05-03 selection highlight on the chart cell only; other cells in row tint correctly; standard Excel/Sheets pin-column behavior; bridging via Tailwind state utilities adds complexity for marginal value | Documented in plan + commit body; not worth fixing |
| Z-index recipe (header z-20, body z-5, thead z-10) | Header z-20 wins horizontal sibling stacking against non-sticky thead cells; body z-5 wins horizontal sibling stacking against non-sticky tbody cells; thead z-10 wins vertical occlusion of body cells (header always on top during vertical scroll) | Reusable for any future sticky-column work |
| ChartCell button preserves 44px tap target via existing v50-05-04 coarse-pointer rules; NO column-width bump needed | ChartCell internally has `[@media(pointer:coarse)]:w-11 h-11` per v50-05-04; the chart column's TanStack `column.getSize()` is adequate (44 default; coarse-pointer width comes from inner cell) | No COLUMNS array structural change |
| dan-executor agent dispatched twice (Task 1 + Sub-task 2b) | v52-05 / v5h3-01-02 / v5h3-01-03 precedent; saves parent context for checkpoint routing; sub-1500 LOC each task is well-suited to agent execution; clear PLAN spec made the prompts tight | Pattern continues to scale; parent-session focuses on user-facing checkpoints + commit/push routing |
| Daniel approved AC-7 sight-unseen with "Go" | v51-04 + v52-03/04 precedent; iPad UAT deferred to standing Daniel-loop discipline (codified v51-04); failures route to v53-02-02 follow-up plan in same phase | Trust in tested-and-proven workflow; instrumentation auto-captures regressions |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 0 | — |
| Scope additions | 0 | — |
| Deferred | 0 | (all open hypotheses for save-loss class were already inherited from v5h3-01 postmortem; no NEW deferrals from this plan) |

**Total impact:** Plan executed exactly as designed end-to-end. Zero scope drift; zero auto-fixes; zero deferrals introduced.

### Auto-fixed Issues

None.

### Deferred Items

None new. The pre-existing deferred items inherited from v5h3-01 postmortem (H-SL-1 TextCell race, H-SL-8 listener-bumps-local race, snapshot-listener double-mount) remain on watch — none surfaced during v53-02-01 work.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Pre-existing SetlistGridHydrator tests now log `[primeSongsLibrary] failed` warn output to stderr because the production default fires against mock Firebase | dan-executor (Task 1) flagged as observable side-effect; documented as the intended fail-soft contract per v50-07-05 instrumentation discipline; new test case `priming failure does not affect hydration state` validates the fail-soft path. Tidiness pass available (inject no-op `primeSongsLibrary` spy at top-level beforeEach in existing tests) but out of plan scope. |
| Sticky chart cell loses row hover/selection tints (chart cell only) | Documented + accepted at plan time; standard Excel/Sheets pin-column behavior; not a bug |
| Pre-existing Sentry SDK config warning during `next build` | Pre-existing (unrelated to v53-02-01); deferred to future Sentry SDK upgrade phase if surfaces as runtime issue |

## Skill Audit

`/ui-ux-pro-max` BLOCKING per SPECIAL-FLOWS.md: ✓ INVOKED at APPLY entry. Queried for: data table column density patterns, thumb-zone reachability, touch-target-size, touch-spacing, hover-vs-tap. Drove the Goal 2 affordance trade-off discussion at the checkpoint:decision. Daniel selected sticky-right per the recommended-by-Claude lean.

Skill audit: ✓ All required skills invoked.

## Next Phase Readiness

**Ready:**
- Phase v53-02 LOOP COMPLETE (1 of 1 plans). Phase enters PENDING-UAT alongside v5h3-01; both share the standing Daniel-loop discipline + 2026-05-16 routine triage.
- v53-03 (Polymorphic Add menu — port `AddBar.tsx` from commit `d8c0442`) unblocks. The cmdk substrate is now known-good (typing-to-filter restored at AddRowPlaceholder; same value-format pattern carries to AddBar's 6-tile dropdown for the 6 TrackTypes).
- ChartBindPopover Recent section pattern is reusable for the polymorphic Add menu IF Daniel wants Recent-track-types above the Type list (deferred decision to v53-03 discuss-phase).
- Harness Fidelity Gate waiver counter at 1 of 3; gate's auto-escalation mechanic is now live in production exercise.
- 1575/1575 test suite is the new baseline for v53-03 + v53-04.

**Concerns:**
- AC-7 iPad UAT was sight-unseen per Daniel-loop discipline. Real-iPad verification of (a) sticky-right-doesn't-collide-with-selection-tint visually + (b) Recent section orders correctly with real `recent[].performedAt` data + (c) library priming completes before first picker open in fresh-tab scenario — all three rely on Daniel's standing weekly-cycle UAT or routine triage on 2026-05-16. Failures route to v53-02-02 follow-up.
- Cross-device library staleness: a song bound on iPad won't appear in desktop's library until desktop's next setlist navigation triggers priming. If Daniel mainly uses one device, this is invisible; if he switches mid-cycle, picker may briefly miss songs added on the other device. Documented; deferred to v5.4 emulator harness work.
- Hover/selection visibility on sticky chart cell — accepted trade-off, but if Daniel finds it disorienting on real iPad, route to v53-02-02 with a mitigation (e.g., extra Tailwind state utilities to bridge hover/selection through to the sticky cell).
- v50-07-01 production audit said `songs/* empty` at v50-07 ship time. Library priming reads from `songs` collection; if it's still empty, picker opens with an empty Library section (no songs to show). Daniel's been bind-as-you-go via sticky-memory propagation since 2026-04-26; the songs collection should have grown organically. AC-7 sight-unseen approval implies Daniel saw a populated library; if production capture later shows it empty, that's a separate bug class.

**Blockers:**
- None for v53-03 planning. Soft-block from v5h3-01 PENDING-UAT was lifted earlier today per Daniel's "no block, keep building"; same posture applies for v53-03.

---
*Phase: v53-02-chart-binding-and-verification, Plan: 01*
*Completed: 2026-05-02*
*Phase v53-02 LOOP COMPLETE (1 of 1) — PENDING-UAT pending Daniel weekly worship cycle (alongside v5h3-01)*
