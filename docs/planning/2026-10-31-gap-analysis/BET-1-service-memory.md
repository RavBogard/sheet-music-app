# Bet 1: service memory rebuild

Builds on PR #28, which is merged: "usual" means at least 3 of the last 5 regular services,
`differsFromLast` is carried as data, specials are classified strictly, B'nei Mitzvah is its own
type, dedupe and cut-off are in place, and the warnings exist. The evidence rows are in
`research/mcp-authoring.md`. Daniel's rulings are in `STATE.md`.

## Goals (in order of value)
1. **MCP-02, moment-keyed slots.**
   - A song slot is keyed by `moment:<momentId>` wherever the row's title resolves to a moment
     (reuse the bind-on-type lookup), so Mi Chamocha Moshav, 6-8 and Ana B'Koach are ONE slot.
   - `song:<partGroup>` is only for non-liturgical rows with no moment.
   - Both history reads and profile rows use it.
2. **MCP-03, a profile is a cache, re-learned on every draft.**
   - The running order is the modal order of the profile's last N (5) regular services (not
     special, not B'nei Mitzvah).
   - **B'nei Mitzvah gets its own preset/profile** (`bnei_mitzvah_saturday`, plus the havdalah
     variant). Daniel: "its own flow that is different and needs its own preset".
   - The seed never comes from a special.
   - Every draft headline says what the order was learned from ("from your last 5 regular
     Shabbat mornings, Sep 5 – Oct 24").
3. **MCP-14:** rows of one moment or partGroup (piano, lyrics, lead-sheet parts) collapse into one
   slot, and the per-part bindings are kept as an attribute.
4. **MCP-04, "fill it but say it" (Daniel).** The readback names a filled row when:
   - (a) the usual is older than 8 weeks;
   - (b) `differsFromLast` is set ("Mi Chamocha: Moshav, your usual; Sep 26 was Ana B'Koach");
   - (c) the key is not on record;
   - (d) the slot rests on a single service.
   The rest stay folded. Warnings never block.
5. **MCP-05:** add `vsLast` to the draft and to `read_back_setlist`: per moment, what the last
   regular service had (chart, key, date). It is a compact list and recall only.
6. **MCP-06:** open rows carry `recall:{fileId, chartName, key, date, service}`. A choice may say
   `{index, useRecall:true}`.
7. **MCP-15:**
   - A missing profile seeds its order from a matching legacy template (open slots only, no
     fills), and the draft says so. The Randy Shabbat morning template exists.
   - `clone_setlist` and `create_setlist` accept `rabbiSlot` and `special`.
8. **MCP-21:** unresolved open items from the profile's previous setlist carry into the draft
   readback. Flag "book differs from profile".
9. **MCP-23:** history overlays `performedDeviations` (as performed).
10. **MCP-25:** expose `reseed_service_profile` on the authoring surface:
    - admin or band_leader only;
    - `dryRun` defaults to true (F-05);
    - it returns the order it would learn and its sources.
11. **MCP-16:** bond confidence adds `title_mismatch` and `key_differs_from_history` flags, and
    caps a profile match at medium when the usual is stale.
12. **MCP-20, voice readback (Daniel left it to the lead).**
    - More than 5 exceptions: "Nine open slots. First three: … Want the rest?"
    - Speak the setting and key, never file names.
    - "Last time" gets a month ("in July").
    - Drop the trailing date from a name when it equals the date.
13. **MCP-24:** update `docs/planning/2026-10-30-setlist-memory/ROADMAP.md` with this as Release 5.

## Rules
- Never choose a setting nobody chose: recall only.
- Row order on existing setlists is the author's.
- Brothers Lazaroff: memory stays under its `gig` scope. `draft_service` for band tenants is
  untouched here (bet 5).
- Every MCP-visible change goes through `richError` envelopes. New tools go into
  `tool-access.ts` (`reseed` is a write).
- Tests: a unit test for each behaviour, and the emulator test for `draft_service` updated.
- After merge, the lead re-seeds the three profiles `profile__crc__friday_night:daniel_karen`,
  `profile__crc__shabbat_morning:daniel_karen` and `profile__crc__shir_shabbat` with the new tool.
