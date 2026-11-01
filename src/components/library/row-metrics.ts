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
 * Estimated row height in px. Option B: rows are a dense hairline list with
 * no gap and no Button padding — a 0.95rem title line (~21px) and a meta line
 * (~16px) inside py-1 (8px),
 * at least the 44px hit floor, plus the 1px rule: 46px when nothing wraps
 * (measured 61px before the ghost Button's own py-2/px-4 were zeroed). Only a seed for
 * the virtualizer — every mounted row is measured for real via
 * `measureElement`, so wrapped long titles keep their true height — but it is
 * exactly what the skeleton must draw, because the skeleton is what the
 * measurement replaces.
 */
export const ROW_ESTIMATE_PX = 46

/** No gap: rows sit on the 1px hairline grid (web refresh). */
export const ROW_GAP_PX = 0

/**
 * How many placeholder rows the skeleton draws.
 *
 * Enough to fill a phone viewport so the fold is not empty, and not so many
 * that a short library shrinks when the real list arrives — a skeleton taller
 * than its content shifts in the other direction, which is the same bug.
 */
export const SKELETON_ROW_COUNT = 8
