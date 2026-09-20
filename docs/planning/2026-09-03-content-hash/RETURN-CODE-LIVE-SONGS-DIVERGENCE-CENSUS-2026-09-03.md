# RETURN ← `live` (Code): `songs` holds **1,201** documents. **257** of them have no `library_index` row — and every one is a test fixture.

Lane: **live-cw (Opus Cowork)** · Executor: `live`, host-side in `~/CentralReform.live`
Order: `HANDOFF-CODE-LIVE-SONGS-DIVERGENCE-CENSUS-2026-09-03.md`
Status: **CLOSED, stopped at C2 by G6 as the order directs.** **Zero writes. G5 holds.**
Verified-against: production serving `5e52e29ff0` since 2026-09-03T20:27:30Z.

---

## C0 · The three numbers

```
songs           1201 documents   (crc 1149,  brotherslazaroff 52)
library_index    944 documents   (crc  892,  brotherslazaroff 52)

C2(a)  in songs, absent from library_index [crc] :  257     ← all active, all fixtures
C2(b)  in library_index, absent from songs  [crc] :    0     ← the mirror gap is EMPTY
       intersection                                :  892
```

**`songs` has never been counted in this family before. It is 1,201.** And the divergence is **entirely
one-directional**: every `library_index` row has a `songs` document, without exception. The order expected (b) to
be "probably common and probably benign" — **it is zero**, which is a stronger result than benign. `library_index`
is a strict subset of `songs`.

## C1 · Tenant scope (G3)

**52 and 52.** The other tenant's two collections correspond exactly — 52 documents each, **0** songs-only and
**0** library_index-only. **No id, title or filename of theirs appears anywhere in this return**, and none was
written to any artifact. That is a count, and the count is the whole of what I looked at.

The entire 257-row divergence is `orgId: "crc"`. It is ours.

## C2 · G6 fired, and the order is right about what that means

**257 > 25, so I stopped at C2 and did not characterise rows one at a time.** A residue of a handful is a cleanup;
257 is a systematic divergence with a cause. **But two things were cheap enough to answer without a per-row table,
and one of them outranks the whole census.**

### The §4 stop condition — checked, and it does NOT fire

**No `songs`-only row is bonded to any live setlist. Zero.** I did not make 257 `find_setlists_referencing_chart`
calls; I swept **every `tracks` subcollection in production** with one collection-group query — **1,313 tracks** —
and intersected `chartId` / `fileId` / `driveFileId` / `songId` / `chartFileId` against all 257 ids. **0 hits.**

So the hazard §1 names — *"a chart that can be bonded into a Friday service and cannot be opened at it"* — is real
in principle and **empty in fact today**. Nothing on any iPad points at any of these rows.

### The shape, which is the finding

Every one of the 257 is `status: "active"`. Classified by title signature:

| n | signature |
|---|---|
| 117 | `b6-fixture` — probe fixtures with paired epoch stamps |
| 104 | `iPad Track One / Track Two / iPad deep shared / iPad Stress …` probe fixtures |
| 17 | `ZZ`-prefixed fixtures |
| 17 | other probe/stress/harness fixtures |
| 2 | `[role-…]`-prefixed fixtures |
| **0** | **rows with no fixture signature whatsoever** |

**255 of 257 carry an epoch or ISO timestamp in the title.** The remaining two are the `[role-…]` pair. **Not one
row in the population reads like a real chart**, and none has a null or empty title.

**This is the reassuring answer to the question your §1 asked.** The worry was that a *non-fixture* row could sit
in this state, invisible to browse, visible in the picker Daniel authors from, and unopenable. **No such row
exists.** The five `ZZTEST` rows were not the tip of a hidden real-chart population — they were five members of a
262-row test-fixture residue (257 + the 5 deleted), all of it left behind by probe and harness runs.

## C3 · Guards

| guard | required | result |
|---|---|---|
| **G1** RH at open and close | `shirei-tshuvah` 184 / `feed` | **PASS**, both reads |
| **G2** partition identical open→close | any value, but agreeing | **PASS** — `892 == 788 + 102 + 2 + 0` at both, and both collection counts re-read identical (1201 / 944 / 1149 / 892) |
| **G3** tenant scope a judgment | counts only for the other tenant | **PASS** — 52/52, nothing named |
| **G4** five ZZTEST ids absent from both | absent | **PASS** — 0 in `songs`, 0 in `library_index`, independently re-derived from the full id enumeration rather than a lookup |
| **G5** zero writes | no `force`, no `dryRun:false`, no admin write | **PASS** — every call in this wave is a read; G2's agreement is the evidence |
| **G6** stop if (a) > 25 | stop at C2 | **FIRED at 257** — stopped as directed |

**A note on G2 that the other return covers in full:** the partition here is `892 == 788 + 102 + 2 + 0`, not the
`891 == 788 + 101` or `891 == 787 + 102` the order offers. **Neither `D7-FINISH` landing nor not landing explains
it** — it is a chart Daniel uploaded at 2026-09-03T21:32:01Z, `Avinu Malkeinu (Janowski)`. `D7-FINISH` did **not**
land; it stopped on this same movement. This order's G2 asks only that my two reads agree, and they do.

## C4 · The one thing I did not measure, and why

C3 asked whether the app's own chart-fetch path resolves a `songs`-only row, reading deployed source if a live
probe would need a bond. **G6 stopped the wave before C3**, so I did not do it, and I am not going to smuggle a
C3 answer into a return that stopped at C2. What is established: `download_chart` returned `chart_not_found` for
all five ZZTEST rows [inherited: rev-1 §2], and **no such row is bonded**, so the question has no live instance
today.

## C5 · No recommendation

Per §2's C4 and §5: **I recommend nothing about deleting, healing, marking or restoring any of these 257 rows.**
Nothing was deleted, marked, healed or restored. `R-0903-live-cw-6`'s admin-surface bypass was scoped to five
epoch-titled fixtures and I did not extend it by a single row, however obviously this population resembles them.

What to do with 257 fixture rows is this desk's, and Daniel's.

Claude records; Daniel decides.
