import { Suspense } from "react"

import { PublicSetlistListing } from "@/components/performance/PublicSetlistListing"
import { PublicSetlistSkeleton } from "@/components/performance/PublicSetlistSkeleton"

/**
 * /perform — Public setlist landing page.
 *
 * Non-signed-in visitors see a list of public setlists they can browse
 * and tap into. Authed users see the same listing (the per-setlist
 * perform UI lives under `/perform/setlist/<id>`, not here).
 *
 * Cycle-3.5 P2-005 — converted from `"use client"` shim to an async
 * server component so the SSR can paint a card-shaped skeleton (rather
 * than a centered spinner) before the client subscription resolves.
 *
 * Daniel-ratified 2026-05-18T20:15Z opted for "Skeleton during
 * hydration. Keeps edge cache" — so this page intentionally does NOT
 * call `cookies()` / `headers()` (which would force dynamic rendering
 * and lose the static edge cache). Both authed + unauth visitors see
 * the same byte-identical skeleton SSR; the client component
 * hydrates and replaces it once Firestore returns. No CLS because
 * `PublicSetlistListing`'s `loading: true` branch ALSO renders the
 * same skeleton, so the pre-hydration, hydrating, and "subscription in
 * flight" frames all share dimensions.
 */
export default function PerformPage() {
    return (
        <Suspense fallback={<PublicSetlistSkeleton />}>
            <PublicSetlistListing />
        </Suspense>
    )
}
