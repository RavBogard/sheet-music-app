# Handoff — Post-UAT discoveries + next milestone plan

**Created:** 2026-04-27 (during UAT execution; before context clear)
**Read this on /paul:resume.**

## Status

v50-07 phase shipped end-to-end (5/5 plans). v5.0 milestone is **PENDING-UAT**.
Daniel started UAT immediately and surfaced two issues. v5.0 milestone close
is now **BLOCKED on v5.0-hotfix completing first**, then v5.1 for the UX
rework, then `/paul:audit-milestone` to close v5.0.

## UAT findings

### Issue 1 — P0: track-edit save-loss (path "P" confirmed)

**Daniel's exact reproduction:**
1. Created a brand-new setlist (no legacy data → lazy-hydration ruled out)
2. None of the songs have a key listed
3. Edited the key for "Modeh Ani" → set to E
4. Clicked around to other things
5. **Sync indicator at top showed "Saved"**
6. Navigated to any other view in the app
7. Navigated back to the setlist → song still listed; **key totally gone**

So the sync engine reported successful drain, but on re-open the key field
is blank. Path "P" (real save-loss), not "Q" (orphaned setlist).

### Issue 2 — P1: editor UX overhaul

Daniel: *"the setlist editor is really hard to use the way that it is, because
everything is so spread out, every line is the same shade of white, etc... it
needs a total /ui-ux-pro-max rethink for usability"*

Likely overlap with v2.6 P1 dual-tint rows that didn't survive the v50-05
TanStack Table cutover. Plus a density/hierarchy redesign.

## Code-scan diagnostics (already done; don't redo)

What's been ruled out for the save-loss bug:
- Cell commit path is wired correctly (`DropdownCell.onSelect` → `commit(value)`
  → `onCommitTrackPatch` → `applyEdit('update','tracks',{key:newKey},
  expectedUpdatedAt: row.updatedAt)`)
- `applyEdit('update','tracks',...)` does `db.tracks.put(merged)` synchronously
  inside the txn — local Dexie row gets `key=E` immediately, regardless of drain
- `useLiveQuery` query is correct: `db.tracks.where('setlistId').equals(setlistId).sortBy('order')`
- No production code clears Dexie tracks (only `resetDbForTests` exists, test-only)
- Hydrator priming SKIPS for `initialTracks.length === 0` (which is the case
  for new setlists — legacy embedded `tracks[]` array is never populated by v5.0)
- Production adapter uses `runTransaction` with `expectedUpdatedAt` precondition
  + `tx.update` (partial merge) + `serverTimestamp()` for the update path
- Lazy-hydration cascade (v50-07-03) ruled out — Daniel's flow is on a
  fresh setlist with no legacy embedded tracks

## Top three hypotheses (ranked)

1. **Snapshot-listener LWW guard underflow.** If `local.updatedAt` ends up
   `undefined` after the user's edit (engine writeback raced or didn't fire),
   then `(undefined ?? 0) >= remote.updatedAt` → `0 >= ts1` → false → listener
   overwrites local with the cached pre-edit Firestore data (Firestore
   `onSnapshot` typically delivers from cache first before fresh fetch). The
   cached pre-edit data has no key. Indicator already showed "Saved" because
   the outbox drained successfully — it just didn't write back.

2. **Engine writeback never fires for the user's update.** Same downstream
   failure mode as above.

3. **`serverTimestamp()` resolves AFTER the getDoc re-read.** sentinel timing
   issue → `updatedAt` written to local Dexie is `undefined` → same downstream
   failure mode.

All three converge on the same fix surface: tighten engine writeback +
tighten LWW guard against `undefined`.

## Phase plan (drafted; ready to formalize as PLAN.md)

### Milestone v5.0-hotfix — save-loss fix (P0; ship before band sees it)

**Phase v5h-01: track-edit save-loss diagnosis + fix**

**Plan v5h-01-01 — Reproduce + diagnose** (research; autonomous=false; 1 human-action checkpoint)

Tasks:

1. **Reproduction harness** — add a kitchen-sink scenario in
   `src/lib/sync/__tests__/property-failures.test.ts` that mirrors Daniel's
   exact flow:
   - Brand-new setlist (no legacy embedded tracks)
   - applyEdit('set','tracks',{id, setlistId, songId, title}) — no key field
   - Drain to "remote"
   - applyEdit('update','tracks',{key:'E'}, expectedUpdatedAt: <writeback-result>)
   - Drain to "remote"
   - **Simulate page navigation:** clear Dexie tracks, re-prime via Hydrator
     with `initialTracks=[]` (mimics legacy embedded array stays empty), mount
     snapshot listener with mocked initial onSnapshot delivery using PRE-edit
     cached Firestore state (the realistic Firebase SDK behavior)
   - Assert: local Dexie tracks/{id} has key='E' (NOT undefined)
   - This test SHOULD fail if hypothesis #1 is right
   - Optional: run against real Firestore (Daniel's prod project) for
     production-fidelity reproduction

2. **HUMAN-ACTION checkpoint — production state capture:**
   - Daniel reproduces in production with Chrome DevTools open
   - Step 1: open setlist, add Modeh Ani, edit key to E
   - Step 2: BEFORE navigating, open DevTools → Application → IndexedDB →
     `crc-sync` → tracks store → confirm row has `key='E'` and
     `updatedAt=<a number, NOT undefined>`
   - Step 3: navigate away, come back
   - Step 4: same DevTools check — what's the row look like? Capture
     screenshot.
   - Step 5: Sentry dashboard — any events with `feature:dead-letter` or
     `feature:snapshot-listener` in the timestamp window?
   - Capture all in `.paul/postmortems/v50-07-save-loss-investigation.md`
   - **IMPORTANT:** Daniel must NOT clear browser data on the affected
     setlist before this capture, or the bug evidence is lost.

3. **Root cause confirmation** — based on captured state, decision-checkpoint
   between three fix shapes:
   - **Fix A** (writeback never fired): make engine writeback unconditional +
     verified via test harness
   - **Fix B** (listener LWW guard underflow): change
     `(local.updatedAt ?? 0) >= remote.updatedAt` to
     `local.updatedAt !== undefined && local.updatedAt >= remote.updatedAt`
     (skip listener delivery when local has no updatedAt — preserve user
     edit)
   - **Fix C** (serverTimestamp didn't resolve): switch to client-side
     `Date.now()` for the writeback timestamp (consistent with how local
     Dexie tracks `updatedAt` — server timestamp adds asymmetry that the
     LWW comparison can trip on)

**Plan v5h-01-02 — Fix** (execute; ~2h; decision-checkpoint at start to pick
fix shape from A/B/C above; regression test from Plan 01-01 ships in this
plan to lock the fix). Once shipped: push to prod, Daniel re-runs UAT
scenario 1.

**Plan v5h-01-03 — Postmortem** (execute; ~30min) — documents in
`.paul/postmortems/v50-07-save-loss.md`: what the kitchen-sink harness
missed; specifically why "harness-only" (the Task 0 decision in v50-07-04)
was insufficient — kitchen-sink used in-memory adapters with zero latency,
so the snapshot-listener cache-vs-fresh delivery race never surfaced. Lesson
for future cutover phases: kitchen-sink needs a "real-Firestore lite" mode
that uses the Firebase emulator OR a higher-fidelity in-memory adapter that
models initial-cache-then-fresh delivery semantics.

### Milestone v5.1 — editor UX overhaul (P1; after v5.0-hotfix closes)

/ui-ux-pro-max BLOCKING for every plan in this milestone.

- **v51-01 — Discovery + design direction** (research with /ui-ux-pro-max +
  decision-checkpoint at end)
  - Open production editor with /ui-ux-pro-max review, inventory specific
    issues (density, tint, type hierarchy, glanceability at stage distance,
    hover/edit affordances, how the dual-tint rows from v2.6 P1 got lost
    in the v50-05 cutover)
  - Decision-checkpoint: "tighten current grid" vs "redesign as denser
    list-like view"
- **v51-02 — Desktop + iPad density pass** — restore dual-tint rows, tighten
  row height, stronger title/metadata hierarchy
- **v51-03 — Mobile + WCAG sweep** — re-audit mobile card density + jest-axe
  + Lighthouse on prod

## Sequencing for next session

1. `/paul:resume` → reads STATE.md + this handoff
2. `/paul:milestone` → start v5.0-hotfix (NOT `/paul:new-milestone` — that
   command doesn't exist; the right command is `/paul:milestone` per the
   PAUL skill list)
3. `/paul:plan` → v5h-01-01 research plan
4. After v5.0-hotfix ships + Daniel re-confirms UAT scenario 1 passes:
   `/paul:milestone` → start v5.1 UX overhaul
5. After v5.1 ships + Daniel re-confirms UAT smoke passes:
   `/paul:audit-milestone` (or `/paul:plan-milestone-gaps` if that name is
   correct) → close v5.0

---

*Handoff: 2026-04-27 — bridge from v5.0 milestone PENDING-UAT through v5.0-hotfix + v5.1 to v5.0 milestone close*
