# MCP Stress Test v4 — Post-v3-Triage Verification

**Target:** `https://www.centralreform.live/api/mcp` (apex 307s to www)
**Branch under test:** `master` — tip `72b71baff` or later
**Tool count:** 30 (no new tools shipped this round — four bug-fix / behavior commits)

## Why this run

Your v3 report (2026-05-15) flagged one HIGH (CF2-D-1) and five NOTE/LOW items. All but the two true defers shipped between your v3 report and now, plus one latent fix you didn't flag but Daniel asked for. v4's job is to confirm every fix actually closes the finding in production AND that nothing in the bulk-update or upload paths regressed.

Commits shipped this round:

- `288807a6f` — **CF2-D-1**: `list_library({collection: "core"})` matches in-app /library semantic (negative-set complement of supplemental + uploads), so the 101 legacy CRC charts with `collection: null` surface again.
- `c21036196` — **v3 bundle** (four findings):
  - **NOTE-1**: `update_track` re-bond auto-refreshes the row's `title` from the new song's catalog title — but only when the row was using the OLD song's catalog title verbatim (i.e. user hadn't customized).
  - **NOTE-2**: `generate_gig_packet` response now includes `packetTitle` (matches PDF `/Title`) alongside the back-compat bare `title`.
  - **NOTE-4**: `list_library({})` default browse hides folders, audio files, and dotfiles like `.DS_Store`. Pass `includeNonCharts: true` for the raw library_index.
  - **CF2-D-2**: dropped Zod `.max(200)` on `limit` — passing `limit: 999` now returns 200 rows silently, no `-32602`.
- `b04379a1e` — **Bulk re-bond parity**: `bulk_update_tracks` (atomic AND best-effort) on a `songId` change now refreshes `fileName` + `title` (NOTE-1 contract) and rebuilds the parent setlist's `fileIds[]` aggregate from post-patch state. Pre-fix, only `update_track` did this — bulk re-bonds would have recurred the v2 H-1/H-5 "Image failed to load" bug.
- `72b71baff` — **H-3 force override**: `upload_chart`, `import_chart_from_drive`, `save_scraped_chart` accept `force?: boolean`. With `force: true`, both exact + fuzzy dedup are skipped. The 409 error messages explicitly name the flag so the retry path is obvious. 0.85 fuzzy threshold stays strict by default.

Persistent gaps unchanged since v3: H-3 dedup (RESOLVED above), F-1 setlist counter (deferred — self-heals), Phase G observability (Vercel platform limitation).

## Identity

Run the **entire** test as **Daniel Bogard (admin)** — UID `93Xn3DbS0bSNb8zmfzLyfOMX1A13`. Verify with `list_monitor_buses` returning `isPrivileged: true`. If a token swap happens mid-run, abort and report — same rule as v2/v3.

---

## Phase A — CF2-D-1 verification: `list_library({collection: "core"})` returns 101+

This is the HIGH from v3. Without it the "show me everything in core" workflow via MCP is dead.

1. `list_library({collection: "core", limit: 200})` — record `total` and `rows.length`.
2. In Chrome via Claude on Daniel's signed-in `/library` session, switch to the CRC Charts tab. Record the badge count.
3. `list_library({collection: "core", limit: 200, offset: 0})` then `{offset: 200}` if `total > 200`. Confirm pages don't overlap and union = full core catalog.
4. Sanity-check: `list_library({collection: "supplemental"})` still narrows strictly (not pulled into core), and `list_library({collection: "uploads"})` still narrows strictly.

**Expected:**
- Step 1: `total ≥ 101` (in-app CRC Charts badge). v3 returned `total: 0` — that's the bug.
- Step 2: badge equals or roughly equals step 1's `total` (within a couple of rows for any in-flight sync).
- Step 4: supplemental + uploads totals match v3 (`272` + `4`-ish).

**If `total` is still `0` or significantly below the in-app badge:** repro: paste the first 5 `rows` (or empty array) and the strict-call counts for the other two collections so we can see whether the deploy missed.

---

## Phase B — NOTE-1 verification: `update_track` re-bond title refresh

Operator-facing fix: pre-fix, the row's title stayed pointing at the OLD song after a re-bond, so Perform mode showed a mismatched footer label.

1. Create a `⚠️ V4 RE-BOND TITLE STRESS …` setlist via `create_setlist`.
2. `bulk_add_tracks({tracks: [{songId: "<song-A>"}]})` — note that you're NOT passing `title`, so the row's title defaults to song A's catalog title. Record the resulting trackId + title.
3. `update_track({setlistId, trackId, patch: {songId: "<song-B>"}})`. (No `title` in the patch.)
4. `get_setlist`. Read row's `title`.

**Expected:** row's `title` is now song B's catalog title. Pre-fix, it stayed song A's title.

5. **Customized-title preservation:** Add a second row with an explicit `title: "My Custom Lead-In"` AND `songId: "<song-A>"`. Re-bond it to song B. Confirm `title` stays `"My Custom Lead-In"` — auto-refresh must NOT clobber a customized title.
6. **Explicit-title wins:** `update_track({patch: {songId: "<song-A>", title: "Caller's Choice"}})` on a fresh uncustomized row. Confirm `title` is `"Caller's Choice"` — caller's patch overrides the auto-refresh even when the row was uncustomized.

Cleanup: `delete_setlist`.

---

## Phase C — NOTE-2 verification: `generate_gig_packet` `packetTitle` field

Tiny but worth confirming the envelope.

1. Pick a real populated setlist (e.g. `5/15 -- Shir Shabbat`).
2. `generate_gig_packet({setlistId})`. Read the response envelope.

**Expected:**
- `title: "<setlist name>"` (back-compat bare name).
- **`packetTitle: "<setlist name> — Gig Packet"`** — NEW field. Should match the embedded PDF `/Title` metadata exactly.

3. Decode the `contentBase64` to a PDF and confirm `/Title` matches `packetTitle`.

---

## Phase D — NOTE-4 verification: `list_library` default browse hides non-charts

1. `list_library({})` — default browse. Record `total` and the first 20 `rows`.
2. `list_library({includeNonCharts: true})` — raw browse. Record `total`.

**Expected:**
- Step 1's rows include NO `application/vnd.google-apps.folder`, NO `audio/*` mime types, NO names starting with `.` (e.g. no `.DS_Store`).
- Step 2's `total` ≥ step 1's `total`. The difference equals the count of non-chart artifacts in your `library_index` (v3 saw ~58 out of 500).

3. Sanity: pull 5 random rows from step 1's payload — every `mimeType` is chart-shaped (pdf, image, xml, text) or null.

---

## Phase E — CF2-D-2 verification: `list_library` silent-clamps `limit`

1. `list_library({limit: 999})`. Read the response.

**Expected:** No `-32602`. Response envelope `{rows: [...], total, offset, limit}` with `limit: 200` and up to 200 rows returned. v3 hard-rejected with `"Too big: expected number to be <=200"` — confirm that's gone.

2. Sanity: `list_library({limit: 50})` still returns 50 rows / `limit: 50`. (Clamp must be one-way.)

---

## Phase F — Bulk re-bond parity (NEW, no v3 stress for this)

This is the latent-fix shake. Pre-`b04379a1e`, `bulk_update_tracks` on a `songId` change only swapped the row's `fileId` — `fileName`, `title`, and the parent setlist's `fileIds[]` aggregate ALL stayed stale. Bulk re-bonds would have recurred the v2 H-1/H-5 "Image failed to load" bug.

1. Create `⚠️ V4 BULK REBOND STRESS …` setlist via `create_setlist`.
2. `bulk_add_tracks` two song rows both bonded to **the same** song-A (so the setlist's `fileIds[]` starts as `[song-A]` and Row B will be the sibling regression check).
3. Verify starting state via `get_setlist`: Row A `fileId === song-A`, Row B `fileId === song-A`, `setlist.fileIds === [song-A]`.
4. `bulk_update_tracks({setlistId, patches: [{trackId: <Row A>, patch: {songId: "<song-B>"}}]})` — use the default atomic mode. Don't pass `mode`.
5. `get_setlist`. Verify:
   - Row A `fileId === song-B`
   - Row A `fileName === <song-B's catalog filename>` (F-2 parity — was stale pre-fix)
   - Row A `title === <song-B's catalog title>` (NOTE-1 parity — was stale pre-fix)
   - Row B unchanged (still bonded to song-A, title untouched)
   - **`setlist.fileIds[]` is exactly `[song-A, song-B]` in some order** (H-1 parity, sibling preservation — song-A kept because Row B still uses it)
6. Open `/perform/setlist/<id>` in Chrome via Claude; tap Row A. The chart must load — not "Image failed to load" (H-5 parity downstream).
7. **Best-effort sanity:** Repeat with `mode: "best-effort"`. Same contract should hold.

Cleanup: `delete_setlist`.

---

## Phase G — H-3 force override: dedup bypass on chart uploads

This is the dedup-tolerance fix. Threshold stays at 0.85 strict by default; `force: true` is the explicit escape hatch.

1. Pick a Drive PDF the service account can read. Note its filename.
2. `import_chart_from_drive({driveFileId, title: "⚠️ V4 H-3 BASE <RANDOM>", collection: "uploads"})`. Record `fileId`. This is the base for the dedup tests.
3. **Fuzzy without force is blocked:** `upload_chart({title: "⚠️ V4 H-3 BASE <RANDOM>x", fileBase64: "<any small valid PDF>", mimeType: "application/pdf"})` — note the `x` typo at the end. Confirm error matches `"similar name"` AND mentions `"force: true"`.
4. **Fuzzy with force commits:** Repeat the same call with `force: true`. Confirm `{ok: true, fileId: <new id>, ...}`. Record the new `fileId`.
5. **Exact without force is blocked:** `upload_chart({title: "⚠️ V4 H-3 BASE <RANDOM>", fileBase64: "<any small valid PDF>", mimeType: "application/pdf"})` — same title as step 2. Confirm error mentions `"already exists"` AND `"force: true"`.
6. **Exact with force commits:** Repeat step 5 with `force: true`. Confirm `{ok: true}`. Record the new `fileId`.
7. **`force` on `import_chart_from_drive`:** repeat the same Drive id from step 2 with `import_chart_from_drive({driveFileId, title: "<same as step 2>", force: true})`. Confirm `{ok: true}`.
8. **`force` on `save_scraped_chart`:** `save_scraped_chart({title: "<same as step 2>", content: "C\nLyrics\n", force: true})`. Confirm `{ok: true}`.

Cleanup: `delete_chart` every probe `fileId` created above. Confirm `search_library({query: "⚠️ V4 H-3"})` returns `[]`.

**Expected error envelope text (all three tools):**
- `duplicate_exact`: `"A chart with the same name (\"<existing>\") already exists. Pass force: true to override if this is a legitimate variant."`
- `duplicate_similar`: `"A chart with a similar name (\"<existing>\") already exists in the library. Pass force: true to override if this is a legitimate variant."`

---

## Phase H — Don't-break-the-band sanity (browser, Claude in Chrome)

Same shape as v3 §F. Visit `/perform/setlist/<a real upcoming Shabbat setlist>`. Verify:
- Setlist title + tracks render.
- Tap a bonded PDF chart — renders.
- Tap an image-typed chart (PNG / JPEG / HEIC server-converted) — renders.
- Hard-refresh `/library` — badge counts stay, list still populates.
- `/perform` works on the gig-packet print path too (open the in-app gig packet, print preview, confirm pages look right).

---

## Phase I — Cleanup + report

1. Cascade-delete every `⚠️ V4` setlist and chart created above.
2. `search_library({query: "⚠️ V4"})` → `[]`.
3. `list_setlists({limit: 20})` → no `⚠️ V4` entries.

## Report format

Same shape as your v3 report. Per-phase pass/fail table at the top. New findings get a severity tag (CRIT / HIGH / MED / LOW / NOTE) with repro + suspected cause + suggested fix. End with a verdict on whether anything in this batch threatens the MCP-first weekly flow OR the band's iPad consumer flow.

**Particularly want to know:**
- Did CF2-D-1 actually close? (`list_library({collection: "core"})` returns 101+, matching the in-app CRC Charts badge?)
- Does bulk re-bond now work end-to-end through Perform mode? (Row A in Phase F renders the new chart on iPad, sibling Row B still works?)
- Does the `force: true` override surface the dedup bypass clearly in the error envelope? (operator can read the error and know exactly what to retry?)
- Are the four NOTE-tier fixes (NOTE-1 title, NOTE-2 packetTitle, NOTE-4 chart filter, CF2-D-2 clamp) all visibly working?

If you find anything that breaks the MCP-first weekly flow OR the band's iPad consumer flow, flag it as CRIT and put it at the top of the report.
