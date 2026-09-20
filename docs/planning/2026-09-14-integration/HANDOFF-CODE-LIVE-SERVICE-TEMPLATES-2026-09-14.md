# HANDOFF → Code (centralreform.live): the setlist is the whole service

From: Cowork sitting with Daniel, 2026-09-14 (`RULINGS-INTEGRATION-2026-09-14.md` #2).
Repo: `CentralReform.live/sheet-music-app`. Authoring surface is Claude over MCP; the browser is the band's surface.

## The ruling

Weekly Friday-night and Saturday-morning setlists carry the **fixed liturgy** — Bar'chu, Sh'ma, V'ahavta, Mi Chamocha, the Amidah blessings, Kaddish, Aleinu, and so on — as rows, not just the band's charts. Building a setlist then means choosing the music and confirming the order; everything downstream (Overlays' setlist import, `today.json`, the as-performed reconcile) inherits the full run-of-show for free.

Two constraints Daniel set: **authoring must not get heavier for David**, and **the band's Perform mode must not get noisier** — fixed rows are hidden there by default.

## What already exists (measured 2026-09-14)

- Row types `header`, `note`, `prayer`, `reading`, `transition`, `song` are live; `liturgyRef {book, folio}` is on every row type (RH Day 2 — CRC Machzor: 51 rows, 44 with a folio).
- `list_books` serves 6 books: feed tier `shabbat-maariv` (69), `shabbat-shacharit` (144), `shirei-tshuvah` (184); pagemap tier `crc-friday` (48), `crc-saturday` (102), `crc-machzor-2008` (215).
- `lookup_book_page` resolves a prayer → printed page, and a unit id on feed books.
- Templates exist (`create_template`, `clone_setlist_from_template`, `templateType`).

## Build

**W1 — Template rows for the fixed liturgy.** For each of the two weekly service types, and for each book the service might use (Friday: `shabbat-maariv`, `crc-friday`; Saturday: `shabbat-shacharit`, `crc-saturday`), add the fixed liturgy to the template as `header`/`prayer`/`reading` rows in service order with `liturgyRef` pre-filled via `lookup_book_page`. Where a book lacks a unit (pagemap books have no unit ids) fill folio only. Source the order from the book's own section sequence in its feed — do not hand-type an order. Bring the proposed rows to Daniel through `preview_publish` / the stage→confirm flow before committing the templates; he confirms the liturgical order per book once.

**W2 — Book switch fills the pages.** When a setlist's `book` is set or changed, re-resolve `liturgyRef.folio` for every row that carries a `unitId` (or a matching title on pagemap books) and report rows it could not resolve. Never silently drop a folio the author typed; surface the disagreement.

**W3 — Perform mode hides fixed rows by default.** Rows with no `fileId` and type `prayer`/`reading`/`header` are collapsed in Perform mode into a single thin divider showing the section name, expandable per-musician; the preference persists per device. The rabbi sheet (`generate_service_sheet`) shows them all.

**W4 — Publish becomes a real step.** All eight most-recent setlists show `publishedAt: null` (measured). Downstream consumers key off publish. Make `publish_setlist` the natural end of the authoring flow (the MCP instructions should nudge it after commit) and record `publishedAt` bumps on republish. No calendar logic; nothing auto-publishes.

## Don'ts

No liturgical text in this repo — ids, names, folios only (rule 7). Do not touch the moments binding on library rows (that is L3, separate order). Do not change the band's chart rows or Perform-mode page turns.

## Return

`RETURN-CODE-LIVE-SERVICE-TEMPLATES-<date>.md`: the templates as Daniel confirmed them (row counts per book), the W2 re-resolve behaviour on a book switch shown on a cloned test setlist (then cleaned with the test-data tools), Perform-mode before/after captures, and the publish nudge text for Daniel to accept or reword.
