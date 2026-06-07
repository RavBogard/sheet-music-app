# MCP tool surface — verify-before-trust (PARENT §3)

Source of truth for "tool exists": the wired MCP connection on this cowork
session (`mcp__38e08ce6-...__*` tool names visible to the runtime). MCP-only
policy per Daniel's launch directive — no direct `tools/list` curl.

## Authoring tools called out in instance-2 prompt §Surface — present?

| Prompt name | Wired tool | Present |
|---|---|---|
| list_setlists | mcp__…__list_setlists | YES |
| get_setlist | mcp__…__get_setlist | YES |
| create_template_from_setlist | mcp__…__create_template_from_setlist | YES |
| clone_setlist | mcp__…__clone_setlist | YES |
| clone_setlist_from_template | mcp__…__clone_setlist_from_template | YES |
| template CRUD: create_template | mcp__…__create_template | YES |
| template CRUD: update_template | mcp__…__update_template | YES |
| template CRUD: delete_template | mcp__…__delete_template | YES |
| template CRUD: list_templates | mcp__…__list_templates | YES |
| template CRUD: get_template | mcp__…__get_template | YES |
| add_track_to_setlist | mcp__…__add_track_to_setlist | YES |
| remove_track | mcp__…__remove_track | YES |
| reorder_setlist | mcp__…__reorder_setlist | YES |
| chart binding (swap_chart) | mcp__…__swap_chart | YES |
| suggest_band | mcp__…__suggest_band | YES |
| publish_setlist | mcp__…__publish_setlist | YES |
| generate_gig_packet | mcp__…__generate_gig_packet | YES |
| list_library | mcp__…__list_library | YES |

All authoring tools the instance-2 prompt names are present on the wired
connection. No phantoms to flag from the prompt itself.

## Adjacent tools relevant to axis (flagged, not yet called)

- `preview_publish` — exists; possible alternative/companion to
  `publish_setlist({dryRun:true})`. Worth probing in Probe 3 to see whether the
  two return the same shape or whether one is the "real" observability path.
- `propose_setlist_changes` + `commit_staged_changes` — staged-edit flow. Not
  in the instance-2 surface list but obviously authoring-relevant; mention in
  ergonomics narrative (Probe 7).
- `bulk_add_tracks` + `bulk_update_tracks` — relevant to "3-step weekly flow"
  ergonomics narrative (Probe 7).
- `recompute_setlist_track_count` — touches the trackCount drift surface
  cycle-9 hardening B is fixing. Out-of-axis to drive, in-axis to NOTE if I see
  drift during my clone+tweak probe.
- `verify_setlist_charts` — useful as an oracle after binding charts in Probe 1.
- `wait_for_setlist_change` — useful to observe fanout/version bump in Probe 4.

## KNOWN GAPS noted (PARENT §3) — do not probe as phantoms

The prompt warns against probing "MCP monitor-control" + "roster scheduling"
tools as phantoms. Those are out of axis (instances 4 + 5), so not relevant
here. Within the authoring axis no phantom tools were flagged.
