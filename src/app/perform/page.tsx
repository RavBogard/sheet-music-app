import { headers } from "next/headers"
import { PublicSetlistListing } from "@/components/performance/PublicSetlistListing"
import { selectVisiblePublicSetlists } from "@/components/performance/public-setlist-order"
import { getAllSetlists } from "@/lib/server-setlists"
import { coerceOrgId } from "@/lib/org/registry"
import type { Setlist as ApiSetlist } from "@/types/api"
import type { Setlist as FirebaseSetlist } from "@/lib/setlist-firebase"

// C5D-007: /perform is the public gig-discovery landing surface and is
// explicitly indexable. Root layout's noindex applies to the authed
// app; this override exempts the public landing so it can be reached
// via search (and matches the sitemap entry + robots.txt allow).
export const metadata = {
    title: "Upcoming Services & Setlists",
    robots: { index: true, follow: true },
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

export default async function PerformPage() {
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
