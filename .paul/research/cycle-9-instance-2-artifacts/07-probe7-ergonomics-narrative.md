# Probe 7 — ergonomics narrative

## How the "ideal 3-step weekly flow" looks today

Daniel's stated bar: "easy and intuitive". The notional 3-step weekly flow:
1. clone last week,
2. swap a few songs,
3. publish.

What I actually called to execute Probe 1's "minimal" tweak of last week's
Shabbat (without any backtracks for broken charts):

| # | Call | Purpose |
|---|---|---|
| 1 | list_setlists(sort:recent_event) | find last week |
| 2 | get_setlist(may2) | see what's in it |
| 3 | clone_setlist | step 1 of ideal flow |
| 4-6 | search_library × 3 | find replacement songs |
| 7-8 | remove_track × 2 | drop 2 problem rows |
| 9-11 | add_track_to_setlist × 3 | add new rows |
| 12 | swap_chart | one swap mid-setlist |
| 13 | get_setlist | needed for reorder (have to know current trackIds) |
| 14 | reorder_setlist | step 2 of ideal flow |
| 15 | verify_setlist_charts | discover broken bonds |
| 16 | preview_publish | confirm publishability |
| 17 | publish_setlist | step 3 of ideal flow |

**17 calls**, not 3. Some are inherent (the agent needs to read state),
some are friction. The high-leverage friction points:

### Friction 1 — reorder_setlist requires enumerating every trackId
For a 31-row Shabbat setlist, the reorder param is a 31-element array of
UUIDs. The agent has to fetch the current state, sort, manually re-arrange,
and send the whole array. Mistakes are easy (omitting one is rejected;
duplicating one is also rejected per the tool's "every current track id of
the setlist exactly once" contract).

**Suggestion:** add `move_track({setlistId, trackId, before|after, anchorTrackId})`
or `move_track({setlistId, trackId, newOrder})`. Most reorder ops are "move
this one row to right after this other row"; today's reorder_setlist is the
"shuffle the whole deck" primitive.

### Friction 2 — search_library returns broken-chart rows as "active"
Probe 1 found 3/3 song-bonds I added via `search_library` results bonded to
unreachable Drive files. The catalog row's `status:"active"` is misleading
when chart bytes aren't actually fetchable. Today the only way to filter is
to BOND the song, then run `verify_setlist_charts` to discover the bond is
broken, then remove + retry. That's 3 calls per attempt to add 1 working
song.

**Suggestion:** search_library should default-hide rows whose underlying
file is known to be missing (the dedupe-orphan filter exists; extend it to
verified-missing). Or expose a `mustBeFetchable: true` filter.

### Friction 3 — swap_chart's default behavior loses personalization
Default `syncMetadata: true` overwrote the hand-curated title "Modeh ani - Keira"
with the catalog title "Modeh Ani (Klepper-Freelander)". A band_leader who
adds personal notes to row titles (the "who's leading what" semantic) will
silently lose them on chart swaps. The fallback NOTE-1 logic only protects
titles that exactly match the OLD song's catalog title.

**Suggestion:** flip the default to `syncMetadata: false`, OR have NOTE-1
detect "the row title is NOT the old catalog title" and preserve it
regardless. The current default is hostile to curation.

### Friction 4 — chart-health is a separate read, not auto-surfaced post-clone
clone_setlist returns the trackCount and version but doesn't tell you that
the source already had 4 broken bonds (true even for the May 2 setlist
PRE-tweak). The agent has to remember to run verify_setlist_charts as a
separate call. publish_setlist DOES embed the chart-health pre-flight in
its refusal envelope, so the breakage surfaces eventually — but that's a
late-stage error. Earlier surfacing is friendlier.

**Suggestion:** clone_setlist could include a lightweight `inheritedChartHealth`
summary in its response (just counts: ok, missing, unreachable). Cheap to compute
during the clone walk and saves a follow-up call.

### Friction 5 — no templates seeded → no starting points
Per Probe 2, `list_templates` returns 0. A new band_leader has nothing to
clone from except other people's already-built setlists. C7I1-001 is still
the load-bearing onboarding blocker.

### Friction 6 — trackCount drift on listing → misleading clone-source choice
Per Probe 6, `list_setlists` returned trackCount:0 for "Confirmation Shabbat"
which actually has 5 tracks. An agent (or human) picking a clone source
based on listing trackCount is making decisions on stale data. Cycle-9
hardening lane B is fixing this.

### Friction 7 — sweep-ergonomics: admin bearer + uid-prefix cleanup mismatch
The cowork sweep PARENT spec assumes `cleanup_all_test_data({prefix:"c9iN"})`
sweeps the instance's fixtures. But the wired MCP bearer here is the admin
bearer, so clone_setlist / create_template_from_setlist fixtures end up
owned by Daniel's real uid, not a `test-c9i2-*` uid. The prefix-cleanup is
effectively a no-op on these fixtures; the only path is explicit
delete_setlist + delete_template per id, which means each cowork sweep must
self-track its own fixture IDs.

**Suggestions (any one closes the gap):**
- Add `isTest: true` to clone_setlist + clone_setlist_from_template +
  create_template_from_setlist. Stamp the doc with isTest, then
  cleanup_all_test_data could sweep by setlist.isTest=true AND name-prefix
  in addition to uid-prefix.
- OR document that cowork sweeps using admin bearers MUST track fixture ids
  and delete-by-id; tighten PARENT §6 accordingly.
- OR provide an admin-only cleanup_setlists_by_name_prefix tool.

### Friction 8 — gate testing requires a non-admin bearer the MCP connection can't carry
Several gate-asymmetry checks (band_leader-publishing-others' setlists,
cross-owner, test-owner) need a non-admin bearer. The wired MCP connection
is fixed to one bearer for the session, so the sweep instance can't exercise
those gates from this surface. Options:

- Add a tool param like `actAs: {uid, role}` for admin-only impersonation
  (heavy, security-sensitive — probably not the right move).
- Spec the cowork sweep launch with a band_leader bearer for instances that
  need to test non-admin gates.
- OR document the gate behavior in the tool envelope so an agent CAN
  reason about it without exercising the call (e.g., publish_setlist's
  refusal envelope could carry `gateChecks: {owner:"ok", role:"ok", chartHealth:"refused"}`
  to surface which gates passed/failed).

## What a "3-step weekly flow" would look like if these frictions were closed

Composite tool sketch — `start_weekly_setlist({sourceSetlistId|templateId,
newEventDate, swaps:[{removeBy?, addSongId?, position?, leadMusician?}], rabbi?,
publish:false|"dryRun"})`:

1. Clone source.
2. Apply swaps (remove-or-add list).
3. Set rabbi metadata.
4. Run verify_setlist_charts.
5. Return: `{setlistId, trackCount, chartHealth, preview_publish_recommendation, suggested_chart_alternatives:[]}` —
   one composite payload the agent can chat-confirm with the user.

Three calls then: `start_weekly_setlist` → user confirms → `publish_setlist`.
That's the "easy and intuitive" surface Daniel asks for.

## Bottom line for Probe 7

The underlying primitives are SOLID (clone fidelity, template round-trip,
publish refusal envelope, gig packet generation, suggest_band fix). The
ergonomics gap is in the COMPOSITION of those primitives into a smooth
weekly flow — too many separate calls, too many post-hoc validations the
agent has to remember to run, and catalog hygiene gaps that surface late.
None of these are BLOCKS-GREEN by themselves; together they make the flow
"works for Daniel/David who know the surface cold, hostile to a newcomer."
