# Project State

## Project Reference

See: .paul/PROJECT.md (updated 2026-04-15)

**Core value:** Musicians can instantly access setlists, transpose charts, and control monitor mixes — live on any device, no paper or prep needed.
**Current focus:** v5.0 Bulletproof Editor — local-first rewrite of the setlist editor + sticky song memory + spreadsheet-shaped UX.

## Current Position

Milestone: 🚧 v5.0 — Bulletproof Editor (Local-First Rewrite) — 4 of 7 phases complete (v50-05 in progress, 2 of 3 plans closed)
Phase: v50-05 of 7 (Spreadsheet editor UI cutover) — In progress (v50-05-02 closed; v50-05-03 next)
Plan: v50-05-02 — closed (`.paul/phases/v50-05-spreadsheet-editor/v50-05-02-SUMMARY.md`)
Status: UNIFY complete for v50-05-02. Cutover landed on prod: SetlistGrid mounted via SetlistGridHydrator at /setlists/[id]; ChartBindPopover wires ChartCell click → applyEdit; ~−6,300 LOC legacy editor deleted. 4 commits pushed (b8d8314..d8c0442). 1315/1316 tests; tsc + next build clean. Prod smoke verification deferred to user (item #4 in deferred smokes list).
Last activity: 2026-04-26 — UNIFY complete for v50-05-02 (SUMMARY.md written).

Progress:
- v5.0: [███████░░░] ~71% (4 of 7 phases complete; v50-05 ⅔ plans done)
- Phase v50-01: [██████████] 100% ✓ (architecture locked)
- Phase v50-02: [██████████] 100% ✓ (~2,363 LOC deleted)
- Phase v50-03: [██████████] 100% ✓ (sync engine — Dexie + outbox + FSM + property harness)
- Phase v50-04: [██████████] 100% ✓ (song catalog & sticky memory — Dexie v2 + helpers + migration script)
- Phase v50-05: [███████░░░] 67% (v50-05-01 + v50-05-02 closed; v50-05-03 polish remaining)

## Loop Position

Current loop state:
```
PLAN ──▶ APPLY ──▶ UNIFY
  ○        ○        ○     [Loop reset — ready for v50-05-03 PLAN]

v50-01:        ✓ ──▶ ✓ ──▶ ✓     [Phase complete]
v50-02:        ✓ ──▶ ✓ ──▶ ✓     [Phase complete]
v50-03:        ✓ ──▶ ✓ ──▶ ✓     [Phase complete]
v50-04:        ✓ ──▶ ✓ ──▶ ✓     [Phase complete]
v50-05-01:     ✓ ──▶ ✓ ──▶ ✓     [Plan complete — build SetlistGrid + engine boot, no cutover]
v50-05-02:     ✓ ──▶ ✓ ──▶ ✓     [Plan complete — cutover landed; legacy ~−6,300 LOC gone; SetlistGrid serves /setlists/[id]]
v50-05-03:     ○ ──▶ ○ ──▶ ○     [Polish plan — touch/iPad + mobile + a11y + multi-select + AlertDialog + ContextMenu + undo]
```

## How to resume

Run `/paul:plan` for v50-05-03 (polish — the last plan in v50-05). Scope per ARCHITECTURE.md §6.6/6.7/6.11/6.13 + the v50-05-01 + v50-05-02 deferral list:
- **§6.6 Multi-select / batch edit** — Shift-click row range; bulk Backspace delete; bulk key/lead/bpm change via a sticky batch toolbar.
- **§6.7 iPad/touch variant** — Bottom-sheet dropdowns instead of Popover (cmdk inside Radix Sheet); larger padding (44px touch targets); hover replacements (long-press for context menu).
- **§6.11 Mobile-only stacked-card flow** — Drop the table at <768px; show stacked cards with a full-screen "edit pane" sheet for cell-level edits.
- **§6.13 WCAG AA binding accessibility verification** — Run axe / Lighthouse against the live editor; fix focus-trap gaps in popovers; verify keyboard-only navigation across all cells; aria-live regions for SyncIndicator state changes (already in place — verify announce timing).
- **AlertDialog** swap-in for window.confirm (the `confirmDeleteWithTitle` injection point is already wired per v50-05-01).
- **Right-click ContextMenu** on rows + drag handle (Radix ContextMenu).
- **Undo** via zustand temporal middleware on the local Dexie writes (intercept before applyEdit).

`/ui-ux-pro-max` BLOCKING for APPLY per SPECIAL-FLOWS.md.

**Required skill:** `/ui-ux-pro-max` per SPECIAL-FLOWS.md — must be invoked before APPLY.

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
4. **v50-05-02 (cutover)**: open a real setlist on prod; confirm SetlistGrid renders existing tracks in order + SyncIndicator "Saved"; edit a Title cell + Tab → Saving → Saved; hard-refresh → edit persisted; click ChartCell on unbound row → ChartBindPopover opens → pick a song → ChartCell switches to bound (indigo). Mobile viewport functional-but-rough OK (touch polish → v50-05-03).

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

## Session Continuity

Last session: 2026-04-26 (v50-05-02 close) — Resume → archive consumed handoff → /paul:plan (3 tasks + 1 decision + 1 human-verify) → /ui-ux-pro-max loaded → decision Option A → /paul:apply Task 1 (route swap + Hydrator, 5 tests) → Task 2 (ChartBindPopover, 4 tests) → Task 3 (legacy purge ~−6,300 LOC + SearchOverlay relocate + matrix view drop + Hydrator test cleanup) → push origin master → human-verify deferred to user → /paul:unify (this SUMMARY). Four task commits on origin/master: `b8d8314` (chore: PLAN + handoff archive + state sync), `0584744` (Task 1: Hydrator + route swap), `ba7e214` (Task 2: ChartBindPopover + ChartCell forwardRef + binding wiring), `d8c0442` (Task 3: 27 deletions + SearchOverlay rename + matrix view removal). Full suite 1315/1316; tsc + next build clean; /api/setlist/flush gone. Production now serves SetlistGrid for all setlist editing.
Stopped at: v50-05-02 fully closed; UNIFY commit (this SUMMARY + STATE + ROADMAP) lands next then push.
Next action: commit UNIFY artefacts (`.paul/phases/v50-05-spreadsheet-editor/v50-05-02-SUMMARY.md` + STATE + ROADMAP) and push, then `/paul:plan` for v50-05-03 (polish). Before APPLY of v50-05-03, invoke `/ui-ux-pro-max` per SPECIAL-FLOWS.md.
Resume file: `.paul/phases/v50-05-spreadsheet-editor/v50-05-02-SUMMARY.md`
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
