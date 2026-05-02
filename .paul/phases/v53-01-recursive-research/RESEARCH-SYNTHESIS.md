# v53-01-01 RESEARCH-SYNTHESIS

**Date:** 2026-05-02
**Phase:** v53-01 Recursive research
**Tracks:** A (ChartBind diagnosis) / B (old-editor archaeology) / C (polymorphic Add + chart-peek design)
**iPad UAT:** Captured (NOT deferred) — Rabbi Daniel, 2026-05-02
**Recommended next action:** ⚠️ **RESCOPE** — insert v5h3-hotfix track BEFORE v53-02..04

---

## Executive Summary

Daniel's iPad UAT surfaced an unplanned **save-loss recurrence** — same class as the v5h-01 (2026-04-27) bug that the v5.0-hotfix's E+F+B defense-in-depth was supposed to prevent. "Some changes saved, some didn't" on a single device, surfaced only on next open. **This is more urgent than v5.3 UX work** and is the headline finding of v53-01.

The 3 planned research tracks all completed and produced actionable output. The expected ChartBind picker bug is real and confirmed (sub-mode (c) — focused but no filter results); cmdk value-format scoring + library-friction (no recents) are both implicated. AddRow's "no suggestions while typing" is a sibling symptom — likely shares root cause with ChartBind's empty-results behavior. The polymorphic Add menu Daniel misses from the old editor exists in git history (commit `d8c0442`) as `AddBar.tsx` 6-tile dropdown — RECOMMENDED to port to v53-03.

Daniel explicitly **dropped chart-verification peek from v5.3 scope** ("don't worry about this. Fix the other pieces."). Track C's chart-peek option set is shelved for a future milestone.

**Recommendation:** Insert a v5h3-hotfix milestone track ahead of v53-02..04 (same precedent as v5.0-hotfix). Diagnose + fix save-loss recurrence first; library-empty/no-suggestions is likely diagnosed in the same investigation; then v53-02 (ChartBind picker fix + ChartCell discoverability) and v53-03 (polymorphic Add menu) ship; v53-04 reduces to Track B's deferred chart-preview pattern only (small).

---

## Root-Cause + Design Confidence Matrix

| # | Surface | Confirmed Root Cause / Design Choice | Ruled Out | Still Open | Confidence | Phase |
|---|---|---|---|---|---|---|
| 1 | **Save-loss recurrence** ⚠️ NEW | Unknown — 6 hypotheses surfaced (H-SL-1..6 in ipad-uat-capture.md). Most plausible: TextCell single-tap-to-edit (v52-02-02) blur/commit race OR auth-claim staleness (v5h-01 §3 redux) OR new v52-x code path interaction. | None yet — needs production state inspection (IndexedDB outbox + Safari Web Inspector console + Network tab) | All 6 hypotheses still open. Production state capture in v5h3-01 is the disambiguator. | **LOW** | **v5h3-01 (NEW HOTFIX)** |
| 2 | **ChartBind picker filter broken** | Confirmed sub-mode (c) — picker opens, keyboard pops (implied), typing produces NO results. Root cause: H1 (cmdk `value={\`${title} ${id}\`}` format scoring degradation, ChartBindPopover.tsx:123) + H4 (no recents — alphabetical-only library is painful at scale, ChartBindPopover.tsx:69-72). Track A H1 + H4 = CONFIRMED. | H3 (TouchOrPopover suppressAutoFocus contract) — RULED OUT (correct by design per v52-02 contract). H5 (sticky-memory auto-bind) — by-design omission, not a bug. | H2 (Dexie hydration timing) — Daniel's "never sees or suggests anything" suggests this could be the dominant cause if library Dexie table is empty/hydrating. **Disambiguator: production songs-table count.** | **MEDIUM-HIGH** | v53-02 (likely bundled with v5h3 if H2 is the cause) |
| 3 | **ChartCell off-screen on iPad** ⚠️ NEW | NOT in original Track A scope. Daniel: "I have to scroll way to the right to see the chart button." Chart cell column placement issue — column order in SetlistGrid puts Chart after Notes (long content), so Chart cell is past the iPad viewport. | None — surfaced via UAT, not yet code-traced. | Solution choice: column-reorder vs. row-side affordance vs. sticky right-column. Needs /ui-ux-pro-max consultation at v53-02 APPLY entry. | **MEDIUM** | v53-02 |
| 4 | **AddRow no suggestions while typing** ⚠️ NEW | Same root cause class as Surface 2 — AddRowPlaceholder.tsx:43-47 uses identical `useLiveQuery(getDb().songs.toArray())` pattern as ChartBindPopover.tsx:63-67 + identical cmdk `value={\`${title} ${id}\`}` format at :138. If ChartBind's H2 (hydration empty) hits, AddRow hits the same way. ONE root cause, TWO surfaces. | — | Whether the fix bundle for Surface 2 covers AddRow automatically or needs explicit AddRow change. Likely automatic (smallest-fix path applies to both). | **HIGH** (shared root cause confirmed) | Bundled with Surface 2 (v53-02 OR v5h3-01 depending on H2 vs. H1) |
| 5 | **AddRow only allows Song** | AddRowPlaceholder.tsx hardcodes `type: 'song'` (SetlistGrid.tsx:1444, 1481). The 6-type polymorphism present in TrackType union (`song | header | reading | prayer | transition | note`, models.ts:34) is bypassed. Old-editor `AddBar.tsx` (deleted in commit `d8c0442`, v50-05-02) had a 6-tile dropdown. Track C Option A (grouped CommandList) recommended for the new substrate; Track B confirms Daniel's regret matches the deleted old-editor pattern. | Option C (type-prefixed shortcuts) — REJECTED for primary flow (undiscoverable, slash-conflict with song titles). | Option A vs. Option B (split-button) — Option A wins on substrate-reuse + type-prefix-still-works; Option B wins on one-tap-Add-Song matching old editor more closely. Daniel preference unknown. /ui-ux-pro-max consultation at v53-03 APPLY entry locks it. | **HIGH** (clear winning option set; Daniel preference between A/B is the only open question) | v53-03 |
| 6 | **Chart verification peek** | Daniel: "don't worry about this. Fix the other pieces." | All 3 chart-peek options DROPPED from v5.3 scope. | Future-milestone candidate; option set documented in track-c file for revival if needed. | **HIGH (out-of-scope-confirmed)** | OUT of v5.3 |
| 7 | **Editor affordance pass (Track B port-back)** | Track B inventory: Polymorphic Add menu = RECOMMENDED (covered by Surface 5 / v53-03). Inline chart binding (Replace/Unlink) = REJECTED (re-introduces v5h-01 fragility). Inline chart preview = DEFERRED to v53-04. | Inline chart binding (Replace/Unlink) — REJECTED with v5h-01 postmortem citation. | Whether v53-04 ships Track B's chart-preview port-back pattern OR collapses entirely (since Daniel dropped chart-peek, the chart-preview port-back may not be wanted either). | **MEDIUM** (depends on Daniel decision) | v53-04 (may shrink or collapse) |

---

## Old-Editor Port-Back Inventory (from Track B)

Source: commit `d8c0442` (2026-04-26, v50-05-02 spreadsheet-editor cutover); deleted files spelunked from git history.

| Pattern | Old SHA | What it did well (per Daniel's regret) | Risk if ported back | Verdict | Target phase |
|---|---|---|---|---|---|
| **Polymorphic Add menu (AddBar.tsx)** — single "Add Item" button → 6-tile dropdown (Song / Section / Reading / Prayer / Transition / Note) with distinctive icon colors (amber=Reading, blue=Prayer, emerald=Transition) | `d8c0442` | Discoverable; one button → all 6 types; icon colors give visual scan; matches Daniel's "MUCH better" memory exactly | NONE (pure UX affordance; uses applyEdit single path) | ✅ **RECOMMENDED** | **v53-03** (covered by Surface 5) |
| **Inline chart binding (InlineFields.tsx + SongRow.tsx)** — collapsed row showed file-name link + "Tap to link" hint; expanded row had Replace / Unlink buttons | `d8c0442` | Visible chart status without expanding; one-tap unlink | 🔴 CRITICAL — multiple entry points to chart mutation caused split-brain in v5h-01. Missing Firestore rules on `tracks/{id}` meant writes failed silently; UI cleared binding locally but server never got write; next mount restored binding from stale embedded array | ❌ **REJECTED** | None — anti-pattern callout |
| **Chart preview (SongRow collapsed)** — file name as clickable link + reference badge in collapsed row; verify binding without expanding | `d8c0442` | Zero-tap binding verification visible inline | LOW (safe IF ChartCell reads from Dexie, which it does post-v50-05) | ⏸️ **DEFERRED to v53-04** — but Daniel dropped chart-verification entirely from v5.3 scope, so this may collapse to OUT-OF-SCOPE | v53-04 (pending Daniel confirmation) |

### Anti-pattern callouts (MANDATORY — do NOT port back even if asked)

1. **Dual-write to embedded `setlists/{id}.tracks[]` + top-level `tracks/{id}` collection.** v5h-01 root cause class. The lazy-hydration cascade (v50-07-03) was the specific fix; re-introducing the dual-write re-introduces the bug. Cited: `.paul/postmortems/v5h-01-save-loss.md` §1.
2. **Optimistic-write state divergence** (`use-setlist-logic.ts` had 3 parallel state machines: React + localStorage draft + Firestore write with race conditions). Cited: v5h-01 postmortem §2.
3. **Replace/Unlink as dedicated mutation paths.** Multiple entry points to chart-binding mutation = split-brain risk. Single path through `ChartBindPopover → applyEdit('set','tracks')` is the safe contract.

---

## Phase Recommendations

### ⚠️ NEW — v5h3-01 hotfix (insert BEFORE v53-02..04)

**Theme:** Reproduce + diagnose + fix save-loss recurrence + library-empty-window. Same playbook as v5.0-hotfix (`.paul/postmortems/v5h-01-save-loss.md`).

**Recommended structure (3 plans, mirroring v5h-01):**
- **v5h3-01-01 — Reproduce + diagnose** (research; autonomous=false; HUMAN-ACTION for production state capture). Daniel captures: IndexedDB `crc-local`/outbox table contents from this morning's session (any failed/pending rows? what's their lastError?), IndexedDB `crc-local`/songs table count (is library actually populated?), Safari Web Inspector console errors (rules-denied? 4xx/5xx?), Network tab `tracks/*` failed requests. 6 hypotheses listed in `ipad-uat-capture.md` — Daniel's evidence narrows.
- **v5h3-01-02 — Fix** (execute; ~2-4h depending on diagnosis). Likely defense-in-depth pattern (E+F+B precedent from v5h-01-02).
- **v5h3-01-03 — Postmortem update** (execute; ~30min; autonomous=true). Extend `.paul/postmortems/v5h-01-save-loss.md` OR create new `.paul/postmortems/v5h3-01-save-loss-recurrence.md`. Critically: identify why kitchen-sink harness (v50-07-04) didn't catch this — the named harness-fidelity gap from v5h-01 §5 (Firebase emulator + thin RTL editor↔perf-view test pair) has NOT been closed since v5h-01-04 deferred it. This recurrence is evidence the gap is no longer optional.

**/ui-ux-pro-max gate:** N/A for v5h3-01-01 (research) and v5h3-01-03 (postmortem). Optional for v5h3-01-02 if fix is purely data-flow; required if any UI surfaces (e.g., new error/recovery affordance).

### v53-02 — Chart binding fix + ChartCell discoverability (NOT verification peek)

**Updated scope (chart-verification peek DROPPED per Daniel):**
1. **ChartBind picker filter fix.** Track A's Smallest-Fix path (~10 LOC, `ChartBindPopover.tsx:123` cmdk value format from `\`${title} ${id}\`` → `${title}`; mirror in `AddRowPlaceholder.tsx:138`). If v5h3-01 diagnoses H2 (Dexie hydration empty) as the dominant cause, smallest-fix may already be sufficient since hydration is fixed in v5h3 — re-evaluate at v53-02 plan time.
2. **ChartCell discoverability on iPad.** NEW from UAT — currently must scroll right past Notes column. Options: column-reorder (Chart left of Notes), sticky-right-column, OR row-side affordance (chart-icon button at row gutter). /ui-ux-pro-max consultation at APPLY entry recommended.
3. **(OPTIONAL) Track A H4 — recents section.** If Daniel still feels library friction after smallest-fix lands, add Track A's Systemic-Fix path "Recent" section (~80-120 LOC). Decide at v53-02 plan time based on UAT after smallest-fix ships.

**Plan count estimate:** 1 cohesive plan (column-fix + cmdk-value-fix bundled as a single vertical slice; recents deferred to v53-02-02 if needed).
**Files modified estimate:** SetlistGrid.tsx (column order or row-side affordance) + ChartBindPopover.tsx + AddRowPlaceholder.tsx (mirror cmdk fix).
**LOC estimate:** ~30-50 source + tests.
**/ui-ux-pro-max gate:** BLOCKING.

### v53-03 — Polymorphic Add menu

**Scope unchanged in shape:** Replace `AddRowPlaceholder.tsx` single-purpose Add with polymorphic 6-type Add menu. Track C Option A (grouped CommandList with CommandGroup headings) is the strongest recommendation; Track B confirms the old-editor pattern Daniel misses was a 6-tile dropdown with distinctive icon colors (Option A and old-editor pattern are visually similar). Option B (split-button matching old-editor more literally) is viable if Daniel insists.

**MUST address Track C HIGH risk:** CommandItems currently violate 44×44 touch target (`py-1` ~16px). Bump to `min-h-[44px] [@media(pointer:coarse)]:py-2` per /ui-ux-pro-max rule. Required for Option A compliance.

**Decision needed at v53-03 PLAN entry:** Option A vs. Option B. /ui-ux-pro-max consultation drives.

**Plan count estimate:** 1 plan.
**Files modified estimate:** AddRowPlaceholder.tsx (refactor to polymorphic) + SetlistGrid.tsx (handler — handleAddSong now needs `handleAddByType(type, ...)`) + TypeCell.tsx import for icons + tests.
**LOC estimate:** ~80-150 source + tests depending on Option A vs. B.
**/ui-ux-pro-max gate:** BLOCKING.

### v53-04 — Editor affordance pass (likely SHRINKS or COLLAPSES)

Original scope: whatever Track B surfaces beyond the polymorphic Add menu. Track B surfaced ONE additional candidate (chart-preview port-back) and Daniel dropped chart-verification entirely. Net: v53-04 likely has **zero remaining scope** unless Daniel adds something at the synthesis decision checkpoint.

**Recommendation:** **COLLAPSE v53-04 entirely** unless Daniel pulls in something specific. v5.3 becomes 3 phases (v53-01 / v53-02 / v53-03) instead of 4. Roadmap update needed if collapsed.

---

## Open Questions for Daniel (resolve at decision checkpoint)

1. **Save-loss recurrence — confirm v5h3-hotfix insertion.** Recommendation: yes, insert v5h3-01..03 before v53-02..04. Risk of NOT inserting: v5.3 ships and Daniel's editor still loses edits. Estimated v5h3 cost: ~1-2 sessions.
2. **Production state capture for v5h3-01-01** — willing to capture IndexedDB outbox + Safari Web Inspector console + Network tab from this morning's affected setlist? (Same UAT gear as v5h-01-01.) Without it, save-loss confidence stays LOW and fix may be wrong (cf. v5h-01 §2 "3 wrong handoff hypotheses").
3. **Polymorphic Add (v53-03) — Option A or Option B?** A = grouped CommandList in current cmdk substrate (one mental model, type-prefix search still works). B = split-button matching old-editor 6-tile dropdown more literally. Daniel's "old menu was MUCH better" suggests B; Track C's substrate-reuse argument suggests A. Lock at v53-03 PLAN time after /ui-ux-pro-max consultation.
4. **Library sort — recents-first or alphabetical?** If v5h3 fixes the empty-library issue and the library hydrates correctly, do you want a "Recent" section above alphabetical (Track A H4 systemic-fix), or is alphabetical-only acceptable?
5. **v53-04 collapse.** Track B's chart-preview port-back is the only remaining v53-04 candidate; Daniel dropped chart-verification. Collapse v53-04 entirely (v5.3 = 3 phases) OR keep open in case something surfaces during v53-02/03 execution?
6. **ChartCell discoverability solution.** Column-reorder (Chart promoted left of Notes) vs. sticky-right-column vs. row-side affordance (chart-icon button at row gutter)? Or is /ui-ux-pro-max consultation at v53-02 PLAN entry the right place to lock?

---

## Round-2 Research Gaps

**Save-loss recurrence (LOW confidence)** — production state capture in v5h3-01-01 is the round-2. Cannot be closed by code-read alone (v5h-01 lesson). Recommendation: do NOT proceed to v53-02..04 without v5h3-01-01 closing this gap.

**ChartCell discoverability (MEDIUM confidence)** — solution choice (column-reorder vs. sticky vs. affordance) is a /ui-ux-pro-max consultation question, NOT a research gap. Lock at v53-02 PLAN entry.

**ChartBind H2 vs. H1 (MEDIUM-HIGH confidence)** — disambiguator is production songs-table count (was the library populated?). v5h3-01-01 production state capture answers this for free.

No additional research subagent dispatch recommended. v5h3-01-01 production capture closes the LOW-confidence gap.

---

## Next Action

⚠️ **RESCOPE recommendation** at the decision checkpoint:

1. Update `.paul/ROADMAP.md`:
   - Insert **v5h3 — Save-loss recurrence hotfix** BEFORE v5.3 phases (or as a child of v5.3 like v5.0-hotfix was a sibling of v5.0)
   - v5h3 has 3 plans: v5h3-01-01 reproduce+diagnose / v5h3-01-02 fix / v5h3-01-03 postmortem
   - Drop v53-04 (or hold-open empty for now)
   - Drop chart-verification peek from v53-02 scope explicitly
2. Update `.paul/STATE.md`: current focus shifts to v5h3-01 instead of v53-02
3. Run `/paul:plan-fix` or `/paul:plan` for v5h3-01-01 next
4. Daniel captures production state in v5h3-01-01 HUMAN-ACTION checkpoint
5. Fix lands; postmortem extended; THEN v53-02 + v53-03 unblock

Alternative: `approve` (no rescope) — if Daniel believes the save-loss is a one-off and not worth a hotfix track, proceed to v53-02 directly. **NOT recommended** given v5h-01 precedent.

Alternative: `round-2` — only if Daniel disagrees with the rescope framing and wants more research before committing to a hotfix. **NOT recommended** — production state capture IS the round-2, and it belongs in v5h3-01-01.

---

## Back-propagated update — ChartBind H2 disambiguation status

**Updated 2026-05-02 by v5h3-01-01-investigation.md:** ChartBind H2 (Dexie hydration empty/stale at first ChartBindPopover render) DISAMBIGUATION DEFERRED — songs-table count not captured (Daniel's iPad refresh + autonomous-mode session). Verdict pending production capture in v5h3-01-01b round-2 plan. v53-02 fix-path decision (smallest vs. systemic) cannot lock until H2 resolves.

## Files produced

- `.paul/phases/v53-01-recursive-research/track-a-chartbind-research.md` (Track A — 170 lines)
- `.paul/phases/v53-01-recursive-research/track-b-old-editor-archaeology.md` (Track B — 91 lines)
- `.paul/phases/v53-01-recursive-research/track-c-polymorphic-add-and-chart-peek.md` (Track C — 108 lines)
- `.paul/phases/v53-01-recursive-research/ipad-uat-capture.md` (UAT — 137 lines)
- `.paul/phases/v53-01-recursive-research/RESEARCH-SYNTHESIS.md` (this file)

Zero source code modified (`git diff sheet-music-app/src/` is clean).
