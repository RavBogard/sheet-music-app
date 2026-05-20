# Lane C-2 — delete the 22 byte-less `upload-*` orphans (DRY-RUN PLAN)

**Status:** DRY-RUN — **HOLD for Daniel confirm. No mutation performed.**
**Prod SHA probed:** `4047e1242` (v7.0.0) · **Probe scope:** all **42** live setlists (exhaustive, no pagination) · **Generated:** 2026-05-20T23:30Z · coder-1

---

## Headline — live truth differs from the assignment

| Source | Bonded | Unbonded | Bonded tracks |
|---|---|---|---|
| Assignment (`msg-lane-c2-delete-all-22-001`) | 14 | 8 | (implied ~28) |
| coder-4 snapshot (`orphan-bond-map.json`, 16:36Z) | 13 | 9 | — |
| **LIVE prod (this probe)** | **12** | **10** | **20** |

All **22 rows still exist** and **all are byte-less** (`get_chart_status` → `status: missing` for every one; 0 healed). So the delete premise holds for all 22 — only the bonded/unbonded split moved.

**2 fileIds the snapshot/assignment called bonded are UNBONDED live** (no live track references them — safe to direct-delete):
- `upload-0594bbd4…` **"Bar'chu Walkdown"** — assignment put it in bryn's bonded 7. No live track bonds this fileId. (A track-id string embeds this UUID, but that track's *current* `fileId` is `upload-037d9094` Em Bar'chu.)
- `upload-3f576cb7…` **"Niggun - Bonia Shur"** — snapshot bonded it to 2 setlists (`pvL81pSC`, `WoguRLMM`); neither exists among the 42 live setlists and no live track bonds it now.

---

## ⚠️ Blast radius — 1 UPCOMING service affected

**"Shavuot Yizkor — May 23"** (`UnjLqKTtS4lNKQfMY6hB`, eventDate 2026-05-23 — **3 days out**) has track **"Hallelujah Jam"** (order 2) bonded to the **Tu Bishvat** fileId (`upload-f39740c1`). The bond is already broken (byte-less); unbonding clears the dead binding and keeps the "Hallelujah Jam" track as a titled placeholder. Likely a mis-bond (chart "Tu Bishvat" ≠ track "Hallelujah Jam").

All 9 affected setlists are currently **unpublished** (`publishedAt: null`). Every other affected setlist is in the **past** (Apr 3 – May 13).

---

## A. Direct delete — 10 UNBONDED rows (`delete_chart({fileId})`)

No live track bonds these; `chart_in_use` guard passes.

| # | Title | fileId | owner | fmt |
|---|---|---|---|---|
| 1 | Bar'chu Walkdown | `upload-0594bbd4-d661-42b9-b11d-feeb3ff4cda6` | bryn | xml |
| 2 | Yedid Nefesh revised 1-1-26 | `upload-1910a665-aae9-4e26-b517-17f61a3afb0b` | bryn | pdf |
| 3 | May the Memory - Full Score | `upload-1e15a09a-2dbd-46a4-b8a7-e045e21af68c` | bryn | pdf |
| 4 | Ana B'Koach mxl | `upload-32b4845e-8593-42cf-8264-caf2d0e348da` | bryn | xml |
| 5 | Sim Shalom - Bonia Shur | `upload-32dbbab2-ee16-405d-a3e4-53c88450e1f4` | bryn | pdf |
| 6 | Niggun - Bonia Shur | `upload-3f576cb7-9c10-4a68-849d-4f3d669bdf80` | bryn | pdf |
| 7 | Ana B'Koach MuseScore File | `upload-743787ce-d038-4b03-ae09-f4c6f6c0696b` | bryn | xml |
| 8 | Matir Asurim B minor (duplicate) | `upload-a06055c4-c67b-4f7c-8d1b-de4cc0082915` | Daniel | pdf |
| 9 | Ve'imru amen - Full Score | `upload-aa425f07-937a-4be7-a13d-1e3000d1d8fa` | bryn | pdf |
| 10 | Ana B'Koach | `upload-da196baf-05d3-411d-b129-456f2fc16de2` | bryn | xml |

## B. Unbond-then-delete — 12 BONDED rows (20 tracks)

For each track: `update_track({setlistId, trackId, songId:null})` (clears songId/fileId/fileName, pulls fileId from parent `fileIds[]`, **keeps the track** as a titled placeholder). After all of a fileId's tracks are unbonded → `delete_chart({fileId})`.

| Chart (fileId) | owner | live tracks (setlist · event · track "title" · order) |
|---|---|---|
| **Tu Bishvat** `upload-f39740c1…` | bryn | **Shavuot Yizkor — May 23 ⚠️ · "Hallelujah Jam" o2**; Shabbat AM Apr 25 · "Tu Bishvat" o2; Shabbat AM Apr 18 · "Tu Bishvat" o3; Shabbat AM Apr 11 · "Tu Bishvat" o3; Shabbat AM Apr 4 · "Tu Bishvat" o3 |
| **Em Bar'chu-Yotzier Walkdown** `upload-037d9094…` | bryn | Shir Shabbat May 13 · "Barchu (walkdown)" o11; Shabbat AM Apr 4 · "Em Bar'chu Yotzier Walkdown" o13; Passover Apr 3 · "Em Bar'chu Yotzier Walkdown" o10 |
| **Mizmor Shiru Ladonai** `upload-2db7e9ff…` | Daniel | Shir Shabbat May 13 · "Mizmor Shiru Ladonai" o5; Seui · "Mizmor Shiru Ladonai" o2 |
| **Erev Shel Shoshanim _ Yamin U'smol** `upload-e0d24d07…` | Daniel | Shir Shabbat May 13 · "Erev Shel L'cha Dodi" o8; Seui · "Erev Shel Shoshanim   Yamin U'smol" o4 |
| **Dancing In The Dark** `upload-9ffab05d…` | Daniel | Mother's Day May 10 · "Dancing In The Dark" o0 |
| **You're In My Heart** `upload-4698f776…` | Daniel | Mother's Day May 10 · "You're In My Heart" o1 |
| **Mi_chamocha E (Moshav)** `upload-f74b8139…` | bryn | Shabbat AM Apr 25 · "Mi chamocha E (Moshav)" o10 |
| **Mizmor L'David** `upload-bb71e9e2…` | Daniel | Seui · "Mizmor L'David" o3 |
| **Stuart's Hora Medley** `upload-13ef3209…` | David | Seui · "Stuart's Hora Medley" o15 |
| **Matir Asurim B minor** `upload-5bb53870…` | Daniel | Shabbat AM Apr 11 · "Matir Asurim B minor" o18 |
| **Ana B'Koach (as of 3-27-26)** `upload-b8afb8e6…` | bryn | Passover Apr 3 · "Ana B'Koach (as of 3 27 26)" o3 |
| **Lecha Dodi Lincoln's Nigun** `upload-0792351b…` | bryn | Passover Apr 3 · "Lecha Dodi Lincoln's Nigun" o7 |

## C. Affected setlists (blast radius) — 9 distinct, by event date

| Setlist | event | published | tracks losing a chart binding |
|---|---|---|---|
| Passover — April 3 (`FB2yEICg`) | 2026-04-03 | no | Em Bar'chu Yotzier Walkdown; Ana B'Koach (3-27-26); Lecha Dodi Lincoln's Nigun |
| Shabbat Morning — April 4 (`9bmwUMJz`) | 2026-04-04 | no | Em Bar'chu Yotzier Walkdown; Tu Bishvat |
| Shabbat Morning — April 11 (`fgxquthW`) | 2026-04-11 | no | Tu Bishvat; Matir Asurim B minor |
| Shabbat Morning — April 18 (`IvowaTdX`) | 2026-04-18 | no | Tu Bishvat |
| Seui (`tIJ5Dlvk`) | 2026-04-20 | no | Mizmor Shiru Ladonai; Erev Shel Shoshanim; Mizmor L'David; Stuart's Hora Medley |
| Shabbat Morning — April 25 (`uBkulVkN`) | 2026-04-25 | no | Tu Bishvat; Mi chamocha E (Moshav) |
| Mother's Day — May 10 (`vJqQL6jb`) | 2026-05-10 | no | Dancing In The Dark; You're In My Heart |
| Shir Shabbat — May 13 (`Ikl0sS4X`) | 2026-05-13 | no | Mizmor Shiru Ladonai; Erev Shel L'cha Dodi; Barchu (walkdown) |
| **Shavuot Yizkor — May 23 ⚠️ UPCOMING** (`UnjLqKTt`) | 2026-05-23 | no | Hallelujah Jam (→ Tu Bishvat chart) |

---

## Execution sequence (ON CONFIRM — not yet run)

1. **Unbond** all 20 bonded tracks via `update_track({setlistId, trackId, songId:null})` (or `bulk_update_tracks` per setlist). Keep each track as a titled placeholder.
2. **Verify** each unbonded track is a clean placeholder (no songId/fileId) + `verify_setlist_charts` reports `unbonded` not `missing`.
3. **delete_chart** all 22 fileIds (10 already-unbonded + 12 now-unbonded). `chart_in_use` guard must pass for all; **STOP + report** on any `chart_in_use`; tolerate `chart_not_found`.
4. **Verify** each row gone (`get_chart_status` → not-found / list_library absent) + `dump_collection_size(library_index)` decremented by 22.
5. SHIP-NOTICE: final deleted counts + affected-setlist list + any anomalies.

## Notes / safety
- Bearer: pool ROOT (read-only here; will NOT be burned).
- NEVER `cleanup_all_test_data` ([[feedback_sandbox_test_isolation]]).
- Rollback: rows are byte-less + the source uploads are gone (per coder-4 B1 verdict), so delete is terminal — but that's the explicit Daniel call ("write them all off"). Unbond is reversible (re-bind a chart later); the song titles stay in every setlist.
- All affected setlists unpublished; Shavuot Yizkor May 23 is the only upcoming one and its bond is already broken (byte-less), so no working chart is lost — only a dead binding is cleared.
