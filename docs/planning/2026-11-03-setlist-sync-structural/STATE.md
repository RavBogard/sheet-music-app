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

## PR 1 = #76 (setlist-sync/ops-engine @ 169f39c7)
- Lead rulings on the builder's choices:
  - A no-op batch doesn't bump the version — accepted (a version means "content changed").
  - not-found for non-members, forbidden below bl — accepted (no tenant existence leak).
  - The route folder is `[setlistId]` — accepted.
- GATE: the non-author server writers (clone, templates, performed, open-items, hygiene, backfills,
  B'nei Mitzvah, scheduling, notify-band) stay allowlisted — proceeded because they are not author
  edits of an existing setlist's rows, or they create new setlists. They move in PR 3's sweep or the
  later review, and the allowlist names each one.
- Known interim risk: bind-row bumps updatedAt, so the editor may show "Remote changes detected" on
  that row until PR 3.
- SECURITY (#76, unmerged, so prod is not exposed):
  - S1: an insert could overwrite any tenant's track (existence check limited to the setlist, plus
    a replacing `set` through Admin).
  - S2: dotted keys bypassed the reserved fields (could re-tenant a doc).
  Reported to Daniel. One fix round was sent to the builder with review items R3–R10. A re-review
  of the security deltas follows.
- #76 security re-review: S1, S2 and R5 CLOSED. The lead fixed the leftovers (0e0ed050): built-in keys
  crashed the schema check (now unknown), free text is capped at 5000, eventDate is bounded to
  2000–2199.
- GATE: R6 guard evasions using dynamically built collection names were accepted as out of scope —
  proceeded because the guard is a developer tripwire. Firestore rules and the server-side tenant
  check in setlist-ops are the security boundary, and the lint ban in #77 covers client code.
- Note: 0e0ed050 carries the worktree's inherited identity `pr2-tenant-query` (cosmetic).

## Merged
- #77 → e4286f72 (tenant query helper, lint ban, 128-case matrix, cross-tenant fallback, assignments index).
- #76 → c6c9d2f1 (server ops path; all checks green; rules deploy run started).
- PR 3 (editor client) and PR 3b (server writer stragglers) dispatched in parallel; the file sets
  are disjoint apart from possibly the guard test.
- GATE: PR 3 migrates the old queue by replaying pending/failed rows as ops instead of discarding
  them — proceeded because Daniel's unsaved rows must survive and the replay is safe (conflicts land
  in a visible refused list).
- GATE: wording for the new editor strings is provisional ("Reconnect to add, move or remove rows";
  "Couldn't save: {row} — {reason}", with "Try again" / "Discard"). Batched for Daniel's wording
  pass at the end of the wave.
- SECURITY (pre-existing in prod, found while reviewing #78): MCP `backfill_track_mimetype` scans
  and writes track rows of EVERY tenant after checking only the caller's own tenant role. Impact:
  a leader of one tenant can trigger mimeType corrections and stamps on the other tenant's rows (no
  content read back, and no deletion). Fixed in the #78 fix round with a stored-org check inside
  the transaction. Reported to Daniel.
- #78 fix round 3f6ed3c6:
  - Every maintenance helper takes a required org, checked against the stored orgId inside the
    transaction. The mimetype and isTest back-fills are scoped to the caller's tenant.
  - The escape hatches are closed. touchUpdatedAt:false is used for server-derived writes until PR 3.
  - The lead spot-checked maintenance.ts.
- GATE: cleanup_all_test_data still deletes test-owned/isTest fixtures in both tenants (each one
  under its own stored tenant) — proceeded because the behaviour is unchanged, it reaches test data
  only, and the F-05 dryRun/force gate stays in place. Revisit in the later review if leaders of
  one tenant shouldn't sweep the other's fixtures.

## PR 3 = #79 (setlist-sync/editor-ops)
- Adversarial review: CONFIRMED field loss in clone/duplicate/undo (pageNumber, audio fields,
  transposition…); Perform live-director edits are fire-and-forget; 401 pins "saving"; rules still
  allow client writes; duplicate creates on retry. One fix round sent, covering 10 items, including:
  deny client writes to setlists/tracks in the rules now; a server-side hydrate for unhydrated
  setlists; per-sub-field merge for gig.
- Rehearse (Listen → Rehearse, with a chart view and the recording docked) is being built in
  parallel and touches no shared files. The mode switch comes with PR 4.
- Open question to Daniel: derived BPM — "show" (recommended) or "write".

## Pause point (usage limit, 2026-11-03)
- #80 Rehearse: fix round pushed (cabf401f); a merge-if-green watcher was started. After deploy, take
  screenshots at 820×1180 and 390×844 on prod.
- #79 PR 3: the builder is in its fix round (10 items plus the TS2352 test error). When it lands:
  re-review only the security deltas (rules deny client writes, /create), then merge.
- Next: PR 4 (Perform read model + the Rehearse/Perform/Edit mode switch), then the wording pass,
  then derived BPM (waiting on Daniel: show/write).
- #80 Rehearse merged as a061a3c5 and verified on prod with Playwright:
  - /listen → /rehearse redirect works.
  - The list renders correctly at 820×1180 and 390×844, with no horizontal scroll.
  - The chart page renders the PDF with the docked player and prev/next.
  - Polish gap: the chart area is blank (no loading indicator) for about 2–5 s while the PDF
    loads. Fold this into PR 4.
- Daniel 2026-11-03: derived BPM = "write". Lead ruling, consistent with R11-b and "never overwrite
  an author's value":
  - Detected tempo is written automatically into EMPTY bpm fields only (song defaults and setlist
    rows), through the setlist-ops maintenance helper (which bumps versions), marked bpmSource:
    "recording".
  - A typed BPM is never overwritten.
  - Clips with no confident beat are skipped.
