# Setlist memory — roadmap

Design: `DESIGN.md` (approved by Daniel 2026-10-30). One plan per release, each written once the
previous release has landed, because each builds on the one before. One PR per release.

| # | Release | Plan | Status |
|---|---|---|---|
| 1 | History and metadata: `get_song_history`, `export_setlists`, chart setting and instrument-part grouping, written-key back-fill | `PLAN-1-history-and-metadata.md` | shipped 2026-10-30 (`RETURN-1.md`) |
| 2 | Profiles and remembered corrections: profiles on `templates`, moment slots plus per-song memory, standing vs one-off changes, the confidence ladder computed server-side, seeding from history with a one-time review, the rabbi always given by the author, special flag | to write after 1 | — |
| 3 | Readback and agent guide: exceptions-first summary returned by the server, the rewritten `agent-guide.ts` flow, email exceptions and open items | to write after 2 | — |
| 4 | Pages: emit `legacy-beit-mitzvah` from shireishabbat, set each profile's book, automatic page binding at build time | to write after 2 (can run beside 3) | — |

Coordination:
- The Beit Mitzvah portal reads B'nei Mitzvah service music through `src/lib/beit-mitzvah/` (PRs
  #16 and #17). Releases 2–4 must keep that contract.
- David's workflow report (pending) feeds the seeding review in release 2.
- Monitoring for Daniel and David is a separate thread.
