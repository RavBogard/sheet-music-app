# Orphan-track sweep — EXHAUSTIVE verification (per supervisor msg-orphan-verify-001)

**Status:** VERIFIED — **224/224 safe to delete, 0 flagged.** READ-ONLY pass; **no deletes executed.** `--apply` staged, HELD for Daniel green-light + auditor sample re-confirm. 2026-05-21 · coder-1.
**Method:** Firebase admin SDK (global, NOT owner-scoped), prod project `crcmusiccharts`. Per-track machine record: `orphan-tracks-VERIFICATION.json` (all 224). Tool: `scripts/verify-orphan-tracks.mjs`.

## Result

| metric | value |
|---|---|
| `setlists` collection (admin FULL enum) | **42** |
| `tracks` collection | 565 |
| dangling tracks (parent not a live setlist) | **224** |
| tracks with no `setlistId` | 0 |
| distinct dead setlists | 9 |
| **safe to delete** | **224** |
| **flagged DO-NOT-DELETE** | **0** |

## The four proofs (each run for ALL 224, not a sample)

**c1 — parent missing (authoritative doc-read):** for every dangling track, `setlists/{setlistId}.get().exists === false`. ✅ 224/224.

**c2 — belt-and-suspenders, full collection enum:** the admin enumeration of the entire `setlists` collection returns **42 docs**, and **none of the 9 dead setlistIds appear in it** (`deadSetlistIds_appearingInLiveSetlistEnum = []`). This proves the parents are *genuinely absent*, not owner-hidden. ✅

> **Correction worth noting:** the admin global enum (42) **equals** the owner-scoped `list_setlists` (42) — so there are **no owner-hidden setlists**; the 9 dead setlists were simply **deleted**. The lane-C-2 dry-run "miss" was caused by bonds living in *deleted* setlists (dangling tracks the `delete_chart` guard still counts), **not** by owner-scoping. (Owner-scoping is a documented property of `list_setlists`, but it was not the operative cause here.)

**c3 — not a live track:** built the set of all track ids belonging to a live setlist; **0 of the 224 dangling track ids appear in it.** No live setlist's Perform view references any of these track docs. ✅

**c4 — chart safety:** the sweep deletes **only** `tracks/{id}` docs — **zero** `library_index`/chart writes, so no chart content is removed.
- 12 of the 224 dangling tracks point at a *still-active* chart (e.g. Ashrei, K'dushah, Hinei Mah Tov, Tu Bishvat) — those charts **stay intact**; only the dead-setlist track pointer goes.
- 212 point at already-deleted/unknown charts.
- 271 active supplemental (heal-set) charts: **0** intersect the dangling **track** ids (chart ids ≠ track ids). The heal set is untouched.

## Per-dead-setlist breakdown (all 9, all confirmed deleted)

| dead setlistId | dangling tracks | in lane-C-2's 6 |
|---|---|---|
| `CTAi6kgkTUpGYMO1Ffx7` | 44 | yes |
| `xr1cd7h4Yutje9ej3iem` | 43 | yes |
| `P64x0MxFzJ3BWfrb2GYs` | 42 | NEW |
| `htxUSjxtg4Py6pKLQgj5` | 37 | yes |
| `ZR8PcmFuDvM8gdYErMFm` | 26 | NEW |
| `WoguRLMMTOv24o1G2ew3` | 15 | yes |
| `5ZOswikr7CKqm7Zp7zje` | 15 | yes |
| `OaqXciKwYesUuYcYuU7X` | 1 | NEW |
| `kQNvssixRlHQRB6gtWqt` | 1 | NEW |

## Conclusion

All 224 dangling tracks are genuinely dead (deleted parent, absent from full collection enum, not referenced by any live setlist) and safe to delete; deleting them removes **no chart content**. **0 exceptions.** `scripts/sweep-orphan-tracks-deleted-setlists.mjs --apply` is staged for the single owner (coder-1) to run **only on Daniel's green-light**, after the auditor's independent sample re-confirm.
