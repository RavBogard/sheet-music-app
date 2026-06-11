import { Suspense } from "react"
import { headers } from "next/headers"
import { PublicSetlistListing } from "@/components/performance/PublicSetlistListing"
import { PublicSetlistSkeleton } from "@/components/performance/PublicSetlistSkeleton"
import { selectVisiblePublicSetlists } from "@/components/performance/public-setlist-order"
import { getAllSetlists } from "@/lib/server-setlists"
import { coerceOrgId } from "@/lib/org/registry"
import { label } from "@/lib/org/vocab"
import type { Setlist as ApiSetlist } from "@/types/api"
import type { Setlist as FirebaseSetlist } from "@/lib/setlist-firebase"

// C5D-007: /perform is the public gig-discovery landing surface and is
// explicitly indexable. Root layout's noindex applies to the authed
// app; this override exempts the public landing so it can be reached
// via search (and matches the sitemap entry + robots.txt allow).
//
// v11-04-02: the title is now org-aware (band tenants get a de-synagogued
// "Upcoming Shows & Sets" via the vocab helper; CRC keeps "Upcoming Services &
// Setlists" byte-identical). Reads the same Edge-resolved `x-org-id` the page
// body uses to scope the fetch. The `index:true` override is PRESERVED — this
// public landing must stay crawlable.
export async function generateMetadata() {
    const org = coerceOrgId((await headers()).get("x-org-id"))
    return {
        title: label(org, "publicListingTitle"),
        robots: { index: true, follow: true },
    }
}

// C11 F-M2-006 + C11M1-002 — SSR-prefetch the public setlist list. The
// page WAS a static export that painted a card-shaped skeleton then
// hydrated the listing via Firestore on the client (Daniel-ratified
// 2026-05-18T20:15Z "Skeleton during hydration. Keeps edge cache").
// On flaky sanctuary connections that left fresh tablets with an empty
// list for 1-3s. The dispatch swaps the skeleton for real cards by
// fetching server-side via getAllSetlists (the same date-desc/50-cap
// shape the client subscription uses) and seeding the client listing
// with `initialSetlists`. The client listener still takes over on mount
// for live updates.
//
// v11-04-01: /perform is now PER-HOST DYNAMIC. Multi-tenant correctness forces
// this — the prior ISR `revalidate=60` cache is keyed by PATH only and shared
// across BOTH centralreform.live and brotherslazaroff.live, so a single cached
// render cannot serve each tenant its own setlists (brotherslazaroff.live was
// showing CRC's setlists). We read the Edge-resolved `x-org-id` header to scope
// the SSR fetch per tenant, which opts the route out of static ISR. The
// per-request cost is one Firestore query; auth UI is still resolved client-side
// in PublicSetlistListing via `useAuth`, so no cookie read happens here.
export const dynamic = "force-dynamic"

// v11.3-04-03 (BUG-2 FIX-2): /perform cold p75 was TTFB 1633ms / FCP 3551ms —
// the route is `force-dynamic` (per-host x-org-id scoping, v11-04-01) and the
// page used to `await getAllSetlists` BEFORE returning any markup, so the
// server couldn't flush a single byte until Firestore resolved → the query sat
// squarely on the TTFB/FCP critical path. We now flush the shell immediately
// and stream the listing via <Suspense>: the Firestore round-trip resolves
// inside the boundary while the skeleton paints first. The query, its `org`
// scoping, and the `selectVisiblePublicSetlists` wire slice are RELOCATED
// VERBATIM into the streamed child — no logic change — so v11-04-01 per-tenant
// correctness and the Cycle-12 F-C12-001 byte-identical payload are preserved.
// (Honesty bound: synthetic cold TTFB was 214ms vs field 1633ms — the residual
// is serverless cold-start/geo, an infra lever, not app code. No caching: the
// query isn't the dominant cost and a cache key risks the v11-04-01 cross-
// tenant leak.) The fallback is the SAME PublicSetlistSkeleton the client shows
// during its subscription load, so the streamed-shell visual stays CRC-identical.
export default function PerformPage() {
    return (
        <Suspense fallback={<PublicSetlistSkeleton />}>
            <PerformListing />
        </Suspense>
    )
}

async function PerformListing() {
    // getAllSetlists returns serializeSetlist-normalized rows (Firestore
    // Timestamps → ISO strings) — JSON-safe across the RSC → client
    // boundary. The Setlist type's `FirestoreDate` union accepts ISO
    // strings, so the client component reads them via the same `toDate`
    // helper without a shape change.
    //
    // Cycle-12 F-C12-001: filter + cap MUST run here at the SSR boundary
    // (not just inside `PublicSetlistListing`'s useMemo). Otherwise the
    // RSC wire payload ships every row of the raw 50-row fetch to every
    // anonymous client — including `isTest:true` fixture clones, full
    // hydrated `tracks[]` trees, `ownerName`/`ownerId` strings, and
    // band-member emails — even though the rendered DOM correctly hides
    // them. `selectVisiblePublicSetlists` is the same shared primitive
    // the client useMemo invokes; running it here keeps wire bytes
    // byte-identical to the DOM-allowed slice.
    const org = coerceOrgId((await headers()).get("x-org-id"))
    const raw = (await getAllSetlists({ limit: 50, org })) as unknown as FirebaseSetlist[]
    const initialSetlists = selectVisiblePublicSetlists(raw) as unknown as ApiSetlist[]
    return <PublicSetlistListing initialSetlists={initialSetlists} />
}
