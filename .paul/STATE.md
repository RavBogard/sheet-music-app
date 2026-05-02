# Project State

## Project Reference

See: .paul/PROJECT.md (updated 2026-04-15)

**Core value:** Musicians can instantly access setlists, transpose charts, and control monitor mixes — live on any device, no paper or prep needed.
**Current focus:** v5.3 — Editor UX Repair. 4 phases: v53-01 recursive research (3 parallel tracks: ChartBind diagnosis + old-editor archaeology + polymorphic Add design) / v53-02 chart binding + verification / v53-03 polymorphic Add menu / v53-04 editor affordance pass. UAT closes the milestone (not its own phase, matches v5.2 precedent). Theme: *"The spreadsheet bones stay; the affordances get fixed."* Daniel explicit ask: **systemic fixes, not bandaids** — research-first; phases 2–4 plan after v53-01 synthesis. Spreadsheet bones (v50-05 substrate, sync engine v50-03, sticky memory v50-04, perf-view dual-read v5h-01-03) are out of scope. /ui-ux-pro-max BLOCKING for v53-02..v53-04. Tablet-first.

## Current Position

Milestone: 🚧 v5.3 — Editor UX Repair — created 2026-05-02. 0 of 4 phases complete. Origin: Daniel UAT regret on v50-05 spreadsheet editor — chart binding hard/broken, no chart-verification peek, Add menu single-purpose vs. old editor's polymorphic menu.
Phase: v5h3-01 of 4 (Save-loss recurrence hotfix) — LOOP COMPLETE on v5h3-01-04 (4 of 4 plans)
Plan: v5h3-01-04 LOOP COMPLETE 2026-05-02. SUMMARY at `.paul/phases/v5h3-01-save-loss-recurrence/v5h3-01-04-SUMMARY.md`. Both tasks landed: (1) postmortem at `.paul/postmortems/v5h3-01-save-loss-recurrence.md` (177 lines; 8 H2 sections; 2 v5h-01 cross-links; 4 investigation cross-links; AC-1 PASS); (2) "Harness Fidelity Gate (binding from v5.3)" subsection in PROJECT.md Constraints line 186 (AC-2 PASS). One auto-fix during execution (cross-link count below threshold; added inline Lessons.3 link). Zero scope drift; zero deferrals introduced.
Status: ✅ PHASE v5h3-01 LOOP COMPLETE (4 of 4 plans). Suite 1560/1560; `next build` clean; boundary clean. **TRANSITION REQUIRED** — last plan in phase; transition-phase workflow MUST run next (evolve PROJECT.md / update ROADMAP / phase-close commit / clean handoffs / route to next phase).

Progress:
- v5.3 — Editor UX Repair: [███████░░░] ~75% (v53-01 ✅ + v5h3-01 ✅ 4-of-4 PLANS-APPLIED; v5h3-01 PENDING-UAT pending Daniel weekly worship cycle; v53-02 + v53-03 still ahead behind v5h3-01 UAT clear)
- Phase v53-01: [██████████] 100% ✅ COMPLETE
- Phase v5h3-01: [██████████] 100% LOOP COMPLETE — PENDING-UAT (Daniel weekly worship cycle on `36e9fa1`)

Loop position:
PLAN ──▶ APPLY ──▶ UNIFY
  ✓        ✓        ✓     [v5h3-01-04 LOOP COMPLETE; phase v5h3-01 4-of-4 — TRANSITION REQUIRED]

### Decisions (v5h3-01-02 + v5h3-01-03)

| Date | Decision | Phase | Impact |
|------|----------|-------|--------|
| 2026-05-02 | v5h3-01-02 instrumentation built + deployed (Sentry breadcrumbs at 5 hot write paths + edit_log table + upload-on-mount) | v5h3-01-02 | Future save-loss recurrences auto-captured to Sentry; no manual iPad inspection required |
| 2026-05-02 | Mid-execution Daniel UAT surfaced reconciliation-modal evidence → NEW H-SL-7 (HIGH confidence) | v5h3-01-02 → v5h3-01-03 | Pivoted from "instrumentation only / wait for evidence" to "diagnose + ship targeted fix today" |
| 2026-05-02 | v5h3-01-03 H-SL-7 fix shipped: engine writeback threads server updatedAt into pending outbox rows for same (collection, docId) | v5h3-01-03 | Single-user rapid same-doc edits no longer trigger phantom VersionMismatch; v50-06-02 reconciliation contract preserved (AC-3 explicit test) |
| 2026-05-02 | Daniel-loop UAT discipline (codified v51-04) validated for SECOND time today: caught reconciliation symptom mid-execution + enabled same-day surgical fix | discipline | Pattern: even mid-execution UAT signal worth pivoting plan; reconciliation-modal-in-single-user-context is high-signal evidence pointing at VersionMismatch class |
| 2026-05-02 | v5h-01 §5 harness fidelity gap NOW twice-implicated (v5h-01 + v5h3) | v5h3-01-04 | Final postmortem MUST commit to closure (Firebase emulator + RTL editor↔perf-view test pair); deferring three times is no longer acceptable |

### Decisions (v5h3-01-01)

| Date | Decision | Phase | Impact |
|------|----------|-------|--------|
| 2026-05-02 | HUMAN-ACTION DEFERRED per Daniel "continue autonomously" + already-refreshed iPad | v5h3-01 | Evidence-blocked diagnosis; code-scan only narrows hypothesis space, cannot confirm |
| 2026-05-02 | Code-scan verdicts: H-SL-2/3/4 RULED OUT (definitive); H-SL-1/5/6 STILL OPEN (need evidence) | v5h3-01 | 3 of 6 hypotheses eliminated by code path analysis; remaining 3 require production capture |
| 2026-05-02 | Anti-pattern audit PASSES — all v5h-01 fixes intact (rules + LWW guards + outbox-pending guard + engine writeback atomicity + Sentry instrumentation) | v5h3-01 | Recurrence is NOT a regression of v5h-01 fixes; it's a NEW failure mode the existing defenses don't cover |
| 2026-05-02 | RESCOPE Daniel selection: Round-2 Option B (auto-capture instrumentation) | v5h3-01 | v5h3-01-02 builds Sentry breadcrumbs + IndexedDB recovery log; deploys; waits for next recurrence; evidence-driven fix lands in v5h3-01-03 (or new sibling phase) |
| 2026-05-02 | Harness fidelity gap (v5h-01 §5 action item #2) ESCALATED — recurrence is evidence v5h-01-04 deferral was wrong | v5h3-01 → postmortem | v5h3-01 final postmortem must commit to closing the gap (Firebase emulator + RTL editor↔perf-view test pair) as v5.4 commitment OR include in v5h3-01-02 fix scope |

### Decisions (v53-01-01)

| Date | Decision | Phase | Impact |
|------|----------|-------|--------|
| 2026-05-02 | iPad UAT captured (NOT deferred); save-loss recurrence surfaced as NEW high-severity finding | v53-01 | Triggered rescope recommendation; closes Track A confidence gap; opens save-loss LOW-confidence gap |
| 2026-05-02 | Chart-verification peek DROPPED from v5.3 scope per Daniel ("don't worry about this. Fix the other pieces.") | v53-01 | v53-02 scope shrinks ~half; Track C chart-peek option set shelved for future milestone; v53-04 likely collapses (Track B's only remaining candidate was chart-preview) |
| 2026-05-02 | RESCOPE selected at synthesis decision checkpoint — insert v5h3-hotfix BEFORE v53-02..04 | v53-01 | v5.3 milestone shape changes: was [v53-01 / v53-02 / v53-03 / v53-04] → becomes [v53-01 (done) / v5h3-01..03 (NEW) / v53-02 / v53-03] (v53-04 collapse pending Daniel confirmation in unify or v5h3 plan) |
| 2026-05-02 | NEW finding: ChartCell off-screen on iPad ("scroll way to the right to see the chart button") | v53-01 → v53-02 | v53-02 scope expands by 1 surface (ChartCell discoverability fix); /ui-ux-pro-max consultation needed at PLAN entry for column-reorder vs. row-side affordance |
| 2026-05-02 | NEW finding: AddRow no-suggestions-when-typing shares root cause with ChartBind picker (both use identical useLiveQuery + cmdk value pattern) — ONE root cause, TWO surfaces | v53-01 → v5h3 / v53-02 | Likely diagnosed for free in v5h3-01-01 production state capture (songs-table count check); fix bundle covers both surfaces |

**Previously active (pending UAT close, NOT blocking v5.3 planning):**
- v5.2 Band-Onboarding Hardening — ALL 5 phases shipped 2026-04-30 (v52-01..v52-05). Awaiting Daniel weekly worship cycle UAT.
- v5.0 Bulletproof Editor — pending UAT since 2026-04-27. v5.1 + v5.2 + v5.3 are the prerequisite polish stack. Closes via `/paul:audit-milestone v5.0` post-band-cycle.

### v52-05 close (2026-04-30)
- v52-05-01 LOOP COMPLETE 2026-04-30. Vertical-slice commit `cf30d62` (pushed origin master; Vercel auto-deployed) + Firebase rules deploy (compile + release confirmed via CLI). type=execute. **Track D Option C admin-curated pointer doc** at `config/defaults` (codebase convention — matches `config/featured` / `config/congregation` neighbors; NOT Track D's hypothetical `system/templates`). Doc shape: `{ shabbat_morning?, friday_night?, updatedAt, updatedBy }`. Phase 1 scope: shabbat_morning + friday_night (OQ Q3 lock); future ServiceType expansion is additive. New `match /config/defaults` Firestore rule (read: signed-in; write: admin per OQ Q2 lock). New service helpers: `getDefaultForServiceType` returns null on missing/invalid; `setDefaultForServiceType` uses `setDoc(merge: true)` so each call updates one key only. `findLastMatchingService` consults pointer first; on missing/dangling/repurposed silently falls through to legacy 20-most-recent query (OQ Q5 silent-fallback lock — no Sentry, no toast, alerting on absence is alert fatigue). UI: NEW "Save as Default for {Shabbat Morning | Friday Night}" menu item in BOTH UpcomingSetlistCard + SetlistCard kebabs (Star icon, between "Save as Template" and "Delete"; data-testid="setlist-card-save-as-default"). Gated `isAdmin && type ∈ PHASE_1_DEFAULT_TYPES`. handleSaveAsDefaultClick toast wrapper in use-setlist-dashboard.ts. SetlistDashboard.tsx wires `isAdmin` + handler through both card sites. 9 files modified (7 source + 2 test; 0 new files). 2 auto-fixes beyond plan files_modified: AuditAction union extension in setlist-audit.ts triggered exhaustive-map error → added matching label "Set as default for service" to SetlistHistoryPanel.tsx (essential type-system fix). New "v52-05 default-template pointer" describe with 5 cases in setlist-firebase.test.ts; new "v52-05: handleSaveAsDefaultClick" describe with 3 cases in use-setlist-dashboard.test.ts. Mock @/components/setlist/SetlistCards in hook tests to avoid pulling component graph. Suite 1528 → 1536 (+8 cases; exceeds plan estimate of +7). tsc clean; next build clean. Boundary diff confirms 9 source files (excluding auto-touched package.json + src/build-info.json). Engine FSM, state-machine, init.ts, snapshot-listener, ReconciliationProvider, write.ts, sticky-memory contract (v50-04), v52-02 + v52-03 + v52-04 contracts ALL preserved. /ui-ux-pro-max gate satisfied (carryover from v52-04). Daniel approved with explicit "Approved" at HUMAN-VERIFY checkpoint (milestone-close phase warranted careful surface review — NOT sight-unseen unlike v52-03/v52-04). AC-7 dangling-pointer fallback UAT optional, not exercised (covered by unit test). SUMMARY at `.paul/phases/v52-05-default-template-management/v52-05-01-SUMMARY.md`.

### Decisions (v52-05-01)

| 2026-04-30 | Decision | Phase | Impact |
|------------|----------|-------|--------|
| 2026-04-30 | `config/defaults` path (NOT `system/templates`) | v52-05 | Codebase convention `config/{name}` matches neighbors. No new top-level path. |
| 2026-04-30 | SetlistCards kebab entry point (NOT editor kebab from Track D OQ Q4) | v52-05 | v52-03 explicitly removed editor kebab. SetlistCards kebab is always-visible on iPad post-v52-04. v52-03 design coherence preserved. |
| 2026-04-30 | Service helpers do NOT call engine.pump() | v52-05 | config/defaults is a regular Firestore doc, not on outbox path. Engine boundary preserved (v50-06-03 pattern). |
| 2026-04-30 | Silent fallback; no Sentry capture on pointer miss/dangling | v52-05 | OQ Q5 lock — pointer absence is normal; capturing is alert fatigue. |
| 2026-04-30 | AuditAction union extension auto-fix (added 'set_as_default') | v52-05 | TypeScript exhaustive-map gap surfaced in SetlistHistoryPanel; added matching label "Set as default for service". Essential type-system fix. |
| 2026-04-30 | `vi.resetAllMocks()` in v52-05 test describe (not vi.clearAllMocks) | v52-05 | clearAllMocks doesn't reset mockResolvedValueOnce queues; queued snapshots from prior describe bled into v52-05 cases. resetAllMocks drops everything. Pattern for future tests sequencing ResolvedValueOnce. |
| 2026-04-30 | Mock @/components/setlist/SetlistCards in hook tests | v52-05 | Avoids pulling lucide-react + dropdown-menu component graph for hook-only tests. SetlistCards mock returns just SERVICE_TYPE_LABELS. |
| 2026-04-30 | Single vertical-slice commit (Tasks 1+2+3 bundled) | v52-05 | v52-02/03/04 precedent. Atomic git history. |
| 2026-04-30 | Daniel approved with explicit "Approved" (NOT sight-unseen) | v52-05 | Milestone-close phase warranted careful surface review. Higher confidence going into UAT period. |
| 2026-04-30 | Plan revised mid-flight: Task 4 reclassified human-action → auto | v52-05 | Daniel feedback: "you have firebase cli so you don't need me." Saved feedback memory; plan re-committed (`15a1a6a`). Future plans don't repeat the misclassification. |

### v52-04 close (2026-04-30)
- v52-04-01 LOOP COMPLETE 2026-04-30. Vertical-slice commit `814a50d` (pushed origin master; Vercel auto-deployed). type=execute. **Issue 5 (3 P0 hover-reveals from Track C):** Append `[@media(pointer:coarse)]:opacity-100` to UpcomingSetlistCard kebab (SetlistCards.tsx:80), SetlistCard kebab (SetlistCards.tsx:208), CalendarDayCell empty-day "Plan Service" placeholder (CalendarDayCell.tsx:104). Desktop md+ hover-reveal preserved (md: prefix preserved on SetlistCards; transition-opacity duration-300 preserved on CalendarDayCell). **Issue 7 (CTA hierarchy):** Promote "Edit Setlist" (SetlistCards.tsx:137) and "Edit" (SetlistCards.tsx:256) from `variant="secondary"` + `bg-muted hover:bg-muted/80 text-foreground` overrides → `variant="brand"` (solid `bg-brand text-brand-foreground hover:bg-brand/85` from button.tsx). Redundant overrides removed; `flex-1 rounded-xl font-bold` layout preserved. Clone buttons untouched (UpcomingSetlistCard `bg-brand/10` tinted; SetlistCard `text-brand/80` subtle — both correct as secondary). Result: solid brand = primary = Edit; tinted brand = secondary = Clone. ~7 source LOC delta across 2 files. Suite 1528/1528 (pre-existing parallel-suite flake didn't surface this run). tsc + next build clean. Boundary diff confirms changes ONLY under SetlistCards.tsx + CalendarDayCell.tsx. Button component unchanged (consumes existing `variant="brand"`); no Tailwind theme changes. v52-02 + v52-03 contracts preserved. /ui-ux-pro-max gate satisfied (carryover; Track C audit + plan-time decisions covered design ground). Daniel approved sight-unseen at HUMAN-VERIFY checkpoint with "Go"; AC-7 real-iPad UAT deferred to standing Daniel-loop discipline (failures route to v52-04-02 follow-up plan in same phase per v51-04 rule). P1 Track C findings (C-04 SetlistCards watermark opacity-10/20; C-05 HeroCard arrow opacity-60/100) deferred per audit recommendation. SUMMARY at `.paul/phases/v52-04-touch-affordance-setlist-lifecycle/v52-04-01-SUMMARY.md`.

### Decisions (v52-04-01)

| 2026-04-30 | Decision | Phase | Impact |
|------------|----------|-------|--------|
| 2026-04-30 | `variant="brand"` (not `variant="default"`) for Edit promotion | v52-04 | Codebase distinguishes `primary` (indigo OKLCH) from `brand` (worship-band accent); Edit lives on a brand-tinted card → use `brand` to keep accent family cohesive. Cohesive two-button hierarchy via weight rather than hue. |
| 2026-04-30 | Drop `bg-muted hover:bg-muted/80 text-foreground` overrides at variant swap | v52-04 | Variant carries the styling; leaving overrides would conflict with bg-brand. Variant swap clean; future brand-style edits propagate automatically. |
| 2026-04-30 | Clone buttons untouched | v52-04 | Tinted-brand styling (UpcomingSetlistCard `bg-brand/10`, SetlistCard `text-brand/80`) is already correct secondary visual weight. Hierarchy preserved cleanly. |
| 2026-04-30 | No new tests (pure Tailwind/variant deltas, no behavior change) | v52-04 | No pre-existing SetlistCards.test.tsx; no snapshots affected; visual hierarchy verified by Daniel UAT not snapshot diffs. Suite delta = 0. |
| 2026-04-30 | P1 audit findings (C-04 watermark, C-05 HeroCard arrow) deferred | v52-04 | Track C audit explicitly recommended P0 only for v52-04. Cosmetic; revisit in future polish milestone. |
| 2026-04-30 | Single vertical-slice commit (Tasks 1+2 bundled) | v52-04 | v52-02 + v52-03 precedent: cohesive className-only change ships as one atomic commit. |
| 2026-04-30 | Daniel approved sight-unseen at HUMAN-VERIFY ("Go"); AC-7 real-iPad UAT deferred to standing Daniel-loop discipline | v52-04 | UAT failures route to v52-04-02 follow-up plan in same phase per v51-04 rule; not blocking phase close. |

### v52-03 close (2026-04-30)
- v52-03-01 LOOP COMPLETE 2026-04-30. Vertical-slice commit `e69e23a` (pushed origin master; Vercel auto-deployed). type=execute. **Issue 4 (kebab "red line"):** SetlistGridTopBar.tsx kebab `<button>` block + `onOverflow?` prop + `MoreVertical` import all removed; SyncIndicator becomes the only trailing action affordance in the topbar. SetlistGrid caller never passed `onOverflow` → prop removal non-breaking by construction; boundary diff confirms only SetlistGridTopBar.tsx changed. **Issue 1 (terminal `failed` FSM with no recovery):** new `src/lib/sync/cleanup.ts` exports `clearFailedOutboxRows({ db? })` — deletes only `status === 'failed'` rows from `db.outbox`; preserves `pending` / `sending`; returns `{ removed: number }`; does NOT call `engine.pump()` directly (engine's interval-based drain observes the now-clean outbox naturally; mirrors v50-06-03's "write to Dexie, let pump observe" pattern). SyncIndicator gained `defaultRetryFailed` async fallback (`retryFailedHandler = onRetryFailed ?? defaultRetryFailed`) so failed-state button is enabled by default in production (mirrors v50-06-02's useReconciliationModalOptional fallback for onResolveConflict). Auth-staleness pairing: when `lastError` matches `/permission|auth|denied|unauthenticated|unauthorized/i`, an inline `<button>` ("Sign out and back in") renders below the v51-h01 inline error pill and calls `useAuth().signOut()` on click; ≥44px tap target on coarse pointer via `[@media(pointer:coarse)]:min-h-[44px] [@media(pointer:coarse)]:py-2` per v50-05-04 floor; neutral `text-zinc-300 hover:text-white` styling reads as a distinct action vs the red error description (NOT red-300 from plan draft). New cleanup.test.ts (4 cases) + extended SyncIndicator.test.tsx (+6 v52-03-01 cases). Suite 1518 → 1528 (+10; exceeds plan estimate of +6-8). tsc clean; next build clean. Engine FSM, state-machine.ts, init.ts, snapshot-listener.ts, ReconciliationProvider, write.ts, firestore.rules all unchanged (boundaries respected). v51-01 + v52-02 cell/picker contracts preserved. /ui-ux-pro-max BLOCKING gate satisfied at APPLY entry; queried for destructive-action-confirmation + touch-target + error-recovery patterns; drove zinc-300 (vs red-300) and mt-1.5 (vs mt-0.5) refinements. Daniel approved sight-unseen at HUMAN-VERIFY checkpoint with "do it"; AC-6 real-iPad UAT deferred to standing Daniel-loop discipline (failures route to v52-03-02 follow-up plan in same phase per v51-04 rule). 1 pre-existing parallel-suite test-isolation flake (rotates between `route-auth.test.ts` and `SetlistGridHydrator.test.tsx`; both pass 23/23 in isolation) flagged in SUMMARY but not blocking — unrelated to v52-03 surface area. SUMMARY at `.paul/phases/v52-03-sync-indicator-ux-overhaul/v52-03-01-SUMMARY.md`.

### Decisions (v52-03-01)

| 2026-04-30 | Decision | Phase | Impact |
|------------|----------|-------|--------|
| 2026-04-30 | No confirm dialog before clearFailedOutboxRows | v52-03 | Failed = dead-letter; deletion is loss-of-no-progress, not destructive of in-flight work; /ui-ux-pro-max "Confirm Destructive Actions" rule doesn't fit this semantic. Single-tap recovery on iPad. |
| 2026-04-30 | Sign-out link in neutral text-zinc-300 (not red-300 from plan draft) | v52-03 | Red-on-red blends action into severity description, weakening hierarchy. Neutral zinc reads as a distinct action while preserving semantic red for the error pill. |
| 2026-04-30 | mt-1.5 spacing between error pill and sign-out link (plan draft was mt-0.5) | v52-03 | /ui-ux-pro-max Touch Spacing rule (≥8px between adjacent visual/tappable elements). Coarse-pointer min-h-[44px] floor preserved. |
| 2026-04-30 | Cleanup helper does NOT call engine.pump() | v52-03 | Engine's existing interval-based drain observes Dexie state changes naturally. Loose coupling per v50-06-03 pattern; engine boundaries preserved. |
| 2026-04-30 | useAuth() called unconditionally in SyncIndicator (rules-of-hooks compliance) | v52-03 | AuthContext default value provides no-op signOut so existing 7 SyncIndicator tests without an AuthProvider keep working unchanged. |
| 2026-04-30 | Import getDb from @/lib/local/schema (auto-fix from plan draft assumption of `db` const from `@/lib/local/db`) | v52-03 | Codebase pattern — `db` is not exported as a constant; matches existing conventions across SetlistGrid + Hydrator + ReconciliationProvider. |
| 2026-04-30 | Single vertical-slice commit (Tasks 1+2+3 bundled) | v52-03 | v51-04 + v52-02-01 precedent: cohesive feature change ships as one atomic commit when source + tests are inseparable. |
| 2026-04-30 | Daniel approved sight-unseen at HUMAN-VERIFY ("do it"); AC-6 real-iPad UAT deferred to standing Daniel-loop discipline | v52-03 | UAT failures route to v52-03-02 follow-up plan in same phase per v51-04 rule; not blocking phase close. |

### Earlier (v52-02)

Phase v52-02 — iPad focus + cmdk system fix. ✅ COMPLETE 2026-04-30 across 2 plans. v52-02-01 (`61eae6c`) shipped TouchOrPopover `suppressAutoFocus?: boolean` opt-in prop + DropdownCell mode-aware wiring (discrete preserves v51-01 no-keyboard-on-open; searchable lets cmdk auto-focus → iPad keyboard pops on Chart search). v52-02-02 (`f061c80`) shipped TextCell single-tap-to-edit on coarse pointer (track-name/Notes/setlist-name keyboard fix). Suite 1513 → 1518 (+5 across phase). /ui-ux-pro-max gate satisfied. Daniel UAT approved both plans post-deploy.

**Critical Task 1 finding (AC-4):** TextCell.tsx uses inline button→input two-state pattern requiring onDoubleClick / Enter / printable keystroke to enter edit mode — NO path through TouchOrPopover. Issue 2 (track-name/Notes/setlist-name keyboard) is **NOT covered** by this substrate fix. Routes to follow-up plan in v52-02 phase per v51-04 UAT-failure rule. Vocal Lead cell IS covered (uses DropdownCell searchable mode).

Earlier: v52-01-01 APPLY COMPLETE 2026-04-30. type=research; 3 of 4 tasks fully executed; Task 2 (HUMAN-ACTION iPad UAT capture) DEFERRED to post-deploy Daniel-loop UAT per v51-04-codified discipline (Daniel unavailable for real-iPad capture during research window; deviation recorded). Task 4 (DECISION) APPROVED by Daniel with all 6 default OQ answers locked. Outputs: track-a-ipad-focus-research.md (100 lines) + track-b-sync-indicator-research.md (242 lines incl. follow-up Issue 1 firming) + track-c-touch-affordance-audit.md (70 lines) + track-d-template-data-model.md (105 lines) + ipad-uat-capture.md (deferral doc with per-phase UAT acceptance criteria) + RESEARCH-SYNTHESIS.md (full 7-row confidence matrix; all 7 issues HIGH confidence; phase-by-phase recommendations for v52-02..05; 6 OQs answered with defaults). Zero source-code changes; boundary diff empty.

Status: APPLY COMPLETE — Ready for /paul:unify to close v52-01 loop.

### Decisions (v52-01)

| 2026-04-30 | Decision | Phase | Impact |
|------------|----------|-------|--------|
| 2026-04-30 | DEFERRED Task 2 HUMAN-ACTION iPad UAT capture; synthesized from code-read + per-phase deferred Daniel-loop UAT as the verification gate | v52-01 | iPad reality data verified post-deploy at v52-02..05 instead of pre-execution; no confidence loss (3/4 issues already HIGH from cross-track code-read; Issue 1 firmed via Q1/Q2/Q3 follow-up pass) |
| 2026-04-30 | APPROVED RESEARCH-SYNTHESIS.md with all 6 default OQ answers locked: Q1=(a) SetlistCards / Q2=admin-only template write / Q3=phased Shabbat morning + Erev Shabbat first / Q4=editor kebab entry point / Q5=silent fallback on deleted pointer / Q6=remove always-disabled kebab from SetlistGridTopBar | v52-01 | v52-02 / v52-03 / v52-04 / v52-05 plan against confirmed scope; Wave 1 parallel-eligible after v52-01 closes |
| 2026-04-30 | Issues 5+7 confirmed file-bundled in SetlistCards.tsx — bundle in single v52-04 plan rather than split | v52-04 | Smallest plan in v5.2 (~10-15 LOC) |
| 2026-04-30 | Issues 1+4 confirmed independent fixes within v52-03 (not shared root cause as initially clustered); both ship in one plan as separate tasks | v52-03 | Single v52-03 plan covers both; ~75-120 LOC + tests |
| 2026-04-30 | No v52-h hotfix split needed — Issue 1 firmed to HIGH confidence as recovery-affordance gap (not fundamental data-flow break) | v52-03 | Single cohesive plan; no emergency hotfix urgency |

Last activity: 2026-04-30 — v52-01-01 APPLY COMPLETE. Daniel approved synthesis with default OQ answers; ready for /paul:unify to close v52-01 loop. Wave 1 plans (v52-02..05) parallel-eligible after unify.

---

**Earlier activity (v5.1 close):** v51-04-01 LOOP COMPLETE 2026-04-27. Six-surface "Lead" → "Vocal Lead" rename shipped at `233d8b5`: SetlistGrid editor column header / BatchActionBar bulk-edit popover (label + aria-label + placeholder + emptyHint) / MobileEditSheet field label + input aria-label / ImporterModal preview-table column header (Key/Lead → Key/Vocal Lead, caught during audit) + performer-cell placeholder / print-pipeline.ts gig-packet cover-page header. New `testId?` prop on BulkPopover decouples user-facing label from testid stem so testid stability boundary is preserved (Vocal Lead bulk passes testId="lead"). Print colLead x-coord shifted left 20pt in both with-trans (380→360) and no-trans (430→410) variants so "Vocal Lead" header (~52pt @ 10pt Helvetica-Bold) fits without overflowing colTransKey/colNotes. Internal identifiers preserved verbatim: `leadMusician` (DB field), `lead` (patch alias), `setlistLeads`/`libraryLeads`/`knownLeads` (internal arrays), `LeadCell` component, `isLeader`/`onLeaderSetPosition` (perform-mode band leader — distinct concept), `band_leader` UserRole, `"Led by: ${rabbi}"` print line — all untouched. PROJECT.md gained "UAT Discipline (data-flow fixes)" subsection under Constraints codifying the Daniel-loop UAT cadence per postmortem v5h-01 §5 action item #4: every fix touching sync engine / Dexie / snapshot-listener / lazy-hydration / perf-view / editor cell-commit / Firestore rules gets a Daniel UAT pass on real production before milestone close; UAT failures route to a new plan in same phase. Single cohesive feature commit (vertical slice precedent from v51-03); 6 source files modified + 1 PROJECT.md update + plan/summary metadata. Suite 1513/1513 (no new tests, no regressions); tsc + next build clean; boundary diff empty for src/types/, src/lib/sync/, src/lib/local/, src/components/performance/, src/lib/roles.ts, firestore.rules. Daniel UAT approved ("go") at HUMAN-VERIFY checkpoint after Vercel deploy. SUMMARY at `.paul/phases/v51-04-vocal-lead-rename-and-print-smoke/v51-04-01-SUMMARY.md`. /ui-ux-pro-max gate satisfied (already loaded earlier in session via v51-03 APPLY). autonomous=false (1 HUMAN-VERIFY at end). 4 tasks: (1) string-only rename "Lead" → "Vocal Lead" across 5 user-facing surfaces (SetlistGrid column header / BatchActionBar bulk-edit popover label+aria / MobileEditSheet field label+aria / ImporterModal placeholder / print-pipeline.ts cover-page header) — DB field `leadMusician` + patch alias `lead` + `setlistLeads`/`libraryLeads`/`knownLeads` arrays + `LeadCell` component name + testids ALL boundary-locked; perform-mode `isLeader`/`onLeaderSetPosition` in SetlistRow.tsx + `band_leader` UserRole + `"Led by: ${rabbi}"` print line ALL boundary-locked (distinct concepts); (2) codify Daniel-loop UAT discipline in PROJECT.md per postmortem v5h-01 §5 action item #4 — "every fix touching data flow gets Daniel UAT pass on real production before milestone close; UAT failures route to a new plan in same phase; only after UAT passes does /paul:audit-milestone run"; (3) suite + tsc + next build + boundary diff verify; (4) HUMAN-VERIFY Daniel UAT on desktop + iPad — Vocal Lead reads everywhere AND gig-packet print smoke (real Erev Shabbat/Shabbat morning setlist with mixed track types + multiple musicians + rabbi: cover page lists all items, "Led by:" intact, eventDate+title correct, per-musician transpositions render correctly). 5 ACs (rename surfaces + identifiers preserved + PROJECT.md codification + suite/build clean + UAT). Boundaries lock src/types/, src/lib/sync/, src/lib/local/, src/components/performance/SetlistRow.tsx, src/lib/roles.ts, firestore.rules, all testids, all internal identifiers. v51-02-locked SetlistGrid tier classes preserved (only `header: 'Lead'` string changes; column-width may need +20-30pt bump for "Vocal Lead" to fit without truncation). v51-03 wizard surfaces NOT touched.

Earlier: v51-03-01 LOOP COMPLETE 2026-04-27. Date-aware three-offer wizard shipped at `f30e819`: findLastMatchingService(serviceType, beforeDate?) on createSetlistService (templateType direct match + 'festival' fan-out to sukkot/simchat_torah/passover/shavuot + getServiceContext fallback for legacy setlists); cloneSetlist(source, targetDate) generic clone; cloneForNextWeek refactored as thin wrapper preserving public surface (EmptyState's "Make next week's" CTA untouched). useCreationWizard exposes mode/cloneSource/cloneSourceLoading; useEffect on eventDate triggers lookup with auto-default-to-clone-when-mode='idle'; clone branch in create() short-circuits template/createSetlist path. CreationWizard.tsx reordered date-first; offer strip card with brand-colored Clone CTA + Use a template / Start from scratch text-link options (≥44px tap targets); template + name inputs hidden when mode='clone'; submit label flips to "Clone Setlist". No new dependencies (shadcn Tooltip absent → AC-5 hide-with-text path used). Sticky-memory (v50-04) intact: cloned tracks byte-identical; defaults.ts NOT modified. Tests: +18 (13 new in setlist-firebase.test.ts + 5 in use-creation-wizard.test.ts under "v51-03 clone path"). Suite 1513/1513 (was 1495); tsc + next build clean; boundary diff empty for grid/, defaults.ts, local/, sync/, performance/, firestore.rules. Daniel UAT approved ("go") at HUMAN-VERIFY checkpoint after Vercel deploy. Sentry breadcrumb for creation_mode tag DEFERRED — toast already differentiates the 3 modes; punt to v51-04 if needed. SUMMARY at `.paul/phases/v51-03-create-setlist-wizard/v51-03-01-SUMMARY.md`. /ui-ux-pro-max invoked at APPLY entry (queried wizard CTA hierarchy + shadcn dialog/tooltip/touch-target).

Earlier: v51-01-01 LOOP COMPLETE 2026-04-27. TouchOrPopover always-Popover + DropdownCell mode='discrete'|'searchable' + KeyCell chromatic Major|Minor Tabs across all 6 dropdown sites (Key/Lead/Type/AddRow/ChartBind/Bulk). SUMMARY at `.paul/phases/v51-01-picker-rework/v51-01-01-SUMMARY.md`.

v5.0-hotfix archived at `.paul/milestones/v5.0-hotfix-ROADMAP.md` 2026-04-27. v5.0 milestone still 🟡 PENDING-UAT — close path: v5.1 ships → Daniel UAT → invite band → first-week smoke → `/paul:audit-milestone v5.0`. Postmortem covering: cutover-plan rules-audit gap proposal; kitchen-sink harness fidelity gaps (no security-rules layer + no perf-view path coverage + zero-latency in-memory adapters miss cache-vs-fresh races) with 3 remediation options each (Firebase emulator OR fidelity-shaped adapter OR explicit assumption documented); perf-view 4-iteration architectural-rethink lesson (`metadata.fromCache` is source not freshness; 2-3-strikes architectural-rethink rule); auth-claim staleness incident (sign-out/in restored admin claim; reset-and-drain flipped 46 failed→pending); Daniel-loop UAT cadence as v5.x norm; Issue 2 (iPad key-picker UI) routing rule (tap-target → v50-05-04 regression, "feels janky" → v5.1). 3 tasks (write postmortem + correct ROADMAP 3→4 plans + suite/build verify). autonomous=true (no checkpoints; docs only; same precedent as v50-06-01 + v50-07-02 + v50-07-04 + v50-07-05). /ui-ux-pro-max NOT required (no UI). 7 ACs. Boundaries lock firestore.rules + snapshot-listener + Hydrator + use-setlist-performance + property-failures.test.ts + all v5h-01-*-SUMMARY.md + v5.0 milestone status (still pending UAT) + v5.1 milestone entries. PLAN at `.paul/phases/v5h-01-track-edit-save-loss/v5h-01-04-PLAN.md`. After v5h-01-04 LOOP COMPLETE: `/paul:audit-milestone v5.0-hotfix` closes the milestone; then v5.1 UX overhaul via `/paul:new-milestone` or `/paul:discuss-milestone`.

Earlier: v5h-01-03 LOOP COMPLETE 2026-04-27. Perf-view architectural refactor (Dexie via useLiveQuery + snapshot-listener mount) at commit 92b1902. Daniel UAT confirmed instant editor→perf-view propagation. v5.0-hotfix milestone is 75% complete (3 of 4 plans).

Earlier: v5h-01-01 LOOP COMPLETE 2026-04-27 — research+reproduction; root cause = missing Firestore rules for tracks/{id} + songs/{id}. Decision E+F+B defense-in-depth.

Three ranked hypotheses (all converge on engine writeback + LWW guard tightening):
1. Snapshot-listener LWW guard underflow — `(local.updatedAt ?? 0) >= remote.updatedAt` with undefined local → 0 >= ts1 → false → listener overwrites local with cached pre-edit Firestore data (cache-then-fresh delivery semantics).
2. Engine writeback never fires for the user's update — same downstream failure mode.
3. `serverTimestamp()` resolves AFTER getDoc re-read — sentinel timing → undefined updatedAt written to local → same failure mode.

Code-scan diagnostics already done (don't redo): cell-commit path wired correctly (DropdownCell.onSelect → commit → onCommitTrackPatch → applyEdit('update','tracks',{key:newKey}, expectedUpdatedAt: row.updatedAt)); applyEdit does db.tracks.put(merged) synchronously inside txn; useLiveQuery query correct; no production code clears Dexie tracks; hydrator priming SKIPS for initialTracks.length === 0; production adapter uses runTransaction + expectedUpdatedAt + tx.update + serverTimestamp; lazy-hydration cascade ruled out (Daniel's flow = fresh setlist no legacy embedded tracks).

Earlier: v50-07-05 LOOP COMPLETE — FINAL plan in v50-07 phase + v5.0 milestone. Three concerns: (1) Sentry alarms on save-path failures (new `src/lib/sync/sentry-capture.ts` helper centralizing tag/level/extra; wired at 6 silent-failure sites — SetlistGridHydrator lazy-hydration catch + engine.ts dead-letter at line 366 + 4 snapshot-listener swallow sites); (2) UAT test plan + smoke checklist for Rabbi Daniel + one band member to execute against real production over 1–2 weekly cycles; (3) ship-to-band checklist + 1-page band onboarding doc + first-week Sentry monitoring playbook. autonomous=true (UAT execution is post-plan; ship-to-band is push-to-prod). 3 tasks, 8 ACs. Boundaries lock engine FSM + adapter interface + write.ts + Dexie schema + SetlistGridHydrator lazy-hydration logic + perf-view + Firestore rules — all additive instrumentation only. /ui-ux-pro-max NOT required (observability + docs; same precedent as v50-06-01 + v50-07-02 + v50-07-04). Per-feature explicit non-capture: 'conflict' state transitions (user-facing UX, not failure) + every-drain-attempt (alert fatigue) + payload contents (PII). PLAN at `.paul/phases/v50-07-migration-cutover/v50-07-05-PLAN.md`. Awaiting approval.

Earlier: v50-07-04 LOOP COMPLETE — kitchen-sink fast-check property shipped. Decision (Task 0): user selected `harness-only` (Playwright spec skipped; Claude recommended this path — the v50-06 harness already proves every bulletproof claim a Playwright spec would prove, and v50-07-05 manual UAT is the actual end-to-end gate; AC-4 marked N/A). New `v50-07-04: kitchen-sink under random failure mix` describe in `src/lib/sync/__tests__/property-failures.test.ts`: KitchenSinkAdapter (SharedRemote + online toggle + expectedUpdatedAt precondition), KSAction grammar (edit-set/update/delete + toggle-online + force-quit + cross-tab via direct SharedRemote mutation + lazy-hydrate mirroring SetlistGridHydrator's Promise.all fan-out + tick), runKitchenSink with 4 invariants asserted (AC-9 no-data-loss + per-doc drain ordering + no orphaned 'sending' + lazy-hydration idempotency). fast-check property: 50 iterations on CI / 10 local; 8s per-iteration safety timeout so runaway shapes shrink to counterexample instead of timing out. 2 deterministic regressions (lazy-hydration idempotency across re-mounts; cross-tab edit + local update surfaces VersionMismatch as observable failed row). Lifted OfflineToggleAdapter from inside v50-06-03 describe to module scope (the only sensible reuse target; setupTwoWriterRace + SharedRemoteSubscriber too scenario-specific to lift). v50-06-03 still 10/10 against the lifted adapter. New `npm run test:kitchensink` script. Quiesce uses repeated pump() instead of clock.advance — driving the FakeClock through backoff retry timers ran away in tight loops when VersionMismatch kept firing (counterexample shrunk by fast-check during APPLY: lazy-hydrate + edit-delete tracks + edit-update setlists + edit-delete setlists). Failed/pending rows still observable in outbox = AC-9 satisfied. Suite 1468/1468 (+3); tsc + next build clean; CI=true kitchen-sink 50 iterations in 22.5s test / 25.6s wall (under 60s budget). Commit 47ae779 pushed; SUMMARY pending UNIFY. autonomous=false (was — 1 decision checkpoint at top: Playwright scope = harness-only / minimal-e2e / full-e2e; resolved to harness-only). 3 tasks, 7 ACs (AC-4 is decision-dependent). Reuses setupTwoWriterRace + SharedRemoteSubscriber + OfflineToggleAdapter + FakeClock from v50-06 property-failures harness; adds new describe block running fast-check ≥100 iterations on CI (25 local) covering random edits + airplane toggles + force-quits + cross-tab + lazy-hydration injection; asserts AC-9 no-data-loss + per-doc drain ordering + lazy-hydration idempotency. Optional minimal Playwright spec (~200 LOC) drives lazy-hydration end-to-end via page.addInitScript Dexie pre-seed (no real Firebase). Boundaries lock engine.ts / init.ts / write.ts / schema.ts / SetlistGridHydrator / use-setlist-performance — substrate is frozen for this plan; the hydrator's test-seam props ARE the integration point. /ui-ux-pro-max NOT required (SPECIAL-FLOWS gates on UI changes; this is test infra only — same precedent as v50-06-01 + v50-07-02). PLAN at `.paul/phases/v50-07-migration-cutover/v50-07-04-PLAN.md`. Awaiting approval.

Earlier: v50-07-03 LOOP COMPLETE — Option C Hybrid lazy hydration shipped at the application layer. `LocalSetlist.hydrated?: boolean` added (additive non-indexed schema bump per v50-04 rule). SetlistGridHydrator extended with a fire-once-per-mount lazy-hydration effect gated on `hydration === 'done' && initialSetlist.hydrated !== true && initialTracks.length > 0`: fans out `applyEdit({op:'set', collection:'tracks', doc:t}, {withoutUndo:true})` for every legacy embedded track via Promise.all, then `applyEdit({op:'update', collection:'setlists', docId, patch:{hydrated:true}, expectedUpdatedAt:initialSetlist.updatedAt}, {withoutUndo:true})` after fan-out succeeds. Errors are warn-logged via @/lib/logger; setlist stays unhydrated and retries on next mount. `applyEdit` exposed as a test-seam prop. useSetlistPerformance dual-reads via new `onSnapshot(query(collection(db,'tracks'), where('setlistId','==',setlistId)))` subscription with order-asc sort; prefers top-level when length > 0, falls back to `setlistData?.tracks` so 24 not-yet-hydrated legacy setlists still render in perf-view. No external API or index changes (single-field setlistId; ≤650 docs). Test coverage: SetlistGridHydrator +5 cases (lazy-fan-out + skip-already-hydrated + skip-empty + fan-out-failure + fire-once); useSetlistPerformance +4 cases (fallback-empty + prefer-top-level-sorted + live-update + cleanup-unsubscribe); 2 pre-existing priming-only tests updated to mark `hydrated:true` (semantically post-migration). 1 commit (`60de2ff`) covering all 3 tasks (cohesive vertical slice) + close commit lands next. Suite 1465/1465 (+9 from 1456); tsc + next build clean. Pushed to origin master (Vercel auto-deploys). `/ui-ux-pro-max` invoked at APPLY entry per SPECIAL-FLOWS.md mandate (brief load — data-correctness, no new pixels). SUMMARY at `.paul/phases/v50-07-migration-cutover/v50-07-03-SUMMARY.md`.
Last activity: 2026-04-27 — v51-03 LOOP COMPLETE end-to-end in single fresh-session resume. v51-03-01 feat at `f30e819` pushed to origin master; Daniel UAT approved ("go"). Phase v51-03 complete (1/1 plans). v5.1 milestone now 3/4 phases. Phase-close commit lands next via transition. Only v51-04 (Vocal Lead rename + Daniel-loop UAT codification + gig-packet print smoke) remains before v5.1 closes and v5.0 milestone audit unblocks.

## Session Continuity

Last session: 2026-05-02 — v5h3-01-04 LOOP COMPLETE (postmortem + binding harness-fidelity gate); phase v5h3-01 closes 4-of-4
Stopped at: All 4 ACs PASS. SUMMARY written at `.paul/phases/v5h3-01-save-loss-recurrence/v5h3-01-04-SUMMARY.md`. STATE.md loop position PLAN ✓ → APPLY ✓ → UNIFY ✓. **Last plan in phase v5h3-01** — transition workflow MUST run next per /paul:unify spec (mandatory, blocking gate).
Next action: Execute transition-phase workflow at `~/.claude/paul-framework/workflows/transition-phase.md`. Steps: (a) evolve PROJECT.md (any v5h3 requirements that flipped from Active → Validated); (b) update ROADMAP.md v5.3 milestone v5h3-01 phase status (Planning → Complete-Pending-UAT or similar); (c) phase-close commit `feat(v5h3-01): close save-loss recurrence hotfix phase` staging `.paul/phases/v5h3-01-save-loss-recurrence/v5h3-01-04-{PLAN,SUMMARY}.md` + `.paul/postmortems/v5h3-01-save-loss-recurrence.md` + `.paul/PROJECT.md` + `.paul/STATE.md` + `.paul/ROADMAP.md` (do NOT stage `src/build-info.json` or `package.json` per project memory); push origin master; (d) route to next: Daniel weekly worship cycle UAT on `36e9fa1` is the soft gate; planning-wise next is /paul:plan v53-02 (chart binding picker fix + ChartCell discoverability) — but v53-02 is blocked behind UAT-clear of v5h3-01.
Resume file: `.paul/phases/v5h3-01-save-loss-recurrence/v5h3-01-04-SUMMARY.md`

**Parallel track (not blocking v5.3 planning):** v5.2 + v5.0 still pending Daniel weekly worship cycle UAT on real production. UAT can run in parallel with v5.3 planning/research; UAT failures on v5.2 surfaces route to follow-up plans in their original v52-* phases per v51-04 rule.

### Decisions (v52-02-01)

| 2026-04-30 | Decision | Phase | Impact |
|------------|----------|-------|--------|
| 2026-04-30 | suppressAutoFocus default = false (opt-in suppression) | v52-02 | Future TouchOrPopover consumers get platform-correct behavior automatically; only consumers explicitly wanting no-keyboard-on-open opt in |
| 2026-04-30 | Issue 2 routes to v52-02-02 follow-up plan in same phase per v51-04 UAT-failure rule | v52-02 | Phase v52-02 will have 2 plans before close; Wave 1 parallel-eligibility unchanged for v52-03..05 |
| 2026-04-30 | Tasks 1+2 bundled into single commit `61eae6c` (vertical-slice precedent from v51-04) | v52-02 | Atomic fix-with-tests-as-one-cohesive-change git history |
| 2026-04-30 | Replaced 1 obsolete v51-01 test rather than skipping (it became FALSE under v52-02 default contract) | v52-02 | Test file aligned with current contract; no zombie skipped tests |
| 2026-04-30 | Generic Daniel "approved" treated as ship-it; sub-mode (b)/(c) disambiguation deferred to continued real-iPad use per codified Daniel-loop discipline | v52-02 | If sub-mode surfaces, route follow-up plan in same phase per v51-04 UAT-failure rule |

### Git State
Last commit: 36e9fa1 — fix(v5h3-01-03): thread server updatedAt into pending outbox rows — fixes single-user phantom VersionMismatch
Branch: master
Feature branches merged: none (no feature branches per project preference)
Pushed: ✓ 36e9fa1 → origin master (2026-05-02) [v5h3-01-03 fix; Vercel auto-deploying]
Earlier pushes today: ✓ 1d8d94c → origin master (2026-05-02) [v5h3-01-02 instrumentation]; ✓ d559b77 → (committed; not yet pushed when 1d8d94c was pushed — landed in same push); ✓ e63837c → (research-only; landed in 1d8d94c push)
Earlier pushes: ✓ 74b9fc8 → origin master (2026-04-30)
Firebase deploys: ✓ firestore:rules → crcmusiccharts (2026-04-30); none needed for v5h3-01-02 or v5h3-01-03 (no rules changes)
Pre-existing working-tree change NOT in any commit: package.json version string (2.11.19 → 0.0.6) — unrelated to v5.3 work; intentionally left out of all phase commits

Resume context (v5.3):
- v5.3 is a 4-phase milestone surfaced post-v5.2 from Daniel UAT regret on the v50-05 spreadsheet editor itself (substrate-level UX, not the v5.1/v5.2 polish surfaces)
- Daniel explicit ask: **systemic fixes, not bandaids** — research-first; phases 2–4 plan after v53-01 synthesis (same v52-01 pattern)
- v53-01 is research-only (no code); 3 parallel tracks A (ChartBind diagnosis) / B (old-editor archaeology) / C (polymorphic Add design + chart-verification interaction)
- v50-02 amputation deleted ~3,000 LOC of old editor surface (incl. polymorphic Add menu); Track B git-spelunks that history for port-back-worthy patterns — explicit non-goal: revert
- /ui-ux-pro-max BLOCKING gate applies to v53-02, v53-03, v53-04 (UI-touching phases) — optional for v53-01
- Tablet-first; verify every fix on iPad in addition to desktop (per v5h-01 postmortem lesson, reinforced by v5.2)
- Daniel-loop UAT discipline (codified v51-04): every phase touching data flow or UI gets Daniel UAT pass on real production before milestone close; UAT closes the milestone (not its own phase, matches v5.2 precedent)
- Spreadsheet bones (v50-05 substrate, sync engine v50-03, sticky memory v50-04, perf-view dual-read v5h-01-03) are out of scope — v5.3 is affordance repair, not substrate rebuild
- v5.0 + v5.2 UAT closes still pending — v5.3 plans in parallel with band onboarding; does not block
- Standing prefs reminder: push to `origin master` (NOT origin master:main); no local dev server; tablet-first; Reform Jewish (Friday night + Shabbat morning, NOT Sunday); "Vocal Lead" terminology; explicitly stage `.paul/phases/{phase}/` on PAUL commits; run `next build` not just `tsc`; multi-computer flow → always pull + fetch --tags before starting
- Pre-existing dirty state on package.json + src/build-info.json — auto-touched by dev script; do NOT stage on PAUL commits

---

**Earlier session:** 2026-04-27 → 2026-04-28 (v5.1 milestone closed + 2 emergency hotfixes shipped post-Daniel-UAT)
Stopped at: PAUSED at clean state — v51-h02 (`2b35860`) just deployed; Daniel switching to a different computer to verify. Internet went out as deploy was rolling, so v51-h02 verification did not happen.
Next action: on the new computer, `git pull origin master` + `git fetch --tags`, then `/paul:resume` to load handoff and route to v51-h02 verification (calendar "+" wizard routing AND phantom-setlist immediate-error display).
Resume file: `.paul/HANDOFF-2026-04-28-v51-hotfix-pickup.md`
Resume context:
- v5.1 Editor UX Polish ✅ COMPLETE 2026-04-27 (4/4 phases shipped, tagged v5.1, archived to .paul/milestones/v5.1-ROADMAP.md, MILESTONES.md entry written)
- v51-h01 (`d440192`) and v51-h02 (`2b35860`) hotfixes shipped post-milestone — both surfaced by the Daniel-loop UAT discipline codified in v51-04
- v51-h01: `updatedAt: serverTimestamp()` on createSetlist+cloneSetlist + Sentry capture on direct-write paths + inline lastError display on SyncIndicator (mobile-visible)
- v51-h02: PlaceholderCard + UnifiedCalendar entry points now route through wizard with prefilledDate (was bypassing v51-03 offer strip) + new RemoteDocMissingError terminal class (was retried 5× as TransientError, wasting ~15s before user-visible failure)
- Open: phantom setlist `setlists/CTAi6kgkTUpGYMO1Ffx7` is in Daniel's IndexedDB but 404s remotely; needs one-shot manual cleanup (Settings → Safari → Website Data → centralreform.live → Remove on phone, OR DevTools IndexedDB delete on desktop)
- Open: v51-h02 verification by Daniel hasn't happened yet — first task on resume
- v5.0 milestone STILL pending UAT (close path: weekly worship cycle + band invite + first-week smoke → `/paul:audit-milestone v5.0`)
- Three resume options laid out in handoff: (1) verify v51-h02 + continue UAT, (2) open v5.1-hotfix postmortem milestone, (3) pause longer + reconvene next session
- Standing prefs reminder: push to origin master; tablet-first; Reform Jewish (Friday night + Shabbat morning, NOT Sunday); "Vocal Lead" terminology; multi-computer flow — always pull + fetch --tags before starting
- Pre-existing package.json + src/build-info.json dirty state — auto-touched by dev script; NEVER stage on PAUL commits
- Git strategy: master (no feature branches per project preference)
Resume context:
- v5.1 milestone is 3/4 phases done (v51-01 ✅ + v51-02 ✅ + v51-03 ✅); only v51-04 remains
- v51-03 shipped: date-aware New Setlist wizard with Clone CTA / Use a template / Start from scratch; backed by findLastMatchingService + cloneSetlist; sticky-memory contract intact
- v51-04 = Vocal Lead label rename + Daniel-loop UAT codification + gig-packet print smoke check
- Sentry breadcrumb for creation_mode tag deferred from v51-03-01; pick up in v51-04 if needed (toast tagging already covers the user-facing AC-8 requirement)
- After v51-04 closes: Daniel UAT next Erev Shabbat → invite band → first-week smoke → `/paul:audit-milestone v5.0` closes the v5.0 milestone
- Standing prefs reminder: push to origin master; tablet-first; Reform Jewish (Friday night + Shabbat morning, NOT Sunday); "Vocal Lead" terminology; explicitly stage `.paul/phases/{phase}/` on PAUL commits; run `next build` not just `tsc`
- Pre-existing dirty state on package.json + src/build-info.json — auto-touched by dev script; do NOT stage on PAUL commits
- Git strategy: master (no feature branches per project preference)

Resume context:
- v5.1 milestone is 1/4 phases done; phases v51-02 / v51-03 / v51-04 remain
- v51-02 = editor readability (density tightening, visual hierarchy lift on desktop + tablet); mobile parallel render path NOT touched
- v51-03 = smart create-setlist wizard (date-aware via Hebcal — Friday/Shabbat morning/holidays)
- v51-04 = Vocal Lead label rename + Daniel-loop UAT codification + gig-packet print smoke check
- Pushed: task commits 6671254 / c11a5c4 / 304e940; local-only: milestone create + 4-phase expand + phase-close (70abfff) + earlier same-day v5.0-hotfix close + tag
- Standing prefs reminder: push to origin master; tablet-first; Reform Jewish (Friday night + Shabbat morning, NOT Sunday); "Vocal Lead" terminology
- Git strategy: main (no feature branches per project preference)
Status: UNIFY complete for v50-06-03; v50-06 phase COMPLETE. startSnapshotListener wired into SetlistGridHydrator post-hydration: subscribes to setlists/{id} + tracks where setlistId == X via onSnapshot; writes deliveries directly to Dexie via db.put with outbox-pending guard (skip if any outbox row exists for the docId) + LWW guard (only put if remote.updatedAt > local.updatedAt). Listener bypasses applyEdit/outbox — server-authoritative read path coexisting with engine drain. SnapshotSubscriber test-seam interface lets unit tests inject hand-rolled fakes; production wires to firebase/firestore onSnapshot in a 30-line factory inside the same module. Property-failures harness extended with two new describe blocks: passive listener closes 'theirs' staleness gap (loser's local row matches remote after listener delivery; no outbox row created); sequential offline edits queue + drain in order F→G→A→B→C on reconnect (per-doc drain ordering invariant validated under realistic airplane-mode flow). Performance-view audit landed Outcome 2: useSetlistPerformance reads legacy setlists/{id}.tracks[] embedded array; v50-05-01 writes to top-level tracks/{id}; production data is split-brain; routed forward to v50-07 migration as explicit deliverable. /ui-ux-pro-max optional for this plan (no UI surface modified). 4 commits: `50f34b5` (chore PLAN), `21d0945` (Task 1 listener+tests), `19f38b9` (Task 2 harness), `1e1fe3c` (Task 3 hydrator mount + audit); close commit lands next. Suite 1442/1442 (+11 from 1431); tsc + next build clean. Pushed to origin master. Reconciliation modal end-to-end on prod /setlists/[id]: ReconciliationProvider mounted inside DeleteConfirmProvider; subscribes to engine 'conflict' state via `useSyncStatus`; reads `failed`-status outbox rows via `useLiveQuery`; renders per-row card with per-field DIFF (informational) + per-row "Keep mine / Take theirs" radio (default 'theirs'); "Resolve all and save" iterates `engine.resolveConflict(localId, choice, { newExpectedUpdatedAt })` sequentially with newExpectedUpdatedAt sourced from the cached RemoteDocSnapshot. FirestoreAdapter interface gained `readDoc(collection, docId) → RemoteDocSnapshot|null`; ProductionFirestoreAdapter implements via getDoc + Timestamp.toMillis; init.ts tracks adapterSingleton + exports getSyncAdapter. SyncIndicator's conflict action button re-opens dismissed modal via useReconciliationModalOptional. Property-failures harness extended with `setupTwoWriterRace` helper + 'mine' (drains successfully, remote holds loser's payload, updatedAt > winner's) + 'theirs' (remote unchanged, loser local row preserved at baseline) branch tests — 5/5 deterministic. ReconciliationProvider component test (~420 LOC, 11 cases) covers all 7 ACs incl. 3 jest-axe scans (ZERO violations on first run). 4 commits: `0278e0f` (chore PLAN), `6c9662b` (Task 1), `51a4298` (Task 2), `43fefaf` (Task 3); close commit lands next. Suite 1431/1431 (+13 from 1418); tsc clean; next build clean. Pushed to origin master; Vercel deployment Ready (`dpl_CfYCNcHuAaD4kUCoHoY2KdWwZN5V`).
Last activity: 2026-04-26 — UNIFY complete for v50-06-03; v50-06 phase COMPLETE (3/3 plans). v50-07 (migration + kitchen-sink Playwright + cutover — final phase) ready to plan.

Progress:
- v5.0: [██████████] ~95% (6 of 7 phases complete; v50-07 final phase remains)
- Phase v50-01: [██████████] 100% ✓ (architecture locked)
- Phase v50-02: [██████████] 100% ✓ (~2,363 LOC deleted)
- Phase v50-03: [██████████] 100% ✓ (sync engine — Dexie + outbox + FSM + property harness)
- Phase v50-04: [██████████] 100% ✓ (song catalog & sticky memory — Dexie v2 + helpers + migration script)
- Phase v50-05: [██████████] 100% ✓ (spreadsheet editor UI cutover — 5 plans: build + cutover + multi-select+AlertDialog + iPad+ContextMenu + mobile+Undo+WCAG)
- Phase v50-06: [██████████] 100% ✓ (concurrent-edit safety — 3 plans: substrate stabilization + reconciliation modal §6.9 + cross-leader live-edit + airplane-mode + perf-view audit)

## Loop Position

Current loop state (v5.2 milestone — 🚧 IN PROGRESS):
```
PLAN ──▶ APPLY ──▶ UNIFY
  ✓        ○        ○     [v52-03-01 PLAN created 2026-04-30; awaiting approval to apply]

v52-01-01:     ✓ ──▶ ✓ ──▶ ✓     [LOOP COMPLETE — synthesis approved; commit 0beb4f2 pushed to origin master]
v52-02-01:     ✓ ──▶ ✓ ──▶ ✓     [LOOP COMPLETE — substrate fix shipped at 61eae6c; Issues 3 + Vocal Lead covered]
v52-02-02:     ✓ ──▶ ✓ ──▶ ✓     [LOOP COMPLETE — TextCell single-tap-to-edit shipped at f061c80; Issue 2 closed; MobileEditSheet + CreationWizard case (ii) confirmed]
v52-03-01:     ✓ ──▶ ○ ──▶ ○     [PLAN created — kebab removal + clearFailedOutboxRows + sign-out pairing; Issues 1+4 fix]
v52-02:        ○ ──▶ ○ ──▶ ○     [Not started — iPad focus + cmdk system fix; informed by Track A]
v52-03:        ○ ──▶ ○ ──▶ ○     [Not started — SyncIndicator failure UX overhaul; informed by Track B]
v52-04:        ○ ──▶ ○ ──▶ ○     [Not started — touch affordance + setlist lifecycle UX; informed by Track C]
v52-05:        ○ ──▶ ○ ──▶ ○     [Not started — default-template management; informed by Track D]
```

Progress:
- v5.2: [░░░░░░░░░░] 0% (0 of 5 phases complete)

---

**Earlier (v5.1 milestone — ✅ COMPLETE):**
```
PLAN ──▶ APPLY ──▶ UNIFY
  ✓        ✓        ✓     [v51-04-01 LOOP COMPLETE 2026-04-27. v5.1 milestone 4/4 phases shipped — band-onboarding gate cleared.]

v51-01-01:     ✓ ──▶ ✓ ──▶ ✓     [LOOP COMPLETE 2026-04-27. Picker rework shipped at 304e940; suite 1492/1492.]
v51-02-01:     ✓ ──▶ ✓ ──▶ ✓     [LOOP COMPLETE 2026-04-27. Editor readability + visual hierarchy shipped at c40d880; Option B Comfortable Dense locked; suite 1495/1495 (+3 a11y); UAT approved. SUMMARY at .paul/phases/v51-02-editor-readability/v51-02-01-SUMMARY.md.]
v51-03-01:     ✓ ──▶ ✓ ──▶ ✓     [LOOP COMPLETE 2026-04-27. Smart create-setlist wizard with date-aware Clone CTA shipped at f30e819; suite 1513/1513 (+18); UAT approved. SUMMARY at .paul/phases/v51-03-create-setlist-wizard/v51-03-01-SUMMARY.md.]
v51-04-01:     ✓ ──▶ ✓ ──▶ ✓     [LOOP COMPLETE 2026-04-27. Vocal Lead rename across 6 surfaces + Daniel-loop UAT codification in PROJECT.md + print smoke shipped at 233d8b5; suite 1513/1513 (no regressions); UAT approved. SUMMARY at .paul/phases/v51-04-vocal-lead-rename-and-print-smoke/v51-04-01-SUMMARY.md.]
```

Earlier loop state (v5.0-hotfix milestone — closed):
```
PLAN ──▶ APPLY ──▶ UNIFY
  ✓        ✓        ✓     [v5h-01-03 LOOP COMPLETE 2026-04-27. v5.0-hotfix save-loss bug FULLY CLOSED end-to-end. v5h-01-04 postmortem is the only plan left in this milestone.]

v5h-01-01:     ✓ ──▶ ✓ ──▶ ✓     [LOOP COMPLETE. Reproduction + production capture → root cause = missing Firestore rules for tracks/{id} + songs/{id}. Decision = E+F+B defense-in-depth. SUMMARY at .paul/phases/v5h-01-track-edit-save-loss/v5h-01-01-SUMMARY.md.]
v5h-01-02:     ✓ ──▶ ✓ ──▶ ✓     [LOOP COMPLETE 2026-04-27. E+F+B (rules + Hydrator outbox guard + listener LWW) at commit 0c2921d. AC-4 ultimately passed for editor save after diagnostic chain (outbox cleanup + auth re-sync). Perf-view side routed to v5h-01-03. SUMMARY at .paul/phases/v5h-01-track-edit-save-loss/v5h-01-02-SUMMARY.md.]
v5h-01-03:     ✓ ──▶ ✓ ──▶ ✓     [LOOP COMPLETE 2026-04-27. Architectural refactor: useSetlistPerformance reads tracks from Dexie via useLiveQuery + mounts snapshot-listener (final commit 92b1902). 4 iterations: f83d75d reverted, 8971223 + 4aa6840 superseded, 92b1902 final. Suite 1481/1481. Daniel UAT confirmed instant editor→perf-view propagation. SUMMARY at .paul/phases/v5h-01-track-edit-save-loss/v5h-01-03-SUMMARY.md.]
v5h-01-04:     ✓ ──▶ ✓ ──▶ ✓     [LOOP COMPLETE 2026-04-27. Postmortem at .paul/postmortems/v5h-01-save-loss.md (5 lessons + 5 action items). ROADMAP corrected 3→4 plans. Phase v5h-01 ✅ COMPLETE (4/4 plans). v5.0-hotfix milestone 🟡 1/1 phases done, pending /paul:audit-milestone v5.0-hotfix to close. SUMMARY at .paul/phases/v5h-01-track-edit-save-loss/v5h-01-04-SUMMARY.md.]

─── v5.0-hotfix milestone above (current) ─── v5.0 milestone below (pending close) ───

Earlier (v5.0):
PLAN ──▶ APPLY ──▶ UNIFY
  ✓        ✓        ✓     [v50-06-03 LOOP COMPLETE — cross-leader live-edit + airplane-mode + perf-view audit shipped]

v50-01:        ✓ ──▶ ✓ ──▶ ✓     [Phase complete]
v50-02:        ✓ ──▶ ✓ ──▶ ✓     [Phase complete]
v50-03:        ✓ ──▶ ✓ ──▶ ✓     [Phase complete]
v50-04:        ✓ ──▶ ✓ ──▶ ✓     [Phase complete]
v50-05:        ✓ ──▶ ✓ ──▶ ✓     [Phase COMPLETE — 5 plans]
v50-06:        ✓ ──▶ ✓ ──▶ ✓     [Phase COMPLETE — 3 plans: substrate + modal + cross-leader]
v50-07-01:     ✓ ──▶ ✓ ──▶ ✓     [Audit shipped; user selected Option C Hybrid Lazy Hydration]
v50-07-02:     ✓ ──▶ ✓ ──▶ ✓     [MARKER_PATH patched; liveState scrubbed from 10 setlists with rollback snapshots]
v50-07-03:     ✓ ──▶ ✓ ──▶ ✓     [LOOP COMPLETE — lazy hydration + dual-read; +9 tests (1465/1465); commit 60de2ff; pushed to origin master]
v50-07-04:     ✓ ──▶ ✓ ──▶ ✓     [LOOP COMPLETE — kitchen-sink fast-check (50 CI iterations, 22.5s) + 2 deterministic regressions; OfflineToggleAdapter lifted to module scope; +3 tests (1468/1468); decision=harness-only (AC-4 N/A); SUMMARY at .paul/phases/v50-07-migration-cutover/v50-07-04-SUMMARY.md]
v50-07-05:     ✓ ──▶ ✓ ──▶ ✓     [LOOP COMPLETE — Sentry alarms (6 capture sites via centralized helper) + UAT-PLAN.md + SHIP-CHECKLIST.md; +6 tests (1474/1474); SUMMARY at .paul/phases/v50-07-migration-cutover/v50-07-05-SUMMARY.md]
─────────────────────────────────────────
PHASE v50-07 ✅ COMPLETE (5/5 plans). v5.0 milestone PENDING UAT — see resume instructions below.
```

## How to resume

**v51-03-01 PLAN CREATED.** Run `/paul:apply .paul/phases/v51-03-create-setlist-wizard/v51-03-01-PLAN.md` to execute. autonomous=false; /ui-ux-pro-max BLOCKING at APPLY entry (must load BEFORE Task 2 designs the offer strip per SPECIAL-FLOWS.md). Expect 1 HUMAN-VERIFY at end (Daniel UAT on desktop + iPad against deployed Vercel).

Phase v51-03 scope (per ROADMAP):
- Extend the v4.2 P2-02 single-step wizard to be date-aware via Hebcal (already wired)
- Three offers on date-pick: **Clone last matching service** (default; 90% click), **Choose a template**, **Start from scratch**
- "Last matching" = most-recent setlist of the same service-type (Erev Shabbat clones from prev Erev Shabbat, NOT from a Shabbat morning in between)
- Edge case (no matching prior): hide or grey-out clone option with tooltip
- Verify v50-04 sticky song memory works through clone path (per-song defaults bpm/key/vocal-lead follow into the new setlist)
- Service types: Erev Shabbat (Friday evening) + Shabbat morning (Saturday) + holidays (Hebcal). NOT Sunday — Reform Jewish synagogue.
- Likely 1 plan (possibly 2 if date-detection logic needs research first), ~4-6h

After v51-03 closes: v51-04 (Vocal Lead rename + UAT codify + print smoke) → Daniel UAT for next Erev Shabbat → invite band → first-week smoke → `/paul:audit-milestone v5.0` closes the v5.0 milestone.

Phase v51-02 scope (per ROADMAP):
- Tighten setlist editor density on desktop + tablet (rows currently too spaced; visual hierarchy doesn't help eye find title vs key vs lead)
- Row height: ~56px → ~40-44px desktop, ~44-48px tablet (preserving 44px-min touch targets per v50-05-04)
- Cell padding: tighten horizontal + vertical
- Visual hierarchy: title weight/size > key (still prominent, key-left from v1.6 P3) > lead/type (secondary) > notes (tertiary)
- Section differentiation (welcome/opening/etc.) — visual treatment for grouping rows
- Column emphasis: title wider; type/key narrower
- WCAG AA cross-check via jest-axe at end (same pattern as v50-05-05)
- Mobile parallel render path (v50-05-05) NOT touched — separate component tree
- Public-share / read-only views inherit; verify no regression

After v51-02 closes: v51-03 (smart create-setlist wizard) → v51-04 (Vocal Lead rename + UAT codify + print smoke) → Daniel UAT for next Erev Shabbat → invite band.

### Earlier (v51-01-01 apply guidance, kept for context)

Earlier: **v51-01-01 PLAN CREATED.** Run `/paul:apply .paul/phases/v51-01-picker-rework/v51-01-01-PLAN.md` to execute. /ui-ux-pro-max BLOCKING — must invoke at APPLY entry before any code change. autonomous=false: 1 decision-checkpoint near start + 1 HUMAN-VERIFY at end. (Resolved: shipped at 6671254 / c11a5c4 / 304e940; tabs-suppress decision; UAT approved.)

Phase v51-01 details (now complete):

- **Goal:** Replace `TouchOrPopover` Sheet+system-keyboard pattern across all 6 dropdown sites (Key/Lead/Type/AddRow/ChartBind/Bulk). One wrapper rewrite, six consumers.
- **Surface:** popover anchored OR inline expansion (decide during APPLY with /ui-ux-pro-max consultation)
- **No system keyboard** on touch ever; keyboard input only on desktop with hardware keyboard
- **Key picker specifics:** chromatic order (C, C♯/D♭, D, D♯/E♭, E, F, F♯/G♭, G, G♯/A♭, A, A♯/B♭, B); Major | Minor tabs inside the picker
- **Skill:** `/ui-ux-pro-max` BLOCKING per SPECIAL-FLOWS.md
- **Sizing:** likely 1 plan, ~3-5h

After v51-01 closes: v51-02 (editor readability + visual hierarchy on desktop + tablet — tighten density, lift hierarchy between title/key/lead/type/notes, differentiate sections, preserve 44px-min touch targets, mobile parallel render path NOT touched) → v51-03 (smart create-setlist wizard with Hebcal date-detection for Erev Shabbat / Shabbat morning / holidays; Clone-last-matching default offer; sticky memory verified through clone path) → v51-04 (Vocal Lead label rename + Daniel-loop UAT codification + gig-packet print smoke check) → Daniel UAT against real production for next Erev Shabbat → invite band → first-week smoke → `/paul:audit-milestone v5.0` closes the v5.0 milestone.

5 action items from the v5.0-hotfix postmortem remain opportunistic and NOT folded into v5.1 (except #4 Daniel-loop UAT codification which lives in v51-04): (1) cutover rules-audit gate; (2) kitchen-sink Firebase emulator + RTL test pair; (3) Issue 2 routing — RESOLVED (lands as v51-01); (5) optional 2-3-strikes architectural-rethink rule codification. Postmortem at `.paul/postmortems/v5h-01-save-loss.md`.

### Earlier (v5.0-hotfix close routing, kept for context)

Earlier: **Phase v5h-01 ✅ COMPLETE.** v5.0-hotfix milestone is 1 of 1 phases done. Run `/paul:audit-milestone v5.0-hotfix` to verify scope was fully delivered + close the milestone. (Resolved: chose `/paul:complete-milestone` directly since postmortem already captures the audit-style narrative; milestone closed 2026-04-27.)

5 action items captured in the postmortem, all owned by Rabbi Daniel: (1) cutover rules-audit gate (PAUL plan-phase OR CARL global rule); (2) kitchen-sink remediation (recommend Firebase emulator + thin RTL editor↔perf-view test pair); (3) Issue 2 routing once Daniel describes symptom; (4) Daniel-loop UAT cadence codification in PROJECT.md or PAUL milestone-close gate; (5) optional: 2-3-strikes architectural-rethink rule codification.

### Earlier (v5h-01-04 apply guidance, kept for context)

Earlier: **v5h-01-04 PLAN CREATED.** Run `/paul:apply .paul/phases/v5h-01-track-edit-save-loss/v5h-01-04-PLAN.md` to execute the FINAL plan in v5.0-hotfix. autonomous=true (no checkpoints; docs only). 3 tasks: (1) write postmortem at `.paul/postmortems/v5h-01-save-loss.md` covering cutover rules-audit gap + harness fidelity gaps + perf-view architectural-rethink lesson + auth-claim staleness + Daniel-loop UAT norm + Issue 2 routing; (2) correct ROADMAP.md from "3 plans" to "4 plans" for v5h-01; (3) verify suite + build green.

### Earlier (v5h-01-02 apply guidance, kept for context)

Earlier: **v5h-01-02 PLAN CREATED.** Run `/paul:apply .paul/phases/v5h-01-track-edit-save-loss/v5h-01-02-PLAN.md` to execute. autonomous=false; expect 1 decision-checkpoint at start (option-all-three vs option-ef-only) + 1 HUMAN-VERIFY at end (Daniel UAT scenario 1 against prod after rules deploy + outbox clear).

Apply will: (T1) edit firestore.rules + deploy via Firebase CLI; (T2) add outbox-pending guard to SetlistGridHydrator hydrate(); (T3) +3 tests; (T4 if all-three) listener LWW fix; (T5 if all-three) flip AC-1 marker; HUMAN-VERIFY = Daniel's UAT.

After v5h-01-02 closes: v5h-01-03 postmortem (kitchen-sink security-rules fidelity gap; cutover rules-audit gate; deferred items). After v5.0-hotfix closes: v5.1 UX overhaul → `/paul:audit-milestone` closes v5.0.

**Critical finding from Task 2:** The original handoff hypothesis (engine writeback skipped + listener LWW underflow → silent clobber) was WRONG. Production state capture revealed the actual root cause is **missing Firestore security rules for the top-level `tracks/{trackId}` and `songs/{songId}` collections** that v50-05 introduced. Every track save returns `permission-denied`. 50+ failed outbox rows accumulated for setlist `kQNvssixRlHQRB6gtWqt`. The "key gone after navigate-away" is a downstream effect of (a) per-doc drain ordering blocking user updates behind failed lazy-hydration cascade `set` rows and (b) SetlistGridHydrator re-priming legacy embedded `setlists/{id}.tracks[]` over the user's stuck-pending local edit.

Decision resolved: **E + F + B** (defense-in-depth). v5h-01-02 ships:
- **E (PRIMARY):** Add `match /tracks/{trackId}` + `match /songs/{songId}` rules to `firestore.rules` mirroring existing setlists patterns; deploy via `firebase deploy --only firestore:rules` (Firebase CLI available in session); ship one-shot recovery for affected users (Daniel + 0 band members).
- **F (SECONDARY silent-loss closure):** SetlistGridHydrator outbox-pending guard around `db.tracks.put` priming, mirroring snapshot-listener.ts:197.
- **B (TERTIARY defense):** 2-line LWW guard fix at snapshot-listener.ts:174 + :215 against undefined local.updatedAt; flip AC-1 in property-failures.test.ts from `it.fails` → `it` (regression lock).

After v5h-01-02 ships → push to prod → Daniel re-runs UAT scenario 1 → v5h-01-03 postmortem (kitchen-sink can't model security rules; cutover plans need rules-audit gate; production capture should precede harness work in future v5h plans). After v5.0-hotfix closes: v5.1 UX overhaul → `/paul:audit-milestone` closes v5.0.

### Earlier (v5.0 PENDING-UAT bridge — handoff archived)

🔴 **Bridge handoff (now archived):** `.paul/handoffs/archive/HANDOFF-2026-04-27-post-uat-v5h-and-v51.md`
— full bridge from where v5.0 closed → through v5.0-hotfix + v5.1 → to v5.0 milestone
close. Drafted at 2026-04-27 before context clear; contains:
- Daniel's exact reproduction of the save-loss bug (path "P" confirmed)
- Code-scan diagnostics already done (don't redo)
- Top three root-cause hypotheses (LWW underflow / writeback miss / serverTimestamp race)
- Refined v5h-01-01 research plan (3 tasks; 1 HUMAN-ACTION checkpoint to capture
  Dexie state in production with DevTools open — IMPORTANT: Daniel must NOT clear
  browser data on the affected setlist before that capture)
- v5.1 UX overhaul phase plan (3 plans; /ui-ux-pro-max BLOCKING)
- Sequencing for next session

Sequencing summary:
1. `/paul:resume` (you're doing this) → reads STATE.md + the handoff
2. `/paul:milestone` → start v5.0-hotfix
3. `/paul:plan` → v5h-01-01 research plan
4. After v5.0-hotfix ships + Daniel re-confirms UAT scenario 1 passes:
   `/paul:milestone` → start v5.1 UX overhaul
5. After v5.1 ships + Daniel re-confirms UAT smoke passes:
   `/paul:audit-milestone` (or `/paul:plan-milestone-gaps`) → close v5.0

### Earlier (pre-UAT resume guidance, kept for context)

**Phase v50-07 is COMPLETE; v5.0 milestone is PENDING UAT.**

Two paths from here, in order:

1. **Execute the UAT** (Rabbi Daniel + one band member, against real production over 1–2 weekly worship cycles):
   - Day 1: walk through the 15-item smoke checklist in `.paul/phases/v50-07-migration-cutover/v50-07-05-UAT-PLAN.md` (top of file). Stop and report on first ❌.
   - Day 1 also: walk through Section 1 of `.paul/phases/v50-07-migration-cutover/v50-07-05-SHIP-CHECKLIST.md` (8-step deploy verification).
   - Over the week: execute UAT scenarios 1–6 (one per session is fine). Scenario 7 (cross-leader) requires coordination — schedule once.
   - Throughout: watch Sentry dashboard against the 4 documented feature tags (`feature:lazy-hydration`, `feature:dead-letter`, `feature:snapshot-listener`, `feature:write-atomicity`) per Section 3 of SHIP-CHECKLIST.md monitoring playbook.
   - Capture failures: setlist ID + time + screenshot + expected-vs-actual; route to a v5.0 hotfix plan if needed.

2. **Close v5.0 milestone**: After UAT succeeds + any hotfix plans land, run `/paul:audit-milestone` (or `/paul:plan-milestone-gaps` if available) to verify v5.0 scope was fully delivered. That command marks the milestone complete and routes to v5.1 planning.

If a hotfix is needed mid-UAT: open a new plan in this same phase directory (e.g., v50-07-06-PLAN.md) or start the v5.0-hotfix milestone if scope is large. Don't try to amend the closed phase.

### Earlier (v50-07-05 APPLY guidance, kept for context)

Run `/paul:apply .paul/phases/v50-07-migration-cutover/v50-07-05-PLAN.md` to execute the FINAL plan in v50-07. autonomous=true (no checkpoints). Tasks: (1) sentry-capture helper + wire 6 sites — wrap @sentry/nextjs Sentry.captureException with try/catch (telemetry never crashes engine); coerce tag values to strings; level='error' for dead-letter / write-atomicity, level='warning' for lazy-hydration / snapshot-listener; ~3-5 unit tests proving tag/level/extra/no-throw shape. (2) UAT-PLAN.md — ≥6 weekly-workflow scenarios + 10-15 smoke checklist + coverage map. (3) SHIP-CHECKLIST.md (deploy verification + 1-page band onboarding + first-week Sentry monitoring playbook with rollback procedure) + push to origin master. After APPLY+UNIFY closes: Rabbi Daniel + one band member execute UAT post-plan over 1–2 weekly cycles. After UAT succeeds + any hotfix plans land: run `/paul:audit-milestone` (or `/paul:plan-milestone-gaps` if available) to verify v5.0 scope was fully delivered, then close v5.0 milestone.

### Earlier (v50-07-05 phase scope, kept for context)

Run `/paul:plan` for v50-07-05 — the FINAL plan before v5.0 milestone close. Scope per ROADMAP.md: Sentry alarms on save-path failures (must surface lazy-hydration fan-out failures from v50-07-03 + engine drain failures + cross-tab VersionMismatch + dead-letter rows) + manual UAT prep (test plan / data setup / smoke checklist for Rabbi Daniel + one band member exercising real production /setlists/[id] with the v5.0 editor under realistic weekly-workflow patterns) + ship-to-band checklist (deploy verification / band onboarding doc / first-week monitoring playbook). After v50-07-05 closes, run `/paul:audit-milestone` (or `/paul:plan-milestone-gaps` if available) to verify v5.0 milestone scope was fully delivered, then close v5.0. /ui-ux-pro-max likely required for the UAT prep portion if any UI shipping checks are added; pure Sentry wiring is backend.

### Earlier (v50-07-04 APPLY guidance, kept for context)

Run `/paul:apply .paul/phases/v50-07-migration-cutover/v50-07-04-PLAN.md` to execute v50-07-04. APPLY will hit the decision checkpoint at the top (Playwright scope: harness-only / minimal-e2e / full-e2e); default recommendation is `minimal-e2e` (extends fast-check harness with kitchen-sink describe + adds one focused Playwright spec for lazy-hydration end-to-end via page.addInitScript Dexie pre-seed; ~200 LOC of mock infra; no real Firebase needed). After approval: Task 1 (kitchen-sink describe in property-failures.test.ts; ≥100 iterations on CI; reuses setupTwoWriterRace + SharedRemoteSubscriber + OfflineToggleAdapter + FakeClock) → Task 2 (Playwright spec sized per decision) → Task 3 (verification roll-up). After v50-07-04 closes: v50-07-05 (Sentry alarms + manual UAT + ship-to-band) → milestone audit → v5.0 milestone close.

### Earlier (v50-07 phase scope, kept for context)

Run `/paul:plan` for v50-07 (Migration + kitchen-sink Playwright + cutover — FINAL phase before v5.0 milestone close). Scope per ROADMAP.md:
- **Migration script execution** — run `scripts/migrate-v50.ts` against production Firestore (deferred from v50-04). Backfill song defaults from existing setlist data. Reshape legacy `setlists/{id}.tracks[]` embedded arrays into top-level `tracks/{id}` docs (the v5.0 collection shape v50-05-01 writes to). Idempotent + dry-run + rollback snapshots already wired.
- **Performance-view bridge to top-level tracks/{id}** — surfaced by v50-06-03 audit (Outcome 2). After migration, useSetlistPerformance needs to read from the new collection (currently reads `setlists/{id}.tracks[]`). Mirror SetlistGridHydrator's direct-db.put + useLiveQuery pattern.
- **Playwright kitchen-sink suite** — random edits + airplane-mode toggles + force-quits + cross-tab edits = zero data loss across N runs. Reuse setupTwoWriterRace + SharedRemoteSubscriber + OfflineToggleAdapter patterns from v50-06 property-failures harness.
- **Sentry alarms** on any save-path failure in prod.
- **Manual UAT** with Rabbi Daniel + one band member.
- **Resolve v50-06 self-conflict gap** if real-world airplane-mode patterns demand it (Block B SUMMARY documents the gap; routable as additive feature).
- **Ship to band** — milestone close.

`/ui-ux-pro-max` BLOCKING for APPLY if any UI changes (perf-view bridge likely qualifies). After v50-07 closes, v5.0 milestone is COMPLETE.

## Earlier resume notes (kept for context)

Previously: Run `/paul:plan` for v50-05-04 (iPad / pointer-coarse touch variant + right-click ContextMenu — second polish plan in v50-05). Scope per ARCHITECTURE.md §6.7:
- **Cell dropdowns swap from Radix Popover → Radix Sheet** when `useMediaQuery('(pointer: coarse)')` matches (iPad detection — NOT viewport width; iPad Pro at 1024px is still touch). Affects KeyCell, LeadCell, TypeCell, AddRowPlaceholder, ChartBindPopover, AND the new v50-05-03 BatchActionBar `BulkPopover`.
- **44px minimum touch targets** — bump cell padding from 8px → 12px on touch breakpoints.
- **Drag-handle column wider** (44px → 52px) for tap accuracy.
- **Hover-only affordances** become always-visible OR get long-press equivalents.
- **Right-click ContextMenu** (Radix ContextMenu) on rows + drag handle: "Edit row" (focuses Title cell), "Bind chart" (programmatic ChartBindPopover open), "Duplicate row", "Delete row" (routes through DeleteConfirmProvider).

`/ui-ux-pro-max` BLOCKING for APPLY per SPECIAL-FLOWS.md.

**v50-05 polish split (locked on ROADMAP — formal phase plans, not informal carryover):**
- **v50-05-03** (this plan, awaiting APPLY): Multi-select / batch edit (§6.6) + AlertDialog swap-in for window.confirm.
- **v50-05-04** (next after 03): iPad / pointer-coarse touch variant (§6.7) + right-click ContextMenu (Radix ContextMenu on rows + drag handle).
- **v50-05-05** (after 04): Mobile stacked-card flow (§6.11) + WCAG AA audit (§6.13) + Undo via zustand temporal middleware.

**Out-of-v50-05 deferrals (sent to v50-06+):**
- §6.9 reconciliation modal + expectedUpdatedAt tracking + cross-tab-lock flake fix → v50-06
- Cross-leader live-edit visibility → v50-06
- Production migrate-v50.ts apply → v50-07
- Production smoke verification of v50-05-02 cutover → user backlog (deferred-smokes #4)

Constraint reminder: band is **not** in production right now (waiting on dependability), so broken-for-band periods during the rewrite are acceptable. No parallel-editor scaffolding needed. v50-05 is the phase the user signed up for: app intentionally broken-for-band during cutover.

## Phase order (for context)

1. ✓ Recursive research (complete, 2026-04-13)
2. ✓ Phase 1.1 — Concurrent-edit safety (complete, 2026-04-13)
3. ✓ Phase 1.2 — Offline truthiness (complete, 2026-04-13)
4. ✓ Phase 1.3 — Security hardening (complete, 2026-04-13)
5. ✓ Phase 2 — Weekly workflow polish (complete, 2026-04-13 — 4 plans: save-reliability, wizard polish, dashboard polish, editor polish)
   **▶ Next: Phase 3 — Stage UX for the band (/ui-ux-pro-max required)**
5. Phase 2 — Weekly workflow polish (expanded scope, /ui-ux-pro-max)
6. Phase 3 — Stage UX for the band (expanded, /ui-ux-pro-max)
7. Phase 4 — Editor ergonomics + noise cleanup (expanded, /ui-ux-pro-max)
8. Phase 5 — Navigation + schedule hygiene (expanded, /ui-ux-pro-max)

## Phase 1.3 scope (ready to plan)

Three small independent items from FINDINGS.md:

1. **Commit `storage.rules`** mirroring the Firestore `isMember()` gate for `library/**`; add to `firebase.json`; CI dry-run check. Currently deployed rules exist in the Firebase console only — invisible to version control. Wave 2 confirmed: `match /library/{allPaths=**}` → `read: if request.auth != null`, `write: if false`. Tightening to `isMember()` via custom claim brings Storage in line with Firestore.

2. **Bridge setup-code entropy + rate limit.** `/api/bridge/setup-code` GET returns the raw `FIREBASE_PRIVATE_KEY` to anyone presenting a valid 6-char code (~30 bits). Raise entropy to 10+ chars (50+ bits) and tighten the rate-limit tier specifically for this endpoint.

3. **Rate-limit `/api/nudge-admin` and `/api/scheduling/calendar-feed/[token]`.** Add `checkRateLimit` (pattern already used elsewhere).

Estimated effort: ~4h total.

## Accumulated context (key facts)

### v4.2 theme
Weekly-workflow friction + stage UX + noise cleanup before the band is onboarded. **No per-musician scheduling features** (blockout/availability/auto-assign all dropped). Publish-and-notify emails, MusicianPicker, and the assignment RSVP flow **do** stay.

### Required skill
`/ui-ux-pro-max` mandatory for Phases 2–5. Not needed for 1, 1.1, 1.2, 1.3 (backend / plumbing / security).

### What shipped in Phase 1.1 (Concurrent-edit safety)
- `StaleWriteError` + `updateSetlistWithVersion` helper in `src/lib/setlist-firebase.ts`
- `updateSetlist` + `swapTrack` rewired through `runTransaction` with `expectedUpdatedAt` precondition
- `use-setlist-logic` subscribes to the setlist doc; silent-merges when no pending edits; surfaces banner when stale
- `SetlistChangedBanner` with "Keep my changes" / "Take remote"
- Migration: `scripts/backfill-setlist-rev.ts` stamped 10 legacy docs on prod; idempotent
- 5 new tests
- **Two-tab smoke test still pending human verification**

### What shipped in Phase 1.2 (Offline truthiness)
- New IndexedDB blob store: `src/lib/offline-idb.ts` — putFile / getFile / hasFile / listFileIds / clearAll / totalBytes
- `use-offline.ts` rewritten to actually persist bodies and report honest outcomes (all-success / partial / all-failure toasts)
- `cache-utils` + `offline-manager` + `prefetch` all re-pointed at IDB
- `PDFOverlay` resolves URL to `URL.createObjectURL(blob)` when the file is in IDB
- Added `fake-indexeddb` to devDependencies
- Zero `caches.*` + zero `only-if-cached` callers remain in `src/`
- 13 new tests; full suite 1102/1102
- **Fresh-browser offline smoke test still pending human verification**

### What shipped in v4.1 (prior milestone, 2026-04-13)
- Removed `isPublic` from the whole app (type, schema, service signature, Firestore queries, API routes)
- One-shot migration `scripts/migrate-remove-isPublic.ts` stripped 25/26 setlists on prod; idempotent confirmed
- Regression-guard test "never writes isPublic to Firestore"
- **Production smoke test (create setlist via all 4 paths, verify cross-user visibility) still pending human verification**

### Deferred human smoke tests (running list)
1. **v4.1**: create setlists via wizard / chat / import / transfer on prod; confirm second user sees them.
2. **Phase 1.1**: open same setlist in 2 tabs, make conflicting edits, confirm banner or silent-merge behavior.
3. **Phase 1.2**: fresh incognito; no "offline ready" pills; pre-load a setlist; confirm blobs in IDB; DevTools Offline; charts render.
4. **v50-05-02 (cutover)**: open a real setlist on prod; confirm SetlistGrid renders existing tracks in order + SyncIndicator "Saved"; edit a Title cell + Tab → Saving → Saved; hard-refresh → edit persisted; click ChartCell on unbound row → ChartBindPopover opens → pick a song → ChartCell switches to bound (indigo). Mobile viewport functional-but-rough OK (touch polish → v50-05-04).
5. **v50-05-03 (multi-select + AlertDialog)**: open a real setlist on prod with ≥3 tracks; Cmd/Ctrl-click drag handle on row 0 → indigo accent + aria-pressed; Shift-click drag handle on row 2 → rows 0/1/2 all selected; sticky BatchActionBar appears with "3 rows selected"; click Key dropdown → pick Dm → all 3 rows update + SyncIndicator transitions Saved; click Delete → "Delete 3 rows?" AlertDialog opens → click Cancel → rows intact; re-trigger + Delete → 3 rows gone + selection clears; press Backspace on a focused drag handle → "Delete row?" AlertDialog with quoted track title in description; Esc closes any selection.
6. **v50-05-04 (iPad/touch + ContextMenu)**: open prod /setlists/[id] on iPad (or Chrome devtools Device Toolbar → iPad); tap Key cell → bottom Sheet appears (NOT floating Popover); tap LeadCell, TypeCell, AddRow, ChartBind, BatchActionBar bulk Type/Key/Lead — all swap to Sheet on touch. Drag-handle column visibly wider (52px vs 44px desktop); cells visibly taller (44px+ touch targets). Right-click any row on desktop → ContextMenu with 4 items (Edit row / Bind chart / Duplicate row / Delete row); click Edit → Title cell focuses; click Bind chart → ChartBindPopover opens; click Duplicate → row clones below source with all fields; click Delete on a NON-selected row → "Delete row?" AlertDialog with quoted title; multi-select 2+ rows + right-click selected → "N rows selected" header + Edit/Bind/Duplicate disabled + Delete → "Delete N rows?" AlertDialog. iPad: long-press a row 500ms without moving → ContextMenu opens; quick tap → no menu; tap-and-drag → no menu (drag activates).
7. **v50-05-05 (mobile + Undo + WCAG AA)**: open prod /setlists/[id] in a phone viewport (≤767px or Chrome devtools iPhone) → cards instead of table; tap card → full-screen edit Sheet with title/key/bpm/lead/notes/type form fields + Move up / Move down / Bind chart / Delete row buttons; long-press card 500ms → action menu (Edit/Bind/Duplicate/Delete with selection-aware semantics if multi-selected). On desktop: edit a Title cell → blur → Cmd-Z (Mac) or Ctrl-Z (Windows) → title reverts; Cmd-Shift-Z redoes. Bulk-set Key on 3 selected rows → Cmd-Z reverts all 3 in one step. Delete a row → Cmd-Z re-inserts the row with all its fields. Cmd-Z while focused inside a TextCell input runs native field undo (NOT editor undo). Manual Lighthouse audit on /setlists/[id] (target Accessibility ≥ 95).
8. **v50-06-02 (reconciliation modal)**: open prod /setlists/[id] in two browser windows (same setlist, signed in as same user). In window A: edit Key on row 0 from F → G + Tab → SyncIndicator Saving → Saved. In window B (still showing F): edit Key on row 0 from F → A + Tab → SyncIndicator transitions to "Conflict — review" + reconciliation modal opens with card showing row 0's title + diff "Key: Your version A / Their version G" + radio default 'theirs'. Click "Keep mine" + "Resolve all and save" → modal closes + SyncIndicator Saving → Saved + window A's live-query updates row 0's key to A. Repeat to produce another conflict, then click "Cancel" → modal closes + SyncIndicator stays "Conflict — review" + clicking the indicator action button re-opens modal with same conflict. With modal open, press Esc → modal closes + indicator stays + outbox row preserved. (Optional) Edit a different row in window B while in conflict → that edit also queues + modal still shows only row 0 conflict.

### Git state
Recent commits on `master` (v50-04 commits not yet pushed at time of writing — phase close + push pending):
- `12bb330` — chore(deps): bump inngest 3.52.3 → 3.54.0 (CVE)
- `d13da61` — feat(v50-04): migrate-v50.ts — Firestore song-defaults backfill
- `d73e891` — feat(v50-04): sticky-memory helpers — seed + debounced propagate
- `58d2725` — feat(v50-04): Dexie v→2 — additive defaults + recent on songs
- `695bd1f` — chore(paul): archive handoff 2026-04-26 (consumed on resume)
- (v50-03 commits pushed 2026-04-26: 9df0a1a + 0a94a9c + 6cf34d7 + cb73dcc)
- (v50-02 commits pushed 2026-04-26: 65231a6 + baf8109 + 9059d91 + 4737214)

Branch: `master` — **5 commits ahead of `origin/master`** as of UNIFY mid-execution. Phase close commit (covers .paul/ artefacts) lands next, then `git push origin master`.

Pre-existing local drift (`package.json` 2.11.12 → 2.13.1, `src/build-info.json`) was discarded with `git checkout -- package.json src/build-info.json` since it was not from this session and no decision was made to keep the version bump.

Working tree: **clean.** Ready for context clear.

### Key repo locations
- Planning root: `sheet-music-app/.paul/`
- Current phase plans live at `.paul/phases/<NN>-<slug>/<NN>-PP-PLAN.md`
- FINDINGS.md (scope source for Phases 1.3+): `.paul/phases/01-recursive-research/FINDINGS.md`
- Research waves: `.paul/phases/01-recursive-research/WAVE-{1,2}-*.md`
- Migration scripts: `sheet-music-app/scripts/*.ts` (run with `npx tsx`)
- Firebase admin creds: `.env.local` (`FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`)

### User preferences (durable)
- Push to `origin master` (not `master:main`)
- Deploy straight to production on Vercel; no preview branches
- User works from multiple computers — pull before starting
- Must be "bulletproof and easy and intuitive" before onboarding band

## Decisions

| Decision | Phase | Impact |
|----------|-------|--------|
| 2026-04-27: v51-01 picker-rework checkpoint = `tabs-suppress` (Radix Tabs for Major/Minor + suppress ChartBind keyboard on touch) | v51-01-01 | Symmetric "no keyboard until deliberate tap" across all 6 dropdown sites; shadcn Tabs primitive already vendored; defaultValue inferred from current cell value (ends-in-m → Minor, else → Major) |
| 2026-04-13: Auth path for /api/setlist/flush — keepalive fetch (Bearer) over sendBeacon (no headers) | Phase 2 P01 | sendBeacon dropped; keepalive fetch sole transport for unload-flush |
| 2026-04-13: /api/setlist/flush rate-limit tier — shared `api` (60/min) | Phase 2 P01 | No new tier; flush shares user's general-api budget |
| 2026-04-14: S02 bridge-cred approach = Option A (audit-log + admin email on redemption) | v4.3 P3-01 | Fast detection over credential wrapping; accepts bridge-machine compromise as out-of-scope; Option C (IAM per-install) deferred until multi-congregation |
| 2026-04-26: v5.0 milestone scope expanded mid-checkpoint to amputate AI chat + live-swap UI | v50-01 | New v50-02 (Dead-code amputation) phase inserted before sync engine; 6 → 7 phases total; phase dirs renumbered; net deletion ~3,000 LOC scheduled before any new code lands |
| 2026-04-26: Stack locked — Dexie + hand-rolled outbox; TanStack Table v8 (headless) + @dnd-kit + Radix Popover + cmdk | v50-01 | v50-03 sync engine implementer builds on Dexie; v50-05 editor implementer builds on TanStack Table v8 + custom cells; LiveStore/RxDB/AG-Grid Community/hand-rolled all explicitly rejected with rationale |
| 2026-04-26: Sticky song memory granularity = per-song global (not per-leadMusician, not per-rabbi) | v50-01 | Simplest model; matches user statement that key/lead/BPM should "move with the track everywhere"; per-track override preserved at add-time so prior setlists don't change retroactively |
| 2026-04-26: Doc-in-IDB = normalized rows + LWW per-document (not JSON-blob, not CRDT) | v50-01 | Single-leader workflow; CRDT overkill at +50KB and migration complexity; normalized rows enable indexed queries (library picker fuzzy-search etc.) |
| 2026-04-26: Migration approach = one-shot in-place + idempotent + dry-run + rollback snapshots | v50-01 | Band not in production; downtime allowed; cheaper than parallel-collection or lazy-migration strategies designed for live users |
| 2026-04-26: AI chat assistant deleted entirely (no replacement) | v50-02 | User did not use feature; removed before editor rewrite to shrink surface area; ~−1,786 LOC |
| 2026-04-26: Live-swap UI deleted (replaced by real-time setlist sync from existing/new sync engine) | v50-02 | Over-engineered v3.0/v4.0 surface; replacement is implicit from leader-edits-propagate-via-Firestore; ~−515 LOC |
| 2026-04-26: swapTrack() function + liturgicalSlot field deleted | v50-02 | Backed retired live-swap feature; zero callers after Task 2; firestore.rules already had no swap-specific carve-outs (prior teardown) |
| 2026-04-26: openai npm dep + template-parser.ts left as orphans | v50-02 | Out of strict amputation scope; deletion is safe but should be its own dependency-cleanup task |
| 2026-04-26: Per-doc drain ordering — block later rows when an earlier (collection,docId) row is sending/failed/not-yet-due | v50-03 | LWW per-document correctness: a transient failure on row N cannot let row N+1 same-doc leapfrog. Fix discovered by property test counterexample; throughput tradeoff acceptable |
| 2026-04-26: Auth refresh + retry happens IN-LOOP (single drain pass) | v50-03 | Cleaner than re-queuing with attempts=1; second-attempt result resolves directly to Idle/Failed |
| 2026-04-26: FakeClock injection > vi.useFakeTimers for Dexie-touching tests | v50-03 | vi races with fake-indexeddb microtask scheduling; manual FakeClock + macrotask flush is deterministic. Pattern documented in test files for v50-04..v50-06 reuse |
| 2026-04-26: Property test numRuns = 20 (not 100) | v50-03 | Per-scenario cost ~600ms; harness deadlocks above ~30 in current shape. 20 sufficient for class-of-bug coverage; soak runs can crank higher |
| 2026-04-26: Sticky-memory debounce default = 1000ms (overridable via opts) | v50-04 | Matches ARCHITECTURE.md §4.3 explicitly; v50-05 editor inherits this default; tests use shorter values via clock injection |
| 2026-04-26: Migration core abstracted behind MigrationFirestore interface | v50-04 | Tests run without firebase-admin SDK; CLI adapter wires the real one; FIELD_DELETE_SENTINEL Symbol maps to FieldValue.delete(). Pattern reusable for future migration scripts |
| 2026-04-26: Orphan-track filter applied to BOTH dry-run AND apply paths | v50-04 | Honest dry-run counts; caught by failing test where dry-run reported 4 candidates while apply only wrote 3 (the silent skipped orphan). Hoisted existence check above mode branch |
| 2026-04-26: Schema bumps to v(2) are additive non-indexed only; new indexed fields require v(3) | v50-04 | Lookups happen by id; over-indexing wastes IDB. Pattern carries to v50-05/06 |
| 2026-04-26: inngest CVE bump (3.52.3 → 3.54.0) shipped as standalone chore commit, not bundled with v50-04 features | v50-04 close | Clean blame; matches v50-02 dep-cleanup-deferral precedent |
| 2026-04-26: expectedUpdatedAt left undefined on v50-05 track updates | v50-05-01 | Honest LWW precondition tracking requires editor to maintain last-server-confirmed updatedAt per row; deferred to v50-06 where the reconciliation modal also lands. Engine still drains writes; conflicts surface there |
| 2026-04-26: Delete confirmation uses window.confirm; AlertDialog deferred | v50-05-01 | Inject point (`confirmDeleteWithTitle` prop) preserved so v50-05-03 can swap to Radix AlertDialog without re-plumbing call sites |
| 2026-04-26: Drag-end test path = pure-function `computeReorderUpdates` not pointer/keyboard simulation | v50-05-01 | jsdom KeyboardSensor activation is layout-fragile; pointer-event simulation needs `@dnd-kit/test-utils` setup. Pure function unit-tested at function level; Playwright drag verification is a v50-05-03 candidate |
| 2026-04-26: Track field `leadMusician` ↔ helper field `lead` aliased at the cell layer (not in helpers) | v50-05-01 | Helpers stay generic; editor cells handle the boundary. Pattern documented; future cells follow same alias rule |
| 2026-04-26: Engine boot lives in `init.ts` mounted via LazyClientComponents (next/dynamic ssr:false) | v50-05-01 | Engine is app-scoped, not editor-scoped. v50-05-02 route swap doesn't touch engine wiring; cross-tab lock leases work correctly with single instance per session |
| 2026-04-26: vitest.config.ts testTimeout 5s → 10s | v50-05-01 | engine.test.ts AC-4 ran ~622ms standalone but tipped over the 5s default once v50-05 grid tests joined the parallel queue. 10s leaves headroom without masking real perf regressions |
| 2026-04-26: ProductionFirestoreAdapter writes track docs as top-level Firestore `tracks/{id}` collection | v50-05-01 | Architecturally aligned with `LocalCollection = 'setlists' | 'tracks' | 'songs'`. v50-05-01 SetlistGrid is unmounted in prod so no orphan tracks docs accumulate; v50-07 migration reshapes existing setlist.tracks[] arrays to match |
| 2026-04-26: @dnd-kit/modifiers (restrictToVerticalAxis) NOT added | v50-05-01 | verticalListSortingStrategy already constrains the actual ordering; the modifier only constrains the visual preview transform. Avoid new dep; visual-drift polish → v50-05-03 if needed |
| 2026-04-26: Dexie hydration architecture = Option A (SetlistGridHydrator wrapper with initialServerData props) | v50-05-02 | Server-fetch happens in the Server Component; client Hydrator primes Dexie idempotently before SetlistGrid mounts. Direct db.put (NOT applyEdit) — server data is authoritative, not dirty. No extra round trip; clean separation of read/write |
| 2026-04-26: Multi-select wired to drag handle (NOT row body); plain click stays for drag, Shift/Cmd/Ctrl + click routes to selection | v50-05-03 | Per ARCHITECTURE.md §6.6; cell click → focus/edit semantics untouched. Drag activation already gated by PointerSensor delay:150 + tolerance:5 so quick clicks don't activate drag |
| 2026-04-26: useGridSelection.extendRange REPLACES selection (Sheets convention); anchor moves with each toggle | v50-05-03 | Inclusive range from anchor to clicked id; subsequent Shift-clicks extend from most recent toggle. Matches Sheets/Excel/VS Code; users build additive selection via Cmd-clicks instead |
| 2026-04-26: Selection PRESERVED across bulk-set; CLEARED on bulk-delete | v50-05-03 | Bulk-set is iterative ("change Key, then Lead"); bulk-delete is terminal. User can change multiple fields on the same selection without re-selecting |
| 2026-04-26: BatchActionBar V1 columns = Type / Key / Lead / Delete (BPM bulk-set deferred) | v50-05-03 | Mockup shows Type+Lead+Delete; spec text says key/lead/bpm. Chose practical superset minus BPM (rare bulk action). Toolbar fits in one row at standard widths; future polish can add BPM if user demands |
| 2026-04-26: KEY_OPTIONS_DATA + TYPE_OPTIONS exported from cell files (not extracted to shared module) | v50-05-03 | Cells own the canonical list; toolbar reuses via import. Lighter than a separate cell-options module; future bulk affordances follow same pattern; extraction can happen later if a third caller appears |
| 2026-04-26: DeleteConfirmProvider via React context + Radix AlertDialog + Promise-based confirm() | v50-05-03 | Page.tsx is a Server Component; render-prop children would hit serialization boundary. Context wraps cleanly: server renders `<Provider><Hydrator/></Provider>` → client provider mounts dialog → consumers read via hook |
| 2026-04-26: DeleteConfirmProvider uses cancel-and-replace (not queue) for double-confirm | v50-05-03 | Predictable for the rare case; queueing reserved for future if double-confirm flows surface in real usage. Tested explicitly: opening confirm B while A is open resolves A as false |
| 2026-04-26: ConfirmInfo discriminated union (`{kind:'row',title}` \| `{kind:'bulk',count}`) — new prop `confirmDelete` co-exists with legacy `confirmDeleteWithTitle` | v50-05-03 | Avoids string-parsing "N rows" back out of synthesized title. Precedence: prop confirmDelete → prop confirmDeleteWithTitle → context → window.confirm. Tests bypass provider via prop injection; production gets themed dialog |
| 2026-04-26: aria-pressed + aria-label override placement AFTER `{...attributes}` spread on dnd-kit-wrapped buttons | v50-05-03 | useSortable.attributes injects its own aria-pressed for drag state, silently overriding app-level aria-pressed. Discovered via failing test (aria-pressed=null despite correct selection state). Pattern: any future drag-kit-wrapped element with custom aria semantics MUST place overrides after the spread |
| 2026-04-26: useGridSelection.pruneTo added beyond original PLAN (surgical stale-row removal) | v50-05-03 | PLAN said "clear-and-rebuild"; pruneTo is cleaner — removes stale ids while preserving survivors and a still-valid anchor. Pattern carries to v50-05-05 mobile + v50-06 reconciliation modal |
| 2026-04-26: Touch detection via `useMediaQuery('(pointer: coarse)')` (NOT viewport width) | v50-05-04 | iPad Pro at 1024px is still touch; viewport-based detection misses it AND over-triggers on resized desktop browsers. Reusable detection pattern for any future touch-aware affordance |
| 2026-04-26: Single TouchOrPopover wrapper for all 6 dropdown swap sites | v50-05-04 | Symmetry — same wrapper, same pattern, six consumers (DropdownCell covering Key/Lead/Type, AddRowPlaceholder, ChartBindPopover, BatchActionBar's BulkPopover). asChild flows through to both Popover.Trigger and SheetTrigger preserving trigger-button refs unchanged |
| 2026-04-26: ChartBindPopover hybrid open state (controllable+uncontrolled) | v50-05-04 | External `open` prop wins when defined; internal useState fallback when undefined. Single component serves v50-05-02 ChartCell-click flow AND v50-05-04 ContextMenu programmatic-open flow without prop pollution. Reusable for any future shared popover |
| 2026-04-26: Drag column width via class override (not inline style from getSize) | v50-05-04 | TanStack Table's getSize → inline style overrides classes. Omit inline style for drag column specifically and use Tailwind arbitrary-class overrides on both `<th>` and `<td>`. Pattern reusable for any column needing responsive width |
| 2026-04-26: ContextMenu actions live in SetlistGrid (not SortableRow) | v50-05-04 | Selection state is at grid level (useGridSelection); single-vs-bulk routing decisions need access. SortableRow stays selection-state-naive — receives 4 callback props per row + isInBulkSelection boolean. Clean separation; routing centralized |
| 2026-04-26: Disabled-on-multi-selection for Edit / Bind chart / Duplicate row ContextMenu items | v50-05-04 | These don't make semantic sense on multi-selection (focus single Title cell, bind one chart for many rows, duplicate single row). Bulk Duplicate deferred to future BatchActionBar feature. Delete stays enabled because bulk-delete IS the natural action |
| 2026-04-26: Long-press for touch via synthetic contextmenu MouseEvent dispatch | v50-05-04 | @radix-ui/react-context-menu 2.2.16 has NO controlled `open` prop on Root. Re-emit `new MouseEvent('contextmenu', {...})` on the trigger element — Radix's internal listener catches and opens at the dispatched position. Pattern reusable for any uncontrolled Radix primitive that listens for a specific event |
| 2026-04-26: Long-press timing 500ms hold + 10px-squared movement threshold; touch-only branch | v50-05-04 | 500ms is standard mobile-OS long-press duration. 10px² (=100, hypot avoidance) tolerance lets steady touch fire even with slight drift; movement past it indicates drag intent. pointerType='mouse' skip prevents slow desktop clicks from triggering — ContextMenu has natural right-click path on desktop |
| 2026-04-26: Real timers (NOT vi.useFakeTimers) for long-press component tests | v50-05-04 | Reinforces v50-03 lesson — fake timers conflict with fake-indexeddb microtask scheduling and Dexie live-query teardown. 500ms × N test cases adds ~Ns to suite — cheap. Pattern: REAL timers > FakeClock when waiting for setTimeout-based handlers in component tests |
| 2026-04-26: Global window.matchMedia stub via vitest setupFiles | v50-05-04 | jsdom missing matchMedia broke 44 existing grid tests once TouchOrPopover landed. src/test-setup.ts defaults matches:false (= desktop branch); tests wanting coarse-pointer behavior mock useMediaQuery directly. Pattern reusable for any future jsdom-missing API |
| 2026-04-26: Parallel mobile render path keyed on `(max-width: 767px)` (NOT Tailwind responsive) | v50-05-05 | Existing TanStack Table breaks ~640px; touch semantics differ enough (long-press menu, full-screen Sheet, no inline cell editing) that separate component tree is right. iPad ≥ 768px keeps the table + Sheet-on-coarse from v50-05-04 |
| 2026-04-26: Plain zustand store with manual pushEntry over zundo's temporal middleware | v50-05-05 | Per-cell-blur burst coalescing needs explicit per-action snapshots, NOT state-snapshot-on-every-setter. zundo's wrong granularity. One less dep |
| 2026-04-26: applyEdit reads prevDoc BEFORE transaction, pushes snapshot AFTER commit (gated by withoutUndo) | v50-05-05 | Failed writes leave no phantom undo entries. withoutUndo escape hatch for engine-internal cascades + the undo handler replaying inverses. Reusable opt-in/opt-out pattern for v50-06 reconciliation |
| 2026-04-26: Composite undo entries for bulk-set / bulk-delete / drag-end / Duplicate row | v50-05-05 | One user gesture = one undo step. Snapshot prevDocs first, fire applyEdit({withoutUndo:true}) fanout, push ONE composite entry. Per-doc drain ordering from v50-03 keeps each doc's outbox serialized |
| 2026-04-26: INPUT/TEXTAREA/SELECT/contenteditable skip for global Cmd-Z at SetlistGrid root | v50-05-05 | Native field undo wins when typing into a form field. Same skip set as v4.2 P2-04 + v50-05-03 Esc handler. Documented as reusable pattern for any future global shortcut |
| 2026-04-26: WCAG AA via jest-axe at component-test level — ZERO violations on first run | v50-05-05 | 7 axe scan cases + 1 keyboard Tab case; axeOpts disables 5 harness-context false positives (region/landmark-one-main/page-has-heading-one + aria-required-children/parent for grid role). Design system internalized correctly across v50-05-01..05; no in-place fixes needed |
| 2026-04-26: zundo dep NOT added (planned inline, confirmed at apply-time) | v50-05-05 | Plain zustand was the right shape. Matches v50-02 / v50-04 / v50-05-04 dep-cleanup-deferral precedent |
| 2026-04-26: Cross-tab-lock flake fixed in TEST only; production primitive untouched | v50-06-01 | Root cause was a brittle "lower tabId wins" assertion firing on sequential tryAcquire — only valid in true async race. Fix added deferred-delivery hub variant + split tests + 50-iter stress loops. Production cross-tab-lock.ts unchanged across v50-06; reconciliation modal (v50-06-02) coordinates through the same well-tested primitive |
| 2026-04-26: FirestoreAdapter contract — commitOutboxRow → Promise<CommitResult{updatedAt?}> | v50-06-01 | Optional updatedAt: delete ops have no resulting doc; test fakes opt out; production opts in via post-commit getDoc re-read. Forward-compatible — new adapters add updatedAt as they learn server timestamps |
| 2026-04-26: ProductionFirestoreAdapter re-reads doc post-commit (one extra getDoc per write) | v50-06-01 | serverTimestamp() is sentinel until commit; client-side Timestamp.now() would diverge from server-authoritative. v50-06-02 reconciliation depends on freshness; refactor (batching / client-side) is local if profiling later flags it |
| 2026-04-26: Engine writeback inside SAME Dexie tx as outbox-row delete; if(existing) guard | v50-06-01 | Atomicity: outbox row must not vanish without local row reflecting new server state. if(existing) prevents resurrection if user pressed Backspace mid-flight. Per-doc drain ordering (v50-03) + 'sending' row reset on engine.start() cover crash-mid-writeback |
| 2026-04-26: Inverse-replay (Cmd-Z) reads LIVE updatedAt at undo-time, not snapshot-time | v50-06-01 | Remote write since entry was pushed should make inverse fail with VersionMismatch (v50-06-02 surfaces it). Snapshot-time updatedAt would let undo silently overwrite newer remote state. Undo is a real edit for precondition purposes |
| 2026-04-26: handlePickSong defaults patch passes expectedUpdatedAt: undefined (justified inline) | v50-06-01 | Row was just created locally via set; first server commit hasn't echoed updatedAt yet; engine treats undefined as "no precondition". First server commit installs updatedAt; subsequent edits pick it up via live-query row |
| 2026-04-26: LocalTrack + LocalSong gained explicit updatedAt?: number (was hidden behind index sig) | v50-06-01 | TS inferred unknown for track.updatedAt, blocking direct passthrough. Explicit field keeps type narrow without breaking open-ended schema. Forward-friendly — updatedAt is now first-class across all three local doc types |
| 2026-04-26: Two-tab race-detection harness — SharedRemote + per-engine LocalDb + distinct lock channels | v50-06-01 | Reusable pattern for v50-06-02 modal integration tests + v50-06-03 cross-leader live-edit scenarios. Distinct channels prevent cross-tab single-leader deferral, allowing both engines to drain |
| 2026-04-26: Reconciliation modal granularity = per-row "Keep mine / Take theirs" (NOT per-field) | v50-06-02 | Substrate API engine.resolveConflict(localId, 'mine'\|'theirs', opts) is per-row; per-field would require new engine surface OR UI-side merge plumbing — neither warranted in v1. Diff display still per-field (informational); only the choice is per-row. Matches GitHub/Figma merge UX conventions; per-field deferred to v50-06-03+ as additive feature if conflict patterns prove granular merge needed |
| 2026-04-26: Snapshot listener bypasses applyEdit + outbox (direct db.put) | v50-06-03 | Going through applyEdit would create a feedback loop (server delivery → outbox row → engine drain → re-write → server delivery). Server data is authoritative; engine drain remains the only write path. Mirrors SetlistGridHydrator's idempotent priming pattern for live deliveries |
| 2026-04-26: Outbox-pending guard via .filter() table-scan (not compound index) | v50-06-03 | Outbox is small in practice (<~50 rows); compound index would force a Dexie v(3) schema bump per the v50-04 'additive non-indexed only at v(2)' rule. Filter scan negligible vs. schema migration cost |
| 2026-04-26: Snapshot listener mounts in SetlistGridHydrator (per-route lifetime), NOT init.ts (app-global) | v50-06-03 | Per-route lifetime matches setlistId scope; init.ts stays for app-global concerns (engine + adapter). Future route consumers (perf view post-v50-07) opt in the same way via prop or hook |
| 2026-04-26: Snapshot listener errors swallowed + warn-logged, never throw out of callback | v50-06-03 | Firestore can transiently throw permission-denied / unavailable; engine drain is source of truth; listener outage is invisible to correctness. Best-effort visibility; never blocks user |
| 2026-04-26: SnapshotSubscriber test-seam interface over wrapping firebase/firestore directly | v50-06-03 | Component tests inject hand-rolled fakes (deliverSetlist / deliverTracks / raiseSetlistError / raiseTracksError) — no firebase mocks, no module mocking gymnastics. Production wiring is a 30-line factory inside the same module. Pattern reusable for any future server-authoritative live data feature |
| 2026-04-26: Manual onlineListener test harness for FSM offline→idle transition | v50-06-03 | Engine FSM doesn't auto-flip from 'offline' on isOnline()=true alone — needs NETWORK_ONLINE event. Test harness collects 'online' callbacks + manually fires them on reconnect; cleaner than jsdom window event dispatch. Reusable for any future offline-flow scenario |
| 2026-04-26: Block B (sequential offline drain) drops expectedUpdatedAt threading from PLAN AC-5 | v50-06-03 | Single-writer offline sequential edits with threaded preconditions self-conflict on reconnect (rows 2..N's baseline=initial, server=ts1, → VersionMismatch). Test isolates per-doc ordering invariant from that gap; gap documented + routed forward as additive plan if real-world airplane-mode patterns demand fixing |
| 2026-04-26: Perf-view audit Outcome 2 — defer migration + read-side bridge to v50-07 | v50-06-03 | useSetlistPerformance reads legacy setlists/{id}.tracks[]; v50-05-01 writes top-level tracks/{id}; production split-brain is acceptable per band-not-in-production constraint; v50-07 is the migration phase. Routed forward as explicit deliverable, not "nice-to-have" |
| 2026-04-26: /ui-ux-pro-max optional in v50-06-03 — no UI surface modified | v50-06-03 | Task 1 (listener) + Task 2 (harness) are backend / test-only. Task 3 mounts listener inside hydrator (data-layer wiring; no rendered output change) + audits perf view (read-only research; Outcome 2 lands no code). SPECIAL-FLOWS.md "frontend UI/UX touch" trigger not met by data-layer wiring alone. Documented as precedent for future similarly-scoped plans |

## Session Continuity

Current session: 2026-04-26 (v50-06-03 full cycle — cross-leader live-edit + airplane-mode + perf-view audit; phase v50-06 close) — `/paul:resume` (consumed HANDOFF-2026-04-26-v50-06-03-pickup.md, archived) → `/paul:plan` v50-06-03 → `/paul:apply` (Task 1 startSnapshotListener module + tests → Task 2 property-failures harness extension → Task 3 hydrator listener mount + perf-view audit + smoke test) → push origin master → `/paul:unify` (this SUMMARY + STATE + ROADMAP + PROJECT sync). 4 task commits + close commit. Suite 1442/1442 (+11 from 1431); tsc + next build clean. Cross-leader live-edit shipped end-to-end: startSnapshotListener subscribes to setlists/{id} + tracks where setlistId == X via onSnapshot; writes deliveries directly to Dexie via db.put with outbox-pending + LWW guards; mounted in SetlistGridHydrator post-hydration with cleanup on unmount. SnapshotSubscriber test-seam interface for unit tests. Property-failures harness extended with passive-listener-closes-'theirs'-staleness-gap + sequential-offline-drain-in-order describe blocks. Performance-view audit landed Outcome 2: useSetlistPerformance reads legacy embedded `setlists/{id}.tracks[]` array; v50-05-01 writes top-level tracks/{id}; production data split-brain; routed forward to v50-07 migration as explicit deliverable. Phase v50-06 COMPLETE 3/3 plans.
Stopped at: PAUSED at v50-06 phase close (clean checkpoint). v50-07 (migration + kitchen-sink Playwright + cutover — FINAL phase before milestone close) ready to plan in fresh session.
Next action: in fresh session: `git pull origin master`, then `/paul:resume` to load handoff and route to `/paul:plan` for v50-07. /ui-ux-pro-max BLOCKING for APPLY if perf-view bridge lands UI changes (likely yes).
Resume file: `.paul/HANDOFF-2026-04-26-v50-07-pickup.md` (to be created via /paul:pause)
Git strategy: master (continuing v50 hard-cutover convention; band still not in production).
Resume context (v50-07 — final phase):
- Scope: production migration script execution (`scripts/migrate-v50.ts` deferred from v50-04 — backfill song defaults + reshape legacy `setlists/{id}.tracks[]` arrays into top-level `tracks/{id}` docs; idempotent + dry-run + rollback snapshots already wired); performance-view bridge to top-level tracks/{id} (audit Outcome 2 routed forward); Playwright kitchen-sink suite (random edits + airplane-mode toggles + force-quits + cross-tab edits = zero data loss); Sentry alarms; manual UAT with Rabbi Daniel + one band member; ship to band.
- Substrate ready (v50-06): atomic writes (v50-06-01); user-visible conflict resolution (v50-06-02); cross-leader live-edit visibility + 'theirs' staleness auto-closure + per-doc drain ordering validated under offline (v50-06-03). The bulletproof loop is end-to-end.
- Reusable patterns: setupTwoWriterRace + SharedRemoteSubscriber + OfflineToggleAdapter (property-failures.test.ts); SnapshotSubscriber test-seam (snapshot-listener.test.ts); FirestoreAdapter.readDoc for one-shot remote views; manual onlineListener harness for FSM transitions; SetlistGridHydrator's direct-db.put + listener-mount-post-hydration template for the perf-view bridge.
- Production smoke verifications #4-#9 still pending (deferred backlog #4 v50-05-02 cutover, #5 v50-05-03 multi-select, #6 v50-05-04 iPad+ContextMenu, #7 v50-05-05 mobile+Undo+WCAG, #8 v50-06-02 reconciliation modal, #9 v50-06-03 cross-leader live-edit + airplane-mode); not blocking v50-07.
- Single-writer offline self-conflict gap documented in v50-06-03 SUMMARY — routable as additive feature if real-world airplane-mode patterns demand fixing.

Last session: 2026-04-26 (v50-06-02 full cycle — reconciliation modal §6.9) — `/paul:resume` (consumed HANDOFF-2026-04-26-v50-06-02-pickup.md, archived) → `/paul:plan` v50-06-02 → `/paul:apply` (decision checkpoint resolved per-row-now → Task 1 substrate+provider → Task 2 property-failures branches → Task 3 component+jest-axe) → push origin master (Vercel deployed `dpl_CfYCNcHuAaD4kUCoHoY2KdWwZN5V`) → `/paul:unify` (this SUMMARY + STATE + ROADMAP sync). 4 task commits + close commit. Suite 1431/1431 (+13 from 1418); tsc + next build clean. Reconciliation modal end-to-end: ReconciliationProvider mounted at /setlists/[id], engine 'conflict' → blocking AlertDialog → per-row "Keep mine / Take theirs" → engine.resolveConflict → drain. FirestoreAdapter.readDoc shipped; property-failures harness extended with both resolution branches; jest-axe ZERO violations.

Last session: 2026-04-26 (v50-06-01 full cycle — substrate stabilization)

Last session: 2026-04-26 (v50-06-01 full cycle — substrate stabilization) — `/paul:resume` → `/paul:plan` v50-06-01 → `/paul:apply` (Task 1 cross-tab-lock flake fix → Task 2 adapter+engine writeback+cell threading → Task 3 two-writer race test) → `/paul:unify` → push origin master → `/paul:pause` (this handoff). 5 commits: `9ca4943` (chore PLAN), `5736599` (Task 1 deflake), `0ce9bd2` (Task 2 substrate), `edfc339` (Task 3 race test), `fc368ef` (chore close loop). Full suite 1418/1418 (+8 from 1410); tsc + next build clean. v50-06-01 substrate stabilization COMPLETE: cross-tab-lock test deterministic (30/30); adapter returns updatedAt; engine writeback atomic with `if(existing)` guard; expectedUpdatedAt threaded through every track-update applyEdit call site (16 sites); two-writer race produces VersionMismatchError end-to-end with addressable failed outbox row.
Stopped at: PAUSED at v50-06-01 close (clean plan boundary). v50-06-02 (reconciliation modal §6.9) ready to plan in fresh session.
Next action: in fresh session: `git pull origin master`, then `/paul:resume` to load handoff and route to `/paul:plan` for v50-06-02. /ui-ux-pro-max BLOCKING for APPLY (frontend modal UI).
Resume file: `.paul/HANDOFF-2026-04-26-v50-06-02-pickup.md`
Git strategy: master (continuing v50 hard-cutover convention; band still not in production).
Resume context (v50-06-02):
- Scope per ARCHITECTURE.md §6.9: "Remote changed — keep mine / take theirs" reconciliation banner/modal subscribed to engine's DRAIN_VERSION_MISMATCH event (FSM state 'conflict'); reads failed-status outbox row + remote doc to render diff; routes user choice through `engine.resolveConflict(localId, choice, { newExpectedUpdatedAt })`.
- Substrate ready (v50-06-01): engine.getState() reaches 'conflict' via two-writer race; failed-status outbox rows have localId + lastError + payload + expectedUpdatedAt populated; cross-tab-lock primitive verified deterministic (30/30); `wireSyncEngineToStore` channel exposes (state, queued, lastError) via `onStateChange`.
- Reusable patterns: `<DeleteConfirmProvider>` provider/dialog template for `<ReconciliationProvider>`; jest-axe + axe-core a11y scan infra; undo-store pushEntry for "user's resolution choice = own undo unit"; flushAllBursts for synchronous flush before state read; SharedRemote + TwoWriterAdapter harness extensible for modal integration tests.
- `/ui-ux-pro-max` BLOCKING for APPLY per SPECIAL-FLOWS.md.
- Suggested 2-3 task split (revisable at /paul:plan time): (1) ReconciliationProvider + AlertDialog modal subscribing to 'conflict' state + diff render; (2) wire user choice through engine.resolveConflict() + integration tests for both 'mine' / 'theirs' branches; (3) a11y scan + keyboard nav + cross-tab follow-leader semantics.
- Production smoke verification of v50-05-02..v50-05-05 still pending (deferred-smokes #4-#7); not blocking v50-06-02.
- Cross-leader live-edit + airplane-mode + perf-view audit → v50-06-03.
- Production migrate-v50.ts apply → v50-07.
- Edge case to surface if it manifests: mid-flight delete + Cmd-Z (inverse hits missing-row error in undo-store).

Prior session: 2026-04-26 (v50-05-05 full cycle + phase v50-05 close) — `/paul:plan` → `/paul:apply` (Task 1 mobile stacked-card flow + Task 2 Undo via plain zustand store [zundo deferred] + Task 3 WCAG AA audit via jest-axe with ZERO violations) → push origin master → `/paul:unify` (this SUMMARY + STATE + ROADMAP + PROJECT sync) → phase v50-05 transition. 4 commits: `b23fae1` (chore PLAN), `3e19bf0` (Task 1), `2260a21` (Task 2), `e2f1daa` (Task 3). Phase close commit lands next. Full suite 1410/1410; tsc + next build clean. Phase v50-05 (Spreadsheet editor UI cutover) COMPLETE across 5 plans: v50-05-01 build → v50-05-02 cutover → v50-05-03 multi-select+AlertDialog → v50-05-04 iPad+ContextMenu → v50-05-05 mobile+Undo+WCAG. Production /setlists/[id] now serves desktop + iPad + phone audiences with full feature parity, accessibility-clean by jest-axe, with Cmd-Z undo end-to-end.
Stopped at: PAUSED at phase v50-05 close (clean checkpoint). Context budget at 90% — v50-06 deserves fresh session.
Next action: in fresh session: `git pull origin master`, then `/paul:resume` to load handoff and route to `/paul:plan` for v50-06. /ui-ux-pro-max BLOCKING for APPLY (frontend changes expected — §6.9 reconciliation modal).
Resume file: `.paul/HANDOFF-2026-04-26-v50-06-pickup.md`
Git strategy: master (continuing v50 hard-cutover convention; band still not in production).
Resume context (v50-06):
- Scope per ARCHITECTURE.md §6.9 + v50-05 deferrals: "Remote changed — keep mine / take theirs" reconciliation banner via local-first IDB diff; expectedUpdatedAt tracking on track updates (deferred from v50-05-01); cross-tab-lock test flake fix (substrate for concurrent-edit safety); cross-leader live-edit visibility (real-time setlist sync — replacement for deleted v50-02 live-swap UI); two-tab + airplane-mode test scenarios.
- Reusable from v50-05: undo-store pushEntry pattern (each conflict resolution = own undo unit); applyEdit's withoutUndo flag for any reconciliation-internal writes; composite-undo fan-out pattern; flushAllBursts for synchronous flush before state read; jest-axe + axe-core test infrastructure for any new modal a11y scans; TouchOrPopover wrapper / useGridSelection / DeleteConfirmProvider / ChartBindPopover all carry forward.
- Cross-tab-lock test flake (1410/1410 latest run, but historically intermittent) MUST be root-caused before shipping concurrent-edit safety — same lock primitive is the substrate.
- Production smoke verification of v50-05-02 + v50-05-03 + v50-05-04 + v50-05-05 still pending (deferred-smokes #4-#7); not blocking v50-06.
- Production migrate-v50.ts apply still deferred to v50-07.
Git strategy: master (continuing v50-05 hard-cutover convention; band still not in production)
Resume context (v50-05-05 — last plan in v50-05):
- v50-05-05 scope per ARCHITECTURE.md §6.11 + §6.13 + Undo:
  - **§6.11 Mobile stacked-card flow** (below 768px): drop the table entirely and render rows as stacked cards (title + key + lead visible at rest); tap card → full-screen Sheet with all-fields edit pane; reorder via long-press + drag OR up/down buttons in the sheet. Parallel render path (NOT a Tailwind responsive trick) since the existing table breaks ~640px.
  - **§6.13 WCAG AA audit**: run axe-core / Lighthouse against /setlists/[id] on prod; verify focus-trap on all popovers (cmdk inside Popover.Content); keyboard-only navigation across cells + add-row + chart-bind + delete; aria-live announcement timing for SyncIndicator state changes; color contrast ratio ≥ 4.5:1 for all SyncIndicator states.
  - **Undo via zustand temporal middleware**: wrap a small zustand store around local Dexie writes; intercept BEFORE applyEdit; record (op, collection, docId, prevDoc, newDoc) snapshot per undo unit; Cmd/Ctrl-Z replays the inverse via applyEdit (NOT direct db.put — inverse should round-trip to Firestore); coalesce burst edits per cell-blur; cap 50 undo entries; not persisted across reloads (Dexie is the persistence layer).
- Reusable from v50-05-04:
  - `<TouchOrPopover>` wrapper for any per-card sheet on mobile flow.
  - `useGridSelection` hook (selection state survives the parallel mobile render path; pruneTo + extendRange still apply).
  - `<DeleteConfirmProvider>` already mounted at /setlists/[id]; ContextMenu Delete + bulk Delete + single-row Delete all flow through.
  - `<ChartBindPopover>` controllable open state for any future programmatic-open consumer (e.g. mobile flow's "Bind chart" button).
  - Synthetic-contextmenu-dispatch programmatic-open pattern documented inline in SortableRow's long-press handler.
  - Global window.matchMedia stub in src/test-setup.ts for any future test that touches useMediaQuery.
  - 44px-min touch target Tailwind class pattern (`[@media(pointer:coarse)]:<utility>`) reusable across mobile cards.
- Real timers (NOT vi.useFakeTimers) for any timer-driven Undo middleware tests — fake timers conflict with fake-indexeddb microtask scheduling and Dexie live-query teardown (v50-05-04 lesson, building on v50-03 lesson).
- `/ui-ux-pro-max` BLOCKING for APPLY per SPECIAL-FLOWS.md.
- Plan size: 2-3 tasks, vertical slices preferred. Suggested split (revisable at /paul:plan time):
  - Task 1 — Mobile stacked-card flow + per-card Sheet edit pane.
  - Task 2 — Undo via zustand temporal middleware + Cmd/Ctrl-Z handler + applyEdit-inverse round-trip.
  - Task 3 — WCAG AA audit (axe-core / Lighthouse) + any focus-trap / keyboard-nav fixes surfaced.
- Production smoke verification of v50-05-02 + v50-05-03 + v50-05-04 still pending from user (deferred-smokes list #4, #5, #6). Not blocking v50-05-05.
- Cross-tab-lock test flake still pending — fold into v50-06.
- Production migrate-v50.ts apply still deferred to v50-07.
Resume context:
- v50-05 spec is locked in ARCHITECTURE.md §6 (TanStack Table v8 headless + @dnd-kit + Radix Popover + cmdk; design tokens §6.1; desktop/iPad/phone variants; WCAG AA §6.13)
- §6.9 "Remote changed" reconciliation banner → defer to v50-06 (concurrent-edit safety phase)
- Helpers ready: `import { seedTrackFromSong, propagateTrackEditToSong } from '@/lib/songs/defaults'`
- Sync engine is the write path; new editor calls `applyEdit('update', 'tracks', ...)` etc.
- `/ui-ux-pro-max` BLOCKING for APPLY (not PLAN) per SPECIAL-FLOWS.md
- App intentionally broken-for-band during cutover (acceptable per milestone constraint)
- Pre-existing cross-tab-lock flake → fold into v50-06 fix
- migrate-v50.ts production apply still deferred to v50-07 cutover
- Plan should split into multiple plans if scope exceeds 3 tasks; vertical slices preferred per plan-format.md
Git strategy: master (no feature branch this phase — hard cutover constraint accepts broken-for-band)
Resume context:
- v50-05 spec is locked in ARCHITECTURE.md §6 (spreadsheet editor UX with TanStack Table v8 + @dnd-kit + Radix Popover + cmdk; design tokens from §6.1; desktop/iPad/phone variants; WCAG AA)
- Helper module `@/lib/songs/defaults` is ready: import seedTrackFromSong/propagateTrackEditToSong directly into the new editor's add-song and cell-commit paths
- Sync engine (v50-03) is the write path; new editor calls `applyEdit('update', 'tracks', ...)` etc. The legacy `setlist-firebase.ts` + `use-setlist-logic.ts` + `SetlistEditorV2.tsx` etc. are the surface to delete (~−8,400 LOC)
- /ui-ux-pro-max is REQUIRED per SPECIAL-FLOWS.md — APPLY will be blocked otherwise
- App will be intentionally broken-for-band during this phase (acceptable per milestone constraint)
- Pre-existing cross-tab-lock flake → fold into v50-06 fix
- migrate-v50.ts production apply still pending (deferred to v50-07 cutover)
Resume context:
- v50-04 spec is locked in ARCHITECTURE.md §4 (per-song global `defaults: { key, lead, bpm }` + `recent[]` cap 5)
- Dexie schema needs version bump to v2 (additive: index `defaults` is not needed, but adding fields)
- Backfill script `scripts/migrate-v50.ts` (dry-run + idempotent + rollback snapshots in `migrations/v50/snapshot/{songId}`)
- All `songs/*` writes route through `applyEdit('update', ...)` — engine + outbox already handle the rest
- No UI work in v50-04; that's v50-05 (which will need /ui-ux-pro-max)
- Test pattern: FakeClock injection, NOT vi.useFakeTimers (per v50-03 lesson — fake-indexeddb microtask race)
- Per-doc ordering invariant is now engine contract — preserve it

Prior session (2026-04-26): Two phases shipped — v50-01 Architecture (commit `4fb05c6`); v50-02 Dead-code amputation (`4737214` + `9059d91` + `baf8109`, net −2,363 LOC, 1281/1281 green); phase close commit `65231a6`; state-sync `e5a36dd`.

v50-03 task commits (this session):
- `cb73dcc` — feat(v50-03): IDB schema + atomic applyEdit (Dexie foundation)
- `6cf34d7` — feat(v50-03): sync engine — FSM, retry, cross-tab lock, status store
- `0a94a9c` — test(v50-03): property-based no-data-loss harness (fast-check)

Outstanding from prior session (2026-04-18): Firestore rules deployment — verify `firebase deploy --only firestore:rules` has landed before Phase v45-01 ships.

Setlist SEUI audit: after gig wraps, pull `setlists/SEUI/history` subcollection + Sentry breadcrumbs to determine which of Bugs A–D fired (silent-merge / stale-loop / flush-fail / never-hit-server). Informs Phase v45-01 test scenarios.
Resume file: `.paul/HANDOFF-2026-04-18.md`
Resume context:
- Fixed `updateSetlist` using `stripUndefinedDeep` instead of `stripUndefined` (was crashing on nested track undefined values)
- Added `system/globalAlert` Firestore rule (was hitting deny-all fallback)
- Added `tune` + `pageNumber` to `flush-schema.ts` strict write-boundary
- 1324/1324 tests green; tsc clean
- This local machine missing `.env.local` (full build fails on env vars — not a code issue)
- Firebase CLI not yet installed on this machine

Tonight's auth-incident commit chain (for context on resume):
- c7dff08 fix(setlists): gate subscription on authUser.uid — kept (clean fix; eliminates pre-auth false-alarm)
- 945478b hotfix(proxy): relax role-less redirect — kept (patch; supersede via Plan 09-02)
- 2fb2db6 fix(auth): post-popup token+cookie prime + window.location.replace — superseded by d3d0466
- d3d0466 fix(auth): switch to signInWithRedirect — REVERTED in 7446a08 (needs Firebase Hosting auth handler we don't have on Vercel)
- 7446a08 revert: back to signInWithPopup with original simple body — current state on prod, both admin + musician verified working

Net code state: signInWithPopup (vanilla), proxy role-redirect relaxed, setlists subscription gated on authUser.uid. Plan 09-02 will replace the proxy patch with a server-signed companion cookie.

## v4.3 Phase Progress (6 of ~10 P0 closed)
- ✓ Phase 1 (audit — 83 findings)
- 2/3 Phase 2 security triage: S01 ✓ chat prompt injection, S03 ✓ drive file proxy, S02 pending (decision needed)
- 2/3 Phase 4 data integrity: D03 ✓ assign race, D02 ✓ flush strict schemas, D01 pending
- 2/4 Phase 5 bugs+UX: B01 ✓ reportSaveError, B02 ✓ alert-store init guard, U01 pending, U02 pending
- Phases 3, 6–8 not started

## Session scoreboard (this chat session)
- 6 P0 audit findings closed: S01, S03, D03, D02, B01, B02
- 7 new lib modules: chat-prompt, drive-file-auth, scheduling-merge, save-error, flush-schema (+ 2 test-only)
- 47 new regression tests (9 chat + 12 drive + 8 merge + 4 save-error + 11 flush-schema + 3 alert-store)
- 25 commits on origin/master (all pushed; Vercel auto-deploying)
- Zero production regressions
- 1 Vercel build failure caught + hotfixed (route.ts export rule — memory saved in feedback_nextjs_route_exports.md)
Resume context:
- Phase 4 closed: 6 atomic commits (P4-01 through P4-06) + audit note (P4-07)
- Suite 1153 green; tsc clean; 1 pre-existing env-vars test failure unrelated and untouched
- All commits on origin/master, auto-deployed to Vercel prod
- Phase 5 is the only remaining v4.2 milestone phase; band onboarding gate
- Must load /ui-ux-pro-max before any Phase 5 APPLY (per SPECIAL-FLOWS.md)
- Pull before starting (user works from multiple computers)

---
*STATE.md — Updated after every significant action*
