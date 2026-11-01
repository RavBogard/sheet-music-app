"use client"

import { useOrg } from "@/lib/org/org-context"
import { label } from "@/lib/org/vocab"
import { PageContainer, PageHeader } from "@/components/layout/Page"
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
 * PublicSetlistListing. The consistency pass moved the brand into the
 * shell's top bar, so the head is the page title, as on the listing.
 */
export function PublicSetlistSkeleton({
    cards = 6,
}: {
    cards?: number
} = {}) {
    const org = useOrg()
    const t = useT()
    return (
        <PageContainer
            className="flex flex-col gap-3"
            aria-busy="true"
            aria-live="polite"
        >
            {/* The brand is in the shell's top bar; the page head matches the
                listing's: the Setlists title and the public-listing subtitle. */}
            <PageHeader title={t("nav.setlists")} subtitle={label(org, "publicListingSubtitle")} />
            {/* Web refresh: the same hairline list the listing draws, one
                72px row per setlist (date column, title, meta line). */}
            <div className="flex flex-col divide-y divide-rule border border-rule rounded-lg overflow-hidden bg-card" aria-hidden="true">
                {Array.from({ length: cards }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 sm:px-4 py-1 min-h-11">
                        <div className="w-9 shrink-0 flex flex-col items-center gap-1">
                            <div className="h-2 w-6 bg-muted rounded animate-pulse" />
                            <div className="h-3.5 w-5 bg-muted rounded animate-pulse" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="h-4 w-3/4 bg-muted rounded animate-pulse" />
                            <div className="mt-1 h-3 w-1/3 bg-muted/70 rounded animate-pulse" />
                        </div>
                    </div>
                ))}
            </div>
        </PageContainer>
    )
}
