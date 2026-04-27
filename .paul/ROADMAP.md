# Roadmap: sheet-music-app (CentralReform.live)

## Current Milestone
**v5.0 — Bulletproof Editor (Local-First Rewrite)**
Status: 🚧 In Progress
Phases: 5 of 7 complete
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
| v50-06 | Concurrent-edit safety + offline + cross-tab | TBD | Not started | - |
| v50-07 | Migration, kitchen-sink, cutover | TBD | Not started | - |

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
Plans: TBD

### Phase v50-07: Migration, kitchen-sink, cutover

Focus: One-shot migration script transforms existing Firestore setlists into new shape AND cleans up any orphaned chat / song-groups / liveState data left behind by v50-02 amputation (must be flawless on cutover day — no dual-format support window). Playwright kitchen-sink suite — random edits + airplane-mode toggles + force-quits + cross-tab edits = zero data loss across 100 runs. Sentry alarms on any save-path failure in prod. Manual UAT with Rabbi Daniel + one band member. Ship to band.
Plans: TBD

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
*Last updated: 2026-04-26 (Phase v50-05 COMPLETE — Spreadsheet editor UI cutover shipped end-to-end across 5 plans: build + cutover + multi-select+AlertDialog + iPad+ContextMenu + mobile+Undo+WCAG. Net: ~+13k / −6.3k LOC, +159 vitest cases [1410/1410], jest-axe ZERO a11y violations. v50-06 concurrent-edit safety + offline + cross-tab next.)*
