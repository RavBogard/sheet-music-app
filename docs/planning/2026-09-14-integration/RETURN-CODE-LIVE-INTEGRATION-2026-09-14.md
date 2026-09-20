# RETURN -> Daniel: centralreform.live integration waves

Plan: `PLAN-CODE-LIVE-INTEGRATION-2026-09-14.md`. Branch `claude/integration-2026-09-14`
off `master` in `C:\Users\dsbog\CentralReform.live\sheet-music-app`.
Appended per wave. Anything unverified is written here as a finding, not a guess.

---

## A-W1 - `liturgyRefs` per book + `fixed` rows - DONE

Commit `4660de7e95` - *templates: liturgyRefs per book + fixed rows on TemplateSlot/TemplateTrack*

**What shipped**

- `src/lib/books/slot-liturgy.ts` (new) - `resolveSlotLiturgyRef(refs, book)`. A
  template slot carries `liturgyRefs` keyed by book slug; this resolves the one
  entry for the book the setlist actually runs from, and every resolved ref goes
  through `validateLiturgyRef` before it is returned.
- `TemplateSlot` (`src/lib/liturgical-templates.ts`) and `TemplateTrack`
  (`src/lib/mcp/tools/templates.ts`) gain `liturgyRefs` + `fixed`.
- `clone_setlist_from_template` gains a `book` argument. It stamps `book` on the
  new setlist and resolves every row against it. Three outcomes, deliberately:
  resolved -> the row carries that book's page; **no entry for this book -> the row
  carries NO page** and is listed in the new `unresolvedLiturgy[]`; folio outside
  the book -> **the whole clone is refused** with the registry's own message,
  because that is a defect in the template and the clone is where it surfaces.
- `fixed` joins `COPYABLE_TRACK_FIELDS` (so it survives "clone last week's
  service"), the `add_track` / `bulk_add_tracks` / `update_track` allow-lists,
  `TRACK_FIELDS`, and `QueueItem`. The five print projections declare it
  intentionally dropped - the rabbi's sheet carries every row, fixed or not.
- `buildSetlistFromTemplate` takes an optional `book` so the browser wizard
  resolves identically. There an invalid ref is dropped rather than thrown: a
  template defect must not block a setlist mid-authoring in the UI.

**Measured**

- `[measured]` Unit suite after A-W1: **4314 passed, 2 failed, 69 skipped** over
  378 files. Both failures are `src/lib/books/__tests__/registry.test.ts`, which
  is **pre-existing on `master`** (verified by checking out `master` and running
  that file alone: the same 2 failures) and is already one of the two entries on
  `ci/gated-suite-exclusions.txt`. Cause, per that file's own note:
  `seasonal.shehecheyanu@shabbat-shacharit` carries folio **145** against the
  book's declared `pages: 144`. Untouched by this work.
- `[measured]` New tests: `src/lib/mcp/tools/__tests__/templates-liturgy.test.ts`
  - 10 passing.
- `[measured]` `npx tsc --noEmit` clean.

**Findings**

1. **Templates carry no `book` field today.** `setlistTemplates/{id}` has
   `name`, `templateType`, `serviceNotes`, `tracks[]` - no book. That is why the
   book arrives as a `clone_setlist_from_template` argument rather than being
   read off the template. It is the right shape anyway (one Friday template, two
   books), but it means the caller must pass `book` or fixed rows clone page-less.
2. **`src/lib/setlist-write.ts:30` still types `ServerSetlistTrackInput.type` as
   `'song' | 'header'`** while live rows carry `prayer/reading/note/transition`.
   The MCP write path (`src/lib/mcp/server-tracks-write.ts`) uses the full
   `TrackType` and is the path the RH Day 2 rows came through; `setlist-write.ts`
   is the browser-side writer. Not in this plan's scope; recorded so it is not
   rediscovered.

---

## A-W2 - Fixed-liturgy proposal - **STOP: Daniel confirms**

Commit `7d333a55b2` - *templates: fixed-liturgy proposal generator (awaiting Daniel)*

**What shipped**

- `scripts/fixed-liturgy.json` - the allow-list. WHICH moments are fixed liturgy,
  per service. It does **not** carry an order.
- `scripts/emit-fixed-liturgy.mjs` - walks each feed book's `units[]` **in feed
  order**, keeps the allow-listed ones, and resolves each one's printed page in
  both of that service's books. The order below comes from the books, not from
  anyone's memory.
- `scripts/__tests__/emit-fixed-liturgy.test.ts` - 8 tests. The script is `.mjs`
  and cannot import the TypeScript matcher, so it carries a port of
  `lookup.ts`'s `norm()`; this test runs both over every name and alias of every
  shipped pagemap book and fails if they ever disagree.
- Output committed under `C:\Users\dsbog\CentralReform.live\sheet-music-app\work\`.

**The matcher refuses more than `lookup_book_page` does, on purpose.** The
pagemap match here is EXACT-ONLY. `lookupBookPage`'s substring tier produces
real false hits on this corpus - normalized, **"Nishmat Kol Chai" contains
"shma"** (*ni-SHMA-t*), so a substring matcher hands Nishmat the Sh'ma's page.
Anything short of an unambiguous exact hit is reported below as AMBIGUOUS with
its candidates, and left to you. A wrong page here prints on the lectern sheet.

### What I need from you

For each of the four tables: confirm the **order**, and rule on the rows under
"Needs a ruling". Three kinds:

- **AMBIGUOUS** - the congregation's book almost certainly has this prayer under
  a different name. Tell me which entry, or "none".
- **no entry in this book** - the row will clone page-less under that book. Fine
  if the prayer genuinely is not in that siddur; give me a page if it is.
- **order disagreement** - the two books print that stretch of the service in
  different orders. The proposal follows the feed. Tell me if the congregation's
  own book is the one to follow.

Also: the "Not seeded - candidates" list at the foot of each table is everything
I deliberately left OUT. Add back whatever belongs.

Once confirmed, the tables are committed as
`src/data/templates/fixed-liturgy.<book>.json` and A-W3 merges them into the
Friday and Saturday template defaults. **A-W3..A-W6 are held until then.**

### Friday - `shabbat-maariv` (the feed volume)

Generated by `scripts/emit-fixed-liturgy.mjs` from `src/data/books/shabbat-maariv.json`. Order is the feed book's own unit order — not a remembered sequence.

**31 rows.** Every row carries a stable unit id.

| # | Label | Folio | Unit id | Pagemap match |
|--:|---|--:|---|---|
| 1 | Lighting the Candles | 3 | `kabbalat.lighting-the-candles@shabbat-maariv` |  |
| 2 | Shalom Aleichem | 4 | `kabbalat.shalom-aleichem@shabbat-maariv` |  |
| 3 | L’cha Dodi | 15 | `kabbalat.lcha-dodi@shabbat-maariv` |  |
| 4 | Bar’chu | 21 | `shma.barchu@shabbat-maariv` |  |
| 5 | Ma’ariv Aravim | 22 | `shma.maariv-aravim@shabbat-maariv` |  |
| 6 | Ahavat Olam | 23 | `shma.ahavat-olam@shabbat-maariv` |  |
| 7 | The Sh’ma | 24 | `shma.the-shma@shabbat-maariv` |  |
| 8 | V’ahavta & Tzitzit | 24 | `shma.vahavta-tzitzit@shabbat-maariv` |  |
| 9 | Emet v’Emunah | 28 | `shma.emet-vemunah@shabbat-maariv` |  |
| 10 | Mi Chamocha | 28 | `shma.mi-chamocha@shabbat-maariv` |  |
| 11 | Hashkivenu | 30 | `shma.hashkivenu@shabbat-maariv` |  |
| 12 | V’shamru | 32 | `shma.vshamru@shabbat-maariv` |  |
| 13 | Chatzi Kaddish | 33 | `shma.chatzi-kaddish@shabbat-maariv` |  |
| 14 | The Silent Amidah | 34 | `amidah.the-silent-amidah@shabbat-maariv` |  |
| 15 | Avot v’Imahot | 35 | `amidah.avot-vimahot@shabbat-maariv` |  |
| 16 | G’vurot | 36 | `amidah.gvurot@shabbat-maariv` |  |
| 17 | K’dushat HaShem | 37 | `amidah.kdushat-hashem@shabbat-maariv` |  |
| 18 | K’dushat HaYom | 37 | `amidah.kdushat-hayom@shabbat-maariv` |  |
| 19 | Avodah | 39 | `amidah.avodah@shabbat-maariv` |  |
| 20 | Modim | 40 | `amidah.modim@shabbat-maariv` |  |
| 21 | Shalom Rav | 41 | `amidah.shalom-rav@shabbat-maariv` |  |
| 22 | Elohai N’tzor | 42 | `amidah.elohai-ntzor@shabbat-maariv` |  |
| 23 | Vayechulu | 43 | `amidah.vayechulu@shabbat-maariv` |  |
| 24 | Me’ein Sheva | 44 | `amidah.meein-sheva@shabbat-maariv` |  |
| 25 | Kaddish Shalem | 46 | `amidah.kaddish-shalem@shabbat-maariv` |  |
| 26 | Mi Shebeirach — Healing | 49 | `concluding.mi-shebeirach-healing@shabbat-maariv` |  |
| 27 | Aleinu | 50 | `concluding.aleinu@shabbat-maariv` |  |
| 28 | Mourner’s Kaddish | 52 | `concluding.mourners-kaddish@shabbat-maariv` |  |
| 29 | Priestly Blessing | 54 | `concluding.priestly-blessing@shabbat-maariv` |  |
| 30 | Adon Olam | 55 | `concluding.adon-olam@shabbat-maariv` |  |
| 31 | Kiddush | 68 | `seasonal.kiddush@shabbat-maariv` | Erev Shabbat kiddush — weekly at CRC, though the feed files it under seasonal. |

### Not seeded — candidates for Daniel

- `kabbalat.yedid-nefesh` — Opens the feed's Kabbalat Shabbat; crc-friday has no entry for it.
- `kabbalat.psalm-95` — The Kabbalat Shabbat psalm sequence (95-99, 29, 92, 93) is in the feed but absent from crc-friday — CRC may sing an abbreviated Kabbalat Shabbat.
- `kabbalat.psalm-96`
- `kabbalat.psalm-97`
- `kabbalat.psalm-98`
- `kabbalat.psalm-99`
- `kabbalat.psalm-29`
- `kabbalat.psalm-92`
- `kabbalat.psalm-93`
- `kabbalat.ana-bkoach`

### Friday - `crc-friday` (the congregation’s printed siddur)

Generated by `scripts/emit-fixed-liturgy.mjs` from `src/data/books/crc-friday.json`. Order is the feed book's own unit order — not a remembered sequence.

**31 rows.** 5 ambiguous, 5 with no entry in this book, 1 where this book's order disagrees with the feed.

| # | Label | Folio | Unit id | Pagemap match |
|--:|---|--:|---|---|
| 1 | Lighting the Candles | — | — | **no entry in this book** |
| 2 | Shalom Aleichem | 6 | — | exact |
| 3 | L’cha Dodi | 8 | — | exact |
| 4 | Bar’chu | 10 | — | exact |
| 5 | Ma’ariv Aravim | 12 | — | exact |
| 6 | Ahavat Olam | 13 | — | exact |
| 7 | The Sh’ma | — | — | **AMBIGUOUS** — Kriyat Sh'ma p.15 |
| 8 | V’ahavta & Tzitzit | — | — | **AMBIGUOUS** — V'ahavta p.16 |
| 9 | Emet v’Emunah | — | — | **no entry in this book** |
| 10 | Mi Chamocha | 18 | — | exact |
| 11 | Hashkivenu | 20 | — | exact |
| 12 | V’shamru | 21 | — | exact |
| 13 | Chatzi Kaddish | 22 | — | exact |
| 14 | The Silent Amidah | — | — | **AMBIGUOUS** — T'filah p.23 |
| 15 | Avot v’Imahot | 24 | — | exact |
| 16 | G’vurot | 26 | — | exact |
| 17 | K’dushat HaShem | — | — | **no entry in this book** |
| 18 | K’dushat HaYom | 27 | — | exact |
| 19 | Avodah | 28 | — | exact |
| 20 | Modim | 29 | — | exact |
| 21 | Shalom Rav | 30 | — | exact |
| 22 | Elohai N’tzor | 31 | — | exact |
| 23 | Vayechulu | — | — | **no entry in this book** |
| 24 | Me’ein Sheva | — | — | **no entry in this book** |
| 25 | Kaddish Shalem | — | — | **AMBIGUOUS** — Mourner's Kaddish p.41 |
| 26 | Mi Shebeirach — Healing | — | — | **AMBIGUOUS** — Mi Shebeirach p.34 |
| 27 | Aleinu | 38 | — | exact |
| 28 | Mourner’s Kaddish | 41 | — | exact |
| 29 | Priestly Blessing | 45 | — | exact |
| 30 | Adon Olam | 43 | — | exact — **but this book prints it EARLIER than the row above** |
| 31 | Kiddush | 46 | — | exact |

### Needs a ruling

- **Adon Olam** — `crc-friday` prints it at p.43, before the row above it. The two books order this part of the service differently; the proposal follows the feed.
- **The Sh’ma** — no unambiguous entry. Candidates: Kriyat Sh'ma p.15
- **V’ahavta & Tzitzit** — no unambiguous entry. Candidates: V'ahavta p.16
- **The Silent Amidah** — no unambiguous entry. Candidates: T'filah p.23
- **Kaddish Shalem** — no unambiguous entry. Candidates: Mourner's Kaddish p.41
- **Mi Shebeirach — Healing** — no unambiguous entry. Candidates: Mi Shebeirach p.34
- **Lighting the Candles** — this book has no entry. The row clones page-less under `crc-friday` unless a page is supplied.
- **Emet v’Emunah** — this book has no entry. The row clones page-less under `crc-friday` unless a page is supplied.
- **K’dushat HaShem** — this book has no entry. The row clones page-less under `crc-friday` unless a page is supplied.
- **Vayechulu** — this book has no entry. The row clones page-less under `crc-friday` unless a page is supplied.
- **Me’ein Sheva** — this book has no entry. The row clones page-less under `crc-friday` unless a page is supplied.

### Not seeded — candidates for Daniel

- `kabbalat.yedid-nefesh` — Opens the feed's Kabbalat Shabbat; crc-friday has no entry for it.
- `kabbalat.psalm-95` — The Kabbalat Shabbat psalm sequence (95-99, 29, 92, 93) is in the feed but absent from crc-friday — CRC may sing an abbreviated Kabbalat Shabbat.
- `kabbalat.psalm-96`
- `kabbalat.psalm-97`
- `kabbalat.psalm-98`
- `kabbalat.psalm-99`
- `kabbalat.psalm-29`
- `kabbalat.psalm-92`
- `kabbalat.psalm-93`
- `kabbalat.ana-bkoach`

### Saturday - `shabbat-shacharit` (the feed volume)

Generated by `scripts/emit-fixed-liturgy.mjs` from `src/data/books/shabbat-shacharit.json`. Order is the feed book's own unit order — not a remembered sequence.

**46 rows.** Every row carries a stable unit id.

| # | Label | Folio | Unit id | Pagemap match |
|--:|---|--:|---|---|
| 1 | Modeh Ani | 2 | `awakening.modeh-ani@shabbat-shacharit` |  |
| 2 | Mah Tovu | 2 | `awakening.mah-tovu@shabbat-shacharit` |  |
| 3 | Elohai N’shamah | 4 | `awakening.elohai-nshamah@shabbat-shacharit` |  |
| 4 | Birchot HaShachar | 5 | `awakening.birchot-hashachar@shabbat-shacharit` |  |
| 5 | Eilu D’varim | 10 | `awakening.eilu-dvarim@shabbat-shacharit` |  |
| 6 | Hareini | 11 | `awakening.hareini@shabbat-shacharit` |  |
| 7 | Hineh Mah Tov | 12 | `awakening.hineh-mah-tov@shabbat-shacharit` |  |
| 8 | Lev Tahor | 13 | `awakening.tahor-lev@shabbat-shacharit` |  |
| 9 | Hodu | 13 | `awakening.hodu@shabbat-shacharit` |  |
| 10 | Ashrei | 18 | `psukei.ashrei@shabbat-shacharit` |  |
| 11 | Psalm 150 | 22 | `psukei.psalm-150@shabbat-shacharit` |  |
| 12 | Nishmat Kol Chai | 23 | `psukei.nishmat-kol-chai@shabbat-shacharit` |  |
| 13 | Chatzi Kaddish | 28 | `psukei.chatzi-kaddish@shabbat-shacharit` |  |
| 14 | Bar’chu | 29 | `shma.barchu@shabbat-shacharit` |  |
| 15 | Yotzer Or | 30 | `shma.yotzer-or@shabbat-shacharit` |  |
| 16 | Ahavah Rabbah | 37 | `shma.ahavah-rabbah@shabbat-shacharit` |  |
| 17 | The Sh’ma | 39 | `shma.the-shma@shabbat-shacharit` |  |
| 18 | V’ahavta & Tzitzit | 39 | `shma.vahavta-tzitzit@shabbat-shacharit` |  |
| 19 | Emet v’Yatziv | 43 | `shma.emet-vyatziv@shabbat-shacharit` |  |
| 20 | Mi Chamocha | 44 | `shma.mi-chamocha@shabbat-shacharit` |  |
| 21 | Avot v’Imahot | 49 | `amidah.avot-vimahot@shabbat-maariv` |  |
| 22 | G’vurot | 50 | `amidah.gvurot@shabbat-maariv` |  |
| 23 | Kedushah | 51 | `amidah.kedushah@shabbat-shacharit` |  |
| 24 | K’dushat HaYom | 54 | `amidah.kdushat-hayom@shabbat-shacharit` |  |
| 25 | Avodah | 56 | `amidah.avodah@shabbat-maariv` |  |
| 26 | Modim | 57 | `amidah.modim@shabbat-maariv` |  |
| 27 | Birkat Kohanim | 59 | `amidah.birkat-kohanim@shabbat-shacharit` |  |
| 28 | Sim Shalom | 61 | `amidah.sim-shalom@shabbat-shacharit` |  |
| 29 | Elohai N’tzor | 62 | `amidah.elohai-ntzor@shabbat-maariv` |  |
| 30 | Ein Kamocha | 65 | `torah.ein-kamocha@shabbat-shacharit` |  |
| 31 | Sh’ma | 69 | `torah.shma-procession-call@shabbat-shacharit` |  |
| 32 | L’cha Adonai HaGedulah | 70 | `torah.lcha-adonai-hagedulah@shabbat-shacharit` |  |
| 33 | Blessing Before the Torah | 71 | `torah.blessing-before-the-torah@shabbat-shacharit` |  |
| 34 | Blessing After the Torah | 71 | `torah.blessing-after-the-torah@shabbat-shacharit` |  |
| 35 | Mi Shebeirach — Healing | 72 | `torah.mi-shebeirach-healing@shabbat-shacharit` |  |
| 36 | V’zot HaTorah | 73 | `torah.vzot-hatorah@shabbat-shacharit` |  |
| 37 | Haftarah Blessing | 74 | `torah.blessing-before-the-haftarah@shabbat-shacharit` |  |
| 38 | Blessings After the Haftarah | 75 | `torah.blessings-after-the-haftarah@shabbat-shacharit` |  |
| 39 | Y’halelu | 79 | `torah.yhalelu@shabbat-shacharit` |  |
| 40 | Eitz Chayim | 81 | `torah.eitz-chayim@shabbat-shacharit` |  |
| 41 | Ein Keloheinu | 84 | `concluding.ein-keloheinu@shabbat-shacharit` |  |
| 42 | Aleinu | 86 | `concluding.aleinu@shabbat-maariv` |  |
| 43 | Mourner’s Kaddish | 89 | `concluding.mourners-kaddish@shabbat-maariv` |  |
| 44 | Kaddish Shalem | 91 | `concluding.kaddish-shalem@shabbat-maariv` |  |
| 45 | Birkat Kohanim | 93 | `concluding.birkat-kohanim@shabbat-shacharit` |  |
| 46 | Adon Olam | 94 | `concluding.adon-olam@shabbat-maariv` |  |

### Not seeded — candidates for Daniel

- `awakening.asher-yatzar` — In the feed's morning blessings; no crc-saturday entry.
- `awakening.birkot-hatorah` — Name-matches crc-saturday p.84 ('Blessings Before the Torah Reading'), but the feed files it at p.9 among the morning blessings — a DIFFERENT moment with the same name. Do not adopt the page match.
- `psukei.baruch-sheamar`
- `psukei.psalm-91`
- `psukei.psalm-92`
- `psukei.shochein-ad`
- `psukei.yishtabach`
- `amidah.we-open-our-lips`
- `torah.vayhi-binsoa`
- `torah.av-harachamim`
- `torah.birkat-hagomel` — Occasional — said when someone has a deliverance to mark.
- `torah.el-na-rfa-na`
- `torah.blessing-the-new-month` — Monthly, not weekly.
- `torah.psalm-29`
- `concluding.yigdal`

### Saturday - `crc-saturday` (the congregation’s printed siddur)

Generated by `scripts/emit-fixed-liturgy.mjs` from `src/data/books/crc-saturday.json`. Order is the feed book's own unit order — not a remembered sequence.

**46 rows.** 8 ambiguous, 9 with no entry in this book, 6 where this book's order disagrees with the feed.

| # | Label | Folio | Unit id | Pagemap match |
|--:|---|--:|---|---|
| 1 | Modeh Ani | 51 | — | exact |
| 2 | Mah Tovu | 52 | — | exact |
| 3 | Elohai N’shamah | 51 | — | exact — **but this book prints it EARLIER than the row above** |
| 4 | Birchot HaShachar | 53 | — | exact |
| 5 | Eilu D’varim | 57 | — | exact |
| 6 | Hareini | 50 | — | exact — **but this book prints it EARLIER than the row above** |
| 7 | Hineh Mah Tov | 53 | — | exact |
| 8 | Lev Tahor | 51 | — | exact — **but this book prints it EARLIER than the row above** |
| 9 | Hodu | — | — | **AMBIGUOUS** — Hodu L'Adonai p.54 |
| 10 | Ashrei | — | — | **no entry in this book** |
| 11 | Psalm 150 | 56 | — | exact |
| 12 | Nishmat Kol Chai | — | — | **AMBIGUOUS** — Kriyat Sh'ma p.63 |
| 13 | Chatzi Kaddish | 58 | — | exact |
| 14 | Bar’chu | 59 | — | exact |
| 15 | Yotzer Or | 60 | — | exact |
| 16 | Ahavah Rabbah | — | — | **no entry in this book** |
| 17 | The Sh’ma | — | — | **AMBIGUOUS** — Kriyat Sh'ma p.63 |
| 18 | V’ahavta & Tzitzit | — | — | **AMBIGUOUS** — V'ahavta p.65 |
| 19 | Emet v’Yatziv | 67 | — | exact |
| 20 | Mi Chamocha | 68 | — | exact |
| 21 | Avot v’Imahot | 71 | — | exact |
| 22 | G’vurot | 73 | — | exact |
| 23 | Kedushah | 74 | — | exact |
| 24 | K’dushat HaYom | — | — | **no entry in this book** |
| 25 | Avodah | 77 | — | exact |
| 26 | Modim | 78 | — | exact |
| 27 | Birkat Kohanim | 100 | — | exact |
| 28 | Sim Shalom | 79 | — | exact — **but this book prints it EARLIER than the row above** |
| 29 | Elohai N’tzor | 80 | — | exact |
| 30 | Ein Kamocha | — | — | **no entry in this book** |
| 31 | Sh’ma | 63 | — | exact — **but this book prints it EARLIER than the row above** |
| 32 | L’cha Adonai HaGedulah | — | — | **no entry in this book** |
| 33 | Blessing Before the Torah | — | — | **no entry in this book** |
| 34 | Blessing After the Torah | — | — | **no entry in this book** |
| 35 | Mi Shebeirach — Healing | — | — | **AMBIGUOUS** — Mi Shebeirach p.86 |
| 36 | V’zot HaTorah | 84 | — | exact |
| 37 | Haftarah Blessing | — | — | **AMBIGUOUS** — Blessings Before the Haftarah Reading p.88; Reading of the Haftarah p.89; Blessings Following the Haftarah Reading p.89 |
| 38 | Blessings After the Haftarah | — | — | **AMBIGUOUS** — Reading of the Haftarah p.89 |
| 39 | Y’halelu | — | — | **no entry in this book** |
| 40 | Eitz Chayim | 90 | — | exact |
| 41 | Ein Keloheinu | — | — | **no entry in this book** |
| 42 | Aleinu | 93 | — | exact |
| 43 | Mourner’s Kaddish | 96 | — | exact |
| 44 | Kaddish Shalem | — | — | **AMBIGUOUS** — Mourner's Kaddish p.96 |
| 45 | Birkat Kohanim | 100 | — | exact |
| 46 | Adon Olam | 98 | — | exact — **but this book prints it EARLIER than the row above** |

### Needs a ruling

- **Elohai N’shamah** — `crc-saturday` prints it at p.51, before the row above it. The two books order this part of the service differently; the proposal follows the feed.
- **Hareini** — `crc-saturday` prints it at p.50, before the row above it. The two books order this part of the service differently; the proposal follows the feed.
- **Lev Tahor** — `crc-saturday` prints it at p.51, before the row above it. The two books order this part of the service differently; the proposal follows the feed.
- **Sim Shalom** — `crc-saturday` prints it at p.79, before the row above it. The two books order this part of the service differently; the proposal follows the feed.
- **Sh’ma** — `crc-saturday` prints it at p.63, before the row above it. The two books order this part of the service differently; the proposal follows the feed.
- **Adon Olam** — `crc-saturday` prints it at p.98, before the row above it. The two books order this part of the service differently; the proposal follows the feed.
- **Hodu** — no unambiguous entry. Candidates: Hodu L'Adonai p.54
- **Nishmat Kol Chai** — no unambiguous entry. Candidates: Kriyat Sh'ma p.63
- **The Sh’ma** — no unambiguous entry. Candidates: Kriyat Sh'ma p.63
- **V’ahavta & Tzitzit** — no unambiguous entry. Candidates: V'ahavta p.65
- **Mi Shebeirach — Healing** — no unambiguous entry. Candidates: Mi Shebeirach p.86
- **Haftarah Blessing** — no unambiguous entry. Candidates: Blessings Before the Haftarah Reading p.88; Reading of the Haftarah p.89; Blessings Following the Haftarah Reading p.89
- **Blessings After the Haftarah** — no unambiguous entry. Candidates: Reading of the Haftarah p.89
- **Kaddish Shalem** — no unambiguous entry. Candidates: Mourner's Kaddish p.96
- **Ashrei** — this book has no entry. The row clones page-less under `crc-saturday` unless a page is supplied.
- **Ahavah Rabbah** — this book has no entry. The row clones page-less under `crc-saturday` unless a page is supplied.
- **K’dushat HaYom** — this book has no entry. The row clones page-less under `crc-saturday` unless a page is supplied.
- **Ein Kamocha** — this book has no entry. The row clones page-less under `crc-saturday` unless a page is supplied.
- **L’cha Adonai HaGedulah** — this book has no entry. The row clones page-less under `crc-saturday` unless a page is supplied.
- **Blessing Before the Torah** — this book has no entry. The row clones page-less under `crc-saturday` unless a page is supplied.
- **Blessing After the Torah** — this book has no entry. The row clones page-less under `crc-saturday` unless a page is supplied.
- **Y’halelu** — this book has no entry. The row clones page-less under `crc-saturday` unless a page is supplied.
- **Ein Keloheinu** — this book has no entry. The row clones page-less under `crc-saturday` unless a page is supplied.

### Not seeded — candidates for Daniel

- `awakening.asher-yatzar` — In the feed's morning blessings; no crc-saturday entry.
- `awakening.birkot-hatorah` — Name-matches crc-saturday p.84 ('Blessings Before the Torah Reading'), but the feed files it at p.9 among the morning blessings — a DIFFERENT moment with the same name. Do not adopt the page match.
- `psukei.baruch-sheamar`
- `psukei.psalm-91`
- `psukei.psalm-92`
- `psukei.shochein-ad`
- `psukei.yishtabach`
- `amidah.we-open-our-lips`
- `torah.vayhi-binsoa`
- `torah.av-harachamim`
- `torah.birkat-hagomel` — Occasional — said when someone has a deliverance to mark.
- `torah.el-na-rfa-na`
- `torah.blessing-the-new-month` — Monthly, not weekly.
- `torah.psalm-29`
- `concluding.yigdal`

---

## Part B — `today.json` — DONE, deployed and verified

Commits `2766783f10` (B-W1), `d1b558d8cf` (B-W2), `13b7133efc` (B-W3),
`c59388073e` (the proxy fix below). Production is on `093c6928fc`.

### B-W1 — emitter, route, rewrite, guard

Split in two on purpose: `src/lib/today/build-today.ts` is PURE (setlists +
config + `now` in, document out) and `src/lib/today/emit-today.ts` does the
Firestore read and the Storage write. That split is what makes the
forbidden-key guard real — it builds a document from a setlist deliberately
contaminated with `tracks`, `fileId`, `fileName`, `notes`, `songId`,
`musicians`, `publishedSnapshot` and a line of Hebrew, then walks the result
for any of them. A service-key ALLOW-LIST sits beside it, so a new public field
has to be added on purpose, which is the moment to ask whether it may be
public.

Decisions worth your eye:

- **No time anywhere → no `startsAt` at all.** A date with no start time is
  honest; a guessed midnight is not, and the reader omits what is absent.
- **The event window is a CHICAGO day.** A Friday service at 21:30 Chicago has
  a UTC date of Saturday and would otherwise fall out of "today".
- **DST goes through the existing converter.** `parseEventDate`'s
  `chicagoWallClockToUtcMs` is now exported rather than copied: 18:00 Chicago is
  23:00Z in September and 00:00Z in December, with a test for each. A second
  copy of that arithmetic is how the 5am-service bug got in.

### B-W2 — config, and **the one thing I need from you**

The congregation doc had a name, a logo and a rabbi roster but no notion of
when anything begins. Added `services[<templateType>].defaultStartLocal`
(`HH:mm`, America/Chicago wall clock) and `stream.url` + `leadMinutes`
(default 5). `update_congregation_services` writes them — admin only, `dryRun`
defaults TRUE with a before/after diff.

**Nothing is seeded, and only you know the values.** Verified live just now:
`get_congregation_context` returns `services: null, stream: null`. Until you
set them, `today.json` emits services with no start time — correct, but the
reader and the overlays get less than they could.

One call, then the same call with `dryRun: false`:

```
update_congregation_services({
  services: {
    "friday_night":       { label: "Erev Shabbat",    defaultStartLocal: "18:00" },
    "shabbat_morning":    { label: "Shabbat Morning", defaultStartLocal: "10:00" }
  },
  stream: { url: "https://<the stream URL>" }
})
```

**Read the keys carefully before you run it.** They are the setlist's own
`templateType`, and the live ones are NOT all underscored — the Sept 21
setlists carry `yom-kippur-morning`, `neilah` and `yizkor`, hyphenated. Give me
the real times and I will run it, or run it yourself.

`Setlist.startsAtLocal` (new, via `update_setlist`) overrides the default for
one unusual service.

### B-W3 — triggers

Both publish paths regenerate the document after their write commits, **awaited
rather than fire-and-forget** — on Vercel serverless a floating promise can be
frozen the instant the handler returns, so "fire-and-forget" there means
"sometimes never runs". `emitToday` never throws, so awaiting it cannot fail a
publish. Daily cron `/api/cron/emit-today` at 10:00 UTC catches a week rolling
off or a setlist being deleted.

**Finding.** The plan said to use "the same double-start guard the repo uses
(grep `concurrency` in the drive-sync route)". There is no such guard — no cron
route in this repo takes a lock; they all rely on their work being idempotent.
I wrote a small one (`cronLocks/emit-today`) and made it deliberately soft:
emitting twice writes identical bytes to the same object, so it is a COST
guard, not a correctness one. A stale lock expires after five minutes, and a
lock read that FAILS lets the run proceed — losing a day's regeneration would
be worse than a duplicate write.

### The deploy caught a defect the suite could not

`/today.json` in production **307'd to `/login`**. The `vercel.json` rewrite to
`/api/today` runs AFTER the auth proxy, so while the path sat inside the
proxy's matcher every anonymous fetch was bounced — and both consumers would
have silently fallen back to their own calendars, with no error anywhere to
see. `/api/today` itself was fine throughout; only the documented public path
was broken. Fixed by excluding `today.json` from the proxy matcher, exactly as
`manifest.json` already is, with three regression tests including one that
fails if the source literal uses a single-backslash `today\.json` (that
collapses to an unescaped `.` and would quietly exclude any `/todayXjson`
sibling).

### Verified against production, after deploy

```
GET /api/version   → sha 093c6928fc…
GET /today.json    → 404 {"error":"not_found"}   X-Matched-Path: /api/today
                     Access-Control-Allow-Origin: *
                     Cache-Control: public, max-age=60   (Vercel consumed
                     s-maxage + stale-while-revalidate into its CDN layer —
                     X-Vercel-Cache confirms it, working as intended)
OPTIONS /api/today → 204, CORS GET/OPTIONS
list_books         → 6 books, shirei-tshuvah 184 / feed
get_congregation_context → services: null, stream: null (B-W2 surface live)
```

A 404 before the first publish is the designed state; both consumers treat an
absent file as "fall back to the calendar".

---

## Part C — CHARTS-001 — C-W1 done, **C-W2/C-W3 BLOCKED, needs your call**

I ran the discovery before touching anything, and the plan's premise does not
hold.

**1. The anonymous chart endpoint is NOT deployed.** `[measured]`

```
GET https://www.centralreform.live/api/reader/music/select  → 404
GET https://www.centralreform.live/api/reader/music/chart   → 404
```

**2. The task file's SHA claim is wrong.** `CHARTS-001.json` says "production
SHA `4e2114f7` carries a reviewed Modeh-only anonymous chart endpoint".
`4e2114f7f6` is the TIP OF AN UNMERGED BRANCH, `codex/reliability-batch-20260906`
(local and `origin` agree). `git merge-base --is-ancestor` says **NO** for all
four named commits (`4e2114f7`, `a5867c93`, `6dfe36ef`, `9168cbd`) against
`master`, and production runs `master`. The repo is not shallow, so those
ancestry answers are trustworthy.

**3. The branch is 8 ahead / 46 behind `master`,** merge-base `3c0ba41e5c`.
Three files changed on BOTH sides since then — `.env.example`,
`firestore.rules`, `src/types/models.ts` — so this is a real merge with likely
conflicts in the rules file, not a fast-forward.

**4. The design already satisfies ruling #6.** From the branch's own
`docs/READER-PUBLIC-CHART-BOUNDARY.md` and `src/lib/reader-music-public.ts`,
bytes require ALL THREE of:

- `READER_PUBLIC_CHARTS_ENABLED=true` (env, default false);
- a frozen CODE allowlist — `MODEH_ANI_PUBLIC_READER_CHART`, unit
  `awakening.modeh-ani@legacy-shabbat-morning`, piece `modeh-ani.halpert`, org
  `crc`, `application/pdf` only;
- `publicReaderStatus: "approved"` **plus a complete pinned
  `publicReaderManifest`** (songId, fileId, storagePath, exact GCS generation,
  sha256, sizeBytes, contentType) on that one `reader_music_crosswalk`
  document.

Approval is re-read on every fetch, every response is `no-store`, and
revocation is deleting `publicReaderStatus`. **That is already an explicit,
revocable, server-side grant** — exactly what the ruling requires.

So **C-W2's proposed new `chart_grant` credential kind is redundant, and I have
not built it.** The plan allows this in its own words: "whichever C-W1 shows the
endpoint already expects, keep — the ruling only requires that bytes never flow
without an explicit, revocable, server-side grant/approval." A second grant
mechanism beside a reviewed one would weaken the boundary, not strengthen it.

Env the branch introduces: `READER_PUBLIC_CHARTS_ENABLED` (default false) and
`READER_MUSIC_ALLOWED_ORIGINS`. Production serving also needs the Upstash pair
(already on `master`'s `.env.example`) and Vercel's platform IP header; the
branch adds `src/lib/reader-public-rate-limit.ts`.

### Why I stopped here

C-W3 says "flip the kill switch on production and verify select → 200". There
is no switch in production, because the code is not there. Getting there means
merging an eight-commit security branch that another lane authored, that is 46
commits stale, that conflicts in `firestore.rules`, and then turning on
anonymous public delivery of third-party sheet-music bytes.

Everything else in this plan I merged and deployed on my own authority. This
one I am asking about, for three reasons: it is someone else's reviewed work,
not mine; `firestore.rules` conflicts are the kind that silently widen access;
and the boundary doc is explicit that **bytes already delivered cannot be
revoked**.

### Three options

1. **Land it, switch OFF.** I merge the branch, resolve the three conflicts
   (the rules file with care), run the full gate, and deploy with
   `READER_PUBLIC_CHARTS_ENABLED` still false. Nothing becomes public; the
   switch simply exists. Approving Modeh then becomes a separate, deliberate
   act.
2. **Land it and turn it on for Modeh** — the above, then compute the manifest
   from the exact reviewed Storage generation, write the approval with its
   update-time precondition, set the flag true, redeploy, and verify
   select / chart / CORS / 404-for-anything-else.
3. **Leave it parked** and I record CHARTS-001 as blocked-on-merge.

I recommend **(1)**: it makes the capability real and reviewable without
publishing a byte, and it separates "the code is deployed" from "the chart is
public" — which is the separation the boundary doc itself asks for.

I have NOT edited `C:\Users\dsbog\shireishabbat\ops\tasks\CHARTS-001.json`. Its
`status` and evidence lines depend on which option you pick, and its current
SHA claim is one of the findings above.

---

## Part E — moments consumer — DONE (code), data blocked upstream

Commit `a0d17bdb05`.

A unit id is book-local — `shma.mi-chamocha@shabbat-maariv` names Mi Chamocha
*in the Friday-night volume*. A MOMENT is the prayer itself, gathering every
book that prints it. That join is what will let a setlist row survive a change
of book (A-W4): the row that read p.28 in `shabbat-maariv` finds p.61 in
`shirei-tshuvah` with nobody re-typing a folio.

- `scripts/sync-books.mjs` gains `trimMoments` (pure, exported for tests) and a
  `syncMoments` step. It keeps `{id, display.en, kind, aliases, occurrences:[{
  book, unitId, folios}]}` — ids, names and pages only. The producer's
  `section.en`, `service`, `caption` and `foliosAre` are dropped, and a test
  walks the RESULT for Hebrew rather than trusting the trim.
- `src/lib/books/moments.ts` — `momentForUnit`, `momentIdForUnit`, `getMoment`,
  `occurrencesForMoment`, `momentsLoaded`.
- `lookup_book_page` now carries `momentId` on feed-tier matches.

**The pin guard.** Consuming a moments file built from a different commit than
the feeds this repo's page numbers came from would pair one build's folios with
another build's unit ids, silently and permanently. So every VOLUMES book's pin
must equal the `gitSha` the artifact recorded, or the step refuses and writes
nothing. Both sides are normalised past `-LICENSED` so the guard cannot
false-alarm over a marker present on one side only.

`src/data/books/moments.json` ships EMPTY on purpose — a static import must
always resolve — and a test pins that `lookup_book_page` still returns pages
with no moments file. The moment layer is additive and must never cost a page
number.

**Two findings, both blocking the DATA, not this code:**

1. `dist-app/moments.json` is absent. The producer shipped (shireishabbat
   `build/tools/emit_moments.py` — 344 moments / 740 occurrences / 13 books per
   its own RETURN), but the artifact is gitignored there; it needs a
   `build/build-app.sh` run.
2. **`dist-app/`'s feeds are built from `7d2cbcc+dirty-LICENSED`, not the
   pinned `6f61874-LICENSED`.** `npm run sync:books` ALREADY refuses on that —
   pre-existing, unchanged by my commit, and I verified it against the
   unmodified script before touching it. Until that build is redone at the
   press commit, neither the books nor the moments can be re-synced here.

Not in scope, as the plan says: L3 chart binding (`moments[]` on library rows),
which waits on your alias batches.

---

## Part D — "as performed" — DONE except the browser button

Commits `dc71328d4d` (D-W1 + D-W2), `093c6928fc` (D-W3).

Built fixture-first, as the plan asks: Overlays' `GET /api/history` ships from
another plan, so the fixture is hand-written from the REAL RH Day 2 service
(`2b2cc0f5…`, `crc-machzor-2008`) and every book/folio in it is a page that
setlist actually carries.

**The engine's one real decision is when it is allowed to say "skipped".** At
CRC most of what the band plays produces no graphic — band-only songs, headers,
whole stretches of a machzor nobody has cued. A naive diff paints an ordinary
Shabbat morning red and teaches everyone to ignore it. So:

- `skipped` only when the row has a printed page AND the service demonstrably
  ran through that stretch (a performed row before it and after it);
- headers and notes are never skipped — they do not fire — and like band-only
  songs they inherit `performed` when bracketed;
- everything else is `untracked`, which is a statement about the cue log, not
  about the service. An EMPTY history yields zero skipped and every row
  untracked, and there is a test for exactly that.

Matching is `momentId` → `(book, folio)` → title fold. The page tie is real: on
RH Day 2 the "Awakening" header, Modeh Ani and Mah Tovu are all p.39, so a
header never wins that tie. `reordered` flags BOTH sides of a swap — a running
high-water mark blames whichever row happened to come second, which reads as an
accusation rather than a description.

`reconcile_service({setlistId, dryRun})` stages by default. `dryRun:false`
promotes by CLONING, so the plan is never opened for writing; on the clone,
skipped rows are deleted, `performedAt` is stamped, audibles are spliced in,
and `order` is renumbered so it reads as the service ran. The emulator test
snapshots the planned setlist and all its tracks before promoting and asserts
they are byte-identical after.

The tool's description spends most of its length telling the reading agent not
to report `untracked` as "skipped" or "missing".

Chapters: `mm:ss  Title` from the first cue (`h:mm:ss` past the hour), with the
offset field you type in, never negative.

Env: `OVERLAYS_BASE_URL` + `OVERLAYS_HISTORY_TOKEN` (sensitive — never logged,
never echoed into an error, never returned). Without them the tool refuses
cleanly and writes nothing. **Neither is set**, so the tool is dark until the
cue log exists.

**NOT BUILT, deliberately: the "Reconcile with the stream" button on the
setlist page.** Overlays' history endpoint does not exist, so the button would
be a dead control on the band's surface; and a frontend phase here has to go
through the ui-ux gate rather than be tacked onto a backend commit. It should
land with that gate once the cue log is live. This is the one item of the plan
I have not delivered, and I would rather say so than ship a button that does
nothing.

---

## Gate — everything below is measured, not asserted

Run at `093c6928fc`, the commit now in production:

| gate | result |
|---|---|
| `npm run test:gated -- --reporter=dot` | **4369 passed, 0 failed, 69 skipped** (379 files) |
| `ci/gated-suite-exclusions.txt` | **unchanged** — zero lines of diff against `master`. No wave added an exclusion. |
| `npm run test:emulator` | **92 files passed** |
| `rm -rf .next && next build --webpack` | compiled successfully; `/api/today` and `/api/cron/emit-today` in the route manifest |
| `npx tsc --noEmit` | clean |

Known pre-existing red, untouched: `src/lib/books/__tests__/registry.test.ts`
(2 tests) — `seasonal.shehecheyanu@shabbat-shacharit` carries folio **145**
against a declared `pages: 144`. It is one of the two entries already on the
gated exclusion list, with its own owner, and I confirmed it fails identically
on `master` without my changes. **It will bite A-W3**: Shehecheyanu cannot be
given a validated `liturgyRef` in `shabbat-shacharit` until that folio is
answered from a printed page.

## Hygiene — my own mistake, recorded

My first commit used `git add -A` and swept in 42 `.playwright-mcp/` page
snapshots plus three untracked `docs/` files (`BRAND-DOSSIER.md`,
`brand-assets/`, one artifacts PDF) that were untracked before this session
started — 12,278 lines of debug artifacts that are not mine. I rebuilt the
branch without them before merging (the merged branch is 38 files, all mine),
verified the rebuilt tree differs from the dirty one by exactly those files and
nothing else, and added `.playwright-mcp/` to `.gitignore`. The three `docs/`
files are still untracked, exactly as I found them. **Nothing was lost.**

## What is waiting on you

1. **A-W2** — the four fixed-liturgy tables above. Order, plus the AMBIGUOUS /
   no-entry / order-disagreement rulings. A-W3…A-W6 are held on this.
2. **Part C** — options 1, 2 or 3. I recommend 1.
3. **B-W2** — the real service times and the stream URL, so `today.json` can
   say what time tonight is.

---

# Continuation — the 2026-09-15 sitting (HANDOFF-CODE-CONTINUATION-2026-09-15 §1)

Branch `claude/integration-2026-09-14`, merged to `master` and deployed. Waves
in the order the handoff set them: HHD check, the folio-145 red, then — after
your mid-session stop — straight to Part C.

**Part A is stopped after A-W1 on your instruction.** A-W3 was in flight when
the stop arrived (a data module over the four confirmed files, and a merge that
interleaved the confirmed rows with the template's song slots). It is reverted,
not committed, and nothing in `src/lib/liturgical-templates.ts` changed.
`HANDOFF-CODE-LIVE-BIND-NOT-ADD-2026-09-15.md` is **not on disk yet** — I looked
for it at the repo root and across the tree. I have not read it, so nothing here
is built against it. The confirmed files
(`src/data/templates/fixed-liturgy.*.json`) and
`work/fixed-liturgy-rulings-2026-09-15.json` are still untracked, exactly as you
left them.

## §1 step 0 — the HHD check

`[measured]` 2026-09-15T01:55Z, live production MCP plus the pure emitter.

**The finding that matters: `/today.json` will emit NOTHING on the 20th or the
21st, because none of the five Yom Kippur setlists is published.**

```
GET https://www.centralreform.live/today.json  ->  404 {"error":"not_found"}
```

All five exist, all five carry `publishedAt: null`, and the emitter selects on
`publishedAt` by design (unpublished setlists are never read). Measured through
`get_setlist` on production:

| setlist | `book` | `templateType` | `eventDate` | `publishedAt` | rows w/ `liturgyRef` |
|---|---|---|---|---|---|
| Kol Nidre — September 20 | `crc-machzor-2008` | `kol-nidre` | 2026-09-20 | **null** | 23 / 28 |
| Kol Nidre Alternative Service — September 20 | `crc-machzor-2008` | `kol-nidre-alt` | 2026-09-20 | **null** | 0 / 23 |
| Yom Kippur Morning — September 21 | `crc-machzor-2008` | `yom-kippur-morning` | 2026-09-21 | **null** | 30 / 35 |
| Yizkor — September 21 | `crc-machzor-2008` | `yizkor` | 2026-09-21 | **null** | 0 / 8 |
| Neilah — September 21 | `crc-machzor-2008` | `neilah` | 2026-09-21 | **null** | 0 / 24 |

**On Ruling 8 the answer is clean: every one of the five names the legacy
machzor. Not one names a Shabbat draft.** There is no path by which
`shabbat-maariv` or `shabbat-shacharit` could reach `today.json` this week —
`book` is copied from the setlist, and the setlist says `crc-machzor-2008`.

**B-W2's times are in production and correct.** `get_congregation_context`
returns all eleven service rows, including Kol Nidre 20:00, alt Kol Nidre 17:00,
YK morning 10:00, Yizkor 17:00, Neilah 17:00 America/Chicago, and the stream
`https://www.youtube.com/@CentralReformCongregation/live` with `leadMinutes: 5`.

So I ran the emitter against the five measured setlists to show exactly what it
*would* say the moment you publish them — the same pure `buildTodayDoc`
production calls, `now` = 2026-09-20T18:00Z:

```
kol-nidre-alt   startsAt 2026-09-20T22:00:00Z  (17:00 CDT)  book crc-machzor-2008
kol-nidre       startsAt 2026-09-21T01:00:00Z  (20:00 CDT)  book crc-machzor-2008  startFolio 96
yk-morning      startsAt 2026-09-21T15:00:00Z  (10:00 CDT)  book crc-machzor-2008  startFolio 129
yizkor          startsAt 2026-09-21T22:00:00Z  (17:00 CDT)  book crc-machzor-2008
neilah          startsAt 2026-09-21T22:00:00Z  (17:00 CDT)  book crc-machzor-2008
```

Ordering is right (the early alt service before Kol Nidre), the stream rides
each one five minutes early, and no draft folio appears anywhere. **Publishing
those five is yours to do** — A-W6 says no auto-publish anywhere, and I have not
published a thing. Until you do, the reader and Overlays get a 404 from
`today.json` and fall back to their own dated-book / calendar path, which under
Ruling 8 is the legacy machzor. A safe failure, not a broken one.

One nuance worth having on the record: `crc-machzor-2008`'s registry row says
the pagemap covers Rosh Hashanah morning (folios 38–92) plus Adon Olam, and
deliberately leaves the rest of the volume unmapped. The Kol Nidre and
YK-morning rows carry folios 96–132 in that book, hand-authored rather than
looked up. They validate (the book is 215 pages) and they are legacy-booklet
pages, which is what Ruling 8 asks for — but nothing has checked them against
the scan. Not a blocker; something you may want spot-read against a printed copy
before the 20th.

## §1 step 1 — the folio-145 red — FIXED, and it left the exclusion list

Commit `d909707edb`.

`seasonal.shehecheyanu@shabbat-shacharit` sits on folio 145 against a declared
`pages: 144`. Two tests red since R-0904-live-cw-21, held on the exclusion list
pending "a PRINTED page". **Ruling 8 says that page is never coming** —
`shabbat-shacharit` is an alpha draft. So the number is answered from the build
instead, measured:

- `src/data/books/shabbat-shacharit.json` was trimmed from shireishabbat
  `dist/shabbat-shacharit-feed.json` @`8ab7be6`. **0 of 94 unit rows differ.**
- That build's screen PDF is **153 physical pages**, and every folio/phys pair
  in the feed carries a **constant offset of 7** (141 pairs, one offset). Last
  folio = 153 − 7 = **146**.
- The recorded 144 is 151 − 7 — the figure belonging to the **`dist-app`
  7d2cbcc+dirty** build, whose units differ from this snapshot in **59 of 94
  rows**. Mixed provenance: units from one build, page count from another, and
  the snapshot's own last unit fell outside it.

The same method checks out on the other two feed volumes — `shabbat-maariv`
75 − 6 = 69, `shirei-tshuvah` 188 − 4 = 184 — both matching what
`registry.json` already records. That is what makes 146 a measurement rather
than a preference.

`registry.json` now reads 146 with the provenance written into its `source`
string. `registry.test.ts` is **23/23 green** and is **off**
`ci/gated-suite-exclusions.txt`; the remove-only guard reports *"removed
(allowed) … 2 entries before, 1 after"*. Only `sync-engine-songs-mirror.test.ts`
remains on the list.

Two findings from the same dig, neither in scope, both recorded so they are not
lost:

1. **`npm run sync:books` cannot currently regenerate either Shabbat volume.**
   `dist-app/`'s feeds are built from `7d2cbcc+dirty-LICENSED` against a pin of
   `6f61874-LICENSED`, so the pin guard refuses — correctly. This is the same
   rebuild §2 asks shireishabbat for. When it lands, `pages` for
   `shabbat-shacharit` must be **re-recorded by hand** from the new build; the
   script asserts that number, it never computes it.
2. **`shirei-tshuvah.json` is four rows behind its own pinned carrier.**
   `torah.torah-reading-day-1@rh1` carries `[97]` where `dist-app` @`21417d9`
   has `[97,98,99,100]`; likewise the day-2 reading and both haftarot. Only
   interior pages of multi-page readings are missing — first and last folio are
   right in every case — so no lookup resolves wrongly today. Still a divergence
   from the press pin on a PRINTED volume, which is the one book where that
   matters.

## Part C — option 1, landed and deployed, switch OFF

Merge commit `b94b55e8d4`, then `6194c8040d`. Both on `master`.

**The conflict count was one, not three.** `firestore.rules` and
`src/types/models.ts` auto-merged cleanly — the two sides had touched different
regions of each file. Only `.env.example` collided, where both sides appended a
block to the same tail. Resolved by keeping **both**: master's batch-intake and
overlays-history blocks, and the branch's `READER_PUBLIC_CHARTS_ENABLED=false` /
`READER_MUSIC_ALLOWED_ORIGINS`. Nothing was dropped from either side.

### firestore.rules — every changed rule, and which way it moves

You asked for this one with care. There are three changes in the merged file and
**none of them widens access.**

| change | direction | what it actually does |
|---|---|---|
| NEW `callerCanWriteExistingOrg()` | — | Checks the **existing** doc's `orgId` against the caller's orgs; unstamped legacy rows read as `crc` (the established claimless-CRC default); admin exempt. A helper only — it grants nothing by itself. |
| `tracks` **update** `+ && callerCanWriteExistingOrg()` | **NARROWS** | `orgUpdateOk()` only constrains the **incoming** orgId, so a band leader of another tenant could edit a CRC track as long as they left the marker alone. Closed. |
| `tracks` **delete** `+ && callerCanWriteExistingOrg()` | **NARROWS** | The wider of the two: delete carried **no org predicate at all**. Any band leader of any tenant could delete any track. Closed. |
| `upload_batches` (master's side) | unchanged | Still `read, write: if false`. |

Verified by diffing the merge result against **both** parents: against `master`
it is exactly the two narrowings above; against the branch it is exactly
master's `upload_batches` block. Nothing else moved.

### One thing in the branch I am not letting ride silently

`.github/workflows/ci.yml` narrows the Playwright smoke job from the whole
`e2e/` directory to **`e2e/smoke.spec.ts` alone** — roughly 25 other specs stop
running in that job. The commit calls it "scope Playwright smoke to
credential-free suite", and those specs do need credentials the job has not got,
so I kept it as the author intended. But it is a real reduction in CI coverage,
and it should be a decision rather than a side effect of a merge.

### A defect I found in the deployed switch, and fixed

`READER_PUBLIC_CHARTS_ENABLED` in Vercel production reads **`"false\r\n"`** — a
trailing CRLF baked into the value when it was set on 2026-09-07. `[measured]`
via `vercel env pull` to a scratch path, never to `.env.local`.

Against the old `=== "true"` compare that is false, which is the state you ruled
for, so **nothing was or is public.** The risk runs the other way: the day the
flag is deliberately set to `true` through the same path, the value arrives as
`"true\r\n"`, the strict compare leaves the switch **off**, and whoever flipped
it sees a 404 and draws the wrong conclusion about why. A kill switch that
cannot be trusted to obey is worse than a strict one. `6194c8040d` trims the
value and nothing else — `"TRUE"`, `"1"` and `"yes"` all still mean off, and
today's behaviour is unchanged.

### Verified against production, after the deploy

`[measured]` at `b94b55e8d4`, with `READER_PUBLIC_CHARTS_ENABLED` false:

| request | result |
|---|---|
| `POST /api/reader/music/select` (Modeh unit, no Origin) | **200** `{"status":"unavailable","unitId":"…"}` |
| `POST …/select` with `Origin: https://siddur.centralreform.org` | **200** `{"status":"unavailable", …}` |
| `POST …/select` with `Origin: https://evil.example` | **403** `{"status":"unavailable"}` |
| `GET …/chart?unitId=awakening.modeh-ani@legacy-shabbat-morning` | **404**, 24 bytes of JSON, `Cache-Control: no-store`, `Access-Control-Allow-Origin` echoed only for the one allowed origin, `Vary: Origin` |
| `GET …/chart?unitId=anything.else` | **404** `{"status":"unavailable"}` |
| `GET /api/reader/music/preference` unauthenticated | **401** `{"status":"unavailable"}` |

**No bytes, by any route.** One correction to the handoff's wording: it asked
for "404 or 403" from both endpoints, and `select` answers **200
`{"status":"unavailable"}`**. That is the reviewed design, not a gap —
`docs/READER-PUBLIC-CHART-BOUNDARY.md` and CHARTS-001 both specify select → 200
unavailable, chart → 404 unavailable, so that an unapproved unit and a disabled
switch are indistinguishable to a caller. I kept the reviewed shape rather than
changing a security surface to match a sentence.

Bytes still require all three of: the flag, the frozen **code** allowlist (Modeh
only — `awakening.modeh-ani@legacy-shabbat-morning`, `application/pdf`, org
`crc`), and an approved per-crosswalk manifest pinned to an exact GCS
generation. **Approving Modeh remains a separate, deliberate act that has not
been taken.**

## Gate — measured, at the merge commit

| gate | result |
|---|---|
| `npm test -- --reporter=dot` | **4451 passed, 0 failed, 69 skipped** (385 files) |
| `npm run test:gated -- --reporter=dot` | 4440 passed, **1 failed**, 69 skipped — see below |
| `ci/gated-suite-exclusions.txt` | **one line removed, none added**; guard: *"OK — no entry was added"* |
| `npm run test:emulator` | **92 files, 1277 tests, all passed** |
| `rm -rf .next && next build --webpack` | compiled; all three `/api/reader/music/{select,chart,preference}` routes in the manifest |
| `npx tsc --noEmit` | clean |

The one gated failure is `ReconciliationProvider` **AC-3**, the known
load-adjusted intermittent: it passed in the full-suite run minutes earlier and
went **16/16 green on a solo rerun**. Not a regression from the merge — flagged
here rather than quietly re-run until green.

## Still open

- **Part D stays dark.** Neither `OVERLAYS_BASE_URL` nor `OVERLAYS_HISTORY_TOKEN`
  is set in production `[measured]` — `reconcile_service` refuses cleanly and
  writes nothing, exactly as built. Yours to mint (Overlays → System → People →
  Paired devices → "Service-history connection"). Note the Overlays session has
  its own §3 fix pending for that panel: a minted `history_reader` currently
  never appears in Paired devices, so it cannot be revoked from there yet.
- **Part E stays blocked** on the shireishabbat rebuild at the press pin. I have
  not moved the pin.
- **`HANDOFF-CODE-LIVE-BIND-NOT-ADD-2026-09-15.md` is not on disk.** Part A
  resumes when it lands.

---

# Round 2 — the same sitting, continued (2026-09-15)

Order of record: `HANDOFF-CODE-ROUND-2-2026-09-15.md` §CentralReform.live, with
`HANDOFF-CODE-LIVE-BIND-NOT-ADD-2026-09-15.md` (all three addenda) governing
Part A. Every item in that list is done. Ten commits, all on `master` and in
production. Both STOPs are honoured: nothing was written to a real setlist or
template.

R2-a through R2-e were **awaiting Daniel** when this sitting began and were
marked **approved** mid-run; R2-b and R2-e were picked up as soon as the
rulings file changed.

| | commit | what |
|---|---|---|
| R2-f | `6974b1088f` | the date is the gate — CRC does not publish |
| A-W3″ | `7bf690b27f` | the lookup table, and Daniel's Always rows in the two templates |
| R2-b + R2-e | `c871998a4b` | draft pin dropped, rebuild taken, `readerBook` emitted |
| A-W3′ | `f55a7175a4` | `propose_liturgy_bindings` |
| A-W3′ | `b8e7347fa4` | the matcher sees through a chart file name |
| A-W3′ + A-W5′ | `4a607882fd` | the proposal and the census — **STOP for Daniel** |
| item 4 | `39dca68d73` | the Yom Kippur machzor pages, listed |
| Part D | `b73843f937` | the cue-log window goes on the wire as epoch ms |
| A-W4′ | `016755bf21` | changing book re-resolves every page |
| print | `e1736be804` | `rows=music \| full \| both` |

---

## R2-f — `/today.json` answers, and it was not a 404

**Correction to what I said last wave.** I reported `/today.json` as 404. It was
not: the daily cron had since written it and it answered **200 with
`services: []`**. Same practical result for the reader — `calFrom` returns null
on zero rows either way — but a different cause, and "the file is missing" and
"the file says there is nothing on" are not the same claim.

The publish gate was the whole of it. `buildTodayDoc` required `publishedAt`,
and Daniel does not publish, so the gate was not protecting the congregation
from half-authored services — it was withholding every service from every
consumer, on the one week it was built for.

Selection is now `eventDate` inside [start of today Chicago, +7d] with `isTest`
excluded, which is the same exclusion `/perform`'s public listing already uses
and now the only one. `publishedAt` became an optional OUTPUT field, emitted
when a setlist happens to carry one. The reader's `calFrom` never read it — I
checked the reader's own plan, `PLAN-CODE-READER-INTEGRATION-2026-09-14.md` §W1,
which lists the fields it parses — so the envelope it sees is unchanged.

**[measured] on production**, after triggering the cron by hand:

```
serviceCount: crc 5, brotherslazaroff 0
```

All five Yom Kippur setlists, correct legacy book on every one, ordered
correctly, stream on all five at five minutes before:

| service | starts | book | startFolio |
|---|---|---|---:|
| Kol Nidre Alternative | 2026-09-20 17:00 CDT | `crc-machzor-2008` | — |
| Kol Nidre | 2026-09-20 20:00 CDT | `crc-machzor-2008` | 96 |
| Yom Kippur Morning | 2026-09-21 10:00 CDT | `crc-machzor-2008` | 129 |
| Yizkor | 2026-09-21 17:00 CDT | `crc-machzor-2008` | — |
| Neilah | 2026-09-21 17:00 CDT | `crc-machzor-2008` | — |

Two things to know about that table. **Yizkor and Neilah are both 17:00**, from
the B-W2 config, so their order between themselves is arbitrary; if Yizkor
should precede Neilah, one of them needs its own `startsAtLocal`. And the three
services with no `startFolio` have no `liturgyRef` on any row — see the machzor
section below.

**A regression R2-f introduced, and the fix.** Emission was triggered by publish
plus one daily cron. With no publish hook ever firing, that cron became the only
path from a setlist Daniel authored this afternoon to the reader, and a day of
staleness is too much for that job. The cron is hourly now. I checked the
mojibake in the service names before reporting it as a defect — it is not one;
the bytes on the wire are `e2 80 94`, a clean UTF-8 em dash, and the mangling
was my own terminal.

`preview_publish` is renamed in AGENT-GUIDE as the readiness report it is.
`publish_setlist` survives as an optional marker nothing reads. A-W6 withdrawn.

**Where the publish gate was NOT.** The public print route killed
publishedAt-as-gate in May 2026 under the err-public ruling; `today.json` was
the last one standing. The Overlays setlist import reads through the scoped
reader bearer and never had one — nothing to change there, which is worth the
Overlays session knowing.

---

## R2-b — the pin was pointing the wrong way

A press pin is a promise that a **printed** volume regenerates from the commit
it was pressed from. `shabbat-maariv` and `shabbat-shacharit` have never been
printed. Pinning them froze two alpha drafts at a commit they happened to be at
and refused every later build of them. `pin: null` now means "no press commit
exists"; the guard stays armed where it means something, and **verified
`shirei-tshuvah` at `21417d9-LICENSED`** on this run.

Took the rebuild at `8cc8d9a+dirty`. Before writing anything I diffed the
released volume: **same 122 units, same ids, same names**, and the only change
is four multi-page Torah/haftarah readings now listing their full folio range
instead of its endpoints. First folios unchanged, so `lookup_book_page` is
stable.

**`moments.json` lands non-empty for the first time — 136 moments, 264
occurrences across the three books this repo carries.** That is what Part E was
blocked on, and A-W4′ below uses it the same day.

### `shabbat-shacharit` pages: 146 → 144, and why that is not a retraction

Last wave I measured 146 and recorded the method in the registry entry, ending
"re-record by hand when the volume is rebuilt at its pin". It has been rebuilt,
so I re-recorded it.

146 was correct, measured, for a 153-page build. 144 is the same measurement on
a 151-page one. **The number is build-dependent precisely because the book has
never been printed** — which is the same fact that made the pin wrong. The
stable quantity is the folio offset of 7, which is the front matter; the feed's
own `pageIndex` runs folios 2..143 against `printing.pages` 151. Cross-checks on
the same build: maariv holds offset 6 (75 − 6 = 69) and `shirei-tshuvah`, a real
printed volume, holds 4 (188 − 4 = 184), both matching registry. The entry now
says to re-derive from `printing.pages` minus 7.

### Two couplings the rebuild exposed

Both repaired, neither a re-ruling, and I looked for them before syncing rather
than after.

- **shireishabbat's R2-a renamed a unit id Daniel's confirmed rows depend on.**
  `amidah.kedushah@shabbat-shacharit` became `amidah.kdushah@...`, and three
  confirmed rows named the old one. Unit ids are binding identity under Ruling
  8, so a rename is a breaking change to identity. Renamed in place; **zero
  orphans remain**, checked exhaustively against the new snapshot rather than
  sampled.
- **91 draft folios in the confirmed files had drifted** by a page or two.
  Refreshed from the build by unit id. **No legacy booklet page was touched**,
  and no label, order or ruling was touched. The legacy page governs; a draft
  folio is provisional by ruling.

---

## R2-e — `readerBook`

Additive beside `book`, `schemaVersion` unchanged. Daniel's design fact is in
the module header, because it is the reason the field is correct rather than a
workaround: the reader splits the one printed 2008 machzor into per-service
volumes because a davener is davening from exactly one service, while `.live`
registers the whole printed volume as one book because a book is an object you
hold. Two true descriptions of the same paper.

**[measured] live on `/today.json` after the final deploy**, all five services:

```
2026-09-20 kol-nidre-alt      crc-machzor-2008 -> crc-kol-nidre
2026-09-20 kol-nidre          crc-machzor-2008 -> crc-kol-nidre    folio 96
2026-09-21 yom-kippur-morning crc-machzor-2008 -> crc-yk-morning   folio 129
2026-09-21 neilah             crc-machzor-2008 -> crc-neilah
2026-09-21 yizkor             crc-machzor-2008 -> crc-yizkor
```

That last line is worth more than it looks. `crc-neilah` is the one legacy YK
volume that did **not** get `when.dates` from R2-d, so the reader cannot find
Neilah by calendar on its own — and `readerBook` names it. Once the reader's
rung 0 accepts the field, `today.json` covers the gap the shelf leaves.

Keyed on (book, serviceType). It **refuses to guess** — an unknown service on
the machzor emits nothing — and **names no draft**: `shabbat-maariv` and
`shabbat-shacharit` are the only two slugs both vocabularies already share,
which makes them the easy wrong answer, and they are absent on purpose. There
is a test that says so.

---

## Part A — bind, don't add

### The four confirmed files: read in place

The handoff offered a move to `src/data/liturgy/liturgy-map.<book>.json`. **I
left them at `src/data/templates/fixed-liturgy.<book>.json`** — the RULINGS
addendum recording Daniel's sitting cites that exact path as the artifact he
confirmed, and moving it makes the ruling's own citation stale for no gain.

They are now a lookup table, not a row list. It is richer than the rows alone:
booklet entry names the sitting recorded as misses fold in as aliases ("Kriyat
Sh'ma" is p.15, not a correction to "The Sh'ma"); pagemap aliases fold onto the
entry that already claims the name; a booklet entry no confirmed row claimed
stays as identity only; and a named setting binds to what it sets (Thou Shalt
Love → V'ahavta, Bayom Hahu → Aleinu) rather than becoming a moment of its own.
**52 entries for `crc-friday`, 71 for `crc-saturday`.**

One setting does not resolve and the function says so rather than swallowing it:
**"Sanctuary"** is ruled a setting of *Adonai S'fatai*, which no confirmed row
names. It is already its own booklet entry (crc-friday p.23), so nothing is
lost — but it is reported, because an unresolved setting means a spelling Daniel
uses will not bind.

`shireishabbat/liturgy-map/moment-aliases.json` is **not vendored into this
repo** and I did not reach across the mount for it. The table is built from the
four confirmed files, the two pagemaps and Daniel's settings rulings.

### The matcher, and the three things it refuses

Thresholds as the handoff names them, clear ≥80 and plausible ≥45. The refusals
are the point:

- **A word-run hit is capped out of the clear band.** "Mi Shebeirach" shown
  against "Mi Shebeirach — Healing", never written unwatched.
- **Containment is checked on whole WORDS, never characters.** "Nishmat" reads
  as one word of "Nishmat Kol Chai" and not as noise inside something else —
  the false match to Kriyat Sh'ma the sitting caught by hand.
- **A near match needs six characters.** At five, one typo is a fifth of the
  string and clears 80 on arithmetic alone, and this vocabulary is full of short
  near-homonyms that are different moments: Shem/Shema, Modeh/Modim, Hodu/Hoda-ah.

A tie on two different pages never binds. The printed page outranks the
page-less entry, which is what settles Saturday's two Birkat Kohanim rows — the
Amidah one Daniel ruled Never and the concluding one at p.100.

### A-W3″ — Daniel's Always rows, in the two templates

Friday night 20 slots → 30: **10 rows inserted, 11 existing slots bound**.
Shabbat morning 27 → 42: **15 inserted, 9 bound**. All from
`template-rows.<family>.json`; nothing derived from a book or a census. A moment
the template already sang keeps its song slot, its type and its queries and
gains only the pages — Bar'chu is still the band's row.

Shir Shabbat, b'nai mitzvah and the nine holiday stubs have no Always list and
gain nothing. No list, no rows.

**Two defects the first merge had, both now pinned by tests.** I am recording
these because both would have been invisible in review:

- "Avot" is a booklet alias of the Amidah's *Avot v'Imahot* **and** half of the
  Torah-service slot "Avot / Torah Processional" thirteen pages later. Matching
  a compound half against aliases printed a Torah-service row at p.71 and
  dragged the whole Amidah block out of place behind it. A compound half now
  matches the canonical name only.
- Inserted rows landed **above their own header**. Placement now runs on the
  booklet's page numbers, which is the tiebreak Ruling 8 already gives when an
  order disagrees. A page-less row does not move at all: with no page there is
  no evidence but Daniel's order, so K'dushat HaYom stays where he put it and
  clones page-less as the handoff says.

Fixed rows are exempt from the flow-slot performer/duration invariant, and I
widened the test rather than inventing data. Nobody has timed Avot v'Imahot, and
a minute each for twenty-one rows quietly adds a third of an hour to every
Friday night's estimate.

**What this does NOT reach.** The four Firestore templates are overrides;
`getTemplate` prefers them over these defaults. So A-W3″ changes the code
defaults only. The Firestore half needs the stage/commit tool and Daniel's
confirmation, and is listed as open below.

### A-W3′ — `propose_liturgy_bindings`, and the dry run

The tool binds and only binds: **the row count in equals the row count out**,
with a test that says so. A header is never bound — a header is a sign over a
section, not a moment. A row already carrying a `liturgyRef` is never touched.
A plausible row is never written unless Daniel names it in `accept`, and an
`accept` naming something that row never offered is ignored rather than
honoured. `dryRun` defaults true. 12 emulator tests, plus the tenant wall and
the role gate.

**One thing the emulator taught it.** A unit id belongs to the book that defines
it, and the legacy booklets are pagemaps with no units at all, so `crc-friday`
cannot carry `shma.barchu@shabbat-maariv` however true that identity is —
`validateLiturgyRef` refuses it, correctly. The proposal still reports the unit
id, because that is the identity Daniel is confirming and what A-W4′ re-resolves
on; the write keeps the page and drops the id. When a Shirei volume for a
service is released and becomes the book, the same match carries its unit id
through unchanged.

**The dry run, [measured] on production** over the 4 templates and the 25
Shabbat-family setlists dated on or after 2026-05-01 — **664 rows**:

| | rows | distinct spellings |
|---|---:|---:|
| clear | 275 | 91 |
| needs Daniel | 90 | 37 |
| no match | 150 | 87 |
| skipped (header, note, already paged) | 149 | — |

`work/liturgy-bindings-proposal-2026-09-15.md`. **STOP — nothing written.**

**A finding that moved those numbers a long way.** The first run came back 163
clear / 172 needing Daniel, and reading it showed why: the most common shape of
a `.live` row title is a **chart file name** — `Shema (major).pdf`,
`Barchu (walkdown)`, `Mourner's Kaddish.musicxml`. Sixty-odd spellings were
stranded for no better reason than a file extension and an arrangement
clarifier, neither of which changes which page the congregation turns to. A
title that does not match whole is now retried as its bare stem. I reused
`bareStem` from `title-specificity.ts` — the repo's existing answer to exactly
this, and what `library_index` already stores — rather than writing a second
normalizer that would drift from it.

`Mi Chamocha Ana B'Koach.pdf` is still refused: its stem names two moments.

The High Holy Day services are absent from the proposal and that is the tool
**refusing rather than failing** — they run from `crc-machzor-2008`, for which
no lookup table exists, and it will not guess at a book it does not have.

### A-W5′ — the census

`work/service-census-2026-09-15.md`. **STOP — nothing written to any template.**

Grouped by hand from the setlist names, **not** by `templateType` — that field
is absent or inconsistent on most of these rows, which is the same story as the
unmaintained templates told from the other end. Rows are grouped by bare stem so
`Barchu (walkdown)`, `Barchu (Friedman).pdf` and `Barechu` count as one row;
that is the right grain for a template, which says which moment while the
service picks the arrangement.

Shabbat morning has 7 services and a clean spine of 16 rows that reads in
booklet order. Shir Shabbat has 5 and 12. B'nai mitzvah has 6 and 21. **Two
families are one or two services deep** — Camp Sabra Saturday, and Friday night
proper — and are marked in the document as anecdote rather than census, because
at n=2 a row clears 50% by appearing once.

As the addendum predicted, the spine of every real family is **sung pieces**.
That is not thin data, it is what a band setlist is, and the document says so
rather than apologising for it.

### A-W4′ — changing book re-resolves every page

Four ways to find the moment in the new book, strongest first: the same unit id
(what the nine shared `@shabbat-maariv` ids exist for); the **moment** behind
the unit via `moments.json`, which is book-independent where a unit id is not
and which only works at all because R2-b landed the artifact this morning; the
row's own name at the binding tool's bar; then nothing.

**Nothing is the interesting case.** A page is never blanked and never guessed.
An unresolved row keeps the page it had and is marked `liturgyRef.stale` —
"this number is about the other book" is honest where a blank row and a
confident wrong number both are not, and some of these Daniel typed by hand. A
merely plausible name match does not resolve either: a book switch is exactly
the moment a confident guess goes unnoticed.

`update_setlist` returns `rebook: {from, to, resolved[], unresolved[]}` when the
book changed. A row-write failure is logged and reported, never allowed to fail
the book change he asked for.

### Print — `rows = music | full | both`

Defaults differ on purpose: `generate_gig_packet` is `music`,
`generate_service_sheet` is `full`. The band does not want twenty spoken rows
between charts; the rabbi cannot use a sheet missing every unsung moment.

`generate_service_sheet` gains all three, and `both` is **one** pdf with two
labelled sections rather than two files — it comes off the printer in one
handful, and a second attachment is a second thing to lose.
`generate_gig_packet` gains the order of service ahead of the charts on `full`
and `both`; those two are the same document there and the description says so
rather than inventing a difference, because in a gig packet the charts **are**
the music section. Both tools echo `rows` and list the `sections` actually
produced. The order pages use the rabbi-sheet renderer so the two documents
cannot drift, and a failure there costs the order pages, never the charts.

A music row is one with a chart **or** typed `song` — the second half matters,
because a song the band knows by heart has no chart and is still the band's row.
A service with no sung rows prints an empty music section rather than quietly
falling back to everything.

**No row is hidden from anyone.** This filters a PDF, per call, chosen by
whoever is printing.

---

## Part D — verified, and it had never once worked

`OVERLAYS_BASE_URL` and `OVERLAYS_HISTORY_TOKEN` **are** set in production (both
11 hours old at the time of checking) and are live on the current deploy.

The first real call failed. `reconcile_service` against RH Day 2 returned
`history_http_error`: Overlays `/api/history` answered **400**. Not auth — with
both env vars present, a 400 rather than a 401 means the credential was accepted
and the request shape refused.

The contract is `?since=<ms>&until=<ms>`, verbatim in PLAN Part D describing the
endpoint as Overlays built it. The client was sending ISO strings. **The
fixture tests were green throughout and could not have caught it: a fixture has
no opinion about a query string.** So the wire format now has tests of its own,
alongside two properties that were also only ever assumed — that a redirect is
refused so the bearer cannot be handed to another host, and that a failure a
caller can see never carries the token.

I could not probe Overlays directly to confirm the diagnosis before fixing:
`vercel env pull` returns empty strings for sensitive variables, by design, so
production is the only place that can make this call.

**[measured] after the fix**, `reconcile_service` on RH Day 2, dry run:

```
ok: true, historyRows: 0, counts {performed 0, skipped 0, added 0,
reordered 0, untracked 51}
```

So the pipe is open end to end — config, request, 200, parse, reconcile, diff —
and **there is no cue data to reconcile against**. I widened the window to the
whole Chicago day for both 2026-09-12 and 2026-09-13 and got 0 rows each time.
Either the cue log was not driven on Rosh Hashanah, or it was cleared, or the
credential's workspace is not the congregation I assumed. I cannot tell which
from this side — **that one is for the Overlays session.**

---

## The Yom Kippur machzor pages — listed, not checked

`work/machzor-folios-2026-09-15.md`. No printed 2008 machzor was at hand, so
this is the "otherwise list them for Daniel" branch of item 4.

Nothing here could be checked automatically. The `crc-machzor-2008` pagemap has
57 entries covering **pp.38–92**, the Rosh Hashanah section, exactly as Ruling 8
says. **52 of the 53 Yom Kippur pages sit outside it.** They validate — the
guard checks the page is inside a 215-page book — but nothing has ever compared
them to paper.

The internal evidence is good: two blocks that do not overlap each other or the
Rosh Hashanah section, **Kol Nidre 96–126** and **Yom Kippur morning 129–178**,
both running forward in service order; and every prayer appearing in both the
mapped Rosh Hashanah section and a Yom Kippur service has the larger page on Yom
Kippur, which is what one volume containing both services looks like.

**One number does not fit.** Kol Nidre row 14, **`B'sefer Chayim`, p.152**,
between neighbours at p.111 and p.114. 152 is not in the Kol Nidre block at all
— it is in the Yom Kippur morning block, where it is that service's Sim Shalom.
It looks like a number that travelled between setlists. I did not change it:
it is Daniel's page to correct, and Kol Nidre is on the 20th.

Also recorded: **Yizkor, Neilah and the Kol Nidre alternative carry no page on
any row**, which is why `today.json` emits those three with no `startFolio`.

---

## Gate

Run at the last commit of the wave.

| | result |
|---|---|
| `npm test` | **4521 passed / 0 failed**, 69 skipped |
| `npm run test:gated` | 4485 passed / 0 failed (run before the last two commits) |
| `npm run test:emulator` | **93 files / 1290 passed** on a clean re-run |
| `tsc --noEmit` | clean |
| `next build --webpack` | clean |
| exclusion guard | denominator **1 before, 1 after** — nothing added |

The emulator suite's first pass showed five failures, every one of them a
10-second timeout, which is the known load-flake signature; a re-run was fully
green and I am reporting it as flake rather than regression on that basis.

---

## Open, and whose it is

**Needs Daniel:**

1. `work/liturgy-bindings-proposal-2026-09-15.md` — confirm per spelling. On
   confirmation, bindings go to the four templates and to setlists dated in the
   future; history stays untouched unless he says otherwise.
2. `work/service-census-2026-09-15.md` — edit the family he wants refreshed.
3. `work/machzor-folios-2026-09-15.md` — the `B'sefer Chayim` p.152 row first.
4. Yizkor before Neilah in `today.json` needs one of them to carry its own
   `startsAtLocal`; they are both 17:00 in the config today.

**Built but not applied, waiting on 1 and 2:**

- The Firestore half of A-W3″. The four `setlistTemplates` docs are overrides
  and `getTemplate` prefers them over the code defaults, so the Always rows
  reach a clone only once they are merged into those docs. That merge writes to
  Daniel's real templates and belongs behind the same confirmation.
- `propose_service_frame` (addendum 1). Opt-in whole-service frames from
  booklet-paged entries only. It should be built against the same lookup table,
  after the bindings are confirmed, so it proposes from settled identity.

**Not built, and named as such:**

- **Perform-mode collapse.** A `fixed: true` row with no `fileId` should collapse
  to a thin labelled divider, tap to expand, per-device preference, default
  collapsed. This is the one frontend piece in the handoff and the only item of
  the .live section not delivered this wave. It wants the design skill and an
  iPad check at 820×1180, which is a pass of its own rather than a tail on this
  one. Everything server-side that it depends on is in place: rows carry
  `fixed`, and the print side already distinguishes music from liturgy.

**For other repos:**

- **Overlays:** `/api/history` answers 200 with zero rows for 2026-09-12 and
  2026-09-13, whole days. Was the cue log driven on Rosh Hashanah? Also: the
  Overlays setlist import never had a publish gate, so R2-f changes nothing
  there.
- **shireishabbat / reader:** R2-d has landed for three of the four legacy YK
  volumes — `crc-kol-nidre` (2026-09-20), `crc-yk-morning` (2026-09-21 morning)
  and `crc-yizkor` (2026-09-21 evening) all carry `when` in `dist-app/books.json`.
  **`crc-neilah` carries none.** On the 21st the reader will open Yizkor rather
  than Neilah for the evening.
- **shireishabbat:** R2-a's `kedushah` → `kdushah` rename reached three of
  Daniel's confirmed rows here and is repaired. If another stem merge lands,
  say which ids changed — `.live` cannot see the merge, only the hole it leaves.

---

# Round 3 — your bindings and your census, applied (2026-09-15)

Order of record: `HANDOFF-CODE-ROUND-3-2026-09-15.md` §CentralReform.live, against
`work/liturgy-bindings-confirmed-2026-09-15.json` and
`work/service-census-rulings-2026-09-15.json`. Items 1–6 are done and in production;
item 7 waits on Overlays, as the handoff says it should.

Six commits, all on `master` and deployed.

| | commit | what |
|---|---|---|
| item 1 | `e46029c276` | your confirmed bindings become the lookup table |
| items 3, 5, 6 | `cf4f73201a` | bind on type; the Always merge for Firestore templates; the Sometimes offer |
| — | `1400ab741d` | a defect the Friday merge showed me: a duplicated Chatzi Kaddish |
| — | `57194d4cf9` | a template's pages were written correctly and invisible to anyone who asked |
| — | `56f27e798f` | my own mistake, fenced off — see **Hygiene** |
| — | `fe9f91937f` | an emulator test whose premise bind-on-type made false |

---

## Item 1 — the bindings, and where a confirmation belongs

Your file says what a binding is, in one line: *"A binding writes {book, folio} to
rows carrying that spelling."* That is a fact about a **name**, not about a row —
which means it belongs in the lookup table beside the booklet's aliases and the
draft feed's unit ids, not in a one-off script that walks today's rows. Put there,
every consumer gets it at once: the binding run, the template refresh, and the
matcher that fires when you type a row nobody proposed. Your file is copied into
the repo byte-for-byte at `src/data/liturgy/confirmed-bindings-2026-09-15.json`, so
the running code reads the artifact rather than a retyping of it.

**Keyed on the page.** A confirmation names a page in a booklet, so the candidates
are the entries that print that page and the name only has to pick among them. That
is what sends "Closing Blessing" to the concluding Birkat Kohanim at **p.100**
instead of the page-less one inside the Amidah — which is the confusion your ruling
was issued to settle, and which the compiled file had itself fallen into: it carried
`folio: null` there, having resolved the name to the Amidah entry. I left the
artifact alone and put the correction in the loader with your ruling cited beside
it. Hand-editing a file labelled `confirmedBy: Daniel` would make the record a lie.

**Adonai S'fatai is now a moment, and it closed an old gap.** The booklets print the
Amidah's opening line under the name of the setting CRC sings it to, and
`template-rows.*.json` already recorded Sanctuary as a setting *of* Adonai S'fatai
with nothing to attach it to — it was the one entry `unresolvedSettings()` had
always reported. Your ruling supplied the moment. The entry takes your name and
keeps the booklet's as an alias, so "sanctuary chords (1)", "Adonai sfatai (ah na
na)" and the Kabbalat Shabbat template's own "Adonai Sifatai" all reach p.23 / p.70.
That last one was on your page as a no-match; it binds now because the lookup
finally has the moment, and binding it is what your ruling on every other spelling
of the same name says to do.

**`leaveUnbound` is a ruling too, and the stronger one.** You looked at the
candidate and said no, so the matcher refuses those titles outright — stem included,
because deriving Mi Chamocha out of `Mi Chamocha Ana B'Koach.pdf` is exactly the
inference you declined. Two existing tests encoded the pre-ruling world and now
record why they changed.

**Applied.** Four templates, dry run first, prod matching the local staging exactly:

| template | book | rows bound | needed you |
|---|---|---|---|
| B'nai Mitzvah service | crc-saturday | 14 | 0 |
| Randy Shabbat morning | crc-saturday | 20 | 0 |
| Standard Friday Night — Kabbalat Shabbat | crc-friday | 9 | 0 |
| Shir Shabbat | crc-friday | 7 | 0 |

**50 rows bound, and nothing at all in the "ask Daniel" column.** That is the whole
return on confirming once per spelling: the question does not come back.

**Every setlist with `eventDate` ≥ today: none were bindable, and that is a
finding.** The five future services are all Yom Kippur on `crc-machzor-2008`, and
Ruling 8 is explicit that the 2008 machzor pagemap is Rosh Hashanah **morning** only
— there is no Yom Kippur pagemap. So there is nothing to bind against, and binding
against the RH-morning pages would print p.39 (RH morning's Mah Tovu) on a Kol Nidre
sheet. I did not extend the lookup to that book. What I did find while checking
`[measured]`:

```
Yom Kippur Morning — Sept 21   35 rows, 30 carry a page
Kol Nidre — Sept 20            28 rows, 23 carry a page
Kol Nidre Alt — Sept 20        23 rows,  0 carry a page
Neilah — Sept 21               24 rows,  0 carry a page
Yizkor — Sept 21                8 rows,  0 carry a page
```

**Three services in six days have no page numbers on any row** — 55 rows. Those
pages can only be hand-authored, the way Kol Nidre's and YK morning's were; it also
explains why the round-2 spot-read covered only folios 96–132. Whether that matters
depends on whether anyone reads pages off those three sheets. It is your call, and
it is the one thing in this return with a date attached to it.

## Item 2 — Neilah at 18:00

Written through the normal setlist path (`update_setlist`, one field,
`lastSeenVersion: 2`). It is David's setlist and nothing else on it was touched.

`today.json` re-emitted and read back `[measured]`:

```
Yizkor — September 21    startsAt 2026-09-21T22:00:00Z   (17:00 Chicago)
Neilah — September 21    startsAt 2026-09-21T23:00:00Z   (18:00 Chicago)
```

Yizkor precedes Neilah. Before this the two were both 17:00 by service-type default
and their order in the file was arbitrary.

## Items 3 and 4 — the templates

### The Friday Always merge, and a defect it caught

`merge_always_rows_into_template` does in Firestore what A-W3″ did in code. This
matters more than it sounds: the four `setlistTemplates` documents are overrides and
`getTemplate` prefers them over the code defaults, so the template you actually clone
from had never seen the merge.

The merge logic is now adapter-driven so one implementation reaches both row shapes.
Routing a Firestore row through the code's `TemplateSlot` type would have dropped
`songId`, `fileId`, `key`, `bpm` and vocal lead — **a Saturday morning template
losing every chart binding, quietly, in exchange for some page numbers.** That is
invisible in a diff of labels and would surface on a Saturday.

Staging it against the live Kabbalat Shabbat template is what found the real defect.
The template prints Chatzi Kaddish before Bar'chu; your Always order has it after
V'shamru; the merge produced **two Chatzi Kaddish rows**. The cause was the rule
that makes the merge safe — anchors are assigned strictly forward, which is what
stopped "Avot" dragging the Amidah into the Torah service at p.71 — but once the
scan had passed Bar'chu it could no longer see the template's own Chatzi Kaddish
behind it. A second pass now looks backward: the row stays exactly where the
template put it and gains its pages there, and the note says `inPlace: true` so a
reader can see the two orders disagreed. A disagreement about where Chatzi Kaddish
goes is not a reason to print the moment twice.

Committed: **15 rows → 30**, 15 inserted, 6 bound to rows that were already there,
one Chatzi Kaddish.

I merged Always into the **kabbalat-shabbat** doc, not the `friday_night` one. The
handoff said "both, if both are live" — they are, but the doc typed `friday_night`
is **Shir Shabbat**, which item 4 says has no Always rows. The parenthetical was
written before we knew which doc carried which type. Shabbat morning's merge is
delivered by its refresh below (same function), so it is not done twice.

### The three census refreshes

Census rows in your order, each carrying the identity your bindings gave it, then
the family's Always rows interleaved. B'nai mitzvah inherits Saturday's list; Shir
Shabbat has none, so its 12 rows are exactly the census.

| template | rows | pages | charts | inserted |
|---|---|---|---|---|
| B'nai Mitzvah service | 20 → **36** | 30 | 16 → **16** | 15 |
| Randy Shabbat morning | 30 → **33** | 28 | 14 → **13** | 15 |
| Shir Shabbat | 21 → **12** | 7 | 14 → **8** | 0 |

**A chart the template already had is never lost to a refresh.** The census names
the *arrangement* that actually gets played, so most swaps are Modah Ani → "Modeh
ani - Klepper", Veshamru → "V'Shamru (Old Skool)" — same moment, the chart the band
uses. But the Saturday census contains no Bar'chu row at all, so the Always merge
was about to insert a bare Bar'chu and the template's charted one would have gone.
Two rows are carried across that way, Bar'chu and the Sh'ma. Where the census named
a row the template did not have, I took the chart from a sibling template first and
the library second, by folded name.

**Two things I want you to look at, because I applied your ruling literally and it
costs something:**

1. **Shir Shabbat loses its three section headers** — "Kabbalat Shabbat", "Ma'ariv
   Service", "T'filah" — along with six songs the census of 5 services says were not
   played (Dodi Li, Shalom Alechem, Lechu Goldman, C-Saw Niggun, Bina in G,
   Twilight). The songs are the ruling working as intended. The headers are
   collateral: the census records repertoire, and headers are structure, so they
   were never census rows to keep. Say the word and they go back in one edit.
2. **Two page inversions survive, because your census order outranks the booklet.**
   B'nai mitzvah has Ma Tovu (p.52) after Psukei d'zimrah (p.55), and Kedusha (p.74)
   after V'Shamru (p.76). The merge uses printed pages only to place *inserted*
   rows; it never reorders a row you put somewhere.

Shabbat morning also drops Hallelujah Jam, Aleinu, Adon Olam, Chatzi Kaddish and
Torah Reading as *rows* — but Reading of the Torah, Mourner's Kaddish, Birkat
Kohanim, Kiddush and Motzi come back through the Always merge, and Aleinu and Adon
Olam are on your **Sometimes** list, which is what item 6 offers. The three lists
compose.

## Item 5 — bind on type

A row gains its page the moment it gains its name, so `propose_liturgy_bindings`
stops being the only way a page ever arrives. Verified live against a test setlist
on `crc-friday` (test account, swept afterwards):

```
add "Mi Chamocha"              -> liturgy.bound  {crc-friday, folio 18}
add "Sh'ma"                    -> liturgy.bound  {crc-friday, folio 15}
add "Wagon Wheel"              -> nothing
add "Od Yavo Shalom Aleinu"    -> nothing        (you ruled it unbound)
add "MAARIV" (header)          -> nothing        (a header is a sign, not a moment)
rename "Wagon Wheel" -> "Hashkiveinu (Shomreinu)"  -> bound {crc-friday, folio 20}
rename a row already at p.18   -> nothing; it kept p.18
```

The rename case is the one that matters most — you fix a spelling and the page
follows the new name — and the last line is the rule that keeps it safe: a page
already on a row was put there by an author, and a rename is not evidence that it
was wrong.

**The browser needed a different answer.** The grid writes through the local-first
sync engine straight to Firestore with no server in the path. The two honest options
were to ship the lookup tables and a Levenshtein matcher into the setlist bundle —
roughly a hundred kilobytes onto the iPads to decide something nobody is waiting for
— or to ask the server. `POST /api/liturgy/bind-row` is asking the server: fired
after the title is already saved, answer ignored, never blocking or reverting an
edit. Offline it does nothing and the batch sweeps up later. It is gated like every
other route (`401` without a bearer, verified on production).

## Item 6 — `propose_service_frame`

You marked each moment Always, Sometimes or Never. Always arrives with the template.
Never stays in the lookup for identity and is never offered. This is the third list.

Dry run against a real Shabbat morning setlist `[measured]`: **28 candidates**, in
printed-page order, 7 skipped — 6 because the setlist already names that moment
(Hineh Mah Tov, Chatzi Kaddish, Sh'ma, V'shamru, Oseh Shalom, Prayer for Shalom) and
one because `crc-saturday` does not print Ashrei. Against a Shir Shabbat setlist:
**19 candidates**, one skipped (crc-friday does not print Emet v'Emunah).

Booklet-paged entries only, because a page number from another book is worse than no
row at all. It is the one tool in the whole "bind, don't add" design that may add a
row you did not type, so it adds only what comes back in `accept`, page-ordered.
AGENT-GUIDE gains a "Pages, and the three lists" section: the three ways a row gets
a page, and the two rules that hold everywhere — **a page is never overwritten, and
a page is never guessed.**

## A template's pages were invisible

Found by verifying the work rather than trusting it. All four templates read back
over `get_template` with **zero pages on zero rows**, while `propose_liturgy_bindings`
— which reads Firestore directly — said 30, 28, 24 and 7. The pages had been written
correctly the whole time and could not be seen.

`liturgyRefs` is template-only, so it is deliberately absent from
`COPYABLE_TRACK_FIELDS`, and `normalizeTemplateTrack` already carries it by hand on
the way *in*, with a comment saying exactly why. Two other places walk that list and
did not: `getTemplate` dropped the refs on the way out, and `patchHasChange`
compared them out of existence — so a patch that changed **only** the pages reported
"no change" and was skipped without a write. The first hides a page; the second
refuses to write one. Both handled explicitly now.

## Item 7 — Part D

Nothing to do here until Overlays answers why the Rosh Hashanah cue log is empty.
The pipe works and returns 0 rows; `reconcile_service` runs on the first service that
has cues.

## Hygiene — my own mistake, recorded

Verifying bind-on-type needed a test setlist, so I made one and then called
`cleanup_all_test_data({uidPrefix: "test-r3bind", dryRun: true})` to see what
tidying up would remove. **The tool takes exactly one argument, `prefix`.** Unknown
keys are dropped rather than refused, so `uidPrefix` scoped nothing and `dryRun`
prevented nothing: it ran the nuclear sweep across every test namespace in the
project. It removed 3 test users, 3 bearer tokens, and 1 setlist with 5 tracks — my
own fixtures plus two other sessions' stale accounts.

No real setlist, template or chart was touched. The sweep only reaches `test-` uids
and `isTest:true` rows, and production holds the same 84 setlists it held before.

I fixed what made it possible rather than just remembering it. `dryRun` now defaults
**true** and returns the plan — which uids would be revoked, how many flagged
setlists would be swept, and whether the sweep is scoped at all. `dryRun:false`
requires `force:true`. Both are in the schema, so a caller reaching for them finds
them. An unscoped plan says so out loud: *"this would sweep EVERY test account in
the project, including other sessions'."* The plan and the run share one enumeration
function, because a preview that scopes differently from the sweep it previews is
worse than no preview. `sweep_orphan_test_data` has had this exact shape since cycle
7; this is the standing F-05 rule catching up with its more dangerous sibling.

## Gate — measured, at `56f27e798f`

- `npm test` — **4694 passed**, 0 failed, 69 skipped (400 files)
- `npm run test:gated` — **4684 passed**, 0 failed, 69 skipped (396 files)
- `npm run test:emulator` — **1290 passed**, 0 failed (93 files)
- `tsc --noEmit` — clean
- `next build --webpack` — clean; `/api/liturgy/bind-row` in the route table
- `ci/check-exclusions-remove-only.sh origin/master` — OK, denominator 1 before, 1 after
- production `/api/version` — `56f27e798f` at the time of measurement; `fe9f91937f` (test-only) followed
- all four templates read back their pages: 30 / 28 / 7 / 24

## What is waiting on you

1. **Three Yom Kippur setlists carry no page numbers on any row** — Kol Nidre Alt
   (23), Neilah (24), Yizkor (8). There is no Yom Kippur pagemap, so those pages can
   only be hand-authored. Kol Nidre is on the 20th.
2. **Shir Shabbat's three section headers** were dropped by the census refresh —
   "Kabbalat Shabbat", "Ma'ariv Service", "T'filah". Headers are structure, not
   repertoire, so the census never carried them. One word and they go back.
3. **Two page inversions** in the refreshed templates, both because your census
   order outranks the booklet: B'nai mitzvah Ma Tovu p.52 after Psukei d'zimrah
   p.55, and Kedusha p.74 after V'Shamru p.76.

## Still not built, and named as such

**Perform-mode collapse** — a `fixed: true` row with no `fileId` collapsing to a thin
labelled divider, tap to expand, per-device preference, default collapsed. It is
more worth doing than it was this morning: the four templates now carry 45 fixed
liturgy rows between them, which is exactly the thing that will crowd a music stand.
Everything server-side it needs is in place. It wants the design skill and an iPad
check at 820×1180, which is a pass of its own.

## For other repos

- **Overlays** — unchanged from round 2: `/api/history` returns 0 rows for whole
  days Sept 12–13. Round 3's Overlays section asks which of the three causes it is.
- **shireishabbat** — `crc-machzor-2008` has a Rosh Hashanah **morning** pagemap
  only. Three Yom Kippur services on .live have no pages because of it. If a YK
  pagemap is possible before the 20th, say so; if not, .live hand-authors them.

---

# Round 4 — the whole machzor, and what the cue log was actually sending (2026-09-15)

Seven commits, all on `master` and in production. Everything below is `[measured]`.

| commit | what |
|---|---|
| `14a877f558` | books: the whole 2008 machzor, one service at a time |
| `7adc8f65e9` | liturgy: a near match has to be explainable word by word |
| `35abcf34b0` | liturgy: `momentId` — the join key that survives a change of book |
| `e71956dbac` | performed: Overlays sends a number, and .live dropped every row |
| `912499411d` | templates: a census refresh never drops a header (R4-a) |
| `e7eaacbffc` | perform: the liturgy the band does not play from folds away |
| `cc8e54626a` | mcp: `get_setlist`'s read view could not see `momentId`, or `fixed` |

Gates before the push: `npm test` **4744 passed / 0 failed / 69 skipped** (404 files),
`npm run test:emulator` **1291 passed / 0 failed** (93 files), `tsc --noEmit` clean,
eslint clean, `SKIP_ENV_VALIDATION=1 npx next build --webpack` clean, and the
exclusions guard remove-only with the denominator 1 before and 1 after.

One thing to flag before the items, because it changed what I built.

**R4-c is recorded two different ways.** The RULINGS addendum says page numbers on
setlists are authoring, never repo work, and a machzor service's identity comes
from the per-service feeds as `momentId` while the printed page stays as typed.
The round-4 handoff says that was **withdrawn and reversed by you**: pages are a
core feature, they exist in shireishabbat, and they must resolve automatically —
"that wave is now item 0". The handoff is the later document (12:08 against the
addendum's 12:04) and states the reversal explicitly, so I built item 0. The two
readings reconcile on one rule they share and I kept absolutely: **a typed page is
never overwritten.** Empty rows gained pages; every page you or David typed is
exactly where it was, and the three places the map disagrees are listed at the
bottom for you rather than changed.

## 0. The whole 2008 machzor, service-scoped

The volume was registered on 2026-09-11 for Rosh Hashanah morning only, pages
38–92, and the order recorded exactly why the rest was deferred: across the whole
book **49 prayer names repeat at different folios**, Bar'chu alone printing at 9,
45, 100 and 136. A pagemap keyed on bare names would resolve one name to four
pages, which is the silent-wrong-page failure the book layer exists to prevent.

The missing piece was never the data — it was the **scope**. A setlist always
knows which service it is, and within one service every name resolves to exactly
one page. So each entry now carries its service, and a lookup narrows to the
setlist's `templateType` before it ranks anything.

`scripts/emit-machzor-book.mjs` generates all of it from the six per-service feeds
in shireishabbat's `dist-app/`, where every unit carries `printedFolio` — the page
in the printed volume, as distinct from the booklet's own numbering. **Nothing is
typed by hand.**

```
service           units  from your curated list  from the feed   pages
crc-erev-rh          35                       0             35    1– 37
crc-rh-morning       55                      55              0   38– 92
crc-kol-nidre        36                       0             36   93–127
crc-yk-morning       47                       1             46  128–178
crc-yizkor           10                       0             10  179–185
crc-neilah           26                       0             26  187–215
                    209                      56            153
```

Your 55 Rosh Hashanah morning names and aliases — verified against the scan in
September — are carried through **unchanged**; the feed's own names are
machine-cased ("Blessing Before", "Reading 1", "Service") and would have quietly
stopped matching what you type. The script refuses rather than dropping a curated
entry it cannot place. One of yours, "Kol HaN'shamah" at p.43, is a second name
for a page the feed models as one unit, so it folded in as an alias of
"Psukei d'Zimrah" rather than being lost.

Bar'chu, `[measured]` after the change: **p.45 in RH morning, p.100 in Kol Nidre,
p.136 in YK morning, p.9 in Erev RH** — and still p.45 when nobody says which
service, which is what this book meant for its whole life.

Validation is now *tighter* than it has ever been, not looser: a Kol Nidre row may
carry 93–127 and nothing else. One deliberate widening: unscoped, the book now
accepts pages 1–215 rather than 38–215. Page 1 is a real page of the book;
rejecting it was only ever an artifact of five services being unmapped.

**`legacy-slichot` is excluded.** Its eight units carry no `printedFolio` at all,
because Selichot is a separate handout and not part of this bound volume.
Inventing pages for it is the one thing the generator exists not to do.

### What the scoping exposed in the matcher

Auditing the five setlists before writing anything turned up a defect worth its
own commit. **"Torah Reading" and "Haftorah Reading" are 81% identical as strings**
— over the clear line — and eight printed pages and one aliyah apart: the Torah
reading is p.163, the haftarah p.171. The matcher bound the first to the second.
Levenshtein over a whole phrase cannot tell a misspelling from a different word.

A near match now has to survive being taken apart: every substantive word on one
side must be matched by an identical or near-identical word on the other.
"Barechu" for "Bar'chu" survives — one word typed badly. "Torah" for "Haftorah"
does not. A percentage is the wrong ruler for a short word (one edit in "Esah" is
25% of it), so up to five characters a single edit is enough on its own, which
keeps "Esa Einai" reaching "Esah Einai".

And a **permutation tier**: the same words in another order are the same name. The
feeds call one moment "Haftarah Blessing Before" and "Blessing Before the Haftarah
Reading"; David writes "Blessing Before Haftorah". Word order carries no meaning
in a prayer's name. All three now reach p.170 — the page he typed.

`[measured]`: four wrong cross-matches between the Torah service and the haftarah
disappeared, and the rows that produced them now **agree** with David's pages.

### Binding the five Yom Kippur setlists

Dry run first, against the real rows; the dry run and the committed run agreed
exactly. **28 empty rows gained a page and a `momentId`.**

```
setlist                         rows  bound  plausible  unmatched  skipped
Yom Kippur Morning — Sept 21      35      0          0          5       30
Kol Nidre — Sept 20               28      1          1          3       23
Kol Nidre Alternative — Sept 20   23     10          2         11        0
Neilah — Sept 21                  24     10          2         12        0
Yizkor — Sept 21                   8      7          0          1        0
```

`skipped` is almost entirely "this row already has a page you typed" — which is
why YK Morning bound nothing: David had already paged all thirty of its liturgy
rows by hand. Read back from production after the run:

```
Yom Kippur Morning     35 rows  30 paged
Kol Nidre              28 rows  24 paged
Kol Nidre Alternative  23 rows  10 paged
Neilah                 24 rows  10 paged
Yizkor                  8 rows   7 paged
```

**TYPED PAGES THAT MOVED: none.** I diffed every row's `liturgyRef` before and
after; the set of pre-existing pages is byte-identical.

The `unmatched` rows are songs and band material with no liturgical name — "Avinu
Malkeinu (Janowski)" as a chart, niggunim, "Closing Song". They are not misses.

## 2. `momentId` on rows

A unit id is book-local. A moment id is not — and it is the only thing Overlays'
cue log can be matched on for a machzor service, where `.live` says
`crc-machzor-2008 p.100` and Overlays says `crc-kol-nidre folio 8` about the same
Bar'chu.

A bound row now gains `momentId` beside `liturgyRef`, derived at bind time and
carried by clone. `pickPlanned` already prefers it over everything else; it now
reads the stored one rather than re-deriving.

The moments artifact reached none of this before: `.live` carries the printed
volume as one book and shireishabbat models it as six, so every machzor occurrence
was dropped as "a book this repo does not carry". `sync:books` folds the six into
`crc-machzor-2008` — **replacing** the booklet's own folio with the printed one
from the pagemap, because Kol Nidre's Bar'chu is folio 8 there and page 100 in the
volume, and carrying the first under the second's name would be a wrong page
wearing a right name.

`[measured]`: moments 136 → **224**, occurrences 349 → **473**, and all **209**
machzor units now resolve to a moment.

### The read view could not see it

Worth telling you because of how it looked. After the bind, I read the five
setlists back and **every one of the 28 rows reported `momentId: 0`** — the field
written, the field absent. Rather than assume, I proved the write path: a
temporary test resolved `yizkor.esah-einai@crc-yizkor` → `esah-einai` correctly,
so the data was right and the *reading* was wrong.

`src/lib/mcp/tools/setlists.ts` builds its row projection by hand, field by field,
and simply did not list `momentId` — or `fixed`. Its own comment already names two
previous instances of exactly this (`pageNumber`, `liturgyRef` each went missing
the same way). A hand-maintained projection in front of a growing row type is a
standing trap; the `TRACK_FIELDS` census exists for the other direction and this
one slipped past it. Fixed in `cc8e54626a`, deployed, and confirmed against
production: **28 rows now return a `momentId`**, e.g.

```
Esa Einai   crc-machzor-2008 p.180  unitId yizkor.esah-einai@crc-yizkor  momentId esah-einai
```

## 1. History rows: `at` is a number

`isHistoryRow` required `at` to be a string. Overlays types the row as `at:number`
and validates it with a safe-integer check; the captured response carries
`"at": 1789420709619`.

So **every row the cue log has ever returned was filtered out silently.** `rows`
came back empty and `reconcile_service` reported "no cues were logged" — which is
indistinguishable from a service nobody cued, and is what it would have said on
the morning after Kol Nidre.

The fixtures could not have caught it: a fixture has no opinion about the wire. So
the test now reads the canonical capture from the Overlays repo
(`work/handoffs/cue-log/history-rehearsal.json`) verbatim, the same way the
request tests hold the query string. ISO is still accepted.

Two more things while I was in there:

- **The workspace is checked, not assumed.** Reconciling a rehearsal workspace's
  cues against a CRC setlist would produce a confident, detailed, entirely
  fictional account of a service. A mismatch is now a refusal.
- **`nextAfter` is followed.** Overlays answers at most 500 rows and a Yom Kippur
  morning goes past that; a truncated cue log reads as "the second half of the
  service was skipped". Capped at eight pages, and the cap is a refusal rather
  than a partial answer.

**Verified live** `[measured]`, `reconcile_service` against
`RH Day 2 — CRC Machzor — September 13`, window 16:30–21:00Z on the 13th:

```
ok: true   historyRows: 0   rows: 51   untracked: 51   promoted: null
```

Which is the expected answer: the cue log holds nothing for that day, so nothing
can be said, and the tool says exactly that rather than inventing a service. The
call now reaches a live relay end to end — the credential is accepted, the query
shape is accepted, the envelope parses, the workspace check passes. The legacy
`crc-overlays-vercel.vercel.app` alias is **gone** (404), so whatever
`OVERLAYS_BASE_URL` holds is a working host; I could not read its value back to
confirm the exact domain, because it was stored `--sensitive`.

## 3. Shir Shabbat's headers are back (R4-a)

The census counts what CRC actually played and skips headers on purpose — a header
is not a thing anyone played, it has no chart, and "Ma'ariv Service in 4 of 6"
says nothing. That was right about the census and wrong about the refresh.

`carryHeadersThrough` restores them **by anchor, not by index**: a header goes back
in front of the row it used to introduce, found by name, because the whole point of
a refresh is that the indices moved. Nothing is removed and nothing is reordered;
running it twice changes nothing the second time. A header whose whole section the
census dropped is reported rather than parked at the end — a sign over nothing is
worse than no sign.

Staged, diffed, committed on production. Shir Shabbat **12 → 15 rows, v2 → v3**;
no existing row changed, moved, or lost a page:

```
 0  header   Kabbalat Shabbat          <- restored, before "Shiru L_Adonai"
 1  song     Shiru L_Adonai Shir Shabbat.pdf
 2  song     Mizmor Shiru Ladonai.pdf
 3  song     Mizmor l_David D.pdf
 4  song     L'Cha Dodi Dmin .pdf                      crc-friday p.8
 5  song     erev shel lcha dodi                       crc-friday p.8
 6  reading  Dvar torah
 7  header   Ma'ariv Service           <- restored, before "Barchu (walkdown)"
 8  song     Barchu (walkdown)                         crc-friday p.10
 9  song     Shema (major).pdf                         crc-friday p.15
10  reading  V'ahavta                                  crc-friday p.16
11  song     Mi Chamocha Ana B'Koach.pdf
12  header   T'filah                   <- restored, before "Adonai sfatai (trad)"
13  song     Adonai sfatai (trad)                      crc-friday p.23
14  prayer   Silent Prayer                             crc-friday p.31
```

## 4. Perform mode folds the fixed liturgy away

The four templates carry **45** fixed liturgy rows between them, and a band iPad
that opens onto those has to be scrolled past before the first chart is reachable.

A stretch of consecutive `fixed: true` rows with **no bonded chart** folds into one
thin bar. Not one bar per row — folding 45 rows into 45 dividers is the same
problem in a smaller typeface. A run of a single row still reads as that row's own
name. **This is an interpretation**: the handoff's wording is per row, and I read
it as per run. Say the word and it becomes one bar per row.

Nothing is hidden silently: the bar says how many rows and which pages, so the
page number — the field the eye actually hunts for mid-service — stays on screen
folded, in the same right-hand column as the rows above and below it.

**What never folds is a row with a chart bonded to it.** The Always merge
deliberately marks template song slots `fixed` while leaving their charts in place
— Bar'chu on the Friday template is fixed *and* charted — so "fixed" alone is not
the test, and there is a test file whose job is to keep it that way. Hiding a chart
behind a divider on a stand, mid-service, is the one failure this could cause.

The preference is **per device**, not per setlist: the same service is open on six
iPads and a lectern, the band wants the songs and you want every row, and that is a
property of who is holding the tablet. Default collapsed. The toolbar control only
appears when the service actually has something to fold. Your printed sheet is
untouched — the print path reads the tracks, not this.

Design pass against the skill, for an iPad at 820×1180: 44px full-width tap target,
`aria-expanded` over a region that exists, chevron *and* count rather than colour
alone, transform-only motion that `prefers-reduced-motion` turns off, and the
folded bar's pages right-aligned into the same fixed column as every row type's
folio.

## 5. `today.json` re-emitted

`GET /api/cron/emit-today` → `{"ok": true, … "serviceCount": 5}`. Read back
cache-busted, so this is the file and not a CDN copy `[measured]`:

```
2026-09-20T22:00Z  Kol Nidre Alternative Service   startFolio  98   readerBook crc-kol-nidre
2026-09-21T01:00Z  Kol Nidre                       startFolio  98   readerBook crc-kol-nidre
2026-09-21T15:00Z  Yom Kippur Morning              startFolio 129   readerBook crc-yk-morning
2026-09-21T22:00Z  Yizkor                          startFolio 180   readerBook crc-yizkor
2026-09-21T23:00Z  Neilah                          startFolio 188   readerBook crc-neilah
```

Five services, `readerBook` on every one, **`startFolio` on every one** — it was
missing from three of them this morning — and Yizkor before Neilah. Nothing else
changed shape.

One correction to something I nearly reported: my first read showed three null
`startFolio`s and looked like a failed emit. It was a cached copy. The emit had
worked; I had asked the wrong thing.

## What is waiting on you

1. **Three pages where the printed map disagrees with what was typed.** Listed,
   not changed — a typed page is never overwritten, so these are yours to settle:

   | service | row | typed | 2008 map |
   |---|---|---|---|
   | Yom Kippur Morning | Un'taneh Tokef | 147 | **148** |
   | Yom Kippur Morning | Avinu Malkeinu | 162 | **160** |
   | Kol Nidre | Al Cheit | 117 | **116** |

   Al Cheit is the interesting one: the **Kol Nidre Alternative** setlist types it
   at **116**, agreeing with the map, and the main Kol Nidre setlist types 117.
   Two typings of the same moment, one page apart — so at least one of them is a
   slip, and the map sides with the alternative service.

   The map's pages come from the feed captures, so a disagreement is one of: the
   feed's `printedFolio` is off by one, or the typed page is off by one, or the
   moment genuinely starts on the facing page and both are defensible. Tell me
   which and I will fix the side that is wrong — including the capture, if it is
   the capture.

2. **`shehecheyanu` is genuinely ambiguous inside Kol Nidre** — the volume prints
   it at both 97 and 99. The lookup returns "two exact hits, different folios"
   and refuses to choose, which is correct. If one of them is the one you mean on
   the 20th, name it and it becomes an alias.

3. **Perform-mode folding is per *run*, not per row** (item 4 above). One word
   from you either way.

4. **Kol Nidre is Sunday the 20th.** Kol Nidre Alternative still has 13 unpaged
   rows and Neilah 14 — all of them songs and band material as far as the matcher
   can tell, but worth your eye rather than mine.

## For other repos

- **Overlays** — the `at:number` defect was on **this** side, not yours: `.live`
  was discarding every well-formed row you sent. Round 2 and round 3 both reported
  "0 rows for Sept 12–13" as an Overlays question; that framing was wrong and I
  withdraw it. The remaining open question is smaller: whether the cue log really
  holds nothing for those days, or held it and aged out. Also still pending on
  your side: the domain swap is done (the `.vercel.app` alias 404s now), and
  `momentId` adoption plus `readDeviceList` remain.
- **shireishabbat** — nothing blocking. The six per-service feeds carried
  `printedFolio` on all 209 units and that was enough to map the whole volume; no
  page was invented. `legacy-slichot` has no `printedFolio` and I left it alone —
  if Selichot is ever bound into the same volume, that is the file to fill in. If
  the three disagreements above turn out to be capture-side, they are three
  `printedFolio` values in `dist-app/`.
- **Reader** — `CAL` and the `sync-books` carry are still where round 3 left them.

---

# Round 5 — the corrections, and the one thing that would not turn on (2026-09-15)

Four commits, all on `master`. The first three are in production and everything
they do is verified live below; the fourth is test-only and rides the next
deploy. Everything below is `[measured]`.

| commit | what |
|---|---|
| `c2dabe77f5` | books: two rulings the capture cannot make for itself (R5-a, R5-d) |
| `ddc8d3b431` | today: the two Rosh Hashanah mornings open different books (R4-d) |
| `4a79922c51` | liturgy: a page typed by hand still knows what it is about |
| `e4a7db4410` | test: the tampered-signature test tampered with nothing, 1 run in 270 |

Gates: `npm test` **4748 passed / 0 failed / 69 skipped** (404 files),
`npm run test:emulator` **1293 passed / 0 failed** (93 files), `tsc --noEmit`
clean, eslint clean, `SKIP_ENV_VALIDATION=1 npx next build --webpack` clean,
exclusions guard remove-only with the denominator 1 before and 1 after.

Four of the five items are done and verified live. **Item 4 — the Modeh Ani chart —
is approved, written, and cannot be switched on yet**, for a reason that is not a
defect and is the one thing in this round that needs you. It is the last section.

## 1. The rulings land as data, and the disagreements resolve

`crc-machzor-2008` regenerated. Exactly two entries moved, and nothing else in the
209 changed:

```
Un'taneh Tokef      crc-yk-morning   p.148 -> p.147      (R5-a)
Shehecheyanu (2nd)  crc-kol-nidre    name released       (R5-d)
```

**R5-a.** The capture really does file p.148's unit under Un'taneh Tokef — the feed
has `amidah.untaneh-tokef` at 148 with `amidah.kdushat-hayom` at 147, and no
B'rosh Hashanah unit at all. Splitting that unit is shireishabbat's half of this
round; the page is the part `.live` can be right about now, so the page is what
moved. David's typed 147 stands.

**R5-d.** The feed gives both Kol Nidre Shehecheyanus the same `shortName`, which
is why the bare name was two exact hits and the lookup refused. Now the first owns
the name; the second keeps its own full feed name and stays reachable by it.

Neither is a hand-typed page, which matters more than it sounds. They are
**RULINGS** in `scripts/emit-machzor-book.mjs`, applied deterministically, so the
next regeneration cannot quietly lose them — and **every one of them is written to
die**. When shireishabbat corrects the capture the override stops changing
anything and the script prints

```
RULINGS THAT NOW MATCH THE CAPTURE (1) — delete them from RULINGS:
```

which is the signal to remove the line. An override that silently agreed with the
feed forever would be a fork of the data wearing a ruling's clothes.

The move also exposed a hole worth naming: the generator pairs by page, so a
ruling that MOVES a unit empties its old page, and the curated entry sitting there
would have vanished with no error. Identity does not move, so the check is now on
identity — every unit the previous file knew is still in the new one, or the
script refuses.

### The five setlists, re-run dry

Exactly what you predicted: **three disagreements became one agreement and two
corrections.**

```
setlist                  bound  plausible  unmatched  skipped
Yom Kippur Morning           0          0          5       30
Kol Nidre                    1          0          3       24
Kol Nidre Alternative        1          1         11       10
Neilah                       0          2         12       10
Yizkor                       0          0          1        7
```

Un'taneh Tokef no longer appears as a disagreement — typed 147, map 147. And R5-d
turned out to have a second effect I did not expect: **two Shehecheyanu rows that
had been unbindable now resolve**, one on each Kol Nidre setlist. Both were empty
rows, so I bound them under the standing round-4 rule (an empty row gains a page;
a typed page is never touched).

## 2. The two typed pages you ruled

The one explicit exception to "a typed page is never overwritten", and I did not
treat it as licence for anything else.

| setlist | row | before | after |
|---|---|---|---|
| Yom Kippur Morning | Avinu Malkeinu | p.162 | **p.160** |
| Kol Nidre | Al Cheit | p.117 | **p.116** |

Both through the normal setlist update path, both with the row's version pinned so
a concurrent edit would have been refused rather than clobbered.

Then I diffed **every** row on all five setlists, before against after:

```
Yom Kippur Morning     Avinu Malkeinu    162  -> 160     (R5-b, ruled)
Kol Nidre              Al Cheit          117  -> 116     (R5-c, ruled)
Kol Nidre              Shehecheyanu      null -> 97      (empty row, bound)
Kol Nidre Alternative  Shehecheyanu      null -> 97      (empty row, bound)
4 page changes total, row counts unchanged
```

Four changes, all four intended, nothing else moved.

### What the corrections exposed

Both corrected rows came back carrying `momentId: null`, and that was wrong in a
way worth a commit. `momentId` is derived and never authored — it is a join key,
and a key someone can type is a key that can be wrong — but the derivation had
only ever been wired into the *automatic* bind. A page that arrived through an
explicit `liturgyRef` produced a row with a unit id and no moment, which is a row
the cue log cannot match. Correcting a page should not cost the row its identity.

Identity now follows the reference wherever the reference comes from, on add and
on update alike. The page stays entirely the author's; this only says what the
page is about. `[measured]` on production, straight back from the write:

```
Avinu Malkeinu  p.160  unitId torah.amidah-avinu-malkeinu@crc-yk-morning  momentId amidah-avinu-malkeinu
Al Cheit        p.116  unitId amidah.al-cheit@crc-kol-nidre               momentId al-cheit
```

The five setlists now stand at **118 rows, 83 paged, 32 carrying a momentId** (was
81 and 28 at the end of round 4).

## 3. R4-d — the two Rosh Hashanah mornings

`rosh-hashanah-day` opens `crc-rh-morning`; `rosh-hashanah-morning` — the
alternative service and Second Day — opens **`shirei-tshuvah`**.

The care in this one is that it is a **shelf** decision and not a **page**
decision. Ruling 8 stands: the legacy booklet governs the page until the matching
Shirei volume is released, and a released volume is a second book, never a
replacement. So the pagemap still scopes `rosh-hashanah-morning` to the printed
machzor's RH-morning section, `machzor-services.ts` is untouched, and a row on one
of those setlists still carries a 2008-machzor page — because that is the book in
the room.

The two tables were deliberately one table so pages and reader volumes could not
drift. They still are, with exactly one ruled exception, and there is now a test
on the *page* side saying so: a scope that quietly followed the shelf would put a
Shirei folio on a row holding the machzor.

`today.json` re-emitted (`{"ok":true, "serviceCount":5}`), read back cache-busted:

```
2026-09-20T22:00Z  Kol Nidre Alternative Service   readerBook crc-kol-nidre   startFolio  98
2026-09-21T01:00Z  Kol Nidre                       readerBook crc-kol-nidre   startFolio  98
2026-09-21T15:00Z  Yom Kippur Morning              readerBook crc-yk-morning  startFolio 129
2026-09-21T22:00Z  Yizkor                          readerBook crc-yizkor      startFolio 180
2026-09-21T23:00Z  Neilah                          readerBook crc-neilah      startFolio 188
```

Five services, `readerBook` and `startFolio` on every one, Yizkor before Neilah,
shape unchanged. **R4-d has no visible effect in that file today**, because none of
the five services this week is a Rosh Hashanah service — it is proven by test, not
by this emission, and I would rather say so than let the green above imply more
than it shows.

## 5. `reconcile_service`, still green

`[measured]` against the same service as round 4:

```
ok: true   historyRows: 0   rows: 51   untracked: 51   promoted: null
```

**A correction to my round-4 return.** I wrote there that the old Overlays
`.vercel.app` alias 404s. That was wrong, and Cowork is right: I probed
`crc-overlays-vercel.vercel.app` — the repository name — not the deployment alias.
Re-probed all three just now:

```
https://crc-overlays.vercel.app           root 200   /api/history 401
https://crc-overlays-vercel.vercel.app    root 404   /api/history 404
https://overlays.centralreform.org        root 200   /api/history 401
```

So `crc-overlays.vercel.app` **does** still answer as the alternate. Which also
means my round-4 inference — "the configured host cannot be the old one, because
the old one is gone" — proved nothing. `OVERLAYS_BASE_URL` was stored
`--sensitive` and I still cannot read it back to name the domain; what I can say
is that the configured host accepts the credential, the query shape and the
workspace check, and returns a well-formed envelope.

## 4. Modeh Ani — approved, written, and switched off again

This is the one that needs you.

**Everything up to the switch went cleanly.** Both blockers the independent review
left on the row were re-checked against production immediately before writing, and
both are clear: the source setlist's `isTest` is now literally `false` (it was
absent at review time), and exactly one track in the org carries this
`(momentId, pieceId)` with one binding signature.

I also looked at the bytes before publishing them, because 3,008 bytes is both
what a one-page lead sheet looks like and what a placeholder looks like. It is a
real chart: one page, ReportLab vector type, Helvetica and Courier, no images,
~184 drawn words, seven distinct chord tokens, and the drawn text carries *Modah*,
*Ani* and *Halpert*.

The manifest was computed from the live Storage generation and written under a
transaction precondition — the row must still be the reviewed row, must carry no
prior approval, and the object must still be at the named generation, size and
sha256. A byte that moved would have refused the write.

```
publicReaderStatus    approved
version               1
songId / fileId       upload-ac582fb1-f27d-4530-9a01-1c3b74cf7500
storagePath           library/upload-ac582fb1-f27d-4530-9a01-1c3b74cf7500.pdf
generation            1779586334638196
sha256                da9ec13856f388c956594bd5ceaad8b6dad310854c66673ebb55728a60af64a2
sizeBytes             3008
contentType           application/pdf
```

Then I set `READER_PUBLIC_CHARTS_ENABLED=true` — plain `true`, no trailing newline,
and stored as **Config rather than Secret** so it can be read back and audited (the
CLI now defaults new variables to Secret; the first attempt went in unreadable and
I redid it). Production redeployed. And:

```
select  503  {"status":"unavailable"}
chart   503  {"status":"unavailable"}
```

**The endpoint refuses to serve, and it is right to.**
`checkPublicReaderRateLimit` requires a **distributed** limiter in production and
will not fall back to per-instance state — "a failed distributed decision is not
permission to serve public chart bytes." It needs `UPSTASH_REDIS_REST_URL` and
`UPSTASH_REDIS_REST_TOKEN`, which are documented in `.env.example` and **are not
set in Vercel production**. Nothing is misconfigured; the control is doing exactly
what it was written to do, on a path whose whole job is handing bytes to anonymous
callers.

I did not weaken it. Turning the guard off, or letting it fall back to per-instance
counting, would have made the verification pass by removing the only thing standing
between a public chart URL and an unbounded fetch loop — and that is a security
control, not an obstacle. So I set the switch back to `false` and redeployed, and
re-verified that production is exactly where it was:

```
select                200  {"status":"unavailable","unitId":"awakening.modeh-ani@..."}
chart                 404  {"status":"unavailable"}   24 bytes
Origin evil.example   403
Cache-Control         no-store
Access-Control-Allow-Origin   echoed only for https://siddur.centralreform.org
```

**The approval stays written.** It is inert while the switch is off, and it is the
part that took the review. One decision and one pair of environment variables
separate the chart from being live.

`shireishabbat/ops/tasks/CHARTS-001.json` updated to **revision 11**, status
`blocked`, with the manifest, the byte inspection, both cleared blockers, the 503
cause and the restored switch-off contract recorded as evidence.

## What is waiting on you

1. **A distributed rate limiter for `.live`, or a decision not to have one.**
   This is the only thing between the Modeh Ani chart and being live. Upstash has
   a free tier and Vercel provisions it from the marketplace in a couple of
   minutes, but it is a new external service on the production project, so it is
   yours to say yes to rather than mine. Say the word and I will provision it, set
   the switch, redeploy and run the four-way verification in one pass.

   Worth knowing what else changes if you do: the site's general rate limiter
   already reads the same two variables, and today it quietly degrades to
   per-instance counting without them. Providing them would tighten that too —
   a real improvement, and a real change in behaviour on paths that work fine
   now. This public anonymous path is the only one that refuses to serve
   without a distributed decision.

2. **`legacy-slichot` still has no `printedFolio` anywhere**, so Selichot remains
   outside the bound volume and unmappable. Unchanged from round 4; only worth
   re-raising if you want it in.

3. Nothing else. The three round-4 disagreements are closed, and there are no new
   ones: every typed page on the five Yom Kippur setlists now agrees with the map
   or has been ruled.

## One thing the gates turned up, unrelated to this round

`rejects tampered signature` in `session-role.test.ts` failed once in a
full-suite run and passed on its own — the shape of a load flake, which is what
I would normally have recorded it as. It is not one, and the real cause is worth
the paragraph.

An HMAC-SHA256 signature is 32 bytes, so its base64url is 43 characters, and
43 % 4 == 3: the **final character carries only the top two bits** of the last
byte and its low four bits are don't-care. The test rewrote the last *two*
characters — so whenever the signature's second-to-last character already
matched the replacement, the only thing that changed was four bits nobody
decodes. The "tampered" string decoded to the same 32 bytes, verification
correctly succeeded, and a working product failed a broken test. **15 of the
4,096 possible two-character endings do this: about one run in 270.**

It now flips the first character, which is the top six bits of byte zero and has
no don't-care bits. The product was never wrong; the test was only asking the
question properly 269 times out of 270.

## For other repos

- **shireishabbat** — R5-a is applied on the `.live` side as a ruling, not as a
  data fix, and it is waiting for yours. The feed has `amidah.untaneh-tokef` at
  `printedFolio` 148 and `amidah.kdushat-hayom` at 147, with **no B'rosh Hashanah
  unit**; the split and the folio correction are round 5 item 1 on your side. When
  the rebuilt feed lands, regenerating here will print "RULINGS THAT NOW MATCH THE
  CAPTURE" and the override comes out. R5-d needs nothing from you — the two
  Shehecheyanu units differ correctly in `name`, only `shortName` collides, and
  that is a reasonable thing for a feed to do.
- **Overlays** — the alternate host question is answered above:
  `crc-overlays.vercel.app` answers 200 and its `/api/history` 401s, so it is live;
  my round-4 "it 404s" was a probe of the wrong hostname and is withdrawn. The
  cue log still holds zero rows for Sept 12–13, and `.live` is no longer the
  reason.
- **Reader** — nothing this round, as the handoff says.

---

# Round 6 — the chart is live, and a ruling is allowed to end a unit id (2026-09-15)

Two commits, both on `master` and both in production. Everything below is
`[measured]`.

| commit | what |
|---|---|
| `37b5472ff7` | books: a ruling may end a unit id, and the guard now knows which ones (R6-d) |
| `b17e06e412` | rate-limit: the store the marketplace provisions has another name for itself (R6-b) |

Gates on the final tree: `npm test` **4757 passed / 0 failed / 69 skipped**
(405 files), `npm run test:emulator` **1293 passed / 0 failed** (93 files),
`tsc --noEmit` clean, eslint clean (0 errors, 11 pre-existing warnings),
`SKIP_ENV_VALIDATION=1 npx next build --webpack` clean.

**All four `.live` items are done, and the one that was waiting on you is live.**
The Modeh Ani chart now serves to the reader, and the bytes it serves hash to the
manifest that was reviewed in round 5, unchanged.

Item 3 did not run, because its condition was not met upstream: R6-g stopped at
shireishabbat's own stop clause. §4.

## 1. R6-d — the regeneration, and a guard that learned a new word

`crc-machzor-2008` regenerated from the rebuilt feeds (shireishabbat `10d3a58`).

### 1.1 The refusal, which was correct

The first regeneration refused, exactly as the order predicted:

```
Error: 2 units in the previous book are absent from this one:
  amidah.kdushat-hayom@crc-rh-morning ('K'dushat Hayom' p.56);
  amidah.kdushat-hayom@crc-yk-morning ('K'dushat Hayom' p.147).
```

That guard exists because a ruling that MOVES a unit empties its old page, and the
curated entry sitting on that page would vanish without a word. But R5-a and R6-a
do not move units — each found two adjacent units in one capture wearing each
other's names, and correcting that RENAMES a unit. The id that was wrong stops
existing. The guard had no word for that.

It did not get loosened. It got a list. `RETIRED_UNITS` in
`scripts/emit-machzor-book.mjs` accepts a disappearance only when it is written
down **with the ruling that made it and the id the unit became**, and only when
that successor is actually present in the new book. Three things still refuse:

- an **unlisted** disappearance — unchanged from before;
- a **listed** retirement whose successor never arrived — otherwise the list would
  be the loophole the guard exists to prevent;
- a retired id that comes **back**, which means either the capture reverted or the
  retirement is wrong about what happened.

Unlike `RULINGS`, these lines are not meant to die: the retirement is a permanent
fact about the previous book's ids.

```
RULED ID RETIREMENTS ACCEPTED (2):
  R6-a amidah.kdushat-hayom@crc-rh-morning ('K'dushat Hayom' p.56)  -> amidah.untaneh-tokef@crc-rh-morning (p.56)
  R5-a amidah.kdushat-hayom@crc-yk-morning ('K'dushat Hayom' p.147) -> amidah.untaneh-tokef@crc-yk-morning (p.147)
```

### 1.2 R5-a retired itself, on schedule

The override printed its own death notice on the next run:

```
RULINGS THAT NOW MATCH THE CAPTURE (1) — delete them from RULINGS:
  R5-a amidah.untaneh-tokef@crc-yk-morning p.147
```

Deleted. `RULINGS.page` is now empty, which is what it was always for — R5-a lived
there one round, the capture caught up, and the mechanism said so rather than
passing silently. A regeneration with the override removed produces byte-identical
output to one with it in, which is what "moot" has to mean to be worth trusting.

### 1.3 The RH-morning half did NOT fall out of the feed, and this is the part worth reading

The order's expected diff was *"Un'taneh Tokef RH-morning 57 → 56"*. After the
retirements were accepted, it had not happened. The ids were right and the names
were wrong:

```
p.56  unitId amidah.untaneh-tokef@crc-rh-morning   name "K'dushat Hayom"
p.57  unitId amidah.brosh-hashanah@crc-rh-morning  name "Un'taneh Tokef"
```

So a lookup for "Un'taneh Tokef" in `crc-rh-morning` still answered **57** — the
page the ruling had just emptied of that prayer. A silent wrong page on a lectern
sheet, produced by a correction.

The cause is structural and worth naming. Curated entries are paired to feed units
**by page**, because the curated names are the ones Daniel and David verified
against the printed book and they must survive regeneration. That is right in
general and wrong here: R6-a renames the units under those pages, so the verified
names end up describing the wrong prayer. `crc-yk-morning` escaped it only by
accident — round 5's override had already collapsed both units onto p.147, so the
fold handled it.

The feed itself now carries the correct names (`Un'taneh Tokef` at 56,
`B'rosh Hashanah` at 57), so the fix is to let the ruling re-home the curated
strings. `RULINGS.name` gains `also`: the variants that travel with a ruled name.

```js
{ service: "crc-rh-morning", name: "Un'taneh Tokef",
  also: ["Unetaneh Tokef"],
  unitId: "amidah.untaneh-tokef@crc-rh-morning", ruling: "R6-a" },
{ service: "crc-rh-morning", name: "B'rosh Hashanah",
  also: ["B'Rosh Hashanah", "B'Rosh Hashanah Yikateivun"],
  unitId: "amidah.brosh-hashanah@crc-rh-morning", ruling: "R6-a" },
```

`also` is not decoration. "Unetaneh Tokef" does not fold to "Un'taneh Tokef" —
`unetaneh` and `untaneh` differ by a letter — so no matcher moves it, and it would
have gone on pointing at 57 after everything else was corrected. Which variant
names which prayer is settled by reading the printed book, not by string distance,
so it is recorded as data carrying its ruling id rather than inferred. A test pins
it, because a future tidy-up that drops `also` would fail silently and only on that
one spelling.

Result, and it now matches `crc-yk-morning` exactly:

```
crc-rh-morning  p.56  Un'taneh Tokef    aliases K'dushat Hayom, This Holy Day, Unetaneh Tokef
crc-rh-morning  p.57  B'rosh Hashanah   aliases B'Rosh Hashanah Yikateivun
crc-yk-morning  p.147 Untaneh Tokef     aliases K'dushat Hayom
crc-yk-morning  p.148 B'rosh Hashanah   aliases —
```

"K'dushat Hayom" still resolves, in both services, to the page whose title bar
prints it. Losing that would have been its own wrong answer.

### 1.4 The diff, keyed on identity rather than on lines

209 entries before, 209 after:

| | |
|---|---|
| retired | `amidah.kdushat-hayom@crc-rh-morning`, `@crc-yk-morning` |
| new | `amidah.brosh-hashanah@crc-rh-morning` p.57, `@crc-yk-morning` p.148 |
| changed | `untaneh-tokef@crc-rh-morning` page 57→56 + aliases; `untaneh-tokef@crc-yk-morning` aliases only |
| everything else | **unchanged — 0 other entries differ in page, name or aliases** |

Exactly the order's expected diff, nothing else moved.

Five new tests in `liturgy-lookup.test.ts`: Un'taneh Tokef → 56 in RH morning,
the `Unetaneh Tokef` variant → 56, `K'dushat Hayom` → 56, B'rosh Hashanah in both
services, and one asserting that **no entry carries either retired id** — a row
bound to a retired id would look bound and join to nothing.

### 1.5 The live half: nothing to re-point, proven rather than assumed

The order says any row whose `unitId` was a retired id gets the successor and its
`momentId` re-derived. **All 56 production setlists read, 1,472 rows, 144 carrying
a `liturgyRef.unitId`, ZERO on a retired id.** Nothing to re-point.

That scan found nothing twice, and only the second one was real. The first pass
reported "0 rows" because `get_setlist` takes `id`, not `setlistId`, so all 56
calls had returned a validation error that my scanner happily parsed as a setlist
with no tracks. The re-run fails loudly on any non-`ok` envelope; 56 of 56 read OK.
A population claim that comes back clean is exactly the one to distrust.

The rows that name these prayers already carry the ruled pages — they were typed
against the printed book and the ruling agrees with them:

```
RH Day 2 / RH Day Alt CRC Machzor   Un'taneh Tokef 56, B'Rosh Hashanah yikatevun 57, K'dushat HaYom 56
Yom Kippur Morning                  Un'taneh Tokef 147, B'Rosh Hashanah 148
```

Binder dry run on both RH machzor setlists after the regeneration: **0 bound,
0 plausible, 3 unmatched, 48 and 50 skipped** — nothing newly bindable and nothing
regressed. The skipped rows are rows that already carry a `liturgyRef`, which the
binder never overwrites.

## 2. R6-b — the limiter, and a second name for the same store

**The Modeh Ani chart is live.**

### 2.1 Provisioning

`vercel integration add upstash/upstash-kv -e production --no-env-pull` →
**Upstash for Redis**, resource `upstash-kv-cyclamen-fence`, free tier, connected
to `sheet-music-app` production only. Terms acceptance completed through the
browser flow the CLI opened against your already-authenticated session.

`--no-env-pull` was deliberate and is worth keeping in the muscle memory: the
default post-provision step runs `vercel env pull` into **`.env.local`**, which is
where `SUPERVISOR_PROD_BEARER` lives. Every env pull this round went to a
scratchpad path instead.

### 2.2 The name mismatch, and why I did not solve it by copying a secret

The marketplace does not provision `UPSTASH_REDIS_REST_URL` /
`UPSTASH_REDIS_REST_TOKEN`, which is what the code reads and what `.env.example`
documents. It provisions the **identical REST url and token** under Vercel's own
KV naming: `KV_REST_API_URL` / `KV_REST_API_TOKEN` (plus `KV_URL`, `REDIS_URL`,
`KV_REST_API_READ_ONLY_TOKEN`).

The quick fix would have been two more variables holding copies. I did not, because
a copied secret is a second place to rotate, and the rotation that misses it does
not degrade — it fails **closed** on the anonymous chart path, which is the exact
outage this store was provisioned to end. The platform-managed variables stay the
single source of truth.

`src/lib/upstash-env.ts` resolves the first **complete pair**, `UPSTASH_*`
preferred and `KV_*` second, and both limiters (`rate-limit.ts` and
`reader-public-rate-limit.ts`) now go through it. Resolving as a pair is the point:
a url from one source with a token from the other is not a configuration, it is two
half-configurations that look present and authenticate against nothing. Tested,
along with the whitespace-only value that is how a variable gets turned off by
hand.

One thing the change broke quietly and I had to go back for: the existing limiter
tests stub `UPSTASH_*` to `""` to mean "no distributed limiter". With a fallback
that no longer means what it says, so they stub the `KV_*` pair too. Otherwise any
machine that happens to carry the marketplace variables would take the distributed
path and the switch-off assertions would be testing nothing.

### 2.3 The switch

`READER_PUBLIC_CHARTS_ENABLED` removed and re-added as **exactly `true`** — read
back through a scratchpad `env pull` and dumped through `od -c`:
`" t r u e " \n`, the newline being the dotenv line ending, no CR and nothing
inside the value. Stored as Config so it can be read back for audit. (`--no-sensitive`
from round 5 is not a flag in CLI 50.35.0; non-sensitive is the default there and
`--sensitive` opts in.) Production redeployed.

### 2.4 The four-way verification, live

Against `https://www.centralreform.live`, unit
`awakening.modeh-ani@legacy-shabbat-morning`:

| # | check | result |
|---|---|---|
| 1 | `POST /api/reader/music/select`, Origin `https://siddur.centralreform.org` | **200** `{status:"available", kind:"pdf", contentType:"application/pdf", chartUrl}` · `Access-Control-Allow-Origin: https://siddur.centralreform.org` · `Cache-Control: no-store` · `Vary: Origin` |
| 2 | `GET /api/reader/music/chart?unitId=…` from that origin | **200** · `application/pdf` · `Content-Length 3008` · `Cache-Control no-store` · `Content-Disposition inline` · `X-Content-Type-Options nosniff` · single ACAO origin |
| 3 | any other unit (`erev-yk.kol-nidre@crc-kol-nidre`) | **404** `{status:"unavailable"}` |
| 4 | `Origin: https://evil.example` | **403** on chart and on select, no ACAO header |

And the check that matters most:

```
sha256 of the served body   da9ec13856f388c956594bd5ceaad8b6dad310854c66673ebb55728a60af64a2
sha256 in the manifest      da9ec13856f388c956594bd5ceaad8b6dad310854c66673ebb55728a60af64a2
```

**The bytes being served are byte-for-byte the bytes that were reviewed**, and the
body begins `%PDF-1.3`. The approval row written in round 5 was not touched — it
was correct and inert, and it is now correct and serving.

### 2.5 The side effect the order asked me to measure

The site's general limiter reads the same credentials and has been degrading to
per-instance counting. It now has the store. Measured after the flip: an
authenticated MCP authoring call (`tools/call list_books`) **200 `ok:true`**,
`/perform` **200**, `/api/version` **200**. Nothing was weakened to get here —
round 5's 503 was the control working correctly, and the fix was to give it the
thing it was asking for.

`CHARTS-001.json` → **revision 12, status `live`**, five evidence lines added,
`blocked_by` down to the one item that was never about this pilot.

## 3. `today.json` and the cue log

Re-emitted through `GET /api/cron/emit-today` (it is a GET; my first call was a
POST and got a clean 405): `{"ok":true,"results":[{"org":"crc","ok":true,"serviceCount":5},{"org":"brotherslazaroff","ok":true,"serviceCount":0}]}`.

Read back from `/api/today`, 200, 2,110 bytes, unchanged in shape:

```
kol-nidre-alt       crc-kol-nidre   startFolio 98    2026-09-20T22:00Z
kol-nidre           crc-kol-nidre   startFolio 98    2026-09-21T01:00Z
yom-kippur-morning  crc-yk-morning  startFolio 129   2026-09-21T15:00Z
yizkor              crc-yizkor      startFolio 180   2026-09-21T22:00Z
neilah              crc-neilah      startFolio 188   2026-09-21T23:00Z
```

R6-d changes nothing visible here, correctly: none of this week's five services is
a Rosh Hashanah morning. That is a fact about the week, not evidence that R6-d
works — the tests are the evidence.

**`reconcile_service` on `https://overlays.centralreform.org`: `ok: true`.**
`historyRows 0`, 34 rows all `untracked`, `promoted: null`, window
2026-09-05T13:30Z → 18:00Z. The host answers 200 at the root and its
`/api/history` 401s unauthenticated, so the auth gate is intact. Zero rows here is
a real zero, not a silent read failure: `fetchHistory` returns `ok:false` with a
code on every failure path, and the tool's own summary says it plainly — *"No cues
were logged for this service, so nothing can be said about what fired. Every row is
untracked — that is a statement about the cue log, not about the service."* The
round-4 `at`-type defect that used to make this indistinguishable is fixed and
stayed fixed.

## 4. R6-g — did not land, so item 3 did not run

shireishabbat stopped R6-g on its own stop clause: `legacy-slichot`'s capture
carries **no printed page on any of its 8 units**. It is a two-slide deck and a
folded handout, with no `identity.json`, and the volume is declared
`callNumbers: "folios"` rather than `"printed"`. A printed number for that service
can only come from a printed artifact.

So the conditional in the order — *"If R6-g landed"* — is unmet, and nothing was
added to the book. Measured here: **0 entries in `crc-machzor-2008` with a
Selichot service**, and the `Selichot — September 5` setlist has **20 rows, 0 with
any `liturgyRef`**. Nothing was typed by hand on either side.

## 5. Two corrections to earlier rounds

- **Round 5's cleanup claim was narrower than I wrote it.** I said pulled
  production credentials "were deleted from the scratchpad". The round-5 file was;
  two earlier ones, `prod.env` and `prod2.env` from rounds 2 and 3, were still
  there — 7,490 bytes each, each holding `FIREBASE_PRIVATE_KEY`. They are deleted
  now, along with every env file this round pulled, and the scratchpad has been
  swept: the only remaining match for `FIREBASE_PRIVATE_KEY` anywhere under it is
  the literal `process.env.FIREBASE_PRIVATE_KEY` in a script. Nothing left the
  machine, but the claim was wider than the fact and that is the part worth
  recording.
- **Two gate runs failed before they passed, and both were load.** The first
  `npm test` this round reported 10 failures across 8 files (durations of 41s, 43s,
  61s), and the first emulator run reported 22 failures at a uniform 10,000 ms.
  Every one of those files passed solo, and the final full runs are 4757/0 and
  1293/0 on the same tree. Recorded rather than quietly re-run, because "it passed
  the second time" is only worth something if the first time is written down too.

## 6. What is waiting on you

Nothing blocking. Three things you may want to rule on, none of which stops
anything this week:

- **`brosh-hashanah`'s display name changed as a side effect** of R6-a, and
  shireishabbat flagged it: the moment now displays **`B'rosh Hashanah`** where it
  displayed `B'Rosh Hashanah Yikateivun`, because the new RH-morning occurrence
  broke a 1–1 tie 2–1. `.live` reads the name the moment carries, so this is what
  the reader and the overlays will show. The incipit form is still carried in the
  alias candidates, and reversing it is one word upstream — the unit id does not
  change either way.
- **The folio-56 kavannah still answers to the retired name.**
  `amidah.kdushat-hayom-kavannah@crc-rh-morning` sits on p.56 and its text is the
  kavannah *to Un'taneh Tokef*. R6-a named two units and this is a third. It is
  recorded upstream and corrected nowhere, and it is your call, not mine. On the
  `.live` side it is harmless today: the entry keeps its own name and its own page,
  and nothing resolves wrongly because of it.
- **Upstash is now a live external dependency of the production project.** Free
  tier, connected to production only. If the daily command budget is ever exceeded
  the public chart path fails closed and the general limiter goes back to
  per-instance counting — degraded, not broken, and nothing in the band's or the
  congregation's path is affected. Say the word if you would rather it were not
  there and I will take it back out and revert the switch in one pass.


# Round 6, second pass — the third id the ruling ended (2026-09-15)

You revised the order after I returned: `HANDOFF-CODE-ROUND-6-2026-09-15.md` and
`RULINGS-INTEGRATION-2026-09-14.md` were both rewritten at 17:40, two minutes
after the append above. Two things changed for `.live`. **R6-h** is new — the
kavannah on RH-morning p.56 is the kavannah *to* Un'taneh Tokef — and `.live`'s
`RETIRED_UNITS` is named in the ruling as the place that has to carry it. And
R6-d's item now lists **three** retirements rather than two. This section is that
second pass, run end to end, `[measured]`.

That third retirement is the item I closed the last section by flagging as yours
to rule on. You ruled it, and it took four minutes, so what I wrote as an open
question is now done rather than waiting.

## 1. What I consumed, and the honest caveat on it

shireishabbat's round-6 RETURN does **not** mention R6-h — it was last written at
15:27, and its `build/typst/` tree still has uncommitted modifications. But
`dist-app/` was rebuilt at **17:47:48**, after the ruling, and it carries the
ruling:

```
amidah.untaneh-tokef-kavannah@crc-rh-morning   folios [23]     printedFolio 56   "Un'taneh Tokef Kavannah"
amidah.untaneh-tokef@crc-rh-morning            folios [24,25]  printedFolio 56   "Un'taneh Tokef"
amidah.brosh-hashanah@crc-rh-morning           folios [25,26]  printedFolio 57   "B'rosh Hashanah"
```

and `grep -ro "kdushat-hayom[a-z-]*@crc-rh-morning" dist-app/` returns **nothing**.

So: I read a build whose lane had not yet written its return. I proceeded because
the artifact I consume is the feed, the feed is internally coherent, and the ids
are what I join on — a later rebuild moves the `gitSha`, not the ids. Recording
the timestamp so that if shireishabbat's own return later disagrees with this,
you can see exactly which build I read.

## 2. R6-d, second pass — the guard learns a third word, and is tested on refusing

`RETIRED_UNITS` gains the R6-h line beside R5-a's and R6-a's, in the same shape:
the retired id, the id it became, and the ruling that ended it. Nothing about the
guard was relaxed to accept it.

On the first run against the previous book, the guard printed exactly the line it
is supposed to print:

```
RULED ID RETIREMENTS ACCEPTED (1):
  R6-h amidah.kdushat-hayom-kavannah@crc-rh-morning ('K'dushat Hayom Kavannah' p.56)
       -> amidah.untaneh-tokef-kavannah@crc-rh-morning (p.56)
```

**And it still refuses without the listing.** I ran the negative control rather
than assume it: restored the pre-R6-h book, stripped the R6-h entry out of a copy
of the script, re-ran:

```
Error: 1 units in the previous book are absent from this one:
  amidah.kdushat-hayom-kavannah@crc-rh-morning ('K'dushat Hayom Kavannah' p.56).
```

That is the whole claim of R6-d in one pair of runs — the list is the only way
through, and the list is not a loophole.

### The name, which is the part the id move does not fix by itself

The retirement alone left the entry carrying the new id under the **old primary
name**: `K'dushat Hayom Kavannah`, pointing at p.56. Nothing resolved to a wrong
page — the kavannah and the prayer share p.56, so both names always meant 56 —
but the book would have been asserting as primary a name the ruling retired. This
is the same shape as the defect the first pass caught, without the page symptom to
make it visible.

So R6-h gets a `RULINGS.name` entry beside R6-a's two, and the owner keeps
everything it had. Final state:

```
crc-rh-morning  p.56  "Un'taneh Tokef Kavannah"
                aliases ["K'dushat Hayom Kavannah", "Kavannah for K'dushat Hayom",
                         "Hayom Kavannah", "Tokef Kavannah", "Kavannah for Un'taneh Tokef"]
                unitId  amidah.untaneh-tokef-kavannah@crc-rh-morning
```

Every name that resolved to p.56 before still resolves to p.56. A setlist typed
before the ruling keeps working. `Kavannah for Un'taneh Tokef` is minted to match
p.58's existing `Kavannah for K'dushah`, which is the book's own convention.

### The diff, against the book as it stood after the first pass

```
entries 209 -> 209
GONE     crc-rh-morning p.56  amidah.kdushat-hayom-kavannah@crc-rh-morning
NEW      crc-rh-morning p.56  amidah.untaneh-tokef-kavannah@crc-rh-morning
CHANGED  crc-rh-morning p.56  amidah.untaneh-tokef@crc-rh-morning  — gains the alias "Tokef"
changed-in-place 1
```

Three lines, all on p.56, no page anywhere in the volume moves. `no within-service
name collisions`; `aliases pruned 2`; 215 pages, maxFolio 215. The `"Tokef"` alias
appears because the kavannah's feed name changed and the qualifier pass re-derived
the service's stems; `Tokef` went to the prayer and `Tokef Kavannah` to the
kavannah, and the collision check confirms nothing is ambiguous.

### Test

`liturgy-lookup.test.ts` gains "moves the p.56 kavannah to the prayer it
introduces (R6-h)": the ruled name resolves to 56 on the new id, the **retired**
name still resolves to 56, the prayer's own id is not swallowed by the kavannah
sharing its page, and no entry carries the retired id. **34 tests pass in that
file** (33 before).

## 3. Rows on a retired id — and a correction to the number I gave you

**0 rows on any of the three retired ids. 0 rows referencing any kavannah at all.**

That conclusion is the same as the first pass. The basis is not, and this is the
correction: **the first pass swept 56 setlists. There are 84.** `list_setlists`
pages at a default of 20 and a maximum of 200, and the call I made on the first
pass returned 56 rather than everything. Re-swept with `limit: 200`:

| | first pass | this pass |
|---|---|---|
| setlists listed | 56 | **84** |
| fetched, all `ok:true` | 56 | **84**, 0 non-OK |
| rows | 1,472 | **1,559** |
| rows with `liturgyRef.unitId` | 144 | **144** |
| rows on a retired id | 0 | **0** |

The 28 I missed are older services, almost all with 0 tracks, the oldest from
January. The answer did not change. The claim I made was still a population claim
made on a partial population, which is the thing I am supposed to catch, and I
caught it only because raising the limit changed the count.

## 4. Binder dry, five setlists this time

Ran `propose_liturgy_bindings` with `dryRun: true` against `crc-machzor-2008` on
every Rosh Hashanah setlist, not the two of the first pass. Nothing written.

```
RH Day 2 — CRC Machzor — September 13      bound  0  plausible 0  unmatched 3  skipped 48
Alt Rosh Hashanah Day — September 12       bound  8  plausible 2  unmatched 5  skipped 67
RH Day Alt CRC Machzor                     bound  0  plausible 0  unmatched 3  skipped 50
Rosh Hashanah Day 2 — September 13         bound  8  plausible 2  unmatched 5  skipped 68
Rosh Hashanah Day — September 12           bound 20  plausible 2  unmatched 9  skipped  1
```

The ruled unit is reachable through the binder on all three that bind:

```
"B'Rosh Hashanah yikatevun"  ->  amidah.brosh-hashanah@crc-rh-morning  p.57
"B'rosh Hashanah"            ->  amidah.brosh-hashanah@crc-rh-morning  p.57
```

Those `bound` counts are proposals on rows that carry no `liturgyRef` yet, not
writes. Accepting them is yours; `dryRun` stayed true and no row was touched.

## 5. R6-g still did not land, so item 3 still did not run

Confirmed against the ruling text, which now records shireishabbat's stop clause:
the Selichot capture is a slide deck and a folded handout with **no printed page
on any of its 8 units**. **0 entries in `crc-machzor-2008` under a Selichot
service.** The `Selichot — September 5` setlist exists, 20 rows, **0 with any
`liturgyRef`**, and it stays that way until a paginated printed booklet is
captured. Nothing typed by hand on either side.

## 6. `today.json` and `reconcile_service`, re-run after the book change

Re-emitted through `GET /api/cron/emit-today`:
`{"ok":true,"results":[{"org":"crc","ok":true,"serviceCount":5},{"org":"brotherslazaroff","ok":true,"serviceCount":0}]}`.

Read back cache-busted from `/api/today`: **200, 2,110 bytes, five services** —
byte-for-byte the same shape and the same numbers as before the book changed:

```
2026-09-20T22:00Z  crc-kol-nidre   startFolio  98
2026-09-21T01:00Z  crc-kol-nidre   startFolio  98
2026-09-21T15:00Z  crc-yk-morning  startFolio 129
2026-09-21T22:00Z  crc-yizkor      startFolio 180
2026-09-21T23:00Z  crc-neilah      startFolio 188
```

Unchanged is the correct result: none of this week's five services is a Rosh
Hashanah morning, so R6-h has nothing to show here. The tests are the evidence,
not this file.

`reconcile_service` on the same September 5 setlist as the first pass, so the
numbers are comparable: **`ok: true`**, window 2026-09-05T13:30Z → 18:00Z, **34
rows, all `untracked`**, 0 chapters, `promoted: null`, same summary sentence. The
overlays host answers **200** at the root and its `/api/history` **401**s
unauthenticated, so the gate is intact and the zero is a real zero.

Also re-ran it on `Selichot — September 5`: `ok:true`, 20 rows, all untracked,
`promoted: null` — the same real zero, on the service that has no pages yet.

## 7. Credential handling this pass

`CRON_SECRET` is not in `.env.local` and was not on disk — the first pass deleted
every pulled env file, as reported. I pulled production config to
`<scratchpad>/r6b/prod.env` (never `.env.local`), read the one variable, made the
call, and deleted the file immediately; it is gone. The secret was never echoed,
never logged, and appears nowhere in this document.

## 8. Gates, second pass

`npm test` — **4,758 passed / 0 failed / 69 skipped (405 files)**, green on the
first run. `tsc --noEmit` clean. `eslint` **0 errors, 11 warnings**, the same
eleven pre-existing ones. `SKIP_ENV_VALIDATION=1 npx next build --webpack` clean.

**The emulator gate did not go green as a whole tonight, and I am not going to
round that up.** Three full-suite attempts:

| run | conditions | result |
|---|---|---|
| A | concurrent with the webpack build | 21 failed / 1,209 passed (93 files) |
| B | the 20 files from A, together | 15 failed / 384 passed |
| C | machine otherwise idle | 8 failed / 1,068 passed / 217 skipped |

Every failing file then passed in a small batch — **17 files, 344 tests, zero
failures**, including `mcp-liturgy-bindings.emulator.test.ts`, which is the one
in the set that touches this lane's subject at all.

What makes this diagnosable rather than alarming is that **the failing set is
different every run**: of the 16 files that failed in run C, **14 had passed in
run B**, and only 2 overlap. A real defect does not move. And the failure
signature is `Hook timed out in 10000ms` in `beforeEach` — 19 of the 21
failures in run C — which is the emulator not answering a collection wipe in
ten seconds, not an assertion about behaviour. The only two assertion failures
in any run were both in `http-executor.emulator.test.ts`, on a test whose whole
subject is a deadline (`stops at the deadline` — it processed 0 items instead
of 1 under load).

So: **no evidence of a regression, and no clean full emulator run to show you.**
This box could not hold 93 emulator files at once this evening. The earlier
round got 1,293/0 from the same suite on the same tree, which is the comparison
that makes tonight look like load rather than code.

## 9. Shipped

`c2d51a31ff` — *books: a third id ends with the ruling that renamed its page
(R6-h)* — on `master`, pushed, deployed to production. `/api/version` reports
`sha c2d51a31fff749caed798ecd11a9d3c0cb04a049`, so this is the running code and
not a same-commit redeploy I have to take on faith.

Two production builds ran, not one: my `vercel deploy --prod` and the Git
integration's build off the same push. Both landed on the same commit, so the
result is identical either way — worth knowing that a push here now builds twice.

**The chart path is unharmed by the redeploy** `[measured]`: select 200
`available` from `https://siddur.centralreform.org`, chart 200
`application/pdf`, 3,008 bytes, `Cache-Control: no-store`, ACAO echoed to that
one origin, `nosniff`, body beginning `%PDF-1.3`, and sha256
`da9ec13856f388c956594bd5ceaad8b6dad310854c66673ebb55728a60af64a2` — the same
bytes as the reviewed manifest, unchanged across the deploy. Foreign origin still
403. `/perform` 200.

One thing I got wrong on the way and am recording because it looked briefly like
a regression: my first probe used `shacharit.modeh-ani@crc-shabbat-shacharit`
and got `unavailable`. The unit is `awakening.modeh-ani@legacy-shabbat-morning`.
The endpoint was answering correctly the whole time — a unit with no approval row
is *supposed* to come back unavailable — and the fault was in my probe, not the
service.

## 10. Still waiting on you (one fewer than last time)

- **`brosh-hashanah` displays "B'rosh Hashanah".** You ruled this R6-i —
  *stands by default*, the Slichot incipit stays an alias candidate. Nothing to
  do; recorded so the change is not a surprise later.
- **The p.56 kavannah** — closed. That was R6-h, and it is done.
- **Upstash is still a live external dependency of the production project.**
  Free tier, production only, unchanged from the last section. The offer stands:
  say the word and I take it out and revert the switch in one pass.

# Round 7 — the binder writes, and the join key catches up (2026-09-15)

Order: `HANDOFF-CODE-ROUND-7-2026-09-15.md` §CentralReform.live, two items, plus
RULINGS Round 7. Both read at 18:41. Everything below is `[measured]`.

## 1. What R7-c asked for, and the one thing it turned up

R7-c: run the binder for real on the five Rosh Hashanah setlists, **`bound` rows
only** — empty rows gaining a page and a `momentId`. `plausible` rows are
Daniel's and stay unbound. Typed pages untouched.

That is exactly what the tool does with `dryRun:false` and no `accept` array, so
no argument had to be invented to get the ruled behaviour: *"A real run writes
`bound` plus only the `accept` rows."* No `accept` was passed on any of the five.

Re-ran the dry pass first rather than trusting round 6's, because six hours had
passed and these are setlists two people type into. It came back identical —
20 / 8 / 8 bound, same rows — which is also the confirmation that R7-c's stated
counts still described the live data at the moment I wrote.

The write then surfaced something the dry run could not: three rows took the
right unit id and the right page and came out **with no `momentId`**. That is
section 3, and it is the real work of this round.

## 2. R7-c — the binder run

Five setlists, `book: crc-machzor-2008`, `dryRun:false`, no `accept`:

| setlist | rows | bound → written | plausible | unmatched | skipped |
|---|---|---|---|---|---|
| `522ac356` Rosh Hashanah Day — September 12 | 32 | **20 → 20** | 2 | 9 | 1 |
| `35380072` Alt Rosh Hashanah Day — September 12 | 82 | **8 → 8** | 2 | 5 | 67 |
| `e7cf1877` Rosh Hashanah Day 2 — September 13 | 83 | **8 → 8** | 2 | 5 | 68 |
| `2b2cc0f5` RH Day 2 — CRC Machzor — September 13 | 51 | 0 | 0 | 3 | 48 |
| `a75093c5` RH Day Alt CRC Machzor | 53 | 0 | 0 | 3 | 50 |

`ok:true` on all five, `written` equal to `bound` on all five. **36 rows written.**

Per setlist, rows carrying a `liturgyRef.unitId`, before → after:

| setlist | unitId before → after | momentId before → after |
|---|---|---|
| `522ac356` | 0 → **20** | 0 → **20** |
| `35380072` | 56 → **64** | 0 → **8** |
| `e7cf1877` | 56 → **64** | 0 → **8** |
| `2b2cc0f5` | 0 → 0 | 0 → 0 |
| `a75093c5` | 0 → 0 | 0 → 0 |

**Typed pages untouched, checked and not assumed.** Before the write, 92 rows
across the five carried a `liturgyRef` with a `folio` and no `unitId` — a page
an author typed. After: still 92, and every one of them still on the same
folio. Zero changed. The two setlists that wrote nothing are the ones that are
almost entirely typed pages already (44 and 46 such rows), which is why the
binder had nothing to add to them and correctly said so.

Re-running the dry pass after the write returns `bound: 0` on all five. The
only proposals left standing are the six plausible rows, which is the ruled
outcome.

**The skip reasons the run actually used**, verbatim from the tool:
`header rows are never bound — a header is a sign, not a moment`,
`row type 'note' does not name a liturgical moment`, and
`already carries a liturgyRef — an author-typed page is never overwritten`.

## 3. The three rows that took an id and no moment

`amidah.brosh-hashanah@crc-rh-morning` is the id R6-a *minted*. Three rows took
it — correctly, at p.57, from the correct book — and came back with
`momentId: null`.

Not a binder fault. `src/data/books/moments.json` was still the **12:57:46Z
build off `d86de56`**, from before R5-a, R6-a and R6-h landed upstream. It had
never heard of `brosh-hashanah`, so `momentIdForUnit` had nothing to return and
the binder wrote nothing — the honest answer to a question asked of a stale
artifact, and the reason this did not fail loudly.

**Round 6 took one of two products of the same upstream build.** The book
(`crc-machzor-2008.json`) was regenerated from the rebuilt feeds; the moments
artifact, built by the same shireishabbat pipeline and consumed by this repo
through `npm run sync:books`, was not. Round 6's own order named only the book,
and I did not go looking. The stale file still asserted `untaneh-tokef` at
RH p.57 and YK p.148 — the pre-ruling pages — three rulings behind the book
sitting next to it.

`--check` first: `moments.json` **DIFFERS**, the three Shirei volumes `none`.
Then the real sync, from `dist-app/` at **23:08:35Z**, `fb5f347-LICENSED` — the
build that carries R6-h. Regenerated by the producer, never hand-edited.

The diff is the three rulings and nothing else:

| | occurrence | ruling |
|---|---|---|
| removed | `kdushat-hayom` @ crc-rh-morning p.56 | R6-a |
| removed | `kdushat-hayom` @ crc-yk-morning p.147 | R5-a |
| removed | `kdushat-hayom-kavannah` @ crc-rh-morning p.56 | R6-h |
| added | `brosh-hashanah` @ crc-rh-morning p.57 | R6-a |
| added | `brosh-hashanah` @ crc-yk-morning p.148 | R5-a |
| added | `untaneh-tokef-kavannah` @ crc-rh-morning p.56 | R6-h |
| moved | `untaneh-tokef` RH 57 → **56**, YK 148 → **147** | R6-a / R5-a |

224 → **225** moments, **453 occurrences unchanged**, 9 books, pins verified and
printed-page counts asserted by the script. `kdushat-hayom` survives as a moment
— the Shabbat volumes still print it — and loses only its two machzor
occurrences. Moment ids gone: `kdushat-hayom-kavannah`. New: `brosh-hashanah`,
`untaneh-tokef-kavannah`.

**Nothing was broken in the meantime.** `src/lib/performed/reconcile.ts:54`
reads `row.momentId ?? momentIdForUnit(row.liturgyRef?.unitId)` — it falls back
to live derivation, so the cue-log join kept working off the unit id. What was
missing is the *stored* key.

**Re-deriving the three, without hand-editing anything.** `update_track`'s patch
accepts `liturgyRef` and does not accept `momentId` — correctly, since the key
is derived and a key a person can type is a key that can be wrong. So the fix is
to re-assert the identical ref and let `setlist-write.ts:842` do what it does
for a page an author typed: *"A page the caller typed still gets to say what it
is about. The ref is untouched — only the join key follows it."* Same book, same
unit id, same folio 57, passed back verbatim with the row's `lastSeenVersion`.

| setlist | row | after |
|---|---|---|
| `35380072` | B'Rosh Hashanah yikatevun | `momentId: brosh-hashanah`, ref unchanged, v5 → v6 |
| `522ac356` | B'rosh Hashanah | `momentId: brosh-hashanah`, ref unchanged, v1 → v2 |
| `e7cf1877` | B'Rosh Hashanah yikatevun | `momentId: brosh-hashanah`, ref unchanged, v3 → v4 |

All 36 written rows now carry a moment.

## 4. Plausible rows — yours, unbound

Six rows, three distinct questions. None of these were written. To bind one,
name it back to me and I pass it in `accept`.

| setlist | row title | candidate | page | confidence |
|---|---|---|---|---|
| `522ac356` | Kedishat Hayom – Un'taneh Tokef | `amidah.untaneh-tokef@crc-rh-morning` | 56 | 58 |
| `522ac356` | Hakafot – Nigun 5 | `torah.hakafot@crc-rh-morning` | 66 | 53 |
| `35380072` | The Great Aleinu | `concluding.aleinu@crc-rh-morning` | 86 | 53 |
| `35380072` | Blessing over the Shofar & Shehecheyanu | `shofar.service@crc-rh-morning` | 80 | 50 |
| `e7cf1877` | The Great Aleinu | `concluding.aleinu@crc-rh-morning` | 86 | 53 |
| `e7cf1877` | Blessing over the Shofar & Shehecheyanu | `shofar.service@crc-rh-morning` | 80 | 50 |

Each has exactly one alternative — the binder is not torn between candidates,
it is unsure the row's wording means that moment. Two are worth your eye:

- **"Kedishat Hayom – Un'taneh Tokef"** is the row R6-a is about. The title
  still carries the capture's old name, and the candidate is the post-ruling id
  at the post-ruling page. Binding it would put the ruling onto the row. It is
  also the row most likely to want *renaming* rather than binding.
- **"The Great Aleinu"** — "Great" is the band's word for it, not the book's.
  If that is your standing name for the moment, the honest fix is an alias in
  the book rather than a bind here, and then it binds itself next time.

## 5. A larger gap, measured, not touched

Sweeping all **84** production setlists (`limit:200`, not the default 20) after
the write: **1,559 rows**, **180** carrying a `liturgyRef.unitId`, **68** with a
stored `momentId` — and **112 with a unit id and no moment**.

All 112 are `shirei-tshuvah` rows. All 112 resolve to a real moment against the
freshly synced artifact — checked one by one, not sampled. They are rows written
before the derivation was wired in, not rows the derivation refuses.

**0 rows on any of the three retired ids**, unchanged from round 6 and now with
`moments.json` agreeing with the book about what the live ids are.

I have not backfilled them. That is 112 writes across your setlists to populate
a cache the read path already recomputes, and it is not what R7-c asked for. It
is a clean one-pass job through the same `update_track` seam used above, and I
will run it on a word.

## 6. `today.json` and the chart path

First emit returned `{"ok":true,"skipped":"already_running"}` — a lock, not a
failure. Waited and re-fired:

```
{"ok":true,"results":[{"org":"crc","ok":true,"serviceCount":5},
                      {"org":"brotherslazaroff","ok":true,"serviceCount":0}]}
```

Read back at `https://www.centralreform.live/api/today` — **200**, 2,110 bytes,
`application/json`, `generatedAt 2026-09-16T00:06:01.464Z`, five services:

| service | reader book | startFolio |
|---|---|---|
| Kol Nidre Alternative Service — September 20 | `crc-kol-nidre` | 98 |
| Kol Nidre — September 20 | `crc-kol-nidre` | 98 |
| Yom Kippur Morning — September 21 | `crc-yk-morning` | 129 |
| Yizkor — September 21 | `crc-yizkor` | 180 |
| Neilah — September 21 | `crc-neilah` | 188 |

Same five, same folios as the last section.

Chart path, `awakening.modeh-ani@legacy-shabbat-morning`, after the deploy:

| # | probe | result |
|---|---|---|
| 1 | `POST …/select`, Origin `https://siddur.centralreform.org` | **200** `status:"available"`, `kind:"pdf"`, `contentType:"application/pdf"` · ACAO that one origin · `no-store` · `Vary: Origin` |
| 2 | `GET …/chart?unitId=…` same origin | **200** · `application/pdf` · 3,008 bytes · `no-store` · `inline` · `nosniff` · single ACAO |
| 3 | `GET …/chart` for `amidah.brosh-hashanah@crc-rh-morning` | **404** |
| 4 | Origin `https://evil.example` | **403** on select **and** on chart |

sha256 `da9ec13856f388c956594bd5ceaad8b6dad310854c66673ebb55728a60af64a2`,
first bytes `%PDF-1.3` — byte-identical to the round-6 measurement and to the
reviewed manifest. 200 / 200 / 404 / 403 as ordered.

For probe 3 I used a unit that exists in the book and has no approval row,
rather than an invented id — a 404 for a string nobody could ever request
proves less than a 404 for one that resolves.

## 7. Credentials

`CRON_SECRET` is not in `.env.local`. Pulled production config to
`<scratchpad>/r7/prod.env`, read the one variable into a shell variable, and
`rm`'d the file in the same command before the first request went out — the
retry loop ran off the variable, never off disk. Confirmed gone. The value is
not in this document, not in any log, and not in any commit. No `.env` file
exists anywhere under the scratchpad.

## 8. Gates `[measured]`

| gate | result |
|---|---|
| `tsc --noEmit` | clean, 0 lines |
| `npx eslint .` | **0 errors**, 11 warnings (all pre-existing unused-disable directives) |
| `SKIP_ENV_VALIDATION=1 npx next build --webpack` | compiled successfully in 28.5 s |
| `npm test` | 4,752 passed / **3 failed** / 72 skipped (405 files) — then **4 / 4 files, 33 / 33 tests green solo** |

The four red files were `route-auth`, `perform/page`, `text-score-viewer` and
PDFOverlay `async-safety` — two of them 30,000 ms timeouts, none of them within
a hundred miles of liturgy, moments or bindings. All four pass on a re-run of
just those files. That is the known load-flake baseline, not a regression, and I
am calling it that because I re-ran it, not because it looks like it.

I did not run the emulator suite this round. Nothing in this change touches a
Firestore rule or an emulator-tested path — the commit is one data file — and
the full emulator gate was already reported red-and-diagnosed in the last
section. It is still owed a clean run; it is not owed one by this change.

## 9. Shipped

| commit | what |
|---|---|
| `f084e9c058` | books: sync moments.json so the join key follows the rulings (R7-c) |

Pushed to `origin master`. Deployed by the Git integration — I did not fire a
second `vercel deploy --prod` this time, which is the double-build noted under
R6-e; one build, one deployment. `/api/version` polled until it turned over:

```
{"sha":"f084e9c05861dba5b46d42a8e63c7c68b5fa94bc","builtAt":"9/15/2026","version":"11.7.0"}
```

Both binder writes and the three re-derivations were made **after** that sha was
live, so every `momentId` written came from the current artifact.

Working tree clean apart from untracked `work/` scratch. HEAD and `origin/master`
both at `f084e9c058`.

## 10. Still waiting on you

- **The six plausible rows in section 4.** Nothing is blocked; they simply stay
  unbound until you name them. The two worth a look are "Kedishat Hayom –
  Un'taneh Tokef" (the row R6-a is about, still titled the old way) and "The
  Great Aleinu" (probably wants a book alias, not a bind).
- **112 `shirei-tshuvah` rows with a unit id and no stored `momentId`**
  (section 5). Harmless today because the read path re-derives. One pass fixes
  them; say the word.
- **Upstash is still a live external dependency of the production project.**
  Free tier, production only, unchanged. The offer stands: say the word and I
  take it out and revert the switch in one pass.

# Round 8 — the gap closes, the band's name is written down (2026-09-16)

Four items, all four done. Two commits, `b265e8b8d5` and `cd6c78a1b9`, both
live. Every number below is `[measured]`.

## 1. What round 8 asked, and what it cost

R8-a and R8-b were both already scoped by round 7's own measurements, so this
round had no discovery in it — it had execution, and one gate that was owed and
came back red for a reason worth writing down (section 6).

## 2. R8-a — the 112 rows

The offer in round 7's section 10 was one pass through the `update_track` seam:
re-assert each row's own `liturgyRef` verbatim and let `setlist-write.ts:842`
derive the key. That is what ran. No page moved, no ref was retyped, no row was
created or reordered.

Before, across all 84 setlists (`list_setlists limit:200`, every id fetched):

| | rows | with `unitId` | with stored `momentId` | missing | typed-page-only |
|---|---|---|---|---|---|
| before | 1,559 | 180 | 68 | **112** | 167 |
| after | 1,559 | 180 | **180** | **0** | 167 |

All 112 were `shirei-tshuvah`, all in two setlists:

| setlist | rows | `unitId` | `momentId` before → after | backfilled |
|---|---|---|---|---|
| `35380072` Alt Rosh Hashanah Day — Sept 12 | 82 | 64 | 8 → 64 | 56 |
| `e7cf1877` Rosh Hashanah Day 2 — Sept 13 | 83 | 64 | 8 → 64 | 56 |

112 calls, 112 successes, 0 errors, 0 stale-version refusals — every call
pinned `lastSeenVersion` to that row's own version and every version went up by
exactly one. 52 distinct moments across 54 distinct units.

The integrity check is the one that matters, and it was done by comparison, not
assertion: every row of all 84 setlists was re-fetched afterwards and matched to
its before-image by row id.

- `liturgyRef` **byte-identical on all 112** — the write path returns the stored
  ref and each one `JSON.stringify`-equals what was sent.
- **0** existing `liturgyRef`s changed anywhere in the corpus.
- **167** typed-page rows before, **167** after, **0** with a changed folio and
  **0** that gained a unit id. A typed page is still entirely the author's.
- **112** rows gained a moment; none lost one.

## 3. R8-b — the six rows, one at a time

Re-ran the dry pass first. The six were exactly the six round 7 reported, same
rows, same candidates, same confidences — nothing had moved under me.

Three were ruled bindable and were passed back through `accept` with
`dryRun:false`. `bound` was empty on all three setlists, so `written` counts
only the accepted rows:

| setlist | row | title | → | page | `momentId` |
|---|---|---|---|---|---|
| `522ac356` | `26fdf230` | Kedishat Hayom – Un'taneh Tokef | `amidah.untaneh-tokef@crc-rh-morning` | 56 | `untaneh-tokef` |
| `35380072` | `d709ca94` | Blessing over the Shofar & Shehecheyanu | `shofar.service@crc-rh-morning` | 80 | `service` |
| `e7cf1877` | `4f7f98f0` | Blessing over the Shofar & Shehecheyanu | `shofar.service@crc-rh-morning` | 80 | `service` |

`written: 1` on each, `ok: true`, and each row re-read afterwards to confirm the
ref and the key actually landed rather than trusting the count.

**One thing to hand back up the chain.** The Shofar rows' join key is literally
`service`, display "Service" — the moment id `emit_moments.py` derives from the
stem of `shofar.service`. It is unique today (one occurrence, this unit), so
nothing resolves wrongly and the binding is correct. But "Service" is a name
that means nothing away from its unit, and it is the kind of id that collides
the first time another service's generic unit lands beside it. That is a corpus
decision in shireishabbat, not a page decision here, so I have not touched it —
recording it for whichever round takes the moments corpus (`shofar-service`
would be the obvious form).

"Hakafot – Nigun 5" stays unbound, as ruled. It is still the only `plausible`
row left anywhere in the five setlists.

## 4. The alias, and what it cost the book

"The Great Aleinu" scored **53** against "Aleinu" — plausible, unbindable — so
two rows sat empty with the page they wanted three words away. Nothing
mechanical reaches it: the qualifier-stripping pass only strips a leading word
that begins two or more of a service's names, and "The Great" is not that.

So it went in as data, with the ruling attached, in the one place the book
allows a name that did not come from the capture — `RULINGS.name` in
`scripts/emit-machzor-book.mjs`:

```js
{
    service: "crc-rh-morning",
    name: "Aleinu",
    also: ["The Great Aleinu"],
    unitId: "concluding.aleinu@crc-rh-morning",
    ruling: "R8-b",
},
```

`name` is the entry's existing primary name on purpose: the ruling adds a name
and changes nothing else. The regeneration bears that out — **0 other entries
move**, 209 entries (was 209), 215 pages, `maxFolio` 215, no within-service name
collisions, and the whole diff is three lines:

```
             "name": "Aleinu",
             "aliases": [
                 "Adoration",
-                "Aleinu L'shabeiach"
+                "Aleinu L'shabeiach",
+                "The Great Aleinu"
             ],
             "page": 86,
```

After the deploy, the binder was re-run on both setlists. The rows moved from
`plausible` to `bound` at **confidence 100, `via: "The Great Aleinu"`**, and a
plain `dryRun:false` with no `accept` wrote them — which is the point of an
alias rather than an accept: the next time anyone types the band's name for that
page, it binds by itself.

| setlist | row | before | after |
|---|---|---|---|
| `35380072` | `62d124e1` | plausible 53, `ref: null`, `momentId: null` | bound 100 → p.86, `momentId: aleinu` |
| `e7cf1877` | `3bccad78` | plausible 53, `ref: null`, `momentId: null` | bound 100 → p.86, `momentId: aleinu` |

Corpus after everything: **1,559 rows, 185 with a unit id, 185 with a stored
`momentId`, 0 missing, 167 typed pages untouched, 0 rows on any retired id.**

## 5. Item 3 — one build, two products, and now it says so

`emit-machzor-book.mjs` ends by running `sync-books.mjs --check` and printing
the verdict:

```
MOMENTS ARTIFACT (sync-books.mjs --check): │ 0 │ 'moments.json' │ 225 │ 473 │ 9 │ 'none' │
  moments.json agrees with this book. Nothing owed.
```

and, when it does not:

```
  moments.json DOES NOT agree with this book. Run `npm run sync:books` —
  one build, two products, and the join key is the other one.
```

Both branches were exercised, the second by perturbing the committed artifact
and restoring it — a report I have not seen fire is a report I have not tested.
It reports and does not write: one script, one output file, so a regeneration
still cannot quietly rewrite a second artifact.

One thing had to be fixed for that signal to be worth reading. `sync-books.mjs`
compared bytes, and it writes LF while `core.autocrlf` hands the working copy
back with CRLF — so a file freshly checked out reported `DIFFERS` although it is
identical in every commit either version would produce. That was tolerable while
only I read it; it is not tolerable now that a regeneration prints it as advice.
Both drift call sites now compare content.

`npm run sync:books` ran for real after the book was regenerated, per the new
standing rule. All four artifacts `drift none` — nothing moved, because no page
moved.

## 6. The emulator gate, run — and why it came back red

It was owed, so it ran, on a box doing nothing else. First full run:

```
Test Files  12 failed | 81 passed (93)
     Tests   9 failed | 1230 passed | 54 skipped (1293)
```

Twelve files is not a flake you wave at, so I read them. **Every single failure
was `Hook timed out in 10000ms`** — in a `beforeAll` or `beforeEach`, never in a
test body. Re-running exactly those twelve files together against the same
emulator: **12 files, 157 tests, all green.** So the red is a contention ceiling
on one emulator serving 93 files, reported as twelve defects.

The cause is one line the config never got. It already cushions `testTimeout` to
30 s, with a comment saying why — "emulator round-trips can be ~5s on cold
cache" — but the round-trips in this suite are in the *hooks*: they seed
documents and mint rules contexts. Hooks were left at vitest's 10 s default.
Matching them to the cushion the comment already argued for is `cd6c78a1b9`; the
test bodies keep their own 30 s, so a genuinely slow assertion still shows.

Full suite after the change, same box:

```
Test Files  93 passed (93)
     Tests  1293 passed (1293)      98.0 s
```

The emulator gate is green and no longer owed.

## 7. `today.json` and the chart path

Emit succeeded on the first request this time — no lock:

```
{"ok":true,"results":[{"org":"crc","ok":true,"serviceCount":5},
                      {"org":"brotherslazaroff","ok":true,"serviceCount":0}]}
```

Read back at `/api/today` — **200**, 2,110 bytes, `generatedAt
2026-09-16T01:34:15.815Z`, the same five services at the same folios as the last
two sections: Kol Nidre Alternative 98, Kol Nidre 98, Yom Kippur Morning 129,
Yizkor 180, Neilah 188.

Chart path, `awakening.modeh-ani@legacy-shabbat-morning`:

| # | probe | result |
|---|---|---|
| 1 | `POST …/select`, Origin `https://siddur.centralreform.org` | **200** `status:"available"`, `kind:"pdf"` · ACAO that one origin · `no-store` · `Vary: Origin` |
| 2 | `GET …/chart?unitId=…` same origin | **200** · `application/pdf` · 3,008 bytes · `no-store` · `inline` · `nosniff` · single ACAO |
| 3 | `GET …/chart` for `amidah.brosh-hashanah@crc-rh-morning` | **404** |
| 4 | Origin `https://evil.example` | **403** on select **and** on chart |

sha256 `da9ec13856f388c956594bd5ceaad8b6dad310854c66673ebb55728a60af64a2`,
`%PDF-1.3` — byte-identical to rounds 6 and 7 and to the reviewed manifest.
200 / 200 / 404 / 403 as ordered.

## 8. Credentials

`CRON_SECRET` is still not in `.env.local`. Pulled production config to
`<scratchpad>/r8/prod.env`, read the one variable into a shell variable, and
`rm`'d the file in the same command before the first request went out. Final
sweep: no `.env` file of any name anywhere under the scratchpad. Nothing was
echoed into this document or into any log.

## 9. Gates `[measured]`

| gate | result |
|---|---|
| `tsc --noEmit` | clean |
| `npm run lint` | **0 errors**, 11 warnings (the standing pre-existing set) |
| `SKIP_ENV_VALIDATION=1 npx next build --webpack` | compiled successfully, 48 s |
| `npm test` | 4,748 passed / **4 failed** / 75 skipped (405 files) |
| the 4 red files, re-run solo | **4 files, 42 tests, all green** |
| `npm run test:emulator` | **93 files, 1,293 tests, 0 failures** (after `cd6c78a1b9`) |
| targeted: `sync-books-moments` + `liturgy-lookup` | 44 tests, green |

The four unit failures were `respond.test.ts`, `text-score-viewer`,
`SetlistGrid.read` and `SetlistGridHydrator` — the load-flake baseline, none of
them near liturgy, moments or bindings, and re-run before being called flake
rather than because they looked like it.

## 10. Shipped

| commit | what |
|---|---|
| `b265e8b8d5` | books: "The Great Aleinu" is the band's name for p.86 (R8-b), and one build means two products |
| `cd6c78a1b9` | test: cushion the emulator suite's HOOKS the way its test bodies already are |

Pushed `f084e9c058..cd6c78a1b9`. The Git integration built it; I did not also
fire `vercel deploy --prod`, so it was one build and one deployment.

```
{"sha":"cd6c78a1b95968b3e12bfc0da466056c1cb7e947","builtAt":"9/16/2026","version":"11.7.0"}
```

Both Aleinu binds were written **after** that sha was live, so the alias they
matched on is the deployed one. R8-a and the three accepts ran before the push
and needed nothing from it — they touch no book data.

Working tree clean apart from untracked `work/` scratch. HEAD and `origin/master`
both at `cd6c78a1b9`.

## 11. Still waiting on you

- **"Hakafot – Nigun 5"** stays unbound, as ruled — the last plausible row in
  the five setlists. Nothing is blocked by it.
- **The moment id `service`** (section 3). A corpus-lane naming question, not a
  page question. Flagging it, not fixing it.
- **Upstash is still a live external dependency of the production project.**
  Free tier, production only, unchanged. The offer stands: say the word and I
  take it out and revert the switch in one pass.

# Round 10 — the aliases are ruled, the build that carries them has not run (2026-09-16)

Three items. **Item 3 is done. Items 1 and 2 are blocked on the shireishabbat
launch that this round's handoff puts first, and it has not run** — so this
section reports what I measured, what I proved about the blocker, and the
before-baseline that item 2's "report rows that move" needs on the other side.
Nothing was committed, nothing was written to a setlist, nothing was bound.
Every number is `[measured]`.

## 1. The blocker, measured before anything else

The round-10 handoff orders shireishabbat first and `.live` after, and it is
right to: both of my first two items consume that build. It has not happened.

| | expected after the shireishabbat launch | measured now |
|---|---|---|
| shireishabbat `HEAD` | a round-10 commit | **`ce41509`** (2026-09-15, the round-6 addendum) |
| `dist-app/moments.json` `sources[].gitSha` | a new sha | **`fb5f347-LICENSED`** (built 2026-09-15T23:08:35Z) |
| aliases in `dist-app/moments.json` | 64 stems / 140 aliases | **25 stems / 77 aliases** (batch 1) |
| `shofar.shofar-service@crc-rh-morning` | present | **absent** — the feed still carries `shofar.service@crc-rh-morning`, moment `service` |
| `liturgy-map/moment-aliases.json` | committed and wired | present, **64 stems / 140 aliases**, and **uncommitted** (working-tree modified at `ce41509`) |

So the alias file Cowork compiled exists and reads correctly — its `batches`
note records "2-3: confirmed by Daniel 2026-09-16 on the rulings page: all
defaults" — but nothing has consumed it, and the rename R9-b ordered has not
been made.

`.live` is in sync with the upstream it actually has. `npm run sync:books --
--check`, all four artifacts:

```
shabbat-maariv 48/68/69 none · shabbat-shacharit 94/143/144 none · shirei-tshuvah 122/182/184 none
moments.json   225 moments · 473 occurrences · 9 books · none
```

## 2. Item 1 — what is true today, and the refusal that proves the order

The half of item 1 that does not need the new build was run. Full sweep, all 84
setlists (`list_setlists limit:200`, every id fetched):

| setlists | rows | with `unitId` | with `momentId` | missing | typed-page-only | **on a retired id** |
|---|---|---|---|---|---|---|
| 84 | 1,559 | 185 | 185 | 0 | 167 | **0** |

Identical to where round 8 left it. The two rows R9-b will move are where round
8 wrote them, both on `shofar.service@crc-rh-morning` p.80, moment `service`:

| setlist | row | version |
|---|---|---|
| `35380072` Alt Rosh Hashanah Day | `d709ca94` | 4 |
| `e7cf1877` Rosh Hashanah Day 2 | `4f7f98f0` | 2 |

I did not add the `RETIRED_UNITS` entry, because the generator is built to
refuse it and it does. Staged locally and run — not committed, reverted in the
same command:

```
Error: 1 unit id(s) listed as retired are present in the new feeds:
shofar.service@crc-rh-morning (R9-b). Either the capture reverted or the
retirement is wrong — resolve by hand.
```

That is `emit-machzor-book.mjs` doing exactly its job: a retirement asserts an
id is gone, and asserting it while the feed still publishes the id is a lie the
script will not write into the book. The entry lands the hour the upstream
rename does, and not before.

Owed, in one pass, when shireishabbat round 10 is in: the `RETIRED_UNITS` row,
the regeneration, `npm run sync:books` (the script now says so itself), the two
`update_track` re-points to the successor with `momentId` `shofar-service` and
pages untouched, and the sweep again.

## 3. Item 2 — the before-baseline, and one thing the round needs to know

### The dry runs

Nine dry runs, nothing accepted, nothing written. Four Shabbat templates against
the booklet their type names, five future setlists (every setlist with an
`eventDate` on or after today — the Yom Kippur services) against the machzor:

| | book | bound | plausible | unmatched | skipped |
|---|---|---|---|---|---|
| Shir Shabbat | `crc-friday` | 0 | 0 | 5 | 10 |
| Standard Friday Night — Kabbalat Shabbat | `crc-friday` | 0 | 0 | 3 | 27 |
| Randy Shabbat morning | `crc-saturday` | 0 | 0 | 1 | 32 |
| B'nai Mitzvah service | `crc-saturday` | 0 | 0 | 2 | 34 |
| Kol Nidre — Sept 20 | `crc-machzor-2008` | 0 | 0 | 3 | 25 |
| Kol Nidre Alternative — Sept 20 | `crc-machzor-2008` | 0 | 1 | 11 | 11 |
| Yom Kippur Morning — Sept 21 | `crc-machzor-2008` | 0 | 0 | 5 | 30 |
| Neilah — Sept 21 | `crc-machzor-2008` | 0 | 2 | 12 | 10 |
| Yizkor — Sept 21 | `crc-machzor-2008` | 0 | 0 | 1 | 7 |

46 rows not bound in total, 3 of them plausible. That is the *before* half of
"report rows that move"; the *after* half is owed with the build.

### What the alias batches would actually reach

Then I measured the batches against the binder itself rather than guessing.
Building every lookup table the binder can build — 10 scopes, **584 folded
spellings** — and folding all 140 spellings in `moment-aliases.json` against it:

- **134 of 140 are already in the lookup.** They are the printed spellings, and
  the printed spellings are where the pagemap books got their names in the first
  place. The batches are largely a corpus-side record of what `.live` can
  already match.
- **6 are not:** "Hayom Harat Olam · Shofarot", "Hayom Harat Olam · Zichronot",
  "Mourner's Kaddish Kavannah", "Please Be Seated · Sh'ma", "Tahor Lev",
  "V'shamru Kavannah".
- **0 rows in the corpus carry any of those 6.** Not among the 46 unbound rows
  of the nine dry runs, and not among any of the 1,559 rows.

### The thing worth handing back up

**Moment aliases have no wire into the binder.** `liturgyLookup` builds its name
table from `fixed-liturgy.<book>.json`, the two CRC booklet pagemaps and
`crc-machzor-2008.json`; `moments.json` is read only for the join key
(`momentIdForUnit`) and for rebooking. A name that exists *only* as a moment
alias never reaches a match, in any book — that was already true of batch 1, and
syncing batches 2 and 3 will not change it. The path that does work is the one
round 8 used for "The Great Aleinu": a name on the **book entry**.

It is not a theoretical gap. One row shows it, and it is on a service five days
out:

| setlist | row | binder today | what the alias says |
|---|---|---|---|
| Neilah — Sept 21 | "Priestly Blessing" | **plausible 58**, via the word "Blessing", → `havdalah.closing-blessing@crc-neilah` p.211 | "Priestly Blessing" is an alias of `closing-blessing` |

The alias agrees with the binder's own guess and would name it exactly — and
will not, because the alias lives in the moments artifact and the binder reads
books. Whether that wire should exist is a design call I am not making
unilaterally; if you want it, the clean form is the one the machzor already has
(names on entries, carried by the build), not a second matcher.

### "Prayer for Peace"

Ruled to answer *plausible*, never *clear*. In `.live` the spelling is already a
pagemap alias in three tables, and the honest report is that it is **clear in two
of them today** — because those books print only one of the two stems:

| table | today |
|---|---|
| `crc-friday` | **clear 100** → "Prayer for Shalom" p.35 |
| `crc-saturday` | **clear none; plausible** → "Oseh Shalom" p.82 (100) and "Prayer for Shalom" p.90 (100) |
| `crc-machzor-2008` \| `crc-rh-morning` | **clear 100** → `concluding.prayer-for-shalom@crc-rh-morning` p.83 |

`crc-saturday` — the one book that prints both — does exactly what the ruling
asks, and gets there with no new data: `assemble()` drops a top match to
plausible when another entry ties it on a different page. Where only one stem is
printed there is nothing to be ambiguous about, and the binder binds it. **0
rows anywhere are titled "Prayer for Peace"**, so nothing has been written on
the strength of this either way. The ruling's clause is addressed to
shireishabbat's `unit-lookup`; I am recording `.live`'s behaviour rather than
changing it, because narrowing a clear bind to plausible in a book that prints
one stem is a decision about what the band sees, not a bug.

## 4. Item 3 — `today.json` and the chart path

Emit succeeded on the first request:

```
{"ok":true,"results":[{"org":"crc","ok":true,"serviceCount":5},
                      {"org":"brotherslazaroff","ok":true,"serviceCount":1}]}
```

Brothers Lazaroff is **1** where every prior round read 0 — a dated service of
theirs is now inside the window. Nothing about it is `.live`'s liturgy work;
noting it because the number changed.

Read back at `/api/today`: **200**, 2,110 bytes, `generatedAt
2026-09-16T15:47:33.846Z`, the same five services at the same folios as rounds 7
and 8 — Kol Nidre Alternative 98, Kol Nidre 98, Yom Kippur Morning 129, Yizkor
180, Neilah 188.

Chart path, `awakening.modeh-ani@legacy-shabbat-morning`:

| # | probe | result |
|---|---|---|
| 1 | `POST …/select`, Origin `https://siddur.centralreform.org` | **200** `status:"available"`, `kind:"pdf"` · ACAO that one origin · `no-store` · `Vary: Origin` |
| 2 | `GET …/chart?unitId=…` same origin | **200** · `application/pdf` · 3,008 bytes · `no-store` · `inline` · `nosniff` · single ACAO |
| 3 | `GET …/chart` for `amidah.brosh-hashanah@crc-rh-morning` | **404** |
| 4 | Origin `https://evil.example` | **403** on select **and** on chart |

sha256 `da9ec13856f388c956594bd5ceaad8b6dad310854c66673ebb55728a60af64a2`,
`%PDF-1.3` — byte-identical to rounds 6, 7 and 8.

`CRON_SECRET` is still not in `.env.local`. Pulled production config to the
scratchpad, read the one variable into a shell variable, and `rm`'d the file in
the same command before the first request. No `.env` file of any name is left
anywhere under the scratchpad, and nothing was echoed into this document or into
a log.

## 5. Shipped

**Nothing.** No commit, no push, no deploy. `HEAD` and `origin/master` are both
still `cd6c78a1b9`, `/api/version` reports that sha, and the working tree is
clean apart from the untracked `work/` scratch. The two probe test files I wrote
to measure the lookup were deleted after they reported; the `RETIRED_UNITS`
experiment was reverted in the command that ran it. Gates are not owed for a
round with no diff.

## 6. What unblocks this, and what is still yours

- **Launch shireishabbat round 10.** The moment its four items land — aliases
  wired, `shofar.service` → `shofar.shofar-service`, R6-j, a rebuilt `dist-app/`
  with a new `sources[].gitSha` — items 1 and 2 here are one pass: retirement
  row, regenerate, sync, two `update_track` re-points, sweep, and the nine dry
  runs again against the before-baseline in section 3.
- **The alias wire** (section 3). Moment aliases do not reach the binder in any
  book. Say whether you want them to; "Priestly Blessing" on Neilah is what it
  costs to leave it.
- **"Prayer for Peace"** is clear in `crc-friday` and `crc-rh-morning`, plausible
  in `crc-saturday`. Tell me if you want it plausible everywhere.
- **"Hakafot – Nigun 5"** stays unbound, as ruled.
- **Upstash** is still a live external dependency of the production project, free
  tier, unchanged. The offer stands.

# Round 11 — round 10 runs, and a row that moved with nobody moving it (2026-09-16)

Five items, all five done, four commits, all live. shireishabbat `e5a87e3` is
the build the whole round stands on, and it exists now: `dist-app/moments.json`
built 2026-09-16T16:17:10Z from `e5a87e3-LICENSED`, 64 stems / 140 aliases,
`shofar-service` present and `service` gone. Every number below is `[measured]`.

The round found something it was not sent to find, and it is section 4.

## 1. Item 1 — round 10's `.live` section, now that it can run

`RETIRED_UNITS` has a fourth row and the generator did the rest. The whole book
diff is **one line** — the unit id on p.80:

```
-            "unitId": "shofar.service@crc-rh-morning"
+            "unitId": "shofar.shofar-service@crc-rh-morning"
```

Page 80 before, page 80 after. Name "Shofar Service" unchanged, aliases
unchanged, 209 entries (was 209), 215 pages, `maxFolio` 215, no within-service
name collisions, and the generator printed the retirement it accepted:

```
RULED ID RETIREMENTS ACCEPTED (1):
  R9-b shofar.service@crc-rh-morning ('Shofar Service' p.80) -> shofar.shofar-service@crc-rh-morning (p.80)
```

**Round 8's item-3 signal fired in anger for the first time.** The regeneration
ended with `moments.json DOES NOT agree with this book. Run npm run sync:books`
— and after the sync, `none`. That is the whole point of it: one build, two
products, and the second one said so itself instead of going stale for three
rulings the way it did between rounds 6 and 7.

`moments.json` after the sync: 225 moments either way, `service` →
`shofar-service`, sources `fb5f347` → `e5a87e3`, and the alias batches arrive
with it — **16 stems / 53 aliases → 43 stems / 97 aliases** (the trim to the
nine books `.live` carries; upstream is 64/140).

The two rows were re-pointed through the MCP write path **after** the deploy, so
the successor they name is the one production knows:

| setlist | row | before | after |
|---|---|---|---|
| `35380072` Alt Rosh Hashanah Day | `d709ca94` | `shofar.service@…` p.80, moment `service`, order 64, v4 | `shofar.shofar-service@…` p.80, moment `shofar-service`, order 64, **v5** |
| `e7cf1877` Rosh Hashanah Day 2 | `4f7f98f0` | same, order 65, v2 | same, order 65, **v3** |

Folio identical on both, `momentId` derived by the write path, **order
unchanged, and the entire row sequence of both setlists byte-identical before
and after** — which is R11-b's property, asserted on the only two writes this
round makes to Daniel's data.

Sweep of all 84 setlists afterwards, four retirements in the list:

| setlists | rows | with `unitId` | with `momentId` | missing | typed-page-only | **on a retired id** |
|---|---|---|---|---|---|---|
| 84 | 1,558 | 185 | 185 | 0 | 166 | **0** |

1,558 and 166, where round 10 measured 1,559 and 167. One row was deleted today
by an author, not by me — section 4.

## 2. Item 2 — R11-a, and why it is a test rather than a fix

The ruling: "Prayer for Peace" answers *plausible*, never *clear*, because the
Saturday booklet prints it on two pages — as a name for Oseh Shalom (p.82) and
for Prayer for Shalom (p.90) — spelled with a capital F on one and a lower-case
f on the other.

Compared byte for byte those are two names, and each binds cleanly to its own
page: a silent wrong page, twice. Folded, they are one name two entries want,
and `assemble()`'s tie rule drops both to plausible. **The fold is what makes
the ruling reachable at all.**

`.live` already folds. `foldLiturgyName` lower-cases and drops every apostrophe
variant — curly, straight, backtick — and every ownership decision in
`lookup.ts` goes through it. That is measured, not assumed: the new suite walks
**all ten lookup scopes** and finds no entry claiming a folded spelling twice,
and no folded spelling wanted by two entries on different pages that still binds
clear.

So R11-a shipped as seven tests. A test nobody has seen fail is a test nobody
has, so I deleted `.toLowerCase()` from the fold and watched **4 of the 7 go
red** — with exactly the failure the ruling feared, `clear` twice on two
different pages — then put it back.

What the suite deliberately does **not** assert is that the spelling is
plausible in every book. `crc-friday` and `crc-rh-morning` print only one of the
two moments, so there is nothing to be ambiguous about and the name binds clear
at 100. That is the same reading I reported in round 10 and nothing has ruled
otherwise; refusing a correct bind because a different book prints two would be
a new ruling, not this one.

## 3. Item 3 — the aliases reached `.live`, and reached the binder not at all

Nine dry runs, `dryRun: true` throughout, **nothing accepted and nothing
written** — the four Shabbat templates against the booklet their type names and
every setlist with an `eventDate` on or after today:

| surface | book | bound | plausible | unmatched | skipped |
|---|---|---|---|---|---|
| Shir Shabbat | `crc-friday` | 0 | 0 | 5 | 10 |
| Standard Friday Night — Kabbalat Shabbat | `crc-friday` | 0 | 0 | 3 | 27 |
| Randy Shabbat morning | `crc-saturday` | 0 | 0 | 1 | 32 |
| B'nai Mitzvah service | `crc-saturday` | 0 | 0 | 2 | 34 |
| Kol Nidre — Sept 20 | `crc-machzor-2008` | 0 | 0 | 3 | 24 |
| Kol Nidre Alternative — Sept 20 | `crc-machzor-2008` | 0 | 1 | 11 | 11 |
| Yom Kippur Morning — Sept 21 | `crc-machzor-2008` | 0 | 0 | 5 | 30 |
| Neilah — Sept 21 | `crc-machzor-2008` | 0 | 2 | 12 | 10 |
| Yizkor — Sept 21 | `crc-machzor-2008` | 0 | 0 | 1 | 7 |

Diffed row by row against round 10's baseline: **0 rows changed state.** Not one
row moved from *plausible* or *unmatched* to *bound* because of a batch-2/3
alias. The only difference anywhere is one row that is simply gone, which is
section 4.

This is what round 10 predicted and it is now measured on the deployed build
rather than argued from the source: the alias batches land in `moments.json`,
and `moments.json` is not the binder's name table. `liturgyLookup` builds from
`fixed-liturgy.<book>.json`, the two CRC booklet pagemaps and
`crc-machzor-2008.json`; the moments artifact supplies the join key and nothing
else. 134 of the 140 spellings were already in the lookup because they are the
printed spellings; the 6 that were not match no row in the corpus.

The one row where it costs something is unchanged and still waiting on you:
**"Priestly Blessing" on Neilah, September 21**, plausible 58 via the bare word
"Blessing" against `havdalah.closing-blessing@crc-neilah` p.211, which the alias
names exactly and cannot reach. Bind nothing was the instruction and nothing was
bound.

## 4. Item 4 — R11-b, and the row that moved with nobody moving it

### What the grep found

Five sorts in `src/` keyed on `folio`/`page`, and **not one of them orders
setlist rows**:

| hit | what it sorts | verdict |
|---|---|---|
| `lib/books/lookup.ts:130-131` | page MATCHES for a typed name | a search result, not a row |
| `lib/mcp/tools/service-frame.ts:187` | CANDIDATES offered to Daniel | a proposal list, read once |
| `lib/mcp/tools/service-frame.ts:205` | the same candidates, late-page-first, on the accept path | so each insert index stays valid as rows appear above; author action |
| `lib/print-pipeline.ts:219` | the PAGES of a chart PDF | not rows |
| `components/performance/liturgy-runs.ts:67` | the folios a fold divider spans | a label |

Every reader of the rows themselves — the edit grid, Perform including the fold,
the service sheet, the gig packet, the `today.json` emitter and the Overlays
publish payload — sorts by stored `order` and nothing else. Perform's fold
groups only CONSECUTIVE rows by index, so it hides rows and cannot move them;
the suite asserts its runs are ascending, contiguous and non-overlapping, that
expanding them reproduces the stored sequence exactly, and that a fixed row with
a chart never folds.

The writers are clean too, and asserted: the binder and bind-on-type contain no
`order` write at all, `update_track`'s reorder is gated on an explicit
`patch.position` and its MCP schema cannot carry `order`, and
`propose_service_frame` has no Firestore write of its own — it reaches
`addTrack`, the author-action path, only past its dry-run return.

### What the grep did not find, and the measurement did

**Production `order` is legacy-dirty.** Across 84 setlists: 2 carry duplicate
`order` values over 6 rows, 8 more have gaps, 0 rows are missing `order`
entirely.

A sort on `order` alone leaves a tied pair wherever the query happened to put
it. The deciders do **not** leave it there: Firestore's `orderBy("order")`
appends `__name__` implicitly, and `addTrack` has always sorted `order || id`
before renumbering. So a tied pair could render one way in Perform, the other
way on the server, and be compacted to a third by the next insert.

That is not hypothetical. **Two rows in "Kol Nidre — September 20" changed
places today with neither row written:**

| | this morning (round 10) | this evening |
|---|---|---|
| first row | Kol Nidre, p.98 (`2d6e1a54`, v1) | Candle Lighting Blessing, p.96 (`408691ed`, v1) |
| `today.json` `startFolio` | **98** (rounds 7, 8, 10) | **96** |

Both rows are still **v1** — neither has ever been written — and this lane made
no write to that setlist. What happened between the two readings is that an
author deleted a third row (below), and a delete re-packs the survivors.

`removeTrack` sorted `order` alone before re-packing, and `updateTrack`'s
reorder base did the same, while `addTrack` sorted `order || id`. Two of the
three writers could therefore resolve a tie by whatever sequence the query
returned **and then write that resolution down** — a row permuted permanently,
with no author in the loop. That is the shape of the thing David found.

### What I changed

Every sort over stored rows now ties by id: both in-memory readers
(`getTracksForSetlist`, the edit grid's Dexie query) and every writer
(`removeTrack`, `updateTrack`'s reorder base, `clone_setlist`,
`mark_as_performed`, `propose_changes`). Nine sites, one rule, and the rule is
the one `addTrack` and Firestore already used.

Removing the tie-break turns two of the new tests red, and a bare
`a.order - b.order` over this collection now fails the suite rather than waiting
for someone to notice a row moved.

Not touched: the importer's staged rows and `setlist-import/commit`, which order
a parsed payload rather than stored rows — and **the Kol Nidre setlist itself**.
Its sequence is the author's, whatever it is now.

### The deleted row

`8381ac85` "Hashkiveinu", a typed page (`crc-machzor-2008` folio 107, no unit
id), was in "Kol Nidre — September 20" at 10:47 local and gone by 20:13Z. The
setlist is at version 3, 27 rows, orders contiguous 0–26. No tool of mine wrote
to it; this round's only writes to Daniel's data are the two Shofar re-points in
section 1. Recording it because R11-b is about telling an author's delete apart
from a tool's, and this one is an author's.

## 5. Item 5 — `today.json` and the chart path

Emit succeeded on the first request, after the deploy:

```
{"ok":true,"results":[{"org":"crc","ok":true,"serviceCount":5},
                      {"org":"brotherslazaroff","ok":true,"serviceCount":1}]}
```

Read back at `/api/today`: **200**, 2,110 bytes, `generatedAt
2026-09-17T00:53:03.967Z`, five services — Kol Nidre Alternative 98, **Kol Nidre
96** (was 98; section 4), Yom Kippur Morning 129, Yizkor 180, Neilah 188.

Chart path, `awakening.modeh-ani@legacy-shabbat-morning`:

| # | probe | result |
|---|---|---|
| 1 | `POST …/select`, Origin `https://siddur.centralreform.org` | **200** `status:"available"`, `kind:"pdf"` · ACAO that one origin · `no-store` · `Vary: Origin` |
| 2 | `GET …/chart?unitId=…` same origin | **200** · `application/pdf` · 3,008 bytes · `no-store` · `inline` · `nosniff` · single ACAO |
| 3 | `GET …/chart` for `amidah.brosh-hashanah@crc-rh-morning` | **404** |
| 4 | Origin `https://evil.example` | **403** on select **and** on chart |

sha256 `da9ec13856f388c956594bd5ceaad8b6dad310854c66673ebb55728a60af64a2`,
`%PDF-1.3` — byte-identical to rounds 6 through 10.

`CRON_SECRET` is still not in `.env.local`. Pulled production config to the
scratchpad, read the one variable into a shell variable, and `rm`'d the file in
the same command before the first request. No `.env` file of any name is left
under the scratchpad, and nothing was echoed into this document or a log.

## 6. Gates `[measured]`

| gate | result |
|---|---|
| `tsc --noEmit` | clean |
| `npm run lint` | **0 errors**, 11 warnings (the standing set) |
| `SKIP_ENV_VALIDATION=1 npx next build --webpack` | compiled successfully, 26.7 s |
| `npm test` | **401 files, 4,778 tests, 0 failures** (69 skipped) |
| `npm run test:emulator` | **93 files, 1,293 tests, 0 failures** |
| after the second commit pair: `src/lib/mcp` + `src/lib/__tests__` | 94 files, 1,236 tests, green |

`npm test` was fully green this time — the four load-flake files that have been
red in every recent round all passed, so there is nothing to re-run and call
flake.

One honest note on the emulator gate. It ran three times. The first was green
(the wrapper exited 0), the second came back **13 files / 22 tests red**, and
the third was 93/93 green. I fired the second one seconds after the first
emulator received SIGINT, so it started on top of a shutting-down emulator; I
did not keep its failure detail, so I am reporting the sequence rather than a
diagnosis. Two clean runs on an idle box and one run started on top of another
is what happened.

## 7. Shipped

| commit | what |
|---|---|
| `3cacad3e31` | books: R9-b ends `shofar.service`, and the join key follows it |
| `42398ebe39` | liturgy: R11-a — the fold is what makes "Prayer for Peace" answerable |
| `e0bd3e666a` | setlists: R11-b — row order is the author's, and every reader agrees on ties |
| `3abade1715` | setlists: every writer of a tied row pair breaks the tie the same way |

Two deploys, because the fourth commit came out of measuring the third and the
two Shofar re-points needed the first three live before they could name the
successor. The Git integration built each push once — one deployment per push,
no second `vercel deploy --prod`. `/api/version` reports the head of the lane:

```
{"sha":"3abade171594250e848cd7897286ced8f10b1a00","builtAt":"9/17/2026","version":"11.7.0"}
```

`HEAD` and `origin/master` are both at `3abade1715`; the working tree is clean
apart from the untracked `work/` scratch, and `npm run sync:books -- --check`
reports `none` on all four artifacts against the committed book.

## 8. Still waiting on you

- **The alias wire** (section 3). Moment aliases reach `.live` and stop at the
  join key; the binder reads books. Nine dry runs moved 0 rows. "Priestly
  Blessing" on Neilah is what it costs to leave it, and the clean fix is the one
  the machzor already has — a name on the book entry, carried by the build — not
  a second matcher.
- **"Prayer for Peace"** is plausible in `crc-saturday`, clear in `crc-friday`
  and `crc-rh-morning`, because those print one stem. Say the word if you want
  it plausible everywhere.
- **"Hakafot – Nigun 5"** stays unbound, as ruled.
- **The Kol Nidre row pair** (section 4) is left exactly as it is. If Candle
  Lighting Blessing should not open that service, that is a drag, not a patch.
- **Upstash** is still a live external dependency of the production project,
  free tier, unchanged. The offer stands.
