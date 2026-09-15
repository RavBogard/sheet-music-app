# Yom Kippur 5787 — the hand-authored machzor pages, for Daniel to spot-read

Item 4 of `HANDOFF-CODE-ROUND-2-2026-09-15.md`. Read from production
2026-09-15. **No page was changed.** No copy of the printed 2008 machzor was
at hand, so this lists them rather than checking them.

## Why nothing here could be checked automatically

`crc-machzor-2008` is registered at 215 pages, and its pagemap has 57 entries
covering pp.38-92 plus a single entry at p.129. That is the ROSH HASHANAH
section, exactly as Ruling 8 says: "Rosh Hashanah morning pagemap only; no Yom
Kippur pagemap exists".

Every Yom Kippur page below therefore sits in unmapped territory. They
validate — `validateLiturgyRef` checks the page is inside the book, and 96 to
178 all are — but nothing has ever compared them to the paper.

## What the numbers look like from the inside

They are internally coherent, which is real evidence. The pages fall into two
clean blocks that do not overlap and do not overlap the Rosh Hashanah section:
Kol Nidre pp.96-126, Yom Kippur morning pp.129-178. Both run strictly forward
in service order, with exactly one exception, called out below. And where the same prayer appears in both the mapped Rosh
Hashanah section and a Yom Kippur service, the Yom Kippur page is always the
larger one - which is what one printed volume containing both services looks
like.

## One number that does not fit

**Kol Nidre, row 14, `B'sefer Chayim`, p.152.** Its neighbours are p.111
(G'vurot, row 13) and p.114 (Y'hiyu L'ratzon, row 16). 152 is not in the Kol
Nidre block at all; it is in the Yom Kippur MORNING block, where it is the
page of that service's Sim Shalom. This looks like a number that travelled
from the morning setlist. It is the one row here worth checking first.

## Three services carry no pages at all

`Yizkor`, `Neilah` and `Kol Nidre Alternative Service` have no `liturgyRef` on
any row. That is not an error - it is why `today.json` emits them with no
`startFolio` while Kol Nidre gets 96 and Yom Kippur morning gets 129. If you
want the reader and Overlays to open those three at the right page, they need
pages; if you do not, nothing is broken.

---

## Yom Kippur Morning — September 21

| Row | Title | Page | Same prayer in the mapped RH section |
|---:|---|---:|---|
| 1 | Modeh Ani | 129 | Modeh Ani, p.39 |
| 2 | Mah Tovu | 131 | Mah Tovu, p.39 |
| 3 | Birchot Hashachar | 132 | Birchot Hashachar, p.42 |
| 4 | Chatzi Kaddish | 135 | Reader's Kaddish, p.44 |
| 5 | Barchu | 136 | Bar'chu, p.45 |
| 6 | Yotzeir Or | 136 | Yotzeir Or, p.45 |
| 7 | Ahavah Rabah | 138 | Ahavah Rabah Ahavtanu, p.47 |
| 8 | Shema | 140 | Sh'ma, p.49 |
| 9 | V'ahavtah | 141 | — |
| 10 | Mi Chamochah | 143 | Mi Chamochah, p.52 |
| 11 | T'filah – Adonai S'fatai | 144 | — |
| 12 | Avot v'Imahot | 144 | Avot v'Imahot, p.53 |
| 15 | G'vurot | 146 | G'vurot, p.55 |
| 16 | Un'taneh Tokef | 147 | Un'taneh Tokef, p.57 |
| 17 | B'Rosh Hashanah | 148 | Un'taneh Tokef, p.57 |
| 18 | K'dushah | 149 | K'dushah, p.58 |
| 20 | Sim Shalom | 152 | Sim Shalom, p.62 |
| 21 | Vidui | 153 | — |
| 22 | Al Cheit | 155 | — |
| 24 | 13 Attributes | 159 | — |
| 25 | Avinu Malkeinu | 162 | Avinu Malkeinu, p.64 |
| 26 | Blessing Before Torah Reading | 163 | — |
| 27 | Torah Reading | 163 | — |
| 28 | Blessing After Torah Reading | 168 | — |
| 29 | Mi Sheberiach | 169 | — |
| 30 | Blessing Before Haftorah | 170 | — |
| 31 | Blessing After Haftorah | 173 | — |
| 32 | Eitz Chayim | 176 | Eitz Chayim, p.85 |
| 33 | Hayom | 177 | — |
| 34 | Closing Blessing | 178 | Closing Blessing, p.92 |

---

## Neilah — September 21

_No row carries a page._

---

## Yizkor — September 21

_No row carries a page._

---

## Kol Nidre — September 20

| Row | Title | Page | Same prayer in the mapped RH section |
|---:|---|---:|---|
| 1 | Candle Lighting Blessing | 96 | — |
| 3 | Barchu | 100 | Bar'chu, p.45 |
| 4 | Shema | 103 | Sh'ma, p.49 |
| 5 | V'ahavta | 104 | V'ahavta, p.50 |
| 6 | Mi Chamocha | 106 | Mi Chamochah, p.52 |
| 7 | Hashkiveinu | 107 | — |
| 8 | Reader's Kaddish | 108 | Reader's Kaddish, p.44 |
| 9 | Adonai S'fatai | 108 | T'filah, p.53 |
| 10 | Avot v'Imahot | 109 | Avot v'Imahot, p.53 |
| 11 | Zochreinu Lehayim | 109 | — |
| 13 | G'vurot | 111 | G'vurot, p.55 |
| 14 | B'sefer Chayim | 152 | Sim Shalom, p.62 |
| 16 | Y'hiyu L'ratzon | 114 | — |
| 17 | V'dui | 116 | — |
| 18 | Al Cheit | 117 | — |
| 20 | Open Ark | 118 | — |
| 21 | Avinu Malkeinu | 119 | Avinu Malkeinu, p.64 |
| 22 | Close Ark | 120 | — |
| 23 | Aleinu | 121 | Aleinu, p.86 |
| 24 | May the Memory | 123 | May the Memory, p.87 |
| 25 | Mourner's Kaddish | 124 | Mourner's Kaddish, p.88 |
| 26 | V'imru | 124 | — |
| 27 | Niggun | 126 | — |

---

## Kol Nidre Alternative Service — September 20

_No row carries a page._

---

## What would settle it

A pagemap for the Yom Kippur sections of the 2008 machzor, built the way
`crc-friday` and `crc-saturday` were. Then every page above is checked by the
same guard that checks every other service, instead of by eye. Until then
these are Daniel's numbers and the system takes his word for them.
