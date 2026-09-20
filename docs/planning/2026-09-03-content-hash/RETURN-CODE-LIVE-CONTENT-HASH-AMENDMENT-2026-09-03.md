# RETURN → `live-cw`: the amendment is built, G7 is ANSWERED against production, and §10 cannot reach the rows it names

Lane: **live (Code)**, host-side in `~/CentralReform.live/sheet-music-app`
Order: `HANDOFF-CODE-LIVE-CONTENT-HASH-2026-09-03.md` **as amended 17:2xZ** · Authority: **R-0903-live-cw-3 §2, §3**
Supplements — does not replace — `RETURN-CODE-LIVE-CONTENT-HASH-2026-09-03.md` (W1–W5, closed at 17:0xZ).
Status: **§5's amendment BUILT AND TESTED. G7 ANSWERED, 41/41 rows, against production. §10 BLOCKED — and not by
the deploy: by its own mechanism.** HEAD **`5e52e29ff0`**, 7 commits, nothing pushed, nothing deployed.
Verified-against: `9933d2abef`, re-confirmed host-side from `git ls-remote` this row.

---

## 0 · Read this part first

**The amendment was written on a false premise about this lane's state.** Its own text says *"while still unopened
by `live`"* and *"your last event is the 02:3xZ close"*. Both were already untrue when it was written: this lane's
**17:0xZ board row** — which precedes `live-cw`'s 17:3xZ row in the board — reports W1–W5 **built, tested and
committed at `4ab2d282e6`**, the deploy contradiction, and the Google-Apps collision. So the amendment could not
take any of that into account, and the two rulings it was asked for were never on its desk.

The good news is that the amendment's three changes **widen rather than re-sequence**, exactly as it claims, so
none of the built work is invalidated. What follows is (1) the delta actually required, built; (2) **G7's answer,
obtained today from production without a deploy**; and (3) a finding that makes the owed ruling *necessary* rather
than merely useful: **§10's rule cannot reach the only rows §10 names.**

## 1 · §5's amendment — the population was already right; the REPORT was the gap

The amendment's demand is that the `non_chart` rows be hashed and reported as their own population. Checked before
building: **the backfill never consulted the junk filter and already had every status in scope**, so audio rows were
never excluded from the population. What was missing was the amendment's actual ask — *"Two populations, two lines;
a single blended number answers neither question."*

Built in `backfill-content-hash.ts`: `populations.chart` and `populations.nonChart`, each carrying
`{rows, read, bytesRead, hashed, alreadyCurrent, failed}`.

- **Tallied inside the loop, not reconstructed afterwards.** Reconstruction would mean re-classifying rows out of
  the failure list, and a row that failed for `bytes_unreachable` is not in that list twice.
- **`hashed` is attributed after the batch commits**, per population, so a run that dies mid-backfill reports what
  landed rather than what it intended to write.
- **`bytesRead` is in BYTES, not rows**, because the amendment names the cost in bytes. A row count would hide the
  thing that makes the wave long.
- **The `force_required` refusal carries the populations too.** A refusal that reports less than the run it refuses
  is how an operator gets a surprise bill on a 55 MB population.
- **The partition follows `isNonChartArtifactShape`** — the same classifier the browse surfaces and
  `search_library` use — rather than a fresh definition invented in this tool. **Consequence, pinned by a test
  rather than left to surprise a reader:** that classifier calls Google-Apps rows `non_chart` too, so a
  Google-Doc's `bytes_unreachable` failure lands in the `nonChart` population, not in the chart one.

6 new emulator tests; **20/20 in that file**. One of them asserts an audio row gets hashed *at all*, so that if a
later change ever re-excludes the population §9 originally wrote off, it fails loudly.

Commit **`5e52e29ff0`**, trailer `Lane: live (Code)`, verified by reading it back out.

## 2 · G7 · ANSWERED — and the answer is the opposite of the worry

G7 asks W6 to report, per row, that row's `contentHash.value` or a named reason it has none. It assumes W4 ran in
production; W4 cannot (§4). **So G7 was obtained the way G5 was: pull the real bytes through the already-live
`download_chart` and sha256 them locally.** Bytes never entered the conversation — the probe prints digests only.

**41 rows across 10 groups. 41 hashed. 0 failures. 55,290,345 bytes read.**

| group | rows | distinct sha256 | verdict |
|---|---|---|---|
| `avinu malkeinu janowski d minor` | 5 | **5** | parts genuinely differ |
| `avinu malkeinu_traditional_em` | 5 | **5** | parts genuinely differ |
| `may the memory` | 5 | **5** | parts genuinely differ |
| `the great aleinu` | 5 | **5** | parts genuinely differ |
| `unetaneh_tokef` | 5 | **5** | parts genuinely differ |
| `ve_imru amen` | 5 | **5** | parts genuinely differ |
| `barechu_trad` | 4 | **4** | parts genuinely differ |
| `niggun` | 3 | **3** | parts genuinely differ |
| `kedusha in am` | 2 | **2** | parts genuinely differ |
| `michamocha (shir shabbat)` | 2 | **2** | parts genuinely differ |

**41 distinct sha256 across ALL groups — and 41 distinct md5 as well.** No two audio part-tracks in this catalog
are the same file, within a group or across groups.

**The number that makes this decisive: 9 byte sizes are shared by more than one row, involving 36 of the 41 rows —
and all 41 are byte-distinct anyway.** Size-coincidence is the *norm* in this corpus and it carries no information.
G7 said either result is a finding and only a missing row is a failure; this is the second of its two branches:
**the sizes coinciding is what part-writing from one template looks like.** A singer rehearsing the alto line is
hearing the alto line. **Nothing here needs Daniel, and nothing here needs hiding.**

Two independent confirmations of the run, neither of them planned as such:

1. **The probe was run twice** (the first run crashed on my own bug — I shadowed the global `URL` with the endpoint
   constant — after all digests had printed). The second, fixed run reproduced **every digest identically** from a
   fresh set of downloads.
2. **`bytesRead` came to exactly the inventory's independently-computed total, 55,290,345**, which means every
   row's stored `fileSize` equals its actual byte length — `sizeAgrees` true 41/41. The catalog's size metadata is
   not drifting, which is worth knowing separately from the hashes.

Evidence: `g7_evidence.json` in the session scratchpad — per row, full sha256, full md5, claimed vs actual size,
mime.

**One honest nuance about §5's md5 argument.** In *this* population md5 would have reached the same verdict, 41/41
distinct. §5's case against md5 as the KEY is not that md5 is inaccurate; it is that md5 is **not uniform** —
Google-Apps rows carry none — so a column holding whichever hash was cheapest splits true pairs. That argument is
untouched, and it is worth stating precisely rather than letting "sha256 caught it" imply something the data does
not show.

## 3 · The audio inventory corrects two of the order's numbers

Measured over all 891 catalog rows, not sampled:

- **10 multi-row audio groups, not 12.** Standing references to "the 12 audio part-track groups" — including §9's —
  overcount. There are 10 groups with more than one row, plus 24 single-row audio rows.
- **`barechu_trad` has 4 part rows, not 5.** §5 carries `951,274 B across five`; it is 951,274 B **each** across
  **four** — 3,805,096 B. This is the same shape of error as the five numbers the earlier return corrected: an
  inherited figure that was a per-row size read as a total, or a part count remembered rather than counted.
- **The cost §5 warned about is real but smaller than stated for the named three:** those three groups are
  8,351,653 + 7,554,605 + 3,805,096 = **19.7 MB**, and all ten are **55.3 MB**.

**And a cost nobody has named: the 24 single-row audio rows hold 305,970,207 bytes — 306 MB, five and a half times
the entire multi-row population.** Not in scope, not touched, reported because a future full-catalog byte pass will
meet it and should not meet it by surprise.

## 4 · §10 · BLOCKED, and not by the deploy — by its own mechanism

This is the finding that matters most, and it is not the blocker already reported.

§10 defines its population as *"every currently-`duplicate` row that W5's dry run pairs with a visible keeper —
which includes the three `non_chart` cross-format rows your duplicate-sweep return listed as §3 rows 3–5 and left
open"*, and rules: **bytes differ → restore.**

Measured against production this row:

```
891 total = active 786 + duplicate 103 + archived 2 + orphaned 0     (sum 891 — identity holds)

duplicate-row mime census:
  application/pdf                       98
  application/vnd.google-apps.document   3   ← exactly §10's named rows
  application/octet-stream               1
  image/png                              1
```

The three named rows, still marked, with their keepers all `active`:

| hidden row | | keeper |
|---|---|---|
| `1gTZdh60…` gapps doc 1,486 B **duplicate** | Adon Olam | `upload-7853815f…` pdf 44,645 B active |
| `1HmJ7mu9…` gapps doc 3,539 B **duplicate** | Hashiveinu | `1-nZdkk3…` pdf 24,791 B active |
| `1PYjUUqx…` gapps doc 1,024 B **duplicate** | Mi shebeirach | `1-GuL3x3…` pdf 64,268 B active |

**All three are Google-Apps rows — and they are precisely the population the built lanes can never pair:**

- the **hash pass** cannot see them: a Google-Apps row has no stored bytes, so it gets no `contentHash`, so it is
  not a candidate;
- the **name passes** cannot group them either: L1-W4's `chartFormatClass` partition puts a Google-Doc and a PDF in
  different buckets, in both the exact and the fuzzy lane.

So W5's dry run pairs them with **nothing** — and §10's own sentence then governs: *"a marked row W5 pairs with
nothing is untouched and stays marked."* **§10's rule therefore cannot reach the only rows §10 names.** The
amendment believed it had turned those three from a question into a rule; the mechanism excludes them from the rule.

**This is the third consequence of the Google-Apps collision reported at 17:0xZ**, after the unreachable §4
demotion and the 2 red tests — and it is the one that makes the owed ruling *necessary* rather than tidy. Note also
that for these three, "bytes differ" is not even *measurable*: there are no bytes on one side. Whatever the ruling
decides, §10's byte test needs a stated answer for the case where one side has no bytes at all.

**I applied no restore.** §10 requires them to go through `undo_dedupe_group`, which is built and undeployed, and
§8's new exception authorizes the §10 restores — not a hand-edit substituting for them.

## 5 · Guards, this row

| guard | result |
|---|---|
| **G1** NUL-free source | **0** across every tracked `.ts`/`.tsx` under `src/` |
| **G2** reversibility precedes hiding | unchanged from the 17:0xZ return; fail branch shown there, reverted |
| **G3** the undo refuses what it must | unchanged from the 17:0xZ return; output shown there |
| **G4** no hash for unverified bytes | fail branch re-run green this row (`[G4 FAIL BRANCH]` printed) |
| **G5** the 5 must-group / 2 must-not | **7/7 against production**, at 17:0xZ, by the same technique as G7 |
| **G6** RH read + population identity | `shirei-tshuvah` **184 / `feed`**; `891 == 786 + 103 + 2 + 0` |
| **G7** per-row audio hashes | **PASS — 41/41 rows, 0 missing, 0 unnamed.** §2 above |

On G6's second half: the 17:0xZ return recorded `785 == 684 + 99 + 2`. That was the **eligible/browse-visible**
measurement; this row's `891 == 786 + 103 + 2 + 0` is the **whole-catalog status** partition. Both hold; they count
different populations, and saying so is cheaper than letting a future reader treat one as a regression of the other.

## 6 · The suite, and a correction to my own earlier figure

**These are two different suites and my 17:0xZ row quoted only one of them.**

| suite | result |
|---|---|
| unit (`vitest run`) | **3,990 pass / 17 fail** across 6 files, 78 skipped |
| emulator (`vitest.emulator.config.ts`) | **1,136 pass / 2 fail** |

The 17:0xZ row's "931 pass / 2 fail" was a scoped run, not the whole suite. The **2** are the same known pair
(`L1-W2 rank — status outranks the Google-Apps demotion`, `canonical-picker — mixed-mime group`) — the collision,
unchanged.

**The 17 are proven pre-existing, not assumed.** I checked out `9933d2abef` — the order's own `Verified-against` —
into a temporary worktree and ran exactly those 6 files: **6 files failed, 17 tests failed, identical counts.** They
are the stale book fixtures and UI reds that `REMOTE-MAIN` §6 lists as out of scope, and **none of the 6 files
touches anything this row changed.** Worktree removed afterwards; `git worktree list` shows only the canonical tree.

**One hazard hit and worth recording:** `ln -s node_modules` under MSYS produced a **deep copy**, not a link
(`LinkType` empty, no reparse point, 945 entries). Had I assumed it was a junction and reached for `rm -rf`, I would
have deleted the real `node_modules` through it. I checked the link type first and removed the copy explicitly, then
re-counted the real directory (948, unharmed).

## 7 · Two findings outside every scope, reported and untouched

- **5 `ZZTEST` rows are live in the production catalog with `status: "active"`** — ids
  `upload-31b693a9…`, `upload-f7db6d7c…`, `upload-98513c84…`, `upload-50e1c68e…`, `upload-a8ec348a…`, all titled
  `ZZTEST Avinu<epoch> Malkeinu Janowski<epoch>`. Test fixtures that outlived their sweep. They are visible to the
  band. Not in any order I hold, so untouched — but somebody should own this, and `cleanup_all_test_data` exists.
- **`Michamocha (Shir Shabbat)` exists twice, the second with a trailing space in the title** —
  `10i20SEfzKTv…` 3,251,012 B and `17YFbGz0YNvC…` 6,603,881 B, **byte-different**, so they are two real recordings
  distinguishable only by an invisible character. A name-based pass cannot decide this and a hash pass will not
  group it.

## 8 · What is still owed, and what is now blocked

**BLOCKED, still, on live-cw's ruling — and the blocker is wider than at 17:0xZ:**

1. **The deploy question.** W4's backfill, `seed_legacy_dedupe_run`, W5's dry run **and now §10's restores** all
   need the new code running in production, which §8 forbids. It is server-side; there are no service-account
   credentials in this tree and I did not pull prod secrets. The amendment added obligations without touching the
   contradiction, because it did not know the contradiction had been reported.
2. **The Google-Apps collision**, now with a third consequence: it makes **§10 inoperative on its own named
   population** (§4). The ruling needs to say both whether a Google-Doc and a PDF of the same song are duplicates,
   **and** what §10's byte test means when one side has no bytes.

**DONE and needing nothing:** §5's amendment (built, tested, committed) and **G7 — answered, for all 10 groups, not
just the 3 named.** Daniel's audio question is closed by measurement: **no group is one file under several part
names.** That answer required no deploy and no ruling, and it is the one thing in this order he was actually waiting
on.

**Untouched and still nobody's:** the 98 pdf-mime marked rows, the `octet-stream` and `image/png` marked rows, the
306 MB of single-row audio, the 5 ZZTEST rows, the trailing-space Michamocha pair, and the 17 pre-existing unit reds.

Claude records; Daniel decides.
