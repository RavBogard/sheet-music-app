# ORDER → Code: shacharit's printed page count is 144

Lane: **live (Code)**, host-side · From: **live-cw (Opus Cowork)**
Executor: **live (Code)**, in `~/CentralReform.live/sheet-music-app`, git host-side (rule 8 addendum)
Status: **DISPATCHABLE**
Tier: CLOSED — it writes book data and deploys, though the diff is two values.
Verified-against: `8491e68678` [inherited: `RETURN-CODE-LIVE-PAGES-AND-PIN-2026-09-02.md`].
**Confirm host-side at open.**

Authority: **R-0902-live-cw-3 §2** · R-0831-live-pagemap-1 · field note 12

NEXT: change shacharit's recorded `pages` to the printed count in both files, deploy, and re-assert
the Rosh Hashanah guard. (Values and provenance in the table below.)

---

## The measurement, and it closes your open question 1

Your return asked what the Shabbat volumes' `pages` are, correctly refused to infer them from the
machzor, and noted you had no printed Shabbat book. **The press PDFs are in `dist-app/`.** This desk
read every numbered page of all three with `pdftotext` and took the offset as the mode
[observed at HEAD `8491e68678`, 2026-09-02T03:1xZ]:

| volume | PDF pages | front matter | printed pages | last unit | recorded |
|---|---|---|---|---|---|
| shabbat-maariv | 75 | 6 | **69** | 68 | 69 ✓ |
| shabbat-shacharit | 151 | 7 | **144** | 143 | **145 ✗** |
| shirei-tshuvah | 188 | 4 | **184** | 182 | 184 ✓ |

[measured: `dist-app/shirei-shabbat.pdf`, `shirei-shabbat-shacharit.pdf`, `shirei-tshuvah.pdf` via
`pdftotext`, every numbered page, offset taken as the mode, 2026-09-02T03:1xZ]

Offsets **observed** unanimous [measured: same sweep]: 69 of 69 numbered pages for maariv, 107 of
107 for shacharit, 155 of 156 for the machzor (its single outlier is a Contents cross-reference). Every volume ends on a
colophon page — `pdftotext` on shacharit's pdf p151 and maariv's p75 **returned** the colophon —
which is why all three printed counts sit above their last unit's folio.

[measured: same sweep] **So both of yesterday's readings were wrong.** This desk's, that all three recorded values are
printed counts. And yours, that a uniform 4-page front matter makes them 71 and 147 — front matter
is 6, 7 and 4. Maariv's 69 is the printed count *and* that build's `maxFolio`; shacharit's 145 is
only the `maxFolio`.

**And the error runs the other way from your reading.** `validateLiturgyRef` bounds at
`folio <= entry.pages`, so 145 is **permissive**: nothing is refused today, but a reference to page
145 — which the book does not have — validates.

## The work

1. `src/data/books/registry.json` — `shabbat-shacharit`'s `pages`: **145 → 144**.
2. `src/data/books/shabbat-shacharit.json` — same field, same change.

Nothing else. No unit, no folio, no other volume, no code.

## Guards

**Your V1 assertion must still pass, and it is the point of the change:** `maxFolio <= pages` for
shacharit is 143 <= 144 [measured: same sweep, against `dist-app/shabbat-shacharit-feed.json`]. Run the sync in `--check` mode after the edit and quote it — the guard you
built yesterday is what now protects the corrected value.

**Rosh Hashanah (R-0901-vision-8 §1), after the deploy, quoted not ticked:** `list_books` →
`shirei-tshuvah` **184 / `feed`**. This wave does not touch the machzor; assert it anyway.

**`list_books` must report `shabbat-shacharit` at 144** on the live surface after the deploy.

Checks the executor runs and records — **no observed value is supplied here, deliberately:**

```text
git log --oneline -1
node scripts/sync-books.mjs --check
npx tsc --noEmit
SKIP_ENV_VALIDATION=1 npx next build --webpack
```

## Checklist

- [ ] Verified-against sha confirmed host-side; family row opened under `live` with claims
- [ ] `registry.json` and `shabbat-shacharit.json` both at 144; nothing else in the diff
- [ ] `--check` passes and is quoted
- [ ] Build gate green; deployed
- [ ] `list_books` → shacharit **144**, machzor **184 / `feed`**, both quoted
- [ ] `RETURN-CODE-LIVE-SHACHARIT-144-*.md` at this root; `Lane: live (Code)` on the commit

## Stop conditions

Stop and return if: `--check` fails after the edit; the diff touches anything but those two values;
or `list_books` reports anything other than 144 after the deploy. **`live` never spends a ruling id
(rule 1).**

Claude records; Daniel decides.
