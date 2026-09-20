/**
 * The one place the library's row geometry is written down.
 *
 * WHY IT IS SHARED. `SongChartsLibrary` seeds its virtualizer with
 * `ROW_ESTIMATE_PX` and `LibrarySkeleton` draws the placeholder rows. When
 * those two disagreed, the skeleton's rows were about 90px tall and the real
 * rows 64px — so the moment the store hydrated, every row above the fold moved
 * up by roughly a quarter of its own height and the page below it jumped. That
 * is a layout shift on the biggest element on the screen, measured at CLS p75
 * 1.0 on /library (2026-09-19 audit, item (i)).
 *
 * A skeleton is only worth having if it is the same shape as the thing it
 * stands in for. Both sides import these, so the shapes cannot drift apart
 * again without someone changing this file.
 */

/**
 * Estimated row height in px (content min-h-11 = 44px + py-1.5 ×2 = 12px,
 * plus the 8px inter-row gap the old `gap-2` grid provided). Only a seed for
 * the virtualizer — every mounted row is measured for real via
 * `measureElement`, so wrapped long titles keep their true height — but it is
 * exactly what the skeleton must draw, because the skeleton is what the
 * measurement replaces.
 */
export const ROW_ESTIMATE_PX = 64

/** Matches the `gap-2` (0.5rem) the non-virtualized grid used between rows. */
export const ROW_GAP_PX = 8

/**
 * How many placeholder rows the skeleton draws.
 *
 * Enough to fill a phone viewport so the fold is not empty, and not so many
 * that a short library shrinks when the real list arrives — a skeleton taller
 * than its content shifts in the other direction, which is the same bug.
 */
export const SKELETON_ROW_COUNT = 8
