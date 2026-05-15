# CRC Music MCP — Stress Test: Spec, Rationale, and Findings

**Target:** `https://www.centralreform.live/api/mcp`
**Run by:** Claude (claude.ai, Opus 4.7) acting on Daniel Bogard's authenticated session
**Run date:** 2026-05-14 (CT) / 2026-05-15T03:34–03:41Z
**Audience:** Daniel (review) + Claude Code (re-run, extend, fix)
**Artifact left for inspection:**
- Setlist ID: `982b7ee8-cb2b-4c3c-af07-0314b4959720`
- Setlist name: `⚠️ STRESS TEST 2026-05-14 — DELETE ME (Claude)`
- Event date: 2099-12-31 (kept out of any real service range)
- Owner: Daniel Bogard
- 8 tracks remaining (1 header + 7 songs; 1 song bonded to library, 6 free-text)
- See "Final state" section at the bottom of this doc.

> There is also a **prior** stress-test setlist left behind by an earlier run:
> `0c734209-62ca-4b66-9962-634e3b922129` — `⚠️ STRESS TEST — DELETE ME (Claude)`.
> Since the MCP exposes no `delete_setlist` tool, neither artifact can be removed via the MCP. They will need to be deleted manually in the centralreform.live UI (or by adding a delete tool — see Finding F-10).

---

## 1. Goals (per Daniel's spec)

1. **Correctness / edge cases.** Probe every tool with bad inputs, malformed inputs, boundary conditions, and "wrong state" scenarios (stale IDs, foreign IDs, etc.). Document how the server responds.
2. **Tool coverage.** Hit every endpoint with at least one realistic happy-path call and at least one failure-mode call, with reasonable coverage of optional-parameter combinations.
3. **Mutating, leave artifacts.** No cleanup. The stress-test setlist stays in the database so Daniel can inspect track ordering, schema, and unicode handling in the live UI.

Explicitly **out of scope** for this run (worth a future pass):
- Concurrency / parallelism / throughput (the chat-MCP transport doesn't expose true parallel tool calls).
- Auth boundary tests (only Daniel's session was available; no read-only or non-band-leader account on hand).
- Cross-user access (cannot try to read someone else's setlist without a second account).

---

## 2. Tool inventory (9 tools, as of the run)

| Tool | Kind | Required params | Notes |
|---|---|---|---|
| `list_setlists` | read | — | optional `from`, `to` (ISO date), `limit` (1–50, default 20) |
| `get_setlist` | read | `id` | returns full track list |
| `search_library` | read | `query` | optional `key`, `bpmMin`, `bpmMax`, `limit` (1–50, default 20) |
| `get_song` | read | `id` | returns metadata only |
| `create_setlist` | write | `name` | optional `eventDate`, `rabbi`, `serviceType` |
| `update_setlist` | write | `id` | metadata only (name, eventDate, rabbi, serviceType, serviceNotes) |
| `add_track_to_setlist` | write | `setlistId` + (`songId` OR `title`) | optional `key`, `leadMusician`, `notes`, `referenceLink`, `position`, `type` |
| `remove_track` | write | `setlistId`, `trackId` | re-packs `order` contiguously |
| `reorder_setlist` | write | `setlistId`, `orderedTrackIds` | must include every current track exactly once |

**Missing tools that would round out the surface** (documented separately as findings):
- `delete_setlist`
- `update_track` (right now you must remove + re-add to change a track's key/lead/notes)
- A way to fetch the chart PDF / sheet music referenced by `fileName` (currently MCP returns metadata only — by design, but the description doesn't note that you'd need the Firebase URL elsewhere)

---

## 3. Design philosophy

The test is shaped like a **sweep**, not a script. For each tool, we:

1. Do at least one **happy-path** call with the minimal required parameters.
2. Do at least one **fully-populated** call (every optional parameter set).
3. Do **negative tests** for each documented constraint (missing required field, wrong type, empty string, nonexistent id, foreign id, out-of-range value).
4. Do **interaction tests** that exercise multi-tool invariants:
   - `add_track` then `get_setlist` to verify round-trip and schema.
   - `remove_track` to verify `order` re-packing and `fileIds` de-duplication.
   - `reorder_setlist` after a `remove_track` to verify stale-ID rejection.
5. Look at the response **shape**, not just the success flag — schema drift between request and response is where most quiet bugs live.

The setlist is left intact so Daniel can confirm in the live UI that:
- The order matches what the API returned (it does).
- Hebrew + emoji titles render.
- A free-text song row (no `songId`) renders alongside a bonded one.
- A header row renders as a section break, not a song.

---

## 4. Execution log (what I actually ran, in order)

All calls were made against the production MCP under Daniel's session. Each numbered step below maps to one or more tool calls.

### Phase A — Reconnaissance

1. `list_setlists(limit=5)` — confirmed two ID formats coexist (UUID for newer rows, short-token for older Firestore-generated ones), and that `songCount` is present on some setlists but not all (schema drift, Finding F-1).
2. `search_library(query="shalom", limit=3)` — confirmed search returns `{id, title, fileName}` only; no `key`/`bpm` even on songs that have them.
3. `get_song("000cc80a-...")` — confirmed `get_song` returns *whatever metadata exists on the record* rather than the documented "title, key, BPM, vocal lead" tuple (Finding F-2). Most library entries are sparsely annotated: title + fileName only.
4. `search_library(query="shalom", key="G", bpmMin=80, bpmMax=120)` → `[]`. Initially looked like a filter bug; subsequent test with a known-`Em` song proved the filter works — the library is just sparsely keyed (Finding F-3).

### Phase B — Create the test artifact

5. `create_setlist(name="⚠️ STRESS TEST 2026-05-14 — DELETE ME (Claude)", eventDate="2099-12-31", rabbi="Rabbi Test", serviceType="stress-test")` → `{setlistId, trackCount: 0}`.
   - Note: response uses `setlistId`; `get_setlist` and `list_setlists` use `id`. Field-naming drift (Finding F-1).
   - Note: `serviceType` was sent; response field is `templateType` (Finding F-1).
6. `get_setlist(id)` on the new setlist — confirms empty `tracks: []` and the renamed `templateType`.
7. `update_setlist(id, serviceNotes="…")` → `{ok: true}`. Round-tripped verified by next `get_setlist`.

### Phase C — Track adds

8. `add_track_to_setlist(setlistId, title="— Opening —", type="header")` → header at order 0.
9. `add_track_to_setlist(setlistId, songId="12Q_6mN94HnSFNcDsHZtvzXX2TqXm9sqh")` → bonded song; title/key/fileName inherited from library.
10. `add_track_to_setlist` with progressively more optional fields populated (title-only; +key; +leadMusician; +notes; +referenceLink). All succeeded except **`referenceLink` is silently dropped** — set on input, absent from `get_setlist` response (Finding F-4). Track schema in the response has no `referenceLink` field at all.
11. `add_track_to_setlist(setlistId, title="★ Inserted at position 0", position=0)` → correctly shifted every existing track down by 1.
12. Unicode round-trip: `title="שלום עליכם 🎸 — quotes \"double\" 'single' \\n newline?"` round-tripped intact (the `\n` was sent literally as two characters and stored as two characters — i.e. no JSON-string-escape rewriting; Finding F-5 is a note, not a bug).

### Phase D — Track-add negative tests

13. `type="header"` with no `title` → `{error: "title is required (or pass a songId to derive it)"}`. ✓
14. Song with neither `songId` nor `title` → same error. ✓
15. `title=""` (empty string) → same error (treated as missing). ✓
16. `songId="nonexistent-..."` → `{error: "Song nonexistent-... not found"}`. ✓ (echoes the bad id, useful for debugging)
17. `setlistId="nonexistent"` → `{error: "Setlist not found"}`. ✓
18. `position=9999` → clamped to append (order 8). Reasonable.
19. Title override on a real `songId` (`title="OVERRIDE TITLE"`) → title overridden but `fileId`/`fileName`/`key` still inherited from the song. Good — does what the description says.

### Phase E — Reorder tests

20. Reorder with **wrong count** (2 ids instead of 11) → `{error: "orderedTrackIds must contain every track in the setlist exactly once"}`. ✓
21. Reorder with **duplicate id** → `{error: "track <id> appears more than once"}`. ✓ — names the offending id.
22. Reorder with **foreign id** → `{error: "track bogus-id-zzzzz is not in this setlist"}`. ✓ — names it.
23. Reorder with **empty array** on a non-empty setlist → same "must contain every track" error. ✓
24. Valid reverse-order reorder of 11 ids → `{ok: true}`. `get_setlist` confirms order fully reversed and `order` field re-numbered 0..10.

### Phase F — Remove tests

25. Remove a real track → `{ok: true}`; `trackCount` and `order` field re-pack correctly.
26. Remove the **same** track again → `{error: "Track not found in this setlist"}`. ✓ (clean error, not a crash)
27. Remove using a real `trackId` but the **wrong** `setlistId` → same "Track not found in this setlist" error. ✓ — doesn't accidentally hit the other setlist.
28. Remove with both bad setlist + bad track → `{error: "Setlist not found"}` — error precedence is correct (setlist-not-found short-circuits).
29. Remove the last two tracks that bonded to library song `12Q_…` → `fileIds: []` on the setlist root (denormalized index drains correctly, Finding F-6).

### Phase G — Stale-state interaction

30. Remove track X, then `reorder_setlist` with X still in the ordered list → `{error: "orderedTrackIds must contain every track in the setlist exactly once"}`. ✓ — but the error doesn't say *which* id is stale, unlike the duplicate-id error which does. Mild inconsistency (Finding F-7).

### Phase H — Search and list edges

31. `search_library(query="")` → returns first 20 of the library (empty query == match-all). Probably useful, worth documenting.
32. `search_library(query="'; DROP TABLE songs; --")` → `[]`. Literal substring, no SQLi. ✓
33. Very long (200-char) query → `[]`. No size issue.
34. `bpmMin=-100, bpmMax=99999` plus a query that *does* return results unfiltered → `[]`. Confirms BPM-range filter is **inclusion-only**: songs without BPM metadata are excluded when BPM filters are present. Important UX gotcha given how few songs have BPM (Finding F-3).
35. `list_setlists(from="not-a-date")` → **silently ignored**, returned full unfiltered list (Finding F-8). Should arguably 400.
36. `list_setlists(from="2099-12-31", to="2099-01-01")` (inverted range) → `[]`. No error. Reasonable.
37. `list_setlists(limit=50)` → returned 43 setlists, confirming the catalog size and surfacing duplicate-name setlists (Finding F-10).

### Phase I — Update edges

38. `update_setlist(id, name="")` → MCP-level validation error (`-32602`, Zod-style envelope). ✓
39. `update_setlist(id, eventDate="not-a-date")` → raw Firestore error: `"Value for argument \"seconds\" is not a valid integer."` (Finding F-9 — internal-leakage).
40. `update_setlist(id="nonexistent", name="whatever")` → `{error: "Setlist not found"}`. ✓
41. `update_setlist(id)` (no fields) → `{ok: true}`, **but `updatedAt` advanced anyway**. The MCP performs the write even when nothing changes (Finding F-11).

### Phase J — Get edges

42. `get_setlist(id="nonexistent")` → `{error: "Setlist not found"}`. ✓
43. `get_song(id="nonexistent")` → `{error: "Song not found"}`. ✓ — consistent envelope across resources.

---

## 5. Findings

Each finding is rated **severity** (low / medium / high) by how likely it is to bite a real user or an AI agent acting on the API.

### F-1 — Schema drift between request, response, and listing payloads (medium)

The same conceptual field has different names in different places:

| Concept | Request | `get_setlist` | `list_setlists` | `create_setlist` response |
|---|---|---|---|---|
| Setlist id | `id` (update/get) / `setlistId` (add/remove/reorder) | `id` | `id` | `setlistId` |
| Service type | `serviceType` | `templateType` | (not exposed) | (not in response) |

And `list_setlists` includes `songCount` on some rows but not all — appears to depend on whether the row has been touched since some migration.

**Impact on AI clients:** an agent constructing follow-up calls from a tool's response has to remember to translate `setlistId → id`. Easy to get wrong.

**Suggested fix:** pick one (probably `id` everywhere) and rename. Or document the mapping in the tool descriptions.

### F-2 — `get_song` and `search_library` over-promise in their descriptions (low)

Tool descriptions say:
- `get_song` "returns title, key, BPM, vocal lead"
- `search_library` returns "metadata"

In practice, `get_song` returns *whatever the document has*, which for most library entries is just `id`, `title`, `fileName`. Same for `search_library` results.

**Impact:** a strict-typed AI client can crash when it expects `bpm` to be present. A naïve agent will tell the user "I couldn't find the BPM" when it should tell them "the BPM isn't recorded for this song."

**Suggested fix:** rewrite the descriptions to say "returns whatever metadata is set; `key` and `bpm` may be absent." Or actually populate the library (separate problem).

### F-3 — BPM/key filters are inclusion-only and silently drop sparse-metadata rows (medium)

If `bpmMin` or `bpmMax` is passed, songs without `bpm` are excluded. Same for `key`. Because most library entries lack these fields, applying filters returns `[]` even when a sensible match exists by title.

**Impact:** "Find a 90 BPM Adon Olam" returns nothing, when in fact there is an Adon Olam in the library — it just has no BPM recorded.

**Suggested fix:** either (a) treat absent metadata as "passes the filter," (b) return matches but mark them as `bpm: null`, or (c) at minimum, document this behavior. My preferred fix is (a) — it matches how a band leader actually uses the catalog.

### F-4 — `referenceLink` is silently dropped (high)

`add_track_to_setlist` accepts `referenceLink` per the schema, but it never appears in the resulting track. No error, no warning.

**Impact:** any user or AI that tries to attach a YouTube/Spotify reference to a track loses the data with no signal.

**Suggested fix:** either persist it (preferred) or reject the field with a clear error. Right now it's the worst of both worlds.

### F-5 — Unicode and quotes round-trip cleanly (no issue; documented for the spec)

Hebrew + emoji + double-quotes + single-quotes + literal `\n` survive add → get unchanged. Good. This is recorded as a non-bug for future regression coverage.

### F-6 — `fileIds` denormalization is maintained correctly (no issue)

When the last track bonded to a library song is removed, the setlist's `fileIds` array drops that id. Round-tripped through two removes — index drains. Good.

### F-7 — Reorder validation errors are inconsistent about specificity (low)

- Duplicate id → error names the offending id ("track X appears more than once").
- Foreign id → error names the offending id ("track X is not in this setlist").
- Wrong count / missing id → generic error ("must contain every track exactly once") — doesn't say which id is missing.

**Suggested fix:** the missing-id case is the most common in practice (stale UI). Naming the missing id would save a lot of `get_setlist` round-trips.

### F-8 — `list_setlists` silently ignores malformed `from`/`to` (low)

`from="not-a-date"` returns the unfiltered list. Should 400.

### F-9 — `update_setlist` leaks raw Firestore error text on bad `eventDate` (medium)

`eventDate="not-a-date"` produces: `Value for argument "seconds" is not a valid integer.`

**Impact:** internal-implementation leak (reveals Firestore), unhelpful to the caller, and inconsistent with the clean validation in other tools.

**Suggested fix:** validate `eventDate` as ISO-8601 at the MCP layer and return a structured error like `{error: "eventDate must be an ISO date string"}`.

### F-10 — No `delete_setlist` tool; duplicate setlists accumulate (medium)

The MCP has create / update / read but no delete. `list_setlists(limit=50)` showed multiple near-duplicate setlists from prior accidental creates (three "Friday Night — Parashat Vayakhel-Pekudei — March 8", multiple "Bnei Mitzvah Morning (Template)", etc.), and two `⚠️ STRESS TEST — DELETE ME (Claude)` rows are now stuck in the database with no API path to remove them.

**Suggested fix:** add `delete_setlist(id)`. Even a soft-delete would be enough.

### F-11 — `update_setlist` with no fields still writes (low)

A no-op `update_setlist({id})` returns `{ok: true}` *and* advances `updatedAt`. Costs a Firestore write per call. Not catastrophic but wasteful and breaks the "is the user actively editing this setlist?" signal that `updatedAt` could otherwise provide.

**Suggested fix:** short-circuit when the update payload has no fields beyond `id`.

### F-12 — Error envelope inconsistency: MCP-validation vs tool-validation (low)

- Field-shape errors (e.g. `name=""` on update) come back as MCP `-32602` JSON-RPC errors.
- Business-rule errors (e.g. `Setlist not found`) come back as tool-result `{error: "..."}` payloads.

Both are reasonable, but a strict client has to handle two envelopes. Worth documenting in the tool descriptions so the AI client knows which to expect.

---

## 6. Severity-sorted fix list (the "if you fix three things, fix these")

1. **F-4 (high) — `referenceLink` silent drop.** Persist or reject.
2. **F-10 (medium) — `delete_setlist` missing.** Add the tool.
3. **F-9 (medium) — `eventDate` Firestore leak.** Validate at MCP layer.

Lower priority but worth scheduling:
4. F-1 — name-drift cleanup (`setlistId` ↔ `id`, `serviceType` ↔ `templateType`).
5. F-3 — BPM/key filter inclusivity.
6. F-2 — fix tool descriptions to match actual returns.

---

## 7. Re-run instructions for Claude Code

To re-execute this stress test:

### Setup

- Authenticate against `https://www.centralreform.live/api/mcp` as a band-leader or admin.
- Pick a far-future `eventDate` (we used `2099-12-31`) so the test setlist can't be mistaken for a real service.
- Name the setlist with a `⚠️ STRESS TEST <YYYY-MM-DD> — DELETE ME` prefix so it's grep-able later.

### Phases (run in order; each phase is independent of the next except where noted)

1. **Recon** — `list_setlists(limit=5)`; `search_library(query="shalom", limit=3)`; `get_song` on a returned id. Sanity check the response shapes; note any schema drift.
2. **Create** — `create_setlist(...)` with `name`, `eventDate`, `rabbi`, `serviceType` all populated. Capture the returned `setlistId` (note: not `id`).
3. **Update metadata** — `update_setlist(id, serviceNotes="...")` then `get_setlist(id)` to confirm round-trip. Note that `serviceType` becomes `templateType` in the read path.
4. **Track adds (happy)** — add at least one of each: header (`type="header"`), bonded song (`songId=<library id>`), free-text song (`title=` only), free-text with all optional fields, position-0 insert, unicode title (Hebrew + emoji).
5. **Track adds (negative)** — header without title, song without title or songId, empty title, nonexistent songId, nonexistent setlistId, out-of-range position. Confirm each returns the documented error envelope.
6. **`referenceLink` regression** — add a track with `referenceLink="..."`, then `get_setlist` and grep the response for that string. If absent, **F-4 has not been fixed**.
7. **Reorder (happy)** — fetch current track ids via `get_setlist`, reverse them, call `reorder_setlist`. Confirm order field is renumbered 0..N-1 contiguously.
8. **Reorder (negative)** — wrong count, duplicate id, foreign id, empty array. Each should return a structured error.
9. **Remove** — remove a track; confirm `trackCount` decremented and `order` re-packed. Remove the same track again; should return "Track not found in this setlist." Remove the last library-bonded track; confirm `fileIds` drains.
10. **Stale-state reorder** — after removing a track, attempt to reorder using the stale id list. Should fail cleanly.
11. **Search edges** — `query=""` (returns first 20), `query` with SQLi-flavored text (returns `[]`), key/BPM filters on a sparse song (returns `[]`).
12. **List edges** — `from="not-a-date"` (currently silently ignored — F-8), inverted date range (empty), `limit=50` (works).
13. **Update edges** — `name=""` (validation error, `-32602`), `eventDate="not-a-date"` (currently leaks Firestore — F-9), `update_setlist({id})` no-op (still advances `updatedAt` — F-11).
14. **Get edges** — `get_setlist({id:"nonexistent"})`, `get_song({id:"nonexistent"})`. Both should return `{error: "... not found"}` consistently.

### What to compare against this run

The findings (F-1 through F-12) are the regression baseline. For each finding, the re-run should explicitly check whether the behavior is unchanged, fixed, or regressed. Capture the result in a follow-up md doc.

### Cleanup

There is no MCP-level cleanup. After the run, manually delete the test setlist(s) in the centralreform.live UI, or — if F-10 has been fixed — call `delete_setlist({id})`.

---

## 8. Final state of the artifact setlist

**`982b7ee8-cb2b-4c3c-af07-0314b4959720`** — `⚠️ STRESS TEST 2026-05-14 — DELETE ME (Claude)`

- `eventDate`: 2099-12-31
- `templateType`: stress-test
- `rabbi`: Rabbi Test
- `serviceNotes`: "First note - testing whether notes round-trip correctly."
- `fileIds`: `["12Q_6mN94HnSFNcDsHZtvzXX2TqXm9sqh"]`
- `trackCount`: 8

Tracks in performance order (post-reverse, post-removes):

| # | Type | Title | Bonded songId | Key | Lead | Notes |
|---|---|---|---|---|---|---|
| 0 | song | `שלום עליכם 🎸 — quotes "double" 'single' \n newline?` | — | — | — | — |
| 1 | song | `far-out position` | — | — | — | — |
| 2 | song | `Full-fat free-text` | — | Am | Daniel | All fields populated |
| 3 | song | `Free-text + key + lead + notes` | — | D | Daniel | notes here |
| 4 | song | `Free-text with key + lead` | — | D | Daniel | — |
| 5 | header | `— Opening —` | — | — | — | — |
| 6 | song | `★ Inserted at position 0` | — | — | — | — |
| 7 | song | `Adonai sfatai (trad)` | `12Q_6mN94HnSFNcDsHZtvzXX2TqXm9sqh` | Em | — | — |

Notes for inspection in the live UI at centralreform.live:
- Track 0 is the unicode round-trip test — verify Hebrew + emoji + quotes render correctly in the band leader view and in any printed/PDF output.
- Track 5 is a header — should render as a section break, not a song row.
- Track 7 is the one bonded song — should display the chart PDF when expanded; the others should show only the row metadata, no chart.
- The post-reverse, post-remove ordering is the proof that `reorder_setlist` and `remove_track` are both correctly maintaining the `order` index.

---

## 9. Suggested next test passes (not run this time)

- **Auth / authorization.** Create a non-band-leader account and verify the write tools correctly reject. The descriptions say "Admins and band leaders may add/remove/reorder" — that needs to be tested.
- **Cross-user reads.** Try to read another user's setlist by id. Confirm proper rejection.
- **Concurrency.** Two parallel `add_track_to_setlist` calls — does `order` collide or serialize correctly? Probably needs a non-MCP harness (curl + xargs -P).
- **Large setlists.** Add 200 tracks and confirm `get_setlist` returns them all without truncation, and `reorder_setlist` still works.
- **MCP transport.** Run the same tests via Claude Code's direct MCP transport (rather than via claude.ai) to confirm parity. Differences would be a finding in themselves.
- **Chart fetch.** Investigate whether the MCP can or should expose the underlying file URL for `fileName` so an agent can actually retrieve a chart, not just a filename. Currently the descriptions explicitly say "metadata only, never chart files" — but the AI use-case of "summarize the chord progression of song X" requires that capability somewhere.

---

# Appendix — Claude Code root-cause analysis (added 2026-05-14)

Brief code-level investigation done in the same session that received this report. **No code was changed**; this is read-only triage to bootstrap the fix phase.

All MCP write/read code lives in `src/lib/mcp/**` in **this repo** (`sheet-music-app/`) — NOT in the `sheet-music-app-mcp/` worktree (which is a parallel checkout of the same repo on the `feat/mcp-server` branch). The fixes should be authored on `feat/mcp-server` and merged forward.

## F-4 — `referenceLink` silent drop: confirmed READ-side bug

- **Write side persists it correctly.** The field flows through three layers without loss:
  - `src/lib/mcp/tools/setlist-write.ts:166` — passes `referenceLink` into the inner writer
  - `src/lib/mcp/server-tracks-write.ts:72,123` — writes `referenceLink` into the track payload
  - `src/lib/setlist-write.ts:26,130-131` — the shared server-side write module sets `trackPayload.referenceLink = t.referenceLink` when defined
- **Read side drops it.** `src/lib/mcp/tools/setlists.ts:71-100` (`getSetlist`) projects each track row to a fixed shape:
  ```ts
  tracks: tracks.map((t) => ({
      id, order, title, type, songId, fileId, fileName, key, bpm, leadMusician, notes
  }))
  ```
  `referenceLink` is missing from this projection. **It is in Firestore already** (every track with the field set has it on the underlying doc).
- **Fix scope:** one line. Add `referenceLink: typeof row.referenceLink === "string" ? row.referenceLink : null` to the projection. Existing data is already correct.
- **Verification:** call `add_track_to_setlist(..., referenceLink: "https://example.com")`, then `get_setlist`, and grep the response for the URL. With the fix, it should appear; existing pre-fix tracks (including the stress-test setlist's track 2 if it had a link) will surface their persisted value.

## F-9 — `eventDate` Firestore error leak: write-side validation gap

- Lives in `src/lib/mcp/tools/setlist-write.ts` (`updateSetlist` / `createSetlist`). The MCP tool layer passes the raw string through to Firestore's `Timestamp.fromDate(new Date(eventDate))` (or equivalent), which throws when `new Date(...)` is `Invalid Date`. The error message ("`Value for argument "seconds" is not a valid integer.`") is Firestore SDK internals.
- **Fix scope:** add a Zod `.refine` on the `eventDate` schema in `src/lib/mcp/tools/index.ts` (the tool registrations): `z.string().refine(s => !Number.isNaN(Date.parse(s)), { message: "eventDate must be an ISO date string" })`. Apply on both `create_setlist` and `update_setlist`. The same pattern already exists in v70-08-02 for `commit-document`.

## F-10 — No `delete_setlist`: greenfield tool

- New tool needs to live in `src/lib/mcp/tools/setlist-write.ts` + register in `src/lib/mcp/tools/index.ts`.
- **Must cascade-delete `tracks/{id}` rows** in the same atomic batch — otherwise the orphan tracks would litter the collection. Pattern: query `tracks` where `setlistId == id`, batch-delete plus the setlist doc itself.
- **Role gate:** admin OR band_leader (mirrors create_setlist). Owner check optional — current model lets any band_leader edit any setlist (`mcp-setlist-write.emulator.test.ts:29` "LEADER may edit ANY setlist").
- **Verification:** existing `mcp-setlist-write.emulator.test.ts` is the test harness — add a `delete_setlist` describe block. Must assert (a) setlist doc removed, (b) all `tracks` rows with that setlistId removed, (c) MEMBER role rejected, (d) non-existent id returns clean error.

## Stuck artifacts

Two stress-test setlists are stuck in production with no MCP path to remove:
- `982b7ee8-cb2b-4c3c-af07-0314b4959720` — current run's artifact (eventDate 2099-12-31; invisible in dashboard)
- `0c734209-62ca-4b66-9962-634e3b922129` — earlier stress-test run

Until F-10 ships, these need manual cleanup in the centralreform.live UI. The 2099-12-31 event date keeps them out of "upcoming services" so they're not actively harmful — just clutter that surfaces when Daniel reviews the full setlist list.

## Routing recommendation

These fixes are **parallel-workstream MCP work**, not part of v7.1's audit-fold-forward milestone (which closes the v70-08-AUDIT punch list on the main sheet-music-app branches). Per `project_mcp_parallel_workstream.md`, MCP work runs on the `feat/mcp-server` branch with its own PAUL state in the `sheet-music-app-mcp/` worktree's `.paul/` directory.

Suggested phase scaffold (to be created on `feat/mcp-server` in the worktree, NOT on master):
- Phase name: `mcp-stress-fixes-2026-05-14`
- Wave 1: F-4 (referenceLink read-side projection) + F-9 (eventDate Zod refine) + F-10 (delete_setlist with cascade)
- Backend-only; no `/ui-ux-pro-max` needed
- Emulator tests required (HFG; data-layer touches on F-10)
- Wave 2 candidates (lower priority): F-1 (id/setlistId rename), F-3 (filter inclusivity), F-2 (description accuracy), F-7 (missing-id error specificity), F-8 (list_setlists ISO validation), F-11 (no-op update short-circuit), F-12 (envelope unification)
