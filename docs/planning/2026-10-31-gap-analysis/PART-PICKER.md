# MusicXML part picker (PERF-15 / B4)

Daniel's answers (2026-11-01):
- **First open of a multi-part MusicXML chart:** show the full score, with a "Parts" button.
- **Several parts at once:** yes, as a checkbox list. Any combination, but at least one part.
- **Where the choice is remembered:** per iPad, per chart (fileId), signed in or not, in
  per-device storage alongside `chartZoom`.
- **Presets:** a leader can set a default part ahead of time through Claude/MCP. Each preset has a
  scope (an instrument or a person) and the part names to show.
  - **Order of precedence:** the device's own pick, then a preset for the signed-in person, then a
    preset for the device's instrument (if known), then the full score.
  - A preset matches parts by name (case-insensitive, loose: "Bass" matches "Bass Guitar"). When
    nothing matches, show the full score. Never guess a part.
  - Presets are org-scoped (both tenants) and follow F-05: dryRun by default, which returns the
    parts the preset would select on the given charts.

## Rules
- The renderer is OSMD in SmartScoreViewer: hide parts with `Instruments[i].Visible`, then
  re-render.
- Transposition must still work on the visible parts.
- A chart with one part shows no Parts button.
- Perform stays bulletproof: picking parts works offline, and a failed re-render falls back to the
  full score.
- Keep 44px targets, DESIGN.md tokens only, i18n in en and he with translator notes.
- Keep every data-testid.
