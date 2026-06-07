# Cowork / Claude-Code authoring guidance

Standing agent-behavior lessons distilled from cowork-session findings. **Future
cowork + Claude-Code authoring prompts should reference this file** so these
mistakes don't repeat. Add to it as new lessons surface.

## From the 2026-05-22 Kabbalat-Shabbat build session (#10/#11/#12)

### G-1 — Empty date-window ≠ "it doesn't exist" (was #10)
When a `list_setlists` / `search_*` query with a `from`/`to` (or other narrowing
filter) returns `[]`, **do NOT conclude the item is missing.** Widen first: retry
without the date window, or pull the unfiltered list and grep client-side, THEN
decide. (This is the safe workaround for the open `list_setlists` filter question —
VERIFY-1.) A false "the setlist doesn't exist" sends the whole session down the
wrong path.

### G-2 — "X looks weird / wrong" → get the evidence before changing anything (was #11)
A render-style or "this looks off" complaint is NOT a spec to mutate data. **Ask for
a screenshot and/or call `read_widget_context` first** to see what the user actually
sees. (In the 5/22 session a song was renamed in response to a render-style
complaint — the rename was unnecessary; the issue was a display/mimeType artifact,
not the name.) Confirm the real cause before any write.

### G-3 — Use the right reorder primitive (was #12)
To move ONE row to a new position, use **`update_track({ patch: { position } })`** —
that's the single-row move primitive. Prefer it over `reorder_setlist` (which
rewrites the whole order) for single moves; it's safer and less destructive.

## How to apply
- Bake G-1/G-2 into the "before you conclude / before you write" preamble of any
  authoring prompt.
- G-3 belongs in any prompt that touches setlist ordering.
