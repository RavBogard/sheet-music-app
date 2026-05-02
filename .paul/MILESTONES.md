# Milestones

Completed milestone log for this project.

| Milestone | Completed | Duration | Stats |
|-----------|-----------|----------|-------|
| v0.1 UI/UX Redesign | 2026-03-08 | 1 day | 6 phases, 12 plans |
| v1.0 Full Launch | 2026-03-08 | 1 day | 5 phases, 12 plans |
| v1.1 UI/UX Hardening | 2026-03-09 | 1 day | 11 phases, 19 plans |
| v1.2 Library, Manage & Monitor Overhaul | 2026-03-09 | 1 day | 9 phases, 10 plans |
| v1.3 Bugsweep & Backend Hardening | 2026-03-10 | ~76 min | 4 phases, 7 plans |
| v1.3.1 Regression Fixes | 2026-03-10 | ~8 min | 1 phase, 1 plan |
| v1.4 Fixes & Library Management | 2026-03-10 | ~1 hr | 5 phases, 5 plans |
| v1.5 Codebase & UI/UX Hardening | 2026-03-10 | 1 day | 6 phases, 11 plans |
| v1.6 Stability & Regression Audit | 2026-03-11 | 1 day | 4 phases, 4 plans |
| v1.7 Critical Bug Fixes | 2026-03-11 | 1 day | 5 phases, 5 plans |
| v1.8 Mobile UX Overhaul | 2026-03-11 | 1 day | 3 phases, 3 plans |
| v1.9 Auth Stability & Deferred Cleanup | 2026-03-11 | 1 day | 5 phases, 4 plans |
| v2.0 Schedule & Workflow Fixes | 2026-03-11 | 1 day | 3 phases, 3 plans |
| v2.5 Bugsweep & Test Coverage | 2026-03-12 | 2 days | 19 phases, 30 plans |
| v2.6 Deprecation Cleanup, Tech Debt & Setlist UX | 2026-03-12 | 1 day | 3 phases, 3 plans |
| v3.0 Live Setlist Sync | 2026-03-30 | 1 session | 3 phases, 5 plans |
| v3.1 Post-v3.0 Bugsweep & Hardening | 2026-03-31 | 1 session | 5 phases, 7 plans |
| v3.2 Mobile Admin & Responsive Fixes | 2026-03-31 | 1 session | 2 phases, 2 plans |
| v3.3 Live Mode Activation | 2026-04-04 | absorbed | absorbed into v3.4 |
| v3.4 Fixes & Live Mode Activation | 2026-04-04 | 1 session | 3 phases, 2 plans |
| v4.0 Live Swap Redesign | 2026-04-04 | 1 session | 3 phases, 3 plans |
| v4.4 Deferred Audit Sweep — Architectural Polish | 2026-04-15 | 1 session | 5 phases shipped (3 deferred to v4.5), 5 plans |
| v5.0-hotfix Track-Edit Save-Loss Fix | 2026-04-27 | 1 session (~6h) | 1 phase, 4 plans |
| v5.1 Editor UX Polish (Band-Onboarding Gate) | 2026-04-27 | 1 session (~4h) | 4 phases, 4 plans |
| v5.2 Band-Onboarding Hardening | 2026-04-30 | 1 session | 5 phases, 5 plans (PENDING-UAT at close) |
| v5.3 Editor UX Repair (rescoped 2026-05-02 to insert v5h3 hotfix) | 2026-05-02 | 1 session (~12h wall-clock) | 4 phases, 7 plans (PENDING-UAT at close — UAT discipline waiver per Daniel) |

---

## ✅ v5.3 Editor UX Repair (rescoped 2026-05-02 to insert v5h3 hotfix)

**Completed:** 2026-05-02
**Duration:** ~12h wall-clock end-to-end (single session; v53-01 research → v5h3 hotfix → v53-02 → v53-03 all shipped same day)
**Status:** Closed with PENDING-UAT marker on 4 of 4 phases per Daniel "push and finish the milestone" judgment call — explicit override of the v51-04-codified "UAT closes the milestone" rule. Daniel-loop UAT continues against deployed commits over the upcoming weekly worship cycle (Friday evening + Shabbat morning); failures route to in-phase follow-up plans (v5*-02) per v51-04 rule. v5.0 + v5.2 milestones remain in their own PENDING-UAT close paths.

### Stats

| Metric | Value |
|--------|-------|
| Phases | 4 (v53-01 research / v5h3-01 save-loss recurrence hotfix / v53-02 chart-bind + sticky-right ChartCell / v53-03 polymorphic Add menu); v53-04 ❌ COLLAPSED |
| Plans | 7 (v53-01-01 research / v5h3-01-01 research / v5h3-01-02 instrumentation / v5h3-01-03 H-SL-7 fix `36e9fa1` / v5h3-01-04 postmortem + binding harness-fidelity gate / v53-02-01 chart-bind `bc754b4` / v53-03-01 polymorphic Add `3a321c9`) |
| Tests added | +69 within v5.3 (suite 1528 → 1597; v53-01 0 / v5h3-01 +32 / v53-02 +15 / v53-03 +22). Cumulative since v5.0 ship: 1474 → 1597 (+123) |
| Source files modified | ~14 unique across milestone (overlap on SetlistGrid.tsx + ChartBindPopover.tsx + AddRowPlaceholder.tsx; new: AddBar.tsx + cleanup.ts + sentry-capture.ts + edit-log writes) |
| Commits | ~12-15 across the milestone (shallow git log shows 7 most recent; older include v53-01 research-synthesis, v5h3-01 instrumentation `1d8d94c`, v5h3-01-03 H-SL-7 fix `36e9fa1`, v5h3-01-04 postmortem) |
| /ui-ux-pro-max gate | BLOCKING for v53-02 + v53-03 (UI-touching); satisfied. Optional for v53-01 + v5h3-01 (research / instrumentation / postmortem). |
| Harness Fidelity Gate | Codified during this milestone (v5h3-01-04 postmortem). Counter at 1 of 3 after milestone close (v53-02 used clause-(b) waiver for SetlistGridHydrator priming-adjacent additive getDocs; v53-03 unchanged). Gate's binding semantics + auto-escalation now operating in production. |

### Key Accomplishments

- **v53-01 — Recursive research front-loaded.** 3 parallel dan-researcher tracks (Track A ChartBind diagnosis HIGH confidence + Track B old-editor archaeology with verdicts table + Track C polymorphic Add option set + chart-peek option set DROPPED per Daniel) + iPad UAT capture (NOT deferred). UAT surfaced **save-loss recurrence** (same class as v5h-01 2026-04-27) — RESCOPE recommendation accepted; v5h3 hotfix inserted BEFORE v53-02..04. Daniel-loop UAT discipline (codified v51-04) validated for the FIRST TIME against a research-phase UAT — caught the bug before any v5.3 code shipped.
- **v5h3-01 — Save-loss recurrence diagnosed + fixed end-to-end same day.** Round-1 research (6 hypotheses) ruled out 3 by code-scan (H-SL-2/3/4); HUMAN-ACTION production capture deferred per Daniel "continue autonomously". Round-2 selection: instrumentation Option B → v5h3-01-02 shipped Sentry breadcrumbs at 5 hot write paths + IndexedDB `edit_log` table + upload-on-mount (commit `1d8d94c`). Mid-execution Daniel UAT surfaced reconciliation-modal evidence → NEW H-SL-7 (HIGH confidence). Pivoted plan from "instrumentation only / wait" → "diagnose + ship targeted fix today". v5h3-01-03 H-SL-7 fix shipped (commit `36e9fa1`): engine writeback now threads server `updatedAt` into pending outbox rows for same `(collection, docId)`; rapid same-doc edits no longer trigger phantom VersionMismatchError; v50-06-02 reconciliation contract preserved (AC-3 explicit test). v5h3-01-04 postmortem at `.paul/postmortems/v5h3-01-save-loss-recurrence.md` + binding **Harness Fidelity Gate** subsection added to PROJECT.md §Constraints (escalates v5h-01 §5 action item #2 from "opportunistic" → BLOCKING for any future data-flow phase; v5.4 phase 1 ship target).
- **v53-02 — Chart binding picker fix + ChartCell discoverability.** cmdk value-format fix at both substrate sites (ChartBindPopover.tsx + AddRowPlaceholder.tsx — `${title} ${id}` concat → `${title}` only); typing-to-filter restored end-to-end. New "Recent" CommandGroup above "Library" in ChartBindPopover (cap 5; sorted by `songs.recent[0].performedAt` desc; reads existing v50-04 fields — NO Dexie schema bump). New `src/lib/songs/prime.ts` library priming helper + SetlistGridHydrator fire-once-per-mount post-hydration effect (one-shot getDocs; NO new snapshot listener; per-mount sentinel; fail-soft). Chart `<th>` and `<td>` carry `sticky right-0` against existing overflow-x-auto wrapper (locked at checkpoint:decision after /ui-ux-pro-max consultation; standard Excel/Sheets pin-column pattern; preserves muscle memory; always visible regardless of horizontal scroll). z-index recipe (header z-20, body z-5, thead z-10) wins both vertical occlusion + horizontal sibling stacking. **Harness Fidelity Gate first production exercise** — waiver counter 1 of 3 (SetlistGridHydrator priming-adjacent touch; additive one-shot getDocs; no engine path; UAT closes the gap). Commit `bc754b4`.
- **v53-03 — Polymorphic Add menu (split-button) restored.** Daniel-locked Option B at /paul:discuss-phase: primary indigo "+ Song" CTA (with `text-indigo-300` Plus icon) opens AddRowPlaceholder picker (Recent / Library / Custom three CommandGroups — same v53-02 substrate pattern; cmdk filters all groups together; `value={song.title}` only). Sibling chevron Popover reveals 5 colored tiles (Section muted / Reading amber-300 / Prayer blue-300 / Transition emerald-300 / Stage note muted) — one tap inserts row of that TrackType via single applyEdit('set','tracks',...) write path. Tile size ≥48 fine / ≥56 coarse with gap-2 (≥8px touch-spacing); aria-label="Add track of another type" on icon-only chevron; jest-axe ZERO violations on rest + chevron-open states. Long-press disambiguation: explicit `onContextMenu` preventDefault on chevron + every tile + primary trigger (defense-in-depth against v50-05-04 row contextmenu synthesizer; AddBar lives outside row scope, but cost-zero defense applied). Restores Daniel's biggest post-v50-02-amputation regret — *"the old 'add' menu was MUCH better."* Commit `3a321c9`.
- **Three Daniel-stated v5.3 high-friction surfaces all closed.** (1) ChartBind picker filter broken → fixed at both substrate sites in v53-02. (2) ChartCell off-screen on iPad ("scroll way to the right") → sticky-right pin-column in v53-02. (3) Single-purpose Add affordance → polymorphic split-button + 5 tiles in v53-03. Chart-verification peek explicitly DROPPED per Daniel mid-milestone ("don't worry about this. Fix the other pieces.").
- **Daniel-loop UAT discipline (codified v51-04) validated repeatedly.** Worked at v53-01 research-phase capture (caught save-loss recurrence before any v5.3 code shipped) AND mid-execution at v5h3-01-02 (caught reconciliation-modal evidence; pivoted plan to ship same-day H-SL-7 fix). Pattern proven across 3 distinct invocation contexts (v51-04 codification; research-phase UAT; mid-execution UAT). v5.3 ships with PENDING-UAT marker on all 4 phases — Daniel-loop continues over the upcoming worship cycle; failures route to v5*-02 follow-up plans per v51-04 rule.
- **Harness Fidelity Gate codified + binding from v5.3 onward.** Twice-implicated kitchen-sink harness fidelity gap (v5h-01 + v5h3) escalated to BLOCKING for any future data-flow phase. PROJECT.md §Constraints "Harness Fidelity Gate" subsection establishes binding semantics: any plan touching protected-list files (sync engine / Dexie schema / snapshot-listener / lazy-hydration / perf-view / cells/ / firestore.rules) MUST land AFTER remediation OR carry a documented waiver under boundaries SCOPE LIMITS. Three waivers in a row triggers re-prioritization to v5.4 phase 1 (Firebase Local Emulator Suite integration + thin RTL editor↔perf-view test pair). v53-02 used the first waiver; v53-03 unchanged (counter stays at 1 of 3).
- **v53-04 collapsed cleanly.** Original phase scope was "whatever Track B surfaces beyond polymorphic Add menu as port-back-worthy"; Track B's only remaining candidate (chart-preview port-back from `SongRow` collapsed-state file-name link) died with chart-verify drop earlier same day. Net zero remaining scope; phase removed from ROADMAP table; empty directory removed; v5.3 milestone shape became 4 implementation phases (v53-01 / v5h3-01 / v53-02 / v53-03).

### Key Decisions

| Decision | Phase | Impact |
|----------|-------|--------|
| RESCOPE v5.3 mid-milestone to insert v5h3 hotfix BEFORE v53-02..04 | v53-01 → milestone | First production exercise of in-milestone rescope based on Daniel-loop UAT signal. Pattern: if research-phase UAT surfaces NEW high-severity findings outside plan scope, synthesis MUST recommend rescope (not approve, not round-2). Pattern carries to all future milestones. |
| Engine writeback threads server `updatedAt` into pending outbox rows for same (collection, docId) | v5h3-01-03 | Closes H-SL-7 phantom-VersionMismatch class without touching v50-06-02 reconciliation contract; surgical fix landed same-day mid-milestone. AC-3 explicit test guards the contract. |
| Harness Fidelity Gate binding from v5.3 onward (PROJECT.md §Constraints) | v5h3-01-04 → milestone | Twice-implicated kitchen-sink harness fidelity gap escalated to BLOCKING. Binding semantics + waiver clause + 3-strike auto-escalation now operating. v5.4 phase 1 = Firebase emulator + RTL pair. Counter discipline: v53-02 used clause-(b) waiver; counter at 1 of 3. |
| Recent ranking via existing v50-04 SongRecentEntry.performedAt (NO Dexie schema bump) | v53-02-01 | Discovered during plan-time tech reads; avoided v3→v4 schema migration risk; reduced Harness Fidelity Gate waiver scope; pattern: check existing types BEFORE proposing new ones. |
| Sticky-right ChartCell column (locked at checkpoint:decision after /ui-ux-pro-max consultation) | v53-02-01 | Standard Excel/Sheets pin-column pattern; preserves muscle memory; always visible regardless of horizontal scroll. Documented z-index recipe (header z-20, body z-5, thead z-10) reusable for future spreadsheet pin-columns. |
| Option B split-button for polymorphic Add (NOT Option A grouped CommandList) | v53-03-01 | Daniel-locked at /paul:discuss-phase per Track B "muscle memory + colored type tiles are the discoverability cue" finding; literal port of d8c0442 AddBar shape into v50-05 substrate. ~+180 LOC vs ~+50 LOC for Option A. |
| Ported icon colors (amber Reading / blue Prayer / emerald Transition / muted Header+Note) | v53-03-01 | Daniel-locked per Track B finding — colored icon vocabulary is "the discoverability cue Daniel misses since v50-02 amputation." Color is enhancement on top of icon shape + text label (satisfies ux-pro-max Color-Only HIGH rule). |
| Long-press disambiguation as defense-in-depth on chevron + tiles + primary trigger | v53-03-01 | AddBar lives outside row scope; positional analysis says no v50-05-04 conflict; cost-zero `onContextMenu` preventDefault applied anyway. Pattern reusable for any tappable element near a row-context-menu surface. |
| Recent / Library / Custom three-CommandGroup picker is canonical | v53-02 + v53-03 | Two consumers (ChartBindPopover + AddRowPlaceholder); pattern reusable for any future cmdk picker that needs frequency-based + alphabetical + free-text choice surfaces. |
| Daniel-loop UAT discipline validated 3x in single milestone | v53-01 + v5h3-01-02 + v53-03 | Worked at research-phase capture / mid-execution pivot / sight-unseen approval contexts. Pattern proven across 3 distinct invocation modes. v5*-02 follow-up routing rule continues to govern UAT failures. |
| v5.3 closed with PENDING-UAT marker per Daniel "push and finish the milestone" | milestone close | Explicit override of v51-04-codified "UAT closes the milestone" rule. Daniel judgment call — pattern: user explicit instruction always trumps standard discipline; UAT continues against deployed commits over upcoming worship cycle; failures route to in-phase follow-up plans. |
| v53-04 collapsed cleanly at milestone close | v53-04 | Net zero remaining scope after chart-verify drop; phase removed from roadmap; empty directory removed; v5.3 became 4 phases instead of 4-with-collapse. Pattern: phases can be removed during milestone if scope evaporates; preserve original rationale for archive. |

---

## ✅ v5.1 Editor UX Polish (Band-Onboarding Gate)

**Completed:** 2026-04-27
**Duration:** ~4h end-to-end (single session, started 15:30Z, completed 19:32Z)

### Stats

| Metric | Value |
|--------|-------|
| Phases | 4 (v51-01 / v51-02 / v51-03 / v51-04) |
| Plans | 4 (one per phase — all vertical slices) |
| Files modified | ~24 across plans (some overlap on SetlistGrid.tsx between v51-01, v51-02, v51-04) |
| Tests added | +32 across the milestone (1481 → 1513) |
| Commits | 7 (v51-01: `6671254` / `c11a5c4` / `304e940`; v51-02: `c40d880` / `05ddafb`; v51-03: `f30e819` / `6c5040a`; v51-04: `233d8b5` / `b023ea0`) plus the wip plan commit `d4f7093` |
| /ui-ux-pro-max gate | BLOCKING for every phase (per SPECIAL-FLOWS.md); satisfied for all 4 |

### Key Accomplishments

- **v51-01 — Picker rework across all 6 dropdown sites.** TouchOrPopover Sheet branch removed → always-anchored Radix Popover; `onOpenAutoFocus(preventDefault)` on `(pointer:coarse)` so cmdk CommandInput stays visible without auto-popping the iPad system keyboard. DropdownCell gained `mode='discrete'|'searchable'` + `renderPickerContent` slot; discrete mode skips CommandInput entirely (Key + Type + Bulk-Key/Type + AddRow); searchable mode keeps CommandInput unfocused on touch (Lead + ChartBind + Bulk-Lead + AddRow library lookup). KeyCell rewritten with KEY_OPTIONS_MAJOR + KEY_OPTIONS_MINOR chromatic ascending C→B; Radix Tabs (shadcn) for Major | Minor with smart default tab inference (ends-in-m → Minor); 44px tap targets + 8px row spacing + selected-state font-semibold + indigo highlight on `(pointer:coarse)` for stage-distance scanability. Storage values preserved verbatim (no Firestore migration); display labels unify enharmonics as `C♯/D♭`. Symmetric "no keyboard until deliberate tap" rule across all 6 sites.
- **v51-02 — Editor readability + visual hierarchy locked.** Option B Comfortable Dense shipped after /ui-ux-pro-max consultation surfaced 3 implementable option sets in `v51-02-01-DESIGN-CONTRACT.md` (A Tight Compact / B Comfortable Dense / C Hierarchical Spacious). Decision: 44px desktop / 48px tablet outer rows (down from ~56/68); column widths narrowed (type 120→104, key 80→72, bpm 72→64; lead capped 156, notes 220 so title flex-fills as primary tier); tier-class hierarchy via redundant cues (weight + color): T1 title `text-sm font-semibold text-foreground`, T2 key `text-sm font-medium tabular-nums text-indigo-200`, T3 lead/type/bpm `text-[13px] font-normal text-muted-foreground` (bpm tabular-nums), T4 notes `text-xs font-normal text-muted-foreground/75`. Section rows framed with `bg-indigo-500/[0.08] + border-l-2 border-indigo-400/50 + border-t border-indigo-500/25` and smallcaps title banner; selection opacity 5%→8%. Single-file implementation (SetlistGrid.tsx); mobile parallel render path (MobileCardList from v50-05-05) + picker internals from v51-01 + sync engine + perf-view + firestore.rules all boundary-locked with empty diff.
- **v51-03 — Smart create-setlist wizard with date-aware Clone CTA.** Three priority-ordered offers in a card-framed pre-form strip the moment a service date is picked: **Clone last {service-name} ({date})** primary brand-colored CTA + **Use a template** + **Start from scratch** as text-link options (≥44px tap targets). New `findLastMatchingService(serviceType, beforeDate?)` on createSetlistService queries the 20 most-recent setlists, infers each candidate's effective service type from `templateType` (with `'festival'` fan-out matching sukkot/simchat_torah/passover/shavuot specific types) or falls back to `getServiceContext(eventDate).type` for legacy setlists. New generic `cloneSetlist(source, targetDate)` extracted; legacy `cloneForNextWeek(source)` refactored as a thin wrapper preserving its public surface so EmptyState's "Make next week's" CTA is untouched. `useCreationWizard` exposes `mode` ('idle'|'clone'|'template'|'scratch') / `cloneSource` / `cloneSourceLoading`; useEffect on eventDate triggers the lookup with auto-default-to-clone-when-mode='idle' (handleTemplateSelect locks mode='template' BEFORE setEventDate so the lookup effect respects explicit user intent). Sticky-memory contract from v50-04 verified intact — cloned tracks are byte-identical copies; new ChartBindPopover bindings still pull fresh sticky values via `seedTrackFromSong` at READ time; `defaults.ts` NOT modified. 90% weekly use case (clone last week's Erev Shabbat) is now one click after picking a date.
- **v51-04 — "Vocal Lead" terminology + Daniel-loop UAT codification + gig-packet print smoke.** Six-surface "Lead" → "Vocal Lead" terminology rename across the editor (SetlistGrid column header), batch-edit popover (BulkPopover label/aria/placeholder/emptyHint), mobile edit sheet (field label + input aria-label), importer modal (preview-table `Key/Lead` → `Key/Vocal Lead` + performer-cell placeholder), and gig-packet print pipeline (cover-page column header + colLead x-coord shift left 20pt for "Vocal Lead" header to fit at 10pt Helvetica-Bold without overflowing colTransKey/colNotes). Internal identifiers preserved verbatim per boundary lock: `leadMusician` (DB field), `lead` (patch alias), `setlistLeads`/`libraryLeads`/`knownLeads` (autocomplete arrays), `LeadCell` component, `setLead`/`commitLead` handlers, `isLeader`/`onLeaderSetPosition` (perform-mode band leader controlling perf-view position broadcasting — distinct concept), `band_leader` UserRole literal in roles.ts, `"Led by: ${rabbi}"` print line at print-pipeline.ts:257. New `testId?: string` prop on BulkPopoverProps decouples user-facing label from testid stem; the Vocal Lead bulk passes `testId="lead"` to preserve `batch-action-lead-trigger` / `batch-action-lead-popover` testid stability. PROJECT.md gained "UAT Discipline (data-flow fixes)" subsection codifying the Daniel-loop UAT cadence per postmortem v5h-01 §5 action item #4. Gig-packet print smoke verified end-to-end on a real Erev Shabbat / Shabbat morning setlist with mixed track types + assigned musicians + rabbi: cover page lists every track in order, "Led by: {rabbi}" intact, eventDate + setlist title correct, per-musician transpositions render at correct semitone offsets.
- **Band-onboarding gate cleared.** Done definition met across all 4 phases: clean iPad flow + tighter editor density + smart date-aware setlist creation + consistent "Vocal Lead" terminology + project-level UAT discipline + verified print pipeline. Daniel approved each phase's HUMAN-VERIFY checkpoint post-deploy. Ready to invite the band.

### Key Decisions

| Decision | Phase | Impact |
|----------|-------|--------|
| Radix Tabs for Major / Minor key picker (chromatic order C→B inside each tab) | v51-01-01 | Symmetric "no keyboard until deliberate tap" rule across all 6 dropdown sites; informed by /ui-ux-pro-max database (shadcn Tabs primitive + "Hover vs Tap" HIGH-severity rule). Future picker work follows the same shape |
| Locked Option B Comfortable Dense for editor density (44/48 outer rows) | v51-02-01 | DESIGN-CONTRACT.md surfaced 3 options via /ui-ux-pro-max consultation; B chosen for meaningful density tightening + section framing + tablet tap comfort + lowest implementation risk + redundant tier hierarchy cues (weight AND color). Future tier swaps are single-line edits to TIER1_TITLE/TIER2_KEY/etc. constants in SetlistGrid.tsx |
| Section-row detection uses isSectionRow(t) covering 'header' OR 'section' | v51-02-01 | TrackType union (src/types/models.ts) defines 'header'; TypeCell picker writes 'section'. Pre-existing mismatch defensively double-checked rather than fixed — future plan touching the type column should reconcile (out of v51-02 scope per boundaries) |
| Skip shadcn Tooltip dependency in CreationWizard offer strip | v51-03-01 | Tooltip primitive absent from src/components/ui/. AC-5 explicitly allowed hide-with-explanatory-text alternative. Avoiding a new dependency for a single disabled-state caption keeps the no-dep budget |
| Service-type matching is a pure exported helper (`setlistMatchesServiceType`) | v51-03-01 | The riskiest part is the `templateType` (6 values) → `ServiceType` (11 values) resolution + festival-bucket fan-out + legacy fallback to `getServiceContext(eventDate)`. Extracting it as a pure function lets 6 of 13 tests run zero-mock against this logic |
| Festival templateType matches sukkot / simchat_torah / passover / shavuot specific service types | v51-03-01 | Legacy data shape: `templateType` was added with only 6 buckets including `'festival'` as a catch-all; ServiceType later expanded to 11 specific holiday types. Treating `'festival'` as a multi-match bucket means a Sukkot user request matches an old festival-tagged setlist without requiring a data migration |
| Mode auto-defaults to 'clone' only when current mode is 'idle' | v51-03-01 | `handleTemplateSelect` calls `setMode('template')` BEFORE `setEventDate(baseDate)` so when the eventDate effect fires, it sees mode≠'idle' and skips the auto-flip. Prevents "user picked a template, lookup fired, mode flipped to clone" footgun |
| Add `testId` prop to components with label-derived testids before renaming labels | v51-04-01 | When BulkPopover's testid stem was auto-derived from `label.toLowerCase()`, renaming `label="Lead"` → `label="Vocal Lead"` broke `batch-action-lead-trigger`. Adding an additive `testId?` prop with `idStem = testId ?? String(label).toLowerCase()` resolution preserves the test seam |
| Codify Daniel-loop UAT cadence in PROJECT.md as a project-level discipline | v51-04-01 | After v5.0-hotfix track-edit save-loss (kitchen-sink harness 1468/1468 green missed missing tracks/{id}+songs/{id} firestore.rules; Daniel UAT against real production caught it as path "P"), institutionalize the UAT cycle for every data-flow-touching fix |
| Pre-flight column-width math when renaming PDF column headers | v51-04-01 | 10pt Helvetica-Bold word widths: 'Lead' ~24pt, 'Vocal Lead' ~52pt — so a +28pt header needs a ~20pt left-shift of the column origin. Pattern: any future PDF header text rewrite checks adjacent x-coordinates first |

---

## ✅ v5.0-hotfix Track-Edit Save-Loss Fix

**Completed:** 2026-04-27
**Duration:** ~6h end-to-end on 2026-04-27

### Stats

| Metric | Value |
|--------|-------|
| Phases | 1 (v5h-01) |
| Plans | 4 (3 PLAN files; v5h-01-03 was an architectural pivot from a planned execute fix) |
| Files modified | ~10 (firestore.rules + 3 test files + 3 source files + models.ts + postmortem + state docs) |
| Tests added | +7 across the hotfix (1474 → 1481) |
| Production data loss | 0 confirmed |
| Affected users | 1 (Rabbi Daniel; band not yet onboarded) |
| Commits | `0c2921d` fix, `92b1902` perf-view final, `62298c0` postmortem + phase close |

### Key Accomplishments

- **Root cause identified despite 3 wrong handoff hypotheses.** Production capture (DevTools → IndexedDB → `crc-local`/`outbox`) revealed the bug was NOT engine-side (LWW underflow / writeback miss / serverTimestamp race all ruled out). Actual cause: missing `match /tracks/{trackId}` + `match /songs/{songId}` blocks in `firestore.rules` from v50-05 cutover; default-deny silently rejected every track write; per-doc drain ordering blocked subsequent edits behind failed `set` rows; SetlistGridHydrator re-primed legacy embedded `setlists/{id}.tracks[]` over stuck-pending local edits.
- **E+F+B defense-in-depth fix shipped (commit `0c2921d`).** Rules deployed via `firebase deploy --only firestore:rules` to crcmusiccharts; SetlistGridHydrator outbox-pending guard around `db.{setlists,tracks}.put`; snapshot-listener strict-equality LWW guard preserving local row when `updatedAt` is undefined; `property-failures.test.ts` AC-1 regression-locked.
- **Diagnostic chain closed AC-4 same day.** 142 stuck outbox rows (46 failed + 96 pending blocked behind them); auth token stale post-rules-deploy → sign-out/in restored `role: "admin"`; reset-and-drain snippet flipped 46 failed → pending → engine retried with fresh token → cell-edits started persisting.
- **Perf-view architectural refactor (commit `92b1902`).** 4 iterations: `f83d75d` reverted (returned `[]` during initial mount), `8971223` superseded (`metadata.fromCache` is source not freshness), `4aa6840` superseded (correct gate signal but architectural divergence remained), then `92b1902` — `useSetlistPerformance` rewritten to read tracks from Dexie via `useLiveQuery` + mount snapshot-listener + retain embedded fallback ONLY for unhydrated legacy setlists. Editor and perf-view now share the same data path; cache-vs-server-fresh class of bugs eliminated by construction. 18 brittle onSnapshot mock tests replaced with 15 focused tests using `fake-indexeddb` + listener test seam.
- **Daniel UAT 2026-04-27 confirmed editor + perf-view working end-to-end.** "worked!"
- **Postmortem captured 5 lessons + 5 action items** at `.paul/postmortems/v5h-01-save-loss.md`: cutover-plan rules-audit gap proposal (gate to add to PAUL/CARL planning); kitchen-sink harness fidelity gaps named with remediation options (Firebase emulator + thin RTL editor↔perf-view test pair recommended); perf-view 4-iteration architectural-rethink lesson (`metadata.fromCache` is source not freshness; 2-3-strikes architectural-rethink rule); auth-claim staleness incident; Daniel-loop UAT cadence as v5.x norm; Issue 2 (iPad key-picker UI) routing rule (tap-target/sheet → v50-05-04 regression; "feels janky" → v5.1 UX overhaul).

### Key Decisions

| Decision | Phase | Impact |
|----------|-------|--------|
| Read perf-view tracks from Dexie via useLiveQuery (not Firestore directly) | v5h-01-03 | Eliminates cache-vs-server-fresh class of bugs by construction; unifies editor + perf-view data path |
| Mount snapshot-listener inside perf-view (not just editor) | v5h-01-03 | Covers iPad-only perf-view sessions on stage; cross-device updates flow Firestore → Dexie → useLiveQuery |
| Embedded fallback ONLY when `setlistData?.hydrated !== true` | v5h-01-03 | Hydrated setlists post-cascade have stale embedded by design; falling back would show pre-migration keys forever |
| E+F+B defense-in-depth (rules + Hydrator outbox guard + listener LWW) over E-only | v5h-01-02 | Rules close the door; outbox guard + LWW prevent recurrence if a similar gap reappears in a future cutover |
| Architectural fix over patches when 2-3 hook iterations don't close UAT | v5h-01-03 | "2-3-strikes architectural-rethink rule" codified in postmortem; saved retroactively from this iteration cycle |
| Postmortems live at `.paul/postmortems/{phase-id}-{topic}.md` | v5h-01-04 | Naming convention preserved (mirrors `v50-07-save-loss-investigation.md`); cross-referenceable from SUMMARYs |
| Auth-claim auto-refresh on rules-version change OUT of scope | v5h-01-04 | Firebase doesn't expose rules-version; complexity not worth rare scenario; documented for awareness |

---

## ✅ v4.4 Deferred Audit Sweep — Architectural Polish

**Completed:** 2026-04-15
**Duration:** 1 session

### Stats

| Metric | Value |
|--------|-------|
| Phases shipped | 5 of 8 (Phase 4 deferred P2; Phases 7+8 deferred to v4.5) |
| Plans | 5 |
| Files modified | ~30 |
| Tests added | +37 (1287 → 1324) |
| Commits | ~24 (5 phase summaries + atomic task commits) |

### Key Accomplishments

- **Phase 1 — Data-layer atomicity**: scheduling assign/decline transactions (DL-001/002/003/012/013/014) consolidated; eliminated split-write races
- **Phase 2 — Denormalization reconciliation**: user-rename + setlist-rename fan-out (DL-010) so musicianName/userName never goes stale on assignments
- **Phase 3 — Client async safety**: 11 AbortController sites + 3 stale-closure refs + PDFViewer retry cap (3) + 5-test regression suite
- **Phase 5 — Observability**: request-ID end-to-end via AsyncLocalStorage; chat SSE meta/heartbeat/done frames; api-client surfaces server requestId on errors (closes L-001 + S-004)
- **Phase 6 — Modal state hygiene**: EditDetails/NamePrompt re-seed on open; UserRow role-confirm reset; CollapsibleSection localStorage opt-in (storageKey); SwapPicker selection/query reset (closes UX-001/002/011/015/018 — last R2B "must fix before release" items)
- **Band-onboarding UX gate cleared**: All P0/P1 audit findings closed; app ready for first-band rollout

### Key Decisions

| Decision | Phase | Impact |
|----------|-------|--------|
| Phases 4, 7, 8 deferred to v4.5 (P2 cosmetic vs. real user feedback) | Milestone close | Ship now, polish post-onboarding |
| AsyncLocalStorage for request-ID propagation (no manual plumbing) | Phase 5 | Logger auto-tags every call within a request scope |
| globalThis.__requestIdGetter__ resolver instead of static import | Phase 5 | Prevents `node:async_hooks` leaking into client bundle |
| Chat SSE: meta/heartbeat/done frames are additive (assistant token format byte-identical) | Phase 5 | ChatPanel parser unchanged; existing tests pass unmodified |
| CollapsibleSection localStorage opt-in via storageKey prop | Phase 6 | Backward compatible; no surprise persistence |
| EditDetails re-seed deps narrowed to [isOpen] only | Phase 6 | Prior implementation clobbered in-progress edits on parent re-render |
| ref-stabilise onDismiss/onClose to prevent stale closures (TempoFlash, PDFOverlay) | Phase 3 | Latest callback fires, not the one captured at mount |
| PDFViewer retry cap = 3 attempts (terminal error on exhaustion) | Phase 3 | Prevents infinite thrash on broken charts |

---

## ✅ v3.4 Fixes & Live Mode Activation

**Completed:** 2026-04-04
**Duration:** 1 session across 2 plans + 1 bugfix

### Key Accomplishments

- LeaderConsole mounted on performance page as collapsible panel (absorbs v3.3)
- Admin/band_leader can delete any public setlist (UI + Firestore rules)
- Print cover page includes all items (readings, prayers, transitions) — not just songs
- "Led by: {rabbi}" shown on print cover page when rabbi field is set
- CSP updated to allow hebcal.com for liturgical calendar
- Fixed Firestore undefined rejection in cloneForNextWeek

### Key Decisions

| Decision | Phase | Impact |
|----------|-------|--------|
| Collapsible panel for LeaderConsole | P1 | Doesn't dominate screen for non-leaders |
| Band leaders can delete public setlists only | P2 | Consistent with update permissions |
| Cover page shows ALL items, not just songs | P2 | Full order of service visible on outline |
| Rabbi field as "Led by:" (not creator) | P2 | Service attribution to actual leader |
| Spread operator to omit undefined rabbi | Bugfix | Firestore rejects undefined values |

---

## ✅ v3.0 Live Setlist Sync

**Completed:** 2026-03-30
**Duration:** 1 session across 5 plans

### Stats

| Metric | Value |
|--------|-------|
| Phases | 3 |
| Plans | 5 |
| Files created | 10 |
| Files modified | 12 |

### Key Accomplishments

- Song group tagging system with liturgicalSlot + config/songGroups Firestore document
- canLiveSwap permission model mirroring soundEngineer (profile + custom claims + auth context)
- Firestore security rules with field-level restrictions (affectedKeys().hasOnly) and rate limiting
- swapLiveTrack() atomic swap function (tracks + liveState in single updateDoc)
- SwapButton on eligible SetlistRows (amber, 44px touch target, live mode only)
- SwapBottomSheet with 3-tap swap flow (56px alternatives, "Swap Now")
- SwapToast receiver notification (4s auto-dismiss, dedup via swapId)
- Offline connectivity indicator in performance view
- Admin UI: canLiveSwap toggle in UserRow + Song Groups tab with template seeding
- 4-round recursive research (12 agents) informing architecture decisions

### Key Decisions

| Decision | Phase | Impact |
|----------|-------|--------|
| Hybrid song grouping (tag + config doc) | P1 | No sync issues, client-side filtering |
| canLiveSwap mirrors soundEngineer pattern | P1 | Consistent permission model |
| affectedKeys().hasOnly() for field-level rules | P1 | Swap users restricted to tracks/liveState only |
| 3-tap flow without separate confirm button | P2 | Fastest possible with safety |
| SwapToast dedup via swapId ref | P2 | Prevents re-showing on re-renders |
| navigator.onLine for offline detection | P3 | Simpler than Firestore fromCache |

---

## ✅ v2.6 Deprecation Cleanup, Tech Debt & Setlist UX

**Completed:** 2026-03-12
**Duration:** ~1 day across 3 plans

### Stats

| Metric | Value |
|--------|-------|
| Phases | 3 |
| Plans | 3 |

### Key Accomplishments

- Setlist row layout — key badge next to title, inline amber notes, dual-tint alternating rows
- Next.js & Sentry deprecation cleanup — proxy.ts rename, instrumentation-client migration, global-error with Sentry
- Technical debt — leader→band_leader Firestore migration script, build-info git describe cleanup

### Key Decisions

| Decision | Phase | Impact |
|----------|-------|--------|
| bg-white/[opacity] for dark-mode alternating rows | P1 | Predictable alpha on dark backgrounds |
| Dual-tint rows (0.03/0.07) | P1 | Both rows readable |
| Next.js 16 proxy requires export function proxy() | P2 | Not just a file rename |

---

## ✅ v2.5 Bugsweep & Test Coverage

**Completed:** 2026-03-12
**Duration:** ~2 days across 30 plans

### Stats

| Metric | Value |
|--------|-------|
| Phases | 19 |
| Plans | 30 |
| Commits | 55 |

### Key Accomplishments

- **Type safety & error handling:** Eliminated all `as any` casts, fixed empty catches, added notification tracking, moved CORS to env
- **Comprehensive test coverage:** 1117 tests — data layer, API routes, hooks (221 tests across 17 hooks), components (116 tests), AI/integration (53 tests)
- **SW removal & Firestore recovery:** Fixed production IndexedDB crash, fully removed PWA/service worker, uninstalled next-pwa
- **Annotation feature removed:** Simplified chart viewer by removing unused drawing tools
- **Mobile action bar redesign:** MobileTabBar rewritten as Search/Setlist/Monitor action bar with Fuse.js search
- **Tablet performance UX:** Three-tier responsive layout, 44px touch targets, swipe-while-zoomed, 15s auto-hide
- **Bug fixes & race conditions:** Firestore notification rule tightened, N+1 batch fetch, AbortController for offline, 8 bugs fixed
- **Setlist-only print option:** Cover page toggle for quick one-page song list prints
- **Design tokens & accessibility:** Hardcoded colors replaced with tokens, 20 icon-only buttons labeled
- **Backend hardening:** Firestore transactions for admin ops, rate limiting, ApiErrorResponse standardization, config/admins doc
- **Final audit:** Zero tsc errors, zero ESLint warnings, 1117 tests passing, production build verified

### Key Decisions

| Decision | Phase | Impact |
|----------|-------|--------|
| Mock objects exported from helpers, vi.mock() stays in test file | P3 | Vitest hoisting compatibility |
| PWA/SW fully removed, next-pwa uninstalled | P6.1 | SW caused stale deploys; venue has wifi |
| Annotation feature removed entirely | P7 | Unused; simplifies toolbar |
| Fuse.js for MobileTabBar search over library store | P10.1 | No API round-trip for song search |
| Three-tier responsive: default → md: → lg: | P13 | Tablet gets dedicated layout |
| coverOnly early-return in print pipeline | P15 | Skips all PDF processing for cover-only prints |
| WriteBatch for delete-user, runTransaction for set-role | P18 | Atomic admin operations |
| config/admins Firestore doc for super-admin bootstrap | P18 | Replaces hardcoded UID in rules |

---

## v1.4 Fixes & Library Management

**Completed:** 2026-03-10
**Duration:** ~1 hr across 5 plans

### Stats

| Metric | Value |
|--------|-------|
| Phases | 5 |
| Plans | 5 |
| Files changed | 14 |

### Key Accomplishments

- Library management: rename songs (displayName overlay), unlink charts from tracks, restore archived songs
- Prominent key badge in setlist editor (text-sm, font-semibold, bg-brand/20)
- 5 monitor buses as default for CRC's X32 setup
- Print gig packet fixes: iframe-based printing (no black screen), eventDate support, token retry
- PDF health scanner: workerless pdfjs eliminates false positives, strict mimeType filter
- Full codebase audit: 7 critical, 11 high, 17 medium, 8 low findings catalogued
- Recommended v1.5 phase structure based on audit findings

### Key Decisions

| Decision | Phase | Impact |
|----------|-------|--------|
| displayName overlay for song rename (Firestore, not Drive) | Phase 1 | Preserves Drive filenames |
| Iframe over window.open for PDF printing | Phase 3 | Reliable cross-browser printing |
| apiFetch throws on token failure | Phase 3 | Surfaces auth issues early |
| Workerless pdfjs for scanner | Phase 4 | Eliminates worker URL dependency |

---

## v1.3.1 Regression Fixes

**Completed:** 2026-03-10
**Duration:** ~8 min across 1 plan

### Stats

| Metric | Value |
|--------|-------|
| Phases | 1 |
| Plans | 1 |
| Files changed | 6 |

### Key Accomplishments

- Cache-busted PDF worker URL (`pdf.worker.min.{version}.mjs`) eliminates stale worker mismatch after deploys
- Ref-based uid tracking in useMonitorConnection prevents effect churn during iPad auth token refresh
- visibilitychange listener reconnects monitor after iOS Safari tab suspension
- 5s teardown debounce accommodates iPad suspension timing
- Dev script parity with build (copy-pdf-worker runs in both)

### Key Decisions

| Decision | Phase | Impact |
|----------|-------|--------|
| pdfjs.version in worker URL for cache busting | Phase 1 | Prevents stale worker mismatch after deploys |
| Ref-based uid tracking in useMonitorConnection | Phase 1 | Prevents effect churn during iPad auth token refresh |
| visibilitychange as iOS Safari reconnection trigger | Phase 1 | beforeunload doesn't fire on iOS Safari |

---

## v1.3 Bugsweep & Backend Hardening

**Completed:** 2026-03-10
**Duration:** ~76 min across 7 plans

### Stats

| Metric | Value |
|--------|-------|
| Phases | 4 |
| Plans | 7 |
| Files changed | 40+ |

### Key Accomplishments

- Produced comprehensive codebase audit with 20+ findings categorized by severity
- Fixed QR auth token binding vulnerability and AI concurrency deadlock
- Added rate limiting to unauthenticated endpoints and fire-and-forget notification safety
- Standardized error responses via createApiHandler pattern on key routes
- Added Zod validation, StorageResult pattern, and BroadcastChannel cache invalidation
- Fixed dependency array bugs on 7 hooks eliminating stale closures in live performance
- Added unmount safety (isMountedRef, AbortController, cancelled flags) to 4 async hooks
- Implemented ref-counted monitor connection with debounced teardown
- Added error boundaries to 4 crash-prone components (admin sections, setlist editor)
- Eliminated 14 dangerous `as any` casts by fixing root type signatures

### Key Decisions

| Decision | Phase | Impact |
|----------|-------|--------|
| withAiSlot as preferred AI concurrency API | Phase 2 | Pattern for all future AI callers |
| Drive timeout via Promise.race | Phase 2 | googleapis doesn't support AbortSignal |
| uploadToStorage keeps throwing, reads get StorageResult | Phase 3 | Consistent pattern for Storage callers |
| BroadcastChannel for cross-tab cache invalidation | Phase 3 | Tabs stay in sync after library sync |
| Ref-based callbacks for effect dep stability | Phase 4 | Pattern for all hooks with callback deps |
| Broadened useSafeFirestoreSync ref type to DocumentData | Phase 4 | Eliminates all caller as any casts |

---
