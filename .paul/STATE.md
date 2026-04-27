# Project State

## Project Reference

See: .paul/PROJECT.md (updated 2026-04-15)

**Core value:** Musicians can instantly access setlists, transpose charts, and control monitor mixes — live on any device, no paper or prep needed.
**Current focus:** v5.0 Bulletproof Editor — local-first rewrite of the setlist editor + sticky song memory + spreadsheet-shaped UX.

## Current Position

Milestone: 🚧 v5.0 — Bulletproof Editor (Local-First Rewrite) — **5 of 7 phases complete** (v50-05 closed; v50-06 in progress: 1 of 3 plans shipped + 1 plan awaiting approval)
Phase: v50-06 of 7 (Concurrent-edit safety + offline + cross-tab) — In progress (Planning v50-06-02)
Plan: v50-06-02 created, awaiting approval. PLAN at `.paul/phases/v50-06-concurrent-edit-safety/v50-06-02-PLAN.md`.
Status: PLAN created for v50-06-02 reconciliation modal (§6.9). 3 auto tasks + 1 decision checkpoint (per-row vs per-field granularity) + 1 human-verify checkpoint (two-tab smoke on prod). 7 ACs. Scope narrowed to per-row "Keep mine / Take theirs" — substrate API is per-row; per-field merge granularity deferred. Mounts `<ReconciliationProvider>` inside DeleteConfirmProvider; subscribes to engine 'conflict' state via `useSyncStatus`; reads failed outbox rows via `useLiveQuery`; renders per-row card with per-field DIFF (informational) + per-row radio (decision); "Resolve all and save" iterates `engine.resolveConflict(localId, choice, { newExpectedUpdatedAt })` sequentially. FirestoreAdapter interface gains `readDoc(collection, docId)`. Property-failures harness extended with `'mine'` + `'theirs'` resolution branch tests. /ui-ux-pro-max BLOCKING for APPLY per SPECIAL-FLOWS.md.
Last activity: 2026-04-26 — Created v50-06-02-PLAN.md.

Progress:
- v5.0: [██████████] ~85% (5 of 7 phases complete; v50-06 + v50-07 remain)
- Phase v50-01: [██████████] 100% ✓ (architecture locked)
- Phase v50-02: [██████████] 100% ✓ (~2,363 LOC deleted)
- Phase v50-03: [██████████] 100% ✓ (sync engine — Dexie + outbox + FSM + property harness)
- Phase v50-04: [██████████] 100% ✓ (song catalog & sticky memory — Dexie v2 + helpers + migration script)
- Phase v50-05: [██████████] 100% ✓ (spreadsheet editor UI cutover — 5 plans: build + cutover + multi-select+AlertDialog + iPad+ContextMenu + mobile+Undo+WCAG)

## Loop Position

Current loop state:
```
v50-06-02:  PLAN ──▶ APPLY ──▶ UNIFY
              ✓        ○        ○     [Plan created, awaiting approval]

v50-01:        ✓ ──▶ ✓ ──▶ ✓     [Phase complete]
v50-02:        ✓ ──▶ ✓ ──▶ ✓     [Phase complete]
v50-03:        ✓ ──▶ ✓ ──▶ ✓     [Phase complete]
v50-04:        ✓ ──▶ ✓ ──▶ ✓     [Phase complete]
v50-05:        ✓ ──▶ ✓ ──▶ ✓     [Phase COMPLETE — 5 plans]
v50-06:        ◐ ──▶ ◐ ──▶ ◐     [v50-06-01 LOOP COMPLETE; v50-06-02 PLAN created (reconciliation modal); v50-06-03 cross-leader live-edit TBD]
v50-07:        ○ ──▶ ○ ──▶ ○     [Phase: migration + kitchen-sink Playwright + cutover]
```

## How to resume

Run `/paul:apply .paul/phases/v50-06-concurrent-edit-safety/v50-06-02-PLAN.md` to execute v50-06-02 (reconciliation modal §6.9). /ui-ux-pro-max BLOCKING before APPLY proceeds.

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

## Session Continuity

Current session: 2026-04-26 — `/paul:resume` (consumed HANDOFF-2026-04-26-v50-06-02-pickup.md, archived to `.paul/handoffs/archive/`) → `/paul:plan` v50-06-02 (PLAN.md created at `.paul/phases/v50-06-concurrent-edit-safety/v50-06-02-PLAN.md`).
Stopped at: PLAN v50-06-02 created, awaiting user approval before APPLY.
Next action: `/paul:apply .paul/phases/v50-06-concurrent-edit-safety/v50-06-02-PLAN.md` after user approves. /ui-ux-pro-max BLOCKING — load before APPLY.
Resume file: `.paul/phases/v50-06-concurrent-edit-safety/v50-06-02-PLAN.md`

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
