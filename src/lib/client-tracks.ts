// Client-side setlist track reader. Embedded-array fallback removed in
// v60-08-01 after universal backfill of the 15 most-recent setlists; the
// top-level `tracks/{id}` collection is now the single source of truth.
//
//  - getTracksForSetlistClient: synchronous; returns Dexie rows when present,
//    else []. `setlistData` is retained for ABI stability but is no longer
//    inspected (any caller with the helper signature continues to compile).
//  - fetchTracksForSetlistClient: async; admin/one-shot surfaces without a
//    snapshot listener.
//
// TWO PATHS, AND WHY (R-0919-audit-2, 2026-09-19). Reading a setlist's rows
// is a Firestore `list` — `where("setlistId","==",…)` over the whole `tracks`
// collection. The rules used to allow that to anyone; they no longer do,
// because a collection-level `allow read: if true` let an anonymous caller
// query every track of every setlist of BOTH tenants in one request.
//
// A signed-in client still queries Firestore directly, which keeps the
// offline cache and the realtime path intact. A signed-out one — the band
// member who opened a /perform link without logging in, which is the normal
// case on a service morning — goes through `/api/setlists/{id}/tracks`, a
// public, rate-limited Admin-SDK endpoint that answers for ONE setlist it is
// given the id of. Same rows, same order; the difference is that the server
// can express "these rows" where a security rule could only say "all rows".
//
// If the HTTP path fails we fall back to the Firestore query rather than
// returning nothing. Signed out, that query will be denied and we end up with
// an empty list either way — but a musician mid-service is better served by
// one more attempt than by a certain blank screen.

import { getDocs } from "firebase/firestore"
import { getDb, auth } from "@/lib/firebase"
import { coerceOrgId } from "@/lib/org/registry"
import { logger } from "@/lib/logger"
import { setlistTracksQuery } from "@/lib/tenant-query"
import { parseOverridesDoc, type OverridesDoc } from "@/lib/performance/tonight"
import type { LocalTrack } from "@/lib/local/types"
import type { SetlistTrack } from "@/types/models"

export function getTracksForSetlistClient(
    dexieTracks: LocalTrack[] | undefined,
    _setlistData?: { hydrated?: boolean; tracks?: unknown } | null,
): SetlistTrack[] {
    void _setlistData
    return (dexieTracks ?? []) as unknown as SetlistTrack[]
}

/**
 * R11-b: `order`, then document id. The same canonical sequence every other
 * reader and writer of this collection uses — with duplicate `order` values
 * on real setlists (2 of 84, measured 2026-09-16), a bare numeric sort lets
 * two readers disagree about which row comes first.
 */
function sortRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
    return rows.sort((a, b) => {
        const ao = typeof a.order === "number" ? a.order : 0
        const bo = typeof b.order === "number" ? b.order : 0
        if (ao !== bo) return ao - bo
        return String(a.id).localeCompare(String(b.id))
    })
}

/** The public endpoint's answer: the rows, and tonight's overrides as the
 *  server read them (null when there are none). */
export interface PublicTracksAnswer {
    tracks: SetlistTrack[]
    overrides: OverridesDoc | null
}

/** The public endpoint. Returns null when it cannot answer, so we can fall back.
 *  Perform uses it directly when the rules refuse the live listener (a viewer
 *  signed in to another tenant). `signal` aborts a request a newer one replaces. */
export async function fetchTracksViaPublicApi(
    setlistId: string,
    signal?: AbortSignal,
): Promise<PublicTracksAnswer | null> {
    try {
        const res = await fetch(
            `/api/setlists/${encodeURIComponent(setlistId)}/tracks`,
            { headers: { accept: "application/json" }, signal },
        )
        if (!res.ok) return null
        const body = (await res.json()) as {
            found?: boolean
            tracks?: Record<string, unknown>[]
            overrides?: unknown
        }
        if (!Array.isArray(body.tracks)) return null
        return {
            tracks: sortRows(body.tracks) as unknown as SetlistTrack[],
            overrides: parseOverridesDoc(body.overrides ?? null),
        }
    } catch (err) {
        if (signal?.aborted) return null
        logger.warn("[client-tracks] public tracks endpoint failed", {
            setlistId,
            err: err instanceof Error ? err.message : String(err),
        })
        return null
    }
}

/** The tenant whose rows we are asking for: the setlist's, else this site's.
 *  Every client `list` on `tracks` must filter by this, because the rule reads
 *  `resource.data.orgId` and cannot see a setlistId filter. The live listener
 *  (`sync/snapshot-listener.ts`) uses it too. */
export function tenantOfSetlist(setlistData?: object | null): string {
    const own = (setlistData as { orgId?: unknown } | null | undefined)?.orgId
    if (typeof own === "string" && own) return coerceOrgId(own)
    return coerceOrgId(typeof document !== "undefined" ? document.documentElement.dataset.org : undefined)
}
const orgOf = tenantOfSetlist

export async function fetchTracksForSetlistClient(
    setlistId: string,
    setlistData?: { hydrated?: boolean; tracks?: unknown; orgId?: string } | null,
): Promise<SetlistTrack[]> {

    // Signed out, the Firestore query is denied by the rules — go to the
    // endpoint that can answer for one setlist.
    if (!auth?.currentUser) {
        const viaApi = await fetchTracksViaPublicApi(setlistId)
        if (viaApi) return viaApi.tracks
    }

    const db = await getDb()
    // Phase 9: the orgId filter is not an optimisation, it is what makes the
    // query legal. Listing tracks now needs standing in the tenant the rows
    // belong to, and a rule cannot see a `setlistId` filter — only an orgId
    // one. The setlist's own tenant when the caller handed us the setlist
    // (clone reads a source that may, in principle, be another tenant's),
    // otherwise the site this page is on, which the root layout puts on
    // <html data-org>.
    const q = setlistTracksQuery(db, orgOf(setlistData), setlistId)
    let snap
    try {
        snap = await getDocs(q)
    } catch {
        // The rules refused the query — the caller is signed in to a tenant
        // that does not own these rows. That is a cross-tenant Perform link,
        // which P2 kept working on purpose. The server can answer for one
        // setlist where a security rule can only answer for a whole
        // collection, so it answers this one.
        return (await fetchTracksViaPublicApi(setlistId))?.tracks ?? []
    }
    const rows: Record<string, unknown>[] = snap.docs.map((d) => ({
        ...(d.data() as Record<string, unknown>),
        id: d.id,
    }))
    // An empty result for a setlist that does have rows means the orgId guess
    // was wrong, not that the setlist is empty; ask the server before
    // believing it.
    if (rows.length === 0) {
        const viaApi = await fetchTracksViaPublicApi(setlistId)
        if (viaApi && viaApi.tracks.length > 0) return viaApi.tracks
    }
    return sortRows(rows) as unknown as SetlistTrack[]
}
