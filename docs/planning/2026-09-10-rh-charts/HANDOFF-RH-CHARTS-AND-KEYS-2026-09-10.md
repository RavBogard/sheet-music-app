# HANDOFF — Rosh HaShanah charts & keys (Alt Day 1 + Day 2)

**Date:** 2026-09-10
**Thread purpose:** build the music layer (keys, charts, chart bonds) on top of the finished
liturgy outlines for the two Rosh HaShanah morning services.
**State at handoff:** Alt Day 1 is at **version 27**, fully keyed. Day 2 is untouched.

---

## 1. The two setlists

| | Alt Rosh Hashanah Day — Sept 12 | Rosh Hashanah Day 2 — Sept 13 |
|---|---|---|
| setlistId | `35380072-2550-4792-9d00-59f01e54b6b6` | `e7cf1877-c0f8-4dbd-8e6a-f39c5b0af0b5` |
| version | 27 | 17 |
| tracks | 82 | 84 |
| book | `shirei-tshuvah` | `shirei-tshuvah` |
| templateType | `rosh-hashanah-morning` | `rosh-hashanah-morning` |
| published | no | no |

MCP server: **CRC_Music** (`mcp__CRC_Music__*`). Org `crc`.

**Page numbers are frozen.** All folios are the printed folios of press build `21417d9`.
They were corrected on 2026-08-31 from the `6bfb2ed` build (which was 11–67 pages off).
Do not re-derive them.

**Day 2 differs from Day 1 in exactly four rows:** K'dushat HaYom without the (haShabbat)
inserts, Avinu Malkeinu in full with the ark open, Torah = Genesis 22 (the Akedah),
Haftarah = Jeremiah 31. Everything else is the same outline.

---

## 2. What was decided and committed to Day 1

**Structural changes**
- Hareini **removed**.
- Achat Sha'alti **moved up** out of P'sukei D'zimra into the opening medley.
- Opening order is now: Band prelude → **Achat Sha'alti → Hashivenu → Return Again** → Welcome.
- Welcome & introduction **moved** to after the medley, immediately before Modah Ani.
- "Optional close: Adon Olam / Yigdal" **retitled to "Adon Olam"**, set in F. Yigdal dropped
  (nothing in the library for it).

**Rulings by section**
- Everything in the **Shofar Service** gets **no chart** — Daniel: "nothing there for charts."
- **Avot v'Imahot, Zochreinu, G'vurot** are chanted, no chart.
- **Ein Kamocha, Vay'hi Binso'a, Sh'ma / Echad Eloheinu** chanted ("everything else chanted
  until L'cha Adonai HaGedulah").
- **V'zot HaTorah, Y'halelu** chanted.
- Trope rows (Chatzi Kaddish, Yishtabach, Blessing Before/After Torah and Haftarah,
  Mourner's Kaddish) — no chart.
- **Concluding, ASSUMED not confirmed:** Hayom T'am'tzeinu, Aleinu, Shehecheyanu & a New
  Fruit, Birkat Kohanim marked chanted/no chart because Daniel only named Ein Keloheinu as
  played. Those four rows carry "(Assumed.)" in their notes. **Hayom T'am'tzeinu is the one
  most likely wrong — get a ruling.**

---

## 3. Every keyed row on Day 1 (24 rows)

| Row | Key | Chart | fileId |
|---|---|---|---|
| Achat Sha'alti | Cm* | TO DRAW | — |
| Hashivenu | Cm | TRANSPOSE (chart is Am) | `upload-92a6daff-5c52-4c3c-90f1-5f3cb22e2fd0` |
| Return Again | Cm | bonded | `upload-4fffcc62-66af-4280-a9b6-42ba4cd41f7d` |
| Modah / Modeh Ani | Cm | **bonded, built by us** | `upload-596a2313-675c-47d4-97bb-abef54851414` |
| Mah Tovu | Cm | CONFIRM — folk setting is inside a combined sheet | `41379850-2021-48c5-8acd-e867e4dfa119` |
| Elohai N'shamah | Cm | TRANSPOSE (Pourmorady, no key on file) | `13xN_EFxJ0igz9oYROL_DGx-hj6cvbGOy` |
| Baruch She'amar | D | TO DRAW — **needs a source** | — |
| Psalm 150 · Kol HaN'shamah | Dm | bonded (Rosenberg, 172bpm) | `upload-5d72423a-75b3-4d68-9579-502cb99f17da` |
| Barchu | E | TO DRAW | — |
| Yotzer Or | E | no chart — band vamps on the Barchu groove, read over it | — |
| Ahavah Rabbah | E | bonded ("Ahava raba (echo)") | `15JPaQTkyZckMCXWNuc0qQ6DWSiK1NBGJ` |
| Mi Chamocha | Dm | bonded, **chart is written in Cm — transpose up a tone** | `1URzdt7mdDjXZjO6J0ibl_E4SukMxfD4t` |
| Adonai S'fatai | Em | TO DRAW (Em, B7 only) — a Taubman version also exists | `1AZumqP1QVsv_1AQRi6DeO4RfBcP5mlkg` |
| Un'taneh Tokef | Dm | TO DRAW — chords only, no text | — |
| K'dushah | Am | bonded (Kedusha: High Holidays Reform, Nava) | `upload-b8f72b73-cea0-41d8-a178-2c5f2d30bbb1` |
| B'sefer Chayim | Em | TRANSPOSE (Nava chart is Gm) | `upload-...` (B'sefer Chayim, Nava Tehila) |
| Avinu Malkeinu | Em | bonded (Janowski) | `upload-076df066-78f7-4cef-bc0f-fc5ae778ab5b` |
| Kaddish Shalem | Em | bonded (Chassidic — Gottlieb/Litvack) | `upload-bef8b711-2764-42ed-954d-31abbb722c19` |
| L'cha Adonai HaGedulah | D | TRANSPOSE (Nava chart is Am/128) | `upload-...` (L'cha Adonai / Rom'mu, Nava) |
| Rom'mu | Bm | TRANSPOSE (same Nava chart, Am) | same as above |
| Mi Shebeirach | B♭ | bonded (Debbie Friedman) | `6738e47c-e710-4f65-9655-d93d2ee8332e` |
| Eitz Chayim | Am | TO DRAW — Am / Dm / E7, vampy | — |
| Ein Keloheinu | B | bonded (Freudenthal = the traditional tune) | `0afb3e5a-9554-43e2-b6e4-bf3b4470ca68` |
| Adon Olam | F | bonded — worth redrawing, see §6 | `upload-7853815f-6c11-47ec-a2b5-cfde2d5021f8` |

\* Achat Sha'alti's key is **unresolved** — see §7 Q1.

---

## 4. Standing rules Daniel has set (obey these)

1. **Charts show the ACTUAL sounding chords. Never capo shapes.** If he gives you shapes plus
   a capo, transpose them yourself before drawing. (Am shapes at capo 3 → write Cm.)
2. On a chart with an A and a B section, **both progression boxes go at the top, side by side,
   labelled A and B.**
3. **Upload charts into the library as you make them, and bond the ones already there.**
   Don't hold a stack for review.
4. House chart look = the **"Ki Anu Amecha (Trad)"** chart, `upload-94531082-4b5f-4215-bfbd-d6d7b6d624e0`.
5. End every message with (a) things Daniel needs to do and (b) questions he needs to answer,
   each carrying its own context.
6. Never sequence work on a calendar. Give him cost and shape, not a schedule.

**His chord-notation shorthand:** he writes the chord immediately before the syllable it sits
over, running into the words. `CModeh GAni FlfaneGCha` = C on "Modeh", G on "ani", F on "l'",
G and C on "cha". `A achat shealti m' G eit` = A on "achat", G on "eit".

---

## 5. The chart renderer

Saved to the repo at **`tools/crc_chart/chart_lib.py`** with a worked example in
`tools/crc_chart/mk_modeh.py`. Renders HTML → PDF via headless Chromium. DejaVu Sans.

**The bug that was already found and fixed — do not reintroduce it.** The first version drew
the chord line as its own string of text, padding with spaces to a character index, in a
monospace font, above a lyric line in a proportional font. Different metrics, so only the
first chord in any line landed correctly and everything after drifted left. The fix: each
chord is anchored to its own syllable as a `(chord, text_chunk)` unit, with the chord
absolutely positioned above its chunk. Alignment is now font-independent. Use `line()` /
`lyric_of()`; there is no character-counting anywhere.

**Uploading:** `upload_chart`'s inline base64 is too big for the tool surface. Use
`request_chart_upload_url` → `curl -X PUT --data-binary @file.pdf -H 'Content-Type: application/pdf' <url>`
→ `finalize_chart_upload`. To **replace** a chart's bytes while keeping every setlist bond,
pass `targetFileId` to `finalize_chart_upload` (heal mode).

---

## 6. Two library findings worth carrying forward

**Transliteration search is not fuzzy.** `search_library` treats variant spellings as
different strings. "Ahavah Rabbah" found nothing; **"Ahava raba (echo)"** was sitting there
the whole time. Before concluding a chart doesn't exist, try `search_chart_text` with 2–3
transliteration variants and with a composer name. Earlier "nothing in the library" calls in
this thread may be wrong for the same reason.

**Adon Olam in F does exist** — `upload-7853815f`, filed as plain "Adon Olam":
`| F | Dm | F | C | B♭ | F | Dm C | Dm C B♭ |` repeat ad lib, outro `Dm C B♭` repeat/jam.
But it's a rhythm-slash excerpt cropped out of a larger medley sheet (bar 171, with a
"Prayer for Healing" line still hanging above it). Bonded, but worth redrawing clean.

**Combined sheets are a real hazard.** Several supplemental charts hold 2–3 songs on one PDF
("Modeh Ani (Folk) - Mah Tovu (Folk)"). Bonding one to a row means the iPad opens on a page
where the wanted song may be third down.

---

## 7. Open questions — blocking

1. **Achat Sha'alti — D minor or C minor?** The changes Daniel gave are D minor. He had
   earlier said the opening medley was Cm. Either the medley isn't one key, or transpose
   everything down a tone (Dm→Cm, Am→Gm, E7→D7, F→E♭, G→F, C→B♭, A→G). The row currently
   says Cm; the chords say Dm. **Resolve before drawing.**

   His changes as given:
   ```
   A                    G           F      A  G  Am
   Achat sha'alti me'et Adonai,     otah   a  va keish

   Dm    Am    Dm       Am        Dm         E7
   Sh-iv-ti   m'eit  adon-ai.  K-ol yamai ch-yai...

   F           G       C        Am      F  G  E7
   L-achazot b'noam  b'n-oam  Ado-nai
   ```
   3/4. Traditional. Nothing in the library under any spelling.

2. **Baruch She'amar (Craig Taubman, D).** Not in the library, no free chart found online.
   Daniel was asked to photograph a binder page. Without a source this one can't be drawn.

3. **Adonai S'fatai — Taubman or the bare two-chord version?** Daniel asked for Em/B7 only.
   `Adonai S'fatai (Taubman).pdf` exists in the library.

4. **The five transposes — redraw or annotate?** Hashivenu, Elohai N'shamah, B'sefer Chayim,
   L'cha Adonai, Rom'mu. Redraw clean in the house style, or leave the originals bonded with
   the new key noted on the row? **Asked three times, never answered.**

5. **Un'taneh Tokef's B part.** Daniel gave 6/4 Dm–C–Gm plus "the B part of the Mi Chamocha."
   The Mi Chamocha B section (the "Yai dai dai" line) is written in Cm; transposed up a tone
   it is Dm–Gm–C–F–D7–Gm, then C–F–Dm–C–Dm. That's arithmetic, unverified by ear.

6. **Hayom T'am'tzeinu** — marked chanted/no chart on an assumption. Likely wrong.

---

## 8. Still to write (content, not charts)

- **The shofar-pattern explanation** before the first sounding (Karen's ask). Marked
  "TO WRITE" on the row.
- **Three Hayom Harat Olam poems** — Daniel chants, Karen reads a poem, at each of the three
  soundings. All three still say POEM TBD.

---

## 9. Day 2

Untouched. Once Day 1's charts exist, copy every key and chart bond across and hand-edit only
the four marked rows. Day 2's notes are trimmed versions of Day 1's, so the music decisions do
not carry automatically.

---

## 10. Live status page

A working sheet showing both services row by row — key, page, chart state, filters for
"band plays" / "still on me" / "still on you" — is published as an Artifact titled
**"Rosh HaShanah Charts & Keys."** It reads from a snapshot, not live, so refresh it from
`get_setlist` after any batch of changes.
