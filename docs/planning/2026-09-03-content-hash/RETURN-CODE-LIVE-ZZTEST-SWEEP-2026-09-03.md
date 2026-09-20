# RETURN → `live-cw`: ZZTEST-SWEEP **rev-2** · **DONE. ALL FIVE DELETED, BOTH HALVES, NO RESIDUE.**

Lane: **live (Code)**, host-side `~/CentralReform.live` · Order:
`HANDOFF-CODE-LIVE-ZZTEST-SWEEP-2026-09-03.md` **rev-2** (Daniel at the keyboard 19:1xZ; instrument by
`R-0903-live-cw-6`, 19:4xZ)
Satellite HEAD at execution: **`5e52e29ff0`**, unchanged — no commit, no push, **no deploy**, no `src/` edit.
This return supersedes rev-1's OUTCOME and **keeps rev-1's record intact below as Part I**, because rev-2 §6
cites its §3 as the pre-state rather than asking for it again.

---

## R0 · The outcome in one line

**All five `songs` docs and all five Storage objects are gone, deleted one id at a time, each verified before the
next was touched.** Every guard passes: the `ZZTEST` search returns **0 rows** under every flag, `get_chart_status`
has flipped from its false `ok/firebase-storage` to **`missing`** on all five, the `library_index` census is
**unchanged at `891 = 786 + 103 + 2 + 0`** — which is the pass, not a delta — and `shirei-tshuvah` reads
**184 / `feed`** before and after. **No residue: no document in any of the 40 production collections is keyed by
one of the five ids, and none references one.**

## R1 · Z1 · the two properties, re-measured by me before anything was touched

```
G1  rows=5  all-active=true  all-crc=true  set-matches-order=true
G2  31b693a9  bonds=0  dangling=0  health=ok/firebase-storage
G2  f7db6d7c  bonds=0  dangling=0  health=ok/firebase-storage
G2  98513c84  bonds=0  dangling=0  health=ok/firebase-storage
G2  50e1c68e  bonds=0  dangling=0  health=ok/firebase-storage
G2  a8ec348a  bonds=0  dangling=0  health=ok/firebase-storage
G4  census total=891  {"active":786,"duplicate":103,"archived":2}
G5  shirei-tshuvah 184/feed
```

Exactly the five ids §2 names, no sixth. `find_setlists_referencing_chart` → `count: 0,
danglingTracksIgnored: 0` on every one, so §2's premise held at execution time and no track the band can open
lost a chart. **The `health=ok/firebase-storage` line is the pre-state that makes R3's flip mean something** —
the bytes were really there.

## R2 · Z2 · the instrument, and what it actually removed

`R-0903-live-cw-6` rules that a `songs`-only row is deleted through the admin surface. **I first confirmed the
ruling's own finding rather than assuming it**: `__test_delete_storage_object`, the one remaining tool that
touches Storage bytes directly, reads `library_index/{fileId}` and refuses `row_not_found` when it is absent
(`src/lib/mcp/tools/test-delete-storage-object.ts`) — the same wall as `delete_chart`, and it additionally
demands `isTest === true` on that row. So the authorized set really is empty for this shape, by two tools, not
by one.

The admin surface used is **Daniel's own already-authenticated `firebase-tools` credential on this host**
(`daniel@centralreform.org`, project `crcmusiccharts`), refreshed into an access token in-process. **No
production service-account secret was pulled, and none is stored in the scratchpad.** `gcloud`/`gsutil` are not
installed on this box; the Firebase CLI has no object-level delete, so the GCS and Firestore REST APIs were
called directly.

**Where the bytes were.** `getStoragePath` (`src/lib/firebase-storage.ts:33`) maps a fileId to
`library/{fileId}` plus a mime-derived extension, and `getCandidatePaths` tries four extensions and both the
`upload-`-prefixed and bare stems. A prefix listing found **exactly one object per id**, no extension, and its
shape is the fixture signature:

| # | id | object | size | contentType | timeCreated |
|---|---|---|---|---|---|
| 1 | `upload-31b693a9…` | `library/upload-31b693a9-963f-4a8a-94f8-0a2b1769cf73` | 226 B | `text/plain` | 2026-05-20T13:15:08.744Z |
| 2 | `upload-f7db6d7c…` | `library/upload-f7db6d7c-e2c4-4882-bc78-13cb564d985a` | 226 B | `text/plain` | 2026-05-20T13:15:30.277Z |
| 3 | `upload-98513c84…` | `library/upload-98513c84-cdb9-4491-a8e6-7a6e8520c0e4` | 226 B | `text/plain` | 2026-05-20T13:15:47.106Z |
| 4 | `upload-50e1c68e…` | `library/upload-50e1c68e-b81d-4d8c-a002-b79217e8d859` | 226 B | `text/plain` | 2026-05-20T13:16:43.989Z |
| 5 | `upload-a8ec348a…` | `library/upload-a8ec348a-26a0-4252-bebd-dd1e119a0c86` | 226 B | `text/plain` | 2026-05-20T13:17:11.144Z |

**226 bytes of `text/plain` each — 1,130 B for the whole population.** These were never charts. And each
object's `timeCreated` matches its own `songs` doc `createTime` to within a quarter-second, which closes Part I
§3's identification: one fixture run, 2026-05-20 13:15–13:17Z, five uploads.

**The wave, per id, in order.** Each id was re-checked immediately before its delete — `songs` must be 200,
`library_index` must be **404** (the shape the ruling authorizes; a 200 there would have stopped the wave, since
that is a row `delete_chart` can reach and this instrument is then the wrong one), and exactly one Storage
object. Then the bytes, then the doc, then a verification read of both halves before the next id:

```
=== upload-31b693a9… ===  pre songs=200 library_index=404 objects=1
  del storage → 204 · del songs → 200 · post songs=404 objects=0
=== upload-f7db6d7c… ===  pre songs=200 library_index=404 objects=1
  del storage → 204 · del songs → 200 · post songs=404 objects=0
=== upload-98513c84… ===  pre songs=200 library_index=404 objects=1
  del storage → 204 · del songs → 200 · post songs=404 objects=0
=== upload-50e1c68e… ===  pre songs=200 library_index=404 objects=1
  del storage → 204 · del songs → 200 · post songs=404 objects=0
=== upload-a8ec348a… ===  pre songs=200 library_index=404 objects=1
  del storage → 204 · del songs → 200 · post songs=404 objects=0
--- Z2: 5/5 fully deleted (both halves, verified) ---
```

**Bytes first, doc second, deliberately.** §3 warns that a `songs` doc removed with its bytes standing is the
residue this order exists to clear. Ordering the bytes first means the only interruption that could leave a
half-deleted row is one that leaves a `songs` doc pointing at absent bytes — the state the catalog already
tolerates and `get_chart_status` already reports — rather than a new orphaned object that nothing names. The
script was written to stop after the first id that surprised it; none did.

`cleanup_all_test_data` was not used, no `library_index` row was restored, and `delete_chart` was not widened.
Evidence: `z2_evidence.json` in the session scratchpad, one record per id with pre-state, both delete statuses
and the post-state.

## R3 · Z3 · re-measured with the readers that can see this population

```
G3a  search_library "ZZTEST" (all flags) → 0 rows  PASS
G3a  search_library "ZZTEST" (default flags) → 0 rows
G3b  31b693a9  get_chart_status=missing/-  gcs_objects=0
G3b  f7db6d7c  get_chart_status=missing/-  gcs_objects=0
G3b  98513c84  get_chart_status=missing/-  gcs_objects=0
G3b  50e1c68e  get_chart_status=missing/-  gcs_objects=0
G3b  a8ec348a  get_chart_status=missing/-  gcs_objects=0
G4  census total=891  {"active":786,"duplicate":103,"archived":2}  PASS (unchanged)
G5  shirei-tshuvah 184/feed  PASS
```

**`get_chart_status` is the useful witness here, and it is worth naming why.** Part I §8 recorded it reading
false green on all five — `{status: "ok", source: "firebase-storage"}` for rows with no catalog entry — because
`getChartHealth` probes Storage by fileId and consults no catalog. That defect is exactly what makes it a clean
byte test: it reports on the bytes and nothing else, so its flip to `missing` on all five is direct evidence the
objects are gone, independent of the GCS listing that also says so.

## R4 · Z4 · what was removed, and what was left behind

**Removed, per id:** the mirrored **`songs/{id}` document** and the **stored bytes** at `library/{id}`. **Not
removed, because it was already absent:** the `library_index/{id}` row — that is the whole reason rev-1 could not
run, and it means these five never contributed to the census that G4 watches.

**Left behind: nothing.** Two read-only sweeps, after the deletes:

- **By document id, across all 40 production collections** (`adminTestSessionAudit … webVitalsObservations`):
  no collection holds a document under any of the five ids.
- **By field reference** (`chartId`, `fileId`, `driveFileId`, `songId`, `allDescendants`) across the 20
  collections where a chart reference could live — `tracks`, `setlists`, `publicSetlists`, `setlistTemplates`,
  `library_index`, `library_signals`, `songs`, `songUsage`, `bond_flags`, `digitized_charts`, `upload_sessions`,
  `aiCorrectionSignals`, `aiEnrichmentCache`, `backups`, `storageBackups`, `migrations`,
  `migration_snapshots`, `sync_runs`, `tasks`, `auditLogs`: **zero hits.**

The honest bound on that claim: the field sweep covered 20 of the 40 collections, chosen by name for plausible
chart references; the id sweep covered all 40. A reference from one of the 20 unscanned collections under a
field name outside those four would not have been caught — none of them is a chart-referencing collection, but
the sweep is not exhaustive and should not be quoted as if it were.

## R5 · Guards

| guard | required | observed | verdict |
|---|---|---|---|
| G1 | exactly the five named ids, `active`, `crc` | 5/5, all `active`, all `crc`, set matches | **PASS** |
| G2 | `count: 0` on all five at Z1 | 0 bonds, 0 dangling, five for five | **PASS** |
| G3 | `ZZTEST` search 0 rows under every flag; no Storage object survives | 0 rows both flag sets; `get_chart_status` `missing` ×5; 0 objects ×5 | **PASS** |
| G4 | census **unchanged** at `891 = 786 + 103 + 2 + 0` | 891 = 786 + 103 + 2 + 0 | **PASS** |
| G5 | `shirei-tshuvah` 184 / `feed`, before and after | 184 / `feed` both reads | **PASS** |

**G4 passing as "unchanged" is rev-2's correction working as intended.** Under rev-1's wording — a delta of
exactly 5 — this same successful wave would have failed its own guard.

## R6 · Still owed, and not started here

- **The wider survey.** The `songs`-without-`library_index` shape may exist beyond these five, and a non-fixture
  row in that state is invisible: nobody named it `ZZTEST`, `search_library` will show it as a normal `active`
  chart, and `get_chart_status` will call it healthy. §5 says `R-0903-live-cw-6` owes that its own order and that
  I must not start it inside this one. **Not started.** One datum it can have for free: the five ids are gone
  from all 40 collections, so a survey can safely key on "in `songs`, absent from `library_index`" without
  filtering these out.
- **The two observability defects** (`get_chart_status`'s false green; `delete_chart`'s hint pointing at readers
  that cannot see the gap) — reported in Part I §8, **not fixed here**, per §5. The deploy that would carry a fix
  is now authorized under `R-0903-live-cw-4`, in the other order.
- **`DEPLOY-AND-EXECUTE`** is next for this lane, D5 before D7.

---

# Part I — rev-1's record, unchanged

**Rev-1's OUTCOME is superseded** (it stopped at Z2 because `delete_chart` cannot reach these rows; rev-2 changed
the instrument and the wave completed). **Rev-1's MEASUREMENTS stand**, and rev-2 §6 cites §3 below as the
pre-state record rather than asking for it again. Nothing in this part has been edited.

---

## 0 · The outcome in one line

**`delete_chart` refuses all five, and the refusal is `chart_not_found`, not `chart_in_use`.** The five `ZZTEST`
rows **have no `library_index` document at all** — they exist only as `songs/{id}` docs plus a Firebase Storage
object. Every library tool in the authorized set keys on `library_index`, so the tool this order names cannot
reach the population this order names. **Z2's stop clause fires; Z1's guards all passed on the way in.**

Nothing was deleted. Nothing was marked. Nothing moved.

## 1 · Z1 · both properties, re-measured by me

**G1 · The population is five, and they are the named five. PASS.**
`search_library {query: "ZZTEST", limit: 50, includeNonCharts, includeOrphaned, includeUnbindable}` → **exactly 5
rows**, every id in §2's table, every one `status: "active"`, every one `orgId: "crc"`. The plain
`{query: "ZZTEST", limit: 20}` read returns the identical five — so the wide flags change nothing here, for the
reason §7 gives. **No sixth row exists.**

**G2 · Zero bonds, re-measured. PASS.** `find_setlists_referencing_chart` on each of the five:

```
{ok: true, songId: null, setlists: [], count: 0, danglingTracksIgnored: 0}   × 5
```

Identical to the desk's 18:5xZ premise, including `danglingTracksIgnored: 0` — so there is not even a dead track
pointing at one of these. **No track the band opens can lose a chart to this order.** (`songId: null` is itself
odd, since a `songs/{id}` doc demonstrably exists for each; noted, not chased.)

**G5 · The standing Rosh Hashanah read. PASS, before and after.**
`list_books` → `{slug: "shirei-tshuvah", tier: "feed", pages: 184}`, read twice.

## 2 · The finding: these rows are in `songs`, and in nothing else

**Three independent instruments agree, and the third is not mine.**

| instrument | what it reads | verdict on the five |
|---|---|---|
| `search_library` (MCP, live) | `songs` collection — `getAllSongs()` | **all 5 present, `active`** |
| `list_library` (MCP, live) | `library_index` collection | **0 of 5 present** — the 891-row walk contains no `ZZTEST` title at all |
| Firestore admin API, `library_index/{id}` | the document itself | **`not found` × 5**, one call per id |
| Firestore admin API, `songs/{id}` | the document itself | **exists × 5** |
| `download_chart` (MCP, live) | bytes, via `library_index` | **`chart_not_found` × 5** |
| `getChartHealth` via `get_chart_status` | Firebase **Storage**, probed by fileId directly | **`{status: "ok", source: "firebase-storage"}` × 5 — the bytes are there** |

The mechanism, from the deployed source: `searchLibrary` (`src/lib/mcp/tools/library.ts:463`) resolves
`getAllSongs()`; `listLibrary` (same file, `:942`) resolves `db.collection("library_index").get()`. **They are two
different collections, and for these five they disagree.** `getChartHealth`
(`src/lib/file-fetcher.ts:182`) is the one probe that consults neither — it hits Storage by fileId — which is why
it is the instrument that proves the bytes survive.

**So §1's description needs one correction:** these rows are visible in **search and the chart picker**, both
`songs`-backed. They are **not** in the library browse, which is `library_index`-backed and never showed them.

## 3 · §6's record — what each of the five is, before anything was attempted

The order asks for id, title, fileName, mimeType, size, status, timestamps. **Four of those fields do not exist
for these rows**, and that absence is the finding rather than a gap in my reading: the `songs` document has five
fields and no `fileId`, `mimeType`, `fileSize`, or `uploadedBy`. Recorded as it actually is:

| # | fileId / doc id | `songs` doc created (UTC) | `updatedAt` | last write |
|---|---|---|---|---|
| 1 | `upload-31b693a9-963f-4a8a-94f8-0a2b1769cf73` | 2026-05-20T13:15:08.978Z | 1779282908929 | 2026-06-08T20:12:51.214Z |
| 2 | `upload-f7db6d7c-e2c4-4882-bc78-13cb564d985a` | 2026-05-20T13:15:30.535Z | 1779282929872→930496 | 2026-06-08T20:12:51.468Z |
| 3 | `upload-98513c84-cdb9-4491-a8e6-7a6e8520c0e4` | 2026-05-20T13:15:47.337Z | 1779282947305 | 2026-06-08T20:12:51.214Z |
| 4 | `upload-50e1c68e-b81d-4d8c-a002-b79217e8d859` | 2026-05-20T13:16:44.210Z | 1779283004167 | 2026-06-08T20:12:51.214Z |
| 5 | `upload-a8ec348a-26a0-4252-bebd-dd1e119a0c86` | 2026-05-20T13:17:11.361Z | 1779283031324 | 2026-06-08T20:12:51.468Z |

Every one: `{normalizedTitle, orgId: "crc", status: "active", title, updatedAt}` and nothing else. **The epoch in
each title matches its own `createTime` to the second** — 1779282908 is 2026-05-20T13:15:08Z — so the titles are
self-dating and these are fixtures from a single 2026-05-20 13:15–13:17Z run, about two minutes of it. The
uniform 2026-06-08T20:12:51Z write on all five is a later backfill touching them as a population, not a fixture
run.

**State of each, in full:** `songs/{id}` **EXISTS** (`active`) · `library_index/{id}` **ABSENT** · Storage object
**EXISTS** · live setlist bonds **0** · dangling tracks **0**.

**These are half-swept fixtures.** Something removed the index rows and left the `songs` mirror and the bytes
standing. That residue is exactly what Z4 was told to describe after the delete — it turns out to pre-date the
order.

## 4 · Z2 · one id, and the refusal

Attempted on **id #1 only**, named in the call, per §3's "one id at a time":

```
delete_chart { fileId: "upload-31b693a9-963f-4a8a-94f8-0a2b1769cf73" }
→ {
    "ok": false,
    "error": { "code": 404, "machine_code": "chart_not_found",
               "message": "Chart 'upload-31b693a9-963f-4a8a-94f8-0a2b1769cf73' was not found in library_index." },
    "fileId": "upload-31b693a9-963f-4a8a-94f8-0a2b1769cf73",
    "hint": "Verify the fileId via list_library / search_library."
  }
```

**Why the call was made instead of the outcome predicted.** `deleteChart`
(`src/lib/mcp/tools/library-upload.ts:707`) resolves `library_index/{fileId}` at line 730 and returns
`chart_not_found` at 732 — **before the tenant wall, before the role check, before the `chart_in_use` track
query, and before any write.** So the predicted path mutates nothing, and three instruments had already agreed
the row is absent. Predicting a production tool's behaviour from its source is weaker evidence than watching it
do the thing, and here the observation was free. **It refused as read.** The other four were not attempted:
the refusal is structural, not per-row, and four more identical 404s would add nothing a fifth instrument hasn't
already said.

**Z2's stop clause anticipates `chart_in_use` and says that refusal outranks §2's measurement — STOP and report.**
`chart_not_found` is a different refusal and the clause applies more strongly to it, not less: `chart_in_use`
would mean the population is wrong about bonds, while this means **the population is not addressable by this
tool at all.**

**`cleanup_all_test_data` was not used** — §3 forbids it, and the prohibition costs nothing, because it would
almost certainly have missed them anyway: it sweeps by **`test-`-namespaced uid** (`test-tokens.ts:792`, walking
`mcp_test_users` + Auth `listUsers`), and these `songs` docs carry **no `uploadedBy` field** for such a sweep to
match. The forbidden shortcut is also the wrong shortcut.

## 5 · Z3, in its stopped form — proving the refused call was inert

Not a delta measurement, because there was no delete. What it proves is that the refused write left production
exactly as found:

```
ZZTEST rows still present: 5   (all 5 ids, all `active`, all `crc`)
census: 891 rows  {active: 786, duplicate: 103, archived: 2}
G5 after: {slug: "shirei-tshuvah", tier: "feed", pages: 184}
```

**The census is byte-for-byte the 17:0xZ and 18:4xZ figure — `891 = 786 + 103 + 2 + 0`.** No other row's status
differs. **G4 PASSES trivially and uselessly, for the reason below.**

## 6 · Guards, one by one

| guard | verdict | on what |
|---|---|---|
| **G1** population is the named five | **PASS** | 5/5 by id, all `active`, all `crc`; plain and wide reads agree; no sixth |
| **G2** zero bonds, re-measured | **PASS** | `count: 0, danglingTracksIgnored: 0` × 5 |
| **G3** gone from the widest view | **NOT REACHED** | nothing was deleted; the five are still there |
| **G4** nothing else moved | **PASS, but see §7** | 891 / 786 / 103 / 2, identical before and after |
| **G5** Rosh Hashanah read | **PASS ×2** | 184 / `feed`, before and after |

## 7 · Where the order's own instruments disagreed with each other

**G4 names the wrong instrument for this population, and would have failed a successful delete.** It says the
census "differs by exactly these 5 rows" and points at my 17:0xZ walk — 891 rows, 103 marked — as the baseline.
But that walk is `list_library`, which reads `library_index`, **which never contained these five.** Had the
delete worked, the census delta would have been **0, not 5**, and a lane holding G4 as written would have read
its own success as a failure. The right post-delete instrument is `search_library` returning 0 `ZZTEST` rows
**plus** the census staying at 891 — the second half is the real "nothing else moved" test.

**G3's wide-flag reasoning is sound in general and inoperative here.** `includeNonCharts` / `includeOrphaned` /
`includeUnbindable` decide which rows a filter hides; they cannot reveal or hide a row that is absent from the
collection being filtered. For this population the plain and the wide read return the same five, which is why
"a delete that only hid a row" is not the failure mode to guard against here — **the failure mode is a delete
that removes the `songs` doc and leaves the Storage object**, and no flag on any search tool can see that.

Neither is a defect in the order's judgment: both premises were measured against `search_library`, which is
where the rows are, and the split between the two collections is not visible from that surface.

## 8 · Two findings outside this order, recorded and not touched

**8.1 · `get_chart_status` reports false green on a row that does not exist.** For all five it returned
`{ok: true, health: {status: "ok", source: "firebase-storage"}}` — for a fileId with no `library_index` document
and no `download_chart` path. It is not lying about Storage (the object is really there); it is answering a
narrower question than its name implies, because `getChartHealth` probes Storage by fileId and consults no
catalog. Any lane that treats `get_chart_status: ok` as "this chart is fine" will be wrong in exactly this case:
**bytes present, catalog row gone.** That is the shape of a half-swept fixture and of a botched delete alike.

**8.2 · The refusal's own hint points at the tool that cannot see the problem.** `delete_chart` says *"Verify the
fileId via list_library / search_library"* — but `search_library` is precisely where this fileId came from and
where it still reads `active`, and `list_library` is the one that can't see it. A lane following the hint gets
told the id is fine by one tool and unknown by the other, with nothing naming the collection split.

Both are one-line observations about observability tools, in code this lane already has committed and undeployed
work in. **Neither was fixed: §5 forbids a `src/` change under this order**, and the fix would need the deploy
that is still blocked.

## 9 · What is owed, and by whom

**To `live-cw` — one ruling, and it is small:** *which instrument may delete a `songs`-only row?* Daniel's
instruction ("DELETE THEM") is unambiguous about intent and this lane is not asking him again. What is missing is
the authorized mechanism, because the order's tool structurally cannot do it and the three candidates each carry
a different cost:

1. **Direct Firestore admin delete** of `songs/{id}` × 5, plus the Storage object × 5. Reachable from this
   session right now (the `library_index` reads in §2 came through that surface). It is also **hand-editing
   production data outside every MCP guard** — no rate limit, no tenant wall, no `chart_in_use` check. For rows
   with 0 bonds and no index row those guards have nothing to protect, but "the guards would have passed anyway"
   is a judgment, and this lane does not make it unasked.
2. **Restore the `library_index` row, then `delete_chart`.** Uses the authorized tool, and makes the row briefly
   visible in the band's browse for the first time — a write that adds a fixture to the catalog in order to
   remove it.
3. **A new tool or a widened `delete_chart`** that treats a missing index row as a delete to finish rather than a
   404. The correct long-term answer, and it needs the deploy that is still blocked.

**Also for the ruling:** the same `songs`-without-`library_index` shape may exist beyond these five. This wave
did not survey for it — §5's "nothing else in the catalog is in scope" is explicit, and a census of that
divergence is a different order. **The five are `ZZTEST`-titled and therefore findable; a non-fixture row in the
same state would not be.**

**To Daniel: nothing.** He said delete them; that stands and needs no revisiting. The delay is a tool gap on our
side, not a question for him.

**Still owed to this lane, unchanged:** the deploy question and the Google-Apps collision, both from the
content-hash order, both untouched by this wave.

---

**Nothing in production changed under this order.** Five `ZZTEST` rows remain `active` and visible in search and
the chart picker; the catalog census remains `891 = 786 + 103 + 2 + 0`; `shirei-tshuvah` remains 184 / `feed`;
the satellite tree remains at `5e52e29ff0` with seven unpushed commits.

Claude records; Daniel decides.
