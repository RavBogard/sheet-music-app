# RETURN → live-cw: I hid a chart, restored it, and fixed the cause

Lane: **live (Code)**, host-side · **Self-reported. No order — this wave is my own error and its repair.**
Authority: Daniel, in session 2026-09-02T15:5xZ–16:0xZ (authorized the dedupe run, then the restore
and the fix). R-0901-live-cw-2 §5 · R-0901-live-cw-4 §6.
Shipped **`9933d2abef`**. Data restored by direct Firestore write, approved by Daniel at 16:00Z.

---

## What happened

Daniel asked which gates would open this lane. I brought him three; one was the last unmarked dedupe
group. I showed him the plan as **two rows named "Three Little Birds", 2026-06-18 and 2026-06-20**.
He authorized it. It ran, `committed: 1`.

**The two rows were not duplicates.** They are:

| row | mime | size | uploaded | curated |
|---|---|---|---|---|
| `upload-8076119a` | `text/plain` | 763 B | 06-18 | pending |
| `upload-5253e0ba` | **`application/pdf`** | **44,377 B** | 06-20 | **`human_curated`**, renamed 2026-09-02T01:19Z, uploaded by David |

The sweep kept the 763-byte text chart and marked the **44 KB PDF** `duplicate` — removing it from the
library browse, from `search_library`, and from Perform. Restored at 16:00Z and 16:01Z.

**`BATCH-L3-ARRANGEMENTS-2026-09-02.md`, at my own root, had already read this exact pair** and
recorded: *"the PDF and the text chart. The rename collision `live` predicted; not a duplicate."*
I read that file fifteen minutes after running the sweep.

## The two failures, separately, because they have different fixes

**1 · The evidence I presented was incomplete.** I gave Daniel names and dates. The two fields that
decide whether a pair is a duplicate — **mime type and size** — were in the row and not in what I
showed him. He authorized what I put in front of him and what I put in front of him was not enough
to decide on. That is not a tooling defect and no code change addresses it.

**2 · The picker could not have saved it.** The canonical sort demotes Google-Apps mime so a real PDF
beats a Google-Doc. `text/plain` is not Google-Apps, so the group fell through to earliest
`uploadedAt`, and the text chart was two days older.

## The fix, and why it is not the one first proposed

The obvious fix is another rank: chart format outranks `text/plain`. **I did not ship that, and the
reason is the point:** ranking only decides *which* row disappears. Both renderings are legitimate —
a PDF to read on the iPad and a scraped chord chart — so any tiebreak still hides one of them.

**The grouping key was wrong, so the key is what changed.** `chartFormatClass()` puts a row in `score`
(PDF, MusicXML, XML, images, unknown), `text` (`text/plain`), or `gapps`. The dedupe key carries it,
so cross-format pairs never form a group. The same guard is applied to the `forceScore` similarity
pass, where a fuzzy match is a weaker signal and crossing formats would be strictly worse.

A row with **no** mimeType classes as `score`, deliberately: unknown is not text, and classing it
elsewhere would quietly remove it from dedupe's reach.

**This is explicitly not** the case the picker's own doc names — *"if those slip through, the upstream
skip is the bug to fix, not the picker tiebreak."* Nothing slipped past `archive_nonchart_artifacts`.
Both rows are charts that belong in the library. That comment now says so.

## Proof, not promise (R-0831-guards-2)

**The live before/after.** With both rows restored to `active` and the OLD code still deployed, the
pair regrouped — the PDF was one run away from being hidden again. The deploy is visible in the poll:

```
16:17:41Z  groupsFound=1     <- old code: the pair still groups
16:18:08Z  groupsFound=1
   … 16:18:34Z, 16:19:00Z, 16:19:27Z, 16:19:53Z, 16:20:19Z all = 1
16:20:49Z  groupsFound=0     <- fix live: cross-format pair no longer groups
```

**Data restored, verified on the live surface:**

```
search_library "Three Little Birds" -> 3 rows, all status active
  upload-8076119a  Three Little Birds      active  key A
  upload-b65fc2c5  Three Little Birds (F)  active  key F
  upload-5253e0ba  Three Little Birds      active          <- the PDF, back
```

**Tests.** 3 unit cases over `chartFormatClass` (`library.test.ts`, **20/20 passing locally**) and two
emulator cases: the production pair must not group **and both rows must stay visible** — the assertion
that would have caught this is not "the right row won" but "no row was hidden" — plus two same-format
uploads must still group with earliest-uploadedAt winning, so the guard cannot silently disable dedupe.

**Gates.** `npx tsc --noEmit` **0** · `SKIP_ENV_VALIDATION=1 npx next build --webpack` **0** ·
`git status --porcelain src/data/books/` **0 lines** · push `817870bb3a..9933d2abef`.

**Rosh Hashanah (R-0901-vision-8 §1), re-asserted after this deploy — quoted, not ticked:**

```
crc-friday        pagemap  48
crc-saturday      pagemap  102
shabbat-maariv    feed      69
shabbat-shacharit feed     144
shirei-tshuvah    feed     184   ✓
```

## For live-cw

1. **The restore used a direct Firestore write.** No MCP tool un-marks a `duplicate` — the sweep is
   one-way by design, and `edit_library_entry` does not expose `status`. That is a real gap: dedupe can
   hide a row and nothing in the tool surface can bring it back. Worth an `undo_dedupe_group` before the
   next sweep, not after.
2. **Two byte-identical pairs remain**, from the same worksheet: `B-minor Simple Tune`/`Bminor_simpletune`
   and `G-minor Spirits`/`gminor_spirits` — the normalizer folds separators inside a word but not a
   leading `B-`/`B` split. Those ARE duplicates. Not ordered here (R-0901-live-cw-4 §6).
3. **The `Three Little Birds` family is now 3 visible rows** — text A, text F, PDF. Whether the two text
   rows are one arrangement in two keys is a worksheet question, not a dedupe one.
4. **The connected MCP client authenticates as `musician`**, not admin; admin tools 403 from it and need
   the supervisor bearer. Any order assuming otherwise stalls.

**No ruling id spent.** Claude records; Daniel decides.
