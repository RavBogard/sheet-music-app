# RETURN → `live-cw`: REFUSALS-AND-PAIRS — two refusals made legible, and a packet a person can decide from

Lane: **live (Code)**, host-side `~/CentralReform.live` · Order: `HANDOFF-CODE-LIVE-REFUSALS-AND-PAIRS-2026-09-04.md`
Authority: **R-0904-live-cw-9 / -10 / -7**, **R-0903-live-cw-8 / -4**
Verified-against: `107b9618d9`, **re-verified BY CONTENT before the first edit** — `git rev-parse HEAD` == `/api/version`
sha == `107b9618d99b4b424c575e14966df05dc6f58cc1`, no tracked working-tree changes.
**Rollback, read off `/api/version` BEFORE the push: `107b9618d9`** (G7).
Production now serves **`057fbe61d3`** — deploy confirmed by `/api/version` before G3 and G5 were called.
Status: **COMPLETE.** All eight guards asserted. **Zero catalog writes**, measured as a delta at three points.

## The two commits, independently revertible

| sha | what |
|---|---|
| `943d5b1681` | **N1** — `fuzzy_execution_refused: 400` (+ `mark_refused_row_is_bonded: 409`) in `ERROR_CODE_MAP`, and the dedupe test now asserts the *code*, not just the slug. |
| `057fbe61d3` | **N2** — `mark_chart_status` refuses a bonded row and names the bonds; five new emulator tests; the tool's MCP description. |

**One asymmetry in the revert story, and it is the order's own doing.** N2 §2 says its 409 must be mapped
"in `errors.ts` in the same commit as N1", so both rows ride `943d5b1681`. Reverting **N2** alone is clean
(the map keeps one unused row — harmless). Reverting **N1** alone drops both rows, and N2's refusal then
presents as `500` while still refusing. The revert unit is therefore "the code map"; naming it here rather
than silently splitting the order's instruction.

## N1 — the refusal was never retryable, and now it does not claim to be

The throw is at `src/lib/mcp/tools/library.ts:1729` and the default was `errors.ts:147`
(`ERROR_CODE_MAP[machine_code] ?? 500`) — both as the order measured them. **Added `fuzzy_execution_refused: 400`**
in the 400 block, for the reason the file's `:56` comment already states: an LLM caller reads 500 as
*transient, retry*. A refused argument combination is not an authorization failure (no permission grants it)
and not a conflict. Behaviour, refusal text and `hint` are byte-unchanged.

**A second instance of the same defect, found by tripping over it.** `undo_dedupe_group`'s `run_not_found`
is **also unmapped** and came back as `code: 500` while I was asserting G6 — a "no such record" answer
presenting as a server fault, same class as N1, same one-row fix. Not touched here: out of this order's
scope, and reported rather than smuggled in. **FOR live-cw: `run_not_found: 404` is the next `src/` one-liner.**

## N2 — the unbonded half of `R-0903-live-cw-8`, enforced in the tool

`mark-chart-status.ts` read no bond count at any line; the order's grep was right. It reads one now and
refuses with `mark_refused_row_is_bonded` (**409** — the fileId is correct and the mark becomes legal once
the bonds move), and **the refusal names the bonds**: count, and each setlist's id, name, date, trackId and
track title.

**The line the count is actually read from — and it is not the one the order named.** The order pointed at
`library.ts:160 / :172 / :1261`; those are the *projection* (`CanonicalSortable.bondCount`, `rowView()`,
`DedupeRowView`), not a reachable count. The real computation is `library.ts:1765–1787`, and it builds the
map by fetching **the whole `tracks` and `setlists` collections** — correct for 785 rows in one sweep, wrong
for one row. So the count comes from **`findSetlistsReferencingChart`, `src/lib/mcp/tools/setlists.ts:264`**,
which applies the identical rule by the cheap route: one indexed equality query on `tracks.fileId`
(single-field auto-index, capped at 200) then a `getAll` of the distinct parents, keeping only those that
**exist and are in-tenant**. **Cost: one query plus one `getAll`.** Nothing was reconstructed.

Three placement decisions, each load-bearing:

1. **After** the honest-idempotence short-circuit. A no-op writes nothing, so there is nothing to refuse.
2. **Before** the `dryRun || !force` branch — so `force: true` cannot walk past the refusal, and a `dryRun`
   reports the refusal a real run would make rather than a plan it would never carry out.
3. **An unreadable bond count is refused too.** Read as "zero" it would hide a chart in use; that is the one
   failure direction that ends in a dead chart on a Friday.

`toStatus: "active"` is exempt — un-hiding a bonded row is a repair. A track whose parent setlist was
deleted is **not** a bond (the lane-c2 defect `delete_chart`'s guard had), and neither is a bond in another
tenant's setlist. Both are tests, not claims.

`tracks` and `setlists` joined the test file's `beforeEach` sweep for a reason worth keeping: **the moment a
tool starts READING a collection, that collection has to be in its fixtures' teardown**, or residue from a
sibling test file refuses a mark those tests expect to land.

## Guards

| | guard | result |
|---|---|---|
| **G1** | RH reads `184`/`feed` | **PASS**, both ends. `shirei-tshuvah` → `{tier: "feed", pages: 184}` before N1 and after N4. |
| **G2** | zero catalog writes | **PASS as a delta.** Full 892-row enumeration at three points — open, after G3, at close: **892 total; active 789 / duplicate 101 / archived 2**, identical at all three. Delta **0**. |
| **G3** | N1's refusal refuses, legibly | **PASS by calling it.** `dedupe_library {forceScore:0.85, force:true, dryRun:false}` → `fuzzy_execution_refused`, **`code: 400`** (was 500), same message and hint, partition identical across the probe, nothing written. |
| **G4** | the diagnostic is intact | **PASS, numbers unchanged.** `{forceScore:0.85, dryRun:true}` → **13 groups / 16 marks / `formatClassRefusals: 14`**, `coverage.total 892 / eligible 791`. |
| **G5** | N2's refusal proven by calling it | **PASS.** `mark_chart_status` at `25df4be7…` (`force: true`, real run) → refused, **`code: 409`**, `bondCount: 2`, both setlists named with ids, names, dates and trackIds. **Row re-read AFTER the call: `status: "active"`** — unchanged. Nothing written. |
| **G6** | Daniel's mark undisturbed | **PASS.** `1VuMq83…` still `duplicate` at open and close; `undo_dedupe_group` dry on run `human-mark-2026-09-04T03-00-29-972Z-1VuMq83_0W8y` returns `recordedRows: 1`, `fromStatus: "duplicate" → "active"`, `source: "run-record"`, `restored: 0`. **Half-reported honestly: `decidedBy: "human"` is not in `undo_dedupe_group`'s projection**, so from here I can prove the record exists and what it restores, not that field's value. |
| **G7** | rollback named before the push | **PASS.** `107b9618d9`, read off `/api/version`. |
| **G8** | the suite | **PASS.** Full emulator suite **1,152 passed / 0 failed, 83 files** (baseline 1,147; the +5 are N2's own), `tsc --noEmit` clean, `next build` exit 0 — all three **before** the push. |

**A truncated runId is a prefix too.** G6's first call used the desk file's `…-1VuMq83_0W8` and returned
`run_not_found`. The suffix is `fileId.slice(0, 12)` — twelve characters, `1VuMq83_0W8y`. Same lesson as
`R-0904-live-cw-10` §2, one layer down: it applies to **ids the system generates**, not only to ids an order
quotes.

## N3 — the seven-pair packet

**All fourteen ids resolved. No 404s, nothing skipped.** Every row was found in the in-tenant collection and
its bytes downloaded and parsed. Bond counts match the order's annotations exactly (9 · 3/2 · 2).
**No proposal about which side wins, and no mark on any of them — `R-0904-live-cw-9` §4.**

Two notes on the evidence itself, because they change how much weight the text column carries:

- **First-page text is thin on engraved charts by design.** These PDFs set notation in a music font whose
  glyphs live in the Unicode Private Use Area, so extraction returns the title, credits and lyric syllables
  and nothing about the notes. Where a row shows only its title, that is the extractor being honest, not an
  empty page. **The chord symbols and key signatures that DO come through are the useful signal.**
- **`25df4be7…` carries `uploadedAt: null`.** The canonical picker breaks its final tie on earliest
  `uploadedAt`; a null there is an input that sort has to have an answer for. Reported, not touched.

### Pair 1 — `Veshamru` / `V'Shamru`

| | keep-side (as the pass ranks it) | other side |
|---|---|---|
| fileId | `1Mqje155L1D2TpfeoLycAL_pxEs04epFw` | `1WusU1xlwOKQvKu2kemrowh6oZ16S9UeR` |
| name | `Veshamru` | `V'Shamru` |
| status | **active** | **active** |
| mimeType | application/pdf | application/pdf |
| bytes (row / downloaded) | 33,537 / 33,537 | 50,863 / 50,863 |
| pages | 1 | 1 |
| uploadedAt | 2025-05-03T19:20:24.000Z | 2024-10-10T02:21:58.000Z |
| **bondCount** | **9** | **0** |
| bonded setlists | `1e108f17-f24b-4bf0-a9f7-6a0392ccc43d` Shabbat Morning — Parashat Nitzavim-Vayeilech — September 5<br>`q1VvDawjEKWuv2QTIAYH` Shabbat Morning — Parashat Ki Tavo — August 29<br>`nLSC3CYRwV8ZgFqy8HTo` Shabbat Morning — Parashat Pinchas — July 4<br>`ncbvBvwFFxkqPey2HiuY` Shabbat Morning — Parashat Sh’lach — June 13<br>`QSlxlW635yzn0V9PQVR4` Shabbat Morning — Parashat Sh’lach — June 13<br>`cd2010f4-8bb0-4f54-ba2d-8a79d83729a6` B'nei Mitzvah of Gavin Stein — May 30<br>`zyJGXUdIG80fLHaifJ7o` Bnei Mitzvah Morning<br>`IvowaTdXwZI7qu9U9QXc` Shabbat Morning — Parashat Tazria-Metzora — April 18<br>`fgxquthWA9IQ4UF2fZWw` Shabbat Morning — April 11 | — |

**keep-side first-page text** (1Mqje155L1D2TpfeoLycAL_pxEs04epFw): Veshamru

**other side first-page text** (1WusU1xlwOKQvKu2kemrowh6oZ16S9UeR): V'shamru V' V' V'retz, fash,

### Pair 2 — `Ana B_Koach` / `Ana B'koach`

| | keep-side (as the pass ranks it) | other side |
|---|---|---|
| fileId | `1OUhfx4EW3ZAtuh-ZPnHxTF4-wGOJdBFy` | `1YuN6XyS2oLDWE-6F7JztRAtBz7K_lTBL` |
| name | `Ana B_Koach` | `Ana B'koach` |
| status | **active** | **active** |
| mimeType | application/pdf | application/pdf |
| bytes (row / downloaded) | 49,486 / 49,486 | 47,353 / 47,353 |
| pages | 1 | 1 |
| uploadedAt | 2025-11-14T18:10:38.000Z | 2026-04-24T02:08:31.085Z |
| **bondCount** | **0** | **0** |
| bonded setlists | — | — |

**keep-side first-page text** (1OUhfx4EW3ZAtuh-ZPnHxTF4-wGOJdBFy): Joey Weisenberg Mozi's Nigun / Ana B'Koach

**other side first-page text** (1YuN6XyS2oLDWE-6F7JztRAtBz7K_lTBL): tra. Nathan Rauscher 2025 Oct 21 Ana B'koach 22 18 14 5 27 10 31

### Pair 3 — `Shalom alechem (Goldfarb)` / `Shalom Aleichem (Goldfarb)`

| | keep-side (as the pass ranks it) | other side |
|---|---|---|
| fileId | `1W3mVu5MmsLklXhhh6WpQe5KrCr71Z6iJ` | `25df4be7-0a5d-4a8d-bf7b-64d2d03f67e5` |
| name | `Shalom alechem (Goldfarb)` | `Shalom Aleichem (Goldfarb)` |
| status | **active** | **active** |
| mimeType | application/pdf | application/pdf |
| bytes (row / downloaded) | 30,596 / 30,596 | 359,056 / 359,056 |
| pages | 1 | 1 |
| uploadedAt | 2025-10-10T02:15:34.888Z | None |
| **bondCount** | **3** | **2** |
| bonded setlists | `BeWLvkBJCuquieRDIYrg` Friday Night — Parashat Re’eh — June 26<br>`QQSsAK2XY4dc8k5sFXIa` Confirmation Shabbat<br>`FB2yEICglR8jQmG3pcnp` Passover — April 3 | `fc3164fd-e8e5-45b0-8633-34ea2d39ac81` Shir Shabbat — Full Repertoire Packet (Jeff Lash)<br>`993bd6bc-f814-4eb6-92a8-a7e66d8a4162` Shir Shabbat — Crown Center — August 7 |

**keep-side first-page text** (1W3mVu5MmsLklXhhh6WpQe5KrCr71Z6iJ): Shalom alechem Barhu. hu. ba ba ruch ruch do

**other side first-page text** (25df4be7-0a5d-4a8d-bf7b-64d2d03f67e5): 1 copies licensed. Authorized for use by: Daniel Bogard

### Pair 4 — `Hod VeHadar (Daphna Rosenberg)` / `Hod V'Hadar (Daphna Rosenberg)`

| | keep-side (as the pass ranks it) | other side |
|---|---|---|
| fileId | `upload-49a7db3a-21aa-4c6c-8f1e-b3d6bd02cad1` | `upload-9539ae5d-c185-41a8-b852-b82319f2d944` |
| name | `Hod VeHadar (Daphna Rosenberg)` | `Hod V'Hadar (Daphna Rosenberg)` |
| status | **active** | **active** |
| mimeType | application/pdf | application/pdf |
| bytes (row / downloaded) | 30,913 / 30,913 | 241,662 / 241,662 |
| pages | 1 | 1 |
| uploadedAt | 2026-08-18T16:26:28.701Z | 2026-08-18T16:26:30.515Z |
| **bondCount** | **0** | **0** |
| bonded setlists | — | — |

**keep-side first-page text** (upload-49a7db3a-21aa-4c6c-8f1e-b3d6bd02cad1): & bb 8 6 ˙ œ œ G m Hod ve ha .˙ C m7 dar ˙ œ D 7 le fa .˙ G m nav ˙ œ œ Eb± oz ve tif j œ .œ œ Ab± 'e ret be ˙# œ D 7 mik da- - - - - - - - - - & bb 7 ˙ Œ G m sho ˙ œ œ G m hod ve ha œ ˙ C m7 dar ˙ œ

**other side first-page text** (upload-9539ae5d-c185-41a8-b852-b82319f2d944): הוֹד וְהָדָר תהילים צ"ו,ו,לחן:דפנה רוזנברג (גשר3) Em B7 Fmaj7 Cmaj7 Em B7 Am7 Em //////// הוֹדוְהָדָרלְפָנָיועֹזוְתִפְאֶרֶתֹבְמִקְדָׁשו/X2 Em B7 Fmaj7 Cmaj7 Em B7 Am7 Em //////// הוֹדוְהָדָרלְפָנָיועֹ

### Pair 5 — `Shiviti (Rosenberg)` / `Shivti (Rosenberg)`

| | keep-side (as the pass ranks it) | other side |
|---|---|---|
| fileId | `upload-5c020858-3c15-4aaa-a3b6-d2273e5d9893` | `upload-e3f9ef79-e77e-4746-9968-412fb08a0002` |
| name | `Shiviti (Rosenberg)` | `Shivti (Rosenberg)` |
| status | **active** | **active** |
| mimeType | application/pdf | application/pdf |
| bytes (row / downloaded) | 256,454 / 256,454 | 23,413 / 23,413 |
| pages | 1 | 2 |
| uploadedAt | 2026-08-18T16:28:39.469Z | 2026-08-18T16:28:41.308Z |
| **bondCount** | **0** | **0** |
| bonded setlists | — | — |

**keep-side first-page text** (upload-5c020858-3c15-4aaa-a3b6-d2273e5d9893): Shiviti Daphna RosenbergPsalm 16:8 Shi Capo 2: Em F m vi D C ti G A Ha va D E ya- - - - - - - 6 Em F m Le neg C D di ta G A mid 1. D E Shi 2. D E Ha va- - - - - - 11 Em F m ya Ha va C D ya Ha va G A y

**other side first-page text** (upload-e3f9ef79-e77e-4746-9968-412fb08a0002): & ### 43 .. 1 .˙ Shiv A7+ .˙ œ œ œ ti D7+ .˙ œn ˙ Shiv A7+ œ œ œ .˙ ti D 7+ - - - & ###8 œ Œ œ b' œn ˙ veit B dim œ ˙ Ha .˙Shem E 7 ˙ œb' œ ˙ veit B dim ˙ œ Ha- - - - - - & ###15 œn œ œShem E 7 .˙ .˙n

### Pair 6 — `Michamocha (Shir Shabbat) ` / `Michamocha (Shir Shabbat)`

| | keep-side (as the pass ranks it) | other side |
|---|---|---|
| fileId | `17YFbGz0YNvC1o-K1VKRrqgZGae-WMsbg` | `10i20SEfzKTvGJ5tqWfPScip78eXszCHH` |
| name | `Michamocha (Shir Shabbat) ` | `Michamocha (Shir Shabbat)` |
| status | **active** | **active** |
| mimeType | audio/mpeg | audio/mpeg |
| bytes (row / downloaded) | 6,603,881 / 6,603,881 | 3,251,012 / 3,251,012 |
| pages | — (audio) | — (audio) |
| uploadedAt | 2026-04-24T01:58:42.000Z | 2026-04-24T02:06:43.000Z |
| **bondCount** | **0** | **0** |
| bonded setlists | — | — |

**keep-side audio** (17YFbGz0YNvC1o-K1VKRrqgZGae-WMsbg): bitrateKbps=192, sampleRateHz=44100, vbrHeader=False, approxSeconds=275. CBR read off the first frame; duration = audio bytes / bitrate, approximate.

**other side audio** (10i20SEfzKTvGJ5tqWfPScip78eXszCHH): bitrateKbps=192, sampleRateHz=44100, vbrHeader=False, approxSeconds=135. CBR read off the first frame; duration = audio bytes / bitrate, approximate.

### Pair 7 — `Lecha dodi (Lincoln_s niggun)` / `Lecha Dodi Lincoln_s Nigun`

| | keep-side (as the pass ranks it) | other side |
|---|---|---|
| fileId | `1YkIEE4lx2Vp3U2nQA2M8nIKCBgFoylhf` | `1CKCIpT3q8q4257D2i6klXsRl8GFWpJee` |
| name | `Lecha dodi (Lincoln_s niggun)` | `Lecha Dodi Lincoln_s Nigun` |
| status | **active** | **archived** |
| mimeType | application/pdf | application/pdf |
| bytes (row / downloaded) | 37,960 / 37,960 | 48,268 / 48,268 |
| pages | 1 | 1 |
| uploadedAt | 2025-05-06T17:53:14.000Z | 2025-12-07T17:41:22.000Z |
| **bondCount** | **0** | **2** |
| bonded setlists | — | `fc3164fd-e8e5-45b0-8633-34ea2d39ac81` Shir Shabbat — Full Repertoire Packet (Jeff Lash)<br>`993bd6bc-f814-4eb6-92a8-a7e66d8a4162` Shir Shabbat — Crown Center — August 7 |

**keep-side first-page text** (1YkIEE4lx2Vp3U2nQA2M8nIKCBgFoylhf): Lecha dodi (Lincoln's niggun)

**other side first-page text** (1CKCIpT3q8q4257D2i6klXsRl8GFWpJee): Lincoln's Nigun (Yamin U'smol/Lecha Dodi) Joey Weisenberg

### What the fourteen rows say, one paragraph each

- **Pair 1 · Veshamru.** Both `active`, both one page, **33,537 B vs 50,863 B** — not the same bytes. The
  keep-side is bonded **9 times**, including `Shabbat Morning — Parashat Nitzavim-Vayeilech — September 5`,
  which is **tomorrow**. The other side is bonded 0 times.
- **Pair 2 · Ana B'Koach. These are two different arrangements by two different people.** The keep-side's
  first page reads *"Joey Weisenberg — Mozi's Nigun / Ana B'Koach"*; the other reads *"tra. Nathan Rauscher
  2025 Oct 21"*. Neither is bonded. A name-similarity pass cannot see an arranger credit.
- **Pair 3 · Shalom Aleichem (Goldfarb).** **Both sides are bonded** — 3 and 2 — so hiding either loses a
  bonded row. And the other side is **a licensed purchase**: its first page reads *"1 copies licensed.
  Authorized for use by: Daniel Bogard"*, at **359,056 B against 30,596 B**. This is the pair G5 was proven
  at, and N2 now refuses that mark outright.
- **Pair 4 · Hod VeHadar.** **Different key and different language.** The keep-side is a transliterated lead
  sheet in G minor (`Gm / Cm7 / D7 / E♭`); the other is the pointed-Hebrew chart in E minor
  (`Em B7 Fmaj7 Cmaj7`), 241,662 B. Not one chart in two files.
- **Pair 5 · Shiviti / Shivti.** **Different keys and different page counts.** Keep-side: one page, *"Capo
  2"*, E minor / F♯m, credited *Daphna Rosenberg, Psalm 16:8*. Other side: **two pages**, D / A7+ in 3/4.
- **Pair 6 · Michamocha (Shir Shabbat), the two `.mp3` rows.** No pages. Both **192 kbps CBR, 44.1 kHz**, and
  the durations are **≈275 s vs ≈135 s** — one is roughly twice the other. Read free off the first MPEG-1
  Layer III frame with no Xing/VBRI header present (so the frame bitrate is the file's, and duration = audio
  bytes / bitrate, approximate to a frame). **Had either carried a VBR header, duration would NOT have been
  free and this line would say so instead of guessing.**
- **Pair 7 · Lecha Dodi (Lincoln's niggun). The archived side is the one in use.** `1CKCIpT3…` is
  **`archived` with 2 bonds**; the `active` keep-side has **0**. Their first pages name different things:
  *"Lecha dodi (Lincoln's niggun)"* against *"Lincoln's Nigun (Yamin U'smol / Lecha Dodi) — Joey
  Weisenberg"*.


## N4 — every bond whose target row is not `active`, and what Perform mode does with one

**Scanned all 103 non-active rows** (101 `duplicate` + 2 `archived`) — the whole population, not a sample —
querying **both** `fileId` and `songId` and unioning by `trackId`, so a bond cannot hide in the key the scan
did not ask about. **0 query errors.**

**16 non-active rows carry 58 live bonds between them.**

| row | name | status | mime | bonds | bonded setlists |
|---|---|---|---|---|---|
| `19FuqP-rbkufIUdAVCGMbXLuvDJKnicZM` | `Mi shebeirach` | **duplicate** | application/pdf | **22** | `1e108f17-f24b-4bf0-a9f7-6a0392ccc43d` Shabbat Morning — Parashat Nitzavim-Vayeilech — September 5<br>`q1VvDawjEKWuv2QTIAYH` Shabbat Morning — Parashat Ki Tavo — August 29<br>`34ec7994-97a6-4986-a75b-d76de3cce60d` Noa & Ezra Bogard B'nai Mitzvah — August 22<br>`296022d0-520e-425a-8076-fcdcd10dd46a` Max bar Mitzvah<br>`D7fsXnxhmS9U0QC7UNnG` Shabbat Morning — Parashat Eikev — August 1<br>`05da256d-9b1f-4536-9cc2-84b7d2a61ecb` Camp Sabra — Shabbat Morning (Parashat Va'etchanan) — July 25<br>`SKMB2RleNj2jJ5vfWhDq` Shabbat Morning — Parashat Matot-Masei — July 11<br>`wRpdr8a4EuXMPiiJXocu` Rabbi Randy Tunes for Zach<br>`nLSC3CYRwV8ZgFqy8HTo` Shabbat Morning — Parashat Pinchas — July 4<br>`S7RaXpuSR6L0MmrrJEDY` Ray Slavin's 3rd Bar Mitzvah— Parashat Chukat-Balak — June 27<br>`ncbvBvwFFxkqPey2HiuY` Shabbat Morning — Parashat Sh’lach — June 13<br>`QSlxlW635yzn0V9PQVR4` Shabbat Morning — Parashat Sh’lach — June 13<br>`A4Ioe6v8KbC39OoydpKs` Shabbat Morning / Maxine Weil Retirement Celebration — Parashat Beha’alotcha — June 6<br>`cd2010f4-8bb0-4f54-ba2d-8a79d83729a6` B'nei Mitzvah of Gavin Stein — May 30<br>`UnjLqKTtS4lNKQfMY6hB` Shavuot Yizkor — May 23<br>`226309e2-78b7-48af-aa21-6aaf606b4fbe` Kabbalat Shabbat — May 22, 2026<br>`zyJGXUdIG80fLHaifJ7o` Bnei Mitzvah Morning<br>`uBkulVkN8K7idSapCJjq` Shabbat Morning — Parashat Achrei Mot-Kedoshim — April 25<br>`tIJ5DlvkeeN1CWAUTUM2` Seui<br>`IvowaTdXwZI7qu9U9QXc` Shabbat Morning — Parashat Tazria-Metzora — April 18<br>`fgxquthWA9IQ4UF2fZWw` Shabbat Morning — April 11<br>`9bmwUMJzgIQgNRIe81jv` Shabbat Morning — April 4 |
| `19XVik7nlDmoUr8CcBJbjDsecLuqInQ_Z` | `Shema (major)` | **duplicate** | application/pdf | **6** | `fc3164fd-e8e5-45b0-8633-34ea2d39ac81` Shir Shabbat — Full Repertoire Packet (Jeff Lash)<br>`759ed243-428b-4a0f-9850-11a42af679a9` Shir Shabbat — Core Repertoire (Community Orchestra packet)<br>`BeWLvkBJCuquieRDIYrg` Friday Night — Parashat Re’eh — June 26<br>`a84f8cce-176e-4b5e-9653-4df71db6f5ba` Shir Shabbat — Juneteenth — June 19<br>`NWPBba50fltX6pNcyOVK` 5/15 -- Shir Shabbat<br>`Ikl0sS4XcZil0Z04viAu` Shir Shabbat —  — May 13 |
| `1AIwCXDw1mGHm_uhaoJfbpkri-ibzOLI4` | `Shiru L_Adonai Shir Shabbat` | **duplicate** | application/pdf | **6** | `fc3164fd-e8e5-45b0-8633-34ea2d39ac81` Shir Shabbat — Full Repertoire Packet (Jeff Lash)<br>`993bd6bc-f814-4eb6-92a8-a7e66d8a4162` Shir Shabbat — Crown Center — August 7<br>`759ed243-428b-4a0f-9850-11a42af679a9` Shir Shabbat — Core Repertoire (Community Orchestra packet)<br>`BeWLvkBJCuquieRDIYrg` Friday Night — Parashat Re’eh — June 26<br>`a84f8cce-176e-4b5e-9653-4df71db6f5ba` Shir Shabbat — Juneteenth — June 19<br>`NWPBba50fltX6pNcyOVK` 5/15 -- Shir Shabbat |
| `1PYUlbQY0hweTHW2Qrc7Xn3_9vlHaUtee` | `Bminor_simpletune` | **duplicate** | application/pdf | **4** | `05da256d-9b1f-4536-9cc2-84b7d2a61ecb` Camp Sabra — Shabbat Morning (Parashat Va'etchanan) — July 25<br>`nLSC3CYRwV8ZgFqy8HTo` Shabbat Morning — Parashat Pinchas — July 4<br>`tIJ5DlvkeeN1CWAUTUM2` Seui<br>`9bmwUMJzgIQgNRIe81jv` Shabbat Morning — April 4 |
| `upload-11a3e3a1-a0ac-4a12-8bc7-f33c7aa30716` | `Dodi Li` | **duplicate** | application/pdf | **3** | `fc3164fd-e8e5-45b0-8633-34ea2d39ac81` Shir Shabbat — Full Repertoire Packet (Jeff Lash)<br>`759ed243-428b-4a0f-9850-11a42af679a9` Shir Shabbat — Core Repertoire (Community Orchestra packet)<br>`NWPBba50fltX6pNcyOVK` 5/15 -- Shir Shabbat |
| `1SH9vxGsFfIJ4mU_FaAaIX13hThwuqfH5` | `Shalom Alechem Shir Shabbat` | **duplicate** | application/pdf | **3** | `fc3164fd-e8e5-45b0-8633-34ea2d39ac81` Shir Shabbat — Full Repertoire Packet (Jeff Lash)<br>`759ed243-428b-4a0f-9850-11a42af679a9` Shir Shabbat — Core Repertoire (Community Orchestra packet)<br>`NWPBba50fltX6pNcyOVK` 5/15 -- Shir Shabbat |
| `upload-7fb95fac-c0cf-4cb1-91a3-6e5828c212b8` | `Bina in G` | **duplicate** | application/pdf | **2** | `fc3164fd-e8e5-45b0-8633-34ea2d39ac81` Shir Shabbat — Full Repertoire Packet (Jeff Lash)<br>`NWPBba50fltX6pNcyOVK` 5/15 -- Shir Shabbat |
| `1w6SuGzU6pTpzMk-hGdfsq6dDEJSxivoH` | `C-Saw Niggun Score` | **duplicate** | application/pdf | **2** | `fc3164fd-e8e5-45b0-8633-34ea2d39ac81` Shir Shabbat — Full Repertoire Packet (Jeff Lash)<br>`NWPBba50fltX6pNcyOVK` 5/15 -- Shir Shabbat |
| `1TeiP5BlGnlP9ogYXO9yFL25J1Tz5k_RX` | `dodi li (sher)` | **duplicate** | image/png | **2** | `fc3164fd-e8e5-45b0-8633-34ea2d39ac81` Shir Shabbat — Full Repertoire Packet (Jeff Lash)<br>`Ikl0sS4XcZil0Z04viAu` Shir Shabbat —  — May 13 |
| `1CKCIpT3q8q4257D2i6klXsRl8GFWpJee` | `Lecha Dodi Lincoln_s Nigun` | **archived** | application/pdf | **2** | `fc3164fd-e8e5-45b0-8633-34ea2d39ac81` Shir Shabbat — Full Repertoire Packet (Jeff Lash)<br>`993bd6bc-f814-4eb6-92a8-a7e66d8a4162` Shir Shabbat — Crown Center — August 7 |
| `upload-4c33f063-4039-4620-9ed8-36088fe464d1` | `Hashkivenu (Randy) (1)` | **duplicate** | application/pdf | **1** | `c5d41b02-4888-41b7-a0e7-161250be9665` Bar Mitzvah — Chase — May 16 (4pm Havdallah) |
| `1h2-nbJYTO7fVioa6uFwUwpyzH1d1bVce` | `Mi chamocha (Moshav) morning` | **duplicate** | application/pdf | **1** | `D7fsXnxhmS9U0QC7UNnG` Shabbat Morning — Parashat Eikev — August 1 |
| `upload-ece4da1e-9488-4f7d-86a5-a1e6f7cc7709` | `Niggun - Full Score` | **duplicate** | application/pdf | **1** | `c5d41b02-4888-41b7-a0e7-161250be9665` Bar Mitzvah — Chase — May 16 (4pm Havdallah) |
| `upload-0e1c11d4-a798-4cfa-82b6-18e6547f897f` | `Nigun # 5` | **duplicate** | application/pdf | **1** | `A4Ioe6v8KbC39OoydpKs` Shabbat Morning / Maxine Weil Retirement Celebration — Parashat Beha’alotcha — June 6 |
| `upload-d25724b8-5799-4e07-8ff1-1908d0fa6ca8` | `T'filah Adonai s'fatai - Full Score` | **duplicate** | application/pdf | **1** | `wRpdr8a4EuXMPiiJXocu` Rabbi Randy Tunes for Zach |
| `upload-a22cfc06-b187-4464-95fa-b81264af6374` | `V'Shamru (Old Skool)` | **duplicate** | application/pdf | **1** | `c5d41b02-4888-41b7-a0e7-161250be9665` Bar Mitzvah — Chase — May 16 (4pm Havdallah) |

### What Perform mode does with such a bond — from the code, then measured

**It renders it. Normally. The band does not get a dead chart.**

- `/perform/setlist/[id]/page.tsx` hands `fetchInitialFrame(id)` straight to `SetlistPerformClient`;
  **`initial-frame.ts` contains no reference to `library_index` and no reference to `status`** — there is no
  join to hide behind.
- `PDFOverlay.tsx:251` builds the byte URL as `/api/drive/file/${track.fileId}` — **keyed on the track's
  fileId, nothing else.**
- `src/app/api/drive/file/[fileId]/route.ts` resolves through `fetchFileById`
  (**`src/lib/file-fetcher.ts:46`**), which reads **Firebase Storage, then Drive for Drive-shaped ids, by id
  only**. Neither the route nor the fetcher reads a row status at any line.
- **Measured, not inferred.** `GET /api/drive/file/1CKCIpT3…` (the `archived`, 2-bond row) → **200,
  `application/pdf`, 48,268 B**. `GET /api/drive/file/19FuqP…` (the `duplicate` row with **22** bonds) →
  **200, `application/pdf`, 35,646 B**.

**So `status` is a BROWSE-VISIBILITY flag, not a byte gate, and that cuts both ways.** The good half: no
Friday is at risk from these 16 rows, and the sweep's marks have never broken a bonded chart. The sharp
half: **hiding a row does nothing to the bonds pointing at it, and the row then cannot be found in the
picker.** A musician looking at `Mi shebeirach` on 22 setlists sees the chart; anyone trying to re-bind,
verify or replace it cannot find the row it comes from. That is the state to have a view about — and it is a
view, so it is Daniel's. **No repair here, as ordered.**

## FOR `live-cw`

1. **`run_not_found` is unmapped and presents as `code: 500`** — N1's exact defect, one row away
   (`run_not_found: 404`). Found by tripping over it in G6.
2. **N2 §3's cited lines are the projection, not the count.** `library.ts:160 / :172 / :1261` are type and
   view declarations; the computation is `:1765–1787` and it is a two-collection scan. I used
   `setlists.ts:264` instead and said why. Fourth guard-or-order whose letter names a mechanism the code
   implements elsewhere — reported, not bent.
3. **The revert asymmetry above**, from N2 §2's "same commit as N1" instruction.
4. **Sixteen non-active rows are bonded, one of them 22 times, and nothing in the render path cares.**
   Unowned. A ruling on whether a bonded row may be hidden at all — or whether the sweep should refuse the
   whole group, as N2 now refuses the row — would settle it.
5. **`25df4be7…` has `uploadedAt: null`** and the canonical picker's last tie-break is earliest `uploadedAt`.

## The CI run is RED, and it is not mine — stated with the evidence

Action `33874093445` on `057fbe61d3` reports **failure**. G8 named the emulator suite and `tsc`, and both were
green before the push; the red is the **unit** suite, and it is the standing 19 failures across 7 files.

**Proved by comparison, not by assertion.** The run on `107b9618d9` — the commit BEFORE this order, the one
production had served since 02:59Z — reports the identical shape: **7 failed / 339 passed / 9 skipped (355)**,
and the same seven files, name for name:

`perform-cls.test.tsx` · `public-view.test.tsx` · `sync-engine-songs-mirror.test.ts` ·
`books/__tests__/lookup.test.ts` · `books/__tests__/registry.test.ts` · `mcp/tools/__tests__/books.test.ts` ·
`mcp/tools/__tests__/library.test.ts`

Not one of them imports `errors.ts`'s new rows, `mark-chart-status.ts`, or `setlists.ts`. **Reported, not
adopted, not fixed** — fixing seven unrelated files under a two-refusal order is how a LIGHT order stops
being revertible. The ESLint `react-hooks/purity` warning at `:129` is likewise pre-existing.

## What was NOT touched

The 38 unreachable-byte rows. `get_chart_status`'s byte-reachability oracle (unchanged, unwidened).
`moments.json` / L3 binding. **No mark on any of the seven pairs, by anyone, from here.**

*Claude records; Daniel decides.*
