# Central Reform MCP — Stress Test Report

**Date:** 2026-05-15
**Run window (UTC):** ~12:00 – 12:14
**Tester:** Claude (Opus 4.7) as Daniel Bogard (admin, sound-engineer-privileged — confirmed via `list_monitor_buses.isPrivileged=true` and presence of the `matrices` block)
**Server:** `https://www.centralreform.live/api/mcp`
**Tools available:** 20
**Tools exercised this run:** 18 of 20 (2 matrix-write tools intentionally skipped — see Safety summary)
**Setlists created during test:** 2 (both deleted at end)
**Stress-test setlists also cleaned up from prior run:** 2 orphans (`982b7ee8…`, `0c734209…`) — yesterday's tester had no `delete_setlist` to use
**Charts uploaded:** 10 (all need manual cleanup — no `delete_chart` tool exists). See Safety summary for fileIds.

---

## 1. Run metadata

| Phase | What was exercised | Outcome |
|---|---|---|
| 1 — Existing-tool reads | `list_setlists` (default, limit, from/to, bad-date), `get_setlist` (real, missing), `search_library` (text, empty, key, BPM range, inverted range, case sensitivity), `get_song` (real, missing) | Done |
| 2 — Setlist metadata writes | `create_setlist` (happy, fully-populated, bad date, empty name), `update_setlist` (happy, missing id, bad date, echo verification) | Done — F-9 fix confirmed |
| 3 — Chart upload | `upload_chart` text / PDF / MusicXML / dedup / fuzzy-dedup / `collection: core` / `collection: supplemental` / bad mime / empty body / empty title / non-base64 fileBase64 | Done — multiple new findings |
| 4 — Scrape + save | `scrape_chart_from_url` rawText / valid public URL / 404 / Cloudflare-protected (Ultimate Guitar) / missing args / bad URL; `save_scraped_chart` happy / empty title / empty content / duplicate | Done |
| 5 — Track ops | `add_track_to_setlist` songId / free-text / header / position:0 / nonexistent setlist / nonexistent song / missing title-on-header; `reorder_setlist` happy / incomplete / duplicate-id / unknown-id; `remove_track` happy / unknown track / unknown setlist | Done — F-4 fix confirmed |
| 6 — Monitor reads | `list_monitor_buses` ×2; `get_mix` default / explicit busIndex / bus with live data / busIndex 999 / busIndex 0 | Done |
| 7 — Monitor writes | `set_send_level` (write + restore); `set_send_mute` (write + restore); `set_bus_fader` (write, verified propagation, restored to original `0.7302052974700928`); `set_matrix_fader` and `set_matrix_mute` **NOT TESTED** — see G-2, G-4 in findings | Partial |
| 8 — delete_setlist | Missing id, populated setlist with 4 cascaded tracks, double-delete idempotency | Done — F-10 fix confirmed |
| 9 — Cleanup | 4 setlists deleted (2 mine + 2 orphans from 2026-05-14); `list_setlists from:2099-01-01` returns `[]`; 10 stress-test charts remain in library (no delete tool) | Setlists clean; chart cleanup pending |

### Categories skipped, and why

- **`set_matrix_fader`** and **`set_matrix_mute`** — intentionally not exercised. (a) No `get_matrix` / matrix-state read tool, so the safety-rail "record current value, change, verify, restore" pattern is structurally impossible for matrix outputs; (b) midway through monitor write testing Daniel noted that the bridge PC and X32 should normally be off at this time of day, raising the possibility that the bridge is reporting stale cached state and silently queueing commands that would fire when the hardware actually powers back up. See G-2 and G-4.

---

## 2. Regression check on F-1 .. F-12

| ID | Severity | Status | Evidence |
|---|---|---|---|
| **F-1** | medium | **unchanged** | `create_setlist` response key is `setlistId`; `get_setlist` response key is `id`. Wrote `serviceType: "shabbat-evening"` via `update_setlist`; `get_setlist` echoed it back as `templateType: "shabbat-evening"`. |
| **F-2** | low | **unchanged** | `list_setlists({from:"not-a-date"})` returned the full list (20 entries) silently. |
| **F-3** | medium | **unchanged (and inconclusive on BPM inclusivity)** | No library entries surfaced during this run carried a BPM value. Inverted range `bpmMin:200, bpmMax:50` returned `[]` rather than erroring. |
| **F-4** | high | **fixed ✅** | `add_track_to_setlist({..., referenceLink:"https://example.com/stress-test-ref-link"})` followed by `get_setlist(id)` returned the track with `"referenceLink": "https://example.com/stress-test-ref-link"`. |
| **F-7** | low | **unchanged (no contradicting evidence)** | Per brief — not specifically reproduced. |
| **F-8** | low | **unchanged (no contradicting evidence)** | Per brief — not specifically reproduced. |
| **F-9** | medium | **fixed ✅** | `create_setlist({eventDate:"not-an-iso-date"})` now returns MCP `-32602` with payload `{"path":["eventDate"],"message":"eventDate must be an ISO date string"}`. Confirmed twice — once on `create_setlist` and once on `update_setlist`. |
| **F-10** | medium | **fixed ✅** | `delete_setlist` exists; happy path: `{"ok":true,"tracksDeleted":4}`; double-delete is `{"error":"Setlist not found"}`. Cascade verified. |
| **F-11** | low | **unchanged (no contradicting evidence)** | Per brief. |
| **F-12** | low | **unchanged (no contradicting evidence)** | Per brief. |

---

## 3. New findings (G-1 … G-17, severity-sorted)

### G-1 — critical — Monitor write commands return `ok:true` with no propagation signal, and propagation is non-deterministic across tools

`set_send_level({busIndex:3, channelIndex:19, level:0.05})` → `{"ok":true,"commandId":"nTZ3wYhDLnbqTwAZpvfZ"}`. 3 seconds later `get_mix({busIndex:3})` showed `channel 19 → level: 0`. `set_bus_fader({busIndex:3, level:0.7402...})` → `{"ok":true}`. 4 seconds later `get_mix` showed `fader: 0.7399...` (X32 14-bit quantization, expected).

`set_bus_fader` propagated. `set_send_level` did not (visibly). Mid-test an anomalous `channel 1 (Kick) level: 0.144` appeared on bus 3 — a value never written by the tester. After restore-cycle it was gone. Net: agent has no reliable in-the-loop signal whether monitor commands actually applied. `commandId` is opaque; no `get_command_status` tool.

**Suggested fix:** Return command-application status. Options: (1) block until bridge confirms OSC echo, return new value; (2) `get_command_status(commandId)`; (3) at minimum `{ok:true, pending:true}` so callers can poll.

### G-2 — high — `bridge.status: "online"` and `x32Connected: true` can be fresh-yet-stale (clients-count is undocumented)

`list_monitor_buses` at the start: `bridge.lastSeenIso: 2026-05-15T12:00:16Z`; 13 min later: `2026-05-15T12:11:16Z`. Both report `status:"online", x32Connected:true, clients:0`. Daniel observed mid-test that the bridge PC and X32 should normally be powered off at the time the test ran. The MCP can't tell from inside whether the bridge is genuinely connected to a live X32 or serving cached state. Commands queued while X32 is off would replay on power-up.

**Suggested fix:** Replace binary `x32Connected: bool` with `lastOscPingMs`. Add `mode: "live" | "cached"` discriminator. Until then, refuse writes when OSC heartbeat from console isn't fresh.

### G-3 — high — `upload_chart` accepts `collection: "core"` / `"supplemental"` from any caller without admin confirmation; no `delete_chart` exists

Three back-to-back uploads with identical body, varying only `collection` (`"core"`, `"supplemental"`, `"uploads"`) — all succeeded. `fileId` prefix is `upload-` in every case (the namespace is supposed to indicate the uploads section).

**Suggested fix:** Require admin role when `collection` is `"core"` or `"supplemental"`. Or split into two tools (`upload_chart` defaulting to `uploads`, `upload_curated_chart` restricted to admin). Ship `delete_chart` regardless.

### G-4 — high — Matrix writes exist without a matrix read; safe restore is structurally impossible

Discovered the matrix surface via `list_monitor_buses`:
```json
"matrices": [
  {"index": 1, "name": "Main L"},
  {"index": 2, "name": "Main R"},
  {"index": 3, "name": "MP Room"},
  {"index": 4, "name": "Oneg"},
  {"index": 5, "name": "Library"},
  {"index": 6, "name": "ALS"}
]
```
No `get_matrix(matrixIndex)`. Matrix tools (`set_matrix_fader`, `set_matrix_mute`) control FOH PA + accessibility hearing-assist outputs — highest-blast-radius surface with no read counterpart.

**Suggested fix:** Ship `get_matrix(matrixIndex)` returning at least `{matrixIndex, name, fader, muted}`.

### G-5 — medium — Fuzzy-dedup on `upload_chart` does not trigger; only exact-title matches block

Three `upload_chart` calls:
- `"⚠️ STRESS TEST 2026-05-15 — Adon Olam"` — ok
- same title again — rejected (exact dup) ✅
- `"⚠️ STRESS TEST 2026-05-15 — Adon Olamx"` (one char different) — accepted ❌

**Suggested fix:** Add Levenshtein / token-set / case-fold check. Or fix the prefix-range query (see Wave 5 plan).

### G-6 — medium — `scrape_chart_from_url` on a 404 returns `ok:true` with `title:"Song Not Found"`

`scrape_chart_from_url({url:"https://.../no-such-page-12345-stress-test"})` → `{"ok":true, "title":"Song Not Found", "artist":"Artist Not Found", "content":"The provided HTML content does not contain a chord chart..."}`. An agent piping this into `save_scraped_chart` would create a library entry called "Song Not Found".

**Suggested fix:** Detect negative-result patterns from Gemini, flip envelope to `{ok:false, reason:"no_chart_detected"}`.

### G-7 — medium — `upload_chart` accepts arbitrary `mimeType` (no allowlist)

`upload_chart({mimeType:"application/octet-stream", fileBase64:"aGVsbG8=", collection:"uploads"})` succeeded. Library now has random base64 bytes with octet-stream MIME.

**Suggested fix:** Enforce mime allowlist server-side without the `OR extension` fallback bypass.

### G-8 — medium — `upload_chart` accepts non-base64 `fileBase64` (no decode validation)

`upload_chart({mimeType:"text/plain", fileBase64:"!!!this is definitely not base64!!!"})` succeeded. The library now has a chart whose bytes are uninterpretable.

**Suggested fix:** Decode-validate before persisting. Regex format check: `^[A-Za-z0-9+/]*={0,2}$`.

### G-9 — medium — `get_mix` schema declares `busIndex: {minimum: 0}` but bus 0 errors; indexing is 1-based

`get_mix({busIndex: 0})` → `{"error": "Bus 0 not found in the live mixer state"}`. Schema lets it through; runtime rejects.

**Suggested fix:** `z.number().int().min(1)` on `busIndex` in `get_mix`, `set_send_level`, `set_send_mute`, `set_bus_fader`. Confirm `channelIndex` indexing too.

### G-10 — medium — Track-type enum on `add_track_to_setlist` is too narrow vs `get_setlist` output

Setlist `NWPBba50fltX6pNcyOVK` ("Service — May 15") contains tracks with `type: "reading"` (Dvar torah, V'ahavta) and `type: "prayer"` (Silent Prayer). `add_track_to_setlist` schema declares `type: enum["song","header"]`. Agent reading a real service setlist cannot reproduce it via the MCP.

**Suggested fix:** Add `"reading"` and `"prayer"` to writer enum. Grep production data first for full enumeration.

### G-11 — low — `update_setlist` returns `{ok:true}` with no echo of the new state

Caller must round-trip to verify. **Suggested fix:** Return the post-update record.

### G-12 — low — Error envelope inconsistency between MCP-level and tool-level errors

Schema-validation errors raise as JSON-RPC `-32602`; tool-level errors return as `{"error": "…"}` inside an otherwise-successful tool result. Agents that branch on tool-result content miss `-32602` errors.

**Suggested fix:** Normalize, or document the split clearly per tool.

### G-13 — low — `search_library({query:""})` accepts empty query and returns all results

Empty query silently behaves like wildcard. Undocumented. **Suggested fix:** Either `minLength: 1` or document the "empty = list-all" semantic.

### G-14 — low — `list_setlists({from, to})` silently ignores bad date strings (matches F-2 in shape)

Same family as F-2.

### G-15 — low — `search_library` response shape drifts based on whether a row is "uploaded" or "curated"

Uploaded rows carry `status: "active"`; curated rows don't. **Suggested fix:** Pick one shape, default the missing field.

### G-16 — low — `create_setlist` description says "Requires an admin or band leader account" but response doesn't echo the role/owner used

Returns only `{setlistId, trackCount}`. **Suggested fix:** Include `ownerId`/`ownerName` in response.

### G-17 — low — `list_monitor_buses` `bridge.clients` field is undocumented

Tool description doesn't define `clients`. **Suggested fix:** Document, ideally include semantics.

---

## 4. Tool-by-tool coverage matrix

| Tool | Happy | Negative | Interaction | All passed |
|---|---|---|---|---|
| `list_setlists` | ✓ | ✓ (G-14) | ✓ | partial |
| `get_setlist` | ✓ | ✓ | ✓ | ✓ |
| `search_library` | ✓ | ✓ | ✓ | partial (G-13, G-15) |
| `get_song` | ✓ | ✓ | ✓ | ✓ |
| `create_setlist` | ✓ | ✓ | ✓ | ✓ (F-9 fix confirmed) |
| `update_setlist` | ✓ | ✓ | ✓ | partial (G-11) |
| `add_track_to_setlist` | ✓ | ✓ | ✓ | ✓ (F-4 fix confirmed) |
| `reorder_setlist` | ✓ | ✓ | ✓ | ✓ |
| `remove_track` | ✓ | ✓ | ✓ | ✓ |
| `delete_setlist` | ✓ (4-track cascade) | ✓ | ✓ (4-setlist cleanup) | ✓ (F-10 fix confirmed) |
| `list_monitor_buses` | ✓ ×2 | n/a | ✓ | partial (G-17) |
| `get_mix` | ✓ | ✓ | ✓ | partial (G-9) |
| `set_send_level` | ✓ (restore) | n/a | partial (G-1) | partial |
| `set_send_mute` | ✓ (restore) | n/a | partial (G-1) | partial |
| `set_bus_fader` | ✓ (verified propagation) | n/a | ✓ | ✓ |
| `set_matrix_fader` | **skipped** | **skipped** | **skipped** | n/a (G-2 + G-4) |
| `set_matrix_mute` | **skipped** | **skipped** | **skipped** | n/a (G-2 + G-4) |
| `upload_chart` | ✓ (text/PDF/MusicXML, all 3 collections) | ✓ | ✓ | partial (G-3, G-5, G-7, G-8) |
| `scrape_chart_from_url` | ✓ (rawText + URL + Cloudflare fallback) | ✓ | ✓ | partial (G-6) |
| `save_scraped_chart` | ✓ | ✓ | ✓ | ✓ |

---

## 5. Safety summary

**Setlists created (deleted):** `c5053f65-6105-49d8-a868-3a0f5a9a7e7d` (4 tracks), `fe22dd83-be0d-41f0-bab5-8dc2c674a39e` (1 track).

**Charts uploaded — NEED MANUAL CLEANUP in library UI** (no `delete_chart`):

| fileId | Title | Collection | Notes |
|---|---|---|---|
| `upload-d7f4d5f4-1142-475e-81b1-393bc6edf43d` | ⚠️ STRESS TEST 2026-05-15 — Adon Olam | uploads | text/plain |
| `upload-5bfac6d1-544f-48fd-92b4-db4b614413d1` | ⚠️ STRESS TEST 2026-05-15 — PDF chart | uploads | tiny PDF |
| `upload-fc466d13-6a30-4ad8-8fe7-5fcc14b375ed` | ⚠️ STRESS TEST 2026-05-15 — MusicXML chart | uploads | MusicXML |
| `upload-d2724f75-a8cf-43a9-9746-d4b69582af28` | ⚠️ STRESS TEST 2026-05-15 — Adon Olamx | uploads | fuzzy-dedup probe (G-5) |
| `upload-a0c31045-2e0c-4153-92a9-d13bc1ca96ee` | ⚠️ STRESS TEST 2026-05-15 — core probe | **core** | **URGENT — see G-3** |
| `upload-bb13317e-7db4-433d-baff-76d7f3bf178a` | ⚠️ STRESS TEST 2026-05-15 — supplemental probe | **supplemental** | **URGENT — see G-3** |
| `upload-841fe659-c29e-4d82-9da3-c0841278e9a6` | ⚠️ STRESS TEST 2026-05-15 — bad mime | uploads | octet-stream (G-7) |
| `upload-5caf2ede-c877-4ebd-b341-d91f9d16e653` | ⚠️ STRESS TEST 2026-05-15 — not base64 | uploads | invalid base64 (G-8) |
| `upload-66dd16e4-74b3-43d0-adf6-72c3040a4514` | ⚠️ STRESS TEST 2026-05-15 — scraped Amazing Grace | uploads | via `save_scraped_chart` |

**Bridge-state caveat:** During monitor write testing, X32 may have been powered off while bridge reported `online`. All monitor writes were captured/restored — bus 3 fader = ~0.7302..., channel 19 ("Dan") on bus 3 = level 0, on=false (the captured pre-test state). On next X32 power-on, **Daniel should verify these values just to be sure.**

---

## 6. Discoverability / UX observations for AI agents

- `get_mix` returning the caller's first assigned bus on omit is genuinely useful.
- `delete_setlist` returning `tracksDeleted: N` is the best response shape in the API. Worth propagating to other write tools.
- The chart-upload `fileId` namespace is misleading — all uploads (regardless of `collection`) get `fileId` like `upload-<uuid>`. Catalog provenance is unrecoverable from id alone.
- `add_track_to_setlist({songId})` ergonomics are clean — title/key/lead derive from library, chart auto-bonds.
- Reorder error messages are unusually good — model for the rest of the API.
- Monitor write tools have no description of latency / eventual consistency.
- `scrape_chart_from_url`'s Cloudflare fallback works (verified on Ultimate Guitar).
- `list_setlists`' from/to silently swallowing bad input is the worst UX hazard for agents.

---

## End of report
