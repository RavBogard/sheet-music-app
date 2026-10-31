# Gap analysis — 2026-10-31

Full UI / UX / MCP / frustration / usability / workflow / feature gap analysis of
centralreform.live, its MCP server, the Brothers Lazaroff tenant, the mixer, and the seams
to the rest of the worship-tech family.

## Alignment round 1 (Daniel, 2026-10-31)

- **Scope:** all four surfaces: Perform (iPads), MCP authoring, the browser app outside Perform,
  and Brothers Lazaroff.
- **Personas:** all equal, a section per role (Daniel, band musicians, David, Randy, Drew,
  Michael, the BrosLaz members).
- **Main pains:** the weekly setlist flow and Perform reliability.
- **Weekly flow goal:** fewer wrong guesses, above all the wrong song or setting and the wrong
  chart version or key. Speed matters less.
- **iPad failures:** no particular failure named; survey them all.
- **Ambition:** big bets welcome.
- **MCP tool count:** flag sprawl only where it causes wrong tool choice or errors.
- **Browser app role:** backup authoring, review, small edits.
- **v2 redesign:** forgotten. Report its state and recommend finishing, merging or deleting it.
- **Adoption:** partial. Some players are on iPads and others are on paper, out of habit or
  comfort and from trust/reliability doubts.
- **Brothers Lazaroff:** a full peer analysis of the gig workflow.
- **Mixer:** full coverage (wedge-mix UX, bridge reliability, MCP control).
- **Integrations:** the full family view (Overlays, Beit Mitzvah portal, shireishabbat books,
  Haftarah).
- **Evidence:** code and docs, a live browser walk, live MCP calls and telemetry.
- **Prod writes:** test data is allowed, clearly prefixed (`test-gap-`) and cleaned up after.
- **Budget:** thorough, with about five research agents.
- **Deliverable:** an artifact web report plus a repo backlog (`BACKLOG.md` here).
- **After:** quick, safe wins are auto-built under standing authority; big bets wait for Daniel.
  A second popup round follows the research.

## Log
- Research wave launched: perform, mcp-authoring, web-app (+ live walk), mixer, broslaz+family.
  The lead does telemetry.
- mcp-authoring probe side effect: draft_service seeded 3 REAL profiles on first call
  (profile__crc__friday_night:daniel_karen, profile__crc__shabbat_morning:daniel_karen,
  profile__crc__shir_shabbat), seeded from atypical sources (MCP-03). Left in place; deleting
  re-seeds identically until MCP-03 is fixed. Raised in round-2 questions.

## Alignment round 2 (Daniel, 2026-10-31)
- **Stale usual:** fill it but say it (older than 8 weeks or differs from the last service).
- **B'nei Mitzvah:** its own flow with its own preset. It never feeds the regular profiles.
  GATE: camp, holiday and guest services are also kept out of the regular profiles. Proceeded
  because this follows from "Bat Mitzvah is its own flow" and from the stale-usual fix.
- **Probe-seeded profiles:** re-seed them after the profile fix ships.
- **Chart revisions:** future setlists only. Past setlists keep their exact chart, played keys are
  kept, and standing choices follow the new version.
- **Signed-out iPads:** show a "Setlist updated, tap to refresh" strip, with no auto-reload while
  a chart is open.
- **Fleet iPads:** personal logins, not device accounts. The fleet readiness board would then be
  per person; it is deferred.
- **Page turns:** edge tap zones only, with a per-device off switch. Pedal keys, half-page turns
  and night charts were not chosen and stay in the backlog.
- **Open-chart overlay:** no preference given. GATE: build the note + Vocal Lead line and
  "Next: title (key)". Proceeded because they were the recommendation and Daniel raised no objection.
- **v2:** delete it all.
- **Trims:** Schedule out of the top nav, the stale Changelog link out, the dead Perform
  components out, and the `/admin` alias out.
- **Per-instrument copies:** fold them under the parent service in the list. Keep the copies.
- **People:** approve Drew and hide test accounts. Meir is undecided: leave.
- **Wedge ceilings:** yes, set by Drew, starting at about -2 dB. Needs a bridge release.
- **Mixer plan:** saved mixes and an engineer console. The change log/undo and the one-call
  "my mix" were not chosen for now.
- **Bridge alerts:** push to Drew and Michael.
- **Bus 5:** also assign it to the account Claude Desktop uses (crcmusic@).
- **BL wording:** Brothers Lazaroff branding, with CRC staying the legal operator for now.
- **Gig fields:** no preference. GATE: venue, address, load-in/soundcheck/start/end and set
  lengths with a total. Proceeded on the recommended starting set.
- **Family:** the week-key spine and a Beit Mitzvah card on the setlist. Names are not private
  (Daniel: "Nothing is private... names can be in there"), so student names may show.
- **Analytics:** an in-app page counter in the existing beacon only. No Vercel Analytics.
- **First big bet:** the service memory rebuild.
- **Pre-commit checks:** existing setlist on that date, a dead or archived chart, and a played key
  that differs from the written key on a PDF. All of these WARN and never block.
- **Voice readback:** no preference. GATE: count plus the first three, settings not file names,
  dates on "last time". Proceeded on the recommendation.
- **Shirei Tshuvah:** printed at 184pp. The registry is right; fix the CLAUDE.md note.
