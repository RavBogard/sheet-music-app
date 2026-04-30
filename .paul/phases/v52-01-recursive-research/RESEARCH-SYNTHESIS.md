# v5.2 Research Synthesis

**Generated:** 2026-04-30
**Inputs:** track-a-ipad-focus-research.md • track-b-sync-indicator-research.md (incl. Issue 1 follow-up) • track-c-touch-affordance-audit.md • track-d-template-data-model.md • ipad-uat-capture.md (DEFERRED)
**Decision-checkpoint required:** Yes (Task 4 of v52-01-01-PLAN.md)

---

## Executive Summary

All 7 v5.2 issues lock at HIGH confidence from code-read alone, with iPad UAT capture deferred to post-deploy Daniel-loop UAT per v51-04-codified discipline. **Issues 2+3 share root cause** (TouchOrPopover unconditional `preventDefault` leak — single ~30 LOC fix). **Issues 1+4 are independent** despite both manifesting on the SyncIndicator surface — Issue 1 is a missing recovery affordance for a terminal `failed` FSM state compounded by phantom-row blocking + auth-claim staleness; Issue 4 is a kebab button hard-disabled by code (`disabled={!onOverflow}`, never receives the prop). **Issue 5** has 3 P0 hover-to-reveal blockers fixable with a 1-line Tailwind utility per surface (~3 LOC total). **Issue 7** is a CTA hierarchy mismatch in SetlistCards that bundles into v52-04. **Issue 6** template-management has a clear architectural recommendation (Option C — system/templates pointer doc) with admin-only permission and phased scope (Shabbat morning + Erev Shabbat first). **Recommended phase shape:** 4 execution plans across v52-02 → v52-05, all parallel-eligible after v52-01 closes.

---

## Root-Cause Confidence Matrix

| Issue | Description | Confirmed Root Cause | Ruled Out | Still Open | Confidence | Phase |
|-------|-------------|----------------------|-----------|------------|------------|-------|
| **1** | iPad red "Failed" SyncIndicator (desktop OK) | Per-device outbox divergence (Dexie is per-device IndexedDB; iPad accumulated phantom-row failures `setlists/CTAi6kgkTUpGYMO1Ffx7` + likely auth-claim staleness co-factor) compounded by terminal `failed` FSM state with NO in-app recovery affordance (`SyncIndicator.onRetryFailed` prop never provided in production; `state-machine.ts:36-41` preserves failed state across all events) | H4 snapshot-listener delivery divergence (listener uses same auth + same query as desktop; failure shape would differ); H5 alone (failed-state stickiness is BY-design but lacks recovery UX) | Whether persistent vs transient on Daniel's actual iPad; whether sign-out/in alone clears it | **HIGH** | v52-03 |
| **2** | iPad: tapping a text field doesn't pop keyboard | v51-01 `TouchOrPopover.onOpenAutoFocus(preventDefault)` is unconditionally suppressed on `(pointer:coarse)`, breaking the focus-trap infrastructure that Radix Popover needs to propagate focus into Portal'd children on iOS Safari (track-a-ipad-focus-research.md confirmed; chain: H1 confirmed, H3 ruled out, H5 ruled out — shared substrate with Issue 3) | H3 `(pointer:coarse)` media-query bleed-through (Tailwind not the leak vector); H5 separate root causes (cross-confirmed shared) | Which exact surface scope on iPad — track-name only, all grid cells, MobileEditSheet, wizard setlist-name? Affects whether substrate fix covers everything | **HIGH** | v52-02 |
| **3** | iPad: Chart picker search broken | Same root as Issue 2 — focus-trap suppression breaks cmdk `<CommandInput>` focus propagation inside ChartBindPopover's Portal on iOS Safari | H4 cmdk-specific iOS quirk (cmdk works elsewhere when not Portal'd via TouchOrPopover); H5 separate root cause (shared with Issue 2) | Sub-mode disambiguation (a/b/c) — iPad UAT post-deploy locks this | **HIGH** | v52-02 |
| **4** | All-platforms kebab red line / unclickable | SetlistGridTopBar.tsx:65 renders `<button disabled={!onOverflow}>`; SetlistGrid.tsx:1518 never passes `onOverflow` prop (SetlistGridProps has no `onOverflow` field at lines 664-682). Kebab is **always disabled** by code, regardless of sync state. The "red line" Daniel sees is the v51-h01 inline lastError pill rendering adjacent to the dimmed kebab when sync state is `failed`, creating visual confusion. | H6 z-index overlap (no z-index conflict in CSS); H7 state-driven disable (it's prop-driven, not state-driven); H9 wrong icon rendered (it's the kebab; just permanently disabled) | None — code-read fully diagnoses this | **HIGH** | v52-03 |
| **5** | iPad setlists list: kebab needs always-visible | 3 P0 hover-to-reveal findings: SetlistCards.tsx:80 (UpcomingSetlistCard kebab `md:opacity-0 md:group-hover:opacity-100`); SetlistCards.tsx:208 (SetlistCard kebab same pattern); CalendarDayCell.tsx:104 (Plan Service button `opacity-0 group-hover:opacity-100`). Fix per v50-05-04 precedent: add `[@media(pointer:coarse)]:opacity-100` to each (~1 LOC each, ~3 LOC total). | All other audited hover-reveal patterns (P1/P2 cosmetic; not iPad-blocking) | None | **HIGH** | v52-04 |
| **6** | Save-as-default-template feature | New `system/templates` Firestore pointer doc (Option C), admin-only write, `findLastMatchingService` resolves through pointer → falls back to existing implicit lookup if pointer null/missing → graceful pointed-setlist-deleted handling. Phased scope: Shabbat morning + Erev Shabbat first; expand to all 11 ServiceTypes once verified. ~125 LOC + 1 API route + firestore.rules update. No data migration on existing 24 hydrated + 5 unhydrated setlists. | Option A (data duplication unacceptable for sticky-memory contract); Option B (uniqueness-invariant footgun); Option D (doesn't solve canonical-template problem) | (1) admin-only vs band_leader-write tier; (2) phased rollout cutoff (just 2 ServiceTypes vs all 11); (3) UI feedback affordance (toast/modal/inline); (4) deleted-pointer behavior (auto-clear / warn / silent fallback) — all surface in decision checkpoint | **HIGH** (architecture); MEDIUM on scope details pending Daniel's answers to 4 OQs | v52-05 |
| **7** | Edit-primary in setlists view | SetlistCards.tsx renders "Edit Setlist" with `variant="secondary"` (muted gray); "Clone" is the visually-featured CTA. No "Close setlist" button exists in this surface (Daniel's "Close setlist" reference may have been about a different surface — verify during v52-04 plan, but Edit-vs-Clone hierarchy is the actionable finding). Bundle a styling fix in v52-04 alongside Issue 5 since they share file. | None | Daniel's "Close setlist" reference: was he describing the detail-page header, the list-row variant, or a different surface? Verify in v52-04 plan. | **HIGH** (surface identified, fix shape clear); MEDIUM on "Close setlist" semantics | v52-04 |

**Confidence target met:** 6 of 7 HIGH; 1 of 7 HIGH-with-Medium-on-scope-details (Issue 6 needs Daniel's answers to 4 open questions during decision checkpoint). 0 LOW. No round-2 research triggered.

---

## Cluster Affirmations

### Issues 2+3 share root cause? **YES**
- Both trace to `TouchOrPopover.tsx` unconditional `onOpenAutoFocus(preventDefault)` on `(pointer:coarse)`.
- Track A: "Both issues are manifestations of the same broken focus-trap initialization on iOS Safari caused by v51-01's blanket `preventDefault()` call."
- Single fix: introduce `suppressAutoFocus?: boolean` prop on TouchOrPopover; default `false`; only DropdownCell discrete-mode opts in.
- ~30 LOC across TouchOrPopover.tsx + DropdownCell.tsx + tests.

### Issues 1+4 share root cause? **NO**
- Both manifest on the **same surface** (SyncIndicator + adjacent kebab in SetlistGridTopBar) — that's why they look related to Daniel.
- But the code paths are independent:
  - Issue 1: data-state divergence + missing recovery affordance (`SyncIndicator.onRetryFailed` never provided; `state-machine.ts` failed state is terminal; per-device IndexedDB outbox divergence + auth-claim staleness compounding).
  - Issue 4: hard-coded `disabled` prop on a kebab button that should either be wired or removed (`SetlistGridTopBar.tsx:65` + `SetlistGrid.tsx:1518` mismatch).
- They share **phase** (v52-03 covers both as the SyncIndicator UX overhaul) but not **fix** — they ship as separate tasks within one plan.

### Unexpected clusters discovered during research?
- **Yes:** Issues 5 + 7 share the same file (`SetlistCards.tsx`). Bundle in one v52-04 plan instead of splitting.
- **Yes:** v52-01's "shared-substrate hypothesis vs N independent fixes" question resolves cleanly: **2 shared (2+3)**, **2 independent within shared phase (1+4)**, **2 file-bundled (5+7)**, **1 standalone (6)**. Maps cleanly to 4 execution plans across phases v52-02..v52-05.

---

## Phase Recommendations

### Phase v52-02: iPad focus + cmdk system fix (Issues 2 + 3)

**Plan shape:** 1 plan, single substrate fix.
**Approach:** Add `suppressAutoFocus?: boolean` prop to TouchOrPopover; default `false`; only DropdownCell discrete-mode passes `true`. Restores manual-tap focus for all other consumers (text inputs, cmdk inputs, MobileEditSheet) while preserving v51-01's "no keyboard until deliberate tap" intent for discrete-mode pickers.
**Estimated scope:** ~30 LOC across `TouchOrPopover.tsx`, `DropdownCell.tsx`, plus test updates.
**Files to modify (per Track A):** `src/components/grid/cells/TouchOrPopover.tsx`, `src/components/grid/cells/DropdownCell.tsx`, related test files.
**/ui-ux-pro-max gate:** BLOCKING per SPECIAL-FLOWS.md (touch UX changes).
**Daniel-loop UAT acceptance criterion (post-deploy):** keyboard pops on first tap on track-name cell, Notes cell, Vocal Lead cell, MobileEditSheet inputs, wizard setlist-name field, AND ChartBindPopover search input. Issue 3 sub-mode disambiguated as (a) and resolved by substrate fix. **If sub-mode is (b) or (c)**, route a follow-up plan in v52-02 phase per v51-04 UAT-failure rule.
**Risks:** Sub-mode (b)/(c) on Issue 3 — substrate fix may not cover cmdk filter/bind issues if those exist independently. Mitigation: Daniel-loop UAT explicitly disambiguates.
**Order:** Wave 1 (parallel-eligible with v52-03 / v52-04 / v52-05).

### Phase v52-03: SyncIndicator failure UX overhaul (Issues 1 + 4)

**Plan shape:** 1 plan, 2 independent fixes within.
**Approach (Issue 4):** Remove the always-disabled kebab from SetlistGridTopBar.tsx (lines 61-75, ~10-15 LOC removal) since SyncIndicator already provides all necessary actions. **OR** properly wire `onOverflow` with concrete actions (settings/info/diagnostics) — Daniel preference resolves at v52-03 plan time. Track B recommended removal as the simpler, more-honest fix.
**Approach (Issue 1):** Add "Clear failed rows" button to SyncIndicator (currently disabled when `onRetryFailed` is undefined; wire it). Pair with "Sign out and back in" affordance to address auth-claim staleness co-factor. New `src/lib/sync/cleanup.ts` helper for outbox-row deletion.
**Estimated scope:** ~10-15 LOC (Issue 4 removal) + ~50-80 LOC (Issue 1 cleanup helper + button) + ~15-25 LOC (sign-out pairing) = ~75-120 LOC + tests.
**Files to modify:** `src/components/setlist/grid/SyncIndicator.tsx`, `src/components/setlist/grid/SetlistGridTopBar.tsx`, `src/components/setlist/grid/SetlistGrid.tsx`, new `src/lib/sync/cleanup.ts`, related tests.
**/ui-ux-pro-max gate:** BLOCKING per SPECIAL-FLOWS.md (visual treatment + new affordances).
**Daniel-loop UAT acceptance criterion (post-deploy):** (1) Daniel reproduces red Failed on iPad → "Clear failed rows" button visible → tapping it clears outbox → SyncIndicator returns to green; (2) signing out and back in clears any residual auth-staleness failures; (3) kebab is removed (or properly wired) on both desktop and iPad — no "red line" visual confusion.
**Risks:** Cleanup helper must NOT delete in-flight pending rows that haven't dead-lettered yet — only `status === 'failed'` rows. Tests must guard this. Sign-out flow may interact with cross-tab leader lock from v50-03; verify v50-06-01 test still passes.
**Hotfix-split consideration:** **NO** — Track B Q1/Q2/Q3 firmed Issue 1 to HIGH confidence; the recovery affordance and the kebab fix can ship in one cohesive v52-03 plan. No emergency hotfix needed.
**Order:** Wave 1 (parallel-eligible with v52-02 / v52-04 / v52-05).

### Phase v52-04: Touch affordance + setlist lifecycle UX (Issues 5 + 7)

**Plan shape:** 1 plan, 2 fixes bundled by shared file.
**Approach (Issue 5):** Add `[@media(pointer:coarse)]:opacity-100` Tailwind utility to 3 P0 surfaces — SetlistCards.tsx:80 (UpcomingSetlistCard kebab), SetlistCards.tsx:208 (SetlistCard kebab), CalendarDayCell.tsx:104 (Plan Service button). 1 LOC per surface, ~3 LOC total.
**Approach (Issue 7):** In SetlistCards.tsx, change "Edit Setlist" button variant from `secondary` to primary (`default` or `brand`) and demote "Clone" to secondary. Confirm with Daniel during plan whether his "Close setlist" reference is about this surface (Edit-vs-Clone hierarchy) or a different surface (e.g., setlist detail header). ~5-10 LOC depending on scope.
**Estimated scope:** ~10-15 LOC + tests.
**Files to modify:** `src/components/setlists/SetlistCards.tsx`, `src/components/calendar/CalendarDayCell.tsx`, related tests, jest-axe a11y scan.
**/ui-ux-pro-max gate:** BLOCKING per SPECIAL-FLOWS.md (button hierarchy + visual prominence).
**Daniel-loop UAT acceptance criterion (post-deploy):** kebab visible without hover on iPad on every setlist card (upcoming + past); Plan Service button visible on calendar day cell on iPad; Edit Setlist is the most-prominent CTA in setlist cards.
**Risks:** Trivial; smallest plan in v5.2.
**Order:** Wave 1 (parallel-eligible).

### Phase v52-05: Default-template management (Issue 6)

**Plan shape:** 1 plan with **decision checkpoint at top** to lock 4 open questions before APPLY.
**Approach:** Implement Option C — `system/templates` Firestore pointer doc + admin-only write rule + new POST API route + editor kebab "Save as default for {service-type}" entry point + wizard `findLastMatchingService` consumer prefers pointer when available. Phased scope: launch with Shabbat morning + Erev Shabbat first; expand later.
**Estimated scope:** ~125 LOC across new API route, service helper extension, kebab menu addition, firestore.rules block, types update, and tests.
**Files to modify:** new `src/app/api/setlist/[id]/save-as-default/route.ts`, `src/services/createSetlistService.ts` (extend findLastMatchingService), `firestore.rules` (add `match /system/templates`), `src/types/setlist.ts` or `src/types/models.ts` (templates pointer doc shape), `src/components/setlists/grid/SetlistGridTopBar.tsx` or wherever the editor kebab lives (NEW menu item — Issue 4 may have removed kebab; coordinate with v52-03), tests.
**/ui-ux-pro-max gate:** BLOCKING per SPECIAL-FLOWS.md.
**Daniel-loop UAT acceptance criterion (post-deploy):** Daniel can save a current setlist as the default template for Shabbat morning; next time he creates a Shabbat morning setlist via the wizard, the Clone CTA prefers his saved default; the deleted-pointer fallback works (delete the template setlist; clone still works via implicit lookup).
**Risks:** v50-04 sticky-memory contract — templates' tracks must NOT ossify song defaults at template-write time; cloned tracks must seed fresh from `seedTrackFromSong` at READ time. Track D verified Option C preserves this. Coordination risk with v52-03 if Issue 4's kebab is removed entirely — v52-05's "Save as default" entry point may need to land elsewhere (e.g., editor toolbar overflow). Plan-time decision.
**Order:** Wave 1 (parallel-eligible) but BENEFITS from v52-03 landing first if Issue 4's kebab is removed (entry-point coordination).

---

## Open Questions for Daniel — must resolve at decision checkpoint

These affect downstream phase scope. Answers can be quick:

### For Phase v52-04 (Issues 5 + 7)
1. **Issue 7 surface confirmation:** When you said "Edit setlist should be emphasized over Close setlist" — were you looking at:
   - (a) The setlists **index list** rows / cards (SetlistCards.tsx — Edit vs Clone hierarchy fix)
   - (b) The setlist **detail page** header (different file; Close = back-to-list)
   - (c) Something else?

### For Phase v52-05 (Issue 6 — template management)
2. **Permission tier:** Admin-only write OR band_leader+ also OR anyone-with-edit? (Recommend admin-only; templates are curated artifacts.)
3. **Phased rollout:** Ship Shabbat morning + Erev Shabbat only first, OR all 11 ServiceTypes at once? (Recommend phased; matches your weekly cadence.)
4. **UI entry point:** Editor kebab (current direction) OR admin-panel template manager OR both? (Recommend kebab for ergonomics; admin-panel as a future enhancement if needed.)
5. **Deleted-pointer behavior:** If the pointed-to template setlist is deleted, should the system (a) auto-clear the pointer, (b) warn an admin, or (c) silently fall back to implicit lookup? (Recommend (c) silent fallback — minimal-surprise.)

### For Phase v52-03 (Issue 4)
6. **Kebab disposition:** Remove the always-disabled kebab from SetlistGridTopBar entirely (Track B recommendation), OR wire it with concrete overflow actions (Settings / Info / Diagnostics)? (Recommend remove — SyncIndicator already provides the actions; the kebab is dead weight.)

If Daniel doesn't answer at the decision checkpoint, defaults are: 1=(a), 2=admin-only, 3=phased, 4=kebab, 5=silent fallback, 6=remove. These ship; phases that depend on them adjust accordingly.

---

## Round-2 Research Gaps

**None triggered.** All Issues at HIGH confidence. The 4 open questions above are *scope* questions, not *research* gaps — no additional code-read or research subagent runs needed.

---

## Phase-Shape Changes vs. Original ROADMAP

The original v52-01 → v52-02..v52-05 phase shape from `/paul:milestone` survives synthesis. **Two minor refinements:**

1. **Issues 5 + 7 are now confirmed bundled** — both modify SetlistCards.tsx. v52-04 ships them in one plan rather than considering a split.
2. **Issues 1 + 4 are confirmed independent fixes within v52-03** — not the originally-suspected shared fix. v52-03 plans 2 tasks within one plan.
3. **No hotfix split needed.** Earlier ROADMAP suggested v52-03 might surface a v52-h hotfix split if root cause was a Firestore-rules / auth-claim issue separable from visual fix. Track B firmed Issue 1 to HIGH confidence as a *recovery-affordance gap* rather than a fundamental data-flow break — single v52-03 plan covers it.

No need to update ROADMAP.md based on these refinements; they're plan-shape, not phase-shape.

---

## Next Action

**Recommended:** Approve synthesis and unblock `/paul:plan` for v52-02 (parallel-eligible with v52-03 / v52-04 / v52-05).

**Wave 1 plans (all parallel-eligible after v52-01 closes):**
- v52-02-01 — TouchOrPopover suppressAutoFocus opt-in
- v52-03-01 — SyncIndicator UX overhaul (kebab + Clear failed rows + sign-out pairing)
- v52-04-01 — Touch affordance + button hierarchy fix in SetlistCards + CalendarDayCell
- v52-05-01 — Templates pointer doc (Option C) with decision-checkpoint-at-top for 4 OQs

If Daniel wants to ship one phase at a time instead of parallel, that's fine — order recommendation: **v52-02 first** (highest user-impact, smallest scope, unblocks the band-onboarding daily flow). Then v52-03 → v52-04 → v52-05.

**Decision checkpoint at Task 4 of v52-01-01-PLAN.md will surface this. Awaiting Daniel.**
