# RETURN → `live-cw`: every `duplicate`-marked row audited. READ-ONLY, nothing written.

Lane: **`live` (Code)**, host-side in `~/CentralReform.live` · Order: `HANDOFF-CODE-LIVE-DUPLICATE-SWEEP-2026-09-03.md`
Authority: R-0903-live-cw-1 §3 · Status: **W1 / W2 / W3 complete, STOPPED as ordered.**
**HEAD confirmed host-side at open, 2026-09-03 01:5xZ: `9933d2abef` == `origin/master`** — matches Verified-against.
`git status --porcelain src/` clean apart from `src/build-info.json` (build artifact, never staged).

**Identities, per §6.** `list_books` and the first two `list_library` probes ran from the connected
`claude.ai CRC Music` client (`musician`). The 785- and 891-row enumerations and the single
`dedupe_library({dryRun:true})` ran over the **bearer path** (`scripts/supervisor-prod-bearer.mjs`, admin).
Both identities returned identical `coverage` figures where they overlap.

**Nothing was written, marked, un-marked, restored or deployed.**

---

## 1 · The headline: the 16:2xZ shape does not recur. Zero occurrences.

**Of 100 `duplicate`-marked rows, 5 are CROSS-FORMAT, and in all 5 the PDF is the row that was KEPT.**
Not one row anywhere in the marked population is a PDF hidden behind a non-PDF. The incident Daniel
authorized on 09-02 was a singleton, and the fix at `9933d2abef` closed it prospectively; this pass
confirms there is no backlog of the same damage.

## 2 · Population arithmetic, as found — and the two tools disagree

| source | identity | figure |
|---|---|---|
| `list_library({limit:1})` | musician + bearer | visible **687** · `byStatus.duplicate` **96** · `archived` **2** · eligible **785** · total **891** |
| `list_library({includeNonChartHealthy:true})` | both | returns **785**, `byStatus` empty |
| `dedupe_library({dryRun:true})` | bearer | eligible **791** · `byStatus.duplicate` **100** · `groupsFound` **0** · `wouldMark` **0** |

**G1 PASS:** `785 == 687 + 96 + 2`, from one response.

**The 96/100 disagreement is a finding, and it is fully explained by measurement, not arithmetic.**
Paging `list_library({includeNonChartHealthy:true, includeNonCharts:true})` returns all **891** rows,
of which **100** carry `status:'duplicate'`. **Exactly 4** of those 100 are also caught by the
`non_chart` filter, which `list_library` applies *before* it tallies status and `dedupe_library` does
not apply at all. `891 − 106 non_chart = 785`; `100 − 4 = 96`. Both numbers are right about different
populations. **The true marked population is 100.** The 4:

```
1gTZdh60yL9zN6zhQmbBeK7n-zxMxoshkZwHqwpYN99k  'Adon Olam'          application/vnd.google-apps.document  1486B
upload-8cf12700-fb49-4d3c-8b96-fcadab19999f   "Bar'chu Walkdown"   application/octet-stream              2336B
1HmJ7mu9qYx6eGVaJcg88Hklsei7bnjcAR-ZYmjkgfbU  'Hashiveinu'         application/vnd.google-apps.document  3539B
1PYjUUqxH12ip7Uz5aFP7q1wRKwi-pKbvVNJB8G-wV6k  'Mi shebeirach'      application/vnd.google-apps.document  1024B
```

**Enumeration integrity:** 891 rows fetched across 5 pages, **891 unique fileIds**, `total` stable at
891 on every page. Paged to `total`; not sampled.

### Reconciliation against the 09-01 undo file

`85 Counter({'active': 67, 'archived': 18})` reproduced on this mount. **85 of the 100 marked rows are
covered by it; 15 are not.** All 85 undo rows are still marked — **0 drift.** The 15 uncovered rows
carry no recorded canonical partner on disk and are listed in §5.

**Why 15, stated by its evidence rather than by the sum.** `L1-W2-DEDUPE-PLAN-2026-09-01.json`'s own
`coverage.filteredOut.byStatus.duplicate` is **15** — that many rows were already marked when the 09-01
sweep ran. The 09-02 sweep committed **exactly one** row (`committed: 1`, quoted from
`RETURN-CODE-LIVE-DEDUPE-CROSSFORMAT-2026-09-02.md`), and that row was restored at 16:00Z; it is
correctly **not** in today's marked set. So `15 + 85 = 100` is corroborated at both ends.
**Caveat stated plainly: the plan file records the count 15 but not the identities**, so the claim
"these 15 are that 15" is consistent with every artifact on disk and is not directly stamped by one.

## 3 · CROSS-FORMAT pairs — 5, and only 2 are actionable

One line each, both rows' mime and size on the line. **HIDDEN → KEPT.**

| # | song | HIDDEN row | KEPT row | prior | pairing | restoring it would… |
|---|---|---|---|---|---|---|
| 1 | Barchu Walkdown | `upload-046649f0` **text/plain 164B** (2026-05-22, core) | `1i3jy2Co…` application/pdf 22,608B | `active` | record | **make a row visible again** |
| 2 | Od Yavo Shalom Aleinu | `upload-4f05ce1a` **text/plain 260B** (2026-06-04, uploads) | `13aYPTWG…` application/pdf 29,601B | `active` | record | **make a row visible again** |
| 3 | Adon Olam | `1gTZdh60…` gapps doc 1,486B | `upload-7853815f` application/pdf 44,645B | `active` | record | change nothing visible — `non_chart` |
| 4 | Hashiveinu | `1HmJ7mu9…` gapps doc 3,539B | `1-nZdkk3…` application/pdf 24,791B | unknown | **inferred** | change nothing visible — `non_chart` |
| 5 | Mi shebeirach | `1PYjUUqx…` gapps doc 1,024B | `1-GuL3x3…` application/pdf 64,268B | unknown | **inferred** | change nothing visible — `non_chart` |

**Rows 3–5 are a no-op in practice** and this is the fact that should decide them: those three are the
Google-Docs rows from §2's list of 4, so the `non_chart` filter hides them whatever their status is.
Un-marking them tidies the record; it puts nothing back in front of the band.

**Rows 1 and 2 are the real question, and they are the only two.** Under the rule shipped at
`9933d2abef` — a PDF and a text chart of the same song are two renderings, not two uploads — neither
should ever have grouped, and both are `text/plain` stubs of 164 and 260 bytes sitting behind real
PDFs. **Yes/no, per row: restore it to `active`?** Both were `active` before they were marked.

## 4 · SAME-FORMAT — 95 pairs. Not this order's question (§6); seven notes for a later sitting.

**82 of the 95 share both mimeType and byte size exactly** — clean duplicates, no concern.
**7 hide a LARGER row behind a smaller one**, which is the shape most likely to be a distinct
arrangement rather than a duplicate:

| song | HIDDEN | KEPT | gap | prior |
|---|---|---|---|---|
| **Shalom Rav** | pdf **544,606B** | pdf 36,288B | **15×** | `active` |
| Oseh Shalom (Nava Tehila) | pdf 67,340B | pdf 34,043B | 2× | `active` |
| L'Cha Dodi Dmin | pdf 89,773B | pdf 60,813B | 1.5× | unknown (inferred) |
| T'filah Adonai s'fatai — Full Score | pdf 61,638B | pdf 61,344B | +294B | unknown (inferred) |
| T'filah Adonai s'fatai — Full Score | pdf 61,638B | pdf 61,344B | +294B | `active` |
| Shalom alechem (Goldfarb) | pdf 30,731B | pdf 30,596B | +135B | `archived` |
| Unetaneh_Tokef 4 parts | pdf 40,792B | pdf 40,751B | +41B | `archived` |

**`Shalom Rav` was the one worth a person's eye — Daniel looked, and §8 resolves it.** A 544 KB score
hidden behind a 36 KB one is not a plausible duplicate of it; the small four are within a rounding of
each other and probably are.

**One more, and it touches the MusicXML strategy:** `upload-8cf12700` "Bar'chu Walkdown",
`application/octet-stream`, 2,336B, is marked `duplicate` **and** caught by the `non_chart` filter, so
it is doubly hidden. Octet-stream is the mime that breaks format routing. There are three
`Bar'chu Walkdown` rows in total — this one, the 164B text (§3 row 1) and the kept 22,608B PDF.

**No hidden row anywhere in the 100 is `human_curated`.** The 09-02 incident's most alarming
property does not repeat.

## 5 · The 15 marked rows the undo file does not cover

`1Uf0bVHJ…` Ana B_Koach pdf 49,486B **(2 active candidates — inference NOT unique)** · `1rmnciu0…` Bar'chu
Walkdown pdf 22,608B · `upload-8cf12700` Bar'chu Walkdown octet-stream 2,336B · `1wKn6KPX…` Barchu
(Siegel) pdf 31,480B · `113D2wnF…` Dis Trust — Full Score pdf 54,912B · `1TeiP5Bl…` dodi li (sher)
**image/png** 140,355B · `1HmJ7mu9…` Hashiveinu gapps 3,539B · `1JlQ6xac…` L'Cha Dodi Dmin pdf 89,773B ·
`1h2-nbJY…` Mi chamocha (Moshav) morning pdf 37,809B · `19FuqP-r…` Mi shebeirach pdf 35,646B ·
`1PYjUUqx…` Mi shebeirach gapps 1,024B · `1CwH1LAL…` Modeh Ani Klepper pdf 31,009B · `1Tlx0xpp…`
Om-Ney Dm — Full Score pdf 49,779B · `1PxJ-AxX…` Refa tziri pdf 32,626B · `1Dx-47Ep…` T'filah Adonai
s'fatai — Full Score pdf 61,638B.

**14 of 15 infer a unique active partner by normalized name; `Ana B_Koach` has two** and its pairing is
therefore reported as ambiguous rather than resolved. Every one of the 15 is labelled `pairing: inferred`
throughout this return — no inference is presented as a record.

## 6 · Guards

- **G1 · Population identity — PASS.** `785 == 687 + 96 + 2`, one response, 2026-09-03 01:5xZ.
- **G2 · Pairing completeness — PASS.** 100 marked → **100 paired, 0 unpaired, 0 remainder** in either
  direction. Partition asserted in code, not by eye.
- **G3 · Deciding fields present — PASS, and BOTH BRANCHES RAN.**
  **Fail branch, on the artifact whose shape caused the incident:** fed `L1-W2-DEDUPE-PLAN-2026-09-01.json`'s
  own `groups[0]` verbatim, G3 returned `REFUSED — kept row 1-7s6O5YGk5noWiVhtktHwpr7SHOq8_09 missing
  mimeType and fileSize`. Across **all 85 plan-file pairs: refused=85, rendered=0.** The guard refuses the
  entire historical artifact, as §5 predicted it must.
  **Pass branch, same function, live data: refused=2, rendered=98 of 100.**
  **The 2 live refusals are reported as refused rather than rendered:**
  `1b9n_WsS…`/`1LPfmwfa…` 'Barchu (Friedman)' — `fileSize` null on **both** rows; and
  `1CwH1LAL…`/`1t7fPtGb…` 'Modeh Ani Klepper' — `fileSize` null on the kept row.
  Confirming §3 of the order: all 84 plan groups carry only `fileId`, `name`, `uploadedAt`.
- **G4 · Rosh Hashanah — GREEN before and after**, quoted both times:
  `shirei-tshuvah` **184 / `feed`**; also `shabbat-maariv` 69 / `feed`, `shabbat-shacharit` **144** / `feed`,
  `crc-friday` 48 / `pagemap`, `crc-saturday` 102 / `pagemap`. This order deployed nothing.

## 7 · There is no un-mark tool

**Stated as required (R-0903-live-cw-1 §3(b)): nothing in the MCP surface un-marks a `duplicate`.**
`edit_library_entry` does not expose `status`. Restoring any row in §3 is a direct Firestore edit to
`library_index` (and the mirrored `songs/{id}` doc where it exists), needs Daniel at the keyboard, and
is exactly the shape of the 16:00Z repair. **None was performed under this order.**

---

**FOR DANIEL (decide-by: none — no clock on this; the Rosh Hashanah clock is §8):**
**2 pairs** await your word — §3 rows 1 and 2, the two `text/plain` stubs behind real PDFs. Three more
(§3 rows 3–5) are yours if you want the record tidy, but restoring them changes nothing anyone sees.
Separately, **`Shalom Rav` is now RESOLVED in §8 — no restore needed**, and it opened a larger finding:
**5 byte-identical duplicate pairs are sitting visible in the catalog right now**, invisible to
name-based dedupe.

**FOR COWORK (`live-cw`):** three things want a ruling, none spent here (rule 1).
(a) Should a cross-format pair whose hidden row is `non_chart`-filtered be un-marked at all, given it is a
no-op for the band? (b) `dedupe_library` and `list_library` legitimately disagree on the duplicate count
because they filter in different orders — worth making one of them say so in its `coverage`, rather than
leaving the next lane to rediscover §2. (c) The `undo_dedupe_group` gap I raised on 09-02 is now measured:
**100 rows are marked and 0 of them can be reversed by any tool.**

**FOR COWORK (vision):** `~/shireishabbat/STATUS.md` is **90,524 bytes / 63 rows** — past rule 15's
~50-row rotation threshold and approaching the ~100 KB one.

---

## 8 · Addendum — `Shalom Rav` resolved by hash, and what it exposed

Daniel's read at 02:1xZ: *"i think they are different shalom ravs."* **He is right, and the consequence
is the opposite of what §4 implied.** Three rows carry the stem, not two:

| row | status | bytes | sha256 | what it is |
|---|---|---|---|---|
| `1nM6XI_T…` 'Shalom Rav' | **duplicate** | 544,606 | `486be59d…` | 1 page, 1 image — a **scan**; the PDF's own `/Title` is `993122D191 SHALOM RAV (KLEPPE…` |
| `upload-e64047ae` 'Shalom Rav (klepper)' | **active** | 544,606 | `486be59d…` | **byte-identical to the row above** |
| `upload-bac3a36d` 'Shalom Rav' | **active** | 36,288 | `5417957c…` | 1 page, 0 images, `/Creator` MuseScore — an **engraving**, `human_curated` |

[measured: `download_chart` over the bearer path, sha256 of the decoded bytes, 2026-09-03 02:1xZ]

**So the marked row should stay marked, and no restore is warranted.** It is a genuine duplicate — of
the Klepper scan, which is still `active` and visible. Nothing is missing from the band's view: they see
one engraved `Shalom Rav` and one `Shalom Rav (klepper)` scan, which is correct.

**But the sweep reached the right outcome by the wrong route, and that is the finding.** It grouped the
Klepper scan with an unrelated MuseScore engraving because the normalized names matched, while the scan's
actual byte-for-byte twin was never a candidate because its name says `(klepper)`. **Name-based grouping
over-reaches and under-reaches at the same time**, and only the second failure leaves duplicates standing.

### 5 byte-identical pairs are visible in the catalog right now

Both rows `active` in every case, so the band sees each chart twice. Confirmed by sha256, not by size:

| pair | bytes | sha256 |
|---|---|---|
| `Niggun - Bonia Full Score` / `Niggun - Full Score` | 49,551 | `60ebf618…` **NEW** |
| `G-minor Spirits` / `gminor_spirits` | 42,729 | `939c2ec4…` (known, R-0901-live-cw-4 §6) |
| `B-minor Simple Tune` / `Bminor_simpletune` | 39,599 | `2e5a9914…` (known, R-0901-live-cw-4 §6) |
| `twilight` / `Twilight (D Goldenberg)` | 29,132 | `bc8f6890…` **NEW** |
| `Hashkivenu (Randy)` / `Hashkivenu (Randy) (1)` | 22,443 | `f853ccf2…` **NEW** |

**And size alone would have been wrong twice** — which is why these were hashed rather than counted:
`V'Shamru` / `V'Shamru (Old Skool)` and `Adonai Oz (Nava Tehila)` / `Avinu Malkeinu_trad_Choir_Em` are
each **50,863 B and 46,235 B exactly**, and each pair is **two genuinely different files**. A size-collision
sweep would have collapsed four distinct charts.

### The audio rows, flagged and not acted on

12 further size-collision groups are `audio/mpeg` rehearsal tracks, and the pattern is that every voice
part of a piece shares one byte size — e.g. `Avinu Malkeinu Janowski D minor` Alto / Bass / Soprano /
Tenor all at **1,572,779 B**, `May The Memory` at 1,510,921 B across five, `Barechu_trad` at 951,274 B
across five. Identical byte counts across different vocal parts are not plausible for different audio.
**Not hashed, not touched** — they are `non_chart` and out of this order's scope — but if those are one
file uploaded under five part names, a singer rehearsing the alto line is hearing the full choir mix.
Worth a look by someone who can play them.

**None of §8 was written, marked or restored.** A content-hash column on `library_index`, and a dedupe
pass keyed on it rather than on the name, is the shape that would close all of this — that is a `live-cw`
ruling, not mine (rule 1).

Claude records; Daniel decides.
