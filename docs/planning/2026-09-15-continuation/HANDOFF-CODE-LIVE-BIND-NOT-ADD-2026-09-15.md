# HANDOFF → .live Code session — Part A rethought: BIND, DON'T ADD (supersedes A-W3–A-W5 and the print amendment)

Daniel, 2026-09-15: "There's lots of these things that aren't done on a Friday night or a Saturday morning, and we
for sure do not want to have rows in setlists of things that we aren't going to do … we need to rethink all of
this." And: the templates on the site "haven't been really maintained well" — the real services are his Friday
nights and Saturday mornings, Shir Shabbat, b'nai mitzvah, and special Shabbatot.

This file supersedes `PLAN-CODE-LIVE-INTEGRATION-2026-09-14.md` **A-W3, A-W4 (as written), A-W5** and withdraws
`HANDOFF-CODE-LIVE-AMENDMENT-PRINT-2026-09-15.md` entirely. A-W1 (the `liturgyRefs`/`fixed` fields on
`TemplateSlot`/`TemplateTrack`) stays — the field is useful; nothing may **generate rows** from it. A-W6 (publish
is a real step) stands. Parts B–E stand.

## Ruling 2, reinterpreted (recorded in RULINGS addendum)

"The setlist is the whole service" means: **the service is whatever Daniel puts in the setlist; the system's job is
to know what each row is, not to tell him what belongs in it.** No template or setlist ever gains a row it did
not have. No row is hidden from anyone. There is no `omitFromTemplate`, no collapse-in-Perform-mode, no print
change. Musicians see exactly what they see today.

## What the confirmed files become

`src/data/templates/fixed-liturgy.{crc-friday,crc-saturday,shabbat-maariv,shabbat-shacharit}.json` are **not row
lists**. Move them to `src/data/liturgy/liturgy-map.<book>.json` (or read them in place — your call, say which) and
treat each row as a **lookup entry**: `label` (+ the booklet entry names in `bookletEntryNotes`, + aliases from
`crc-friday.json`/`crc-saturday.json` `entries[].aliases`, + `shireishabbat/liturgy-map/moment-aliases.json`) →
`{unitId, folio}` per book. Daniel's rulings on pages and order are exactly what a lookup table needs; keep them.

## A-W3′ · Bind existing rows to liturgy (staged → Daniel confirms → commit)

- New MCP admin tool `propose_liturgy_bindings({setlistId?|templateId?, book, dryRun=true})`: for every `song`,
  `prayer`, `reading`, `transition` row without a `liturgyRef`, match `title` against the lookup (reuse the
  setlist-import matcher and its accepted thresholds: clear ≥80, plausible ≥45; `titleSpecificity` as today).
  Return `{bound:[{rowId,title,unitId,folio,confidence}], plausible:[…alternatives…], unmatched:[…]}`. Headers
  are never bound. `dryRun:false` writes `liturgyRef {book, folio, unitId}` (validated through `validateLiturgyRef`)
  only for `bound` rows plus any `plausible` rows the caller passes back as `accept:[rowId→unitId]`.
- Run it (dry) against the four existing templates AND every Shabbat-family setlist since 2026-05-01 (Friday,
  Saturday morning, Shir Shabbat, b'nai mitzvah, special Shabbatot — select by `templateType`/name; list the ids
  you used). Write the aggregate to `work/liturgy-bindings-proposal-2026-09-15.md`: one table per distinct title
  spelling seen (`title → proposed unitId/page, confidence, how many setlists carry it`). That table is what
  Daniel confirms — **once per spelling, not once per setlist**. STOP there for Daniel; do not write bindings to
  real setlists or templates until he confirms. (Test setlists via test accounts are fine for the emulator test.)
- On confirm (Cowork brings it back): commit bindings to the four templates and, for setlists, only those with
  `eventDate` in the future or `publishedAt != null` — history stays untouched unless Daniel says otherwise.
- New rows typed later: `add_track_to_setlist` / `update_track` / browser add-row call the same matcher and bind
  silently at `high`, flag at `medium`, leave unbound at `low` — identical policy to the AGENT-GUIDE's bond rules.
- Tests: matcher table for the spellings in the two current templates; header rows never bound; a `low` match is
  never written; `today.json` `startFolio` = first bound row regardless of row type.

## A-W4′ · Book switch re-resolves pages — unchanged in substance

As the PLAN's A-W4, but via the lookup: on `book` change re-resolve each bound row by `unitId` (feed books) or by
label/alias (pagemap books); never drop an author-typed folio; `stale: true` + `unresolved[]` as written.

## A-W5′ · Templates are stale — census, not generation

Daniel says the site's templates are not maintained. Do **not** rewrite them from a book. Instead produce
`work/service-census-2026-09-15.md`: for each service family (Friday night; Saturday morning; Shir Shabbat; b'nai
mitzvah; special Shabbatot — group by `templateType` and name), the rows that appear in ≥50% of that family's
setlists since 2026-05-01, in the order they most often appear, with their bound identity where A-W3′ found one.
That census is a proposal for refreshed templates — Cowork brings it to Daniel; he edits; then
`create_template_from_setlist`/`update_template` applies it. Nothing is written to templates in this wave.

## Order

HHD check (§1 step 0 of the continuation handoff) → folio-145 red → A-W3′ dry run + proposal (STOP) → A-W5′ census
(STOP) → Part C option 1 (deploy) → A-W4′ → Part D when the env vars are present. Append everything to
`..\RETURN-CODE-LIVE-INTEGRATION-2026-09-14.md`; if any of A-W3/A-W4/A-W5 was already built, say exactly what is
kept, what is reverted, and the commit that reverts it.

## Addendum, same day — the setlist is the band's view; the rabbi's rows are opt-in

Daniel: ".live is mostly for the musicians … the liturgical pieces that don't have [the band] are typically not
there. RH alt and day 2 are the exception. But we can start doing that, no problem."

So there are two kinds of setlist and both are legitimate: the **band setlist** (today's normal: sung pieces,
headers, the occasional prayer row) and the **whole-service setlist** (the RH machzor pattern: every spoken and
sung moment, pages on each). Neither is generated by default; the second is one deliberate step away.

- **A-W3′ binding** applies to both unchanged (the census over real setlists will mostly find sung pieces — that
  is fine and expected; say so in the RETURN rather than treating it as thin data).
- **New, opt-in: `propose_service_frame({setlistId, book, dryRun=true})`.** For a setlist of a known family, propose
  the spoken/unsung rows for that service **from the lookup table for `book`** (only entries that carry a booklet
  page — never a page-less draft-feed-only entry), placed between the existing rows in the confirmed service order,
  as `prayer`/`reading` rows with `liturgyRef` pre-filled and `fixed: true`. Return the proposal; on `dryRun:false`
  insert only what the caller passes back as `accept:[…]`. Daniel invokes it when he wants a whole-service setlist
  (a service the reader or Overlays will follow, or one he simply wants complete); a band setlist never sees it.
  Stage → confirm → commit; the AGENT-GUIDE gets one paragraph offering it after a clone, never doing it unasked.
- **Display policy for rows the rabbi adds** (this is the part of the withdrawn amendment that survives, now
  scoped to rows Daniel chose): a `fixed: true` row with no `fileId` collapses to a thin labelled divider in
  Perform mode (tap to expand; per-device preference, default collapsed) and is excluded from `generate_gig_packet`
  and any band-facing print by default; `generate_service_sheet` (the rabbi's) shows it as one line. No row is
  ever hidden from the rabbi's view or from publish/today.json. Tests as in the withdrawn amendment.
- Whole-service setlists are what make the reader and Overlays richer on a given day; a band setlist degrades
  gracefully — `today.json` still emits, `startFolio` is the first bound row, and the as-performed reconcile
  simply reports the cued-but-unplanned moments as additions.

## Addendum 2, same day — templates DO carry the always-done rows; print gets three modes

Daniel: "I'm fine with building out the templates a little more fully, so that when David makes a setlist for a
Saturday morning, it will dynamically and automatically add things that are always done (Avot v'Imahot, G'vurot,
Aleinu…), unless specifically and explicitly skipped for a service." And: musicians may see the rabbi's rows
collapsed; print/gig packet must offer **"just music"**, **"full"**, or **both**.

This narrows the first section's "no row is ever added": rows are added to a template **only** for moments Daniel
marks **Always** for that service family. He is marking them now on the rulings page (each confirmed row: Always /
Sometimes / Never); Cowork will deliver `src/data/templates/template-rows.<family>.json` = the Always rows in
confirmed order with `liturgyRefs`. Until that file lands, the Friday/Saturday templates gain nothing.

- **A-W3″ · Template rows.** Merge the Always rows into the Friday and Saturday template defaults (and the
  Firestore overrides via the PLAN's `merge_fixed_liturgy_into_template` stage/commit tool), interleaved with the
  existing song slots in confirmed order; a fixed row that names a moment the template already carries as a song
  slot (Bar'chu, Sh'ma, Mi Chamocha…) is **not** duplicated — the song slot gets the `liturgyRefs` instead. Cloned
  fixed rows are ordinary rows: deletable per service with no warning (that is "explicitly skipped").
- **"Sometimes" rows** are what `propose_service_frame` offers (Addendum 1). **"Never" rows** stay in the lookup for
  identity and are never proposed.
- **Band view**: fixed rows without `fileId` collapse to a thin labelled divider in Perform mode, tap-to-expand,
  per-device preference, default collapsed (Daniel: yes, show them collapsed).
- **Print / gig packet**: one option, three values — `rows=music` (rows with a chart or `type: song`), `rows=full`
  (everything), `rows=both` (two documents, or two sections in one PDF — pick what the existing print route makes
  easy and say which). Default for `generate_gig_packet` = `music`; default for `generate_service_sheet` = `full`.
  Expose the same choice in the browser print dialog.
- Binding (A-W3′), census (A-W5′), book-switch (A-W4′) unchanged. Order: as before, with A-W3″ after Daniel's
  Always list lands (Cowork writes it; do not derive it from the book or the census yourself).

**Landed 2026-09-15 (later):** `src/data/templates/template-rows.friday.json` (21 Always rows) and
`template-rows.saturday.json` (24 Always rows) are on disk — Daniel's marks, in service order, with `liturgyRefs`
(legacy-booklet page; draft-feed unitId where one exists). Each file also lists `sometimes` (frame candidates),
`never`, `settings` (a booklet entry that is a setting/translation of another moment — Thou Shalt Love → V'ahavta,
Sanctuary → Adonai S'fatai, El Na R'fa Na → Mi Shebeirach, Bayom Hahu → Aleinu: these bind to that moment in the
lookup and are never rows of their own) and `unruled`. Rulings superseded: the Saturday Amidah Birkat Kohanim is
**never** (only the concluding Birkat Kohanim, which ends every CRC service; Adon Olam sometimes after). A-W3″ may
proceed from these files. Note `K'dushat HaYom` (Saturday) is Always with no booklet page — clone it page-less.
