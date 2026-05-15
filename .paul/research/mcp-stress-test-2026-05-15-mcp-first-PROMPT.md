# MCP Stress-Test — MCP-First Weekly Authoring Flow

**Generated:** 2026-05-15 end-of-day, post atomic-upload-guard ship (`f650d94f0`)
**Production MCP:** `https://www.centralreform.live/api/mcp`
**Supersedes:** `.paul/research/mcp-stress-test-2026-05-15-followup-PROMPT.md` (Waves 4-6 regression — every check there has either shipped + been verified or was OBE by the 2026-05-15 fix-pass series).

---

## Context for cowork-Claude

You are a cowork test agent. The CRC Music MCP server has just been declared **the primary author surface** for Rabbi Daniel — he is committing to driving the weekly setlist / chart workflow through Claude + MCP rather than the in-app library UI. The browser app is now the band/consumer surface only (Perform mode on iPads, chart-bind picker, gig-packet print).

Your job is to run the FULL weekly authoring flow end-to-end through MCP, prove it actually works under realistic conditions, and surface every remaining friction point that would force Daniel back into the in-app UI. Be exhaustive but efficient — probe error paths, edge cases, and the cache-invalidation flow.

Run **AS David Lazaroff (band_leader)** if his Claude Desktop token is the one connected. Daniel can swap to his own admin token mid-run if a check requires admin specifically. **Report at the top of your final report which UID + role you actually ran as** — the 2026-05-15 prior runs got muddied by an undetected admin/band_leader token mix-up.

---

## Tool inventory (27 tools live)

```
Setlist reads (4):    list_setlists, get_setlist, search_library, get_song
Setlist writes (9):   create_setlist, update_setlist, add_track_to_setlist,
                      reorder_setlist, remove_track, delete_setlist,
                      update_track, bulk_update_tracks, bulk_add_tracks
Monitor (8):          list_monitor_buses, get_mix, get_matrix,
                      set_send_level, set_send_mute, set_bus_fader,
                      set_matrix_fader, set_matrix_mute
Chart ingest + I/O (6): upload_chart, scrape_chart_from_url, save_scraped_chart,
                      delete_chart, download_chart, import_chart_from_drive
```

Most-recent prod commit: `f650d94f0` (atomic upload guard + library_signals invalidation).

---

## Phase 0 — Identity + connectivity sanity

1. Call `list_setlists({limit: 3})`. Report the role you authenticated as. If the response shape suggests admin (full access to every setlist) vs band_leader (also full access via the trusted-leader widening), say so. If you can't tell from this call alone, run `list_monitor_buses` — admin sees the matrix block; non-soundEngineer band_leader does not.
2. Confirm `https://www.centralreform.live` resolves and the MCP responds in well under 5s on a cold call. Anything > 10s on a read tool is a red flag.

---

## Phase 1 — Weekly-flow simulation (the meat)

Simulate the actual weekly authoring task Daniel will do every Friday afternoon. Execute the entire flow through MCP; do NOT use the browser library UI at any point.

**Scenario:** It's Friday morning. Last Friday's setlist exists as a starting template. You need to build this week's "Shabbat Morning" setlist from it.

Steps (and what to check at each):

1. **Find last week's template.**
   `list_setlists({limit: 10})` → pick the most-recent past setlist by eventDate. Note the id.
2. **Read its full track list.**
   `get_setlist({id: ...})` → capture the tracks array verbatim.
3. **Create this week's empty setlist.**
   `create_setlist({name: "⚠️ STRESS Shabbat Morning — <today>", eventDate: "<next Saturday ISO>", serviceType: "shabbat-morning", rabbi: "Daniel"})`. Verify the response includes `ownerId` + `ownerName` (G-16).
4. **Bulk-add last week's tracks into the new setlist in one call.**
   `bulk_add_tracks({setlistId: <new>, tracks: [...the rows from step 2, mapped to {songId, type, title?, key?, leadMusician?, notes?}], mode: "atomic"})`. This is THE call that closes cowork's prior "9 sequential add_track_to_setlist" complaint. Verify:
   - `committed: true`
   - Every `results[i].ok` is true
   - The `order` values are 0..n-1
   - `get_setlist` on the new id returns the rows in identical performance order, fileIds bonded, and the setlist's `fileIds[]` array reflects every bonded chart.
5. **Swap one song.** Pick any track that was a "song" type. Call `update_track({setlistId, trackId, patch: {songId: <a different library songId from search_library>}})`. Verify the row's `fileId` updated to match the new `songId` (auto-rebond), and the track's other fields are untouched.
6. **Move a row in place.** Pick track #N (not the first, not the last). Call `update_track({setlistId, trackId, patch: {position: 0}})`. Verify via `get_setlist` that the row is now first, and the other rows compacted into a contiguous 0..n-1 ordering.
7. **Bulk-update several rows at once.** Pick 5 tracks. Call `bulk_update_tracks({setlistId, mode: "atomic", patches: [{trackId, patch: {leadMusician: "David"}}, ...]})`. Verify all 5 land in one commit, and the `committed: true` envelope is returned. Also confirm `bulk_update_tracks` REJECTS a `position` field (try one patch with `{position: 1}` and expect an envelope-level error explaining position is single-track-only).
8. **Dry-run a destructive bulk update.** Call `bulk_update_tracks({setlistId, dryRun: true, patches: [...]})`. Verify `committed: false`, results carry the previewed track state, and `get_setlist` after the call confirms NOTHING actually changed.

Surface ANY mismatch between the response envelope and the actual Firestore state via a follow-up `get_setlist`. If a tool says `committed: true` but the rows didn't move, that's a CRIT.

---

## Phase 2 — Chart-ingestion flow (the MCP-first replacement for in-app upload)

Daniel will never use the in-app upload dialog again. Verify the MCP-side ingestion paths cover his needs.

1. **Drive-id import (preferred path).**
   `import_chart_from_drive({driveFileId: "1uj3isd0RJoAYoETx4QFwjQQgwjaO4DTS", title: "⚠️ STRESS Bina in G", collection: "uploads"})`. This is the path that replaced the base64 `upload_chart` hang. Verify:
   - Returns `{ok: true, fileId, title, collection}`.
   - `download_chart({fileId: <returned>})` returns base64 bytes that decode as a valid PDF (`%PDF` magic).
   - Library list (next phase) surfaces the new chart.
2. **Drive-id import — Google Doc rejection.**
   Pick any native Google Doc Drive ID (not a PDF). Expect an error containing `"export it to PDF in Drive first"`.
3. **Drive-id import — admin/band_leader curated catalog gate.**
   `import_chart_from_drive({driveFileId: <any PDF>, collection: "core"})`. As admin OR band_leader (post-widening), this should succeed. Delete the test entry via `delete_chart` afterward (curated DELETE still requires admin).
4. **Direct base64 upload — known-good small PDF.**
   `upload_chart` with a ≤50KB base64-encoded PDF. Should succeed (large payloads were the 2026-05-15 hang case; small payloads still work).
5. **Atomic-guard probe — should NOT produce orphans.**
   Force-upload 5 distinct test charts in rapid succession. After all 5 succeed, query `get_song` on each — every row's `fileId` should resolve cleanly. Then call `download_chart` on each — every one should return non-zero bytes. **The atomic-guard's contract is: no library_index entry exists without matching Storage bytes.** If any test chart returns "Chart file not found in Storage or Drive" on download_chart while still present in search_library results, that's a CRIT — the atomic-guard isn't holding.
6. **Scrape-chart path.**
   `scrape_chart_from_url({url: <any public Ultimate Guitar chord chart URL>})` → expect `{ok, title, artist, content}`. Then `save_scraped_chart({title, content, artist, collection: "uploads"})` → expect `{ok, fileId}`. This is the catch-all path for "I found chords online and want to add them".
7. **Delete cleanup.** Delete every chart created in this phase via `delete_chart`. After cleanup, `search_library({query: "⚠️ STRESS"})` should return [] (or only entries created in Phase 1, none from Phase 2).

---

## Phase 3 — Library cache-invalidation signal (NEW from `f650d94f0`)

This phase needs a human-in-the-loop for the browser side. Daniel will open `https://www.centralreform.live/library` in a browser tab BEFORE you start, sign in, and watch the list without refreshing. He reports back what he sees as you run the MCP calls.

1. Daniel confirms the browser library tab is open and showing the catalog.
2. You: `import_chart_from_drive` or `upload_chart` for ONE test chart with a distinctive title like `"⚠️ STRESS SIGNAL <timestamp>"`.
3. Daniel watches the library tab. Expected: within ~1-2 seconds (Firestore snapshot latency), the new chart appears in the library WITHOUT a hard refresh. The React Query cache should auto-invalidate via the `library_signals/latest` onSnapshot listener.
4. You: `delete_chart` the test entry.
5. Daniel watches again. Expected: within ~1-2 seconds, the chart disappears from the library list without refresh.
6. If either doesn't happen, that's a HIGH bug — the invalidation signal isn't propagating. Possible causes: Firestore rules denied the read (rules were deployed via `firebase deploy --only firestore:rules` today — confirm `library_signals/*` allows signed-in reads), onSnapshot listener errored out, or the server-side `library_signals` write was skipped.

---

## Phase 4 — Known-gap probes (these SHOULD fail; you're confirming Daniel's gap list is accurate)

Each of these is expected to surface as "tool not available" — confirm that, and note the workaround friction.

1. **`generate_gig_packet(setlistId)`** — top priority remaining gap. Call it. Expected: tool not found / not registered. Workaround Daniel currently uses: in-app gig-packet print flow OR multiple `download_chart` calls + manual merge. The pain of the workaround is what's funding this tool's priority.
2. **`publish_setlist` / `notify_band`** — no MCP "send tonight's setlist to the band" tool. Try `publish_setlist` and `notify_band` both. Expected: tool not found. Note: without this, Daniel still has to open the in-app UI weekly to hit publish.
3. **`list_library(collection, limit, offset)`** — no full-catalog browse tool. `search_library({query: ""})` returns up to 20; with `limit: 50` it caps at 50. There's no "page through everything in supplemental". Confirm via `search_library({query: "", limit: 50})` whether you can get every supplemental row. If supplemental has > 50 entries, note that the gap forces Daniel to filter incrementally.

---

## Phase 5 — Observability + diagnostics

1. **Per-stage upload tracing** (shipped today as part of the upload_chart hang fix). Trigger an upload via `import_chart_from_drive` for a ≥1 MB PDF. After it completes, ask Daniel to check Vercel runtime logs at the deploy URL (he can run `npx vercel logs <prod-url> --no-follow --since 5m` from his shell). Confirm logs contain entries like `[Upload <traceId>] start ... convert-musescore:start ... storage-upload:start ... storage-verify:ok ... firestore-write:start ... complete`. This is the in-prod debug signal that lets us pinpoint a future stall to a specific stage.
2. **Error envelope shape**. Cause one error of each class and report the envelope you receive:
   - Permission error: try a chart upload as a non-band_leader user (if you have one).
   - Validation error: `bulk_update_tracks({setlistId: <good>, patches: []})` — expect `{error: "patches must include at least one entry"}`.
   - Not-found error: `get_setlist({id: "nonexistent"})`.
   - Atomic-guard rollback: very hard to trigger naturally; skip unless you find one.

---

## Phase 6 — Don't-break-the-band sanity (browser-side)

Daniel will pull up `https://www.centralreform.live/perform/setlist/<your stress-test setlist id>` on a phone or tablet AFTER you finish Phase 1 building the stress-test setlist. Verify:

1. The setlist title + tracks render correctly.
2. Tap into one of the bonded charts — Perform mode loads the PDF without "Failed to load PDF". (The 2026-05-15 prod incident with the pdfjs workerSrc race was fixed in commit `3b76279f2`; this is the regression check.)
3. The chart-bind picker (open it on a track) shows the test charts you uploaded in Phase 2 once they're present in the library. After cleanup (Phase 2 step 7), the picker should NOT show them anymore.

If any of these break, note severity by impact on tonight's-or-next-week's service. The band can fall back to paper packets in a pinch but the iPad flow is the supported path.

---

## Cleanup

After all phases:

- Delete the stress-test setlist created in Phase 1 via `delete_setlist`. Verify cascade-delete: all tracks gone, library entries for charts created in Phase 2 already cleaned up.
- `search_library({query: "⚠️ STRESS"})` should return [].
- `list_setlists({limit: 10})` should not include any "⚠️ STRESS" entries.

---

## Reporting format

Produce a final markdown report with:

1. **Identity** (top of report) — which UID + role you ran as for each phase. Flag any token-swap mid-run.
2. **Phase 1 weekly-flow table** — step × pass/fail × observed behavior × envelope shape captured.
3. **Phase 2 ingestion table** — same shape.
4. **Phase 3 signal validation** — what Daniel saw in the browser tab, latency observed, pass/fail.
5. **Phase 4 gap probes** — confirm each is missing as expected; estimate friction cost.
6. **Phase 5 observability** — paste a few log lines, comment on envelope clarity.
7. **Phase 6 band-side sanity** — pass/fail per chart, tied to specific track ids.
8. **NEW findings (H-1, H-2, ...)** — anything surprising or broken not on the checklist. Severity (CRIT/HIGH/MED/LOW), repro steps, suspected root cause, suggested fix. The CRIT bar is: blocks Daniel's MCP-first weekly flow OR breaks the band's iPad consumer flow. Lower-severity in-app library UI issues that don't affect either should be noted but not raised to CRIT.

This is the test that decides whether the MCP-first author model is production-ready or needs another round of fixes before Daniel commits to it permanently. Be thorough.

---

## Pre-run sanity for Daniel

Before sending this to cowork:

- [ ] Confirm Vercel deploy at master tip (`f650d94f0` or later) is READY.
- [ ] Confirm Firestore rules deploy ran today (it did, but verify): `library_signals/*` accepts signed-in reads.
- [ ] Decide which token (admin Daniel vs band_leader David) cowork will run with, and capture that in the report.
- [ ] Have a browser tab on `/library` ready for Phase 3.
- [ ] Have an iPad / phone ready for Phase 6.
- [ ] Confirm whether the X32 mixer is powered on if you want monitor-mix probes added; if off, skip monitor tools entirely (they're not in scope for the weekly authoring flow anyway).
