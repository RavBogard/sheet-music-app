# Cycle-9 Sweep — Instance 2: Weekly authoring flow end-to-end

**Read `cycle-9-sweep-PARENT.md` first.** Sign `from cycle-9-instance-2`.
uidPrefix: `c9i2`. Bearer: pool row `ASSIGNMENT=cycle-9-instance-2`.

## Why this axis

This is Daniel + David Lazaroff's real weekly job, done through Claude + MCP
(NOT the in-app UI). ~90% of a week's setlist is last week's setlist with a few
songs swapped. Probe the FULL chain as a band_leader would, end to end, and find
where it's clumsy, surprising, or breaks.

## Surface (MCP via /api/mcp + the resulting Perform surface)

Authoring tools: `list_setlists`, `get_setlist`, `create_template_from_setlist`
/ `clone_setlist` (verify which exist via `tools/list` — PARENT §3), template
CRUD, `add_track_to_setlist` / `remove_track` / reorder, chart binding,
`suggest_band` (being fixed concurrently — verify post-fix), `publish_setlist`
(in-app + push + email + SMS, with the test-owner + cross-owner gates),
`generate_gig_packet`, `list_library`.

## Probes (the real weekly path + edges)

1. **Clone last week → tweak.** Take a recent real Shabbat setlist, clone it
   (template round-trip or clone_setlist), swap 2-3 songs (remove + add tracks,
   bind charts), reorder. Confirm track integrity (order contiguous, fields +
   Vocal Lead preserved — terminology per PARENT §4).
2. **Template starting points.** Daniel wants templates as conversation
   starters ("Randy Shabbat morning", "B'nai Mitzvah", "Shir Shabbat"). Are
   prod templates seeded yet (C7I1-001)? If not, that's a finding. Round-trip a
   template → setlist and confirm fidelity.
3. **Publish.** `publish_setlist` happy path with derived recipients; confirm
   `dryRun` observability (returns recipients without sending — PARENT, and
   `[[feedback_dryrun_is_observability]]`). Confirm the test-owner +
   cross-owner gates still 403 (don't actually spam real humans — use dryRun +
   test fixtures).
4. **Band receives.** After a (test) publish, does the change reflect in Perform
   / notify-updated fanout? (Coordinate with Instance-1's surface but stay MCP-
   side here.)
5. **suggest_band.** Post-fix, does it return a ranked Vocal-Lead/instrument
   suggestion for a real setlist (was 500 / FAILED_PRECONDITION — C8I2-002)?
6. **Edges:** publish a setlist with many unbonded tracks; clone a 0-track
   setlist (C8I1-003); template name collisions / long names (C8I1-004/005);
   David-as-band_leader (trusted-leader) path vs admin — any gate asymmetry?
7. **Ergonomics:** narrate where the flow needs too many calls, returns
   confusing envelopes, or lacks an obvious "do the whole week in 3 steps" path.
   Daniel's bar is "easy and intuitive" — UX friction in the MCP flow is a
   legit MED finding.

Cleanup: `cleanup_all_test_data({prefix:"c9i2"})`; revoke any minted children;
delete any test setlists/templates. Deliverables + HANDOFF per PARENT §6.
