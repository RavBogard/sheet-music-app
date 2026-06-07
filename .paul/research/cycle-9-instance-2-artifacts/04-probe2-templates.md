# Probe 2 — Template starting points + round-trip fidelity

## Pre-state (HIGH finding — C7I1-001 still open)
`list_templates({})` → `{ok:true, templates:[], total:0}`.

**Zero seeded templates in prod**, despite cycle-7's stated "templates as
conversation starters" goal (C7I1-001 — "Randy Shabbat morning", "B'nai
Mitzvah", "Shir Shabbat" should be seeded). A new band_leader logging in today
to start their first weekly authoring run has NO starting points — they have
to either start from a blank `create_setlist` (which the data shows almost no
one does — every recent setlist is a single hand-built doc with no template
lineage) OR ask Daniel for the id of last week's service to clone. The "easy
& intuitive" bar Daniel called out is not yet met for newcomers.

## Round-trip operations
1. `create_template_from_setlist({setlistId:"69be5383-…clone of Emor", name:"c9i2-template-shabbat-morning-roundtrip"})` →
   `{ok:true, templateId:"2855c50e-…", templateType:"shabbat_morning", trackCount:31, version:1}`.
2. `get_template({templateId})` → 31 tracks; canonical fields only (type/title/songId/fileId/fileName/key/bpm/leadMusician/referenceLink/notes); no per-track trackId/order/version — correct template shape.
3. `clone_setlist_from_template({templateId, newName:"c9i2-from-template-roundtrip", newEventDate:"2030-01-11"})` →
   `{ok:true, setlistId:"18d2cf2f-…", sourceTemplateId, trackCount:31, version:1}`.
4. `get_setlist(new id)` — full field-by-field equality check vs. source clone.

## Round-trip fidelity verdict
EVERY field round-tripped cleanly:
- 31 tracks → 31 tracks, order 0..30 contiguous
- All 6 row types preserved (song/header/prayer/transition/reading/note)
- `leadMusician` (Vocal Lead) preserved: "David Lazaroff" on Shalom Rav, "Daniel Bogard" on Hashkiveinu
- `notes` preserved: "Shiru Ladonai" on Hakafah; "c9i2 probe add" on Shalom Rav
- `key` preserved on rows that had one (Gm/Cm/Em/C/Bb/D/Dm)
- `fileId` + `fileName` chart bonds preserved verbatim (including the broken UUID bonds — template carries the bad bonds forward, which is the correct conservative behavior: validation is verify_setlist_charts' job, not template hydration's)
- `templateType:"shabbat_morning"` carried
- `sourceTemplateId` stamped on new setlist for provenance (matches doc claim)
- `serviceNotes` was null on source → null on template → null on cloned setlist (no false propagation)

## Findings

### HIGH — C7I1-001 still open: no templates seeded (C9I2-004)
`list_templates({})` → 0 results. The cycle-7 template-seed work is unshipped.
Tag: known-in-flight (deferred backlog). Affects band-onboarding axis directly.

### POSITIVE — template round-trip is reliable
For Daniel's stated workflow ("Randy Shabbat morning" template that becomes
the seed for every week's clone+tweak), the underlying mechanism works
correctly today. The blocker is purely that no templates exist, not that
the round-trip is broken.

### MED — template/setlist `templateType` is snake_case in prod data, but documented as kebab-case (C9I2-005)
Source data uses `templateType:"shabbat_morning"`. The instance-2 prompt + tool
docstrings give examples like `"shabbat-morning"` / `"bnai-mitzvah"` /
`"shir-shabbat"` (kebab). `list_templates({templateType:"shabbat-morning"})`
will miss the prod data once templates exist. Normalize at the writer or
make the filter case/separator-insensitive.

## Fixture inventory after Probe 2
- setlist `69be5383-a5b0-4470-aa40-2995c1938616` (c9i2-CLONE-emor-weekly-flow-test) — 31 tracks
- template `2855c50e-81dd-428f-a090-84c765ce9960` (c9i2-template-shabbat-morning-roundtrip)
- setlist `18d2cf2f-c558-47f3-b571-4ac5bedb5fec` (c9i2-from-template-roundtrip) — 31 tracks
