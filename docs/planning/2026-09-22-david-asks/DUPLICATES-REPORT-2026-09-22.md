# Chart library duplicate check — 2026-09-22

Prepared for Rabbi Daniel Bogard and David Lazaroff. **Read-only: nothing was changed, merged, marked or deleted.** Whether to merge is your call.

Raw data: `/home/claude/survey/out/library-crc.json` (719 rows) and `library-bl.json` (63 rows).

**How this was done:** I pulled every visible row (rows already marked duplicate, archived or non-chart stay hidden, as asked). Then I grouped rows by a cleaned-up title. The clean-up ignores case, punctuation, apostrophes and underscores. It also ignores words like "chords" and "band format", and it treats Hebrew spelling variants as the same (ch/kh/h, ei/ey/ai, doubled letters and so on). I also looked for rows with exactly the same file size. **The library tool gives no content fingerprint (hash) for any row in either organization**, so I used exact file size as the next-best clue. Opening the files side by side is the final test.

## 1. Counts

| Organization | core (tagged) | core (legacy, no collection field) | supplemental | nava | uploads | Total visible |
|---|---|---|---|---|---|---|
| CRC | 14 | 139 | 272 | 140 | 154 | **719** |
| Brothers Lazaroff | 0 | 0 | 0 | 0 | 63 | **63** |

The CRC library holds 927 rows in total. Hidden from this view: 99 already marked duplicate, 3 archived and 106 non-chart files. In Brothers Lazaroff nothing is hidden: no row there has ever been marked duplicate.

## 2. Likely duplicates (CRC)

"Setlists" means live setlists that use the row.

**L1 — V'Shamru: same file size to the byte**

| id | Title | Collection | Size | Key | BPM | Setlists |
|---|---|---|---|---|---|---|
| 1WusU1xlwOKQvKu2kemrowh6oZ16S9UeR | V'Shamru | core | 50,863 | — | — | 0 |
| 1cqxulkFHUjA0-w6tmUwK6t4TnPgLWbpx | V'Shamru (Old Skool) | core | 50,863 | — | — | 4 (RH Day 9/12, Bogard B'nai Mitzvah 8/22, Max 8/8, Eikev 8/1) |

**Keep "(Old Skool)".** It has the clearer name and the band uses it. The plain row is used nowhere.

**L2 — Avinu Malkeinu (Janowski): same PDF in two collections, same size to the byte**

| id | Title | Collection | Size | Setlists |
|---|---|---|---|---|
| upload-a73d8721-3f66-4b3c-aac8-295717ffabdc | Avinu Malkeinu - Selichot | uploads | 65,435 | 1 (Selichot 9/5) |
| 1J6H_F6Ba02_rMRQEJbi_lBbMXCBag6SQ | Avinu Malkeynu Janowski - Full Score | core | 65,435 | 1 (Erev RH 9/11) |

**Keep the Janowski row,** because its title names the setting. Both setlists that use these rows are already past, so moving one track over is low-risk.

**L3 — Summertime, C Lead: sizes within 1%**

| id | Title | Collection | Size | Key | Setlists |
|---|---|---|---|---|---|
| upload-4551b786-3e61-4f7e-94f3-411f89e57a09 | Summertime (Dee Jazz arr., C Lead) | uploads | 64,958 | Am | 0 |
| upload-67a41a8a-709b-40e8-a0c0-5cdf2df6fa0a | 6. Summertime - C Lead | uploads | 65,591 | — | 0 (1 leftover track from a deleted setlist) |

**Keep "Dee Jazz arr."** It has a key and a clean title, and the "6." row looks like a numbered item from the 9/8 C-Lead batch. Note that "summertime chords" (324 KB, used in 4 Camp Sabra setlists) is a different chord sheet, not a duplicate.

**L4 — Modah Ani (Halpert) in G#m: same key, sizes 2.05% apart (just outside the 2% line)**

| id | Title | Size | Key | Setlists |
|---|---|---|---|---|
| upload-10da060e-40d1-41c2-bc14-36174d7a1b8a | Modah Ani G#m | 3,071 | G#m | 4 (latest 7/4) |
| upload-ac582fb1-f27d-4530-9a01-1c3b74cf7500 | Modah_Ani_Halpert_chart | 3,008 | G#m | 4 (latest 9/19) |

**Probably one chart saved twice, but open both first,** because one may be a small revision. If they match, keep the Halpert row, since it is the one used most recently. Give it a cleaner title such as "Modah Ani (Halpert, G#m)".

## 3. Possible duplicates: same song, different file size

| # | Rows (id … title · collection · size · key · setlists) | What would settle it |
|---|---|---|
| P1 | `upload-e64047ae…446c0e` Shalom Rav (klepper) · uploads · 544,606 · D · 1 / `d22779d6…3d92e6` Shalom Rav (Klepper/Freelander) · supp · 483,003 · D/88 · 3 | Open both. If it's the same page, keep the supplemental row. |
| P2 | `1Mqje155…04epFw` V'shamru · core · 33,537 · 9 / `1r2GLfKE…fJcRTu` V_shamru_(trad) · core · 31,900 · 9 | Both are heavily used. Check whether they are the same chant. If so, pick one and move the other's tracks to it. |
| P3 | `upload-8e13ab0f…71e5b9` Hava Nagilah · uploads · 363,409 · 6 (Camp Sabra) / `61f0c403…9a0d6d` Havah Nagilah (Chassidic folk song) · supp · 372,461 · Am/116 · 0 | Sizes are 2.4% apart. Likely the same songbook page uploaded again. |
| P4 | `13xN_EFx…cvbGOy` Elohai neshama - Pourmorady · core · 28,341 · 6 / `upload-259d886a…6e18bb` Elohai N'shamah (Pourmorady, Cm) · uploads · 10,147 · Cm · 2 (High Holy Days) | The Cm row looks like a deliberate re-make. Daniel decides whether it replaces the older one. |
| P5 | `1u0I8PCz…0Nm40R` Eil Malei Rachamim · core · 550,984 · 0 / `upload-46b51532…8a6728` Eil Malei Rachamim · uploads · 55,649 · 1 (Yizkor 9/21) | Same title. Compare the notation. The unused core row is the likely extra. |
| P6 | `1i3jy2Co…lD-KhS` Bar'chu Walkdown · core PDF · 22,608 · 0 / `upload-046649f0…4c3228` Barchu Walkdown · core text · 164 bytes · Em · 5 | A PDF chart vs a 164-byte text chart. If the text version covers it, the PDF is unused. |
| P7 | `upload-7b4da954…87c91d` Modah Ani (Am Aly Halpert) · 223,083 · 2 / `upload-75899fcb…6a810b` aly modah ani · 593,424 · Am · 0 | Both are Halpert in Am. Open the unused one. |
| P8 | `upload-e4df5f9c…ee6df2` L'Cha Dodi (Nava) · uploads · 1,575,106 · 1 / `upload-0a313f09…145211` L'cha Dodi (Nava Tehila) · nava · 130,774 · C · 0 | The same 1.5 MB file is called "Lecha Dodi **Nigun** (Nava)" in Dm in the Brothers Lazaroff library. That points to a different tune from the C nava chart. |
| P9 | `upload-686c4667…e817c9` L'cha Dodi (Navot Ben Barak) · nava · D / `upload-81781f8a…598d83` Lecha Dodi (Ben Barak) · nava · Em · both 0 | Same composer, same collection, different keys. Could be two different tunes. |
| P10 | `11hnNdTg…LfC28y` Yedid Nefesh · core · 38,659 · 5 / `upload-051e8eff…6a5d32` Yedid Nefesh (Rosenberg) · nava · Am · 0 | Check whether the core chart is the Rosenberg tune. |
| P11 | `upload-70ce0a36…08e1d1` Hal'luyah (Psalm 150) (Dm) · core · 3 / `upload-5d72423a…9f17da` Hal'luyah (Psalm 150) (Rosenberg) · nava · Dm · 0 | Probably a CRC re-typeset of the Rosenberg tune. If so, it is a band version worth keeping, and it should be labeled as that. |
| P12 | `1t7fPtGb…DbvGq` Modeh ani - Klepper · core · 32,993 · **13** / `2fc76c49…22ab72` Modeh Ani (Klepper & Freelander) · supp · G · 0 | Same song. The core chart is the band's working copy. Only merge if the pages match. |
| P13 | `upload-4d5f5575…ad9dc0` Shehecheyanu (Pik) · supp · 15,071 · 0 / `upload-f9412380…a4f140` Shehecheyanu__Pik_alone · uploads · 394,457 · 1 | The supplemental row is unusually small for that collection. It may be a cropped piece. |
| P14 | `upload-91b99c44…c98d14` Friend Of The Devil · PDF · 1 / `upload-a77150c0…bcba824` Friend of the Devil (Englishtown notation) · PDF · G · 0 | Two PDFs of the same song. |
| P15 | `upload-36f9c403…e33eab` Hinei Mah Tov (Eeoohh!) · text C · 0 / `upload-93f68f6e…288455` Hine Ma Tov (Sabra, C) — band chart · text C · 2 | Two text charts, same key. |
| P16 | `1J_RYWUg…YpMSom` Mi chamocha (Moshav) · D · 6 / `1oOys8D1…f4ZhBQ` Mi chamocha (Moshav) morning · 7 | Sizes are 2.2% apart, but the morning words differ. **Probably two separate charts on purpose.** Listed only so nobody merges them by mistake. |

**Pop songs saved in three formats.** About 20 Camp Sabra/jam songs each have a plain text row, a "(band format)" text row and often a "(chords)" PDF. Examples: Wonderwall, Wagon Wheel, Shake It Off, One Day, I'm a Believer, Take Me Home Country Roads, Lean on Me, Free Fallin', Pink Pony Club, I Want It That Way, Build Me Up Buttercup, Good Riddance, B'tzelem Elohim, Ay Oh/Lo Yisa Goy, Sunscreen, Od Yavo Shalom Aleinu, Landslide, Ain't No Sunshine, Brown Eyed Girl, Three Little Birds, Strange Fruit, What a Wonderful World, Mississippi Goddam and Man I Need. None are byte copies. **Question for David:** does "(band format)" replace the plain text version? If yes, the plain text rows (all uploaded 6/4) are the extras.

## 4. Same name, different arrangement: NOT duplicates

These rows share a song name but have different composers, keys or formats. Do not merge them.

- **Different composers/arrangers:** L'cha Dodi (13 settings), Oseh Shalom (10), Mi Chamocha (7), Hashiveinu (6), Sim Shalom (5), Eitz Chayim (5), V'Shamru (Friedman/Rothblum), Hashkiveinu (Brodsky-Zweiback/Chaitman/Randy), V'Ahavta (4), Or Zaru'a (4), Yism'chu Hashamayim (4), Ana B'khoach (6), Ashrei (3), Bayom Hahu (3), Barchu (Nelson/Friedman/Siegel/HHD trad), Dodi Li (Chen/Friedman/Sher), Adonai S'fatai (Taubman/trad/chant/Sykes), Modeh Ani (CRC Cm/Kraus/Klepper & Freelander), Yom Zeh L'Yisraeil (3), Mizmor Shir (3), Ein Keiloheinu (3), Shir Hama-Alot (3), Hodu, Ufaratzta, Al Tira, Shir Chadash, Kumi Lach, Al Takshu, Ma Gadlu, Romemu and Rom'mu, Y'varech'cha, V'ha-eir Eineinu, Y'did Nefesh (Agmon/Sykes).
- **Different key on purpose:** Kedusha Am / Kedusha Em, Stand By Me / (Ab), Three Little Birds / (F), Sim Shalom (Silver, C#m) / (Silver, Dm), Adon Olam / (F), Take Me Home Country Roads (band format) / (band format, capo 2).
- **Different text:** Modah Ani / Modeh Ani (feminine and masculine wording). Hod V'Hadar Em (Hebrew) / Gm (transliteration). Shiviti (Psalm 16) / Shivti (Psalm 27).
- **Full score or choir part vs lead sheet:** Barchu (Am I Awake) Full Score / leadsheet, May the Memory Full Score / Choir, Ve'imru Amen Full Score / Choir, Un'taneh Tokef Full Score / 4 parts, Avinu Malkeinu (Janowski, Em) / Janowski D minor SATB Choir, Hayom Te'amtseinu / Full Score.
- **Medley pages** in supplemental repeat songs that also have their own rows (for example, Birkot Havdalah, L'chi Lach, Bar'chu (Siegel), Tzur Mishelo). This is expected.

## 5. Brothers Lazaroff

| id | Title | Format | Size | Setlists |
|---|---|---|---|---|
| upload-13f00526-b8ef-4c26-a0ae-989cf687a987 | You're My Heaven (Tonight) | text | 601 | 3 (STL Style 9/19, Joe's Experiment 9/8, Trying to Make It Home) |
| upload-e992b170-d0f8-4237-aa0e-356493d51a77 | You're My Heaven (Tonight) | text | 601 | **0** |
| upload-4351dd4a-1da9-44bd-b6fe-fa6a30aa5232 | You're My Heaven (Tonight) | PDF | 2,417 | 1 (Tower Grove) |

- **Likely duplicate:** The byte-identical pair the earlier audit found is **still active**. **Keep 13f00526** (the original, used 3 times). The 9/7 copy e992b170 is unused. The PDF is a separate format.
- **Possible:** "Tryin' To Make It Home" (`upload-bd29507f…`, text, no tags, 0 setlists) vs "Trying to Make It Home" (`upload-e6c6a6a0…`, PDF, 2 setlists). The unused text row is the likely extra.
- **Possible:** "Pink Supermoon" PDF (2,629 bytes, 1 setlist) vs text (869 bytes, 0 setlists).
- **Possible:** "Blvck Spvde + Friends - Set 1 (C Lead packet)" (525 KB) vs "Blvck Spvde - C Lead Gig Packet" (491 KB). These may be two versions of one packet.
- **Not duplicates:** Breathe With You, Everything Stopped, Talk Til' Yer Blue, Time's Quickly Fleeting and We Still Stand each have a text lyric chart plus a PDF lead sheet. Their tags say this is intentional.
- **Files shared between the two organizations** (same size in both, so not a duplicate inside either one): Lecha Dodi Nigun (Nava) = CRC "L'Cha Dodi (Nava)"; Sim Shalom (Julie Silver) = CRC "Sim Shalom (Silver, Dm)"; Nigun 1 (DG Mando) = CRC "Nigun 1"; Landlocked = CRC "Landlocked".

## 6. Other things worth knowing

- **No fingerprint field exists.** Neither library listing includes a content hash, so check (a) could not run. Two CRC pairs with identical sizes (L1, L2) survived the earlier byte-level cleanup. Both involve Google Drive-hosted rows, which suggests that cleanup may not have covered Drive files. Worth asking whoever ran it.
- **Missing keys:** 329 of 719 CRC rows have no key. That includes 137 of the 139 legacy core rows and 118 supplemental rows. In Brothers Lazaroff, 57 of 63 have no key.
- **Inconsistent key labels:** "A minor" (Hari'u L'Adonai, Sykes), "A9" (Kumi Lakh, Sykes) and "Em9" (Brothers Lazaroff, Feel Like Making Love). Everything else uses short forms like "Am".
- **Non-chart or odd rows still showing:**
  - "Shir Shabbat Packet — Cover & Tune List" (a cover page).
  - "dodi li (sher)" (a PNG image).
  - "Driving Quiet - one pager" (2 KB).
  - Brothers Lazaroff has three whole gig packets filed as charts.
  - Vague titles: newtune_july2026, roadto, CT #1, "Aleinu - " (trailing dash), "Ma Tovu (CRC) 2".
  - Four titles end in "(1)", the mark of a second download. None has a matching original: L'chai Olamim - Full Score, eits chayim hi tree of life chords, fire on the mountain chords, sanctuary chords.
- **Coincidence to rule out:** "Adonai Oz (Nava Tehila)" and "Avinu Malkeinu_trad_Choir_Em" are both exactly 46,235 bytes. They are different songs, so it is probably chance. A 10-second look would rule out a mislabeled file.
- **Leftover tracks:** "6. Summertime - C Lead" and "Friend Of The Devil" each still have one track on a deleted setlist.
- **Orphans:** none visible. The default view hides them, and the CRC count of hidden rows lists none marked orphaned.
- **Tool access:** every tool I needed was available. There were no 403 errors or missing tools.
