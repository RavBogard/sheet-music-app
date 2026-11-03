# Setlist sync redesign — proposal (2026-11-03)

Inputs: A-write-path.md, B-read-path.md, C-repro.md (branch `investigate/sync-repro`), D-adjacent.md.

## What is wrong, in one paragraph
Setlists have three kinds of writer. The browser editor writes through a local outbox, one row at a
time, each row guarded only by its own timestamp. MCP and the Perform reorder use server
transactions gated on the setlist `version`, which the browser never bumps. Several server writers
(page bindings, book changes) touch rows without moving any stamp at all. On the read side, each
device treats its local Dexie copy as the truth: it refuses server data for any row with a queued or
failed write, never removes rows the server no longer has, and prefers that copy over the fresh
server render. Every earlier fix (about 45 recorded in comments) protected local edits by refusing
server data, so each one added a new way to drift. The 2026-10-13 tenant rule then cut live updates
off entirely for everyone but Daniel (fix: PR #75).

## The invariant we commit to
> Within a few seconds of being online, every device shows exactly the server's setlist, plus its
> own edits that are not yet saved. Those pending edits are visibly marked, and every one of them
> ends as either saved or clearly refused, never stuck.

## The design
1. **One server write path for setlists and rows.** It is a single module (grown from
   `server-tracks-write.ts`) exposed as `/api/setlists/{id}/ops` and called by MCP, the browser and
   Perform alike. Each call is an *intent* (insert, remove, move, edit fields, edit setlist
   details), run in one transaction that bumps the setlist `version` and stamps every row it
   touches.
   - A drag is one call, so it arrives on other devices as one update: no jumping, no half-orders.
   - Field edits merge per field. Two people changing different fields of the same row both win; a
     conflict exists only when the same field changed underneath you.
   - Moves, inserts and removes are rebased onto the newer server order instead of failing. A
     conflict is only "the row you moved was deleted".
   - A grep test fails the build if anything else writes `setlists` or `tracks`. That also fixes the
     stale page numbers on iPads (D1).
2. **The read model: server snapshot plus a pending overlay.** Dexie becomes a cache of the server's
   rows only; local edits never write into it.
   - Every server snapshot replaces the cached set whole, so ghost rows are pruned.
   - Pending intents are drawn on top of that set and marked as pending.
   - Perform seeds its cache from the SSR render when that render is newer, and re-checks the
     setlist `version` on focus and every ~30 s, resetting itself silently if it has drifted.
3. **One freshness state per setlist.** It reads as current, saving N, refused (retry or discard,
   naming the row) or offline-since. The editor's indicator reads it, and the endless "saving" goes
   away by construction. On the band's iPads it stays quiet: the device heals itself and nothing
   alerts during a service (standing rule).
4. **Perform's own writers move onto the ops path.** These are the Live Director key changes, chart
   swaps and inserts.
   - Opening a MusicXML chart no longer writes a key to the row on its own (R11-b: rows change only
     by explicit author action).
5. **Tenant query guard.** All client tenant queries go through one `tenantQuery` helper.
   - A scan test fails any tenant query built outside it.
   - One emulator matrix runs every real client query, both as a live listener and as a one-off
     read, as crc bl/mu/pe, BL bl/mu, a cross-tenant member, signed out and po.
   - Cross-tenant viewers fall back to the public per-setlist endpoint.
6. **Retire the outbox for setlists and rows.**
   - Shipping the new client drains or discards the old queue and clears the cached rows once; the
     server reseeds them.
   - The 45 guards are deleted, not left beside the new path.
   - The outbox stays only for song defaults (later review).

Unchanged: the Overlays reader contract (same fields), R11-b, both tenants, MCP tool names and shapes.

## Order of work (PRs sized by area)
| PR | Contents | Depends on |
|----|----------|-----------|
| #75 | Listener orgId hotfix (in CI now) | none |
| 1 | Server ops module and route; MCP + Perform reorder + bind-row + liturgy bindings + book change onto it; version/stamp helper; grep guard | none |
| 2 | Tenant query helper, scan test, emulator query matrix, cross-tenant API fallback | none (parallel to 1) |
| 3 | Editor client on ops: intents, rebase, overlay read model, freshness state, outbox retirement for setlists/rows | 1 |
| 4 | Perform on the new read model: SSR seeding, version self-check, Live Director writers on ops, no auto key write | 3 |
The repro suite on `investigate/sync-repro` comes along: its `it.fails` tests must pass by PR 4.
Each PR gets an adversarial review (strongest model) aimed at concurrency, tenants and offline Perform.

## Later (separate review, not this work)
Song defaults moving to a server write; the songs/library_index mirror writers; the picker cache
keeping deleted songs; the unstamped song row after upload; `sync_runs` has no rule (admin Data tab
always blank); dead `SetlistHistoryPanel`; retired scheduling queries; `isTest` hygiene write.

## Decisions
- **D1 (Daniel): the direction.** Server-authoritative ops as above. Recommended.
- **D2 (Daniel): browser authoring while offline.** (a) Structural edits (add, remove, move) need a
  connection, and field edits queue and rebase. (b) Everything queues offline and rebases on
  reconnect. Recommend (a): authoring mostly happens through MCP, which is always online, and (a)
  removes the hardest conflict cases. Perform reading offline is unaffected either way.
- Decided by the lead, following standing rules: band iPads heal silently with no mid-service alert;
  no automatic key write on chart open (R11-b).

## Before PR 3 ships
Daniel's browser still holds unsaved rows (the gaps at orders 10, 14, 15, 20 and 22). Salvage them
first, using the console readout or by re-adding them through MCP, because PR 3 clears the old queue.
