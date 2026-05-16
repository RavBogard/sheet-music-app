# CRC Music — Autonomous Bug-Stomp Stress Test (Full Product)

**Goal:** Find and surface every defect that would degrade Rabbi Daniel's MCP-first weekly authoring flow OR the band's iPad consumer flow, across the entire centralreform.live product. Run autonomously over a multi-hour budget. You are looking for the rough edges Daniel hasn't seen yet because he doesn't usually exercise the full surface in one sitting.

**Target:** Production `https://www.centralreform.live` (apex 307s to www).
**MCP endpoint:** `https://www.centralreform.live/api/mcp`.
**Identity for all tests:** Daniel Bogard (admin), UID `93Xn3DbS0bSNb8zmfzLyfOMX1A13`. Verify with `list_monitor_buses` returning `isPrivileged: true`. If a token swap happens mid-run, abort and report.

**Branch tip expected:** `b3f78850a` or later. **Tool count expected:** 35.

---

## Operating principles

1. **Triage as you go.** Every finding gets a severity (`CRIT`, `HIGH`, `MED`, `LOW`, `NOTE`) and a structured entry — see the report format at the end. Stop-the-world rules:
   - **CRIT bar:** anything that breaks Daniel's MCP-first weekly flow OR the band's iPad consumer flow ON Friday or Shabbat morning. If you find one, drop everything else and produce the report immediately so it can ship before service.
   - If you find a security-shaped issue, mark CRIT and surface immediately — but **do NOT exploit it further**. One repro, one report entry, stop probing.
   - Performance issues that block a real flow (page never loads, write never completes) are CRIT. Slowness alone is MED.

2. **Verification discipline.** Every claim of failure needs:
   - The exact tool call or browser action that triggered it
   - The complete error envelope, console output, or HTTP response — verbatim, not paraphrased
   - A suspected cause (re-read the relevant code area if needed, but DON'T spend more than ~5 min per cause — a guess plus "needs investigation" is fine)
   - A suggested fix shape (one paragraph, not a PR plan)

3. **Stay within your authority.** You are allowed to:
   - Create `⚠️ BUGSTOMP YYYY-MM-DD <suffix>` setlists, charts, and library entries — clean them up at the end.
   - Modify your own user prefs / notification settings — restore at the end.
   - Read any setlist or chart Daniel owns.
   - Probe error paths (bad inputs, missing IDs, oversize payloads, expired sessions, etc).

   You are NOT allowed to:
   - Publish a real setlist to the band (`publish_setlist({dryRun: false})` on any non-`⚠️ BUGSTOMP` setlist).
   - Delete any chart you didn't upload, any setlist you didn't create, or any user account.
   - Change monitor mix faders during a real service (look up the next service date in the setlist list — abort monitor-write tests if a setlist for "today" exists and is bonded).
   - Send SMS or email through any unmocked path. SMS is in `publish_setlist`; that's gated by `dryRun` and a first-publish-only rule, but err on the side of `dryRun: true` everywhere.

4. **Cleanup contract.** At the end:
   - `search_library({query: "⚠️ BUGSTOMP"})` → `[]`
   - `list_setlists({limit: 20})` shows no `⚠️ BUGSTOMP` entries
   - Any setlist you created via cleanup ALSO got `delete_setlist`'d (deletes cascade tracks)
   - Restore your user prefs.

5. **Budget triage.** This prompt has ~9 phases. If you're running long, finish whatever phase you're in, write the partial report, and explicitly note which phases were not run.

---

## Phase 1 — MCP surface shake (all 35 tools, every error path)

For each tool, exercise:
1. The happy path with valid input.
2. At least one error path (missing required field, invalid id, role denial if applicable, oversize, malformed).
3. The interaction with at least one other tool (e.g. `create_setlist` → `add_track_to_setlist` → `get_setlist` → `delete_setlist`).

Tool inventory (35):

**Setlist reads (4):** `list_setlists`, `get_setlist`, `search_library`, `get_song`.
**Library reads (3):** `list_library`, `get_chart_status`, `verify_setlist_charts`.
**Setlist writes (11):** `create_setlist`, `update_setlist`, `add_track_to_setlist`, `reorder_setlist`, `remove_track`, `delete_setlist`, `update_track`, `bulk_update_tracks`, `bulk_add_tracks`, `publish_setlist`, `swap_chart`.
**Monitor (8):** `list_monitor_buses`, `get_mix`, `get_matrix`, `set_send_level`, `set_send_mute`, `set_bus_fader`, `set_matrix_fader`, `set_matrix_mute`.
**Chart ingestion + I/O (9):** `upload_chart`, `import_chart_from_drive`, `scrape_chart_from_url`, `save_scraped_chart`, `delete_chart`, `download_chart`, `generate_gig_packet`, `request_chart_upload_url`, `finalize_chart_upload`.

**Pay particular attention to:**
- **Error envelopes:** every tool should return `{error: "<helpful message>"}` for validation failures, NOT a raw exception. If you see a stack trace or `MCP error -32603` (internal server error), that's HIGH.
- **Auth gates:** Daniel is admin, so most things pass. But `delete_chart` on a curated catalog and `set_matrix_*` have stricter gates — confirm the role check fires correctly for non-admin tokens IF a test musician account exists; otherwise note "couldn't test stricter-than-admin gates without a second account".
- **Force flags:** `upload_chart`/`import_chart_from_drive`/`save_scraped_chart`/`finalize_chart_upload`/`publish_setlist` all accept `force: true`. The non-force error message MUST name the `force: true` flag verbatim. Confirm on at least one of each.
- **Rate limits:** burst 10+ calls in <1 minute on a write tool. Daniel is trusted-leader so should bypass; record the response to confirm.

---

## Phase 2 — Chart upload paths (B-001 verification + edge cases)

This is the highest-leverage new capability shipped today. Confirm cowork agents can ship real charts.

1. **Tiny file (inline):** `upload_chart` with a 5 KB synthetic PDF. Confirm fileId returned, chart appears in `/library` Uploads tab within ~2s.

2. **Real-world chart (chunked):** Pick a Drive PDF you can access (or create a ~500 KB synthetic PDF locally). Two-step flow:
   - `request_chart_upload_url({title, mimeType, sizeBytes})` → record `uploadSessionId`, `uploadUrl`, `expiresAt`.
   - `curl -X PUT --data-binary @file.pdf -H "Content-Type: application/pdf" "<uploadUrl>"` (or your shell's equivalent).
   - `finalize_chart_upload({uploadSessionId})` → record fileId.
   - Verify chart appears in `/library` Uploads tab.
   - Bond to a `⚠️ BUGSTOMP` setlist row via `add_track_to_setlist`.
   - Open `/perform/setlist/<id>` in Chrome via Claude — chart renders, no console errors.

3. **Edge probes for the upload session flow:**
   - `finalize_chart_upload` without uploading bytes first → expected: "No bytes found at the staged path".
   - `finalize_chart_upload` on a session ID that belongs to a different user → expected: "does not belong to caller". (Hard to test as admin; note as untested if no second account.)
   - `finalize_chart_upload` twice on the same session → expected: second call returns "already finalized".
   - Expired session: request a URL, wait 11 minutes, try to PUT — Storage should reject with 403/expired. (Skip if 11 min would blow the budget; note as untested.)
   - Oversize: `request_chart_upload_url({sizeBytes: 30_000_000})` → expected: rejected at request time with "exceeds the per-session cap".

4. **Force override on finalize:** Upload a chart twice with the same title; second call without `force` must fail with the `duplicate_exact` message that names `force: true`. Repeat with `force: true` — succeeds.

5. **Drive-import path:** `import_chart_from_drive({driveFileId, title: "⚠️ BUGSTOMP drive"})`. Confirm fileId returned, chart bondable.

---

## Phase 3 — Chart verification family (A-001 / B-002 / B-003 / L-001)

1. **`get_chart_status` happy path:** any fileId from `list_library` → `{status: "ok"}`.
2. **`get_chart_status` on bogus id:** `get_chart_status({fileId: "not-real-id-99"})` → `{status: "missing"}`.
3. **`verify_setlist_charts` on a healthy setlist:** Pick a real recent setlist. Should return ok counts matching trackCount.
4. **`verify_setlist_charts` on a `⚠️ BUGSTOMP` setlist with a synthetic broken bond:**
   - Create setlist, `add_track_to_setlist({songId: "deliberately-bogus-songid"})` — this will fail at the songId-not-found check, so instead: add via real songId, then `update_track({songId: "deliberately-bogus"})` (also blocked). Alternative: bond a real songId, then `delete_chart` it (will refuse if bonded). So manufacture the orphan state by: upload chart → bond to row → delete the underlying Storage blob via Vercel admin (skip if no access; note as "couldn't manufacture orphan without admin-access workaround").
   - If you CAN get a broken bond into a setlist, run `verify_setlist_charts` and confirm `missingCount > 0`, the row's `health.status: "missing"`.
5. **`publish_setlist` pre-flight on a broken-bond setlist:**
   - Use the same broken setlist from step 4 (or skip if no orphan).
   - `publish_setlist({setlistId, dryRun: true})` → response includes `chartHealth.unhealthy[]` listing the broken rows.
   - `publish_setlist({setlistId})` (no force) → refuses with error naming `force: true`.
   - `publish_setlist({setlistId, force: true, dryRun: true})` → succeeds (dryRun, so no dispatch); `chartHealth.unhealthy` still populated.
6. **`markOrphaned: true` opt-in:** `verify_setlist_charts({setlistId, markOrphaned: true})` on the broken setlist. Confirm `orphanedMarked` > 0, then `get_song({id: <orphaned-fileId>})` shows `status: "orphaned"`, then `search_library({query: <title>})` does NOT return it. `search_library({query: <title>, includeOrphaned: true})` does.

---

## Phase 4 — Browser exercise: Daniel's MCP-first authoring flow

Run via Claude for Chrome on Daniel's signed-in session. **Screenshot every page you visit** for the report. Watch the browser console — any error or warning is a candidate finding.

1. **`/library` page:**
   - Page loads in <2s. No console errors or warnings.
   - All 4 tabs render counts (CRC Charts, Shireinu, Uploads, Audio). Tab counts agree roughly with what `list_library` returns (small drift OK from the chart-only filter).
   - Search box: type "shalom rav" — does it find `Shalom_rav` underscored variants? (L-003 verification — should now.)
   - Filter pills (key, topic, recency) work; clearing them restores full list.
   - Click a chart → opens in viewer. PDF renders. Back button returns to library with state preserved.

2. **Setlist list page (`/setlists` or whatever the route is — find it via nav):**
   - Lists upcoming + recent setlists with event dates.
   - Click into the most recent published setlist.

3. **Setlist editor page for a setlist YOU created via MCP (the `⚠️ BUGSTOMP` one):**
   - Confirm the rows you added via MCP appear in correct order.
   - Try the in-app row reorder (drag-drop). Confirm `order` values stay contiguous (S-002 lurking — flag if you see gaps in the data even when the UI looks fine).
   - Try the in-app "swap chart" affordance (if it exists). Compare ergonomics to MCP `swap_chart`.

4. **Print pipeline:**
   - Open the in-app gig-packet print preview for a setlist. Compare against `generate_gig_packet` MCP output for the same setlist — should be equivalent content (in-app may add a cover sheet; that's expected).

5. **MCP author-only surfaces that the in-app UI no longer exposes:**
   - `verify_setlist_charts` and `get_chart_status` have no in-app UI today. Note whether the in-app library should expose a "broken bond" badge alongside `status: orphaned` (operator visibility).

---

## Phase 5 — Browser exercise: the band's iPad consumer flow

Same browser session, simulating an iPad-shaped viewport (toggle Chrome dev tools device emulation to iPad Pro). Watch console aggressively.

1. **`/perform/setlist/<id>` for a real upcoming Shabbat setlist:**
   - Setlist title + tracks render.
   - Tap a bonded PDF chart — Perform mode opens; chart renders. NO "Image failed to load." NO console stack traces. **If you see thousands of lines of React/PDFViewer stack traces on a chart fail, that's V4-finding-2 (E-001 from the punch-list): no inline user-visible message, just noisy console.**
   - Tap an image-typed chart (PNG/JPEG) — renders.
   - Tap a HEIC chart (the server should have converted to JPEG on upload) — renders.
   - Tap a MusicXML chart — renders or shows a sensible "open in viewer" affordance.
   - Tap a text-content chart (scraped chord chart) — renders monospaced.
   - Tap a chart of an unsupported type or a known-broken row — confirm there's an inline message ("Chart not loading — file may have been moved or deleted").

2. **Perform mode toolbar:**
   - Transpose up/down — chart re-renders in new key (or shows a "transpose not supported for this chart type" message; either is acceptable).
   - Annotation tool: draw a circle. Save. Refresh. Annotation persists.
   - Metronome: toggle on/off. BPM matches the track's BPM if set.
   - Zoom: pinch / +/- buttons work.

3. **Setlist navigation:**
   - Swipe / arrow keys / next-track button moves to next row.
   - "Back to setlist" returns to list view with the current track highlighted.

4. **Sharing path:**
   - Open the same setlist URL in an incognito Chrome window (no login). Confirm setlist + chart bytes still render (charts are intentionally public per [[feedback_chart_access_policy]]).

---

## Phase 6 — Console + network watchdog

This phase is a passive scan, not a script — pay attention while doing Phases 4–5.

**For every page visited:** record any console output that's not informational:
- `console.error` — always flag, even if it doesn't visibly break anything.
- `console.warn` with "deprecated", "404", "failed", "missing", or "undefined" — flag.
- Network 4xx/5xx in the dev-tools Network tab — flag, with the requested URL and status.
- React hydration mismatch warnings — flag.
- Unhandled Promise rejections in the console — flag.
- Slow requests (>2s on production for a single JSON API call) — note but don't flag unless they block UX.

**Common quiet failures to look for specifically:**
- Firebase auth state warnings ("onAuthStateChanged received no user", "service worker not ready")
- PDF.js worker load failures (regression risk for [[feedback_react_pdf_worker]])
- React minified errors (e.g. `Minified React error #418` — hydration; surface the digest so the dev can decode)
- Vercel build / RSC prefetch 503s (v3 NOTE-5 was one of these)

Report aggregated counts per page: "5 errors, 2 warnings, 1× 503 on /library?_rsc=… (recovered)". A single recovered transient is NOTE; consistent failures are HIGH or MED.

---

## Phase 7 — End-to-end weekly flow simulation

Time-box: 30 minutes. This is the load-bearing flow Daniel actually runs every Friday.

1. **Clone-and-tweak:** Find last week's setlist via `list_setlists`. `get_setlist` it. Create a new `⚠️ BUGSTOMP weekly` setlist with `create_setlist`. `bulk_add_tracks` the same tracks (use the original setlist's track titles + songIds).

2. **Tweak a few songs:** `swap_chart` on 2–3 rows to different songs (find variants via `search_library`). `update_track` to change the key on one row.

3. **Add one new chart from scratch:**
   - Via `request_chart_upload_url` + curl PUT + `finalize_chart_upload` (a real ~500 KB PDF if available, synthetic otherwise).
   - `add_track_to_setlist` to bond the new chart.

4. **Verify before publish:** `verify_setlist_charts({setlistId})`. Every row should be ok. If any row fails, that's a CRIT — the workflow you just performed produces broken bonds, which is what we're trying to prevent.

5. **Pre-publish dry run:** `publish_setlist({setlistId, dryRun: true})`. Confirm the recipient plan looks correct and `chartHealth.unhealthy` is empty.

6. **DO NOT actually publish.** Just confirm the dryRun returned ok.

7. **Generate gig packet:** `generate_gig_packet({setlistId})`. Open the PDF. Verify it's printable; spot-check 2–3 random pages render correctly.

8. **Cleanup:** `delete_setlist` (cascades tracks). `delete_chart` on the new upload.

**Total round-trips:** approximately 1× clone + 1× create + 1× bulk_add + 3× swap + 1× update + 3× upload-flow + 1× add_track + 1× verify + 1× publish dryRun + 1× generate_gig_packet + 1× delete_setlist + 1× delete_chart = ~16 MCP calls. If this takes more than 5 minutes of real time end-to-end, that's a HIGH — Daniel does this weekly and needs it fast.

---

## Phase 8 — Performance + reliability probes

1. **MCP latency:** time `get_setlist` for a real ~20-track setlist. Should be <500ms p50, <1.5s p99. Repeat 5 times.

2. **Bulk operation scale:** create a `⚠️ BUGSTOMP scale` setlist; bulk_add_tracks with 30 rows in one call. Time it. Should be <3s. Then bulk_update_tracks with 30 patches. Same target.

3. **Library scan size:** `list_library({limit: 200})` — record `total`. Should be in the 400-600 range based on past runs.

4. **Concurrent edit safety (S-001 / A-002):** While editing a `⚠️ BUGSTOMP` setlist via MCP, open the in-app editor for the same setlist in Chrome and make a change there (rename a row). Then try `update_track` on the row you renamed. Does it succeed? Conflict? Stale-trackId error? Record exact behavior.

5. **PDF chart render time:** in Perform mode, time the first paint of a ~2 MB PDF on a cold load. Should be <3s. >5s is MED.

---

## Phase 9 — Final triage + cleanup + report

1. **Cleanup gate:** before writing the report, run:
   - `search_library({query: "⚠️ BUGSTOMP"})` → must be `[]`
   - `list_setlists({limit: 20})` → no `⚠️ BUGSTOMP` entries
   - Any user-pref change you made — restored.

2. **Re-confirm CRITs:** if you found anything that breaks the MCP-first weekly flow or the iPad consumer flow, re-run the repro one more time to confirm it's reproducible (not a one-off network blip).

3. **Write the report.**

---

## Report format

Save to `outputs/bugstomp-report-2026-05-16.md`. Structure:

```markdown
# CRC Music Bug-Stomp Report — <date>

## Verdict
One-sentence summary. If CRITs found: "CRIT × N — Daniel should not publish until <X>."
If clean: "Clean across <N> phases — MCP-first flow + iPad consumer flow both verify end-to-end."

## Phase pass/fail table
| Phase | Subject | Verdict | Notes |
|-------|---------|---------|-------|

## Findings

For each finding, in severity order (CRIT first):

### <ID> — <one-sentence title> (<SEVERITY>)
**Surfaces in:** <which phase / page / tool>
**Repro:**
1. <exact step>
2. <exact step>
**Observed:** <verbatim error / console output / screenshot reference>
**Suspected cause:** <one paragraph; can be "unclear, needs investigation">
**Suggested fix:** <one paragraph>
**Blast radius:** <one sentence — does it block Daniel's weekly flow? band's iPad flow? cosmetic?>

## Phase G: Console + network watchdog summary
| Page | Errors | Warnings | 4xx/5xx | Notes |
|------|-------:|---------:|---------|-------|

## Performance numbers
| Probe | Measurement | Target | Status |
|-------|------------:|-------:|--------|

## Particularly want to know
- Did anything in this round threaten the MCP-first weekly flow?
- Did anything in this round threaten the iPad consumer flow?
- Did any chart upload (inline or chunked) fail end-to-end?
- Did publish pre-flight catch a real broken bond?
- Did Perform mode regress for ANY chart type?

## Phases not run
List any phases skipped + the reason (budget, missing access, etc).

## Artifacts kept for inspection
- Screenshots: <paths>
- Sample PDF / gig packet: <paths>
- Cleanup confirmation: <paste of cleanup queries returning [] / no entries>
```

---

## Final notes for cowork

- This is an **autonomous** run. You decide the order within phases. The only hard ordering is: Cleanup must come last.
- If you discover something the prompt didn't anticipate (a whole class of bug, a new tool surface, an undocumented endpoint), include it in the report under a `## Discoveries beyond the prompt` section.
- If you find yourself fighting the test harness (e.g. Claude for Chrome can't render some page), report that as a finding too — the test environment is part of the product surface.
- **Don't fabricate.** If a test was skipped, say so. If a finding is suspected but not confirmed, mark it suspected and explain what would confirm it. Daniel's calibration of trust in this report depends on every claim being verifiable.
