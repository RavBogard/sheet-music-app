# MCP Stress Test v3 — Post-Bundle Verification

**Target:** `https://www.centralreform.live/api/mcp` (apex 307s to www)
**Branch under test:** `master` — tip `97d30f92d` or later
**Tool count:** 29 + (any new publish/notify tools shipped before you start)

## Why this run

The 2026-05-15 v2 stress test surfaced one CRIT (H-4), two HIGH (H-1+H-5), one MED (H-2), one LOW (F-2). All four shipped between your v2 report and now:

- `e4435235f` — `generate_gig_packet(setlistId)` (CF2-C) — NEW
- `284d96abb` — `list_library(collection?, limit?, offset?)` — NEW
- `98094bceb` — H-4: dropped `s-maxage` from `/api/library/list?all=true`
- `97d30f92d` — H-1/H-5/F-2/H-2: re-bond rebuilds `setlist.fileIds[]`, refreshes `fileName`, rejects `position` in bulk patches with a guidance message

Your job: confirm every fix actually closes the finding in production, plus shake the two new tools as if you're Daniel on a normal Friday.

## Identity

Run the **entire** test as **Daniel Bogard (admin)** — UID `93Xn3DbS0bSNb8zmfzLyfOMX1A13`. Verify with `list_monitor_buses` returning `isPrivileged: true`. If a token swap happens mid-run, abort and report — same rule as v2.

---

## Phase A — H-4 verification: MCP-imported chart visible in /library

This is the CRIT fix. The whole MCP-first model rides on this working.

1. Pick a Drive PDF the service account can read (any one of the `import_chart_from_drive`-able files from your v2 run).
2. Note the current Uploads-tab count in a freshly-opened `/library` tab (browser-driven via Claude in Chrome on Daniel's signed-in session). Switch to Uploads filter, record the badge count.
3. Call `import_chart_from_drive({driveFileId, title: "⚠️ V3 H-4 PROBE <RANDOM>", collection: "uploads"})`. Record the returned `fileId`.
4. **Without** hard refresh, watch the Uploads-tab badge for 5 seconds.
5. Then hard-refresh (F5) the tab.
6. Then re-click the Uploads filter to force a refetch.

**Expected:**
- Step 4: badge increments within ~1–2 seconds (library_signals onSnapshot → react-query invalidate). Without the H-4 fix, this used to NEVER happen.
- Step 5: still visible.
- Step 6: still visible.

**If any step fails:** record the headers of the `/api/library/list?all=true&collection=...` response (especially `Cache-Control`). The fix shipped: `Cache-Control: private, max-age=120` (no `s-maxage`, no `public`, no `stale-while-revalidate`). If you see `s-maxage` in prod, the deploy didn't land.

Cleanup: `delete_chart({fileId})`, confirm Uploads badge decrements within ~1–2 seconds.

---

## Phase B — H-1/H-5/F-2 verification: re-bond rebuilds setlist fileIds[]

This is the HIGH fix. Perform mode broke for every re-bonded chart in v2.

1. Clone a template setlist via the same flow as v2 — pick a recent populated Shabbat template, bulk_add_tracks into a new `⚠️ V3 RE-BOND STRESS …` setlist.
2. Pick any bonded song row. Note its `fileId`, `songId`, and `fileName` (via `get_setlist`).
3. Pick a DIFFERENT song from the library (`list_library({limit:50})` is now a thing — use it).
4. `update_track({setlistId, trackId, patch:{songId: <NEW_SONG_ID>}})`.
5. Re-read with `get_setlist`. Verify:
   - The track row's `fileId` is the new songId ✅ (this was working in v2)
   - The track row's `fileName` is the NEW song's chart filename (was stale in v2 — F-2 closed)
   - **`setlist.fileIds[]` contains the new fileId AND no longer contains the old fileId** (was broken in v2 — H-1 closed)
6. Open `/perform/setlist/<id>` in Chrome via Claude; tap the re-bonded row. The chart must load — not "Image failed to load" (H-5 closed downstream).
7. **Sibling-preservation edge case:** Add a second track bonded to the SAME original song before re-bonding. Re-bond row A only. Confirm `setlist.fileIds[]` keeps the original fileId (row B still uses it).

Cleanup: `delete_setlist`.

---

## Phase C — H-2 verification: bulk_update_tracks rejects position with guidance

Tiny but load-bearing for operator clarity.

1. Create a stress setlist, add a couple of bonded rows.
2. Call `bulk_update_tracks({setlistId, patches:[{trackId: <id>, patch:{position: 1}}]})`.
3. Read the error envelope.

**Expected:** MCP `-32602` validation error with the message containing `"position is not supported in bulk_update_tracks"` and a hint pointing at `update_track` (single move) and `reorder_setlist` (multi-row reorder). NOT the v2 misleading `"patch must include at least one field"`.

4. Sanity: `bulk_update_tracks` with a legitimate patch (`{key: "G"}`) succeeds.
5. `update_track({patch:{position: 0}})` succeeds (the move belongs on the single-track tool, not the bulk).

Cleanup: `delete_setlist`.

---

## Phase D — `generate_gig_packet` exercise (NEW tool, not in v2)

CF2-C ships the "assemble the band's printable packet via MCP" path. Without it Daniel was hitting the in-app gig-packet print button every Friday.

1. Pick a real populated setlist with a mix of bonded charts.
2. `generate_gig_packet({setlistId})`. Record `sizeBytes`, `appendedCount`, `bondedCount`, `missingCharts[]`.
3. Decode the `contentBase64` to a PDF locally. Open it. Verify:
   - Page count ≈ sum of source PDF pages + 1 per image/text chart + 1 appendix (only if anything was missing).
   - Charts render in setlist performance order.
   - PDF metadata `title` reads `"<setlist name> — Gig Packet"`.
4. If `missingCharts[]` is non-empty, the appendix page must list every entry with its reason text.
5. Probe edges:
   - Empty setlist (no tracks at all) → `"No bonded charts on this setlist"` envelope error.
   - Setlist with only header/reading rows (no bonded fileIds) → same error.
   - Setlist where one bonded `fileId` is intentionally bogus (e.g. you just deleted it) → that row in `missingCharts[]`, packet still returns ok.
6. **Optional but encouraged:** Compare the MCP packet against the in-app gig-packet print output for the same setlist. They should be equivalent in content (the MCP packet skips the in-app's cover sheet — that's intentional). If there are content differences worth flagging, list them.

---

## Phase E — `list_library` exercise (NEW tool, not in v2)

CF2-D. Closed the "search_library caps at 50 even for empty queries; supplemental has 272 entries; 222 are unreachable" gap.

1. `list_library({})` — default. Should return up to 50 rows, alphabetical by name, total = filtered population size.
2. `list_library({limit: 200})` — confirm you can pull supplemental's 272 entries across two pages.
3. `list_library({collection: "supplemental"})` then `list_library({collection: "core"})` — confirm each narrows correctly and the `total` reflects the filtered count.
4. `list_library({collection: "core", limit: 5, offset: 0})` then `{offset: 5}`, `{offset: 10}`. Confirm pages don't overlap and union = full core catalog.
5. `list_library({limit: 999})` — confirm `limit` caps at 200 in the response.
6. Sanity-check that every row has `fileId`, `name`, `collection`, `mimeType` (or null), `status` (defaults to `"active"`).

---

## Phase F — Don't-break-the-band sanity (browser, Claude in Chrome)

Same as v2 §7. Visit `/perform/setlist/<a real upcoming Shabbat setlist>`. Verify:
- Setlist title + tracks render.
- Tap a bonded chart — renders (PDF or image).
- Tap an image-typed chart (PNG / JPEG) — renders.
- The hard-refresh path of `/library` no longer regresses with the new `private, max-age=120` cache header.

---

## Phase G — Observability + diagnostics

- For ONE `import_chart_from_drive` call, pull Vercel runtime logs (`get_runtime_logs` MCP tool from Vercel if available, otherwise Vercel UI) for `[Upload <traceId>]` per-stage entries. v2 couldn't see them in `get_runtime_logs` output. Either confirm they're now visible (no change since v2) or note the gap remains.
- For ONE `bulk_update_tracks` rejection-by-position call, capture the full error envelope shape and paste it verbatim in the report.

---

## Phase H — Cleanup + report

1. Cascade-delete every `⚠️ V3` setlist and chart you created.
2. `search_library({query:"⚠️ V3"})` → `[]`.
3. `list_setlists({limit:20})` → no `⚠️ V3` entries.

## Report format

Same shape as your v2 report. Per-phase pass/fail table at the top. New findings get a severity tag (CRIT / HIGH / MED / LOW / NOTE) with repro + suspected cause + suggested fix. End with a verdict on the MCP-first author model.

**Particularly want to know:**
- Did H-4 actually close in your hands? (no caveats, no F5 needed past step 4)
- Did the Perform mode re-bond fail recur? (it MUST not — H-5 was blocking the band)
- Is generate_gig_packet usable as Daniel's Friday packet path?
- Did anything new surface that wasn't in v2?

If you find anything that breaks the MCP-first weekly flow OR the band's iPad consumer flow, flag it as CRIT and put it at the top of the report.
