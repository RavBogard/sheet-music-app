# Phase v53-02 — Chart binding picker fix + ChartCell discoverability

**Status:** 🚧 Discuss complete; ready for /paul:plan
**Created:** 2026-05-02 via /paul:discuss-phase
**Milestone:** v5.3 — Editor UX Repair (1 of 4 phases done; v5h3-01 ✅ LOOP COMPLETE PENDING-UAT in parallel)
**Blocking gate:** `/ui-ux-pro-max` BLOCKING at PLAN entry per SPECIAL-FLOWS.md (UI-touching phase)
**Standing precedent:** Daniel-loop UAT discipline + Harness Fidelity Gate (binding from v5.3) — see PROJECT.md §Constraints

---

## Goals (from discussion)

### Goal 1 — Chart binding picker actually returns results when typing (Surface 1)
**Decision: SYSTEMIC FIX path** (NOT smallest-fix).

The smallest-fix (~10 LOC cmdk value-format change) lands the search-typing fix; Daniel selected the systemic path because the same songs cycle weekly per his workflow (auto-memory: "90% same week to week"), so a "Recent" section + library priming has compounding utility beyond the search-typing bug.

Three layers in this one goal:
1. **cmdk value-format fix** — `${title} ${id}` → `${title}` at `ChartBindPopover.tsx:123` AND `AddRowPlaceholder.tsx:138` (mirror — same substrate). Restores typing-to-filter on iPad/desktop. ~10 LOC. AddRow no-suggestions fix is automatic byproduct.
2. **Library priming** — songs table populated proactively (vs. lazy on picker open) so the picker has a hydrated dataset to filter against immediately on first open per session. Open question for /paul:plan: load on app boot vs. lazy on first picker open vs. on setlist hydration.
3. **"Recent" section in ChartBindPopover** — top-of-list section showing global most-recently-used songs across ALL setlists (NOT per-setlist scope). Requires Dexie schema bump v3 → v4: additive `lastUsedAt: number?` field on `songs` (non-indexed-OR-additive-index per v50-04 rule). Lights up future "frequent songs" surfaces. Approximate cap: 5-10 recents (set at PLAN time).

### Goal 2 — ChartCell discoverable on iPad without horizontal scrolling (Surface 2)
**Decision: /ui-ux-pro-max decides cold at PLAN entry.** No Daniel pre-bias.

Three candidate affordances on the table:
- Column-reorder (move Chart left of Notes)
- Sticky right-column (Chart pinned regardless of horizontal scroll)
- Row-side affordance (chart-icon at row gutter, off-grid)

/ui-ux-pro-max consultation at PLAN entry locks the choice — query data-density + tablet-first + reachable-controls patterns; surface trade-offs; commit to one option in PLAN's <decisions> block.

### Goal 3 — Chart-verification peek
**EXPLICITLY DROPPED.** Not in scope. Per Daniel: *"don't worry about this. Fix the other pieces."*

---

## Approach (from discussion + project conventions)

### Plan shape
**Single plan, both surfaces.** Vertical-slice precedent from v51/v52 (cohesive single commit covering source + tests as one atomic deliverable). v53-02-01 covers both Goal 1 layers + Goal 2 affordance choice. v53-02-02 only opens if Daniel-loop UAT surfaces a follow-up class per v51-04 rule.

### Layering
Goal 1 layered (cmdk value fix → library priming → Recent section); each layer can ship independently in worst-case rollback. PLAN should sequence them so commit/rollback granularity is preserved if any layer surfaces a regression during APPLY verification.

### Library priming + Recent section data path
- Recent ranking driven by new `songs.lastUsedAt: number` (Dexie schema v3 → v4 additive bump).
- Updated when a track binds to a song (ChartBindPopover.commit OR seedTrackFromSong path).
- Recent list ordered desc by `lastUsedAt`; tie-break by title asc.
- "Recent" section sits ABOVE the alphabetical library list; cmdk handles dual-section layout via `<CommandGroup heading>`.
- Empty state (first-ever use): hide section; library shows alphabetical only.

### /ui-ux-pro-max consultation surface (Goal 2)
At PLAN entry, query specifically:
- Tablet-first column-density patterns (TanStack v8 + iPad)
- Sticky-column trade-offs vs. column-reorder vs. off-grid affordance
- Touch reachability (44px min; thumb-zone iPad-landscape)
- Visual hierarchy preservation (don't break v51-02 tier classes)

### Boundaries / patterns to avoid
- **DO NOT break v51-01 picker contracts.** TouchOrPopover + DropdownCell mode='discrete'|'searchable' substrate is locked; this phase consumes it, doesn't change it.
- **DO NOT introduce a new dropdown primitive.** Reuse cmdk + shadcn Command + TouchOrPopover.
- **DO NOT break v50-04 sticky-memory contract.** seedTrackFromSong + propagateTrackEditToSong continue working. Recent section reads `songs.lastUsedAt`; doesn't write through propagation path.
- **DO NOT break v51-02 SetlistGrid tier classes.** Goal 2 affordance choice must preserve existing tier 1/2/3/4 visual hierarchy unless /ui-ux-pro-max explicitly rationalizes a change.
- **DO NOT touch sync engine, snapshot-listener, lazy-hydration, perf-view, Firestore rules.** This phase is UI + Dexie schema only. (Harness Fidelity Gate semantics: this phase touches `src/lib/local/schema.ts` for the v3→v4 bump — that triggers the gate's binding-semantics. Per the gate's waiver clause, this plan must EITHER wait for v5.4 phase 1 harness remediation OR carry an explicit waiver in `<boundaries>` SCOPE LIMITS naming the open v5.4 ticket. Daniel's "no block, keep building" direction selects the waiver path; PLAN must include it explicitly.)
- **DO NOT change v51-04 "Vocal Lead" terminology surfaces.**
- **DO NOT touch admin panels** (out of scope per project memory).

### Tablet-first verification
Every Goal 1 + Goal 2 deliverable must be verified on real iPad in addition to desktop. Daniel-loop UAT discipline applies; UAT failures route to v53-02-02 follow-up plan in same phase per v51-04 rule.

---

## Open questions (deferred to /paul:plan or /ui-ux-pro-max)

| # | Question | Resolves at | Owner |
|---|----------|-------------|-------|
| Q1 | Library priming trigger: app boot, first picker open, or setlist hydration? | PLAN | Daniel + tech read of existing hydration timing |
| Q2 | Recent section cap (5 vs 7 vs 10 songs) | PLAN | /ui-ux-pro-max + Daniel |
| Q3 | Recent ordering: lastUsedAt desc only, or weighted recency × frequency? | PLAN | Daniel preference; default lastUsedAt-desc (simpler; fits "90% same week" pattern) |
| Q4 | Goal 2 affordance: column-reorder vs sticky-right vs row-gutter | PLAN entry | /ui-ux-pro-max BLOCKING |
| Q5 | When does `lastUsedAt` get written? On ChartBindPopover.commit only, or also on track-create-from-library via AddRowPlaceholder? | PLAN | tech read of write paths; default both |
| Q6 | Schema migration shape: pure-additive (lastUsedAt: number?) or backfill from v50-04 `songs.recent[]` arrays? | PLAN | tech read of existing recent-tracking — backfill is cheap if data is already there |
| Q7 | Does Goal 2 affordance choice require a Tailwind theme change OR new primitive? | /ui-ux-pro-max | UI surface assessment |
| Q8 | Test surface: keep at unit + RTL, or add a Playwright case for column-density on iPad? | PLAN | Default unit + RTL; Playwright deferred per v50-07-04 precedent (harness-only path) |
| Q9 | Harness Fidelity Gate waiver text: how strictly to phrase the v5.4-ticket reference? | PLAN | Reference v5h3-01 postmortem Action Item #2; v53-02 waiver counter starts at 1 (gate auto-escalates after 3 in a row) |

---

## Cross-references (research artifacts to consume at PLAN time)

- `.paul/phases/v53-01-recursive-research/RESEARCH-SYNTHESIS.md` — full 7-row confidence matrix; v53-02 surfaces are in the matrix
- `.paul/phases/v53-01-recursive-research/track-a-chartbind-research.md` — Track A research (ChartBind diagnosis; smallest-fix vs systemic-fix paths)
- `.paul/phases/v53-01-recursive-research/track-c-polymorphic-add-and-chart-peek.md` — Track C (chart-verify peek dropped; useful for v53-03 polymorphic Add menu, not directly for v53-02 — but Goal 2 affordance candidates may borrow framing)
- `.paul/phases/v53-01-recursive-research/v53-01-01-SUMMARY.md` — research phase close including iPad UAT findings
- `.paul/phases/v53-01-recursive-research/ipad-uat-capture.md` — iPad UAT deferral doc with per-phase UAT acceptance criteria
- `.paul/postmortems/v5h3-01-save-loss-recurrence.md` — recent incident; constrains the harness-fidelity gate waiver framing
- `src/components/setlist/grid/cells/ChartBindPopover.tsx` (line 123: cmdk value format)
- `src/components/setlist/grid/AddRowPlaceholder.tsx` (line 138: mirror substrate)
- `src/lib/songs/defaults.ts` — sticky-memory; check if `recent[]` array has lastUsedAt-equivalent already
- `src/lib/local/schema.ts` — Dexie schema for v3 → v4 bump
- `src/lib/local/types.ts` — LocalSong type for additive lastUsedAt field

---

## Plan-shape estimate

- **Single plan v53-02-01** covering Goal 1 (3 layers) + Goal 2 (1 affordance — choice locked by /ui-ux-pro-max at PLAN entry).
- **LOC estimate:** ~120-180 source + ~80-120 tests.
- **Files modified:** ~6-8 source + ~3-5 test (within v50-05 / v51-01 / v51-02 boundaries; preserves all locked contracts).
- **Type:** execute · autonomous=false (one /ui-ux-pro-max consultation at PLAN entry → counts as a decision checkpoint OR resolves into PLAN narrative; one HUMAN-VERIFY at end for Daniel-loop UAT on iPad).
- **Wave:** 1 (no dependency on v5h3-01 PENDING-UAT clear per Daniel "no block, keep building"; soft-block lifted in ROADMAP).
- **Skills required at APPLY:** /ui-ux-pro-max (BLOCKING per SPECIAL-FLOWS.md).
- **Boundary-locked:** sync engine / snapshot-listener / lazy-hydration / perf-view / Firestore rules / v51-01 picker substrate / v51-02 tier classes / v51-04 terminology / admin panels / v50-04 sticky-memory contract.
- **Harness Fidelity Gate:** waiver path — explicit SCOPE LIMITS entry naming v5.4 phase 1 harness ticket; reason: "Goal 1 schema bump is additive non-indexed v3→v4 per v50-04 rule; UI-only changes elsewhere; UAT closes the gap for this plan."

---

*Discussion complete. Next: `/paul:plan v53-02` to create v53-02-01-PLAN.md from this context.*
