/**
 * The Perform setlist's row grammar, as class strings, so every list that
 * reads like a Perform setlist (Perform itself, Rehearse) draws the same
 * section labels, number column, key tag and page call. Display only.
 */

/** The list group the rows sit in: one paper block on the hairline. */
export const SETLIST_LIST_CLASS = "flex flex-col bg-card border-y sm:border border-rule sm:rounded-lg overflow-hidden"

/** A section label row; pair it with `SECTION_BAND_CLASS[hue]` for the ink and 2px rule. */
export const SECTION_LABEL_ROW_CLASS = "flex items-end gap-3 px-4 pt-3 pb-1 w-full text-start border-b-2 bg-card"

/** The section label's running head. */
export const SECTION_LABEL_TITLE_CLASS = "flex-1 min-w-0 truncate text-xs font-extrabold uppercase tracking-[0.1em]"

/** A row: dense, on the 1px hairline, no card. */
export const SETLIST_ROW_CLASS = "flex items-center ps-1 pe-4 py-2.5 border-b border-rule"

/** The muted display number before the title. */
export const ROW_NUMBER_CLASS = "tnum shrink-0 w-6 text-end text-xs text-muted-foreground"

/** A song title on the row's first line. */
export const ROW_TITLE_CLASS = "flex-1 min-w-0 break-words text-base font-medium leading-6 text-foreground"

/** BPM after the title. */
export const ROW_BPM_CLASS = "tnum ms-2 text-xs font-normal text-muted-foreground whitespace-nowrap"

/** The fixed key column, rendered on every row so the keys line up. */
export const KEY_COLUMN_CLASS = "shrink-0 w-10 sm:w-12 flex justify-center"

/** The key tag inside the key column. */
export const KEY_TAG_CLASS =
    "tnum inline-flex items-center justify-center px-1.5 rounded-[3px] border border-input text-xs font-bold leading-[1.125rem] text-foreground"

/** The fixed page-call column (empty when the row has no page). */
export const PAGE_CALL_CLASS = "tnum shrink-0 w-11 text-end text-[0.95rem] font-bold whitespace-nowrap text-page-call"

/** Second lines: under the title, past the number column, short of the key and page columns. */
export const ROW_BELOW_CLASS = "ps-8 sm:pe-[6.25rem] min-w-0"

/** The row's note line. */
export const ROW_NOTES_CLASS = "text-xs text-section-oxblood-ink break-words"
