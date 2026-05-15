# MCP CF1 Cowork-Claude Verification Report

**Run date:** 2026-05-15
**Endpoint:** `https://www.centralreform.live/api/mcp`
**Operator:** cowork-Claude, browsing via Claude-in-Chrome (Playwright MCP not present; substituted)

---

## 0. Critical caveat — must read first

**The MCP bearer token in this Cowork session authenticated as Daniel (admin), not David (band_leader).** Evidence:

- `create_setlist` in Task 8 returned `"ownerName": "Daniel Bogard"`, `ownerId: "93Xn3DbS0bSNb8zmfzLyfOMX1A13"`
- Every setlist returned by `list_setlists` is owned by that same `ownerId`
- All three `save_scraped_chart` calls in Tasks 9/10 returned `ok: true`, including `collection: "core"` and `collection: "supplemental"` — admin IS allowed to write there

What this means:
- Tasks 1–8 are valid functional tests of the CF1 surface — call counts, identity preservation, dryRun, atomic semantics, best-effort, end-to-end weekly flow all stand
- **Task 10 produced no signal.** The curated-catalog block is admin-only, and I am admin in this session — so the writes succeeded as expected. The block could neither be confirmed nor refuted
- The role-based access claim in the preflight ("band_leader sees all setlists") cannot be concluded — I saw all setlists because admin sees all setlists
- Anything in this report that says "band_leader" should be read as "the role this token actually has, which appears to be admin"

**To get real band_leader signal: swap the connector's `Authorization` header to David's token and re-run Tasks 5, 10 (and re-confirm preflight scope).**

A separate non-token concern: the browser tab was signed in as Daniel as well (`Good morning, Daniel`), so UI-side role testing as David wasn't possible either. Mentioning in case both belong to the same root cause.

---

## 1. Per-task call counts vs. pre-CF1 baseline

| Task | MCP calls (CF1) | Pre-CF1 baseline | Saved |
|---|---|---|---|
| 1. Randy on songs 2, 4, 7 | **1** (`bulk_update_tracks`) | 26 (per prior cowork report) | −25 |
| 2. Bulk transpose 5 rows | **1** | ≈10 (5 × remove+add) | −9 |
| 3. Three single-field edits | **3** (`update_track` ×3) | 6 (3 × remove+add) | −3 |
| 4. dryRun then commit | **4** (dryRun + verify + real + verify) | n/a (no dryRun previously) | new capability |
| 5. Cross-setlist guard | **1** (rejected) | n/a | new check |
| 6. Atomic batch w/ bogus row | **1** (rejected, rolled back) + 1 verify | n/a | new check |
| 7. Best-effort w/ bogus row | **1** (2 ok, 1 err) | n/a | new check |
| 8. Weekly flow E2E | **12** total (1 create + 1 search + 9 add + 1 bulk; verify excluded) | ≈21 (the bulk would have been 10) | −9 on the edit phase |
| 9. Chart upload to `uploads` | **1** (`save_scraped_chart`) | n/a | n/a |
| 10. Curated-catalog block | **2** (core + supplemental attempts) | n/a | **no signal — see §0** |

**Bottom line on CF1 economics:** The biggest absolute win is Task 1's 1-vs-26 reduction. The structural wins (identity preservation, dryRun, atomic-or-not) matter more than the call counts for production use.

## 2. Identity preservation — before/after

Confirmed via the `bulk_update_tracks` response shape and a follow-up `get_setlist`. On setlist `Ikl0sS4XcZil0Z04viAu` ("Shir Shabbat — May 13"):

| trackId | Before Task 1 (Randy) | After Task 1 | After Task 2 (key) | After Task 4 (Sarah) |
|---|---|---|---|---|
| `dd4f21ab-fffe-4533-87ef-40b1c66f2709` | Shalom Alechem, Em, ∅ | Shalom Alechem, Em, **Randy** | (unchanged) | Shalom Alechem, **D**, **Sarah** |
| `0a8bd1d0-26ab-402d-8f0e-e2b70532bcb3` | Shiru L'Adonai, D, ∅ | Shiru L'Adonai, D, **Randy** | Shiru L'Adonai, **E**, Randy | Shiru L'Adonai, E, **Sarah** |
| `ec98aa2a-c4f8-440e-9c17-a6e5099fee44` | L'Cha Dodi, Dm, Nava | L'Cha Dodi, Dm, **Randy** | (unchanged) | L'Cha Dodi, Dm, **Sarah** |

The trackId column never changes. This is the regression the prior cowork eval flagged — and CF1 closes it.

## 3. Friction points (exact errors quoted)

### 3.1 — High severity — `bulk_update_tracks` atomic-failure response is misleading

Task 6 sent a 3-patch atomic batch with one bogus `trackId` ("ghost-track-id-does-not-exist") in the middle. The DATA layer rolled back correctly (subsequent `get_setlist` shows dodi li still "Lucy", Lechu Nranana still "Nava"). But the response envelope is wrong:

```json
{
  "ok": true,                                                  // ← envelope says success
  "mode": "atomic",
  "results": [
    { "trackId": "a3d0a350-...", "ok": true,                   // ← per-row says success
      "track": { "leadMusician": "BatchTestA",                 // ← shows the planned value
                 "updatedAt": 1778862672626 } },               // ← but updatedAt is the PRE-batch ts
    { "trackId": "ghost-track-id-does-not-exist", "ok": false,
      "error": "Track not found in this setlist" },
    { "trackId": "23da43a5-...", "ok": true,
      "track": { "leadMusician": "BatchTestB", "updatedAt": 1778862672626 } }
  ],
  "dryRun": false
}
```

A caller seeing `envelope.ok: true` and two `ok:true` per-row results would conclude two writes landed. They did not. The only honest signal in the response is that `updatedAt` is stale — easy to miss.

**Recommendation:**
- In `atomic` mode, when any patch fails: set envelope `ok: false`, and set every successful-looking row's `ok` to something other than `true` (e.g. `"rolled_back"`), or omit the `track` echo entirely.

### 3.2 — Low severity — Task 2 prerequisite ("≥5 song rows in the same key") couldn't be met cleanly

No setlist exposed had 5+ song rows in the same starting key. April 18 (45 tracks) has every song key set to `null`. May 13 has at most 4 in D. I adapted by transposing 4 D-rows + 1 E-row up a whole step (still 5 patches, still one call). Cite this if you want to confirm CF1 handles a "uniform target key" case specifically — that's the case my run did not test.

### 3.3 — `bulk_update_tracks` response from successful path has slightly inconsistent `updatedAt` shape

Compare Task 4 real-write response (`updatedAt: { "_seconds": 1778862773, "_nanoseconds": 241000000 }`) with Task 6's atomic-failure response (`updatedAt: 1778862672626` — bare ms number). The schema flips between Firestore Timestamp object and ms-since-epoch number depending on whether the write committed. Worth normalizing.

### 3.4 — `create_setlist` eventDate timezone bug (UI side, possibly MCP side)

I passed `eventDate: "2026-05-22"`. The stored value is `"2026-05-22T00:00:00.000Z"` (UTC midnight). The UI renders this as **"THURSDAY, MAY 21"** in CDT — one day off. The fix should be either: store as a date-only string, or store as noon-local of the intended date.

### 3.5 — `create_setlist` UI rendering shows "Date TBD" even when a date was set

Setlist detail page shows `THURSDAY, MAY 21` as a small subheader but a giant **"Date TBD"** as the main label. The two states contradict each other — likely a render path that checks a different field.

## 4. Rate-limit observations

Did not hit any 429s. The full run was ~25 MCP calls over ~10 minutes, well under any plausible per-minute cap. Specifically:
- `upload_chart`/`save_scraped_chart` calls: 3 (one each to uploads, core, supplemental) — far below the documented 10/min upload cap
- No `*_ai` tools were exercised

Cannot confirm the 10/min upload + 20/min ai limits actually trip at the stated thresholds; that requires a stress run.

## 5. Curated-catalog block — Task 10 result

All three `save_scraped_chart` calls returned `ok: true`:

```json
{ "ok": true, "fileId": "upload-3ebd7274-...", "collection": "uploads" }
{ "ok": true, "fileId": "upload-e85636b2-...", "collection": "core" }
{ "ok": true, "fileId": "upload-cca7fb91-...", "collection": "supplemental" }
```

Library UI confirms all three landed in their target collections (search "CF1 Eval" returns one match each in `CRC Charts` / `Shireinu` / `Uploads` tabs).

**No rejection text was captured** because no rejection occurred. Per §0, the token authenticates as admin, so this is expected behavior, not a CF1 defect. Re-run as David is required to validate the block.

## 6. Recommended next gap (single most consequential)

**Make `update_track` / `bulk_update_tracks` support reordering, and ship a `bulk_add_tracks`.** Task 8 took 9 sequential `add_track_to_setlist` calls to populate a setlist. A real Friday-evening flow ("import last week's setlist with these substitutions") will routinely build 15–25-row setlists; that's still N+1 calls today. Combined with the inability to reorder via patch, an MCP-driven "rearrange and tweak" requires a remove+add cycle that CF1 specifically fixed for single-field edits — but didn't fix for position changes. The next CF1-equivalent win is closing that loop: `bulk_add_tracks(setlistId, tracks[], position?)` plus a `position` field in `update_track`'s patch shape. After that, a full weekly-flow scenario should be 3–5 MCP calls total instead of 12.

## 7. Browser-side findings

UI was tested at desktop viewport (~1568×772). Daniel asked specifically about iPad/tablet — tested URLs and DOM are responsive, but I did not change viewport size; recommend a separate iPad-Safari smoke test.

### 7.1 — High severity — chart-loading renderer freeze (>30s)
- **URL:** `https://www.centralreform.live/perform/setlist/Ikl0sS4XcZil0Z04viAu`, Song 2 of 12 (Shalom Alechem)
- **Symptom:** After clicking into perform mode for a song, the chart area went blank ("Loading Chart…" disappeared) and the entire renderer was unresponsive. A subsequent `screenshot` tool call timed out after 30 seconds with `CDP sendCommand "Page.captureScreenshot" timed out`. The PDF eventually rendered correctly.
- **Network state at the freeze:** `/api/drive/file/1BLARziE-...` returned 200, `pdf.worker.min.5.4.296.mjs` was status "pending".
- **Why this matters for tablets:** A 30+ second wedge where the page is genuinely frozen (no JS event loop response) is much worse on iPad — that's where the worship leader is hitting the next-song arrow with two minutes between songs.

### 7.2 — High severity — `FirebaseError: Firestore shutting down` cluster on navigation
At 11:37:01 (after navigating to `/setlists/6b412089-...`), the console flooded with these errors in <1s:

```
[ERROR] [Users] Profile listener error: FirebaseError: Firestore shutting down
[ERROR] [useSafeFirestoreSync] onSnapshot error: FirebaseError: Firestore shutting down  (×3)
[ERROR] [MonitorConn] Config listener error: FirebaseError: Firestore shutting down
[ERROR] [MonitorFS] State listener error (%d/%d): 1 3 Firestore shutting down
[WARNING] [alert-store] globalAlert subscription failed: FirebaseError: Firestore shutting down
[WARNING] [Notifications] Subscribe failed: FirebaseError: Firestore shutting down
[WARNING] Session cookie sync attempt 1 failed: 401  (×2)
```
The Firestore client is being torn down by a prior page's unmount, and listeners on the new page try to subscribe against the dead client before a new one is initialized. This is a classic Next.js client-singleton-lifecycle bug; on tablet, where users rotate between Library / Setlist / Perform views constantly, this will surface as silent-fail UI states.

### 7.3 — Medium severity — "Failed — retry" badge persistent in setlist detail header
Top-right of `/setlists/6b412089-...` showed a red `(X) Failed — retry` badge after the create+9-adds+bulk-update sequence. The MCP writes had already landed (confirmed via `get_setlist`), so this is a UI-side sync-status indicator out of step with reality.

### 7.4 — Medium severity — stale cache on first nav to a freshly-created setlist
First load of `/setlists/6b412089-...` showed `Date TBD` and `TRACKS 0`. Second load (re-navigation, same URL) showed `9 tracks` and the patches I'd made. The MCP→Firestore writes had completed; the in-app state hadn't reconciled. Symptom went away after one extra navigate. For a band leader hitting "Reload" because they don't trust what they're seeing, this is a confidence-destroyer.

### 7.5 — Low severity — RSC navigation prefetches return 503
While idling on `/setlists`, these prefetches returned **503 Service Unavailable**:
```
GET /monitor?_rsc=1n22m         503
GET /schedule?_rsc=p37cr        503
GET /setlists?_rsc=p37cr        503
GET /library?_rsc=1o88a         503
GET /setlists?_rsc=1nwat        503
GET /setlists?_rsc=182ag        503
```
Plus one Firestore `Listen/channel` returned 503 at session start (the client recovered). RSC failure means hover-prefetch of nav doesn't warm the page — every click becomes a cold navigation. On a tablet this adds a noticeable click-to-paint delay.

### 7.6 — Low severity — Outbox/sync queue has accumulated errors
At session start, console logs (repeatedly):
```
[Outbox] 58 total — by status: Object
[Outbox] lastError class breakdown: Object
[Outbox] first 10 rows: Array(10)
```
58 entries with a tracked "lastError class breakdown" suggests there's a write-queue with ~58 historical items that have been retried with errors. Worth investigating regardless of this eval.

### 7.7 — UI-data display mismatches
- Setlist header reads `12 songs · 15 items` for `Ikl0sS4XcZil0Z04viAu`; MCP `trackCount` is 18 for the same setlist. Either the UI is excluding some row types from "items" (silently) or one count is stale.
- `Dashboard subscription fired: 41 setlists, fromCache=false` — total setlist count is 41, but `list_setlists` defaults to 20 and maxes at 50. A user with 50+ setlists won't see them all from MCP without a `from`/`to` filter or paging.

## 8. MCP / UI consistency summary

Where things worked beautifully:
- The live setlist view on `/perform/setlist/{id}` reflected MCP writes within 1–2 seconds, no refresh needed (Task 1 Randy values, Task 2 keys, Task 4 Sarah values, Task 7 BestEffortA/B, Task 3 notes chip "softer entrance" — all visible live)
- Library tabs (`CRC Charts`, `Shireinu`, `Uploads`) showed the freshly-uploaded charts when searched immediately after the MCP write
- TrackId identity is preserved end-to-end — the UI didn't blink or re-render rows when MCP edits landed, because the row component's React key (trackId) stayed stable

Where it didn't:
- Freshly-created setlist (`/setlists/{id}`) showed `TRACKS 0` on first load — needed a second nav to populate (§7.4)
- Setlist detail header rendered `Date TBD` despite a stored `eventDate` (§3.5)
- "Failed — retry" badge sticky in the header even after writes had landed (§7.3)
- The Firestore-shutting-down cluster (§7.2) is the most likely root cause of (§7.3) and (§7.4); fixing it will probably fix both downstream symptoms

---

**End of report.** Net read: CF1 lands the headline improvement convincingly — identity-preserving partial patches in single and bulk form, dryRun works, atomic rollback works at the data layer. The big rough edges are (1) the misleading atomic-failure response envelope (§3.1), (2) the chart-load freeze on perform mode (§7.1), (3) the Firestore-shutdown error cluster (§7.2). The session was conclusively admin-token, so role-based tests must be re-run with David's token before drawing any band_leader-specific conclusions.
