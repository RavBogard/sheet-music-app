# SPEC → `moments.json`: the prayer-identity vocabulary the satellite consumes

Lane: **live-cw (Opus Cowork)** — the consumer, writing the contract it will consume
**Producer owner: `cont` (webapp Opus Cowork), whose Code lane built the feed producer and
`dist-app/`** — R-0901-vision-8 §5. Queued, not ordered; `live-cw` briefs, `cont` disposes.
Authority: R-0901-vision-8 §2 · R-0901-live-cw-1 §1 · rule 5 · rule 6 · rule 7 · R-0831-guards-2
Grounding: `FINDINGS-L2-MOMENTS-GROUNDWORK-2026-09-02.md` (this root)

[measured: `~/shireishabbat/dist-app/*-feed.json` (4 books), `build/schema/feed.schema.json`, and
`build/typst/content/legacy-shabbat-morning/_generator/identity.json` on the mount, 2026-09-02T02:0xZ]

---

## 1 · What this is, and the three things it is NOT

`moments.json` is a **cross-book projection**: for every prayer the family's books contain, one
stable id, the names it goes by, and where it prints in each book.

It is **not a second identity source.** The corpus program's `identity.json` already binds each
unit to a canonical ref with a `class` of `sefaria` / `crc-original` / `third-party`
(R-0901-corpus-cw-7 §3, and its 96-row reference implementation is on disk). **That stays
upstream and authoritative.** `moments.json` carries `refs` and `class` through by reference and
never re-derives them — if the two ever disagree, identity wins and the producer's guard fails.

It is **not the gold layer.** Gold is what the room sings together (R-0901-vision-6,
R-0901-corpus-cw-6). This is where a prayer prints. Nobody conflates them.

It is **not a text carrier (rule 7).** Ids, display names, aliases, sections, folios. No
liturgical text crosses into the satellite, ever.

## 2 · The key is the STEM, and this is the one place the spec departs from §2's wording

R-0901-vision-8 §2 says a moment is *"the book-independent half of an AR-3 id
(`shma.mi-chamocha`)"*. Measured across the four feed books: **252 `section.unit` pairs resolve to
188 distinct stems, and 43 stems appear under more than one section.** `aleinu` lives under
`concluding`, `econcluding` and `mincha`; the machzor carries `shma.mi-chamocha` **and**
`emaariv.mi-chamocha` — one prayer, one book, two services.

**The section prefix is service position, not prayer identity.** Keyed on `section.unit`, "every
chart for Mi Chamocha" would split in two inside a single siddur — the fragmentation this program
exists to end. So: **the moment id is the stem; the section becomes an attribute of each
occurrence.** The AR-3 id is unchanged and remains the unit's address. `FOR COWORK (vision):`
§2's wording wants this amendment; its intent is untouched.

## 3 · Schema

```json
{
  "schemaVersion": 1,
  "producedBy": "build/tools/emit_moments.py",
  "builtAt": "<ISO>",
  "sources": [
    { "book": "shirei-tshuvah", "feed": "shirei-tshuvah-feed.json",
      "gitSha": "21417d9", "pin": "press" },
    { "book": "shabbat-maariv", "feed": "shabbat-maariv-feed.json",
      "gitSha": "6f61874", "pin": "press" }
  ],
  "moments": [
    {
      "id": "mi-chamocha",
      "display": { "en": "Mi Chamocha", "he": "מִי כָמֹכָה" },
      "kind": "prayer",
      "aliases": ["Mi Chamochah", "Michamocha", "Mi Chamocha"],
      "occurrences": [
        { "book": "shabbat-maariv", "section": "shma",
          "unitId": "shma.mi-chamocha@shabbat-maariv", "folios": [24],
          "identityClass": "sefaria", "refs": ["Exodus 15:11"] },
        { "book": "shirei-tshuvah", "section": "emaariv",
          "unitId": "emaariv.mi-chamocha@shirei-tshuvah", "folios": [41] }
      ]
    }
  ]
}
```

**`kind`** — `prayer` · `kavannah` · `teaching` · `interpretation` · `reflection` · `rubric`.
Charts bind only to `prayer`. The signal is the id-stem suffix, and it is reliable rather than
assumed: across the four books the suffixes are `-kavannah` ×13, `-interpretation` ×3, `-call` ×3,
`-teaching` ×1, `-chant` ×1, and **exactly one unit's display name disagrees with its stem**
(`amidah.reflection-on-gratitude`, a title beginning with the word, not a suffixed variant).
**Derive `kind` from the suffix, list the exceptions in the producer, and let the guard fail on a
suffix the table does not know** — a new one is a liturgy decision surfacing, not a parse error.

**`aliases`** — the field that makes `L3` possible, and **the only field with no upstream source
today.** `L0` measured the library's split: `Lecha Dodi` / `L'cha Dodi` / `L'Chah Dodi` across
three stems for one prayer, while the feed spells it `lcha-dodi`. Proposal: a curated
`liturgy-map/moment-aliases.json` in shireishabbat, seeded mechanically (apostrophe, `ch`/`kh`,
doubled vowels, space/hyphen) and then curated by hand. **It belongs to the liturgy repo, not the
satellite** — it is prayer vocabulary (rule 5), and the satellite must never write upstream. `FOR
COWORK (cont):` this is the one part of the artifact that needs a person, and it is worth saying
so before someone tries to generate it.

**`display.he`** — names, not text. A prayer's name in Hebrew is a label; it is not liturgical
content and does not breach rule 7. If `cont` reads it otherwise, drop the field — the satellite
does not need it and will not ask twice.

## 4 · Pin and guard (rule 5, rule 6, R-0831-guards-2)

Every source book records the `gitSha` its feed was built from. **A printed volume's sha is its
press commit, never HEAD (R-0831-live-pagemap-1).** The consumer records the same shas and refuses
to load a `moments.json` whose `sources` disagree with what it has pinned.

**The guard that must be able to fail, and its fail branch shown before dispatch:**

1. **Bijection.** Every unit in every pinned feed appears in exactly one moment's `occurrences`,
   and every occurrence resolves to a unit in the pinned feed for its book. Neither direction may
   have a remainder. This is an identity on the executing machine, not an absolute count
   (field note 12) — it stays true as the corpus grows.
2. **Pin agreement.** Each `sources[].gitSha` matches the `printing.gitSha` in the feed actually
   read. Fail, do not warn.
3. **Unknown `kind` suffix** → fail.
4. **Identity agreement.** Where `identity.json` exists for a book, every `refs` / `class` carried
   here matches it exactly. Fail on divergence; identity is upstream.

Demonstrate 1 and 2 failing on a deliberately mismatched input, per R-0831-guards-2. A guard whose
fail branch has never run is a premise wearing a guard's costume.

## 5 · The consumer side, and a defect it must fix on the way through

`sync-books.mjs` extends to consume `moments.json` alongside the feeds and trim it the same way —
metadata only, committed to `src/data/books/` so the setlist path never depends on shireishabbat
being present (its existing and correct posture).

**Fix this first, in the same wave:** that script reads `join(repo, "dist")` — the **unpinned**
build — while the app carrier is `dist-app/`. Run today it would rewrite the machzor from sha
`8ab7be6` at **130 units / 248 folios** over the press build `21417d9`'s **122 / 182** that the
satellite carries, reinstating the dead page space two deploy cycles removed. Its only guard is
`schemaVersion === 1`, which both builds pass. Details in the findings doc. **`live`'s work, not
`cont`'s** — this desk orders it once the search-join order returns.

## 6 · Seams named rather than assumed

- **`identity.json` carries a `corpus` field** (`shma.mi-chamocha`) that looks like a
  book-independent key and, per §2 above, is not one across books. Whether that field should stay
  book-scoped or gain a stem alongside it is **the corpus program's question, not this desk's.**
  `FOR COWORK (corpus-cw):` flagged, not decided — `moments.json` reads `identity.json`, so if
  that key changes shape the projection changes with it.
- **Only the reference book has `identity.json` today.** Books without one produce occurrences
  with no `refs` / `class`, which is correct and must not block the artifact — it fills in as the
  corpus program lands each import (C4 next).
- **The two pagemap books are absent by ruling** (R-0901-live-cw-1 §2): no hand-mapping, they join
  when their imports do.

Claude records; Daniel decides.
