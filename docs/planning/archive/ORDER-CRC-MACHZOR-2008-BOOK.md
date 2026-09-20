# ORDER — register crc-machzor-2008 in the book registry

Executor: Code
Status: READY
Tier: CLOSED
Verified-against: working tree as staged 2026-09-11 (registry.json mtime 1788363205381, registry.ts mtime 1788130446390)

## Why

Alt Rosh Hashanah morning is being led out of CRC's 2008 machzor because Shirei
Tshuvah did not arrive from the printer. The setlist "RH Day Alt CRC Machzor"
(id a75093c5-391c-4868-a46f-a2c19d97e220) carries its printed folios in row
TITLES, because `liturgyRef.book` refuses any slug not in the registry:

    Unknown book 'crc-machzor-2008'. Known books: crc-friday, crc-saturday,
    shabbat-maariv, shabbat-shacharit, shirei-tshuvah.

Registering the book moves those pages into the real `liturgyRef.folio` slot.

## Changes — all three files are written to disk already

1. `sheet-music-app/src/data/books/crc-machzor-2008.json` — NEW. 57 pagemap
   entries, pages 38-129, `pages: 215`. Generated from the shireishabbat
   transcription-mz UNITS captures (215 units, folios 1-215); every `page`
   comes from a capture's own `src:` field, none was typed by hand.
2. `sheet-music-app/src/data/books/registry.json` — one object inserted after
   crc-saturday.
3. `sheet-music-app/src/lib/books/registry.ts` — one import line, one
   BOOK_FILES line. CRLF endings preserved; the diff is exactly 2 added lines.

## Scope decision, recorded

The pagemap covers Rosh Hashanah MORNING (38-92) plus Adon Olam (129) and
deliberately stops there. Across the whole volume 49 prayer names repeat at
different folios - Bar'chu alone prints at 9, 45, 100 and 136 - so a whole-book
pagemap keyed on bare names would resolve one name to several pages, which is
the silent-wrong-page failure `bookFolioFloor`'s own comment was written about.
Within 38-129 all 57 names are unique (asserted at generation time). Extending
to the other five services needs service-qualified names and is a separate wave.

## Expected outcome

- `npx tsc --noEmit` clean.
- Build clean.
- `vitest` green with NO test edits. Checked against the current assertions:
  `books.test.ts:35` is `toBeGreaterThanOrEqual(5)`; `registry.test.ts` derives
  every floor from each book's own data and asserts only the crc-friday /
  crc-saturday relationship; `titles.test.ts` names only those two slugs.
  A sixth book is expected to pass all of them unchanged. If any test asserts
  an exact book count, STOP and hand back - do not edit the assertion.
- Post-deploy: `list_books` returns 6 books including
  `{slug: "crc-machzor-2008", tier: "pagemap", pages: 215}`.
- Post-deploy: `lookup_book_page({book: "crc-machzor-2008", query: "Barchu"})`
  resolves to folio 45, one match.
- Post-deploy: `validateLiturgyRef` accepts folio 38-215 under this slug and
  rejects 37.

## Checklist

- [ ] `npx tsc --noEmit`
- [ ] build
- [ ] `npx vitest run src/lib/books src/lib/mcp/tools/__tests__/books.test.ts`
- [ ] full `npm test`
- [ ] commit (Lane: crc-machzor-book (Code))
- [ ] deploy; confirm Vercel READY with matching githubCommitSha
- [ ] quote `list_books` output in the return, do not merely tick this box

## Hand back if

Any test asserts an exact book count; any gate fails; or the registry.json /
registry.ts diffs are larger than described above (that would mean a line-ending
rewrite, not a content change).
