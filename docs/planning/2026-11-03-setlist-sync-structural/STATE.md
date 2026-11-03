# Setlist sync — structural investigation (2026-11-03)

## Trigger
Daniel edited the Nov 6 Friday setlist (`77d140d9-bb45-40fc-969f-d43e8b9ee3a8`) in the browser
editor while David (band leader, also an author) had it open on his phone. David did not see
Daniel's edits, his list jumped around, Daniel's editor sat on "saving" indefinitely, and "an
endless number of weird things saved or didn't". Daniel asked for a structural investigation,
not a patch of the particulars.

## Evidence so far (lead, 18:00–18:30Z)
- Server rows (GET /api/setlists/<id>/tracks) at 18:27Z: orders 0–9, 11, 12, 13, 16, 17, 18, 19,
  21, 23, 24. The gaps at 10, 14, 15, 20 and 22 match rows that exist only in Daniel's browser.
  The neighbouring renumbers saved and the creates did not (likely, not yet confirmed from his
  outbox).
- The editor reorders/renumbers with N separate `applyEdit` calls, which the outbox commits one row
  at a time, about 300 ms apart (bursts at 18:15:36, 18:20:11 and 18:26:02). Receivers see every
  intermediate order.
- The setlist doc was written by David's account through MCP at 18:09:25 (adding L'cha Dodi). MCP
  writes are server-side and bump `version`. Browser writes go row by row through the Dexie outbox.
  There are three writer paths: the browser outbox, MCP server transactions and the Perform
  live-reorder endpoint.
- Perform reads from Dexie, and Dexie wins over the fresh SSR frame. The snapshot listener skips a
  server delivery when there is any outbox row for the doc (including `failed`, which is terminal
  after 5 attempts), when the local `updatedAt` is undefined, or when the doc is tombstoned. Nothing
  prunes Dexie rows that are absent from a server snapshot. Dexie sorts by `order` only, while the
  canonical sort is order-then-id.
- A narrow patch agent was started and then stopped when Daniel asked for this structural pass
  (it may have left a worktree; sweep it).

## GATE log
- GATE: stopped the narrow fix and switched to a structural investigation — proceeded because
  Daniel asked for it explicitly.

## Findings in (A write path, B read path)
- Both independently: the live tracks listener query lacks an orgId filter, so since caacfb34
  (2026-10-13) it is denied for every non-po user. The lead verified this in the code.
- A: structural. Browser per-row writes with no setlist version, versus versioned server writers
  (MCP, Perform reorder). Recommends routing every structural edit through server transactions
  gated on the setlist version.
- B: no pruning of rows the server lacks; Dexie wins over SSR; failed outbox rows freeze rows;
  "take theirs" doesn't restore the server row.
- GATE: hotfix for the listener orgId scope dispatched ahead of the redesign — proceeded because it
  is a live prod regression for all band devices, with a minimal scope, and both audits agree.

## Repro (C) — branch investigate/sync-repro @ 838371d7, 16 emulator tests, deterministic
- All five classes reproduced: (c) listener permission-denied without orgId; (a) duplicate after a
  cleared cell → `{bpm: undefined}` → setDoc rejects → dead-letter, plus a server-deleted row with an
  edit queued → remote-doc-missing; (e) concurrent drags → duplicate order 2 / missing 7, and an MCP
  add_track fails every in-flight editor write; (b) "saving" never clears while failed rows exist;
  (d) a 10-row drag = 11 frames, 9 of them with duplicate orders.
- The `it.fails` tests define the target behaviour for the redesign. Open check: confirm Daniel
  holds `po` in prod.

## Shipped
- PR #75 merged as 78c32767; Vercel production deploy succeeded. The live tracks listener is tenant-scoped again.
- D-adjacent.md is in; PROPOSAL.md is written. Waiting on Daniel: D1 (direction) and D2 (offline authoring a/b).
- Worktrees swept. The superseded narrow patch is saved as stopped-narrow-patch.diff for reference.
  The repro branch `investigate/sync-repro` is pushed and kept.

## Decisions (Daniel, 2026-11-03): D1 = go, D2 = (a)
- OPS-CONTRACT.md written. PR 1 (server ops) and PR 2 (tenant guard) dispatched in parallel; they
  share no hot files. PR 3 is after PR 1; PR 4 is after PR 3.
