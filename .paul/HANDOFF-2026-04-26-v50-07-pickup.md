# PAUL Handoff

**Date:** 2026-04-26 (after v50-06 phase close)
**Status:** paused — clean checkpoint at phase boundary (v50-06 closed 3/3; v50-07 final phase ready to plan)

---

## READ THIS FIRST

You have no prior context. This document tells you everything.

**Project:** sheet-music-app (CentralReform.live) — worship band setlist/chart app for Central Reform Congregation.
**Core value:** Musicians can instantly access setlists, transpose charts, and control monitor mixes — live on any device, no paper or prep needed.

---

## Current State

**Milestone:** v5.0 — Bulletproof Editor (Local-First Rewrite) — **6 of 7 phases complete**
**Phase:** v50-07 (Migration, kitchen-sink, cutover) — **next; final phase before v5.0 milestone close**
**Last shipped:** v50-06-03 — Cross-leader live-edit + airplane-mode + perf-view audit (phase v50-06 closed 3/3)

**Loop Position:**
```
PLAN ──▶ APPLY ──▶ UNIFY
  ✓        ✓        ✓     [v50-06-03 LOOP COMPLETE — phase v50-06 closed 3/3]

v50-01..06: ✓✓✓  (all 6 phases shipped)
v50-07:     ○ ──▶ ○ ──▶ ○   [next — FINAL PHASE before milestone close]
```

**Working tree:** clean. **Branch:** master, in sync with origin/master at HEAD = `af91a0d`.

---

## What Was Done (v50-06-03)

Closed the read-side of the local-first sync loop. Production /setlists/[id] now propagates leader-tab edits to follower tabs/devices via Firestore `onSnapshot` listeners that write directly into Dexie — closing the v50-06-02 'theirs' staleness gap automatically and shipping the implicit replacement for the deleted v50-02 live-swap UI.

Commits `50f34b5..af91a0d`:
- `50f34b5` — chore(paul): plan v50-06-03 + archive consumed handoff
- `21d0945` — feat(v50-06-03): startSnapshotListener — Firestore onSnapshot → Dexie (Task 1)
- `19f38b9` — test(v50-06-03): property-failures harness — passive listener + offline drain (Task 2)
- `1e1fe3c` — feat(v50-06-03): mount snapshot listener in SetlistGridHydrator (Task 3)
- `af91a0d` — chore(paul): close loop — v50-06-03 SUMMARY + phase v50-06 close

**Net delivery:**
- New `src/lib/sync/snapshot-listener.ts` (~180 LOC) exporting `startSnapshotListener({ setlistId, db })` — subscribes to `setlists/{id}` + `tracks where setlistId == X` via firebase/firestore onSnapshot; writes deliveries directly into Dexie via `db.{setlists,tracks}.put` (NOT applyEdit — server-authoritative; mirrors SetlistGridHydrator's idempotent priming pattern)
- Two safety guards on every delivery: (1) outbox-pending guard — any outbox row for the docId means a local edit is in flight, skip both put and delete; (2) LWW guard — only put if `remote.updatedAt > local.updatedAt`
- Listener errors swallowed + warn-logged via `opts.logger.warn` — never throws out of callbacks (engine drain remains source of truth)
- Test-seam `SnapshotSubscriber` interface (subscribeSetlist + subscribeTracks) lets unit tests inject hand-rolled fakes — production wires to firebase/firestore in a 30-line factory inside the same module
- Mounted in `SetlistGridHydrator` post-hydration via `useEffect`; new `startSnapshotListener` prop test-seam; cleanup on unmount
- Property-failures harness extended with two new describe blocks: "passive listener closes the 'theirs' staleness gap" + "sequential offline edits queue and drain in order" (5/5 deterministic; F→G→A→B→C drain order validated under realistic airplane-mode flow)
- Performance-view audit landed **Outcome 2**: `useSetlistPerformance` reads legacy `setlists/{id}.tracks[]` embedded array via `useSafeFirestoreSync`; v50-05-01 writes top-level `tracks/{id}` collection; production data is split-brain; routed forward to v50-07 as explicit deliverable
- 4 commits + close commit; suite 1442/1442 (+11 from 1431); tsc + next build clean

**Phase v50-06 outcome (3/3 plans):** the bulletproof loop is end-to-end:
- **Substrate** (v50-06-01): atomic writes; CommitResult{updatedAt?}; expectedUpdatedAt threading; cross-tab-lock determinism
- **Conflict UX** (v50-06-02): ReconciliationProvider; per-row "Keep mine / Take theirs"; FirestoreAdapter.readDoc
- **Cross-leader visibility** (v50-06-03): startSnapshotListener; passive 'theirs' rehydration; per-doc drain ordering under offline scenario

No silent paths remain in either the write OR the read direction.

Full SUMMARY: `.paul/phases/v50-06-concurrent-edit-safety/v50-06-03-SUMMARY.md`

---

## What's In Progress

Nothing — v50-06-03 fully closed at a clean phase boundary. Working tree clean. origin/master in sync at `af91a0d`.

---

## What's Next: Plan v50-07 (Migration + kitchen-sink Playwright + cutover) — FINAL PHASE

### Scope (the last plan-set before v5.0 milestone close)

Per ROADMAP.md + v50-06 deferrals + perf-view audit Outcome 2 routing:

1. **Production `migrate-v50.ts` apply** — execute the existing migration script (deferred from v50-04) against production Firestore. Two concerns:
   - Backfill song defaults from existing setlist data (most-recent-occurrence wins per ARCHITECTURE.md §4)
   - **Reshape legacy `setlists/{id}.tracks[]` embedded arrays into top-level `tracks/{id}` docs** (the v5.0 collection shape v50-05-01 writes to)
   - Idempotent + dry-run + rollback snapshots already wired in `scripts/migrate-v50.ts`; abstract `MigrationFirestore` interface keeps the core admin-SDK-free; setlist-invariance sha256 hash check is the regression guard
   - Run order: `--dry-run` first → review counts → apply → confirm via spot-check → optionally `--rollback` if anything looks wrong
   - **Also** scrubs orphan chat / song-groups / liveState data left behind by v50-02 amputation (production data was left in place per v50-02 close note)

2. **Performance-view bridge to top-level `tracks/{id}`** — surfaced by v50-06-03 audit Outcome 2. After migration, `useSetlistPerformance` needs to read from the new collection (currently reads `setlists/{id}.tracks[]`). Mirror SetlistGridHydrator's pattern:
   - Server-fetch from top-level `tracks/{id}` collection in the perf view's Server Component (or a small adapter that wraps `useSafeFirestoreSync` for the new shape)
   - Optionally mount `startSnapshotListener` so leader edits during a service propagate to the perf view live (pairs naturally with the live-edit story v50-06-03 just shipped)
   - Keep perf view read-only — it has no write path and should not gain one

3. **Playwright kitchen-sink suite** — random edits + airplane-mode toggles + force-quits + cross-tab edits = zero data loss across N runs (target ≥ 100 per ROADMAP.md). Reuse the existing patterns from v50-06's property-failures harness:
   - `setupTwoWriterRace` helper (cross-tab race scenarios)
   - `SharedRemoteSubscriber` (live listener scenarios — extend for 3+ tabs if useful)
   - `OfflineToggleAdapter` (airplane-mode scenarios)
   - `SnapshotSubscriber` test-seam (if Playwright doesn't drive real Firestore the whole way)
   - The Playwright dimension adds: real browser, real DnD, real Cmd-Z keypress, real long-press touch (where supported)

4. **Sentry alarms on save-path failures** in prod. Wire to the existing observability infrastructure (v4.4 P5 request-IDs + chat SSE meta/heartbeat/done). Any `'failed'` outbox row that exhausts retries should fire a Sentry alert tagged with `(collection, docId, lastError, attempts)`.

5. **Manual UAT** with Rabbi Daniel + one band member. Walk through the weekly flow: clone last week's setlist → tweak a few songs → assign musicians → publish → band member receives → opens on tablet → views chart → transposes → on-stage during service. Surface any friction; route to follow-up plans if found.

6. **Ship to band** — milestone close + tag.

### Substrate ready (delivered by v50-06)

- Engine drain path is the sole authority on writes; ReconciliationProvider absorbs every conflict; cross-tab lock is deterministic (30/30)
- `engine.resolveConflict('mine'|'theirs', opts)` API verified deterministic in property-failures harness
- `FirestoreAdapter.readDoc` available for one-shot remote views
- `startSnapshotListener` available for any read-side live consumer (perf view bridge will likely want it)
- `setupTwoWriterRace` + `SharedRemoteSubscriber` + `OfflineToggleAdapter` + `SnapshotSubscriber` patterns are reusable templates for the kitchen-sink scenarios

### Reusable from v50-05 + v50-06

- All v50-05 editor primitives carry forward unchanged
- Property-failures harness's race + offline + listener patterns are the kitchen-sink suite's substrate
- jest-axe + axeOpts (5 disabled rules for harness-context false positives) reusable for any new modal a11y scans
- Real timers (NOT `vi.useFakeTimers`) for any timer-driven test
- SetlistGridHydrator's direct-`db.put` + listener-mount-post-hydration template directly applicable to the perf-view bridge

### Required skill

**`/ui-ux-pro-max` BLOCKING for APPLY** if Task 2 (perf-view bridge) lands UI changes (likely yes — read-side bridge typically affects rendered output) per `.paul/SPECIAL-FLOWS.md`. Migration script execution is backend / scripted — skill not required for Task 1. Playwright kitchen-sink touches no UI directly — skill not required for Task 3. Default to load before APPLY to be safe.

### Suggested plan shape (revisable at /paul:plan time)

v50-07 scope is wider than the prior plans — likely a **multi-plan phase** (3–5 plans), vertical slice preferred:

- **v50-07-01** — `migrate-v50.ts --dry-run` against production + analysis + decision checkpoint to apply (HUMAN-VERIFY required: data is irrevocable on apply)
- **v50-07-02** — `migrate-v50.ts` apply + verification (sha256 invariance + spot-check) + rollback drill on staging if available
- **v50-07-03** — Performance-view bridge to top-level `tracks/{id}` + optional listener mount + read-side polish (`/ui-ux-pro-max` BLOCKING)
- **v50-07-04** — Playwright kitchen-sink suite (random edits + airplane-mode + force-quits + cross-tab; ≥100 runs target)
- **v50-07-05** — Sentry alarms wiring + manual UAT prep + ship-to-band checklist

The plan-by-plan split keeps each apply session under 3 tasks; v50-07-04 (Playwright) may want its own dedicated plan because Playwright setup is its own discipline.

### Edge cases to surface in PLAN

- **Migration must scrub orphan AI-chat / song-groups / liveState data** — v50-02 deleted the *code* but left the *data* in place (per v50-02 close note: "Production data left in place for v50-07 migration to scrub"). The migration script needs an explicit pass for these collections / fields.
- **Migration is irreversible past `--apply`** — rollback snapshots exist per song (`migrations/v50/snapshot/{songId}`) but rebuilding the legacy `setlists/{id}.tracks[]` array shape from the new top-level `tracks/{id}` shape is not a simple inverse. v50-07-01's dry-run + decision checkpoint is the safety gate.
- **Perf view's `useSafeFirestoreSync` is shared infrastructure** — the bridge to the new shape should NOT change `useSafeFirestoreSync` itself (other consumers exist). Either wrap it locally or introduce a small `useTracksForSetlist` hook that mirrors SetlistGridHydrator's pattern.
- **Single-writer offline self-conflict gap** (documented in v50-06-03 SUMMARY) — Playwright kitchen-sink may surface this as a real failure. If so, route to a v50-07 sub-plan or a v6.0 follow-up depending on real-world frequency observed during UAT.
- **Manual UAT may surface unrelated regressions** from the v5.0 rewrite — bandwidth-budget for one buffer plan if needed.

---

## Key Files (for v50-07 to read/extend)

| File | Purpose |
|------|---------|
| `.paul/STATE.md` | Live project state |
| `.paul/ROADMAP.md` | v5.0 phase overview (6/7 phases done; v50-07 final) |
| `.paul/PROJECT.md` | Project facts + decisions table |
| `.paul/SPECIAL-FLOWS.md` | Required-skill registry (`/ui-ux-pro-max` BLOCKING for any frontend APPLY) |
| `.paul/phases/v50-01-architecture/ARCHITECTURE.md` | Migration approach (§4 song defaults; §2 doc model — top-level `tracks/{id}` is the v5.0 shape) |
| `.paul/phases/v50-06-concurrent-edit-safety/v50-06-03-SUMMARY.md` | Latest patterns + perf-view audit Outcome 2 routing |
| `scripts/migrate-v50.ts` | Migration script — `--dry-run` / apply / `--force` / `--rollback` / `--help`; idempotent + sha256 invariance check |
| `src/lib/sync/snapshot-listener.ts` | Listener module — perf-view bridge can reuse for live-edit propagation during a service |
| `src/components/setlist/grid/SetlistGridHydrator.tsx` | Direct-`db.put` + listener-mount template — perf-view bridge mirrors this shape |
| `src/hooks/use-setlist-performance.ts` | Perf-view read path — currently reads legacy `setlists/{id}.tracks[]`; needs bridge to top-level `tracks/{id}` |
| `src/app/perform/setlist/[id]/page.tsx` | Perf-view route |
| `src/lib/sync/__tests__/property-failures.test.ts` | Race + offline + listener patterns — Playwright kitchen-sink template |

---

## Key Context (don't relearn)

- **Band is NOT in production right now.** Broken-for-band periods during v50-07 are still acceptable, but the goal of v50-07 is to land all of v5.0 cleanly so onboarding can begin immediately after.
- **Push to `origin master`** (not `master:main`). Deploy straight to production on Vercel; no preview branches.
- **User works from multiple computers** — `git pull origin master` before starting any session.
- **No feature branches in v50** — hard cutover convention. v50-07 may want a feature branch for the migration drill specifically (rollback drill on staging) — but that's the user's call at /paul:plan time.
- **Migration data is irreversible past `--apply`** — dry-run + decision checkpoint + rollback snapshots are the safety net. v50-07-01 should be its own plan with an explicit human-verify checkpoint.
- **REAL timers > fake timers** for any timer-driven test.
- **Inverse-replay (Cmd-Z) reads LIVE updatedAt at undo-time** — Playwright kitchen-sink scenarios that exercise undo across cross-tab edits may surface conflicts; that's intentional and surfaces correctly via the modal.
- **Outbox-pending guard pattern** (v50-06-03) — any future passive read path that needs to coexist with engine writes should mirror the snapshot-listener's outbox-filter approach.
- **Per-row reconciliation, NOT per-field** — substrate is per-row; per-field is its own future plan if real-world conflict patterns demand it.
- **Single-writer offline self-conflict gap** — sequential same-doc offline edits may surface as self-conflict on reconnect. Documented in v50-06-03 SUMMARY; routable as additive plan if real-world airplane-mode patterns demand fixing.

---

## Outstanding (carryover, not blocking v50-07-01 plan creation)

- **Production smoke verification** of v50-05-02 + v50-05-03 + v50-05-04 + v50-05-05 + v50-06-02 + v50-06-03 — deferred-smokes #4-#9. User backlog. Manual UAT in v50-07-05 supersedes most of these (one walkthrough catches everything in context).
- **Manual Lighthouse audit** on prod /setlists/[id] — added to deferred-smokes #7. jest-axe is the automated proxy. UAT is the manual proxy.
- **`openai` npm dep + `template-parser.ts`** orphans from v50-02 — future dep-cleanup pass. Migration is the natural moment to also clean these up if they don't get touched.
- **`useBatchSelection` hook** orphan from v50-05-02 — future dep-cleanup pass.
- **Sentry deprecation** — `sentry.client.config.ts` → `instrumentation-client.ts` rename. Cosmetic.
- **Mid-flight delete + Cmd-Z edge case** — undo-store's inverse hits missing-row error if a row was deleted between push-time and undo-time. Not yet handled; Playwright kitchen-sink may surface it.
- **Per-field merge granularity** — substrate is per-row; per-field is its own future plan if real-world conflict patterns demand it.
- **Single-writer offline self-conflict gap** — see Key Context above. Worth telemetering during UAT.

---

## Resume Instructions

1. `git pull origin master` (multi-computer workflow).
2. `/paul:resume` — will load STATE, archive this handoff, and route to `/paul:plan` for v50-07-01 (or `/paul:plan` for the v50-07 phase overall, depending on whether the planner wants a top-level phase plan first).
3. **Before writing the v50-07-01 plan:** read `.paul/phases/v50-06-concurrent-edit-safety/v50-06-03-SUMMARY.md` for the perf-view audit Outcome 2 routing; read `scripts/migrate-v50.ts` end-to-end; check whether the script needs an addition for the orphan AI-chat / song-groups / liveState scrubbing pass.
4. **Plan size guidance:** v50-07 likely 3–5 plans (vertical-slice preferred):
   - **v50-07-01** — Migration dry-run + decision checkpoint (HUMAN-VERIFY)
   - **v50-07-02** — Migration apply + verification + rollback drill
   - **v50-07-03** — Performance-view bridge to top-level `tracks/{id}` (`/ui-ux-pro-max` BLOCKING)
   - **v50-07-04** — Playwright kitchen-sink suite (≥100 runs target)
   - **v50-07-05** — Sentry alarms + UAT prep + ship-to-band checklist
5. **Before APPLY** of any plan touching UI: invoke `/ui-ux-pro-max` per SPECIAL-FLOWS.md (BLOCKING).
6. **After v50-07 closes:** v5.0 milestone COMPLETE → `/paul:complete-milestone` to archive ROADMAP + start v6.0 (or whatever the next direction calls for).

---

*Handoff created: 2026-04-26 (after v50-06 phase close at commit `af91a0d`)*
*Pause reason: clean checkpoint at phase boundary — v50-07 is the FINAL phase before v5.0 milestone close, deserves a fresh session with full headroom for the migration drill (irreversible past `--apply`; needs a human-verify checkpoint and rollback rehearsal) plus the perf-view bridge plus the Playwright kitchen-sink suite plus Sentry wiring plus manual UAT prep — multiple plans worth of scope.*
