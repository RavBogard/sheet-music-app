# Setlist memory — roadmap

Design: `DESIGN.md` (approved by Daniel 2026-10-30). One plan per release, each written once the
previous release has landed, because each builds on the one before. One PR per release.

| # | Release | Plan | Status |
|---|---|---|---|
| 1 | History and metadata: `get_song_history`, `export_setlists`, chart setting and instrument-part grouping, written-key back-fill | `PLAN-1-history-and-metadata.md` | shipped 2026-10-30 (`RETURN-1.md`) |
| 2 | Profiles and remembered corrections: profiles on `templates`, moment slots plus per-song memory, standing vs one-off changes, the confidence ladder computed server-side, seeding from history with a one-time review, the rabbi always given by the author, special flag | `PLAN-2-profiles-and-corrections.md` | building |
| 3 | Readback and agent guide: exceptions-first summary returned by the server, the rewritten `agent-guide.ts` flow, email exceptions and open items | `PLAN-3-readback.md` | building |
| 4 | Pages: emit `legacy-beit-mitzvah` from shireishabbat, set each profile's book, automatic page binding at build time | to write after 2 (can run beside 3) | — |

Coordination:
- The Beit Mitzvah portal reads B'nei Mitzvah service music through `src/lib/beit-mitzvah/` (PRs
  #16 and #17). Releases 2–4 must keep that contract.
- David's workflow report (pending) feeds the seeding review in release 2.
- Monitoring for Daniel and David is a separate thread.

GATE: plan 2 written and executed without a separate approval round. I proceeded because the design is approved and standing authority covers plans built from it. The real seeding waits for the Daniel/David seed review (Task 7).

GATE: no back-fill of rabbi on past setlists — proceeded because Daniel (2026-10-30) said attributing old services is not worth it ("figure it out as a solution moving forward, or just don't use that context"). Past setlists without a stored rabbi stay unattributed and never count toward a rabbi's profile. draft_service now seeds a missing profile on first use from setlists marked with that service and rabbi; Randy's profiles start the first week one is built with the rabbi set. The one-time seed review (SEED-REVIEW.md) is dropped: a seed fills only `usual` slots and lists the rest, and every draft reads its open slots back to the author.

GATE: PLAN-3 (readback, open items, read_back_setlist, agent guide) built without a separate plan review — proceeded because it implements the approved DESIGN §5.2–5.5 plus David's notes, and Daniel's standing authority covers plan-to-build.
