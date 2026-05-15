# MCP Stress-Test Follow-up Prompt — for Cowork-Claude

**Generated:** 2026-05-15 post-Wave-6 ship
**Production MCP:** https://www.centralreform.live/api/mcp
**Waves shipped since last stress test (commits on master):**
- Wave 4 — `3a8e4143` — admin gating on curated catalogs, get_matrix, delete_chart, schema fixes
- Wave 5 — `28e8b43c` — validation & correctness fixes (G-5..G-8, G-10)
- Wave 6 — `a817202e` — polish (G-11, G-13..G-17)

Confirm all three are READY in Vercel (production target alias
`sheet-music-app-git-master`) before running.

---

## Send this to cowork-Claude

```
You are a cowork test agent. Stress-test the CRC Music MCP server.
Endpoint: https://www.centralreform.live/api/mcp. Connect via OAuth
(your Claude Desktop / web connector should already be authorized as
Rabbi Daniel — admin role). Report findings as a markdown table at the
end. Be exhaustive but efficient: probe every tool surface, every error
path you can reach, and every regression target listed below.

Tool inventory (22 tools now live):

  Setlist reads (4):  list_setlists, get_setlist, search_library, get_song
  Setlist writes (6): create_setlist, update_setlist, add_track_to_setlist,
                      reorder_setlist, remove_track, delete_setlist
  Monitor (8):        list_monitor_buses, get_mix, get_matrix (NEW),
                      set_send_level, set_send_mute, set_bus_fader,
                      set_matrix_fader, set_matrix_mute
  Chart ingest (4):   upload_chart, scrape_chart_from_url,
                      save_scraped_chart, delete_chart (NEW)

### Phase 1 — Cleanup (validates delete_chart end-to-end)

The 2026-05-15 prior stress test left 9 stress-test charts orphaned in
production. Delete each via the new `delete_chart` tool. Successful
deletion of all 9 (especially the two in curated catalogs) is your
strongest single signal that Wave 4's delete_chart works.

🔴 Curated-catalog charts (highest priority — exercises G-3 + admin gate):
- upload-a0c31045-2e0c-4153-92a9-d13bc1ca96ee  (collection: core)
- upload-bb13317e-7db4-433d-baff-76d7f3bf178a  (collection: supplemental)

🟡 Uploads-collection charts (7):
- upload-d7f4d5f4-1142-475e-81b1-393bc6edf43d  (Adon Olam, text/plain)
- upload-5bfac6d1-544f-48fd-92b4-db4b614413d1  (PDF chart)
- upload-fc466d13-6a30-4ad8-8fe7-5fcc14b375ed  (MusicXML chart)
- upload-d2724f75-a8cf-43a9-9746-d4b69582af28  (Adon Olamx — fuzzy probe)
- upload-841fe659-c29e-4d82-9da3-c0841278e9a6  (bad mime probe)
- upload-5caf2ede-c877-4ebd-b341-d91f9d16e653  (invalid base64 probe)
- upload-66dd16e4-74b3-43d0-adf6-72c3040a4514  (scraped Amazing Grace)

For each:
1. Verify it exists via `get_song` or `search_library({query:"STRESS TEST"})`.
2. Call `delete_chart(fileId)`. Expected response: `{ok: true, deletedTracks: 0}`.
3. After the run, `search_library({query:"STRESS TEST"})` should return [].
4. Idempotent failure check: `delete_chart` on a now-deleted fileId →
   `{error: "Chart not found"}`.

### Phase 2 — X32 monitor state verification

The prior stress test wrote and then restored monitor commands on bus 3
while the X32 was likely powered off. Intended NET state:
- Bus 3 fader ≈ 0.7302052974700928
- Channel 19 ("Dan") on bus 3 = level 0, on: false (muted)

Procedure:
1. Call `list_monitor_buses` and report `bridge.lastSeenIso`,
   `x32Connected`, `clients`.
2. If `x32Connected: false`, skip the rest of this phase and surface as a
   finding ("can't verify; X32 reported off").
3. If `x32Connected: true` (and you have human confirmation the X32 is
   ACTUALLY on this time — the flag has been observed to be stale-true):
   a. `get_mix({busIndex: 3})` — report bus fader + level/on for
      channelIndex 19.
   b. Compare against expected. If diverged, the bridge replayed phantom
      writes while the X32 was off — note as evidence.
4. Test `get_matrix({})` (NEW Wave 4 tool) — expected: list of 6 matrix
   outputs each with `{index, name, fader, on}`. Report the fader values.
   This is a read-only sanity probe; do NOT write to matrix outputs.

### Phase 3 — Wave 4 regression sweep

For each, report PASS / FAIL.

- **G-3 curated-catalog admin gate:**
  - You (admin): `upload_chart({collection: "core", title:"test", ...})`
    → expected `{ok: true, collection: "core"}`.
  - `save_scraped_chart({collection: "core", ...})` → ok as admin.
  - Skip non-admin probes unless a non-admin test account is available.
  - After the test, delete the probe via `delete_chart`.
- **G-4 get_matrix tool:** (covered in Phase 2 above)
  - Also probe: `get_matrix({matrixIndex: 1})` → 1 matrix.
  - `get_matrix({matrixIndex: 99})` → schema rejection at MCP layer (max 6).
- **G-9 schema min:1 on bus/channel indices:**
  - `get_mix({busIndex: 0})` → MCP -32602 validation error
    (NOT runtime "Bus 0 not found").
  - `set_send_level({busIndex: 1, channelIndex: 0, level: 0.5})` → -32602
    on channelIndex.
- **delete_chart bonded-track guard:**
  - Upload a probe chart.
  - Add it to a new test setlist via add_track_to_setlist({songId:
    returned-fileId}).
  - Attempt `delete_chart(fileId)` → expected error "bonded to 1
    setlist track(s)".
  - Call `remove_track(...)` for the bonded row.
  - Re-attempt `delete_chart(fileId)` → ok.
  - Clean up the test setlist via `delete_setlist`.

### Phase 4 — Wave 5 regression sweep

- **G-5 fuzzy dedup on emoji-prefixed titles:**
  - Upload "⚠️ STRESS TEST <date> — Adon Olam".
  - Upload "⚠️ STRESS TEST <date> — Adon Olamx" → expected error
    "similar name". (This was the failing case in the prior test.)
  - Clean up: `delete_chart` the first probe.
- **G-6 scrape negative-result:**
  - `scrape_chart_from_url({url:"https://www.centralreform.live/no-such-page-12345"})`
    → expected `{error: "No chord chart detected..."}` or similar
    negative-pattern signal (NOT `{ok:true, title:"Song Not Found", ...}`).
- **G-7 mime tightening:**
  - `upload_chart({mimeType:"application/octet-stream", ...})` →
    error containing "application/octet-stream".
  - `upload_chart({mimeType:"application/zip", fileName:"weird.zip", ...})`
    → error "Unsupported mimeType".
- **G-8 base64 format validation:**
  - `upload_chart({fileBase64:"!!!not base64!!!", ...})` → error "RFC 4648".
  - `upload_chart({fileBase64:"abc", ...})` (not multiple of 4) → error
    "multiple of 4".
- **G-10 widened track type enum:**
  - On a test setlist: `add_track_to_setlist({type:"reading", title:"V'ahavta"})`
    → ok.
  - `add_track_to_setlist({type:"prayer", title:"Silent Prayer"})` → ok.
  - `add_track_to_setlist({type:"transition", title:"Interlude"})` → ok.
  - `add_track_to_setlist({type:"note", title:"Note"})` → ok.
  - `add_track_to_setlist({type:"bogus", title:"x"})` → MCP -32602.
  - Confirm via `get_setlist` that every row's type round-trips.
  - Clean up the test setlist.

### Phase 5 — Wave 6 regression sweep

- **G-11 update_setlist echo:**
  - Create a test setlist; call `update_setlist({id, name:"echo", ...})`
    → response includes `setlist: {id, name, eventDate, rabbi,
    serviceType, serviceNotes}`. Verify the patch is reflected without
    a follow-up get_setlist call.
- **G-13 search_library empty-query:**
  - `search_library({query:""})` → returns first 20 library entries.
- **G-14 list_setlists date validation:**
  - `list_setlists({from:"not-a-date"})` → tool error envelope
    `{error: "from must be an ISO date..."}` (NOT silent full-list).
- **G-15 search_library row shape uniformity:**
  - Every result row in `search_library` carries `status` (default
    "active" when the catalog row omits one).
- **G-16 create_setlist owner echo:**
  - `create_setlist` response includes `ownerId` and `ownerName`.
- **G-17 list_monitor_buses.bridge.clients doc:**
  - `list_monitor_buses` description mentions `bridge.clients`.
  - Response actually carries `bridge.clients` (number of connected
    bridge daemon clients).

### Phase 6 — Admin rate-limit (NEW from Wave 4)

Wave 4 added an admin-bypass to `checkUserRateLimit`. The admin role
(you, Daniel) is no longer capped at 10/min upload or 20/min ai. Burst-
test it:

- Upload 15 distinct probe charts in quick succession (use unique
  titles like "⚠️ RL TEST <i>"). Expected: all 15 succeed without any
  "Too many requests" error.
- Delete all 15 via `delete_chart`.
- This confirms the admin bypass works in production.

### Reporting format

At the end, produce a markdown report with:
1. **Phase 1 cleanup table** — fileId × deletion result.
2. **Phase 2 X32 state** — bridge status + comparison vs expected.
3. **Phases 3–6 regression table** — finding × wave × status (PASS/FAIL/
   UNTESTABLE) × notes.
4. **NEW findings (H-1, H-2, ...)** — anything surprising or broken that
   wasn't on the regression checklist. Severity (CRIT/HIGH/MED/LOW),
   reproduction steps, suspected root cause, suggested fix.

Take this seriously: the goal is to find what's still broken before the
v7.1 milestone proper kicks off. If something is gated or borderline,
note it — don't gloss.
```

---

## Process notes for me (post-run)

After the cowork run completes:

1. Move successful cleanup items out of `.paul/research/mcp-next-stress-test-prep.md`
   Section A (fileIds deleted).
2. Update X32 verification in Section B (mark verified or carry forward).
3. Drop the regression items that came back green from Sections C/D/E.
4. Add any NEW H-* findings to a fresh `.paul/research/mcp-stress-test-2026-05-15-followup-REPORT.md`.
5. Write a new wave-plan if H-* findings warrant one. If the suite is
   clean, this is the production-ready end of the MCP stress-test cycle.

---

## Pre-run sanity checks

Before sending the prompt:
- [ ] Vercel deployment for commit `a817202e` is READY.
- [ ] `https://www.centralreform.live/api/mcp` responds (curl it).
- [ ] Daniel confirms whether the X32 is actually powered on (Phase 2
      conditional). If no, tell the cowork to skip Phase 2.
