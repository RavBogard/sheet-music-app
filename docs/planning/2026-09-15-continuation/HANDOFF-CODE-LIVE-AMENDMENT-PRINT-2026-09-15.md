# AMENDMENT to HANDOFF-CODE-CONTINUATION-2026-09-15.md §1 — fixed rows must not make the printed setlist unwieldy

Daniel, 2026-09-15, after the sitting: "We end up skipping a lot of the pieces, and lots of times we know way in
advance that they will be skipped … musicians might very well just want a setlist with the things with
charts/songs associated, and not the other pieces at all."

This amends A-W3 and A-W5 in `PLAN-CODE-LIVE-INTEGRATION-2026-09-14.md`. Ruling 2 stands (the setlist is the whole
service) but is qualified: **the whole service is the plan, not a checklist of everything the book contains.**

## Binding

1. **Fixed rows are ordinary rows once cloned.** Deleting, reordering or renaming a fixed row in a setlist is
   allowed everywhere an ordinary row can be edited (browser and MCP). Nothing may refuse or warn on deleting a
   `fixed: true` row. The template is a starting point, not a constraint.
2. **The musicians' outputs stay songs-only.** `generate_gig_packet` and every band-facing print/export
   (`src/app/api/setlist/print/*` variants used for the band, Perform mode, chart packets) exclude rows with
   `fixed: true` and no `fileId` **by default**. Verify what each print route is used for before changing it and
   record it in the RETURN; if a route serves both the rabbi and the band, add a `?rows=all|songs` (default
   `songs`) rather than guessing.
3. **The rabbi's service sheet** (`generate_service_sheet`) shows fixed rows, but compactly: a fixed row without a
   chart renders as a single short line (label · page), never as a full song block. A `rows=songs` option exists
   there too.
4. **Skips known in advance belong in the template, not in every week's setlist.** Add an optional
   `omitFromTemplate: true` on rows in `src/data/templates/fixed-liturgy.*.json`; the merge (A-W3) skips those rows
   when building the template defaults but keeps them in the file so their identity is not lost. Daniel will mark
   which rows CRC does not normally do; until he does, treat none as omitted. Do not decide this for him.
5. **Publish and today.json are unaffected**: `startFolio` is the first row with a `liturgyRef` regardless of
   type; an author who deletes the first fixed row simply moves the start folio.

## Tests
- Deleting a fixed row via `update_setlist`/`remove_track` succeeds and is not flagged.
- Gig packet for a cloned Friday test setlist contains only rows with `fileId`.
- Service sheet renders fixed rows as one line each; `rows=songs` drops them.
- Template merge honours `omitFromTemplate`.

Append the outcome to `..\RETURN-CODE-LIVE-INTEGRATION-2026-09-14.md` under A-W5.
