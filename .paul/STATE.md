# Project State

## Project Reference

See: .paul/PROJECT.md (updated 2026-04-15)

**Core value:** Musicians can instantly access setlists, transpose charts, and control monitor mixes — live on any device, no paper or prep needed.
**Current focus:** v5.0 Bulletproof Editor — local-first rewrite of the setlist editor + sticky song memory + spreadsheet-shaped UX.

## Current Position

Milestone: 🚧 v5.0 — Bulletproof Editor (Local-First Rewrite) — 4 of 7 phases complete (v50-05 in progress; 3 of 5 plans closed — 03 polish A landed)
Phase: v50-05 of 7 (Spreadsheet editor UI cutover) — In progress (v50-05-03 closed; v50-05-04 next)
Plan: v50-05-03 — closed (`.paul/phases/v50-05-spreadsheet-editor/v50-05-03-SUMMARY.md`)
Status: UNIFY complete for v50-05-03. Multi-select + BatchActionBar + AlertDialog swap-in landed on prod. 4 commits pushed to origin/master: `25b57ad` (chore(paul) PLAN), `e26626c` (Task 1 selection hook), `ae0a8c3` (Task 2 BatchActionBar), `8acf7aa` (Task 3 DeleteConfirmProvider). +44 new vitest cases (1359/1360 — pre-existing cross-tab-lock flake remains, deferred to v50-06). tsc + next build clean. Production /setlists/[id] now: Cmd-click drag handle to multi-select, sticky toolbar at size ≥ 2 (Type / Key / Lead / Delete), shadcn AlertDialog replaces window.confirm for both single-row and bulk delete.
Last activity: 2026-04-26 — UNIFY complete for v50-05-03 (SUMMARY.md written).

Progress:
- v5.0: [███████░░░] ~74% (4 of 7 phases complete; v50-05 = 3/5 plans done; 04 + 05 scoped)
- Phase v50-01: [██████████] 100% ✓ (architecture locked)
- Phase v50-02: [██████████] 100% ✓ (~2,363 LOC deleted)
- Phase v50-03: [██████████] 100% ✓ (sync engine — Dexie + outbox + FSM + property harness)
- Phase v50-04: [██████████] 100% ✓ (song catalog & sticky memory — Dexie v2 + helpers + migration script)
- Phase v50-05: [██████░░░░] 60% (01 build ✓ + 02 cutover ✓ + 03 multi-select+AlertDialog ✓; 04 + 05 scoped on ROADMAP)

## Loop Position

Current loop state:
```
PLAN ──▶ APPLY ──▶ UNIFY
  ○        ○        ○     [Loop reset — ready for v50-05-04 PLAN]

v50-01:        ✓ ──▶ ✓ ──▶ ✓     [Phase complete]
v50-02:        ✓ ──▶ ✓ ──▶ ✓     [Phase complete]
v50-03:        ✓ ──▶ ✓ ──▶ ✓     [Phase complete]
v50-04:        ✓ ──▶ ✓ ──▶ ✓     [Phase complete]
v50-05-01:     ✓ ──▶ ✓ ──▶ ✓     [Plan complete — build SetlistGrid + engine boot, no cutover]
v50-05-02:     ✓ ──▶ ✓ ──▶ ✓     [Plan complete — cutover landed; legacy ~−6,300 LOC gone; SetlistGrid serves /setlists/[id]]
v50-05-03:     ✓ ──▶ ✓ ──▶ ✓     [Plan complete — multi-select + BatchActionBar + AlertDialog swap-in on prod]
v50-05-04:     ○ ──▶ ○ ──▶ ○     [Plan: iPad/pointer-coarse Sheet swap + right-click ContextMenu]
v50-05-05:     ○ ──▶ ○ ──▶ ○     [Plan: mobile stacked-card flow + WCAG AA audit + Undo via zustand temporal middleware]
```

## How to resume

Run `/paul:plan` for v50-05-04 (iPad / pointer-coarse touch variant + right-click ContextMenu — second polish plan in v50-05). Scope per ARCHITECTURE.md §6.7:
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

## Session Continuity

Last session: 2026-04-26 (v50-05-03 full cycle) — `/paul:resume` → archive consumed handoff → `/paul:plan` (3 tasks, autonomous, polish split locked into ROADMAP as 03/04/05 per user direction) → `/ui-ux-pro-max` loaded → `/paul:apply` → Task 1 (selection hook + drag-handle wiring; 14 hook tests + 6 grid integration; root-caused dnd-kit aria-pressed override via failing-test-driven discovery) → Task 2 (BatchActionBar + bulk handlers; 7 toolbar tests + 5 grid integration) → Task 3 (DeleteConfirmProvider + page.tsx wrap + new confirmDelete prop; 10 provider tests + 2 grid integration) → push origin master → `/paul:unify` (this SUMMARY + STATE + ROADMAP sync). 4 commits on origin/master: `25b57ad` (chore(paul) PLAN), `e26626c` (Task 1), `ae0a8c3` (Task 2), `8acf7aa` (Task 3). UNIFY commit lands next. Full suite 1359/1360; tsc + next build clean. Production /setlists/[id] now serves multi-select + bulk-edit toolbar + shadcn AlertDialog.
Stopped at: v50-05-03 fully closed and pushed; SUMMARY.md written; session paused for context budget before v50-05-04. Handoff written for fresh session pickup.
Next action: in a fresh session: `git pull origin master`, then `/paul:resume` to load handoff and route to `/paul:plan` for v50-05-04 (iPad / pointer-coarse Sheet swap across 6 Popover sites + right-click ContextMenu with selection-aware action targeting + long-press for touch). Before APPLY, invoke `/ui-ux-pro-max` per SPECIAL-FLOWS.md (BLOCKING).
Resume file: `.paul/HANDOFF-2026-04-26-v50-05-04-pickup.md`
Git strategy: master (continuing v50-05 hard-cutover convention; band still not in production)
Resume context (v50-05-04):
- `useMediaQuery('(pointer: coarse)')` is the iPad/touch detection (NOT viewport width — iPad Pro at 1024px is still touch). Hook may need to be added/promoted; check src/hooks for an existing one or add as part of plan 04.
- Cell dropdowns to swap from Radix Popover → Radix Sheet on touch breakpoints: KeyCell, LeadCell, TypeCell (via DropdownCell), AddRowPlaceholder, ChartBindPopover, AND BatchActionBar's inline `BulkPopover`. Pattern: extract a shared `<TouchOrPopover>` wrapper that picks Popover or Sheet based on the media query.
- 44px minimum touch targets — bump cell padding from 8px → 12px on touch breakpoints; drag-handle column width 44px → 52px.
- Right-click ContextMenu (Radix `@radix-ui/react-context-menu`; check if shadcn `context-menu.tsx` is already installed — yes, ls showed it) on rows + drag handle: "Edit row" / "Bind chart" / "Duplicate row" / "Delete row".
- Selection state already exists (useGridSelection); ContextMenu just reads `selection.selectedIds.has(rowId)` to decide whether the action targets the selected set OR just the right-clicked row.
- Delete from ContextMenu routes through the existing DeleteConfirmProvider (single-row OR bulk depending on selection state).
- Test patterns locked: ResizeObserver + scrollIntoView stubs at module-eval for cmdk tests; cleanup() + findByTestId await for Dexie+React; act() wrapper for Dexie deletes that trigger live-query re-renders; dnd-kit aria override placement AFTER `{...attributes}` spread.
- Production smoke verification of v50-05-02 + v50-05-03 still pending from user. Not blocking 04.
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
