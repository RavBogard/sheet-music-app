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
 * HEIGHT COMES FROM THE REAL ROW. These mirror `MobileRowCard`'s Option B
 * row shell — `min-h-10` on the hairline, no gap — and sit in the same plain
 * column `MobileCardList` uses. A single truncated
 * title is the common row, and that row is exactly the shell's minimum height,
 * so the reservation is right by construction rather than by a copied
 * pixel constant that would drift the first time someone restyles a card.
 */

/** What to reserve when the setlist doc has not told us the count yet. */
import { useT } from "@/i18n/client"

const FALLBACK_ROWS = 6

/** Never reserve more than a screenful — a long setlist scrolls anyway. */
const MAX_RESERVED_ROWS = 12

export function SetlistRowsSkeleton({ trackCount }: { trackCount?: number }) {
    const t = useT()
    const count =
        typeof trackCount === "number" && Number.isFinite(trackCount) && trackCount > 0
            ? Math.min(trackCount, MAX_RESERVED_ROWS)
            : FALLBACK_ROWS

    return (
        <div
            className="flex flex-col"
            aria-busy="true"
            aria-live="polite"
            aria-label={t("setlistGrid.loadingRows")}
            data-testid="setlist-rows-skeleton"
        >
            {Array.from({ length: count }, (_, i) => (
                <div
                    key={i}
                    aria-hidden
                    className="flex items-center gap-3 px-3 min-h-10 bg-card border-b border-rule"
                >
                    <div className="h-4 w-4 shrink-0 rounded bg-muted/40 animate-pulse" />
                    <div className="min-w-0 flex-1">
                        <div className="h-4 w-2/3 rounded bg-muted/50 animate-pulse" />
                    </div>
                    <div className="h-4 w-8 shrink-0 rounded bg-muted/30 animate-pulse" />
                </div>
            ))}
        </div>
    )
}
