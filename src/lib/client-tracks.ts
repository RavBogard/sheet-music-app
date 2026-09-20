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

import { collection, query, where, getDocs } from "firebase/firestore"
import { getDb, auth } from "@/lib/firebase"
import { logger } from "@/lib/logger"
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

/** The public endpoint. Returns null when it cannot answer, so we can fall back. */
async function fetchViaApi(setlistId: string): Promise<SetlistTrack[] | null> {
    try {
        const res = await fetch(
            `/api/setlists/${encodeURIComponent(setlistId)}/tracks`,
            { headers: { accept: "application/json" } },
        )
        if (!res.ok) return null
        const body = (await res.json()) as {
            found?: boolean
            tracks?: Record<string, unknown>[]
        }
        if (!Array.isArray(body.tracks)) return null
        return sortRows(body.tracks) as unknown as SetlistTrack[]
    } catch (err) {
        logger.warn("[client-tracks] public tracks endpoint failed", {
            setlistId,
            err: err instanceof Error ? err.message : String(err),
        })
        return null
    }
}

export async function fetchTracksForSetlistClient(
    setlistId: string,
    _setlistData?: { hydrated?: boolean; tracks?: unknown } | null,
): Promise<SetlistTrack[]> {
    void _setlistData

    // Signed out, the Firestore query is denied by the rules — go to the
    // endpoint that can answer for one setlist.
    if (!auth?.currentUser) {
        const viaApi = await fetchViaApi(setlistId)
        if (viaApi) return viaApi
    }

    const db = await getDb()
    const q = query(
        collection(db, "tracks"),
        where("setlistId", "==", setlistId),
    )
    const snap = await getDocs(q)
    const rows: Record<string, unknown>[] = snap.docs.map((d) => ({
        ...(d.data() as Record<string, unknown>),
        id: d.id,
    }))
    return sortRows(rows) as unknown as SetlistTrack[]
}
