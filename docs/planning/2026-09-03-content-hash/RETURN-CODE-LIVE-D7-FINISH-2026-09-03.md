# RETURN ← `live` (Code), **rev-2 under amendment 1**: F1 landed — both rows are `active`. **F2 cannot be written by any authorized tool**, and the fuzzy lane would have marked the PDF's twin *and* the canonical.

Lane: **live-cw (Opus Cowork)** · Executor: `live`, host-side in `~/CentralReform.live`
Order: `HANDOFF-CODE-LIVE-D7-FINISH-AND-MD5-PROBE-2026-09-03.md` **as amended 23:4xZ (`R-0903-live-cw-10`)**
Status: **CLOSED under amendment 2 — F1 done and verified, F4 returned. F2 has LEFT this order (`R-0904-live-cw-2`). F3 closed by `R-0903-live-cw-11`.** See §R7.
Writes this wave: **two, exactly the two named rows.** No `src/` change, no deploy, no backfill.
Verified-against: production serving `5e52e29ff0` since 2026-09-03T20:27:30Z, unchanged.

> **rev-1 of this file** (23:1xZ) reported the G2 absolute-total stop and F3's md5 probe in full. Amendment 1
> retired the absolute totals and `R-0903-live-cw-11` ruled F3's outcome, so both are settled; **F3's measurement
> is not repeated here** — 1,201 of 1,201 `library/` objects carry `md5Hash` and `crc32c`, 863 of 892 rows have
> such an object. This rev is the wave that amendment 1 made runnable.

---

## R0 · The one-line version

**The amended guards worked exactly as intended.** G2 asked about five rows instead of a total, all five read as
the order said, and **no upload could have stopped this wave** — the catalog moved 891→892 again in neither
direction during it, but it no longer matters, which is the point of `R-0903-live-cw-10`.

**F1 is written.** `Hashiveinu` and `Mi shebeirach` are `active`, the delta over 892 rows is **exactly those two
rows and nothing else**, and no `priorStatus` value was invented for either.

**F2 is not written, and it is not a judgment call this time — it is a wall.** The mark `R-0903-live-cw-8`
authorizes is a **byte-decided single-row mark**, and **no tool on this server can write one.** The only marking
path is `dedupe_library`, a whole-catalog name sweep. I probed it both ways rather than assume:

- **Exact-normalize, dry:** `scanned 792, groupsFound 0, wouldMark 0`. The catalog is clean by name; **the Mizmor
  pair is not reachable at all.** The pair is a *byte-identity* pair, and the hash lane is report-only by design.
- **Fuzzy `forceScore: 0.85`, dry:** it does produce a Mizmor group — **and it is the wrong group, in the way G7
  exists to catch.** See R3. I did not run it.

So the wave stops where §4 says it stops: **a mark that is not reversible is not authorized**, and here it cannot
even be made reversible, because nothing creates the record G6 requires.

## R1 · F1 — the two restores, with their basis stated

Both through `undo_dedupe_group` in **row mode**, one call each, `toStatus: "active"` **passed explicitly**. The
tool's own response says so: `"source": "explicit"` on both rows, on both the dry run and the real run.

| row | before | after | call result |
|---|---|---|---|
| `1HmJ7mu9qYx6eGVaJcg88Hklsei7bnjcAR-ZYmjkgfbU` — *Hashiveinu* | `duplicate` | **`active`** | `restored: 1, skipped: 0, songMirrored: true` |
| `1PYjUUqxH12ip7Uz5aFP7q1wRKwi-pKbvVNJB8G-wV6k` — *Mi shebeirach* | `duplicate` | **`active`** | `restored: 1, skipped: 0, songMirrored: true` |

**Per row, as `R-0903-live-cw-7` requires: `active` was DERIVED under `R-0903-live-cw-7`. It was not read from any
artifact, not recovered from any record, and not inferred from any scan.** No run record was consulted, because
none holds these rows — the 09-03 naming-dedupe run recorded nothing. The status is the one the ruling gives them,
and this sentence is the whole of its provenance.

## R2 · Guards

| guard | required | result |
|---|---|---|
| **G1** RH before F1 / mid / after | `shirei-tshuvah` 184 / `feed` | **PASS ×3** — 184 / `feed` at every read |
| **G2** the five named rows, pre-state recorded | `duplicate`, `duplicate`, `active`, `active`, `active` | **PASS** — all five exactly so |
| **G3** delta after F1 is exactly the two | `{Hashiveinu, Mi shebeirach}`, `duplicate → active` | **PASS — exactly those two, no third row, no new row, no vanished row** |
| **G4** delta after F2 is exactly one | — | **not reached; F2 did not run.** The delta from the G3 read to the closing read is **empty** |
| **G5** no `priorStatus` written for either restored row | field absent | **FAILS ON ITS LETTER, HOLDS ON ITS PURPOSE** — see R4 |
| **G6** the new mark is reversible the moment it is written | run record + clean undo plan | **UNREACHABLE — no tool creates one.** This is the stop |
| **G7** the PDF untouched | `1czN_ywRWm2bnj…` `active` before and after | **PASS** — and see R3, which is why it nearly wasn't |

**The pre-state, recorded as an observation with its provenance** (`R-0903-live-cw-10`: record the totals, fail on
the rows). Measured by me at 00:0xZ via `list_library` with `includeNonCharts` + `includeNonChartHealthy`, paged to
exhaustion:

```
pre    892 == 788 active + 102 duplicate + 2 archived + 0 orphaned
post   892 == 790 active + 100 duplicate + 2 archived + 0 orphaned
```

**No row entered or left the catalog during this wave** — the id sets of the opening and closing reads are
identical, so there is no new authoring to record under G3's second sentence.

## R3 · The probe that G7 was written for, and it fired

`dedupe_library {forceScore: 0.85, dryRun: true}` finds **15 groups, `wouldMark: 19`**. One of them is the Mizmor
group, and this is what it plans:

| role | row | mime | bytes | sha256 | bonds |
|---|---|---|---|---|---|
| **kept** | `1czN_ywRWm2bnj…` *Mizmor Shiru Ladonai.**pdf*** | `application/pdf` | 67,766 | `fb366ee2…` | **10** |
| marked | `1VuMq83_0W8ya9…` *Mizmor Shiru L'adonai .mp3* | `audio/mpeg` | 7,959,323 | `8851625b…` | 0 |
| marked | `1d-aXA4WzVjKYv…` *Mizmor Shiru Ladonai.mp3* | `audio/mpeg` | 7,959,323 | `8851625b…` | 0 |

**Three things are wrong with that group and each of them is a ruling this program already made.**

1. **It groups across formats.** `R-0903-live-cw-5` rules format class as its own axis and the byte test as
   never running where the two sides are different things. The PDF's sha256 is not the mp3s' sha256 — they are not
   duplicates of each other in any sense; they are a chart and its recording. **The fuzzy-name lane does not apply
   the format rule the exact lane's canonical pick does.** That is a `src/` defect, and it is live right now
   behind one optional argument.
2. **It marks the canonical.** `R-0903-live-cw-8` names `1d-aXA4WzVjKYv…` as the row that **keeps** its place.
   This plan hides it.
3. **It reaches the PDF** — as the survivor rather than a loser, so `status` would not change, but a wave that
   plans over `1czN_ywRWm2bnj…` at all "has misunderstood `R-0903-live-cw-5`", in the order's own words. **G7
   caught the shape before the write, which is what it is for.**

**I did not run it.** The measurement is a dry run; the catalog is untouched by it.

## R4 · G5, and why I am reporting a pass and a failure at once

**Both restored rows now carry a `priorStatus` field.** Its value is **`null`**, on both, alongside
`dedupeRunId: null` and `dedupedAt: null` — read straight from Firestore after F1:

```
1HmJ7mu9qYx6eG…  status "active"  priorStatus null  dedupeRunId null  dedupedAt null   updateTime 00:07:10.812Z
1PYjUUqxH12ip7…  status "active"  priorStatus null  dedupeRunId null  dedupedAt null   updateTime 00:07:11.587Z
```

**That null is my own call's tombstone, and the deployed source says so plainly** —
`src/lib/mcp/tools/undo-dedupe.ts:211-220`, whose comment gives the reason: *"A row left carrying `dedupeRunId`
after being restored would report itself as belonging to a run that no longer holds it."* The restore clears the
three dedupe stamps by **writing `null`**, not by deleting the fields.

**So: no status value was invented.** The field holds nothing. The hazard `R-0903-live-cw-7` forbids — a fabricated
prior status laundering into the record as a recovered fact — **did not occur and could not have occurred through
this path.** But **G5 as written can never pass against this tool, for any restore, ever**, because "the field is
absent" is not a state `undo_dedupe_group` leaves a row in.

**I did not treat that as the stop**, because §4's stop conditions do not name G5 and because the guard's own
sentence says what it is protecting: *"a `priorStatus` **present** on either — that is the invention
`R-0903-live-cw-7` forbids"*. What is present is the absence of an invention. **The fix is one word in the guard:
`priorStatus` must carry no VALUE.** That is live-cw's to write, not mine, and it is the third guard in three waves
whose letter and purpose came apart — after G5-of-D7 (which named the wrong mechanism) and G2-of-this-order (which
pinned a total).

## R5 · F2 — the wall, checked on every tool that could have been the door

**`R-0903-live-cw-8` authorized a mark the system cannot write.** The gap is not that the mark is hard; it is that
**the only marking path is a catalog sweep, and single-row marking was never built.**

| path | what it does | why it cannot carry F2 |
|---|---|---|
| `dedupe_library` (exact) | whole-catalog name sweep | **`groupsFound: 0`** — the Mizmor pair is a byte pair; the name lane cannot see it |
| `dedupe_library` (`forceScore`) | fuzzy name sweep | plans **19 marks across 15 groups**, and its Mizmor group is R3's — wrong rows, wrong axis |
| `undo_dedupe_group` (`toStatus: "duplicate"`) | writes any status onto one row | **it works** — dry run plans `1VuMq83… → duplicate` cleanly — **but it CLEARS `priorStatus`/`dedupeRunId` and creates no run record.** The mark would be unreversible by record, which is exactly what G6 refuses |
| `seed_legacy_dedupe_run` | creates a `dedupeRuns` record from passed-in rows | **refuses a row that is not currently `duplicate`** — my dry run returned this row in `noLongerMarked`, `seeded: 0` — **and it hard-codes `runId: "legacy-2026-09-01"`** |

**There is one composition that would technically satisfy G6, and I am naming it rather than running it.** Mark
the row with `undo_dedupe_group {toStatus: "duplicate"}`, then call `seed_legacy_dedupe_run` — which would now
accept it, since the row is `duplicate` — with `priorStatus: "active"` passed in by me. That yields a real,
undoable record. **It also files Daniel's 21:4xZ decision under a run that never happened, dated 2026-09-01, with a
prior status I typed.** That is the invention `R-0903-live-cw-7` forbids, arriving through a different door, and
**a ruling is the only thing that should decide whether the shape is acceptable. It is not mine to take.**

**What I think the answer is, offered as a reading:** the missing tool is small and it is the same shape as
`undo_dedupe_group` — one row, an explicit target status, a run record written *before* the status, `priorStatus`
read in that same run and never guessed. It is `dedupe_library`'s reversibility half applied to a mark that a
human decided instead of a sweep. **That is a `src/` change**, and it rides the batched deploy with the five items
now waiting on it: the dead Google-Apps demotion, the two emulator tests, `get_chart_status`'s false green,
`delete_chart`'s misdirecting hint, and `R-0903-live-cw-11`'s md5 cross-check. **The fuzzy lane's cross-format
grouping (R3) is a sixth**, and it is the only one of the six that can hurt somebody today.

## R6 · What was NOT done, said plainly

- **F2 did not run. The Mizmor mark is unwritten**, and `1VuMq83_0W8ya9…` is `active`. Nothing was marked, hidden
  or deleted anywhere in the catalog.
- **`1czN_ywRWm2bnj…` (the PDF) was not written to**, read-only or otherwise, beyond two status reads and its
  appearance in a dry-run plan I did not execute.
- **F3 was not re-run**, per the amended order and `R-0903-live-cw-11`.
- **No `src/` file was touched and no deploy occurred.** I read `undo-dedupe.ts` to establish R4's provenance and
  changed nothing.
- **The 257 `songs`-only fixture rows were not touched.** That census is CLOSED and separate.

## R7 · CLOSED under amendment 2 (`R-0904-live-cw-1`, `R-0904-live-cw-2`) — F4

**This order is closed on F1 + F4.** The desk took all three findings and ruled them, and nothing in this return
is left hanging:

- **G5 is re-cut to the property it protects** and both rows **PASS**: `priorStatus` carries no VALUE, and the
  tool's `null` tombstone satisfies that. The letter/purpose split is recorded as `R-0904-live-cw-1`, with the
  desk's own note that all three such splits were guards written from the design instead of the implementation —
  and that every guard from here names the source line it asserts.
- **F2 has LEFT this order**, and G4 and G6 leave with it. The mark waits for an instrument, not a
  reconsideration. **The two-tool composition is REFUSED** (`R-0904-live-cw-2`) — it would file Daniel's decision
  under a value not read, a run not run and a date three days early, which is `R-0903-live-cw-7` inverted. I am
  glad I named it rather than ran it.
- **F3 stays closed** by `R-0903-live-cw-11`, and its outcome shipped in the batched deploy — see
  `RETURN-CODE-LIVE-SRC-BATCH-2026-09-04.md` §E2, where the guard that could only pass vacuously now reads
  `{applicable: 25, claimed: 25, agreed: 25, mismatched: 0}`.

**Final state of the five named rows, re-read after the deploy at 2026-09-04T01:0xZ: all five `active`.** The two
restores hold. The Mizmor mark is still unwritten, by ruling.

**CLOSED. Nothing in this order is outstanding.**

Claude records; Daniel decides.
