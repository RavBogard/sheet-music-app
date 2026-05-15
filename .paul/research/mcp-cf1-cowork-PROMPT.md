# MCP CF1 Verification — Cowork-Claude Prompt

You are cowork-Claude, validating the just-shipped CF1 MCP tools (`update_track` + `bulk_update_tracks`) for the CRC sheet-music app. Endpoint: `https://www.centralreform.live/api/mcp`. You have David Lazaroff's MCP bearer token (role: `band_leader`) configured in your Claude Desktop. Your goal: re-run the cowork eval scenarios that motivated CF1, probe CF1's new surface from a real band_leader's perspective, and report what's better and what still bites.

## Context

The prior cowork-Claude eval (2026-05-15, baseline at `.paul/research/mcp-claude-first-cowork-REPORT.md`) ran as admin Daniel and discovered that simple per-row edits required `remove_track` + `add_track_to_setlist`, which:
- Lost track identity (new trackId on every edit)
- Created partial-failure cliffs (one mid-eval observed)
- Took 26 calls for "Randy leads songs 2, 4, 7"

CF1 shipped two tools to close that gap:
- `update_track(setlistId, trackId, patch)` — partial-row patch; trackId preserved; `patch` fields: key, leadMusician, title, notes, type, songId (auto-rebonds fileId), referenceLink
- `bulk_update_tracks(setlistId, patches, mode, dryRun)` — atomic transaction (default) OR best-effort loop; `dryRun: true` returns plan without writing; max 50 patches per call

## Role & first action

You are running AS David Lazaroff, a `band_leader` (NOT admin). Call `list_setlists` first to confirm you can see Daniel's setlists — role-based access, not owner-based; you should see ALL setlists.

## Tasks (record exact MCP call count + observations for each)

### Task 1 — T2 redux: Randy leads songs 2, 4, 7
Find a recent setlist with ≥7 song rows. Use ONE `bulk_update_tracks` atomic call to set `leadMusician: "Randy"` on positions 2, 4, 7. Compare to the baseline 26-call cost.

### Task 2 — T9 redux: bulk key transposition
Pick a setlist with ≥5 song rows in the same key. Transpose all of them up a whole step (G→A, F→G, etc.) via one `bulk_update_tracks` atomic call. Read back via `get_setlist` and confirm the same trackIds carry the new keys (identity preservation regression).

### Task 3 — T1 redux: targeted single-row edits
Pick 3 different rows on a setlist; for each, change ONE field (key on row A, leadMusician on row B, notes on row C) via separate `update_track` calls. Confirm the OTHER fields on those rows are untouched.

### Task 4 — Dry-run before commit
Build a 5-row patch that changes leadMusician on 5 different songs. Call `bulk_update_tracks` with `dryRun: true`. Read the affected rows via `get_setlist` and confirm NOTHING changed. Then call without `dryRun` and confirm the writes landed.

### Task 5 — Cross-setlist guard
Get a trackId from setlist A. Pass it to `update_track` with setlistId=B (a different setlist). Expect error: "Track does not belong to this setlist". Read back the actual row and confirm it wasn't mutated.

### Task 6 — Atomic-failure rejects all
Build a 3-patch batch with one bogus trackId (e.g. "ghost-track") in the middle. Call `bulk_update_tracks` atomic (no dryRun). Expect: envelope reports all three; the bogus one marked `ok: false`; the two valid ones NOT applied. Read back the two valid rows to confirm no mutation.

### Task 7 — Best-effort partial success
Same 3-patch batch, but `mode: "best-effort"`. Expect: 2 applied, 1 reports its error. Read back to confirm the two writes landed.

### Task 8 — Realistic weekly-flow scenario (no setup shortcuts)
Create a fresh setlist for a hypothetical Friday-evening service via `create_setlist`. Use `search_library` to find 8-10 songs and add them via `add_track_to_setlist`. Then in ONE `bulk_update_tracks` call: change vocal leads on rows 3, 5, 7 AND key on rows 2 and 9. Confirm post-state via `get_setlist`. Note total round-trip count for the whole scenario.

### Task 9 — Chart upload (`uploads` collection)
Upload one chart (small PDF or text — content doesn't matter) to the `uploads` collection via `upload_chart` or `save_scraped_chart`. Note any rate-limit responses (429s) if they appear.

### Task 10 — Curated-catalog probe (expected to fail today)
Try to upload one chart to `collection: "core"` or `collection: "supplemental"`. You should be blocked with an admin-only error. Capture the EXACT error text. (Daniel is about to widen this for band_leaders — your report informs the change.)

## Browser-driven verification (REQUIRED for this run)

You should also have Playwright MCP installed (`mcp__playwright__*` tools). If you do NOT have browser tool access, stop and tell Daniel — this run is incomplete without it.

For Tasks 1, 2, 8, 9, AND 10 (the user-visible ones), after each MCP write:

1. **Open `https://www.centralreform.live` in a browser**, signed in as David Lazaroff. (If you need to set up auth, surface that as a finding and proceed to the next task.)
2. **Navigate to the affected setlist or library entry.**
3. **Verify the UI reflects the MCP write** — the row shows Randy as vocal lead, the key on row N is transposed, the new chart appears in the library list, etc.
4. **Capture any console errors, network 4xx/5xx responses, layout breakage, or visible glitches** during the navigation.
5. **Screenshot** anything that looks wrong (or anything that looks particularly slick).

Goal: surface UI-side issues the MCP-only path cannot see — rendering bugs, stale-cache problems, missing reconciliation between MCP writes and the in-page state, auth gotchas David hits that Daniel-as-admin masks.

## Reporting

Write a report to `.paul/research/mcp-cf1-cowork-REPORT.md` covering:

1. **Per-task call count**: actual MCP tool calls per task. Compare each to the implied pre-CF1 baseline (Task 1 baseline is 26 from the prior cowork report; estimate the others).
2. **Identity preservation**: did `update_track` keep the same trackId across edits? Show before/after trackIds from at least one round-trip.
3. **Friction points**: any unexpected errors, schema validations that bit, missing context, things that took >1 retry. Quote the exact error text.
4. **Rate-limit observations**: did you hit 429s? On which tool? After how many calls in what window? (As a band_leader you should hit 10/min upload + 20/min ai. If your run is small enough that you don't trigger one, note that too.)
5. **Curated-catalog block**: from Task 10, paste the exact rejection message and the tool path that returned it.
6. **Recommended next gaps**: what's the single most consequential remaining gap after CF1, from a band_leader's weekly-flow perspective? (One paragraph.)
7. **Browser-side findings**: every console error, 4xx/5xx response, visible glitch, stale-cache moment, or auth wall you encountered. Quote the exact error message and the URL where it happened. Attach screenshots inline (or describe what they showed).
8. **MCP/UI consistency**: did every MCP write you made actually show up in the browser? Any cases where the MCP returned success but the UI didn't update without a refresh? Any reconciliation lag?

Target length: ~2-3 pages. Focused, with exact call counts and quoted errors — not narrative. Compare to baseline numbers in `mcp-claude-first-cowork-REPORT.md` wherever applicable.
