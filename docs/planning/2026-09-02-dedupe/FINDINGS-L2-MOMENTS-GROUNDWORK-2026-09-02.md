# FINDINGS → `L2` groundwork: what the feeds actually say

Lane: **live-cw (Opus Cowork)** · Authority: R-0901-vision-8 §2 · R-0831-live-pagemap-1 · rule 5
Status: **research, not a ruling.** Two findings, both measured, neither settled.
[measured: `~/shireishabbat/dist/`, `dist-app/`, `build/schema/feed.schema.json`, and
`sheet-music-app/scripts/sync-books.mjs` + `src/data/books/*.json` on the mount, 2026-09-02T02:0xZ]

Written before drafting the `moments.json` spec, because `L2` inherits both.

---

## A. `sync-books.mjs` reads the UNPINNED build directory, and would reinstate the dead page space

`scripts/sync-books.mjs` resolves its input as `join(repo, "dist")`. The app carrier is
`dist-app/`. They are different builds:

| source | machzor `printing.gitSha` | units it would write | `pages` it would write |
|---|---|---|---|
| `dist/` | `8ab7be6` | **130** | **248** |
| `dist-app/` | `21417d9-LICENSED` | **122** | **182** |
| what the satellite carries today | — | 122 | 184 |

`21417d9` is the press commit the satellite-deploy lane pinned to; the satellite's current
`shirei-tshuvah.json` matches `dist-app/` and not `dist/`. The 19 ids in `dist/` absent from
`dist-app/`, and the 11 the other way, are exactly the "dropped 19 units and added 11" that return
described.

**So `npm run sync:books`, run today by anyone, would rewrite the machzor from an unpinned build
and put the 248 page space back** — the space two deploy cycles were spent removing, ten days
before Rosh Hashanah. Nothing has run it; this is a loaded instrument, not damage.

**The script's only guard is `schemaVersion === 1`, which both builds satisfy.** There is no pin
assertion anywhere in the producer→consumer path. The pin lives in a deploy checklist and in what
people remember — which is precisely the shape R-0831-live-pagemap-1 and rule 5 exist to forbid: a
derived artifact crossing a repo line with a stated pinning rule and **no guard that can fail.**

**Immediate mitigation, costing nothing: do not run `npm run sync:books` until it is pinned.**
The fix belongs in the same wave as `L2`'s consumer change, since that wave edits this file anyway:
read `dist-app/`, assert `printing.gitSha` against a pin recorded in the repo, and fail loudly on
mismatch. **Queued, not ordered — `live` is executing the search-join order and this desk does not
stack two.**

## B. A "moment" cannot be the section-and-unit half of the id, because the section is service position

R-0901-vision-8 §2 defines a moment as *"the book-independent half of an AR-3 id
(`shma.mi-chamocha`)"*. Measured across the four feed books in `dist-app/`:

- **252** distinct `section.unit` pairs
- **188** distinct unit stems
- **43** stems appear under more than one section

The splits are not noise, they are the liturgy:

| stem | sections it appears under |
|---|---|
| `aleinu` | `concluding` · `econcluding` · `mincha` |
| `mi-chamocha` | `shma` · `emaariv` |
| `avinu-malkeinu` | `amidah` · `mincha` |
| `birkat-kohanim` | `amidah` · `concluding` · `econcluding` · `mincha` |
| `chatzi-kaddish` | `emaariv` · `mincha` · `psukei` · `shma` |

The machzor carries `shma.mi-chamocha` **and** `emaariv.mi-chamocha` — the same prayer, evening and
morning, inside one book. **The section prefix encodes service position, not prayer identity.**

**Consequence, stated plainly because it is the whole point of the program:** keyed on
`section.unit`, "every chart for Mi Chamocha" would split across two moments in a single book —
the fragmentation this program exists to end, faithfully reproduced one layer up. Daniel's framing
was *"all Mi Chamocha charts can play nicely and speak to the various siddurs."*

**The shape this desk will propose:** the moment is the **stem** (`mi-chamocha`); the section
becomes an attribute of each occurrence, `{book, section, unitId, folios}`. Service position is
preserved where `L4` needs it — a setlist's book plus its service still resolves to one printed
page — without fragmenting identity. This does not change the AR-3 id, which stays the unit's
address; it changes only what `moments.json` keys on.

**Two more things the moment list must carry, from the same reading:**

1. **A kind.** `shma.mi-chamocha-kavannah`, `shma.kriyat-shma-teaching` and
   `shma.vahavta-interpretation` are units like any other. A chart must never bind to a kavannah,
   so the list marks which moments are sung text and which are kavannah / teaching /
   interpretation / reflection. That taxonomy already exists in the family — the webapp lane
   measured 18 note units of 96 in the legacy book across exactly those four categories.
2. **Aliases from day one.** `L0` measured the library's transliteration split
   (`Lecha Dodi` / `L'cha Dodi` / `L'Chah Dodi` across three stems, one prayer). The feeds spell
   it `lcha-dodi`. The alias list is what makes the AI proposal pass in `L3` able to reach a chart
   whose title the corpus has never seen.

**This is a vision-level correction to §2's wording and this desk does not make it (rule 9).**
`FOR COWORK (vision):` §2's definition of a moment reads as `section.unit`; the corpus says the
key must be the stem, with section as occurrence context. The ruling's intent is untouched — one
identity per prayer, produced by shireishabbat — and this is how it gets one.

Claude records; Daniel decides.

---

# ADDENDUM (2026-09-02 02:4xZ) — the printed book was opened, and it settles §A and `live`'s (b)

Daniel supplied `Shirei Tshuvah 1.0 printed.pdf` — **the file that was printed**. Read directly
[measured: the PDF itself, pages 1–6 and 185–188, against `dist-app/shirei-tshuvah-feed.json`].

**The offset is +4, confirmed at both ends:**

| PDF page | printed number | content | feed says |
|---|---|---|---|
| 1–4 | *unnumbered* | title · Contents · Editor's Note · How to use | front matter |
| 5 | 1 | Erev Rosh Hashanah divider | — |
| 6 | **2** | Candle Lighting · Shehecheyanu | folio 2 = Candle Lighting, Shehecheyanu ✓ |
| 185 | **181** | Vayechulu at the Kiddush | folio 181 = Vayechulu at the Kiddush ✓ |
| 186 | **182** | Yaknehaz | folio 182 = Yaknehaz ✓ (the last unit) |
| 187 | 183 | Colophon | back matter — correctly not a unit |
| 188 | **184** | closing title page | back matter — correctly not a unit |

**188 PDF pages − 4 unnumbered front = 184 printed pages.** The three numbers that have been
circling each other all night are all correct and all mean different things:

- **188** — physical pages, which is `printing.pages` in the feed and the page count of this PDF.
- **184** — printed page numbers, 1 through 184. **This is what `src/data/books/shirei-tshuvah.json`
  carries, and it is RIGHT.**
- **182** — the last folio any *unit* occupies. The book continues two pages past its last unit.

**So `live`'s finding (b) inverts.** `pages: 184` is not a hand-set number that proves less than it
reads — it is the true printed count, and it is simply **not derivable from `maxFolio`**, because
`maxFolio` stops at the last unit and a book has back matter.

**The defect this exposes is real and is the opposite of the one suspected.** `sync-books.mjs`'s
`trim()` sets `pages = maxFolio`. **Re-running `npm run sync:books` today would write 182 and be
wrong** — and that, not the `dist/` path, is why the machzor reproduces from neither feed while
the other two volumes reproduce fine: their last unit happens to sit on their last page.

**The Rosh Hashanah guard is therefore doing real work rather than ceremony.** `list_books` →
`shirei-tshuvah` **184 / `feed`** is precisely the assertion that catches this regression, and it
has been green after every deploy tonight.

**Consequence for the P1 order, which `live` correctly stopped on:** pinning is necessary and not
sufficient. `pages` must be sourced from the printed page count — `printing.pages` less the
front-matter offset, or an explicit field in the feed — **before** any pin can reproduce the
committed snapshots. Pin alone would freeze the wrong derivation. **That is a ruling, and it is
what `live`'s stop condition existed to protect.**

Claude records; Daniel decides.
