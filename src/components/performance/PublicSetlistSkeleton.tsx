"use client"

import { useOrg } from "@/lib/org/org-context"
import { orgString } from "@/lib/org/strings"
import { useT } from "@/i18n/client"

/**
 * Cycle-3.5 P2-005 — SSR skeleton matching the post-hydration
 * PublicSetlistListing layout. Renders the page chrome (header + card
 * shells) so first-paint already shows structure rather than a
 * centered spinner. Dimensions mirror the real card layout exactly
 * (hairline rows, 72px tall, date column + title + meta line)
 * to avoid CLS when the client-hydrated listing replaces it.
 *
 * Multi-tenant phase 1: a client component so it can read the tenant from
 * <OrgProvider> both as the server page's Suspense fallback and inside
 * PublicSetlistListing; the brand is `page.skeletonBrand` (BL frozen to
 * "CRC Music").
 */
export function PublicSetlistSkeleton({
    cards = 6,
}: {
    cards?: number
} = {}) {
    const brand = orgString(useOrg(), "page.skeletonBrand")
    const t = useT()
    return (
        <div
            className="flex flex-col gap-4 px-4 pt-6 pb-20 max-w-2xl mx-auto w-full"
            aria-busy="true"
            aria-live="polite"
        >
            <div className="flex items-center gap-3 mb-2">
                <div className="flex-1 min-w-0">
                    <h1 className="text-[1.6rem] font-extrabold leading-tight tracking-[-0.015em]">{brand}</h1>
                    <p className="text-sm font-medium text-muted-foreground">{t("performSetlist.publicSetlists")}</p>
                </div>
            </div>
            {/* Web refresh: the same hairline list the listing draws, one
                72px row per setlist (date column, title, meta line). */}
            <div className="flex flex-col divide-y divide-rule border border-rule rounded-lg overflow-hidden bg-card" aria-hidden="true">
                {Array.from({ length: cards }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 sm:gap-4 px-3 sm:px-4 py-3 min-h-[72px]">
                        <div className="w-12 shrink-0 flex flex-col items-center gap-1.5">
                            <div className="h-2.5 w-7 bg-muted rounded animate-pulse" />
                            <div className="h-6 w-8 bg-muted rounded animate-pulse" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="h-4 w-3/4 bg-muted rounded animate-pulse" />
                            <div className="mt-2 h-3 w-1/3 bg-muted/70 rounded animate-pulse" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
