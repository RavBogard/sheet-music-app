# MCP Claude-First Eval — Cowork Report

**Eval date:** 2026-05-15
**Production MCP:** https://www.centralreform.live/api/mcp
**Caller:** Rabbi Daniel Bogard (admin)
**Tools probed live:** 20 of the 22 advertised (notable absence: `delete_chart`, `get_matrix`)
**X32 monitor surface:** deferred to next run (hardware unavailable)

---

## Executive summary

Claude-first leader workflow is **maybe 55–60% of the way there**, and the missing 40% is concentrated in three places: (1) **there is no `clone_setlist` tool**, so the 90%-of-weeks bullseye flow takes ~20 round trips instead of one; (2) **there is no `update_track` tool**, so any per-row edit — vocal lead, key, notes — requires `remove_track` + `add_track_to_setlist`, which both loses the track's identity and creates a partial-failure cliff (I hit one mid-run and had to manually reconcile the setlist); and (3) **there is no `publish_setlist` / `notify_band` tool**, which means the very last step of every weekly cycle — "tell the band" — currently forces a UI fallback, defeating the chat-first promise. The read tools, `create_setlist`, `add_track_to_setlist`, `reorder_setlist`, `delete_setlist`, and the chart-ingest pair (`upload_chart`, `scrape_chart_from_url` → `save_scraped_chart`) all work well; `reorder_setlist` in particular is the cleanest tool in the surface — one call, full payload, deterministic. Library reads are fast and well-shaped for natural-language queries. Conversational fit is genuinely good for *intent expression* ("clone last week, swap song 3, drop the niggun") but the *cost* of executing that intent via MCP today is high enough that on iPad-between-meetings, the UI still wins by a wide margin on speed for any task touching more than ~3 tracks. Add `clone_setlist`, `update_track` (or `bulk_update_tracks`), and `publish_setlist`, plus a soft-delete window for safety, and the speed inversion flips — Claude becomes faster than the UI for the weekly cycle, and the leader-facing UI surface can credibly shrink to read-only/performance views within one product cycle.

---

## Part 1: Task battery

### Task 1 — Clone-and-tweak

- **completion:** yes (with fidelity loss on row types)
- **tool_calls:** 22 (1 list_setlists + 1 get_setlist + 1 search_library + 1 create_setlist + 18 add_track_to_setlist)
- **clarifications_needed:** 1 — multiple "Adon Olam" candidates in library (Folk, Hitman-Ben-Hur, mp3, two STRESS TEST copies); picked "Adon Olam (Folk)" without confirming
- **speed_feel:** ui_faster — in the UI Daniel can hit "Clone" then make 3 edits in ~30 seconds; this took 22 round trips and ~90s of latency
- **conversational_fit:** mixed — the *intent* is perfectly chat-shaped ("clone last week, replace song 3 with Adon Olam in G, drop the niggun"); the *execution* is not, because there is no clone primitive
- **missing_tool_gap:** `clone_setlist(sourceId, name, eventDate?, overrides?)`. Also: the `add_track_to_setlist` `type` enum only allows `song | header`, but existing rows in the source setlist are typed `reading` and `prayer` — those got rewritten as `type: "song"` free-text rows in the clone, which is **visible fidelity loss** for the leader. Also, the `title` argument was silently overridden by the library's display title when `songId` was passed (I asked for "Adon Olam" and got "Adon Olam (Folk)").
- **transcript (abbrev):**
  - `list_setlists()` → 30 results, most recent Shabbat = `NWPBba50fltX6pNcyOVK` "Service — May 15"
  - `get_setlist({id: NWPBba50fltX6pNcyOVK})` → 19 tracks including 2 readings + 1 prayer
  - `search_library({query: "Adon Olam"})` → 5 hits, picked `72a7aa6a-...` (Folk)
  - `create_setlist({name: "⚠️ EVAL T1 — Clone Test", eventDate: 2026-05-22, serviceType: "shabbat-evening"})` → `0ee76faf-...`
  - 18× `add_track_to_setlist` — header, song×8, free-text-for-Dvar-torah, header, song×2, free-text-for-V'ahavta, song, header, song, free-text-for-Silent-Prayer (skipped C-Saw Niggun closing)

### Task 2 — Bulk vocal-lead assignment

- **completion:** yes (but only after mid-run recovery from a partial failure)
- **tool_calls:** 26 (1 get_setlist + 24 remove/add pair calls + 1 recovery re-add)
- **clarifications_needed:** 1 — "songs 2/4/7" was ambiguous (track-index vs. song-index); resolved without asking because in this setlist the counts collapse
- **speed_feel:** ui_faster (significantly) — 12 dropdown clicks in the UI vs. 24+ round trips here
- **conversational_fit:** chat (intent) / spatial (execution) — vocal-lead-by-row begs for a column with a dropdown the user can drag through
- **missing_tool_gap:** **`update_track(setlistId, trackId, {leadMusician?, key?, notes?, title?})` is the headline missing tool of this entire eval.** Without it, changing one field on one row means destroying the row and rebuilding it. Two consequences observed live:
  - **Track identity is lost** on every edit — any external system holding `trackId` references (rehearsal app, sync state, comments-on-track) breaks silently.
  - **Atomicity cliff:** I hit one `connector's server isn't responding` error mid-batch (on the Adon Olam pair), which left the setlist with the song *removed* but not *re-added*. Subsequent pair operations on stale positions cascaded into a reorder swap (MizShiru ended up after MizDavid). I had to `get_setlist` to reconcile, re-add Adon Olam manually, and continue. **In the UI this category of error doesn't exist** because every cell edit is independent.
- **transcript (abbrev):** sequential `remove_track` + `add_track_to_setlist({songId, key, leadMusician, position})` pairs for Dodi Li, Shalom, Adon Olam, Shiru, MizShiru, MizDavid, LCha, Erev, Barchu, Shema, Mi Chamocha, Adonai sfatai. One mid-flight connector timeout on Adon's add → setlist temporarily inconsistent → manual recovery.

### Task 3 — Reorder by feel

- **completion:** yes
- **tool_calls:** 1 (just `reorder_setlist` with full 18-id payload)
- **clarifications_needed:** 1 — implicit. A liturgical setlist has fixed structural order (Kabbalat Shabbat → Ma'ariv → T'filah); reordering by energy *globally* breaks the service. In real use I'd ask Daniel "within sections, or do you want me to override the service structure?"
- **speed_feel:** **claude_faster** — one call vs. 17 manual drag operations
- **conversational_fit:** chat — energy/feel inference from titles+keys is exactly the sort of reasoning Claude is well-suited to and a UI can't help with
- **missing_tool_gap:** none for the mechanics. *Conceptually* missing: a row-attribute for "section anchor" so a reorder can preserve liturgical structure while reshuffling songs within it. Today the headers are just normal rows with `type: "header"`.
- **transcript:** single `reorder_setlist({setlistId, orderedTrackIds: [<18 ids>]})` → `ok: true`. The cleanest tool in the surface.
- **reordering rationale (for the record):** anchored slowest at the top — Adonai sfatai (Dm) and Silent Prayer (silence is the slowest tempo there is) — through V'ahavta (meditation) and Erev Shel Shoshanim (gentle Dm nigun), into L'Cha Dodi's moderate Carlebach groove, Shema's declaration, Dvar torah pause, Shalom Alechem's moderate greeting, Dodi Li, Barchu's walkdown building energy across the section header into Mizmor L'David (E major grandness), through the T'filah header into Mi Chamocha celebration, Mizmor Shiru, Shiru L'Adonai, climaxing on Adon Olam in G major as the joyous finale. **Caveat in the report:** I would not actually ship this — it dissolves the service.

### Task 4 — Insert reading + transition mid-service

- **completion:** partial (semantically lossy)
- **tool_calls:** 2 (two `add_track_to_setlist` calls)
- **clarifications_needed:** 0
- **speed_feel:** equal — UI is one drag-and-drop per insertion; MCP is one call per insertion. Comparable.
- **conversational_fit:** chat
- **missing_tool_gap:** **`add_track_to_setlist`'s `type` enum is narrower than the data model.** The data model supports `song | header | reading | prayer | transition` (observed in real setlist data), but the MCP schema only allows `song | header`. I added both rows as `type: "song"` free-text with the intended type recorded in the `notes` field as a stopgap. In the UI a "V'ahavta" row would render as a reading (distinct styling, no key/lead column); via MCP it renders as a song row with no chart. Same for the Niggun transition.
- **transcript:** `add_track_to_setlist({title: "V'ahavta", position: 4, notes: "reading..."})`, then `add_track_to_setlist({title: "Niggun", position: 5, notes: "transition..."})`.

### Task 5 — Upload from URL

- **completion:** yes (with version mismatch)
- **tool_calls:** 3 (scrape + save + add_to_setlist)
- **clarifications_needed:** 1 — `hebrewsongs.com` returned the Mordechai Ze'ira melody, not Carlebach. I'd want to ask Daniel: "the URL had Ze'ira's version; do you want Carlebach specifically, or is any Lecha Dodi fine?" In a real run I'd retry with a different URL.
- **speed_feel:** claude_faster (significantly) — scrape+save+attach is exactly chat-shaped; in the UI it's three modals
- **conversational_fit:** chat — the *most* chat-shaped task in the eval
- **missing_tool_gap:** the scrape result quality varies wildly by source. The `hebrewsongs.com` page returned lyrics-only (no chords). A meaningful improvement would be `scrape_chart_from_url({url, requireChords?: bool, versionHint?: string})`, or letting the model see candidate sources and pick.
- **transcript:**
  - `scrape_chart_from_url({url: "https://www.hebrewsongs.com/song-lechadodi.htm"})` → returned Mordechai Ze'ira lyrics-only, no chord notation
  - `save_scraped_chart({title: "⚠️ EVAL T5 — Carlebach Lecha Dodi", artist: "Carlebach", collection: "uploads", content: <annotated Carlebach Dm progression added by hand>})` → `upload-5f993fa9-...`
  - `add_track_to_setlist({setlistId: T1, songId: upload-5f993fa9-..., key: "D", position: 0})` → first row of T1

### Task 6 — Direct file upload

- **completion:** yes
- **tool_calls:** 2 (upload_chart + add_track_to_setlist)
- **clarifications_needed:** 0
- **speed_feel:** equal — comparable to drag-drop-then-attach in the UI
- **conversational_fit:** mixed — "upload this file" is easy to describe in chat, but for *iterating* on a chart (re-uploading after corrections), a UI affordance like an in-place replace is friendlier
- **missing_tool_gap:** none for happy-path. Wishlist: `replace_chart(fileId, newFileBase64, newMimeType)` so corrections don't generate orphan library entries.
- **transcript:** synthesized 594-byte valid PDF via Python in the sandbox, base64-encoded, called `upload_chart({title: "⚠️ EVAL T6 — Direct Upload", mimeType: "application/pdf", collection: "uploads", key: "G", bpm: 96, fileBase64: <594B PDF>})` → `upload-650361ae-...`. Then `add_track_to_setlist({setlistId: T1, songId: upload-650361ae-..., key: "G", position: 2})`.

### Task 7 — Library cleanup audit

- **completion:** yes (audit only — actual cleanup blocked, see T7 findings and Part 6)
- **tool_calls:** 2 (search "EVAL" + search "STRESS")
- **clarifications_needed:** 0
- **speed_feel:** claude_faster — searching by substring is faster in chat than scrolling the library UI
- **conversational_fit:** chat
- **missing_tool_gap:** **`delete_chart(fileId)` is advertised in the eval prompt as one of the 22 tools but is NOT exposed on the live MCP surface.** I confirmed via tool-search — only `upload_chart`, `scrape_chart_from_url`, `save_scraped_chart` are present from the chart-ingest set. This is a real shipping gap. Without it, *library hygiene is impossible via MCP.*
- **transcript:**
  - `search_library({query: "EVAL"})` → 2 entries (mine: T5 Carlebach, T6 Direct Upload)
  - `search_library({query: "STRESS"})` → **9 leftover** STRESS TEST entries from a prior run dated 2026-05-15:
    - upload-5bfac6d1 (PDF chart), upload-5caf2ede (not base64), upload-66dd16e4 (scraped Amazing Grace), upload-841fe659 (bad mime), upload-a0c31045 (**core probe**), upload-bb13317e (**supplemental probe**), upload-d2724f75 (Adon Olamx), upload-d7f4d5f4 (Adon Olam), upload-fc466d13 (MusicXML chart)
- **finding for the codebase pass:** the presence of `core probe` and `supplemental probe` in the leftover STRESS set is worth investigating — if those uploads succeeded into the `core` or `supplemental` collection, the G-3 collection guard either isn't enforced via MCP or wasn't yet at that run's commit.

### Task 8 — Doc → setlist (design probe)

- **completion:** design-only as instructed
- **tool_calls:** 0
- **proposed surface (3 tools):**

  1. **`import_document_to_outline(fileBase64, mimeType, fileName?)`** → returns `{outlineId, extractedStructure: [{title, key?, type, rabbiLed?}], confidence: 0..1}`. Wraps the existing UI ImporterModal `extract-document` + `extract-structure` steps. Stateless on the setlist side — produces a structured proposal Claude can negotiate over in chat.
  2. **`resolve_outline_to_library(outlineId, mappings?: Record<outlineRowIndex, songId | null>)`** → returns `{resolved: [{outlineIndex, songId, title, confidence}], unresolved: [outlineIndex]}`. Lets Claude either accept the server's auto-match or override a row before committing. Mirrors the resolve step in the UI.
  3. **`create_setlist_from_outline(outlineId, {name, eventDate, serviceType?, rabbi?, dropUnresolved?: bool, resolutionOverrides?})`** → returns the new `setlistId`. Combines the import → resolve → create into a single happy-path call when Claude doesn't need to negotiate.

  These three layer naturally: the simple case is one call (`create_setlist_from_outline`); the careful case is three (`import` → review → `resolve` → review → `create`). Both can be expressed in chat.

- **complexity:** medium. The UI flow already has all the pieces; this is mostly a wrapping job.
- **safety:** confirmation token on the create call (`confirm: outlineId`) prevents accidental creation; auto-match confidence should be returned so Claude can flag low-confidence rows to Daniel.

### Task 9 — Vocal-lead schedule (next 3 Shabbats)

- **completion:** partial — schedule inspection succeeded, reassignment attempt deferred (same gap as T2)
- **tool_calls:** 1 (`list_setlists({from: 2026-05-15})`)
- **clarifications_needed:** 0
- **speed_feel:** equal for the *inspection*; ui_faster for the *reassignment* (without `update_track`)
- **conversational_fit:** chat for the question ("who's leading what?"); spatial for the reassignment (multi-select column edit)
- **missing_tool_gap:** same as T2 — `update_track`. Also `bulk_update_tracks` would be ideal here (set vocal_lead = Randy where vocal_lead = Daniel on setlist X).
- **transcript:** `list_setlists({from: "2026-05-15"})` returned only 2 upcoming: today's "Service — May 15" and my EVAL T1 (May 22). Inspected EVAL T1: 9 songs led by Daniel, 3 by Randy. The "second upcoming" reassignment would require 9 remove+re-add pairs (18 calls) with the same partial-failure cliff demonstrated in T2 — I did not execute, since the finding is already documented.
- **observation:** **the upcoming-schedule view is itself sparse.** Daniel typically plans week-by-week, so beyond T1 (May 22) there's nothing in the system. A real "who's leading what for the next 3 Shabbats" answer requires *future setlists to exist*. This is partly a workflow point (Daniel only creates setlists ~a week out) and partly a product opportunity: a recurring `template_setlist` that auto-spawns N weeks out would let Claude answer this question meaningfully.

### Task 10 — Notify the band (gap probe)

- **completion:** confirmed gap
- **tool_calls:** 0
- **proposed surface:** `publish_setlist(setlistId, {recipients?: string[] | "band", channel?: "email" | "slack" | "sms", note?: string, includeChartsPdf?: bool, includeRehearsalLink?: bool, scheduleSendAt?: ISO})` → returns `{ok, deliveryId, recipientCount}`.
  - For CRC, `recipients: "band"` should resolve via the existing band roster (the `musicians` field on the setlist would be the obvious source).
  - `includeChartsPdf: true` would bundle the bonded charts into a single PDF — that's a leader's #1 ask post-publish.
- **complexity:** medium-high (needs email-template integration and roster resolution).
- **safety:** confirmation token, optional dry-run mode returning the rendered email + recipient list before send.

### Task 11 — Recovery / accidental-delete

- **completion:** yes (probe confirmed: no recovery)
- **tool_calls:** 4 (create + 2× add_track + delete + get_setlist for verify)
- **clarifications_needed:** 0
- **speed_feel:** n/a (recovery is impossible either way)
- **conversational_fit:** n/a
- **missing_tool_gap:** **no soft-delete, no undo window, no `restore_setlist`.** `delete_setlist` returned `{ok: true, tracksDeleted: 2}` and the subsequent `get_setlist` returned `{error: "Setlist not found"}`. Combined with the absence of `clone_setlist`, this is a real safety hole: a misclick on a long, hand-curated setlist would force Daniel to rebuild from scratch (~20+ tool calls if MCP-only).
- **proposed surface:**
  - `delete_setlist({id, softDelete?: bool = true})` — change default to soft; hard-delete becomes opt-in
  - `restore_setlist({id})` — within an undo window (24h?)
  - `list_setlists({includeDeleted?: bool})` — so Claude can find the soft-deleted ones to restore

### Task 12 — Pre-service mix prep (DEFERRED)

The X32 hardware is offline this run. Probe queued for next cycle. Spec on file in the eval prompt.

---

## Part 2: E2E narrative

**Scenario:** Wednesday morning. Daniel asks me to set up Friday evening + Saturday morning Bar Mitzvah, similar to last week's Friday plus a Halleluyah opener, Y'did Nefesh + Esa Einai per the Bar Mitzvah family, Randy on Lecha Dodi both services, band notified by tonight.

**Step 1 — Resolve library references.** I parallel-searched the library for Halleluyah, Y'did Nefesh, Esa Einai, Lecha Dodi. Results:
- Halleluyah → **empty.** **[CONTEXT-GAP]** In the UI Daniel would see a blank search result and instantly know it's not in the catalog. Via MCP I have to surface this in chat — "Halleluyah isn't in the library; is it under a different title, or should I upload one?" In this run I added it as a free-text song row with key G and noted the gap in the row's `notes` field.
- Y'did Nefesh → 1 hit (`Yad B'Yad - Y'Did Nefesh (Zweig)`). Picked it.
- Esa Einai → 2 hits. Picked `Esa Einai (Dropkin)` as the cleaner standalone over the medley.
- Lecha Dodi → many; picked `Lecha dodi (Yerushalmi)` as the version used in last week's Friday setlist.

**Step 2 — Friday setlist.** **[CLARIFICATION I would have asked Daniel:]** "When you say 'similar to last week's' do you mean the Service — May 15 Kabbalat Shabbat I cloned for T1, or one of the older Shabbat morning setlists?" Resolved as Service — May 15.

I `create_setlist({name: "⚠️ EVAL E2E — Shabbat Evening (May 22)", eventDate: "2026-05-22", serviceType: "shabbat-evening", serviceNotes: "..."})` → `f4c53ca3-...`. Then 6 `add_track_to_setlist` calls (Halleluyah free-text → Dodi Li → Shalom Alechem → Lechu Nranana → Lecha dodi (Yerushalmi, Randy) → Mi Chamocha).

**[HANDOFF observed:]** One of the 6 add calls failed (Shalom Alechem) with `connector's server isn't responding` — same class of failure that bit T2. I noticed because the response array had a hole, did a recovery `add_track_to_setlist({position: 2})` to restore Shalom, and the setlist was correct. **In the UI this category of error is invisible** — saves are debounced and retried client-side.

**Step 3 — Saturday Bar Mitzvah setlist.** **[CLARIFICATION I would have flagged:]** "Lecha Dodi on Saturday morning is liturgically nonstandard — it's a Kabbalat Shabbat song. Want me to add it anyway?" Honored Daniel's request and recorded the flag in the row's notes.

`create_setlist({name: "⚠️ EVAL E2E — Bar Mitzvah Morning (May 23)", eventDate: "2026-05-23", serviceType: "shabbat-morning", ...})` → `f11145e3-...`. Then 6 add_track calls (header → Y'did Nefesh → Esa Einai → Lecha Dodi Randy → Shema → Mi Chamocha).

**Step 4 — Notify the band.** **[UI-FALLBACK]** No `publish_setlist` tool exists. Daniel would have to switch to the UI for this last step. Honest verdict: this single missing tool collapses the chat-first narrative right at the finish line — every weekly cycle ends with this handoff.

**[CONTEXT-GAP observed throughout:]** the MCP doesn't surface band rosters, recent rehearsal attendance, or "who usually leads X". In the UI Daniel sees these in adjacent panels. Via MCP I'd want a `list_musicians()` or a `recent_leads_for_song(songId)` helper so Claude can suggest leads instead of asking Daniel for every row.

**Verdict on Claude-as-primary-leader-interface for this scenario:** the *creative and library-search portions* (resolve song refs, build the setlist outline, flag liturgical oddities, surface library gaps) feel native to Claude and faster than the UI. The *bulk-edit portions* (set leads on every row, fix the partial-failure cascade) are awkward and slower than the UI. The *publish-and-notify finale* is currently impossible via MCP and forces a UI handoff. Net: **Claude-first is plausibly faster than UI-first end-to-end for this scenario only after `publish_setlist`, `update_track`, and `clone_setlist` ship.**

---

## Part 3: Cross-task patterns

**Gaps that appeared in 3+ tasks (ranked by severity)**

1. **No `update_track`** — bit T2, T9 directly; bit T1 (couldn't override the library-title for Adon Olam); bit T4 (the only way to "set" the type after-the-fact would be to recreate the row). The single most consequential gap.
2. **No `clone_setlist`** — bit T1 directly; bit the E2E (modeling "similar to last week" required either rebuilding from scratch or doing 20+ add_track calls). The bullseye-flow gap.
3. **No `publish_setlist` / `notify_band`** — bit T10 and the E2E. Forces a UI fallback at the end of every weekly cycle.
4. **No `delete_chart`** — bit T7 and Part 6. Library hygiene is impossible via MCP today.
5. **`add_track_to_setlist` `type` enum is narrower than the data model** (missing `reading`, `prayer`, `transition`) — bit T1 (clone fidelity), bit T4 (insert fidelity), bit the E2E.
6. **No atomicity / no transactions** — bit T2 and the E2E directly via the partial-failure cliff; bit T11 conceptually (no rollback of a delete). When `update_track` lands it should be atomic per-track *and* there should be a `bulk_update_tracks` that's either all-or-nothing or returns a detailed per-row result.

**Conversational-fit patterns**

- **Naturally chat-shaped:** library search (T5, T7, E2E step 1), inferential reordering (T3), single-row inserts with semantic types (T4 minus the type gap), upload-then-attach (T5, T6), schedule inspection (T9 read side), "who's leading what" questions (T9 read side).
- **Mixed:** clone-and-tweak (T1) — the intent is chat-shaped but the execution wants a bulk primitive; bulk vocal-lead assignment (T2) — a column-multi-select in the UI is genuinely better than chat for >5 rows; whole-setlist reorder (T3) — works great in chat for *small* setlists but a 43-track Shabbat Morning would beg for a spatial preview.
- **Genuinely spatial:** the X32 monitor matrix (deferred) — even with great `set_send_*` tools, sound engineers want to see meters and EQ curves; drag-reorder of large setlists with visual energy/key context; rehearsal-time scratchpad editing.

**Context the UI shows implicitly that MCP should surface**

- **Library emptiness for a query** — UI shows "no results"; MCP needs Claude to volunteer this. (E2E Halleluyah.)
- **Recent-leads-per-song** — UI sidebar shows "Daniel led this 4 of last 6 times"; MCP has no equivalent helper.
- **Band roster** — `list_musicians()` doesn't exist; the setlist's `musicians` array is empty on most recent setlists.
- **Liturgical-section structure** — UI renders Kabbalat Shabbat vs. Ma'ariv vs. T'filah as visually distinct bands; MCP returns them as ordinary header rows. Claude has to infer.
- **Chart preview / "is this the right Lecha Dodi?"** — UI shows the PDF thumbnail; MCP returns only metadata. Claude can't confirm "this is the Carlebach one, not the Yerushalmi one" without a `get_chart_preview(fileId)` returning a thumbnail or first-page text.

**Safety / reversibility**

- **Bulk edits with no atomicity** are the single biggest near-miss. T2 hit a real partial failure live; recovery required manual reconciliation. A leader on an iPad won't know to do that.
- **Hard delete with no recovery** (T11) is a silent landmine — magnified by the absence of `clone_setlist`, since a misclick wipes out hours of curation.
- **Title silently overridden by library when `songId` passed** (T1) — small surprise, but a leader who expected their custom title to stick wouldn't notice the override happened.

---

## Part 4: Missing-tool wishlist (prioritized)

1. **`update_track(setlistId, trackId, patch: {key?, leadMusician?, title?, notes?, type?, songId?, referenceLink?})`** — unblocks T2, T9, the back half of every weekly cycle. **Low complexity** server-side (it's just a partial-row update). Safety: idempotent by design. **Highest leverage tool in this list.**

2. **`bulk_update_tracks(setlistId, patches: Array<{trackId, patch}>, mode?: "atomic" | "best-effort")`** — unblocks T2 and the "reassign Daniel→Randy" half of T9 in one call. Low-medium complexity (server-side loop). Safety: `mode: "atomic"` should default to atomic; `dry_run?: bool` flag for preview.

3. **`clone_setlist(sourceId, {name, eventDate?, overrides?: {keysByPosition?, leadsByPosition?, removePositions?, replacePositions?}})`** — unblocks T1 and the bullseye 90%-of-weeks flow. Medium complexity (deep copy + override layer). Safety: returns the new id without committing if `dry_run: true`.

4. **`publish_setlist(setlistId, {recipients?: string[] | "band", channel?: "email"|"slack"|"sms", note?: string, includeChartsPdf?: bool, includeRehearsalLink?: bool, scheduleSendAt?: ISO})`** — unblocks T10 and the E2E final step. Medium-high complexity (email template + roster + chart-bundle). Safety: confirmation token; optional dry-run returning the rendered email.

5. **`restore_setlist(setlistId)` + `delete_setlist({id, softDelete?: bool = true})`** — unblocks T11. Low complexity if backed by a `deletedAt` column with a 24-72h purge job. Safety: window-bound, audit-logged.

6. **`delete_chart(fileId)` + `list_charts({filter?: {prefix?, collection?, status?}})`** — unblocks T7 cleanup and the leftover STRESS TEST sweep. **Critical because it's advertised but missing.** Low complexity. Safety: refuse if any active setlist still references the fileId; bypass with `force: true`.

7. **`extend add_track_to_setlist.type enum`** to include `reading | prayer | transition` (and possibly `nigun`, `aliyah`) — unblocks T1 (clone fidelity), T4 (semantic inserts), and the E2E. Trivial schema change.

8. **`import_document_to_outline` / `resolve_outline_to_library` / `create_setlist_from_outline`** (T8 design) — unblocks the doc-driven import flow which today only exists in the UI's ImporterModal. Medium complexity (mostly wrapping existing code paths).

9. **`list_musicians()` + `recent_leads_for_song(songId)`** — surfaces the implicit context the UI shows about band membership and historical leads. Low complexity.

10. **`get_chart_preview(fileId)` returning a thumbnail or first-page text** — closes the "which Lecha Dodi is this?" gap when there are version variants. Medium complexity (probably already cached server-side for the UI thumbnails).

---

## Part 5: Conversational-fit verdict

**Clone-and-tweak workflows** → **Mixed.** Intent is perfectly chat-shaped; execution today is not, because there's no clone primitive. With `clone_setlist` + `update_track`, this becomes solidly **chat-shaped** and faster than UI.

**Per-row edits (vocal lead, key, notes)** → **Mixed today, chat with `update_track` / `bulk_update_tracks`.** A 1-3 row edit is chat-friendly even now; a 12-row edit (T2) needs bulk primitives or it stays UI-faster. Spatial-UI affordances (column multi-select with type-ahead) will still beat chat for very large setlists (>20 row edits at once), so even with bulk tools, this stays a **leader-decision-dependent** category.

**Library search / discovery** → **Chat-shaped.** Genuinely better than the UI for substring/key/BPM queries. The MCP search is fast and accurate. Only weakness: no thumbnail preview means version disambiguation has to be done by metadata alone.

**Schedule / planning ("who's leading what")** → **Chat-shaped for reads; mixed for writes** (same `update_track` gap).

**Publish / notify** → **Chat-shaped if `publish_setlist` ships.** Today, **UI-only.**

**Monitor / mix (deferred)** → **Spatial.** Even with great `set_send_*` tools, sound work wants real-time meters, EQ curves, scene snapshots. Claude can be a useful *assistant* here ("mute the bass send on Randy's mix"), but not a *replacement* for the mixer surface.

**Closing read.** The Claude-first leader-workflow vision is **genuinely viable for CRC**, but it sits behind a specific set of unlocks. Today: ship `clone_setlist`, ship `update_track` (or `bulk_update_tracks`), ship `publish_setlist`, ship `delete_chart` (it's literally advertised and missing), extend the row-type enum, add a soft-delete window. That set is maybe 2–4 weeks of focused work and *all of it has clear UI equivalents already in production*, so the server logic mostly exists — it's primarily a wrapping job. With those landed, the speed inversion flips: Claude-via-MCP is faster than UI for the 90%-week clone-and-tweak, faster for library work, faster for energy-aware reordering, faster for the document-driven import (T8), and competitive everywhere else except real-time mix work and very-large spatial reorders. The editor UI can credibly shrink to read-only and performance-time surfaces (the cantor's stand on Friday night, the rehearsal app, the chart viewer) without losing leader workflow. Without those unlocks, the current MCP is **useful as a sidecar to the UI** but not yet ready to be the primary surface.

---

## Part 6: Cleanup confirmation

### Setlists (all 4 deleted via `delete_setlist`)

| EVAL artifact | id | result |
|---|---|---|
| ⚠️ EVAL T1 — Clone Test | `0ee76faf-91f9-4ae9-94b8-9682127edf7a` | `{ok: true, tracksDeleted: 22}` |
| ⚠️ EVAL T11 — Throwaway | `572a3da0-82b2-49ac-8b97-4baa01afea35` | `{ok: true, tracksDeleted: 2}` (during T11 itself) |
| ⚠️ EVAL E2E — Shabbat Evening (May 22) | `f4c53ca3-0067-4381-a148-cde9b62f4349` | `{ok: true, tracksDeleted: 6}` |
| ⚠️ EVAL E2E — Bar Mitzvah Morning (May 23) | `f11145e3-add6-42a8-908b-d45ed0663225` | `{ok: true, tracksDeleted: 6}` |

Verification: `list_setlists({limit: 30})` after cleanup returned 30 entries, **zero of which contain "⚠️ EVAL"** in the name. ✅

### Charts — **CLEANUP BLOCKED**

`delete_chart` is **not exposed on the live MCP** (confirmed via tool-search and by re-scanning the full tool surface). Both EVAL charts I created during T5/T6 remain in the library:

| EVAL chart | fileId | status |
|---|---|---|
| ⚠️ EVAL T5 — Carlebach Lecha Dodi | `upload-5f993fa9-89bb-43a4-8686-97b8a0339959` | ❌ orphaned |
| ⚠️ EVAL T6 — Direct Upload | `upload-650361ae-8f1f-4633-a5fb-85aaaa5d9961` | ❌ orphaned |

**Action required from Daniel:** delete both via the web UI's library management screen, or via a backend admin tool, until `delete_chart` ships on MCP. Verification snippet for the synthesis run:

```
search_library({query: "EVAL"}) — should return [] after manual deletion
```

Also flagged (not mine; from a prior run, awaiting sweep):

- 9 leftover `⚠️ STRESS TEST 2026-05-15 — …` entries (PDF chart, not base64, scraped Amazing Grace, bad mime, **core probe**, **supplemental probe**, Adon Olamx, Adon Olam, MusicXML chart) — listed in detail under Task 7. Worth investigating whether the `core probe` and `supplemental probe` entries actually landed in their target collections or got rejected (G-3 collection guard probe).

### Other artifacts

No other state changes outside the EVAL prefix. No accidental writes to `core` or `supplemental` collections (T7-style probe deliberately not attempted this run; covered by the leftover STRESS TEST findings).

---

*End of report.*
