# Setlist memory — roadmap

Design: `DESIGN.md` (approved by Daniel 2026-10-30). One plan per release, each written once the
previous release has landed, because each builds on the one before. One PR per release.

| # | Release | Plan | Status |
|---|---|---|---|
| 1 | History and metadata: `get_song_history`, `export_setlists`, chart setting and instrument-part grouping, written-key back-fill | `PLAN-1-history-and-metadata.md` | shipped 2026-10-30 (`RETURN-1.md`) |
| 2 | Profiles and remembered corrections: profiles on `templates`, moment slots plus per-song memory, standing vs one-off changes, the confidence ladder computed server-side, seeding from history with a one-time review, the rabbi always given by the author, special flag | `PLAN-2-profiles-and-corrections.md` | shipped 2026-10-30 (PRs 20–22; profiles seed on first draft) |
| 3 | Readback and agent guide: exceptions-first summary returned by the server, the rewritten `agent-guide.ts` flow, email exceptions and open items | `PLAN-3-readback.md` | shipped 2026-10-30 (PR 23) |
| 4 | Pages: register `legacy-beit-mitzvah` (feed tier, printed pages 1-63), B'nei Mitzvah profile book, family-booklet path | `PLAN-4-pages.md` | shipped 2026-10-30 (PR 26) |
| 5 | Service memory rebuild (gap-analysis bet 1): moment-keyed slots, profiles re-learned on every draft from the last 5 regular services, B'nei Mitzvah and Havdalah B'nei Mitzvah presets, part collapse, "fill it but say it", `vsLast`, recall on open rows, legacy-template fallback, carried open items, history as performed, `reseed_service_profile`, bond-confidence flags, voice readback | `../2026-10-31-gap-analysis/BET-1-service-memory.md` | in review (branch `gap/service-memory`) |

Still open after release 5 (from DESIGN):
- §5.8 per-instrument Perform: one setlist for every part instead of the `· Bb / · Eb / · Vocals` copies. A draft yields only the whole-band setlist.
- §5.8 retire or rewire the old bond-correction loop (`bond-corrections.ts` still runs beside profiles).
- No Karen split and no Brothers Lazaroff profiles, by design (BrosLaz memory stays under its `gig` scope).

Coordination:
- The Beit Mitzvah portal reads B'nei Mitzvah service music through `src/lib/beit-mitzvah/` (PRs
  #16 and #17). Releases 2–4 must keep that contract.
- David's workflow report (pending) feeds the seeding review in release 2.
- Monitoring for Daniel and David is a separate thread.

GATE: plan 2 written and executed without a separate approval round. I proceeded because the design is approved and standing authority covers plans built from it. The real seeding waits for the Daniel/David seed review (Task 7).

GATE: no back-fill of rabbi on past setlists — proceeded because Daniel (2026-10-30) said attributing old services is not worth it ("figure it out as a solution moving forward, or just don't use that context"). Past setlists without a stored rabbi stay unattributed and never count toward a rabbi's profile. draft_service now seeds a missing profile on first use from setlists marked with that service and rabbi; Randy's profiles start the first week one is built with the rabbi set. The one-time seed review (SEED-REVIEW.md) is dropped: a seed fills only `usual` slots and lists the rest, and every draft reads its open slots back to the author.

GATE: PLAN-3 (readback, open items, read_back_setlist, agent guide) built without a separate plan review — proceeded because it implements the approved DESIGN §5.2–5.5 plus David's notes, and Daniel's standing authority covers plan-to-build.

Release 1 leftovers shipped in PR 24 (spelling doubles, vocal parts, back-fill skip-on-failure, tenant-zone date bounds). Vocal-part back-fill: 8 choir recordings moved from setting to part; rerun 0 (`backfill-reports/setting-parts-vocal-applied.json`).

GATE: vocal-part back-fill applied to prod — proceeded because the dry run showed 8 rows, all choir-part recordings correctly reclassified, and back-fills with a reviewed dry run are this project's routine pipeline.
