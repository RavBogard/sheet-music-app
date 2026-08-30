# CRC Siddur page-map verification

**Status: UNVERIFIED.** These page numbers were extracted from the public PDFs by
machine text-extraction. They have NOT been checked against the physical printed
books. Verify before any service sheet is printed from this data.

Check each printed page number against the physical book. Mark ✗ and write the
correct number for any that is wrong.

## How the page numbers were derived

Text was extracted from each PDF with `pdftotext -layout`, which preserves the
printed folio number that appears on each page. Every page's printed folio was then
compared against its PDF page index to establish the offset.

| Book | PDF pages | Printed folios | Offset | Evidence |
|---|---|---|---|---|
| CRC Friday Siddur | 48 | 2–48 | **0** (printed = PDF index) | All 47 numbered pages print exactly their own PDF index. 0 mismatches. PDF p.1 is the unnumbered title page. |
| CRC Saturday Siddur | 54 | 50–102 | **+48** (printed = PDF index + 48) | All 53 numbered pages print PDF index + 48. 0 mismatches (PDF p.2 → "50", PDF p.54 → "102"). PDF p.1 is the unnumbered title page (= printed 49). |

**Why the Saturday offset is +48:** the Saturday siddur is paginated as a
continuation of the Friday siddur. Friday ends on printed page 48; Saturday's title
page is printed page 49 and its body runs 50–102. This is a real property of the
books, not an extraction artifact — please confirm it also holds for the physical
volumes.

### Inferred entries

**None.** Every entry below sits on a page whose printed folio number was read
directly off that page. No page number was derived from the offset, and none was
guessed. The two unnumbered title pages produced no entries.

### Registry correction made

`registry.json` listed `crc-saturday` with `pages: 54` (the PDF sheet count).
`pages` is defined in `src/lib/books/types.ts` as *"Highest printed page number in
the book; upper bound for folio validation"*, so 54 would have made
`validateLiturgyRef` reject every real Saturday folio (50–102) as out-of-range.
Corrected to **102**. Friday's 48 was already correct.

### Nothing illegible

Hebrew renders as garbled non-Unicode glyphs in both books, as expected — so no
Hebrew alias strings were recorded. All prayer titles are printed in Latin
transliteration and were fully legible, as were all printed folio numbers. No entry
was dropped for illegibility.

---

## CRC Friday Siddur — printed pages 2–48 (48 entries)

| ✓/✗ | Prayer | Page |
|-----|--------|------|
|     | Hareini | 3 |
|     | Niggun | 4 |
|     | House of Prayer | 4 |
|     | Hineih Mah Tov | 4 |
|     | Candle Lighting Song | 4 |
|     | Candle Blessing | 5 |
|     | Shalom Aleichem | 6 |
|     | Yom Zeh L'Yisrael | 7 |
|     | Awaken, Arise | 8 |
|     | L'chah Dodi | 8 |
|     | As We Bless | 10 |
|     | Bar'chu | 10 |
|     | Ma-ariv Aravim | 12 |
|     | Ahavat Olam | 13 |
|     | The One | 14 |
|     | Kriyat Sh'ma | 15 |
|     | V'ahavta | 16 |
|     | Thou Shalt Love | 17 |
|     | Mi Chamochah | 18 |
|     | Siyahamba | 19 |
|     | Hashkiveinu | 20 |
|     | V'shamru | 21 |
|     | Reader's Kaddish | 22 |
|     | T'filah | 23 |
|     | Sanctuary | 23 |
|     | Avot V'imahot | 24 |
|     | G'vurot | 26 |
|     | K'dushat Hasheim | 27 |
|     | K'dushat Hayom | 27 |
|     | Avodah | 28 |
|     | Hoda-ah | 29 |
|     | Shalom Rav | 30 |
|     | Olam Chesed Yibaneh | 31 |
|     | Silent Prayer | 31 |
|     | Rosh Chodesh | 33 |
|     | Mi Shebeirach | 34 |
|     | El Na R'fa Na Lah/Lo | 34 |
|     | Prayer for Shalom | 35 |
|     | Prayer for the State of Israel | 36 |
|     | Hatikvah | 37 |
|     | Aleinu | 38 |
|     | Bayom Hahu | 40 |
|     | May the Memory | 41 |
|     | Mourner's Kaddish | 41 |
|     | Adon Olam | 43 |
|     | Closing Blessing | 45 |
|     | Evening Kiddush | 46 |
|     | Motzi | 47 |

---

## CRC Saturday Siddur — printed pages 50–102 (62 entries)

| ✓/✗ | Prayer | Page |
|-----|--------|------|
|     | Hareini | 50 |
|     | Modeh Ani | 51 |
|     | Elohai N'shamah | 51 |
|     | Lev Tahor | 51 |
|     | Mah Tovu | 52 |
|     | Hineih Mah Tov | 53 |
|     | Birchot Hashachar | 53 |
|     | Hodu L'Adonai | 54 |
|     | P'sukei D'zimrah | 55 |
|     | Hal-lu Yah | 56 |
|     | Eilu D'varim | 57 |
|     | Reader's Kaddish | 58 |
|     | As We Bless | 59 |
|     | Bar'chu | 59 |
|     | Yotzeir Or | 60 |
|     | Ahavah Rabah Ahavtanu | 61 |
|     | The One | 63 |
|     | Kriyat Sh'ma | 63 |
|     | V'ahavta | 65 |
|     | Thou Shalt Love | 66 |
|     | Emet | 67 |
|     | Mi Chamochah | 68 |
|     | Siyahamba | 69 |
|     | T'filah | 70 |
|     | Sanctuary | 70 |
|     | Avot V'imahot | 71 |
|     | G'vurot | 73 |
|     | K'dushah | 74 |
|     | V'shamru | 76 |
|     | Avodah | 77 |
|     | Hoda-ah | 78 |
|     | Sim Shalom | 79 |
|     | Olam Chesed Yibaneh | 79 |
|     | Silent Prayer | 80 |
|     | Concluding the T'filah | 82 |
|     | Oseh Shalom | 82 |
|     | Torah Service | 83 |
|     | Hakafot | 83 |
|     | Blessings Before the Torah Reading | 84 |
|     | Reading of the Torah | 84 |
|     | Blessing Following the Torah Reading | 84 |
|     | V'zot HaTorah | 84 |
|     | Rosh Chodesh | 85 |
|     | Mi Shebeirach | 86 |
|     | El Na R'fa Na Lah/Lo | 87 |
|     | Birkat Hagomeil | 87 |
|     | T'filat Haderech | 88 |
|     | Blessings Before the Haftarah Reading | 88 |
|     | Reading of the Haftarah | 89 |
|     | Blessings Following the Haftarah Reading | 89 |
|     | Eitz Chayim | 90 |
|     | Prayer for Shalom | 90 |
|     | Prayer for the State of Israel | 92 |
|     | Hatikvah | 92 |
|     | Aleinu | 93 |
|     | Bayom Hahu | 95 |
|     | May the Memory | 96 |
|     | Mourner's Kaddish | 96 |
|     | Adon Olam | 98 |
|     | Closing Blessing | 100 |
|     | Kiddush | 101 |
|     | Motzi | 101 |
