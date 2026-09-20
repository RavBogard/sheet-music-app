# HANDOFF → Claude Code sessions — round 6 (2026-09-15): closing what round 5 opened

Governance unchanged. Read `RULINGS-INTEGRATION-2026-09-14.md` (all addenda, Round 6 last) first. R6-a, R6-b, R6-g are
approved by default — the launch prompt Daniel pastes is the confirmation; if he objects to one, he says so there.
Everything `[measured]`.

## shireishabbat — `RETURN-CODE-MOMENTS-ROUND-6-2026-09-15.md` (launch first)

1. **R6-a** — the same four-line patch round 5 ran on `crc-yk-morning`, on `crc-rh-morning`: `amidah.kdushat-hayom@crc-rh-morning`
   (p.56) → `amidah.untaneh-tokef@crc-rh-morning`; `amidah.untaneh-tokef@crc-rh-morning` (p.57–58) →
   `amidah.brosh-hashanah@crc-rh-morning`; registry/rail name "Un'taneh Tokef" on 56; `_aliases` gains "K'dushat Hayom" →
   "Un'taneh Tokef" in that book; no printed byte changes. Clear the `captureFindings` note. Confirm `moments.json`
   reports `untaneh-tokef` at `crc-rh-morning` folio 56 and `brosh-hashanah` gains the occurrence.
2. **R6-g** — `legacy-slichot`: emit `printedFolio` from the capture's `src:` (or whatever field carries the printed page)
   for every unit that has one; report the count with and without. If the capture carries no printed pages at all, say
   so and stop — nothing typed by hand.
3. Rebuild `dist-app/`; report the new `sources[].gitSha`; moments gate all six modes; the 14-line baseline unchanged.
4. **R6-h (added after the round-6 return, `10d3a58`)** — `amidah.kdushat-hayom-kavannah@crc-rh-morning` (p.56) →
   `amidah.untaneh-tokef-kavannah@crc-rh-morning`, registry name "Kavannah: Un'taneh Tokef" or the book's existing
   kavannah-naming convention; `_aliases` carries the old name; `captureFindings` cleared. Same measurement as R6-a
   (page text byte-identical, blocks byte-equal, `4 4`-class diff). Rebuild; new `gitSha`; append to
   `RETURN-CODE-MOMENTS-ROUND-6-2026-09-15.md`. R6-i needs nothing.

## CentralReform.live — append to `RETURN-CODE-LIVE-INTEGRATION-2026-09-14.md` (after shireishabbat)

1. **R6-d** — regenerate `crc-machzor-2008` from the rebuilt feeds. The identity check will (correctly) refuse because
   `amidah.kdushat-hayom@crc-yk-morning` and `@crc-rh-morning` no longer exist: add an explicit `RETIRED_UNITS` list in
   `emit-machzor-book.mjs` carrying the retired ids with the ruling that retired each and the id it became — three:
   `amidah.kdushat-hayom@crc-yk-morning` (R5-a), `amidah.kdushat-hayom@crc-rh-morning` (R6-a),
   `amidah.kdushat-hayom-kavannah@crc-rh-morning` (R6-h);
   the check accepts only listed retirements. Delete the R5-a override when the script prints "RULINGS THAT NOW MATCH THE
   CAPTURE". Expected diff: Un'taneh Tokef RH-morning 57 → 56; B'rosh Hashanah entries appear at 57 (RH) and 148 (YK);
   nothing else moves. Any row on a setlist whose `unitId` was a retired id gets the successor id and its `momentId`
   re-derived — page untouched.
2. **R6-b** — provision Upstash Redis for the production project via the Vercel marketplace (free tier), set the two
   variables as Config (readable), `READER_PUBLIC_CHARTS_ENABLED=true` (no trailing newline), redeploy; verify select
   200 available for the Modeh unit from the siddur origin, chart 200 `application/pdf` `no-store` single origin, other
   unit 404, foreign origin 403. Also measure the general limiter now that it has a distributed store: one normal
   authoring request path still 200. `CHARTS-001.json` → approved/live, rev +1. **If Daniel's launch prompt says "no
   Upstash", skip this item and say so.**
3. If R6-g landed: `legacy-slichot` entries into the book under `service: selichot`; re-run the binder dry on any Selichot
   setlist that exists and report.
4. `today.json` re-emitted and read back; `reconcile_service` on `https://overlays.centralreform.org` still `ok:true`.

## Reader — append to `RETURN-CODE-READER-TODAY-2026-09-14.md` (parallel with .live)

1. **R6-c** — hand-apply, in this repo, exactly what the refused carry would have brought and nothing else: in
   `books/books.json`, `crc-rh-morning` `when.dates: ["2026-09-12"]`, `shirei-tshuvah` `when.dates: ["2026-09-13"]`, no
   `daypart` (the emitter's rule); in the shelf's `crc-yk-morning` feed, the two units' id/name/folio as shireishabbat
   `95a9836` emits them (Un'taneh Tokef 147, B'rosh Hashanah 148–149), preserving every authored `renderStructure`/
   `standalone`/`render` field on those units. After shireishabbat's R6-a lands, the same two-unit patch on
   `crc-rh-morning` (56 / 57–58). Assert byte-identity of every other unit; tests; deploy; `gh workflow run test.yml`.
2. Record for the corpus lane, one paragraph: the six authored fields the source build must emit before a full carry can
   run again, with counts from the refused `--check`.

## Overlays — nothing this round. (R6-e is Daniel's Vercel setting, not repo work.)

## Launch prompts

shireishabbat (items 1–3 done at `10d3a58`; relaunch for item 4): `Read HANDOFF-CODE-ROUND-6-2026-09-15.md §shireishabbat
item 4 and RULINGS R6-h; do it; append to RETURN-CODE-MOMENTS-ROUND-6-2026-09-15.md.`

.live (in `sheet-music-app`, after shireishabbat): `Read ..\HANDOFF-CODE-ROUND-6-2026-09-15.md and the RULINGS Round 6
addendum; do the .live section in order; append to ..\RETURN-CODE-LIVE-INTEGRATION-2026-09-14.md.`

Reader (after shireishabbat): `Read HANDOFF-CODE-ROUND-6-2026-09-15.md §Reader (this repo); do both items; append to
RETURN-CODE-READER-TODAY-2026-09-14.md.`
