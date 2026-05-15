# MCP — Next Stress Test Prep

**Last updated:** 2026-05-15
**Source artifacts to clean up / verify:** carried forward from `.paul/research/mcp-stress-test-2026-05-15.md` cowork-Claude run.

The next stress test (after Wave 4 ships) should exercise the new tooling by **using it to perform the cleanup the prior test left pending**. This both clears the production state AND validates the new tools end-to-end. Anything that can't be done via MCP (because no tool exists) is flagged for manual / human-only execution.

---

## Carry-forward action items

### A. Stress-test charts pending deletion (9 fileIds)

After Wave 4 ships, the next stress test SHOULD call `delete_chart(fileId)` for each. Successful deletion of all 9 (especially the two in curated catalogs) is the strongest single proof that `delete_chart` works end-to-end.

**🔴 Curated-catalog charts — highest priority (G-3 exposure):**
- `upload-a0c31045-2e0c-4153-92a9-d13bc1ca96ee` — `⚠️ STRESS TEST 2026-05-15 — core probe` — collection: **core**
- `upload-bb13317e-7db4-433d-baff-76d7f3bf178a` — `⚠️ STRESS TEST 2026-05-15 — supplemental probe` — collection: **supplemental**

After Wave 4's G-3 admin gate ships, ONLY an admin should be able to delete these (since they're in curated catalogs and the gate applies to deletes too). The next stress test, running as Daniel (admin), should succeed at both.

**🟡 Uploads-collection charts:**
- `upload-d7f4d5f4-1142-475e-81b1-393bc6edf43d` — `⚠️ STRESS TEST 2026-05-15 — Adon Olam` — uploads (text/plain)
- `upload-5bfac6d1-544f-48fd-92b4-db4b614413d1` — `⚠️ STRESS TEST 2026-05-15 — PDF chart` — uploads (tiny PDF)
- `upload-fc466d13-6a30-4ad8-8fe7-5fcc14b375ed` — `⚠️ STRESS TEST 2026-05-15 — MusicXML chart` — uploads (MusicXML)
- `upload-d2724f75-a8cf-43a9-9746-d4b69582af28` — `⚠️ STRESS TEST 2026-05-15 — Adon Olamx` — uploads (fuzzy-dedup probe; G-5)
- `upload-841fe659-c29e-4d82-9da3-c0841278e9a6` — `⚠️ STRESS TEST 2026-05-15 — bad mime` — uploads (octet-stream; G-7)
- `upload-5caf2ede-c877-4ebd-b341-d91f9d16e653` — `⚠️ STRESS TEST 2026-05-15 — not base64` — uploads (invalid base64; G-8)
- `upload-66dd16e4-74b3-43d0-adf6-72c3040a4514` — `⚠️ STRESS TEST 2026-05-15 — scraped Amazing Grace` — uploads (via save_scraped_chart)

**Expected sequence in the next stress test:**

1. Verify each fileId exists via `get_song(fileId)` OR `search_library({query: "STRESS TEST"})`.
2. For each fileId, call `delete_chart(fileId)`. Expected: all 9 return `{ok: true, ...}`. Report the response shape — Wave 4's plan says `{ok: true, deletedTracks: 0}` since the bonded-track guard would have rejected any chart still attached to a track.
3. After cleanup, `search_library({query: "STRESS TEST"})` should return `[]`.
4. Edge case to assert: `delete_chart` on a now-deleted fileId returns `{error: "Chart not found"}` (idempotent failure).

### B. X32 monitor state verification

The prior stress test wrote and then restored monitor commands on bus 3, but did so while the X32 may have been powered off. If the bridge queued the commands, they replay on next power-on. The intended NET state matches the pre-test state:

- Bus 3 fader ≈ `0.7302052974700928` (the original value the tester captured)
- Channel 19 ("Dan") on bus 3 = `level: 0, on: false` (muted)

**Cannot be verified via MCP alone unless the X32 is actually on when the test runs.** The next stress test should:

1. Call `list_monitor_buses` and report `bridge.lastSeenIso`, `x32Connected`, `clients`. If `x32Connected: false`, skip the verification and surface as a finding.
2. If `x32Connected: true` (and Daniel confirms the X32 is genuinely powered on this time):
   - `get_mix({busIndex: 3})` and report the bus fader value + the level/on state for channelIndex 19.
   - Compare against expected. If diverged, the bridge replayed phantom writes — note as evidence.
3. If the bridge is genuinely cached-not-live (Wave 4 doesn't fix this — just punted with documentation per the plan), surface that as a finding: "Bridge reports x32Connected:true but no get_mix data — write tools should have a freshness guardrail."

### C. Regression sweep on Wave 4 fixes

When Wave 4 ships, the next stress test should explicitly verify each closed finding:

- **G-3 — admin gate on core/supplemental:**
  - As ADMIN (Daniel): `upload_chart({collection: "core", ...})` → ok.
  - As a BAND_LEADER test account (if available): `upload_chart({collection: "core", ...})` → error.
  - As a MUSICIAN test account: same → error.
- **G-4 — get_matrix tool:**
  - As ADMIN: `get_matrix({})` → returns all 6 matrices with `{index, name, fader, on}`.
  - `get_matrix({matrixIndex: 1})` → returns 1.
  - `get_matrix({matrixIndex: 99})` → "not found".
  - If a non-admin/non-SE test account exists: call → "requires admin or sound engineer".
- **G-9 — schema min:1 on bus/channel indices:**
  - `get_mix({busIndex: 0})` → MCP `-32602` validation error (NOT runtime "Bus 0 not found").
  - `set_send_level({busIndex: 1, channelIndex: 0, level: 0.5})` → MCP `-32602` on channelIndex.
- **`delete_chart` happy path** — covered by section A above.
- **`delete_chart` bonded-track guard:**
  - Upload a stress-test chart.
  - Add it to a stress-test setlist via `add_track_to_setlist({songId: fileId})`.
  - Attempt `delete_chart(fileId)` → error "this chart is bonded to N setlist track(s). Remove the tracks first".
  - Call `remove_track(...)` for the bonded row.
  - Re-attempt `delete_chart(fileId)` → ok.
  - Clean up the setlist via `delete_setlist`.

### D. Regression sweep on Wave 5 fixes (only if Wave 5 has shipped)

- **G-5 fuzzy dedup:** Upload `⚠️ STRESS TEST <date> — Adon Olam`, then `⚠️ STRESS TEST <date> — Adon Olamx`. Second should be rejected as fuzzy-duplicate (was the failing case in the prior test).
- **G-6 scrape negative-result:** `scrape_chart_from_url({url: "https://www.centralreform.live/no-such-page-12345"})` → `{error: "No chord chart detected..."}` (NOT `{ok:true, title:"Song Not Found", ...}`).
- **G-7 mime tightening:** `upload_chart({mimeType: "application/octet-stream", ...})` → rejected.
- **G-8 base64 format:** `upload_chart({fileBase64: "!!!not base64!!!", ...})` → rejected at format check.
- **G-10 widened type enum:** `add_track_to_setlist({type: "reading", title: "V'ahavta"})` → ok. `add_track_to_setlist({type: "prayer", title: "Silent Prayer"})` → ok.

### E. New regression coverage for Wave 6 fixes (only if Wave 6 has shipped)

- **G-11 update_setlist echo:** `update_setlist({id, name})` → response now includes the updated setlist record.
- **G-14 list_setlists date validation:** `list_setlists({from: "not-a-date"})` → MCP `-32602` (NOT silent-full-list).
- **G-15 search shape uniformity:** Every result row in `search_library` carries `status: "active"` (or whatever default).
- **G-16 create_setlist owner echo:** Response includes `ownerId` + `ownerName`.

---

## Process — how this file works

- This file is the SOURCE OF TRUTH for "what should the next stress test do before / alongside its main test surface."
- Whoever writes the next stress-test prompt should INCORPORATE Section A (cleanup), Section B (verification), and Sections C-E (whichever waves have shipped) into the prompt before sending it to the cowork Claude.
- After the cowork Claude completes the next stress test, this file should be updated:
  - Section A: remove fileIds that are now deleted.
  - Section B: remove if X32 state was verified, OR carry forward if still pending.
  - Sections C-E: remove the regression items that came back green.
  - Add NEW carry-forward items the new test surfaces.

---

## See also

- `.paul/research/mcp-stress-test-2026-05-15.md` — the 2026-05-15 stress-test report this prep file derives from.
- `.paul/research/mcp-wave-4-5-6-PLAN.md` — the implementation plan for Waves 4–6.
- Auto-memory: `project_mcp_status.md`, `feedback_chart_access_policy.md`.
