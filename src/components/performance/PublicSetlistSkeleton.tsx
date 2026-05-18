import { Music } from "lucide-react"

/**
 * Cycle-3.5 P2-005 — SSR skeleton matching the post-hydration
 * PublicSetlistListing layout. Renders the page chrome (header + card
 * shells) so first-paint already shows structure rather than a
 * centered spinner. Dimensions mirror the real card layout exactly
 * (rounded-2xl, p-4, font-semibold title shell, calendar+songs row)
 * to avoid CLS when the client-hydrated listing replaces it.
 */
export function PublicSetlistSkeleton({
    cards = 6,
}: {
    cards?: number
} = {}) {
    return (
        <div
            className="flex flex-col gap-4 px-4 pt-6 pb-20 max-w-2xl mx-auto w-full"
            aria-busy="true"
            aria-live="polite"
        >
            <div className="flex items-center gap-3 mb-2">
                <Music className="h-6 w-6 text-muted-foreground" />
                <div>
                    <h1 className="text-xl font-bold">CRC Music</h1>
                    <p className="text-sm text-muted-foreground">Public setlists</p>
                </div>
            </div>
            <div className="flex flex-col gap-3" aria-hidden="true">
                {Array.from({ length: cards }).map((_, i) => (
                    <div
                        key={i}
                        className="rounded-2xl border border-border/50 bg-card/50 p-4"
                    >
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                                <div className="h-4 w-3/4 bg-muted/60 rounded animate-pulse" />
                                <div className="mt-2 h-3 w-1/3 bg-muted/40 rounded animate-pulse" />
                            </div>
                            <div className="h-3 w-12 bg-muted/40 rounded animate-pulse shrink-0 mt-1" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
