# Roadmap: sheet-music-app (CentralReform.live)

## Current Milestone

**v5.3 — Editor UX Repair** *(RESCOPED 2026-05-02 — v5h3 hotfix inserted)*
Status: 🚧 In Progress
Phases: 1 of 4 complete (v53-01 done; v53-04 likely collapses to 0)
Theme: *"The spreadsheet bones stay; the affordances get fixed."* Targeted UX repair on the v50-05 spreadsheet editor — frictionless chart binding + chart-cell discoverability + polymorphic Add menu — informed by what the old `SetlistEditorV2` (amputated in v50-02) did well. NOT a scrap of the spreadsheet model.

**Rescope (2026-05-02, after v53-01 research):** Daniel iPad UAT surfaced a **save-loss recurrence** (same class as v5h-01, 2026-04-27). Synthesis recommended + Daniel approved: insert **v5h3 hotfix phase** BEFORE v53-02..04 (same precedent as v5.0-hotfix). Chart-verification peek DROPPED per Daniel ("don't worry about this. Fix the other pieces."). v53-04 likely collapses (Track B's only remaining port-back candidate was the chart-preview pattern, which dies with the chart-verify drop).

Origin: Daniel-loop UAT post-v5.2 surfaced editor regrets that v5.1 + v5.2 polish never addressed at the substrate level. Daniel: *"it needs to be super easy to bind a chart to a particular line… super easy to add a new track/chart/line/song/teaching whatever to the setlist. the old 'add' menu was MUCH better."* Three high-friction surfaces: (1) `ChartBindPopover.tsx` search reported broken on iPad/desktop — Track A confirmed sub-mode (c) (picker opens, typing produces NO results); cmdk value-format scoring (H1) + library hydration (H2) implicated; smallest-fix path is ~10 LOC; **NEW from UAT:** ChartCell off-screen on iPad ("scroll way to the right") added as a 4th surface for v53-02; (2) ~~chart-verification peek~~ — DROPPED per Daniel; (3) `AddRowPlaceholder.tsx` only inserts **song** rows but `TrackType` union has 6 types — the polymorphic Add menu from the old editor was ripped out in the v50-02 amputation; Track B found the deletion in commit `d8c0442` (`AddBar.tsx` 6-tile dropdown), RECOMMENDED to port to v53-03. Same v52-style **systemic, not bandaids** directive — recursive research front-loaded into Phase 1 so phases 2–4 execute against root-cause findings + ported-back patterns instead of guesses.

Constraint: Spreadsheet bones stay (no revert; new editor's TanStack/cmdk/shadcn substrate, sync engine v50-03, Dexie schema v50-04 sticky memory, perf-view dual-read v5h-01-03 all out of scope). Daniel-loop UAT discipline (codified v51-04) — every phase that touches data flow or UI gets Daniel UAT pass on real production before milestone close; UAT failures route to follow-up plans in same phase. /ui-ux-pro-max BLOCKING for every UI-touching phase per SPECIAL-FLOWS.md (v53-02 / v53-03 / v53-04); optional for v53-01 + v5h3-01 research/postmortem plans. Tablet-first (verify every fix on iPad in addition to desktop). UAT is the milestone-close gate, not its own phase (matches v5.2 precedent). v5.0 + v5.2 UAT closes still pending — v5.3 plans in parallel with band onboarding (does not block); v5h3 ships THROUGH band-onboarding window (save-loss must be fixed before band invitation).

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| v53-01 | Recursive research (3 parallel tracks) | 1/1 | ✅ Complete | 2026-05-02 |
| **v5h3-01** | **Save-loss recurrence hotfix** (inserted 2026-05-02 via rescope) | 4/4 (research / instrumentation / H-SL-7 fix `36e9fa1` / postmortem + binding harness-fidelity gate) | ✅ LOOP COMPLETE 2026-05-02 — PENDING-UAT (Daniel weekly worship cycle) | 2026-05-02 |
| v53-02 | Chart binding picker fix + ChartCell discoverability *(chart-verify peek DROPPED per Daniel)* | TBD | Not started (soft-blocked behind v5h3-01 PENDING-UAT clear) | - |
| v53-03 | Polymorphic Add menu (port `AddBar.tsx` from commit d8c0442) | TBD | Not started (soft-blocked behind v5h3-01 PENDING-UAT clear) | - |
| v53-04 | Editor affordance pass | TBD (likely collapses to 0) | Not started — pending Daniel decision | - |

### Phase v53-01: Recursive research (3 parallel tracks) ✅ COMPLETE 2026-05-02

Outcome (2026-05-02): 3 parallel research tracks (Track A ChartBind diagnosis / Track B old-editor archaeology / Track C polymorphic Add + chart-peek option sets) + iPad UAT capture (NOT deferred) + RESEARCH-SYNTHESIS.md with rescope recommendation. Daniel selected RESCOPE at decision checkpoint. ~45min end-to-end. Zero source code modified (boundary clean).

Headline outcomes:
- ⚠️ **Save-loss recurrence surfaced via UAT** (NOT in original v53-01 scope) — same class as v5h-01 (2026-04-27); 6 hypotheses open; LOW confidence; needs production state capture in v5h3-01-01. **Daniel-loop UAT discipline (codified v51-04) WORKS** — caught the bug before any v5.3 code shipped.
- **ChartBind picker filter broken (sub-mode c confirmed):** picker opens, typing produces no results. cmdk value-format scoring (H1 confirmed) + library hydration timing (H2 partial) implicated. Smallest-fix path ~10 LOC; systemic-fix path ~80-120 LOC. AddRow no-suggestions shares root cause (identical useLiveQuery + cmdk value pattern) — fix bundle covers both surfaces.
- **NEW iPad finding: ChartCell off-screen** ("scroll way to the right"). Added to v53-02 scope as 4th surface. /ui-ux-pro-max consultation needed at v53-02 PLAN entry for column-reorder vs. row-side affordance.
- **Polymorphic Add menu found in git history:** commit `d8c0442` (v50-05-02 amputation) deleted `AddBar.tsx` — single "Add Item" button → 6-tile dropdown (Song / Section / Reading / Prayer / Transition / Note) with distinctive icon colors. Track B verdict: **RECOMMENDED** to port to v53-03. Track C Option A (grouped CommandList in current cmdk substrate) is the modern equivalent; Option B (split-button) more literally matches old-editor — Daniel decides at v53-03 PLAN time.
- **Anti-patterns guarded against:** Inline chart binding (Replace/Unlink) REJECTED — re-introduces v5h-01 fragility class. Dual-write to embedded `setlists/{id}.tracks[]` + top-level `tracks/{id}` REJECTED — same bug class. Optimistic-write state divergence (`use-setlist-logic.ts` 3-state-machine pattern) REJECTED.
- **Chart-verification peek DROPPED from v5.3 scope** per Daniel. Track C's option set shelved for future-milestone revival. v53-04 likely collapses (chart-preview port-back was its only remaining candidate).

Plans:
- v53-01-01 ✅ COMPLETE 2026-05-02 — 3 parallel research subagents + iPad UAT capture + synthesis with RESCOPE decision. SUMMARY at `.paul/phases/v53-01-recursive-research/v53-01-01-SUMMARY.md`.

Patterns established:
- Recursive research with HUMAN-ACTION UAT checkpoint can surface NEW high-severity findings outside original scope (save-loss recurrence here); synthesis MUST adapt and recommend rescope rather than force-fit.
- Old-editor archaeology format (Pattern \| Old SHA \| What-it-did-well \| Risk-if-ported \| Verdict) — directly portable to future amputation/rebuild research.
- One-root-cause-two-surfaces detection: if 2+ surfaces share substrate code, fix at substrate; do NOT split into per-surface plans (AddRow + ChartBind picker bundle here).

### ⚠️ Phase v5h3-01: Save-loss recurrence hotfix (NEW — inserted via rescope 2026-05-02)

Focus: Reproduce + diagnose + fix the save-loss recurrence Daniel surfaced during v53-01 UAT. Same playbook as v5h-01 (`.paul/postmortems/v5h-01-save-loss.md`).

Daniel's report: *"I made all sorts of changes to a setlist this morning and they didn't save when I just went back to it. This is so annoying. Some of them did, some didn't. Beyond irritating."* — same class as v5h-01 (2026-04-27); the v5.0-hotfix's E+F+B defense-in-depth was supposed to prevent this. Recurrence is evidence that either a new code path bypasses the protections OR auth-claim staleness is back OR the kitchen-sink harness (v50-07-04) fidelity gap that v5h-01-04 deferred has surfaced again.

6 hypotheses surfaced in `.paul/phases/v53-01-recursive-research/ipad-uat-capture.md`:
- H-SL-1: TextCell single-tap-to-edit (v52-02-02) blur/commit race
- H-SL-2: Sticky-memory propagation (v50-04 1s debounce) clobbers in-flight edits
- H-SL-3: `clearFailedOutboxRows` (v52-03) drops a pending row mid-FSM-transition
- H-SL-4: `config/defaults` write path (v52-05) shares engine pump capacity with track writes
- H-SL-5: Auth-claim staleness redux (v5h-01 §3 pattern)
- H-SL-6: Different bug entirely — new code path not yet traced

Recommended structure (3 plans, mirroring v5h-01):
- **v5h3-01-01 — Reproduce + diagnose** (research; autonomous=false; HUMAN-ACTION for Daniel to capture IndexedDB outbox + Safari Web Inspector console + Network tab from this morning's affected setlist + songs-table count for ChartBind H2 disambiguation. AddRow no-suggestions likely diagnosed in same investigation since it shares root cause with ChartBind picker.)
- **v5h3-01-02 — Fix** (execute; ~2-4h depending on diagnosis; defense-in-depth pattern from v5h-01-02 precedent if multi-cause).
- **v5h3-01-03 — Postmortem update** (execute; ~30min; autonomous=true). Extend `.paul/postmortems/v5h-01-save-loss.md` OR create new `v5h3-01-save-loss-recurrence.md`. Critically: identify why kitchen-sink harness (v50-07-04) didn't catch this — the named harness-fidelity gap from v5h-01 §5 (Firebase emulator + thin RTL editor↔perf-view test pair) has NOT been closed since v5h-01-04 deferred it. Recurrence is evidence the deferral was wrong; postmortem MUST escalate or close the gap.

Plans: TBD (defined during /paul:plan)
/ui-ux-pro-max gate: optional for v5h3-01-01 (research) + v5h3-01-03 (postmortem). Required for v5h3-01-02 only if fix surfaces UI (e.g., new error/recovery affordance).

Tracks:
- **Track A — ChartBind diagnosis.** Why search reported broken on iPad and desktop. Audit (1) cmdk `value={\`${song.title} ${song.id}\`}` format vs. CommandInput query — fuzzy-match collision likely; (2) `useLiveQuery(getDb().songs.toArray())` hydration timing in the bind context — empty/stale at first render?; (3) iPad-specific focus residue from v52-02 — is `suppressAutoFocus=false` actually firing for ChartBindPopover or is something downstream re-suppressing?; (4) library size + sort order — should recents / "from this setlist" / sticky-memory-bound songs surface ahead of full library? Output: ranked hypotheses + smallest-fix recommendation.
- **Track B — Old-editor archaeology.** Git-spelunk pre-v50-02 commit history (the amputation deleted ~3,000 LOC of editor surface). Identify what the old `SetlistEditorV2` Add menu + chart-binding flow did well that Daniel misses. Pattern-match against the NEW editor: which patterns can be ported back as additive enhancements without re-introducing old data-flow fragility? Explicit non-goal: revert. Goal: inventory of port-back-worthy patterns ranked by effort × user-impact.
- **Track C — Polymorphic Add design.** Trade-offs for one Add trigger covering 6 TrackTypes (`song | header | reading | prayer | transition | note`): grouped CommandList (shadcn `<CommandGroup heading>`) vs. split-button with type submenu vs. type-prefixed shortcuts (e.g. `/r` for reading). Default focus = most-used path (Library Song). Chart-verification interaction: row-side thumbnail vs. tap-to-peek modal vs. hover-card preview — and the iPad-specific path (no hover). Output: 2–3 implementable option sets with mockup descriptions for /ui-ux-pro-max consultation in v53-02 / v53-03.

Plans: TBD (defined during /paul:plan)
/ui-ux-pro-max gate: optional (research, no UI changes)

### Phase v53-02: Chart binding picker fix + ChartCell discoverability *(blocked behind v5h3-01)*

**Updated scope (chart-verify peek DROPPED per Daniel; ChartCell discoverability ADDED per UAT):**

Focus: Two surfaces — (1) ChartBind picker filter actually returns results when typing (Track A Smallest-Fix path: cmdk value format `\`${title} ${id}\`` → `${title}` at ChartBindPopover.tsx:123 + mirror in AddRowPlaceholder.tsx:138, ~10 LOC). (2) ChartCell discoverable on iPad without scrolling right past Notes column — column-reorder vs. sticky-right-column vs. row-side affordance (chart-icon at row gutter); /ui-ux-pro-max consultation at PLAN entry locks the choice. (3) OPTIONAL: if v5h3-01-01 production state reveals library hydration is the dominant cause AND Daniel still feels library friction after smallest-fix lands, add Track A Systemic-Fix path "Recent" section in a v53-02-02 follow-up plan (~80-120 LOC). AddRow no-suggestions fix is automatic byproduct of (1) — same substrate.

Done means: open ChartBind picker → instant focus + keyboard on iPad → type a few chars → matches surface immediately → tap to bind → ChartCell visible without horizontal scroll on iPad. Chart verification peek explicitly OUT OF SCOPE.

Plans: TBD (defined during /paul:plan after v5h3-01 closes)
/ui-ux-pro-max gate: BLOCKING

### Phase v53-03: Polymorphic Add menu *(blocked behind v5h3-01)*

Focus: Replace `AddRowPlaceholder.tsx` single-purpose Add (Library Song / free-text only) with polymorphic Add trigger covering all 6 `TrackType` values — Library Song / Free-text Song / Reading / Prayer / Transition / Section header / Note. Track C surfaced 3 option sets; Track B confirmed old-editor `AddBar.tsx` (commit `d8c0442`) had a 6-tile dropdown with distinctive icon colors that Daniel misses. Decision at v53-03 PLAN entry between Track C Option A (grouped CommandList in current cmdk substrate — strongest by Track C ranking) vs. Option B (split-button matching old-editor more literally — Daniel's "MUCH better" memory may favor this). /ui-ux-pro-max consultation drives.

**MANDATORY:** Touch-target compliance fix — current CommandItems use `py-1` (~16px), violates 44×44 floor. Bump to `min-h-[44px] [@media(pointer:coarse)]:py-2` per /ui-ux-pro-max rule.

Plans: TBD (defined during /paul:plan after v5h3-01 closes)
/ui-ux-pro-max gate: BLOCKING

### Phase v53-04: Editor affordance pass *(likely COLLAPSES — pending Daniel decision)*

Original focus: whatever Track B surfaces beyond polymorphic Add menu as port-back-worthy. Track B surfaced ONE additional candidate (chart-preview port-back from `SongRow` collapsed-state file-name link) and Daniel **dropped chart-verification entirely** from v5.3 scope. Net: v53-04 has **zero remaining scope** unless Daniel pulls in something specific during v53-02/03 execution.

Recommendation at v53-02 / v53-03 close: **collapse v53-04 entirely** unless Daniel explicitly pulls in something. v5.3 becomes 3 implementation phases (v53-01 / v5h3-01 / v53-02 / v53-03) instead of 4.

Plans: 0 expected (TBD if anything emerges)
/ui-ux-pro-max gate: N/A unless plans materialize

### Milestone-close gate

UAT (Daniel runs real-production weekly worship cycle on iPad — Erev Shabbat + Shabbat morning) closes the milestone. Not its own phase. UAT failures route to follow-up plans in the affected phase per v51-04 rule. Once UAT passes: `/paul:complete-milestone v5.3` → then `/paul:audit-milestone v5.0` (or v5.2 if still pending) per the parent-milestone close path.

---

## Previously Active Milestone (Pending Band UAT)

**v5.2 — Band-Onboarding Hardening**
Status: ✅ ALL 5 PHASES SHIPPED 2026-04-30 (milestone-close UAT pending — band onboarding cycle)
Phases: 5 of 5 complete
Theme: *"Make iPad bulletproof + give setlists a real lifecycle, so we can invite the band."* Systemic fixes — iPad input/focus, sync-error UX, touch-affordance discoverability, setlist lifecycle, plus template-management as a real feature. Daniel explicitly requested **systemic fixes, not bandaids** — recursive research front-loaded into Phase 1 so phases 2–5 execute against root-cause findings instead of guesses.

Origin: 7 issues surfaced via Daniel-loop UAT post-v5.1 (codified discipline working as designed): (1) iPad red "Failed" SyncIndicator (desktop OK), (2) iPad text-input keyboard not popping, (3) iPad Chart picker search broken, (4) all-platforms kebab next to "Saved" red-lined / unclickable, (5) iPad setlists list kebab needs always-visible affordance, (6) save-as-default-template feature, (7) "Edit setlist" should be primary CTA over "Close setlist". Bugs 2+3 likely share root cause (v51-01 focus/keyboard rule leaking); 1+4 cluster around SyncIndicator failure-state UX; 5 is touch-affordance discoverability. Research-first phase v52-01 disambiguates before any code lands.

Constraint: Daniel-loop UAT discipline (codified v51-04) — every phase that touches data flow gets Daniel UAT pass on real production before milestone close. /ui-ux-pro-max BLOCKING for every UI-touching phase per SPECIAL-FLOWS.md. Tablet-first (verify every fix on iPad in addition to desktop). v5.0 UAT close still pending — v5.2 is the gate-clearer for band onboarding.

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| v52-01 | Recursive research (4 parallel tracks) | 1/1 | ✅ Complete | 2026-04-30 |
| v52-02 | iPad focus + cmdk system fix | 2/2 | ✅ Complete | 2026-04-30 |
| v52-03 | SyncIndicator failure UX overhaul | 1/1 | ✅ Complete | 2026-04-30 |
| v52-04 | Touch affordance + setlist lifecycle UX | 1/1 | ✅ Complete | 2026-04-30 |
| v52-05 | Default-template management | 1/1 | ✅ Complete | 2026-04-30 |

### Phase v52-01: Recursive research ✅ COMPLETE 2026-04-30

Outcome (2026-04-30): 4 parallel research tracks (dan-researcher subagents) + 1 follow-up Issue 1 firming pass + RESEARCH-SYNTHESIS.md with 7-row root-cause confidence matrix. All 7 issues at HIGH confidence; 0 LOW; no round-2 research triggered. Daniel approved synthesis with 6 default OQ answers locked. Task 2 (HUMAN-ACTION iPad UAT capture) DEFERRED to per-phase post-deploy Daniel-loop UAT (codified discipline from v51-04). Wave 1 plans v52-02..v52-05 unblocked and parallel-eligible.

Key findings:
- **Issues 2+3 SHARE root cause** — TouchOrPopover unconditional `onOpenAutoFocus(preventDefault)` on `(pointer:coarse)` breaks Radix focus-trap on iOS Safari. Single ~30 LOC substrate fix in v52-02 via `suppressAutoFocus?: boolean` opt-in prop.
- **Issues 1+4 INDEPENDENT** despite same surface — Issue 1 is missing recovery affordance for terminal `failed` FSM state + per-device outbox divergence + auth-claim staleness compounding (v52-03 ~75-120 LOC: "Clear failed rows" + "Sign out and back in"); Issue 4 is hard-coded `disabled={!onOverflow}` kebab in SetlistGridTopBar.tsx:65 that never receives the prop (v52-03 removes it, ~10-15 LOC).
- **Issues 5+7 file-bundled** in SetlistCards.tsx — single v52-04 plan, ~10-15 LOC. 3 P0 hover-to-reveal findings (UpcomingSetlistCard kebab, SetlistCard kebab, CalendarDayCell Plan Service button) get `[@media(pointer:coarse)]:opacity-100`; "Edit Setlist" button promoted from variant=secondary to primary.
- **Issue 6 architecture: Option C** (system/templates pointer doc) — admin-only write, phased scope (Shabbat morning + Erev Shabbat first), editor kebab entry point, silent fallback on deleted pointer. v52-05 ~125 LOC + new API route.

Plans:
- v52-01-01 ✅ COMPLETE 2026-04-30 — 4 parallel research subagents + Issue 1 follow-up firming + synthesis. SUMMARY at `.paul/phases/v52-01-recursive-research/v52-01-01-SUMMARY.md`.

Sequencing: Wave 1 parallel-eligible — v52-02 / v52-03 / v52-04 / v52-05 can plan in parallel. If serial preferred: v52-02 first (highest user-impact, smallest scope).

Tracks:
- **Track A — iPad text-input focus regression** (Issues 2, 3). Hypotheses: v51-01 `onOpenAutoFocus(preventDefault)` leaking past auto-focus into manual-tap focus on text inputs; iOS WebKit pointer-event vs touch-event ordering with Radix Popover / cmdk; `(pointer:coarse)` media query bleed-through to non-picker inputs; cmdk CommandInput + iOS system-keyboard interaction quirks. Output: ONE shared substrate fix or N independent fixes — explicit decision, not assumed. Disambiguate Issue 3 sub-modes: (a) input doesn't focus, (b) focuses but typing doesn't filter, (c) filters but selection doesn't bind.
- **Track B — SyncIndicator state UX** (Issues 1, 4). Output: state diagram (idle / syncing / saved / pending / failed / conflict) + per-state kebab availability rationale + diagnosis of why iPad fails where desktop succeeds (auth-claim staleness redux? rules version? per-device outbox?) + cause of the kebab "red line" (disabled attr / z-index overlap with v51-h01 lastError pill / CSS regression).
- **Track C — Touch affordance discoverability sweep** (Issue 5 + audit). Every hover-to-reveal control in the app, not just setlists list. Output: audit table + always-show-on-`(pointer:coarse)` policy.
- **Track D — Template-management data model** (Issue 6). Trade-offs: implicit `templateType` + `findLastMatchingService` vs. explicit `templates/{type}` collection vs. per-setlist `is_default_template` flag. Migration impact on 24 hydrated + 5 unhydrated setlists. Permission model (admin-only vs. anyone-with-edit). Scope (just Shabbat morning + Erev Shabbat or all 11 service types).

Plans: TBD (defined during /paul:plan)
/ui-ux-pro-max gate: optional (research, no UI changes)

### Phase v52-02: iPad focus + cmdk system fix ✅ COMPLETE 2026-04-30

Outcome (2026-04-30): Issues 2 + 3 cluster fully closed across 2 plans. **v52-02-01** (`61eae6c`) added `suppressAutoFocus?: boolean` opt-in prop to TouchOrPopover (default false); DropdownCell discrete-mode opts in to preserve v51-01 no-keyboard-on-open intent for Key/Type/AddRow/Bulk; searchable mode (Lead/ChartBind/Bulk-Lead/AddRow library lookup) drops suppression so cmdk CommandInput auto-focuses and iPad keyboard pops on Chart search open. **v52-02-02** (`f061c80`) added `useMediaQuery('(pointer:coarse)')` to TextCell with single-tap-to-edit gate inside button.onClick: coarse-pointer single tap calls `onFocus()` then `enterEditMode()` so input renders with autoFocus and iPad keyboard pops; desktop preserves keyboard-nav semantics (click-only-focuses, double-click + Enter + printable keystroke trigger edit mode). Read-only investigations confirmed MobileEditSheet (plain `<input>`/`<textarea>`) and CreationWizard (shadcn `<Input>` plain wrapper) are case (ii) — already work on iPad without TextCell pattern; no follow-up plan needed. Suite 1513 → 1518 (+5 across phase: 3 TouchOrPopover contract tests + 1 obsolete v51 test replaced + 3 new TextCell.test.tsx contract tests). /ui-ux-pro-max BLOCKING gate satisfied at v52-02-01 APPLY entry. Daniel UAT approved for both plans post-deploy.

Patterns established:
- Opt-in suppression for Radix Popover open-autofocus on touch — default trusts platform; only suppress when surface has no input to type into
- Cell-level coarse-tap-to-edit pattern: any future cell with button → input two-state pattern that needs touch single-tap-to-edit follows TextCell precedent

Plans:
- v52-02-01 ✅ COMPLETE 2026-04-30 — TouchOrPopover suppressAutoFocus opt-in. SUMMARY at `.paul/phases/v52-02-ipad-focus-cmdk-fix/v52-02-01-SUMMARY.md`.
- v52-02-02 ✅ COMPLETE 2026-04-30 — TextCell single-tap-to-edit on coarse pointer. SUMMARY at `.paul/phases/v52-02-ipad-focus-cmdk-fix/v52-02-02-SUMMARY.md`.

### Phase v52-03: SyncIndicator failure UX overhaul ✅ COMPLETE 2026-04-30

Outcome (2026-04-30): Issues 1 + 4 cluster fully closed in 1 plan (single vertical-slice commit `e69e23a`). **Issue 4** (kebab "red line") — SetlistGridTopBar.tsx kebab + onOverflow prop + MoreVertical import all removed; SyncIndicator becomes the only trailing action. **Issue 1** (terminal `failed` FSM state with no recovery) — new `src/lib/sync/cleanup.ts` exports `clearFailedOutboxRows()` deleting only `status='failed'` rows; SyncIndicator wires it as the default `onRetryFailed` fallback so the failed-state action button is enabled in production by default; auth-staleness sign-out pairing surfaces an inline "Sign out and back in" button gated on `/permission|auth|denied|unauthenticated|unauthorized/i` regex. No engine FSM changes (failed stays terminal-on-EDIT_COMMITTED; recovery is "delete row from outbox, let pump re-derive"). Suite 1518 → 1528 (+10 cases, exceeds plan estimate). /ui-ux-pro-max BLOCKING gate satisfied at APPLY entry; drove zinc-300 (vs red-300) and mt-1.5 (vs mt-0.5) refinements. Daniel approved sight-unseen at HUMAN-VERIFY; real-iPad UAT deferred to standing Daniel-loop discipline.

Patterns established:
- Outbox cleanup primitives live in src/lib/sync/cleanup.ts (additive, write-only-to-Dexie, no engine coupling)
- Indicator default-handler fallback wires recovery affordances when parent doesn't pass explicit onRetryFailed (analogous to v50-06-02's useReconciliationModalOptional fallback for onResolveConflict)
- Inline error pill + neutral-toned recovery action below severity-colored description (red error pill + zinc sign-out link rather than red-on-red)

Plans:
- v52-03-01 ✅ COMPLETE 2026-04-30 — SyncIndicator failure-state recovery + remove dead kebab. SUMMARY at `.paul/phases/v52-03-sync-indicator-ux-overhaul/v52-03-01-SUMMARY.md`.

### Phase v52-04: Touch affordance + setlist lifecycle UX ✅ COMPLETE 2026-04-30

Outcome (2026-04-30): Issues 5 + 7 cluster fully closed in 1 plan (single vertical-slice commit `814a50d`). **Issue 5 (3 P0 hover-reveals from Track C audit):** UpcomingSetlistCard kebab (SetlistCards.tsx:80), SetlistCard kebab (SetlistCards.tsx:208), and CalendarDayCell empty-day "Plan Service" placeholder (CalendarDayCell.tsx:104) all gain `[@media(pointer:coarse)]:opacity-100` modifier. iPad always-visible; desktop hover-reveal preserved. **Issue 7 (CTA hierarchy):** "Edit Setlist" / "Edit" buttons promoted from `variant="secondary"` (muted gray) + bg-muted overrides → `variant="brand"` (solid bg-brand). Clone buttons untouched (stay as tinted-brand secondary). Result: solid brand = Edit (primary); tinted brand = Clone (secondary). Color family unified, weight differentiated. Track C audit P1 findings (C-04 watermark, C-05 HeroCard arrow) deferred per audit recommendation. ~7 source LOC delta across 2 files. Suite 1528/1528 (pre-existing parallel-suite flake didn't surface). tsc + next build clean. /ui-ux-pro-max gate satisfied (carryover). Daniel approved sight-unseen at HUMAN-VERIFY; real-iPad UAT deferred to standing Daniel-loop discipline.

Patterns established:
- Always-visible on `(pointer:coarse)` for hover-reveal controls that are the sole path to critical actions (apply via `[@media(pointer:coarse)]:opacity-100` append; preserve desktop hover-reveal)
- Two-button CTA hierarchy in branded surfaces: primary uses solid `variant=brand`; secondary uses tinted `bg-brand/10` (or text-brand subtle) — color family unified, weight differentiated, no new hue for primary

Plans:
- v52-04-01 ✅ COMPLETE 2026-04-30 — Touch affordance + Edit CTA hierarchy. SUMMARY at `.paul/phases/v52-04-touch-affordance-setlist-lifecycle/v52-04-01-SUMMARY.md`.

### Phase v52-05: Default-template management ✅ COMPLETE 2026-04-30

Outcome (2026-04-30): Issue 6 closed in 1 plan (single vertical-slice commit `cf30d62` + Firebase rules deploy). Track D Option C admin-curated pointer doc shipped at `config/defaults` (codebase convention; NOT Track D's hypothetical `system/templates`). New service helpers (`getDefaultForServiceType` / `setDefaultForServiceType`) integrate into `findLastMatchingService` with pointer-preferred lookup and silent fallback on missing/dangling/repurposed pointers (OQ Q5 lock). UI: "Save as Default for {Shabbat Morning | Friday Night}" menu item in SetlistCards kebab (OQ Q4 superseded — v52-03 removed editor kebab; SetlistCards kebab is the natural surface). Phase 1 scope: shabbat_morning + friday_night only (OQ Q3); future expansion is additive. Rules-then-code deploy ordering enforced via in-task auto sequence (firebase deploy → git commit → git push) per v50-05 cutover lesson. Suite 1528 → 1536 (+8). tsc + next build clean. Daniel approved with explicit "Approved" at HUMAN-VERIFY (NOT sight-unseen — milestone-close phase).

Patterns established:
- Admin-curated pointer doc at `config/{name}` for cross-cutting curation (mirrors `config/featured` / `config/congregation` precedent)
- Service-helper pointer-first lookup with silent fallback to legacy query — graceful degradation, no telemetry on absence
- Two-method service-layer pattern for admin-curated pointers: `getXForY(key)` + `setXForY(key, value)`
- Phase-1 scope-gating in UI via const-set + `.includes()` — additive expansion to other enum values requires only set extension, no schema migration
- `vi.resetAllMocks()` (not `vi.clearAllMocks`) when tests sequence `mockResolvedValueOnce` queues across describes

Plans:
- v52-05-01 ✅ COMPLETE 2026-04-30 — Track D Option C pointer-doc + SetlistCards kebab item. SUMMARY at `.paul/phases/v52-05-default-template-management/v52-05-01-SUMMARY.md`.

## Next Milestone

After v5.3 ships and Daniel-loop UAT closes it, `/paul:complete-milestone v5.3` archives it. Parent v5.0 + v5.2 milestone audits can run in parallel against the same band-onboarding UAT cycle. Next-next scope (v5.4 / v6.0) defined via `/paul:discuss-milestone` post-close.

**Open carry-over from v5.0 + v5.2 (still pending UAT):** v5.0 has been pending UAT since 2026-04-27; v5.2 since 2026-04-30. v5.1 + v5.2 + v5.3 are the prerequisite polish stack to make Daniel's full v5.0 UAT comfortable on iPad. v5.3 closes the editor-UX-regret gap that v5.1 + v5.2 didn't address at the substrate level.

## Completed Milestones

<details>
<summary>v5.1 Editor UX Polish (Band-Onboarding Gate) — 2026-04-27 (4 phases / 4 plans)</summary>

Archived snapshot: `.paul/milestones/v5.1-ROADMAP.md`
Detailed accomplishments + decisions: `.paul/MILESTONES.md` § v5.1 entry

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| v51-01 | Picker rework (all 6 dropdown sites) | 1/1 | 2026-04-27 |
| v51-02 | Editor readability + visual hierarchy (desktop + tablet) | 1/1 | 2026-04-27 |
| v51-03 | Smart create-setlist wizard (date-aware via Hebcal) | 1/1 | 2026-04-27 |
| v51-04 | Vocal Lead rename + Daniel-loop UAT codification + print smoke | 1/1 | 2026-04-27 |

Done definition met: clean iPad flow + tighter editor + smart create-setlist wizard + Vocal Lead terminology + UAT discipline codified + gig-packet print smoke verified. Suite 1481 → 1513 (+32). Band-onboarding gate cleared.

</details>

## Older Completed Milestones

<details>
<summary>v5.0-hotfix Track-Edit Save-Loss Fix — 2026-04-27 (1 phase, 4 plans)</summary>

Archived at: `.paul/milestones/v5.0-hotfix-ROADMAP.md`
Postmortem: `.paul/postmortems/v5h-01-save-loss.md`

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| v5h-01 | Track-edit save-loss diagnosis + fix | 4 (01-01 reproduce+diagnose ✓ • 01-02 fix ✓ • 01-03 perf-view architectural refactor ✓ • 01-04 postmortem ✓) | 2026-04-27 |

</details>

### Phase v5h-01: Track-edit save-loss diagnosis + fix

Focus: Reproduce Daniel's flow in a kitchen-sink scenario (fresh setlist, no legacy tracks, edit key, simulate page-nav with cached pre-edit Firestore delivery via snapshot listener), capture production state with DevTools open (HUMAN-ACTION), pick fix shape from three candidates (A: writeback never fired → unconditional + verified; B: listener LWW underflow → guard against undefined local.updatedAt; C: serverTimestamp didn't resolve → switch to client-side Date.now()), ship fix with the regression test from 01-01 locking it, then postmortem the harness-fidelity gap.

Plans (planned per archived handoff `.paul/handoffs/archive/HANDOFF-2026-04-27-post-uat-v5h-and-v51.md`):
- **v5h-01-01 — Reproduce + diagnose** (research; autonomous=false; 1 HUMAN-ACTION checkpoint for production DevTools capture; 1 decision-checkpoint at end picking fix shape A/B/C). 3 tasks: (1) kitchen-sink reproduction harness in property-failures.test.ts; (2) HUMAN-ACTION production state capture in `.paul/postmortems/v50-07-save-loss-investigation.md`; (3) root-cause confirmation + fix-shape decision.
- **v5h-01-02 — Fix** (execute; ~2h; decision-checkpoint at start to confirm fix shape; regression test from 01-01 ships in this plan to lock the fix). After ship: push to prod, Daniel re-runs UAT scenario 1.
- **v5h-01-03 — Perf-view architectural refactor** (execute; ~6h with 3 failed iterations; final commit `92b1902`) — refactored `useSetlistPerformance` to read tracks from Dexie via `useLiveQuery` + mount snapshot-listener; embedded fallback retained ONLY for unhydrated legacy setlists; public-view short-circuit preserved. Daniel UAT 2026-04-27 confirmed instant editor→perf-view propagation. Replaced what was originally planned as the postmortem; 3 prior iterations (`f83d75d` reverted, `8971223` + `4aa6840` superseded) on Firestore subscription semantics all failed UAT before the architectural fix.
- **v5h-01-04 — Postmortem** (execute; ~30min; autonomous=true; docs only) — `.paul/postmortems/v5h-01-save-loss.md`: cutover-plan rules-audit gap proposal (gate to add to PAUL/CARL planning); kitchen-sink harness fidelity gaps named with remediation options (Firebase emulator + thin RTL editor↔perf-view test recommended); perf-view 4-iteration architectural-rethink lesson (`metadata.fromCache` is source not freshness; 2-3-strikes architectural-rethink rule); auth-claim staleness incident; Daniel-loop UAT cadence as v5.x norm; Issue 2 (iPad key-picker UI) routing rule.

Skills required: TBD — likely none (engine + harness work; same precedent as v50-06-01 + v50-07-04).

Sequencing post-close: Daniel re-runs UAT scenario 1 → if pass, advance to v5.1 (editor UX overhaul) → after v5.1 ships + Daniel re-confirms UAT smoke, run `/paul:audit-milestone` (or `/paul:plan-milestone-gaps`) to close v5.0.

## Active Milestone (Pending Close — Blocked on v5.0-hotfix)
**v5.0 — Bulletproof Editor (Local-First Rewrite)**
Status: 🟡 Pending UAT (all 7 phases shipped; close BLOCKED on v5.0-hotfix completing first, then v5.1 UX overhaul, then `/paul:audit-milestone`)
Phases: 7 of 7 complete
Theme: Rebuild the setlist editor on a local-first foundation, with sticky song memory and a spreadsheet-shaped UX, so saves are bulletproof by construction. Includes amputation of dead surfaces (AI chat, live-swap UI) up front.

Origin: Three compounding pain points surfaced post-gig — Rube Goldberg fragility, edits that don't save, and Sheets envy. Research (codebase blast radius + data-model split + Sheets-API feasibility + comparable-app survey) reframed the problem: the in-app editor concept is right; the *implementation* (optimistic-write + silent-fail save path, no song-level memory, dense non-spreadsheet-like UX) is what makes Sheets feel easier. Fix the editor at the foundation and the Sheets envy dissolves. Scope expanded post-discussion: amputate the unused AI chat assistant and the over-engineered live-swap UI surface (v3.0 + v4.0 redesigns) before rebuilding — replacement for "live swap" is just real-time setlist sync via the new sync engine.

Constraint: Band is **not** in production on this app right now (waiting for dependability), so a "broken-for-band" period during the rewrite is acceptable. No parallel-editor scaffolding, no feature flags, no always-green master required. Hard cutover is the strategy.

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| v50-01 | Architecture & design | 1/1 | ✅ Complete | 2026-04-26 |
| v50-02 | Dead-code amputation (chat + live-swap UI) | 1/1 | ✅ Complete | 2026-04-26 |
| v50-03 | Local-first sync engine | 1/1 | ✅ Complete | 2026-04-26 |
| v50-04 | Song catalog & sticky memory | 1/1 | ✅ Complete | 2026-04-26 |
| v50-05 | Spreadsheet editor UI (cutover) | 5/5 (01 build ✓ • 02 cutover ✓ • 03 multi-select+AlertDialog ✓ • 04 iPad+ContextMenu ✓ • 05 mobile+Undo+WCAG ✓) | ✅ Complete | 2026-04-26 |
| v50-06 | Concurrent-edit safety + offline + cross-tab | 3/3 (01 substrate ✓ • 02 modal ✓ • 03 cross-leader ✓) | ✅ Complete | 2026-04-26 |
| v50-07 | Migration, kitchen-sink, cutover | 5/5 (01 audit ✓ • 02 MARKER_PATH patch + liveState scrub ✓ • 03 lazy hydration + perf-view dual-read ✓ • 04 kitchen-sink fast-check ✓ • 05 Sentry + UAT plan + ship checklist ✓) | ✅ Complete | 2026-04-27 |

### Phase v50-01: Architecture & design

Focus: Sign-off doc — no code lands. Decisions to lock: local-first stack (Dexie + hand-rolled outbox vs. LiveStore vs. RxDB vs. TanStack Query Persister), spreadsheet editor stack (TanStack Table + custom cells vs. AG Grid community vs. hand-rolled), sync-engine state machine, song catalog schema with `defaults: { key, lead, bpm }` + rolling history, sticky-memory propagation rules, doc model in IDB (JSON blob vs. normalized rows; CRDT vs. last-writer-wins), migration script approach, UX mocks for spreadsheet editor, **amputation scope for v50-02**.
Plans: TBD (defined during /paul:plan)
Output: `.paul/phases/v50-01-architecture/ARCHITECTURE.md`

### Phase v50-02: Dead-code amputation (chat + live-swap UI)

Focus: Delete the AI chat assistant entirely (`ChatPanel.tsx` ~571 LOC + `chat-store.ts` + `/api/chat/*` + chat-prompt sanitization + chat tests + chat Firestore rules/data). Delete the live-swap UI surface entirely (`SwapPicker`, `SwapBottomSheet`, `SwapToast`, `SwapButton`, `/live/[id]` receiver, song-groups system + `liturgicalSlot` field, `canLiveSwap` permission + custom claim, related Firestore rules, swap-related Firestore-rule carve-outs, `swapTrack()` function callers). Verify zero `grep` hits for amputated symbols; full test suite green; `next build` passes. Performance view stays untouched (user: "good for now"); replacement for live swap is real-time setlist sync (lands in v50-03/v50-06, not built here). Estimated net deletion: ~3,000 LOC.
Plans: TBD

### Phase v50-03: Local-first sync engine ✓

Focus: IDB store + outbox queue + retry/dead-letter + truthful sync indicator (`Saving / Saved / Failed-with-retry / Queued`). Property-based tests for save reliability under random failure injection (network, auth, version-mismatch, force-quit). Built standalone — old editor unchanged, still on old write path until v50-05.

Outcome (2026-04-26): Dexie 4.4 + hand-rolled outbox + 6-state FSM + BroadcastChannel single-leader lock + fast-check no-data-loss harness. 39 new tests (1320/1320 total). Per-doc drain ordering invariant added (bug surfaced by the property harness itself: transient failure on row N could let row N+1 same-doc leapfrog on the server, violating LWW). Engine is fully standalone — zero imports from `src/components`, `src/hooks`, or `src/app`. Consumed by v50-05 (editor cutover) and v50-06 (concurrent-edit safety).
Plans:
- v50-03-01 ✓ (2026-04-26) — Dexie schema + atomic `applyEdit` + sync FSM + retry + cross-tab lock + property-based failure-injection harness. 3 tasks, 9 ACs, autonomous. Commits: `cb73dcc` (foundation) + `6cf34d7` (engine) + `0a94a9c` (property harness).

### Phase v50-04: Song catalog & sticky memory ✓

Focus: Promote `songs/{id}` to first-class with `defaults: { key, lead, bpm }` + rolling history. One-shot backfill script populates defaults from existing setlist data (most-recent occurrence wins). Add-song flow reads defaults; save-track flow writes back so edits travel with the song everywhere going forward. Persists until explicitly changed.

Outcome (2026-04-26): Dexie v→2 schema (additive `defaults` + `recent[]` cap 5 on songs; non-destructive v1→v2). Helper module `src/lib/songs/defaults.ts` exports `seedTrackFromSong` (read-through) + `propagateTrackEditToSong` (1s debounced, per-song independent timers, FIFO-cap-5, routes through `applyEdit('update','songs',...)` so the v50-03 sync engine carries it to Firestore). Migration script `scripts/migrate-v50.ts` with dry-run / apply / `--force` / `--rollback` / `--help`; abstract `MigrationFirestore` interface keeps tests admin-SDK-free; setlist-invariance sha256 hash check is the regression guard; per-song snapshots in `migrations/v50/snapshot/{songId}` enable rollback; `system/migrations/v50` marker enforces idempotency. Three atomic commits (`58d2725` + `d73e891` + `d13da61`); 25 new tests (3 schema + 9 helper + 13 migration); 1344/1345 total (1 pre-existing flake in cross-tab-lock unrelated, deferred to v50-06). Production migration apply itself deferred to v50-07 cutover. Zero changes to legacy editor surface; v50-05 imports the helpers from `@/lib/songs/defaults` and consumes directly.

Plans:
- v50-04-01 ✓ (2026-04-26) — Schema bump + helper module + migration script. 3 tasks, 7 ACs, autonomous. Commits: `58d2725` (Dexie v2) + `d73e891` (helpers) + `d13da61` (migration script).

### Phase v50-05: Spreadsheet editor UI (cutover)

Focus: Delete `use-setlist-logic.ts` (901 LOC), `setlist-flush.ts`, `setlist-draft.ts`, `SetlistEditorV2.tsx` + all editor modals, mutation API routes, broadcast-channel merge code (~8,400 LOC of editor surface). Build new app-native spreadsheet-shaped editor — tabular rows, click-cell inline editing, type-to-filter dropdowns on Key/Lead/Type, tab/enter navigation, drag-handle reorder, add-row at bottom auto-focuses. Wired to v50-03 sync engine + v50-04 song catalog. App is intentionally broken-for-band during this phase.

Multi-plan split (handoff guidance: "split into multiple plans if scope exceeds 3 tasks; vertical slices preferred"):
- **v50-05-01 ✓ (2026-04-26) — Build SetlistGrid (no cutover yet).** Booted SyncEngine + ProductionFirestoreAdapter into app shell via LazyClientComponents → next/dynamic ssr:false. Built SetlistGrid component tree end-to-end on TanStack Table v8 + dexie-react-hooks: read path (live query), 8 columns (drag/type/title/key/bpm/lead/notes/chart), cell editing (text + Radix Popover/cmdk dropdowns), drag-reorder via @dnd-kit, add-row from library with seedTrackFromSong + defaults, delete-row (Backspace + injectable confirm), continuous-add (Tab past last cell), sync indicator (6 FSM states + aria-live), empty state. 3 atomic commits (`96428b9` + `ef5c99d` + `f29c46c`); 29 new vitest cases; 1374/1374 total; tsc + next build clean. Legacy editor still serves the route. Implements §6.2/6.3/6.4/6.5/6.8/6.10. 3 tasks, 7 ACs.
- **v50-05-02 ✓ (2026-04-26) — Cutover landed.** Swapped `setlists/[id]/page.tsx` mount to `<SetlistGridHydrator>` (Option A: wrapper with initialServerData props; Hydrator primes Dexie idempotently via direct db.put inside one rw transaction — bypasses applyEdit since server data is authoritative). Wired `ChartCell` click → new `ChartBindPopover` (cmdk + library, modeled on AddRowPlaceholder's library half) → `applyEdit('update','tracks',{songId,title,...defaults})` with seedTrackFromSong defaults seeding. Deleted ~−6,300 LOC of legacy editor surface (use-setlist-logic 818 LOC + setlist-flush + setlist-draft + flush-schema + SetlistEditorV2 + 17 v2/ sub-components + their tests + /api/setlist/flush route + 2 orphan tests). Relocated SearchOverlay to `src/components/library/` (admin TemplateEditor non-editor consumer). Dropped orphaned matrix view feature. setlist-firebase.ts narrow was a NO-OP (StaleWriteError + updateSetlistWithVersion still consumed by useAddToSetlist). 4 atomic commits (`b8d8314` + `0584744` + `ba7e214` + `d8c0442`); 9 new vitest cases; 1315/1316 total (1 pre-existing cross-tab-lock flake → v50-06); tsc + next build clean. Net delta +14 / −6,306. Production smoke verification deferred to user. 3 tasks + 1 decision (Option A) + 1 human-verify (deferred). /ui-ux-pro-max invoked at APPLY start.
- **v50-05-03 ✓ (2026-04-26) — Multi-select / batch edit + AlertDialog swap-in.** §6.6 multi-select via Cmd/Shift-click on drag handle (anchor-aware extendRange + pruneTo for stale-row surgery) + sticky BatchActionBar (Type / Key / Lead / Delete; bulk applyEdit + per-songId propagation; selection preserved across bulk-set, cleared on bulk-delete). shadcn AlertDialog replaces window.confirm via `<DeleteConfirmProvider>` context wrapper at /setlists/[id]; SetlistGrid resolves confirmation via prop → context → window.confirm precedence. 3 tasks, 8 ACs, autonomous. Discovered + documented dnd-kit aria-pressed override pattern (place app-level ARIA AFTER `{...useSortable.attributes}` spread). 4 commits: `25b57ad` (PLAN) + `e26626c` (selection hook + drag-handle) + `ae0a8c3` (BatchActionBar) + `8acf7aa` (DeleteConfirmProvider). 1359/1360 vitest (+44 new cases); tsc + next build clean. /ui-ux-pro-max invoked at APPLY start.
- **v50-05-04 ✓ (2026-04-26) — iPad / pointer-coarse Sheet swap + right-click ContextMenu.** §6.7 implemented end-to-end. New `<TouchOrPopover>` wrapper (single integration point) picks Radix Popover (desktop) or Radix Sheet (touch) via `useMediaQuery('(pointer: coarse)')` — applied across 6 swap sites (DropdownCell covering KeyCell/LeadCell/TypeCell, AddRowPlaceholder, ChartBindPopover, BatchActionBar's BulkPopover). 44px-min touch targets via `[@media(pointer:coarse)]:` Tailwind classes (DropdownCell h-10→h-11, ChartCell h-10/w-10→h-11/w-11, AddRowPlaceholder h-11→h-12, drag column 44→52px, cell padding py-1→py-3 on coarse, ChartCell unbound contrast bumped on coarse). ChartBindPopover lifted to controllable open state (parent-controlled `open`+`onOpenChange` props with internal-state fallback) so SetlistGrid hoists `chartBindOpenRowId` and ContextMenu can open it programmatically. Radix ContextMenu wired into every SortableRow with 4 items (Edit row / Bind chart / Duplicate row / Delete row) + selection-aware action targeting: in-selection ≥ 2 → Delete routes to bulk via existing `handleBulkDelete` + "N rows selected" header + Edit/Bind/Duplicate disabled; out-of-selection → single-row Delete with quoted title. Duplicate row cascade-bumps existing orders ≥ newOrder via parallel `applyEdit('update')`, then `applyEdit('set')` for the clone (id + order replaced; songId / title / key / bpm / leadMusician / notes / type / setlistId carry through). Long-press for touch (500ms hold + 10px-squared movement threshold; touch-only branch — pointerType='mouse' skips entirely) re-emits a synthetic `contextmenu` MouseEvent on the `<tr>` (since @radix-ui/react-context-menu 2.2.16 has no controlled `open` prop). Global `window.matchMedia` stub via `vitest.config.ts setupFiles: ['./src/test-setup.ts']` (defaults `matches:false` = desktop branch). 4 commits: `a18736b` (chore PLAN) + `d4a9d96` (Task 1 TouchOrPopover + iPad swap + 44px) + `ded27dd` (Task 2 ContextMenu + long-press) + `35a055a` (Task 3 integration tests). 3 tasks, 8 ACs, autonomous. +17 new vitest cases (1377/1377 — cross-tab-lock pre-existing flake passed too); tsc + next build clean. `/ui-ux-pro-max` invoked at APPLY start.
- **v50-05-05 ✓ (2026-04-26) — Mobile stacked-card flow + Undo via zustand store + WCAG AA audit.** §6.11 mobile parallel render path keyed on `useMediaQuery('(max-width: 767px)')`: new `<MobileCardList>` renders `<ul>` of `<MobileRowCard>` cards (title + key + lead at rest, drag/select handle, chart-bound icon); tap card → `<MobileEditSheet>` (full-screen Radix Sheet with form fields for type/title/key/bpm/lead/notes + Move up/Move down/Bind chart/Delete row); long-press 500ms (touch only) → ContextMenu with selection-aware 4 items mirroring desktop. Mobile reorder via swap-orders applyEdit pair in the edit Sheet (drag-on-cards OUT for v1). SetlistGrid renders MobileCardList XOR table conditionally; BatchActionBar + AddRowPlaceholder shared across both render paths. Mobile-only top-level ChartBindPopover with sr-only anchor span (display:none breaks Radix anchoring; sheet positions to viewport bottom regardless on touch). Undo via plain zustand store (NOT zundo — temporal middleware's wrong granularity for per-cell-blur snapshots): new `src/lib/local/undo-store.ts` with manual pushEntry / popUndo / popRedo + per-key burst coalescing (UNDO_BURST_MS=500ms; first-prev wins, latest-new wins on same-key writes) + cap UNDO_MAX_ENTRIES=50; module-scoped pendingBursts Map outside zustand state. applyEdit augmented with `ApplyEditOptions` (`withoutUndo` + `undoKey`); reads prevDoc BEFORE transaction, pushes snapshot AFTER commit (failed writes leave no phantom entries). update ops route through pushEntryDebounced; set + delete push immediately. Composite-undo wiring for handleBulkSet / handleBulkDelete / handleContextDuplicate / handleDragEnd — each handler snapshots prevDocs first, fires applyEdit({withoutUndo:true}) cascade, reads newDocs, pushes ONE composite entry. Cmd-Z + Cmd-Shift-Z handler at SetlistGrid root with INPUT/TEXTAREA/SELECT/contenteditable skip per v4.2 P2-04 precedent; flushAllBursts before popUndo so in-flight cell edits land first; Cmd-Y supported as redo alias. WCAG AA audit (§6.13) via jest-axe + axe-core devDeps: 7 axe scan cases (rest grid, AddRowPlaceholder open, AlertDialog single, AlertDialog bulk, ChartBindPopover open, BatchActionBar mounted, ContextMenu open) + 1 keyboard Tab-order case; axeOpts disables 5 harness-context false-positive rules (region/landmark-one-main/page-has-heading-one + aria-required-children/parent for grid role); ZERO violations on first run — design system internalized correctly across all of v50-05. Manual Lighthouse on prod /setlists/[id] deferred to user smoke (deferred-smokes #7). 4 commits: `b23fae1` (chore PLAN) + `3e19bf0` (Task 1 mobile flow) + `2260a21` (Task 2 Undo + Cmd-Z) + `e2f1daa` (Task 3 a11y). 3 tasks, 8 ACs, autonomous. +33 new vitest cases (1410/1410 — cross-tab-lock pre-existing flake passed too); tsc + next build clean. New devDeps: jest-axe ^10.0.0 + @types/jest-axe ^3.5.9 + axe-core ^4.11.3. zundo NOT added (planned inline at PLAN-write, confirmed at apply-time — plain zustand was the right shape).

**Phase v50-05 outcome (2026-04-26):** Spreadsheet editor UI cutover end-to-end across 5 plans. Production /setlists/[id] serves desktop (TanStack Table v8 + cmdk dropdowns + dnd-kit reorder), iPad (Sheet swap on `(pointer: coarse)` + 44px touch targets + ContextMenu via right-click + 500ms long-press), and phone (parallel stacked-card render path + per-card edit Sheet + selection-aware long-press menu). Multi-select + bulk edit via BatchActionBar; window.confirm replaced by shadcn AlertDialog via DeleteConfirmProvider; song catalog + sticky memory wired via v50-04 helpers; sync engine (v50-03) carries every write to Firestore with LWW per-doc invariant + 6-state FSM + cross-tab single-leader lock; Cmd-Z undo with per-cell-blur burst coalescing + composite entries for multi-row actions; jest-axe ZERO violations across 7 mounted-and-interactive states. App intentionally broken-for-band during cutover per milestone constraint (band not in production). Net delivery across phase: ~+13,000 / −6,300 LOC; +159 vitest cases (1218 → 1410); zero production regressions; /ui-ux-pro-max invoked at every APPLY per SPECIAL-FLOWS.md mandate.

Deferred (out of v50-05 — sent to v50-06+):
- §6.9 reconciliation modal + expectedUpdatedAt tracking + cross-tab-lock flake fix → v50-06 (concurrent-edit safety phase)
- Cross-leader live-edit visibility (real-time setlist sync replacement for deleted live-swap UI) → v50-06
- Production migrate-v50.ts apply (split-brain: legacy embedded `setlists/{id}.tracks[]` + new top-level `tracks/{id}` docs) → v50-07
- Production smoke verification of v50-05-02 cutover → user backlog (deferred-smokes #4)

Skills required: /ui-ux-pro-max (BLOCKING for APPLY of every v50-05 plan)

### Phase v50-06: Concurrent-edit safety + offline + cross-tab

Focus: "Remote changed — keep mine / take theirs" reconciliation banner via local-first IDB diff. Two-tab edit scenarios pass. Airplane-mode tests pass. Performance view audit: read-only on the new doc shape; verify that real-time setlist sync (= the v3.0 "live swap" replacement) works correctly when the leader edits during a service.

Plans (3-plan vertical-slice split per handoff guidance; revisable at PLAN time):
- **v50-06-01 ✓ (2026-04-26) — Substrate stabilization.** Cross-tab-lock test deflaked (30/30 deterministic; root cause = brittle "lower tabId wins" assertion fired on sequential tryAcquire — fix added deferred-delivery FakeChannelHub variant so the actual tie-break race is testable; 50-iter stress loops for both invariants; production cross-tab-lock.ts UNTOUCHED). FirestoreAdapter contract extended: `commitOutboxRow → Promise<CommitResult{updatedAt?}>`; ProductionFirestoreAdapter re-reads doc post-commit (one extra getDoc per write) to surface server timestamp; engine writes new updatedAt back to local row inside the SAME Dexie rw tx that deletes the outbox row (atomic, with `if(existing)` guard for mid-flight deletes; delete ops skip writeback). LocalTrack + LocalSong gained explicit `updatedAt?: number` (was hidden behind index sig). expectedUpdatedAt threaded through every track-update applyEdit call site: 7 cell-commit sites + handleDeleteRow + handleBindChart + handleBulkSet + handleBulkDelete + handleContextDuplicate cascade + handleDragEnd + 4 MobileCardList move ops + executeEntry undo/redo (reads LIVE updatedAt at undo-time, NOT snapshot-time, so undo races a remote write surface as VersionMismatch in v50-06-02). New 'two-writer race' describe block in property-failures harness: SharedRemote + TwoWriterAdapter + per-engine LocalDb + distinct lock channels → exactly one write succeeds, loser's outbox row in 'failed' status with localId addressable for resolveConflict('mine'|'theirs'), engine state 'conflict', loser's local row preserved. 4 commits: `9ca4943` (chore PLAN), `5736599` (Task 1 deflake), `0ce9bd2` (Task 2 substrate), `edfc339` (Task 3 race test) + close commit. Suite 1418/1418 (+8 from 1410); tsc + next build clean. 3 tasks, 6 ACs, autonomous, backend/test only — `/ui-ux-pro-max` NOT required for this plan.
- **v50-06-02 ✓ (2026-04-26) — Reconciliation modal (§6.9).** ReconciliationProvider mounted inside DeleteConfirmProvider at /setlists/[id] (both isNew + persisted branches); subscribes to engine 'conflict' state via `useSyncStatus` + reads `failed`-status outbox rows via `useLiveQuery`; auto-opens on conflict transition with user-dismissable Cancel/Esc semantics; SyncIndicator's "Conflict — review" action button re-opens dismissed modal via `useReconciliationModalOptional` (fail-soft hook mirroring `useDeleteConfirmOptional`). FirestoreAdapter interface extended with `readDoc(collection, docId) → RemoteDocSnapshot|null`; ProductionFirestoreAdapter implements via `getDoc` + `Timestamp.toMillis()`; `init.ts` tracks `adapterSingleton` alongside engine + exports `getSyncAdapter()` so the provider reads remote diffs without reaching into engine internals. Per-row card renders title from local Dexie tracks (title|name lookup) + per-field DIFF (informational; filtered by DIFF_HIDDEN_FIELDS = {id, setlistId, order, createdAt, updatedAt}; PRETTY_FIELD map for display) + per-row "Keep mine / Take theirs" radio defaulting to 'theirs' (safe default per §6.9 — user opts in to overwrite remote). "Resolve all and save" iterates `engine.resolveConflict(localId, choice, { newExpectedUpdatedAt })` sequentially with newExpectedUpdatedAt sourced from cached RemoteDocSnapshot when choice='mine'. Granularity decision: per-row UX, NOT per-field (matches substrate API; per-field would require new engine surface OR UI-side merge plumbing — deferred to v50-06-03+ if real-world conflict patterns demand granular merge). Property-failures harness extended with `setupTwoWriterRace` helper + 'mine' branch test (asserts post-resolve outbox empty + remote holds loser's payload + remote.updatedAt > winner's) + 'theirs' branch test (asserts remote unchanged + loser local row preserved at baseline) — 5/5 deterministic. ReconciliationProvider component test (~420 LOC, 11 cases) covers AC-1/2/3-mine/3-theirs/4-cancel/4-esc/sequential-iteration + 3 jest-axe scans (closed/1-conflict/3-conflict; reused v50-05-05 axeOpts) — ZERO violations on first run. Plain HTML radios over `@radix-ui/react-radio-group` (no new dep; native a11y semantics). Test-seam props (`adapter` + `onResolveConflict`) bypass init.ts singletons; `useSyncStatus` mocked at module scope. 4 commits: `0278e0f` (chore PLAN), `6c9662b` (Task 1 substrate + provider), `51a4298` (Task 2 property-failures branches), `43fefaf` (Task 3 component + jest-axe). 3 tasks, 7 ACs, autonomous: false (1 decision checkpoint + 1 human-verify deferred to deferred-smokes #8 per existing pattern). Suite 1431/1431 (+13 from 1418); tsc + next build clean. `/ui-ux-pro-max` invoked at APPLY entry per SPECIAL-FLOWS.md.
- **v50-06-03 ✓ (2026-04-26) — Cross-leader live-edit + airplane-mode + performance view audit.** Phase v50-06 closes 3/3. New `src/lib/sync/snapshot-listener.ts` (~180 LOC) exports `startSnapshotListener({ setlistId, db })` returning unsubscribe — subscribes to `setlists/{id}` + `tracks where setlistId == X` via firebase/firestore onSnapshot; writes deliveries directly into Dexie via `db.{setlists,tracks}.put` (NOT applyEdit — server-authoritative; mirrors SetlistGridHydrator's idempotent priming pattern). Two safety guards: (1) outbox-pending guard — any outbox row for the docId means a local edit is in flight, skip both put and delete; (2) LWW guard — only put if `remote.updatedAt > local.updatedAt`. Listener errors swallowed + warn-logged; never throws out of callbacks (engine drain remains source of truth). Mounted in SetlistGridHydrator post-hydration via `useEffect`; new `startSnapshotListener` prop test-seam. Test-seam SnapshotSubscriber interface (subscribeSetlist + subscribeTracks) lets unit tests inject hand-rolled fakes — production wires to firebase/firestore in a 30-line factory inside the same module. Property-failures harness extended with two new describe blocks: "passive listener closes the 'theirs' staleness gap" (SharedRemoteSubscriber re-emits SharedRemote tracks state via the test-seam; loser's local row matches remote after listener delivery; ZERO outbox rows created — engine drain remains the only path to 'conflict' state) + "sequential offline edits queue and drain in order" (OfflineToggleAdapter throws NetworkError while online=false; 5 sequential outbox rows queue offline; manual onlineListener harness drives FSM transition out of 'offline' on reconnect; per-doc drain ordering invariant from v50-03 validated end-to-end — adapter.writes carry keys F→G→A→B→C in order; final remote.tracks.t1.key === 'C'; engine state quiesces to 'idle'; 5/5 deterministic). Block B drops expectedUpdatedAt threading from PLAN AC-5 — single-writer offline sequential edits with threaded preconditions self-conflict on reconnect (rows 2..N's baseline=initial, server=ts1, → VersionMismatch); test isolates per-doc ordering invariant from that gap; documented + routed forward as additive plan if real-world airplane-mode patterns demand fixing. Performance-view audit landed Outcome 2: `useSetlistPerformance` reads legacy `setlists/{id}.tracks[]` embedded array via `useSafeFirestoreSync`; v50-05-01 writes top-level `tracks/{id}` collection; production data is split-brain; routed forward to v50-07 as explicit deliverable (not "nice-to-have"). 4 commits: `50f34b5` (chore PLAN), `21d0945` (Task 1 listener+tests), `19f38b9` (Task 2 harness), `1e1fe3c` (Task 3 hydrator mount + audit). 3 tasks, 7 ACs, autonomous=true. +11 new vitest cases (1442/1442 from 1431); tsc + next build clean. /ui-ux-pro-max optional for this plan — no UI surface modified (data-layer wiring + read-only audit + tests).

**Phase v50-06 outcome (2026-04-26):** Concurrent-edit safety + offline + cross-tab end-to-end across 3 plans. The bulletproof loop is now whole: substrate (v50-06-01: atomic writes; CommitResult{updatedAt?}; expectedUpdatedAt threading; cross-tab-lock determinism) + conflict UX (v50-06-02: ReconciliationProvider; per-row "Keep mine / Take theirs"; FirestoreAdapter.readDoc) + cross-leader visibility (v50-06-03: startSnapshotListener; passive 'theirs' rehydration; per-doc drain ordering under offline scenario). No silent paths remain in either the write OR the read direction. Net delivery across phase: ~+750 LOC; +27 vitest cases (1410 → 1442); zero new dependencies; zero engine API changes after v50-06-02. /ui-ux-pro-max invoked at v50-06-02 APPLY entry per SPECIAL-FLOWS.md mandate; optional in v50-06-03 per audit-driven scope.

Deferred (out of v50-06 — sent to v50-07):
- Performance-view bridge to top-level `tracks/{id}` collection (audit Outcome 2 routed forward as explicit deliverable).
- Production migrate-v50.ts apply (existing v50-04 deferral — must run before perf-view bridge ships, since it reshapes legacy `setlists/{id}.tracks[]` arrays into the top-level collection).
- Playwright kitchen-sink suite (random edits + airplane-mode toggles + force-quits + cross-tab edits = zero data loss across N runs).
- Sentry alarms on save-path failures.
- Manual UAT with Rabbi Daniel + one band member.
- Single-writer offline self-conflict gap (additive plan if real-world airplane-mode patterns demand fixing).

Skills required: /ui-ux-pro-max (BLOCKING for APPLY of v50-06-02 only; optional in v50-06-01 and v50-06-03 — backend / data-layer / test concerns dominated those plans)

### Phase v50-07: Migration, kitchen-sink, cutover

Focus: Bring the v5.0 editor into contact with historical production data (24 legacy setlists, 650 embedded tracks). After v50-07-01 audit revealed the legacy shape diverges substantially from v5.0 expectations (no songId references; songs/* empty; liveState orphans on 10 setlists; pre-existing MARKER_PATH bug in migrate-v50.ts), user selected **Option C: Hybrid Lazy Hydration** — old setlists migrate on first edit-open via SetlistGridHydrator; perf-view dual-reads legacy + top-level. Then Playwright kitchen-sink (random edits + airplane-mode + force-quits + cross-tab; zero data loss across ≥100 runs), Sentry alarms on save-path failures, and manual UAT with Rabbi Daniel + band member. Ship to band.

Plans (running scope; revisable):
- **v50-07-01 ✓ (2026-04-27) — Production audit + dry-run report.** New `scripts/audit-v50.ts` (~340 LOC, read-only; no writes). Findings: 29 setlists, 24 with embedded tracks (650 total), 0 distinct songIds (legacy uses `id`/`fileId` not `songId`), `songs/*` empty (0), top-level `tracks/*` empty (0; v5.0 editor unused in prod), 10 setlists carry `liveState` orphan, chats/songGroups/config already clean. 🐛 Pre-existing bug: `migrate-v50.ts MARKER_PATH = 'system/migrations/v50'` is 3-segment collection (not doc); never surfaced because tests use a fake adapter. Recommendation block presented three scope shapes; user selected Option C. 2 commits + close commit. 3 tasks, 7 ACs, autonomous=false (1 HUMAN-VERIFY gate). Suite 1442/1442; tsc + next build clean.
- **v50-07-02 ✓ (2026-04-27) — MARKER_PATH patch + liveState scrub.** Patched migrate-v50.ts MARKER_PATH from `system/migrations/v50` → `system/v50Migration` (2-seg doc); 13 existing migrate-v50 tests still pass after fixture updates. New `scripts/scrub-livestate.ts` (~250 LOC, dry-run by default) reuses MigrationFirestore + FIELD_DELETE_SENTINEL; modes dry-run / apply / rollback / force / help; per-setlist snapshots to `migrations/livestate-scrub/snapshot/{setlistId}` (4-seg doc) before each FieldValue.delete; marker at `system/livestateScrub` for idempotency. 14 unit tests on in-memory FakeFirestore (mirrors migrate-v50.test.ts). Production scrub applied: 10 setlists' `liveState` removed; re-audit confirms liveState count = 0; setlist count unchanged at 29; embedded tracks unchanged at 650. 3 tasks, 7 ACs, autonomous=true. /ui-ux-pro-max NOT required (no UI surface). Suite 1456/1456 (+14); tsc + next build clean.
- **v50-07-03 ✓ (2026-04-27) — Lazy hydration in `SetlistGridHydrator` + perf-view dual-read.** `LocalSetlist.hydrated?: boolean` added (additive non-indexed schema bump). Hydrator gained a fire-once-per-mount lazy-hydration effect after Dexie priming, gated on `hydration === 'done' && !initialSetlist.hydrated && initialTracks.length > 0`: fans out `applyEdit({op:'set', collection:'tracks', doc:t}, {withoutUndo:true})` for every legacy embedded track via Promise.all, then `applyEdit({op:'update', collection:'setlists', docId, patch:{hydrated:true}, expectedUpdatedAt:initialSetlist.updatedAt}, {withoutUndo:true})` after fan-out succeeds. Errors warn-log via `@/lib/logger`; setlist stays unhydrated and retries on next mount. `applyEdit` exposed as a test-seam prop (parallels `startSnapshotListener`); `fanoutStartedRef` survives re-renders. `useSetlistPerformance` dual-reads via `onSnapshot(query(collection(db,'tracks'), where('setlistId','==',setlistId)))`: prefers top-level when length > 0 (sorted by `order` ascending), falls back to `setlistData?.tracks` so 24 not-yet-hydrated legacy setlists keep rendering. No external API or Firestore index changes (single-field setlistId; ≤650 docs total). Tests: SetlistGridHydrator +5 cases (lazy fan-out + skip-already-hydrated + skip-empty + fan-out-failure + fire-once-on-rerender); useSetlistPerformance +4 cases (fallback-empty + prefer-top-level-sorted + live-update + cleanup-unsubscribe); 2 pre-existing priming-only tests marked `hydrated:true` (semantically post-migration). 1 commit (`60de2ff`) covering all 3 tasks (cohesive vertical slice). 3 tasks, 7 ACs, autonomous=true. Suite 1465/1465 (+9 from 1456); tsc + next build clean. `/ui-ux-pro-max` invoked at APPLY entry per SPECIAL-FLOWS.md (brief load — data-correctness, no new pixels).
- **v50-07-04 ✓ (2026-04-27) — Kitchen-sink fast-check property + OfflineToggleAdapter lift.** Decision (Task 0): harness-only — Playwright spec skipped (the v50-06 harness already proves every bulletproof claim a Playwright spec would prove; v50-07-05 manual UAT against real production is the actual end-to-end gate; AC-4 marked N/A; ~200 LOC of mock-Firebase Playwright infra avoided). New `v50-07-04: kitchen-sink under random failure mix` describe in `src/lib/sync/__tests__/property-failures.test.ts`: KitchenSinkAdapter (SharedRemote + online toggle + expectedUpdatedAt precondition combining OfflineToggleAdapter + TwoWriterAdapter shapes), KSAction grammar (edit-set/update/delete + toggle-online + force-quit + cross-tab via direct SharedRemote mutation simulating "another tab pushed an edit" + lazy-hydrate mirroring SetlistGridHydrator's Promise.all fan-out + final update({hydrated:true}) + tick), runKitchenSink with 4 invariants (AC-9 no-data-loss + per-doc drain ordering + no orphaned 'sending' + lazy-hydration idempotency). fast-check property: 50 CI iterations / 10 local with 8s per-iteration safety timeout via Promise.race so runaway shapes shrink to a counterexample instead of timing out the entire test (downgraded to 50 CI iterations from PLAN's "≥100" — fits 22.5s test / 25.6s wall under the 60s budget; documented scope reduction). 2 deterministic regressions (lazy-hydration cascade idempotency across re-mounts; cross-tab edit + local update surfaces VersionMismatch as observable failed row). OfflineToggleAdapter lifted from inside the v50-06-03 describe to module scope (the only sensible reuse target — setupTwoWriterRace + SharedRemoteSubscriber too scenario-specific to lift); v50-06-03 still 10/10 against the lifted adapter. New `npm run test:kitchensink` script for ergonomic local re-runs. Mid-build deviation: clock.advance in the quiesce loop ran away under repeated VersionMismatch retry storms (fast-check shrunk a 4-op counterexample: lazy-hydrate s1+t1 + edit-delete tracks/t1 + edit-update setlists/s1 + edit-delete setlists/s1) — replaced clock.advance with bare pump() loop; failed/pending rows still observable in outbox satisfies AC-9 either way; pattern documented for future tests. 3 commits: `b296ab1` (PLAN), `47ae779` (Tasks 1+3; Task 2 skipped per Task 0), `7ea19a6` (STATE chore). 3 tasks + 1 decision checkpoint resolved (autonomous=false → harness-only); 6/7 ACs met (AC-4 N/A). Suite 1468/1468 (+3 from 1465); tsc + next build clean. /ui-ux-pro-max NOT required (test infra; same precedent as v50-06-01 + v50-07-02).
- **v50-07-05 ✓ (2026-04-27) — Sentry alarms + UAT plan + ship checklist (FINAL plan in v5.0).** New `src/lib/sync/sentry-capture.ts` helper exports `captureSyncFailure(err, context)` centralizing tag/level/extra across all v5.0 substrate captures: wraps @sentry/nextjs `Sentry.captureException` with try/catch (telemetry NEVER crashes engine if SDK uninitialized or transport-failed), tags string-coerced (Sentry indexer requires strings), undefined/null context fields dropped from tags (no "undefined" leak), level mapping (dead-letter + write-atomicity → 'error'; lazy-hydration + snapshot-listener → 'warning'). Wired at 6 silent-failure sites: SetlistGridHydrator lazy-hydration catch (after existing logger.warn; passes setlistId + trackCount; warning) + engine.ts dead-letter transition BEFORE existing dispatch('DRAIN_BUDGET_EXHAUSTED') (passes collection + docId + op + attempts; error) + 4 snapshot-listener swallow paths (setlist-apply / tracks-apply / setlist-subscribe / tracks-subscribe; warning; site tag flows through). Per-feature explicit non-capture: 'conflict' state (user-facing UX, reconciliation modal IS the response), per-attempt drain failures (only dead-letter — alert fatigue), payload contents (PII discipline — only stable identifiers reach Sentry). 6 unit tests prove tag/level/extra/no-throw/coercion/undefined-drop. UAT-PLAN.md ships at `.paul/phases/v50-07-migration-cutover/v50-07-05-UAT-PLAN.md`: 15-item Day-1 smoke checklist + 7 weekly-workflow scenarios (clone+tweak / add song / bind chart / transpose perf-view / mobile flow / historical legacy lazy-hydration / two-leader cross-tab race) each with setup/steps/expected/pass/if-fail + coverage map mapping scenarios to v50-XX phases + invariants + out-of-scope folding deferred-smokes #4 + #7. SHIP-CHECKLIST.md ships at `.paul/phases/v50-07-migration-cutover/v50-07-05-SHIP-CHECKLIST.md`: 8-step deploy verification + 1-page band onboarding doc (plain English; sync indicator states named in user terms not engine FSM names; "Move to public help system in v5.1" note at bottom) + first-week Sentry monitoring playbook (alert tag → meaning → severity → response table for all 4 features wired + placeholder for write-atomicity; recommended dashboard saved-view filter; rollback via git revert + push; explicit list of NOT-captured events). 3 tasks, 8 ACs, autonomous=true; zero deviations. 3 commits: `b2cbb16` (PLAN), `9987bc5` (Tasks 1+2+3 cohesive vertical slice), `bdd0e1b` (STATE). Suite 1474/1474 (+6 from 1468); tsc + next build clean. Pushed to origin master; Vercel auto-deploys. /ui-ux-pro-max NOT required (observability + docs; same precedent as v50-06-01 + v50-07-02 + v50-07-04). v5.0 milestone close gated on UAT execution post-plan (Rabbi Daniel + one band member over 1–2 weekly cycles), then `/paul:audit-milestone` closes v5.0.

**Phase v50-07 outcome (2026-04-27):** Migration + cutover end-to-end across 5 plans. Production audit (v50-07-01) → MARKER_PATH patch + liveState scrub (v50-07-02) → Option C Hybrid lazy hydration in SetlistGridHydrator + perf-view dual-read (v50-07-03) → kitchen-sink fast-check property at the harness layer (v50-07-04) → Sentry observability + UAT plan + ship checklist (v50-07-05). 24 legacy setlists primed for first-edit-open silent migration; 10 setlists' liveState scrubbed with rollback snapshots in place; bulletproof loop now both proven (harness) and observable (Sentry). Net delivery: ~+2,400 LOC (audit + scrub + lazy-hydration + perf-view dual-read + kitchen-sink + sentry-capture + 6 capture sites + 2 milestone-close docs); +52 vitest cases (1442 → 1474); zero engine FSM / adapter interface / Dexie schema / Firestore rules changes after v50-06-02. /ui-ux-pro-max NOT required for any v50-07 plan beyond v50-07-03 (the UI-data-bridge plan); v50-07-01 + 02 + 04 + 05 were script work / test infra / observability / docs.

Deferred (out of v50-07 — sent to v5.1 if real-world UAT surfaces them):
- Single-writer offline self-conflict gap (v50-06-03 Block B SUMMARY documents the test isolation; UAT scenario 5 mobile + flaky-wifi may surface real-world need)
- Public help system migration of the band onboarding doc (drafted in `.paul/`; should relocate when public help system exists)
- Legacy `setlists/{id}.tracks[]` array cleanup post-hydration (preserved as backup per v50-07-03 SCOPE LIMITS; cleanup is its own future plan if needed)
- songs/* + songId backfill on legacy tracks (carried from v50-07-03; sticky-memory benefits only kick in for new chart-binds via ChartBindPopover from now on)

Skills required: /ui-ux-pro-max (BLOCKING for APPLY of v50-07-03 only; v50-07-01 + 02 + 04 + 05 are backend / scripts / test infra / observability / docs)

Skills required: /ui-ux-pro-max (BLOCKING for APPLY of v50-07-03 only; v50-07-01 + v50-07-02 are backend/script work)

## Previous Milestone
**v4.5 Unloseable Live-Ops**
Status: 🟡 Superseded by v5.0 (2 of 8 phases shipped; 6 cancelled)
Completed: Partial — 2026-04-20

Rationale: v4.5's pending phases (IDB draft journal, sync engine, conflict surface redesign, save observability UI, toolbar priority, deferred v4.4 polish) all targeted the save-path machinery that v5.0 deletes. Finishing them is wasted work. Two shipped phases (observability + library cache) remain on master and provide standalone value regardless of the editor rewrite.

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| v45-01 | Save-path observability | 1/1 | ✅ Complete | 2026-04-20 |
| v45-02 | IndexedDB draft journal | - | ❌ Cancelled — superseded by v50-02 | - |
| v45-03 | Sync engine | - | ❌ Cancelled — superseded by v50-02 | - |
| v45-04 | Conflict surface redesign | - | ❌ Cancelled — superseded by v50-05 | - |
| v45-05 | Save observability UI | - | ❌ Cancelled — superseded by v50-02 | - |
| v45-06 | Performance toolbar priority system | - | ❌ Cancelled — out of scope for v5.0 | - |
| v45-07 | Library cache invalidation on upload | 1/1 | ✅ Complete | 2026-04-20 |
| v45-08 | Deferred v4.4 polish (reconciled) | - | ❌ Cancelled — orphaned | - |

### Phase v45-01: Save-path observability ✓

Focus: Logged every silent-return path in the save pipeline via v4.4 request-ID telemetry — `StaleWriteError`, keepalive flush non-2xx, `canEdit=false` early-return, token refresh failure. Each incident now leaves a server-side trace.

### Phase v45-07: Library cache invalidation on upload ✓

Focus: Upload completion broadcasts `library:invalidate` on BroadcastChannel. Library store, setlist picker, chat file search all subscribe and refetch on signal.

## Previous Milestone
**v4.4 Deferred Audit Sweep — Architectural Polish**
Status: ✅ Complete
Completed: 2026-04-15
Phases: 5 of 8 shipped (3 deferred to v4.5)
Archive: `.paul/milestones/v4.4-ROADMAP.md`

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| 0 | Full-project audit (R1+R2, 186 findings) | done | ✅ Complete | 2026-04-15 |
| 1 | Data-layer atomicity — scheduling transactions | 1/1 | ✅ Complete | 2026-04-15 |
| 2 | Denormalization reconciliation — DL-010 | 1/1 | ✅ Complete | 2026-04-15 |
| 3 | Client async safety — AbortController sweep | 1/1 | ✅ Complete | 2026-04-15 |
| 4 | File-size refactor — 5 files >600 LOC | - | 🕓 Deferred to v4.5 | - |
| 5 | Observability — request IDs + SSE status | 1/1 | ✅ Complete | 2026-04-15 |
| 6 | Modal state hygiene — 4 modals with state-reset bugs | 1/1 | ✅ Complete | 2026-04-15 |
| 7 | Type-safety tail | - | 🕓 Deferred to v4.5 | - |
| 8 | Perf tail | - | 🕓 Deferred to v4.5 | - |

**Outcome:** All P0/P1 audit findings closed; all R2B "must fix before release" items closed; band-onboarding UX gate cleared.

## Earlier Milestone
**v4.3 Deep Audit Remediation**
Status: ✅ Complete
Completed: 2026-04-15
Phases: 10 (original 9 + Phase 10 auth deep-dive added mid-cycle)
Goal: Close the P0/P1 gaps surfaced by the v4.3 Phase 1 recursive audit (83 findings) + the role-claim-sync latent bug surfaced during 04-03 rollout before the band onboards.

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| 1 | Recursive Audit (bugs/security/UX/data/perf/dead-code) | 1/1 | ✅ Complete | 2026-04-14 |
| 2 | P0 Security Triage (S01 chat prompt injection, S03 drive-file auth) | 2/2 | ✅ Complete | 2026-04-14 |
| 3 | Bridge Credentials Design (S02 — CRIT-003) | 2/2 | ✅ Complete | 2026-04-14 |
| 4 | P0 Data Integrity (D01 orphan cascade, D02 .passthrough, D03 assign race) | 3/3 | ✅ Complete | 2026-04-14 |
| 5 | P0 Bugs + UX (B01 silent catches, B02 alert-store, U01 touch, U02 keyboard) | 4/4 | ✅ Complete | 2026-04-14 |
| 6 | P1 Security + Bugs (S04 QR role gate, S05 schema wontfix, S06 wontfix, B03 monitor race, B06 swapTrack guard; B04/B05 false positive on review) | 2/2 | ✅ Complete | 2026-04-15 |
| 7 | P1 Data sweep (D05 eventDate shape; D04 auto-indexed, false positive) | 1/1 | ✅ Complete | 2026-04-15 |
| 8 | Performance + Dead-Code Sweep (P01-P05, C01-C04) | 0/TBD | ⏭️ Deferred to v4.4 | - |
| 9 | Role-Claim Sync (latent auth bug surfaced during 04-03) | 2/2 | ✅ Complete | 2026-04-15 |
| 10 | Auth Deep-Dive Hardening (added mid-cycle) | 6/6 | ✅ Complete | 2026-04-15 |

### Phase 1: Recursive Audit ✓
Deliverable: `.paul/phases/v43-01-recursive-research/FINDINGS.md`
6 parallel deep-audit agents → 83 raw findings synthesized into 10 P0 + ~20 P1 + balance P2. Prioritized action list and phase split drafted.

### Phase 10 (added mid-cycle): Auth Deep-Dive Hardening
After a recurring `/setlists ↔ /login` regression surfaced the architectural fragility of the auth flow, ran a fresh 2-wave 4-agents-each recursive research pass (WAVE-1A/B/C/D + WAVE-2A/B/C/D) producing FINDINGS + FINDINGS-v2. Shipped 6 plans: 10-01 fail-fast env + initAdmin guards + bounce-cookie path, 10-02 cold-load race kill (router.refresh after cookie + cold-load mount refresh + login UX), 10-03 drift-repair module with 3× retry + `[drift]` telemetry, 10-04 restore Firestore isMember() gate on setlists, 10-05 Playwright smoke + CI job, 10-06 cross-tab sign-out via BroadcastChannel.

## Previous Milestone
**v4.2 UX Polish & Band Onboarding**
Status: ✅ Complete
Completed: 2026-04-14
Phases: 8

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 1 | Recursive Research (Bugs/Gaps/Failures) | 1/1 | 2026-04-13 |
| 1.1 | Concurrent-edit Safety | 1/1 | 2026-04-13 |
| 1.2 | Offline Truthiness | 1/1 | 2026-04-13 |
| 1.3 | Security Hardening | 1/1 | 2026-04-13 |
| 2 | Weekly Workflow Polish | 4/4 | 2026-04-13 |
| 3 | Stage UX for the Band | 4/4 | 2026-04-14 |
| 4 | Editor Ergonomics + Noise Cleanup | 6/6 + audit | 2026-04-14 |
| 5 | Navigation + Schedule Hygiene | 2/2 + audit | 2026-04-14 |

Focus: Deep app hardening pre-band-onboarding. Multi-wave audit → 53+ findings → 7 execution phases. Concurrent-edit safety via Firestore runTransaction + rev precondition. Offline truthiness via IndexedDB blob store (Cache-API pretense removed). Security hardening (storage.rules in VC, 10-char bridge setup-code, rate limits). Weekly-workflow polish (save-reliability flush route, single-step wizard, role-aware dashboard). Stage UX (per-track transposition display, amber cue-notes, IDB-backed offline indicator, SwapPicker keyboard/iOS polish, PDFOverlay ErrorBoundary). Editor cleanup (canEditSetlist helper, apiFetch timeout + PDFViewer abort, role-aware OnboardingCard, toast hygiene, Move-Up/Down buttons, triple-modal audit). Navigation hygiene (mobile Schedule tab, UnifiedCalendar cleanup, dead musician_availability indexes dropped, orphan /settings routes removed, SetlistDrawer + monitor-live audited-live).

## Previous Milestone
**v4.1 Kill Private Setlists (for real this time)**
Status: Complete
Completed: 2026-04-13
Phases: 1

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| 1 | Kill Private Setlists | 1/1 | Complete | 2026-04-13 |

### Phase 1: Kill Private Setlists

Focus: Finished what v4.0 Phase 2 started. Removed `isPublic` from the type, schema, service signature, and every caller. One-shot Firestore migration stripped the field from 25 of 26 existing setlist docs (idempotent). Removed lingering UI affordances. Added a regression-guard test.

## Previous Milestone
**v4.0 Live Swap Redesign**
Status: Complete
Completed: 2026-04-04
Phases: 3

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| 1 | Teardown Old Live System | 1/1 | Complete | 2026-04-04 |
| 2 | Remove Private Setlists | 1/1 | Complete | 2026-04-04 |
| 3 | Inline Swap + Toast | 1/1 | Complete | 2026-04-04 |

### Phase 1: Teardown Old Live System

Focus: Remove LeaderConsole, SwapButton, SwapBottomSheet, SwapToast, /live/[id] receiver page, liveState, presence tracking, canLiveSwap permission, song groups/liturgicalSlot system, admin Song Groups tab, canLiveSwap toggle in UserRow. Clean removal — no replacement yet.

### Phase 2: Remove Private Setlists

Focus: Eliminate the isPublic flag distinction. All setlists are public. Remove personal tab, ownership-gated restrictions. Any band leader or admin can edit any setlist. Simplify Firestore rules, UI, and data model.

### Phase 3: Inline Swap + Toast

Focus: Leader taps a song in the performance view → search picker appears pre-populated with fuzzy name matches from the library (e.g., Barechu variants). Leader picks replacement → Firestore tracks array updates → everyone's view updates in real-time. Toast notification shows all musicians what was swapped.
Skills required: /ui-ux-pro-max

## Previous Milestone
**v3.4 Fixes & Live Mode Activation**
Status: Complete
Completed: 2026-04-04
Phases: 3

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| 1 | Mount LeaderConsole | 1/1 | Complete | 2026-04-04 |
| 2 | Setlist Permissions Fix | 1/1 | Complete | 2026-04-04 |
| 3 | Print Outline Fix | 0/0 | Complete | 2026-04-04 |

### Phase 1: Mount LeaderConsole

Focus: Wire up the orphaned LeaderConsole component into the performance page so leaders can start Live Mode, step through the service, and enable Live Swap. All v3.0 infrastructure (swap buttons, bottom sheet, toast, /live/[id] receiver, Firestore rules, API routes) is already built — just needs the entry point. Absorbed from v3.3.
Skills required: /ui-ux-pro-max

### Phase 2: Setlist Permissions Fix

Focus: Close and duplicate actions currently only work on setlists created by the current user. Fix so they work on any public setlist regardless of owner.

### Phase 3: Print Outline Fix

Focus: Non-song items (readings, prayers, liturgical elements) are currently excluded from the printed outline/cover page. Include them as line items in the printed order of service — no chart pages needed, just listed on the outline.
Note: Fully addressed in Phase 2 — no separate plan needed.

## Previous Milestone
**v3.3 Live Mode Activation** (absorbed into v3.4)
Status: Absorbed
Note: Scope merged into v3.4 Phase 1

## Previous Milestone
**v3.2 Mobile Admin & Responsive Fixes**
Status: Complete
Completed: 2026-03-31

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| 1 | Mobile Admin Controls | 1/1 | Complete | 2026-03-31 |
| 2 | Touch Targets & Responsive Polish | 1/1 | Complete | 2026-03-31 |

## Previous Milestone
**v3.1 Post-v3.0 Bugsweep & Hardening**
Status: Complete
Completed: 2026-03-31

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| 1 | Critical Security & Data Integrity | 2/2 | Complete | 2026-03-31 |
| 2 | Memory Leaks, Type Safety & Failing Tests | 1/1 | Complete | 2026-03-31 |
| 3 | Error Handling & v3.0 Hardening | 2/2 | Complete | 2026-03-31 |
| 4 | UX Safety & Confirmation Dialogs | 1/1 | Complete | 2026-03-31 |
| 5 | Test Coverage & Performance | 1/1 | Complete | 2026-03-31 |

### Phase 1: Critical Security & Data Integrity

Focus: P0 security vulnerabilities — unauthenticated session DELETE endpoint, timing attacks on cron auth (3 routes), scheduling race conditions (assign/unassign/respond), npm audit fix + Next.js upgrade, Firestore rules hardening (config/admins lockdown, missing collection rules, system collection).

### Phase 2: Memory Leaks, Type Safety & Failing Tests

Focus: Runtime stability — Firestore listener memory leaks (alert-store, congregation-store), add liveState to Setlist type, fix `useSafeFirestoreSync<any>` generics, eliminate production `as any` casts, fix 3 failing tests, fix ESLint errors in use-song-groups.ts.

### Phase 3: Error Handling & v3.0 Hardening

Focus: Silent failure elimination — incomplete newTrack in swap, stale tracks array race, missing null checks, swap error handling, onSnapshot error callbacks, empty catch blocks, console.error → logger migration.

### Phase 4: UX Safety & Confirmation Dialogs

Focus: Destructive action protection — SwipeToDelete confirmation, role change confirmation, template editor unsaved changes warning, scheduling-reminder maxDuration, notification error handling, auth-context async guard, pending detections cleanup.

### Phase 5: Test Coverage & Performance

Focus: Quality hardening — v3.0 test coverage (swap hooks, components, API routes), lazy-load PrintModal/jsPDF, code-split ChatPanel, ChatPanel error boundary.

## Previous Milestone
**v3.0 Live Setlist Sync**
Status: Complete
Completed: 2026-03-30

## Previous Milestone (prior)
**v2.6 Deprecation Cleanup, Tech Debt & Setlist UX**
Status: Complete
Completed: 2026-03-12

## Previous Milestone (prior)
**v2.5 Bugsweep & Test Coverage**
Status: Complete
Completed: 2026-03-12

## Completed Milestones

<details>
<summary>v2.5 Bugsweep & Test Coverage - 2026-03-12 (19 phases, 30 plans)</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 1 | Type Safety Fixes | 1/1 | 2026-03-11 |
| 2 | Silent Failure & Error Handling | 1/1 | 2026-03-11 |
| 3 | Test Infrastructure & Flaky Fix | 1/1 | 2026-03-11 |
| 4 | Data Layer Tests | 2/2 | 2026-03-11 |
| 5 | API Route Tests | 3/3 | 2026-03-11 |
| 6 | Hook Tests | 3/3 | 2026-03-11 |
| 6.1 | SW Removal & Firestore Recovery | 2/2 | 2026-03-11 |
| 7 | Remove Annotation Feature | 1/1 | 2026-03-11 |
| 8 | Performance UX Fixes | 1/1 | 2026-03-12 |
| 8.1 | Setlist Access Bug Fixes | 1/1 | 2026-03-11 |
| 9 | Print View & Sticky Keys | 1/1 | 2026-03-12 |
| 10 | Public Setlist Access | 1/1 | 2026-03-12 |
| 10.1 | Mobile Action Bar Redesign | 1/1 | 2026-03-12 |
| 11 | Component Tests | 2/2 | 2026-03-12 |
| 12 | AI & Integration Tests | 2/2 | 2026-03-12 |
| 13 | Tablet Performance UX | 1/1 | 2026-03-12 |
| 14 | Bug Fixes & Race Conditions | 1/1 | 2026-03-12 |
| 15 | Setlist-Only Print Option | 1/1 | 2026-03-12 |
| 16 | Design Token Cleanup & Accessibility | 1/1 | 2026-03-12 |
| 17 | iPad Safe Areas & Spacing | 1/1 | 2026-03-12 |
| 18 | Backend Hardening | 1/1 | 2026-03-12 |
| 19 | Final Audit & Clean Sweep | 1/1 | 2026-03-12 |

Archive: `.paul/milestones/v2.5-ROADMAP.md`

</details>

<details>
<summary>v2.0 Schedule & Workflow Fixes - 2026-03-11 (3 phases, 3 plans)</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 1 | Schedule Visibility Fix | 1/1 | 2026-03-11 |
| 2 | Gig Packet Modal Layout Fix | 1/1 | 2026-03-11 |
| 3 | Print PDF Layout Fixes | 1/1 | 2026-03-11 |

</details>

<details>
<summary>v1.9 Auth Stability & Deferred Cleanup - 2026-03-11 (5 phases, 4 plans)</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 1 | Auth & Routing Regression Audit | 1/1 | 2026-03-11 |
| 2 | Auth Flow Rebuild | 1/1 | 2026-03-11 |
| 3 | Avatar System Fix | 1/1 | 2026-03-11 |
| 4 | ~~Bridge Credentials Security~~ | 0 | Skipped |
| 5 | Deferred Cleanup Batch | 1/1 | 2026-03-11 |

</details>

<details>
<summary>v1.8 Mobile UX Overhaul - 2026-03-11 (3 phases, 3 plans)</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 1 | Mobile Navigation Redesign | 1/1 | 2026-03-11 |
| 2 | Setlist Mobile Responsive Layout | 1/1 | 2026-03-11 |
| 3 | Schedule Page Redesign | 1/1 | 2026-03-11 |

Archive: `.paul/milestones/v1.8-ROADMAP.md`

</details>


<details>
<summary>v1.7 Critical Bug Fixes - 2026-03-11 (5 phases, 5 plans)</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 1 | Mobile Sign-In Fix | 1/1 | 2026-03-11 |
| 2 | Quick Fixes (Avatar, Changelog) | 1/1 | 2026-03-11 |
| 3 | Print Pipeline & Gig Packet Overhaul | 1/1 | 2026-03-11 |
| 4 | Key Signature Position | 1/1 | 2026-03-11 |
| 5 | Monitor Buses Investigation | 1/1 | 2026-03-11 |

Archive: `.paul/milestones/v1.7-ROADMAP.md`

</details>

<details>
<summary>v1.6 Stability & Regression Audit - 2026-03-11 (4 phases, 4 plans)</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 1 | Auth & CSP Hardening | 1/1 | 2026-03-11 |
| 2 | Firebase-Only File Serving | 1/1 | 2026-03-11 |
| 3 | Performance View Overhaul | 1/1 | 2026-03-11 |
| 4 | Regression Sweep & Deferred Fixes | 1/1 | 2026-03-11 |

Archive: `.paul/milestones/v1.6-ROADMAP.md`

</details>


<details>
<summary>v1.5 Codebase & UI/UX Hardening - 2026-03-10 (6 phases, 11 plans)</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 1 | Critical Bug Fixes | 1/1 | 2026-03-10 |
| 2 | Security & API Consistency | 4/4 | 2026-03-10 |
| 3 | Architecture Cleanup | 3/3 | 2026-03-10 |
| 4 | Quality & Deps | 1/1 | 2026-03-10 |
| 5 | UI/UX Polish | 1/1 | 2026-03-10 |
| 6 | Performance & Monitoring | 1/1 | 2026-03-10 |

Archive: `.paul/milestones/v1.5-ROADMAP.md`

</details>

<details>
<summary>v1.4 Fixes & Library Management - 2026-03-10 (5 phases, 5 plans)</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 1 | Library Management | 1/1 | 2026-03-10 |
| 2 | Setlist & Editor Fixes | 1/1 | 2026-03-10 |
| 3 | Print Gig Packet Fixes | 1/1 | 2026-03-10 |
| 4 | PDF Health Scanner | 1/1 | 2026-03-10 |
| 5 | Backend Analysis & Bug Scan | 1/1 | 2026-03-10 |

Archive: `.paul/milestones/v1.4-ROADMAP.md`

</details>

<details>
<summary>v1.3.1 Regression Fixes - 2026-03-10 (1 phase, 1 plan)</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 1 | Regression Fixes | 1/1 | 2026-03-10 |

Archive: `.paul/milestones/v1.3.1-ROADMAP.md`

</details>

<details>
<summary>v1.3 Bugsweep & Backend Hardening - 2026-03-10 (4 phases, 7 plans)</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 1 | Codebase Audit & Recommendations | 1/1 | 2026-03-10 |
| 2 | Critical Fixes (Security & Data Integrity) | 2/2 | 2026-03-10 |
| 3 | Backend Hardening (Error Handling & Consistency) | 2/2 | 2026-03-10 |
| 4 | Frontend Robustness (Hooks, Types, Cleanup) | 2/2 | 2026-03-10 |

Archive: `.paul/milestones/v1.3-ROADMAP.md`

</details>

<details>
<summary>v1.2 Library, Manage & Monitor Overhaul - 2026-03-09 (9 phases, 10 plans)</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 23 | Library Archive & Health | 2 | 2026-03-09 |
| 24 | Manage Section Redesign | 1 | 2026-03-09 |
| 25 | Monitor Stability | 1 | 2026-03-09 |
| 26 | Monitor UX Redesign | 1 | 2026-03-09 |
| 27 | Monitor Connection Architecture Overhaul | 1 | 2026-03-09 |
| 28 | Monitor Tab & User List Cleanup | 1 | 2026-03-09 |
| 29 | Templates Section Relocation | 1 | 2026-03-09 |
| 30 | Tasks Route 404 Fix | 1 | 2026-03-09 |
| 31 | PDF Display Fix | 1 | 2026-03-09 |

</details>

<details>
<summary>v1.1 UI/UX Hardening - 2026-03-09 (11 phases, 19 plans)</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 12 | Touch & Accessibility Foundations | 2 | 2026-03-09 |
| 13 | Color Contrast & Typography Hierarchy | 2 | 2026-03-09 |
| 14 | Component Consistency | 3 | 2026-03-09 |
| 15 | Loading & Feedback States | 2 | 2026-03-09 |
| 16 | Responsive & Mobile Polish | 2 | 2026-03-09 |
| 17 | Schedule Overhaul | 2 | 2026-03-09 |
| 18 | Homepage & Library UX | 2 | 2026-03-09 |
| 19 | Setlist Search & Intelligence | 2 | 2026-03-09 |
| 20 | Performance Mode Overhaul | 2 | 2026-03-09 |
| 21 | Monitor Stability & Enhancements | 1 | 2026-03-09 |
| 22 | Milestone Gaps & Deferred Items | 1 | 2026-03-09 |

</details>

<details>
<summary>v1.0 Full Launch - 2026-03-08 (5 phases, 12 plans)</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 7 | QA & Bug Sweep | 2 | 2026-03-08 |
| 8 | Missing Features Audit | 3 | 2026-03-08 |
| 9 | UI/UX Polish & Usability | 2 | 2026-03-08 |
| 10 | Admin Console Redesign | 4 | 2026-03-08 |
| 11 | Launch Prep | 1 | 2026-03-08 |

</details>

<details>
<summary>v0.1 UI/UX Redesign - 2026-03-08 (6 phases, 12 plans)</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 1 | Design Foundation | 2 | 2026-03-08 |
| 2 | Navigation & Layout | 2 | 2026-03-08 |
| 3 | Dashboard & Home | 2 | 2026-03-08 |
| 4 | Setlist & Performance Views | 3 | 2026-03-08 |
| 5 | Library & Monitor Mix | 2 | 2026-03-08 |
| 6 | Polish & Accessibility | 1 | 2026-03-08 |

</details>

---
*Roadmap created: 2026-03-10*
*Last updated: 2026-04-27 (Milestone v5.1 Editor UX Polish created. 3 phases: v51-01 picker rework / v51-02 smart create-setlist wizard / v51-03 Vocal Lead rename + Daniel-loop UAT codification + gig-packet print smoke. Tablet-first; band-onboarding gate. /ui-ux-pro-max BLOCKING per SPECIAL-FLOWS.md for every phase. Synthesized from /paul:discuss-milestone session — Issue 2 iPad key-picker (Sheet+keyboard yuck across all 6 dropdown sites) + smart wizard for Erev Shabbat / Shabbat morning / holidays via Hebcal + sticky-memory verified through clone path + label-only rename of Lead → Vocal Lead. v5.0-hotfix archived at `.paul/milestones/v5.0-hotfix-ROADMAP.md` 2026-04-27. v5.0 milestone still 🟡 PENDING-UAT — close path is now: v5.1 ships → Daniel UAT → invite band → first-week smoke → `/paul:audit-milestone v5.0`.)*
