# Cycle-9 Hardening — Lane B (trackCount drift-producer root cause + fix)

**You are coder-3.** Sign `from coder-3`.
**Anchor:** branch off `origin/master` @ `edb24a47c` in a fresh `git worktree`
(NOT the canonical checkout — stale branch).
**Bearer:** pool row `ASSIGNMENT=cycle-9-hardening-B` in
`~/.claude/projects/C--Users-dsbog-centralreform-live/.supervisor-bearers`
(supervisor-minted child). Mark `burned` on SHIP. Curl shape in pool header.
**Tier:** Tier-1 (real src + deployed-surface verify). Deployed REPRO required.

---

## Why this lane exists

cycle-8 Instance-2 (C8I2-003) found a real published setlist
(`UnjLqKTtS4lNKQfMY6hB`) whose denormalized `trackCount` had drifted to 45 while
the actual `tracks/` subcollection held 30. cycle-7 also saw this (C7I4-002,
`b12a5221` "Eitan Shabbat Morning"). The cycle-7-fixes Lane-3 `recompute_setlist_track_count`
tool HEALS drift on demand, and the chart-bond cron (once cycle-8-fixes Lane-1
registers it) will heal nightly — **but both are band-aids.** Some track-mutation
path is writing/deleting `tracks/` documents WITHOUT atomically updating the
parent setlist's `trackCount`. Your job: find the producer(s) and fix them so
fresh drift stops being created.

## Where to look (supervisor-traced candidate paths @ origin/master)

The recompute helper is `src/lib/setlist-track-count.ts` (`recomputeTrackCount`)
— that's the band-aid, not the bug. The drift PRODUCERS are wherever tracks are
added/removed/reordered. Audit each for "does it update parent `trackCount` in
the SAME atomic write/transaction/batch as the track mutation?":
- `src/lib/mcp/server-tracks-write.ts` (MCP track add/remove/reorder)
- `src/lib/mcp/tools/setlist-write.ts`
- `src/lib/mcp/tools/clone-setlist.ts`
- `src/lib/mcp/tools/propose-changes.ts`
- `src/lib/mcp/tools/setlist-publish.ts`
- `src/app/api/setlists/import/execute/route.ts` (uses a `trackCounter++` loop — verify it persists the final count)
- the HTTP setlist-delete route (cycle-7-fixes Lane-3 added a tracks cascade here — verify it decrements/recomputes trackCount in the same path)
- any client-side Dexie→Firestore sync path that writes tracks (`use-setlist-performance.ts` and friends) — a setlist edited in Perform mode then synced is a prime suspect for a write that skips the counter.

Don't assume it's one site — drift of +15 (45 vs 30) on a published setlist
suggests tracks were removed (or never decremented) somewhere. Enumerate ALL
track-mutation paths and classify each: atomic-and-correct / non-atomic-bug.

## Method

1. **Map every track-mutation path** and which ones maintain `trackCount` atomically.
   Write findings to `.paul/research/cycle-9-trackcount-TRIAGE.md`; HEADS-UP
   `inbox/supervisor.md` with the producer list before large edits.
2. **Fix the producer(s)** so the parent `trackCount` is updated in the same
   atomic unit (transaction or batched write) as the track add/remove. Prefer a
   single shared helper (or `FieldValue.increment`) over per-call hand-maintenance
   so future paths can't drift. Keep it minimal — don't refactor unrelated code.
3. **Regression test (REQUIRED):** add an emulator test that proves a track
   add AND a track remove each leave `trackCount === tracks/.size` atomically,
   for every path you touched. This is the proof the drift can't recur.
4. **Deployed-surface REPRO:** after ship + deploy, run
   `recompute_setlist_track_count` on a freshly-mutated real setlist via MCP and
   show `drifted:false` immediately after a normal add/remove (i.e. the mutation
   path now keeps the counter correct, so recompute finds nothing to heal).

## Hard rules

- Do NOT touch `bridge/**`, repo-root `mcp/`, `SetlistGrid.tsx`,
  `src/lib/mcp/errors.ts`, `src/lib/mcp/error-envelopes.ts`.
- `src/lib/mcp/tools/setlist-write.ts` may be touched by other lanes — check
  `.coord/shared/claims.md` + HEADS-UP before editing it.
- Don't fix the drift by making the cron/recompute run more often — that's the
  band-aid. Fix the producer.

## Gates before SHIP

1. `npm run test:emulator` — green incl. your new atomicity regression test.
2. `next build --webpack` — clean.
3. Deploys executed: push to master (Vercel auto-deploy).
4. Deployed-surface REPRO transcript (recompute shows no fresh drift post-mutation).

## SHIP protocol

1. Clean commit(s). Push to `origin master` (NOT `master:main`); cherry-pick
   onto fresh origin/master if diverged.
2. OVERWRITE `.coord/shared/master-tip.md` with the new SHA.
3. SHIP-NOTICE to `inbox/supervisor.md` (`from coder-3`): the producer paths
   found + fixed, the atomicity test, and the deployed REPRO transcript.
4. Mark bearer row `burned`.
5. Hold worktree for teardown until auditor ACCEPT + supervisor go-ahead.

### ACK
Append `msg-from-coder-3-cycle9-B-ack` to `inbox/supervisor.md` after worktree
setup + branch cut + this read. Then start with the path-audit triage note.
