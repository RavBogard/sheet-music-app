# RETURN → live-cw: shacharit is 144, and I reproduced the measurement before touching it

Lane: **live (Code)** · Order: `HANDOFF-CODE-LIVE-SHACHARIT-144-2026-09-02.md`
Authority: R-0902-live-cw-3 §2 · R-0831-live-pagemap-1 · field note 12
Verified-against `8491e68678`, confirmed host-side at open. Shipped **`817870bb3a`**.
Diff is **2 files, +2/−2** — the `pages` field and nothing else.

---

## Headline

Done, clean, no stop condition hit. `shabbat-shacharit` `pages` **145 → 144** in both files, `--check`
green, build gate green, deployed, live surface asserted.

**And I re-measured all three press PDFs myself before editing.** Not because the order was thin — it
carried its provenance — but because this field is a live `validateLiturgyRef` bound on a printed book
nine days out, and yesterday *two* readings of this exact question were wrong in *opposite* directions.
A third wrong one would have been mine. **I reproduce your numbers exactly.**

## The independent measurement

Same instrument, arrived at without reading your intermediate values: `pypdf` for the page count,
`pdftotext` page by page, last standalone integer per page, offset taken as the mode.

| volume | PDF pages | front matter | printed | last numbered page | recorded before | now |
|---|---|---|---|---|---|---|
| shabbat-maariv | 75 | 6 | **69** | pdf p75 → printed 69 | 69 ✓ | 69 |
| shabbat-shacharit | 151 | 7 | **144** | pdf p151 → printed **144** | 145 ✗ | **144** |
| shirei-tshuvah | 188 | 4 | **184** | pdf p188 → printed 184 | 184 ✓ | 184 |

Offsets **observed** unanimous: **69/69** numbered pages for maariv, **144/144** for shacharit,
**180/181** for the machzor — its one outlier being the Contents cross-reference you already named.
[measured: `pdftotext -f N -l N` per page + `pypdf.PdfReader` over `dist-app/shirei-shabbat.pdf`,
`shirei-shabbat-shacharit.pdf`, `shirei-tshuvah.pdf`, 2026-09-02T15:3xZ]

The decisive fact needs no offset arithmetic at all: **shacharit's final PDF page carries the printed
number 144.** A book cannot have a 145th printed page after its last printed page is 144.

One small divergence in bookkeeping, not in result: you counted 107 numbered pages for shacharit where
I count 144. Different extraction heuristics over the same file — mine takes the last standalone
integer on every page, which catches numerals yours filtered. The offset mode and the last numbered
page agree, so the printed count is the same number by two paths.

**I accept your correction of my 71/147.** Front matter is 6, 7 and 4 — not uniform, and a uniform
assumption was exactly the wrong shape of inference to make from one volume.

## The direction of the error, confirmed

You are right that it runs the other way from my reading, and this is worth stating plainly because it
changes who was at risk. `validateLiturgyRef` (`src/lib/books/registry.ts`) accepts a folio when
`floor <= folio <= entry.pages`. At 145 the bound was **permissive**: a reference to shacharit page 145
— a page that does not exist in the printed book — validated and would have been served. Nothing was
being refused. **Nobody was blocked; the book was simply one page longer than it is.** Now it is not.

## The change

- `src/data/books/registry.json` — `shabbat-shacharit.pages`: 145 → 144.
- `src/data/books/shabbat-shacharit.json` — same field, same change.

No unit, no folio, no other volume, no code. `git show --stat 817870bb3a` → 2 files, 2 insertions,
2 deletions.

## Guards

**Yesterday's V1 assertion is what now protects the corrected value, and it passes — quoted:**

```
$ node scripts/sync-books.mjs --check
┌─────────┬─────────────────────┬───────┬──────────┬───────┬───────────┐
│ (index) │ slug                │ units │ maxFolio │ pages │ drift     │
├─────────┼─────────────────────┼───────┼──────────┼───────┼───────────┤
│ 0       │ 'shabbat-maariv'    │ 48    │ 68       │ 69    │ 'DIFFERS' │
│ 1       │ 'shabbat-shacharit' │ 94    │ 143      │ 144   │ 'DIFFERS' │
│ 2       │ 'shirei-tshuvah'    │ 122   │ 182      │ 184   │ 'DIFFERS' │
└─────────┴─────────────────────┴───────┴──────────┴───────┴───────────┘

--check: nothing written. Source dist-app/, pins verified, pages asserted.      exit=0
```

`maxFolio <= pages` for shacharit is **143 <= 144** ✓. The `DIFFERS` column is the *unit-folio* drift
from your open question 2 — unchanged by this wave, and still nobody's to decide but Daniel's.

**Build gate:**

- `git log --oneline -1` → `8491e68678` at open, confirmed host-side, == `origin/master`.
- `npx tsc --noEmit` → **exit 0**.
- `SKIP_ENV_VALIDATION=1 npx next build --webpack` → **exit 0**.
- `git push origin master` → `8491e68678..817870bb3a` ✓.

**Live surface, after the deploy — one `list_books` call, both assertions in it, quoted not ticked.**
The MCP client for this server dropped mid-session, so I first called production over HTTP with the
supervisor bearer (`node scripts/supervisor-prod-bearer.mjs`) against `POST /api/mcp` — same surface,
same tool, same auth path. Polled from 15:38:41Z; it flipped at **15:40:03Z**. The client then
reconnected and I re-asserted on it: **`list_books` over the canonical MCP client returns the same
five rows, field for field** [measured 15:4xZ]. Two independent paths to the live surface, one answer:

```json
{ "ok": true, "books": [
  { "slug": "crc-friday",        "title": "CRC Friday Siddur",              "tier": "pagemap", "pages": 48  },
  { "slug": "crc-saturday",      "title": "CRC Saturday Siddur",            "tier": "pagemap", "pages": 102 },
  { "slug": "shabbat-maariv",    "title": "Shirei Shabbat — Friday Night",  "tier": "feed",    "pages": 69  },
  { "slug": "shabbat-shacharit", "title": "Shirei Shabbat — Shabbat Morning","tier": "feed",   "pages": 144 },
  { "slug": "shirei-tshuvah",    "title": "Shirei Tshuvah — Rosh Hashanah", "tier": "feed",    "pages": 184 }
] }
```

- **`shabbat-shacharit` → 144 / `feed`** ✓ — the ordered change, live.
- **Rosh Hashanah (R-0901-vision-8 §1) → `shirei-tshuvah` 184 / `feed`** ✓ — untouched by this wave,
  asserted anyway, before *and* after.

Two prior polls at 15:38:41Z and 15:39:34Z **returned 145**, which is worth recording: it is the
before-value, caught on the live surface, and it is the only direct evidence in this wave that the
deploy is what moved the number rather than the edit alone.

## Checklist

- [x] Verified-against sha confirmed host-side; family row opened under `live` with claims
- [x] `registry.json` and `shabbat-shacharit.json` both at 144; nothing else in the diff
- [x] `--check` passes and is quoted
- [x] Build gate green; deployed
- [x] `list_books` → shacharit **144**, machzor **184 / `feed`**, both quoted
- [x] `RETURN-CODE-LIVE-SHACHARIT-144-*.md` at this root; `Lane: live (Code)` on the commit

## Still open, still not mine (rule 1)

Your question 1 is **closed** by this wave. Two remain, both unchanged and both from yesterday:

1. **The machzor's four Torah units** — endpoints vs spans, ten folios of coverage, hand-edited by the
   look of it. Until that is answered no volume can legitimately re-sync, which the V2 pin now enforces
   out loud. Today's `--check` shows all three at `DIFFERS`, which is that same fact, not a new one.
2. **`printing.pages` is physical, not printed** — 75 / 151 / 188 against printed 69 / 144 / 184, and
   the offsets are 6 / 7 / 4, not a constant. A printed-count field upstream must be a *new* field, and
   it cannot be derived from `printing.pages` by subtracting anything fixed.

One note toward that second item, offered as measurement and not as a proposal: the printed count now
recorded for every volume equals *PDF page count minus that volume's own front matter*, and the front
matter is the part that varies. If `cont` emits the printed count directly, none of this arithmetic
needs to survive.

**No ruling id spent.** Claude records; Daniel decides.
