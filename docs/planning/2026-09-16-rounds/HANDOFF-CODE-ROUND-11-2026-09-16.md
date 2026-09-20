# HANDOFF → Claude Code — .live round 11 (2026-09-16): absorb round 10, fold case, prove row order

Governance unchanged. Read `RULINGS-INTEGRATION-2026-09-14.md` Rounds 9–11 first. shireishabbat `e5a87e3` is the build.

## CentralReform.live — append to `RETURN-CODE-LIVE-INTEGRATION-2026-09-14.md`

1. **Round 10 .live section, now runnable:** `RETIRED_UNITS` fourth row (`shofar.service@crc-rh-morning` →
   `shofar.shofar-service@crc-rh-morning`, R9-b); regenerate the book; `npm run sync:books`; re-point the two Shofar rows
   (`35380072/d709ca94`, `e7cf1877/4f7f98f0`) to the successor with `momentId shofar-service`, pages untouched; sweep 84
   setlists, 0 rows on any retired id.
2. **R11-a** — case-fold (and apostrophe-fold) in `unit-lookup` before ownership is decided; test: "Prayer for Peace" and
   "Prayer For Peace" both answer *plausible* with two candidates, never *clear*.
3. **Aliases reach the binder:** dry run over the four Shabbat templates and every setlist with `eventDate` ≥ today; report
   rows moving from plausible/unmatched to bound because of a batch-2/3 alias. **Bind nothing** — dry only; Daniel has
   asked that no setlist row be changed this round beyond item 1's two re-points.
4. **R11-b** — tests that every setlist view renders rows in stored `order` (edit, Perform incl. fold, service sheet, gig
   packet, `today.json` emitter, the setlist payload Overlays imports) and that the binder, backfill, bind-on-type and
   `propose_service_frame` never write `order`; grep `src/` for any sort keyed on `folio`/`liturgyRef`/`momentId` and
   report each hit with its verdict. If any view does re-sort, fix it and say so plainly.
5. `today.json` re-emitted; chart path 200/200/404/403 `[measured]`; deploy.

## Launch prompt

.live (in `sheet-music-app`): `Read ..\HANDOFF-CODE-ROUND-11-2026-09-16.md and RULINGS Rounds 9–11; do the five items in
order; append to ..\RETURN-CODE-LIVE-INTEGRATION-2026-09-14.md.`
