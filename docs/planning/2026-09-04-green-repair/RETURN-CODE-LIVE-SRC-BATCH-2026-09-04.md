# RETURN ← `live` (Code): all five tracks shipped in one deploy. **The Mizmor group is gone. The md5 guard reads `25 of 25, zero mismatched`.** And the gate found six more mixed groups nobody had counted.

Lane: **live-cw (Opus Cowork)** · Executor: `live`, host-side in `~/CentralReform.live`
Order: `HANDOFF-CODE-LIVE-SRC-BATCH-AND-DEPLOY-2026-09-04.md`
Status: **CLOSED. E1–E6 complete.** **Zero catalog rows written.** No new write path.
Shipped: **`95cab8bbe0`**, promoted to production **2026-09-04T01:05:01Z** (`/api/version` reads
`95cab8bbe01d86b0e7ffe8a2d1d90f961d62a373`). Rollback target `5e52e29ff0`, named before the push.

---

## E0 · The one-line version

**`forceScore` was held by a prohibition; it is now held by a gate.** The 0.85 dry plan went from **15 groups /
19 marks with two mixed** to **14 groups / 17 marks with zero mixed**, and the group that disappeared is the one
`R-0903-live-cw-8` was written about.

**And the vacuum is gone.** `md5CrossCheck` read `{0, 0, 0}` over 853 rows because `storageMd5Hash` was read at
one site and written at none. It now reads **`{applicable: 25, claimed: 25, agreed: 25, mismatched: 0}`** on a
25-row bite — a guard that can finally fail, and did not.

## E1 · The format-class gate. **Two groups vanished, and six more were counted that nobody knew were there.**

`chartFormatClass` mapped `audio/*` to `score`, so a chart and its own recording shared a class. Audio and
`unknown` are now their own classes, no lane emits a group spanning two, and `formatClassRefusals` reports how
often the gate fired.

**The before/after, both dry, neither executed:**

| `dedupe_library {forceScore: 0.85, dryRun: true}` | before (`5e52e29ff0`) | after (`95cab8bbe0`) |
|---|---|---|
| `groupsFound` | 15 | **14** |
| `wouldMark` | 19 | **17** |
| groups spanning >1 format class | **2** | **0** |
| `formatClassRefusals` | field absent | **14** |
| the Mizmor group keeping the PDF and marking both mp3s | **present** | **ABSENT** |

**The second mixed group was not in the order and I had not reported it either** — the before-run named only
Mizmor in my 00:1xZ return because that is the row G7 protects. There were two:

| group | kept | marked |
|---|---|---|
| `mizmor shiru ladonai` | `Mizmor Shiru Ladonai.pdf` (10 bonds) | **both** mp3s, incl. `1d-aXA4WzVjKYv…`, the canonical Daniel chose |
| `mi chamocha shur cantor choir descant` | `Mi Chamocha Shur Cantor Choir Descant.pdf` | `Mi Chamocha Shur Cantor Choir Descant.mp3` |

Both are the same shape: **a chart and its own recording, proposed as duplicates of each other.**

**On the refusal count, honestly.** 14 is not "14 near-disasters". It decomposes as **6 from the exact lane** —
name keys holding rows in two classes, which the L1-W4/`cw-5` partition was ALREADY separating before this deploy,
so those six are the gate reporting work it was already doing — **and 8 from the fuzzy lane**, of which the two
above are the ones that would have marked a real chart. The number's value is that it is not zero: it is how a
future caller sees the gate ran. The exact lane's `groupsFound` is **0 before and 0 after**, so §4's stop
condition — "STOP if E1 changes what the exact lane groups" — is not met. Nothing changed there.

**What still needs the marking tool, and this is the part worth reading.** The surviving Mizmor group is the two
mp3s **alone** — same class, byte-identical (`8851625b…` both), and correctly grouped. But its canonical pick keeps
`1VuMq83_0W8ya9…` on earliest-upload — **exactly the row Daniel decided should be hidden.** So a `forceScore` run
would still mark the wrong one. **E1 makes `forceScore` safe from marking a chart; it does not make it write
Daniel's decision.** `R-0904-live-cw-2`'s single-row tool is still the only thing that can.

## E2 · The md5 cross-check asks the object. **`{applicable: 25, claimed: 25, agreed: 25, mismatched: 0}`**

`getStorageObjectMd5` returns the object's own `md5Hash` from metadata without downloading bytes, and the backfill
loop is already holding that object. No field was added, nothing was backfilled, no migration exists.

| | before | after |
|---|---|---|
| `md5CrossCheck` | `{claimed: 0, agreed: 0, mismatched: 0}` over 853 rows | **`{applicable: 25, claimed: 25, agreed: 25, mismatched: 0}`** on a 25-row bite |
| the guard could fail | **no** — nothing populated its input | **yes** |

**G3 asks for `applicable > 0` and `claimed == applicable`; it reads 25 and 25.** `mismatched: 0`, so the finding
the guard exists to produce did not occur in this bite and the wave does not stop.

**The denominator is honest by construction.** The same call reports `failed: 37`, every one a Google-Apps row
refused before the fetch — so they are outside `applicable` because they were never read, not because they were
excused. The source states what agreement certifies, in one sentence: **the store computed that md5 over the bytes
the store holds, so agreement proves the READ WAS FAITHFUL** — not that the bytes are the right chart, and not as
an independent witness to provenance.

**`crc32c` was NOT taken, and the reason is that it is not free.** It sits on all 1,201 objects, but Node has no
built-in crc32c, so taking it means trusting a second implementation to make a claim the md5 already makes. The
order said "if it is free"; it is not, and the source says so where a reader will find it.

## E3 · The demotion is retired **with its reason**, and the two tests were replaced, not deleted

The comment that survives does not say "unused". It says the class gate now decides, that E1 refuses the mixed
group before the comparator can see it, and — for the next reader who is tempted — that the protection **moved
earlier in the pipeline, not away**, so it must not be restored as a safety tiebreak.

Both emulator tests now assert the ruling's actual want: **the group is never emitted and the refusal is counted.**
And each gained the assertion that matters more than the report — **neither row is marked.** That is strictly
better than what the demotion bought: the old fix let the Google-Doc lose and leave the browse; now nothing leaves.

## E4 · `get_chart_status` — a green now means the band can open it

`ok` requires reachable bytes **AND** a `library_index` row. Bytes with no row return
`{status: "bytes_without_index_row", reason}` naming the loop precisely: `download_chart` keys on that row and will
answer `chart_not_found`, while `search_library` reads `songs` and may still show it. **Fails soft** — a Firestore
blip returns null and an unknown catalog is not evidence of absence, so the probed health stands.

### The adjacent thing the order told me to MEASURE, not fix

**`get_chart_status` is NOT tenant-scoped, and there is no equivalent of `delete_chart`'s wall anywhere in its
path.** Measured, not assumed:

- `getChartStatus` (`library-verify.ts`) takes `uid`, reads the caller's role for the rate-limit bypass, then
  probes health by `fileId` and reads `library_index/{fileId}`. **`orgId` is never read and never compared.**
- Its only caller is `src/lib/mcp/tools/index.ts:1469` — `getChartStatus(uidFrom(extra), args)`. **No org context
  is passed in**, so the scoping cannot be happening above it either.
- `delete_chart` by contrast returns `chart_not_found` for another org's row **before** any other check, and its
  own comment says why: so a cross-tenant caller never learns the chart exists.

**I changed nothing about it**, per §4's stop condition. **What E4 does NOT do is widen it**: a cross-tenant row
has an index row, so it returned `ok` before and returns `ok` now. The exposure is unchanged in either direction —
it is a fileId-guessing oracle for byte health, which is what it already was. **This is a finding for a ruling.**

## E5 · The hint no longer sends the caller back to the tool that misled them

One message and one hint, built once and used by **both** branches. That is not tidiness: rewording only the
absence branch would have made the cross-tenant branch distinguishable from it, and `v11-02-03` makes that
ambiguity a security property. **The two states are distinguished in WORDS that are true of both** — no index row
is not the same as no such chart; a row visible in `search_library` but absent here is a `songs`-only row; report
it, do not retry.

## E6 · Guards

| guard | required | result |
|---|---|---|
| **G1** RH before first edit / after deploy | `shirei-tshuvah` 184 / `feed` | **PASS both** |
| **G2** the Mizmor group disappears; refusals ≥ 1; no emitted group is mixed | — | **PASS** — group absent, `formatClassRefusals: 14`, mixed groups **0** |
| **G3** `applicable > 0` and `claimed == applicable` | — | **PASS** — 25 and 25, `mismatched: 0` |
| **G4** zero catalog writes; the five D7 rows unchanged | — | **PASS** — `892 == 790 + 100 + 2 + 0` before and after, all five `active`, every call `dryRun: true`, no `force` anywhere |
| **G5** rollback target named before the push | — | **PASS** — `5e52e29ff036af046bb52706cf577d163b0d95e7`, read off `/api/version` at 01:0xZ |
| **G6** a red build never promotes; the push is the only path | — | **PASS** — build green locally before the push, deploy promoted at 01:05:01Z, no hand-promotion |
| **G7** no new write path | — | **PASS** — no tool added; the single-row marking tool is deliberately absent (§5) |
| **G8** the 257 fixtures untouched | — | **PASS** — not read for any purpose in this wave, not counted, not written |

**Tests: 1,139 emulator tests pass across 82 files. `tsc --noEmit` clean. Build green.**

### The fixture audit, which was not in the order and had to happen

E1 broke **18 emulator tests** on first run. Not one was a defect in E1: the dedupe fixtures seed rows with **no
`mimeType`**, which now classifies `unknown` and is refused. **Production has no such row — 892 of 892 carry a
mime, measured 2026-09-04.** The fixtures modelled a shape production does not have, so the two seed helpers now
default to `application/pdf` and tests that care about class still pass one explicitly. Five more failures were
the behaviour changes themselves and were rewritten to assert the new rule.

**One of those five carried a recorded complaint that E1 resolves.** The hash-pass test said in its own comment:
*"`application/octet-stream` is non_chart to `isNonChartArtifactShape` but `chartFormatClass` maps it to 'score'
… the two classifiers disagree."* They no longer disagree — octet-stream is not a rendering of a chart, so it
classifies `unknown`. **A test's complaint about the code was sitting in the tree as a comment; the ruling fixed
it without either of us noticing the connection until the test failed.**

### Pre-existing failures I did NOT fix, named so they are not mistaken for mine

`npm test` (the unit suite) reports **19 failures, all pre-existing and all outside this lane.** None of the five
files imports anything this deploy touched — verified by grep, not assumed. The books ones trace to a committed
data change, `817870bb3a fix(books): shabbat-shacharit printed pages 145 -> 144`, whose tests still expect 145;
that is liturgy-registry data and belongs to the family's book lane, not to a satellite hygiene deploy. The
`perform-cls`, `public-view` and `sync-engine-songs-mirror` failures are likewise untouched by this commit.
**Reported, not adopted.**

## E7 · What is now outstanding

1. **`R-0904-live-cw-2`'s single-row marking tool** — its own order, its own guards, its own deploy, per §5.
   Daniel's `R-0903-live-cw-8` mark has waited since 21:4xZ and E1 does not write it; the surviving mp3 group
   still picks the wrong canonical.
2. **`get_chart_status`'s tenant scope** — a finding, for a ruling.
3. **The 257 `songs`-only fixture rows** — Daniel's, and this desk recommends HIDE, not delete.
4. **The 38 unreachable-byte rows** — untouched, no order.

Claude records; Daniel decides.
