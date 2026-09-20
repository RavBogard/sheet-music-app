"use client"

/**
 * Placeholder rows for `/setlists/[id]` while the tracks query is in flight.
 *
 * THE SHIFT THIS REMOVES. `SetlistGrid` computes `isLoading = tracks ===
 * undefined`, and while that was true it rendered `MobileCardList` with an
 * empty `rows` array — a list of nothing, occupying nothing. The moment Dexie
 * answered, a full service's worth of cards appeared and pushed everything
 * below them down the page. Measured at CLS p75 0.58 on `/setlists/[id]`
 * (2026-09-19 audit, item (i)).
 *
 * HOW MANY ROWS. The setlist document usually arrives before its tracks do,
 * and it carries `trackCount` — so in the common case this reserves the exact
 * height the real list will take, and nothing moves at all. When the count is
 * not known yet (a setlist opened before its doc has reached Dexie, e.g. the
 * first open of a freshly-MCP-created one) we fall back to a small default:
 * reserving roughly the right amount is better than reserving none, and a
 * modest guess keeps the error small in both directions. Over-reserving
 * shifts content up when the real list is shorter, which is the same bug
 * wearing a different hat.
 *
 * HEIGHT COMES FROM THE REAL CARD. These mirror `MobileRowCard`'s shell
 * classes — `min-h-[72px]`, the same rounded border, the same padding — and
 * sit in the same `gap-2 p-3` column `MobileCardList` uses. A single truncated
 * title is the common row, and that row is exactly the shell's minimum height,
 * so the reservation is right by construction rather than by a copied
 * pixel constant that would drift the first time someone restyles a card.
 */

/** What to reserve when the setlist doc has not told us the count yet. */
const FALLBACK_ROWS = 6

/** Never reserve more than a screenful — a long setlist scrolls anyway. */
const MAX_RESERVED_ROWS = 12

export function SetlistRowsSkeleton({ trackCount }: { trackCount?: number }) {
    const count =
        typeof trackCount === "number" && Number.isFinite(trackCount) && trackCount > 0
            ? Math.min(trackCount, MAX_RESERVED_ROWS)
            : FALLBACK_ROWS

    return (
        <div
            className="flex flex-col gap-2 p-3"
            aria-busy="true"
            aria-live="polite"
            aria-label="Loading setlist rows"
            data-testid="setlist-rows-skeleton"
        >
            {Array.from({ length: count }, (_, i) => (
                <div
                    key={i}
                    aria-hidden
                    className="flex items-center gap-4 rounded-2xl border px-4 py-4 min-h-[72px] bg-white/[0.02] border-white/10"
                >
                    <div className="flex flex-col items-center gap-1 justify-center p-2 -ml-2">
                        <div className="h-5 w-5 rounded bg-muted/40 animate-pulse" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="h-5 w-2/3 rounded bg-muted/50 animate-pulse" />
                    </div>
                    <div className="h-8 w-12 shrink-0 rounded-lg bg-muted/30 animate-pulse" />
                </div>
            ))}
        </div>
    )
}
