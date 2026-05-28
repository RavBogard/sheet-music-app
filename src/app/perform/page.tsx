import { PublicSetlistListing } from "@/components/performance/PublicSetlistListing"
import { getAllSetlists } from "@/lib/server-setlists"
import type { Setlist } from "@/types/api"

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
// ISR revalidate keeps the edge-cache contract intact — the page is
// statically rendered and re-generated at most once per minute, so a
// new setlist appears on /perform within ~60s of publish without any
// per-request server work. We still do NOT call `cookies()` / `headers()`
// here, so auth-state-divergent renders never enter the cache (auth UI
// is resolved client-side in PublicSetlistListing via `useAuth`).
export const revalidate = 60

export default async function PerformPage() {
    // getAllSetlists returns serializeSetlist-normalized rows (Firestore
    // Timestamps → ISO strings) — JSON-safe across the RSC → client
    // boundary. The Setlist type's `FirestoreDate` union accepts ISO
    // strings, so the client component reads them via the same `toDate`
    // helper without a shape change.
    const initialSetlists = (await getAllSetlists({ limit: 50 })) as unknown as Setlist[]
    return <PublicSetlistListing initialSetlists={initialSetlists} />
}
