/**
 * The ONE list of track-row fields that travel on a copy.
 *
 * Used by every row-copying surface:
 *   - `clone_setlist`                 (setlist → setlist)
 *   - `create_template_from_setlist`  (setlist → template)
 *   - `get_template` / `update_template` normalization
 *   - `clone_setlist_from_template`   (template → setlist)
 *
 * This module exists because there used to be two of these lists —
 * `clone-setlist.ts` had its own private twin of `templates.ts`'s, with a
 * comment in `templates.ts` claiming it "matches clone_setlist's pattern".
 * They drifted anyway: the outline fields (`performer`, `description`,
 * `estimatedMinutes`, `liturgyRef`) were added to the template list and never
 * to the clone list, so "clone last week's Erev Shabbat" — Daniel's 90% flow —
 * silently dropped every printed page number off the rabbi's service sheet.
 * A comment is not a mechanism; a shared import is. Add a new copyable field
 * HERE and both surfaces get it.
 *
 * `honors` is deliberately absent, and must stay absent. Honors name specific
 * congregants at a specific service ("Rachel Cohen — birthday, candle
 * lighting"); carrying them forward on a clone or a template would print last
 * week's honorees on next week's sheet, which is worse than printing none.
 * Honors are re-authored per service.
 *
 * The setlist-level counterpart (`book`, `rabbi`, `serviceNotes`,
 * `templateType`) is copied explicitly at each call site, not from this list —
 * those live on the parent doc, not the row.
 */
export const COPYABLE_TRACK_FIELDS = [
    "type",
    "title",
    "key",
    "bpm",
    "leadMusician",
    "referenceLink",
    "notes",
    "songId",
    "fileId",
    "fileName",
    "performer",
    "description",
    "estimatedMinutes",
    "liturgyRef",
] as const

export type CopyableTrackField = (typeof COPYABLE_TRACK_FIELDS)[number]
