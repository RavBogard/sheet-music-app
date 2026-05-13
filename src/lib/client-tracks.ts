// Client-side hydration-aware reader. Pure function; operates on
// already-fetched dexieTracks + setlistData. Mirrors server-tracks.ts
// but with the 3-branch logic the client needs (snapshot-listener
// can deliver Dexie rows pre-hydration).
//
// v60-08 will drop the unhydrated fallback after v60-06 backfills
// every setlist. Until then, the 3-branch contract is load-bearing.

import { collection, query, where, getDocs } from "firebase/firestore"
import { db } from "@/lib/firebase"
import type { LocalTrack } from "@/lib/local/types"
import type { SetlistTrack } from "@/types/models"

export function getTracksForSetlistClient(
    dexieTracks: LocalTrack[] | undefined,
    setlistData: { hydrated?: boolean; tracks?: unknown } | null | undefined,
): SetlistTrack[] {
    const fromDexie = (dexieTracks ?? []) as unknown as SetlistTrack[]
    if (setlistData?.hydrated === true) return fromDexie
    if (fromDexie.length > 0) return fromDexie
    return (setlistData?.tracks as SetlistTrack[] | undefined) ?? []
}

/**
 * v60-06-06: Client-side equivalent of server-tracks.ts::getTracksForSetlist.
 * 2-branch reader for surfaces that lack Dexie pre-population (admin-side
 * one-shot fetches via getDocs, not Firestore listeners). Mirrors the
 * server-tracks shape but uses the Web SDK.
 *
 *  - Hydrated: query top-level `tracks` collection where setlistId matches,
 *    sort by order ascending, return SetlistTrack[].
 *  - Unhydrated (or hydrated undefined): return the embedded `setlistData.tracks`
 *    array if present; else empty array.
 *
 * The 3-branch Dexie-aware helper (getTracksForSetlistClient) remains the
 * right choice for surfaces with snapshot-listener-populated Dexie. This
 * helper covers the Firestore-direct-fetch admin / one-shot cases.
 */
export async function fetchTracksForSetlistClient(
    setlistId: string,
    setlistData: { hydrated?: boolean; tracks?: unknown } | null | undefined,
): Promise<SetlistTrack[]> {
    if (setlistData?.hydrated === true) {
        const q = query(
            collection(db, "tracks"),
            where("setlistId", "==", setlistId),
        )
        const snap = await getDocs(q)
        const rows: Record<string, unknown>[] = snap.docs.map((d) => ({
            ...(d.data() as Record<string, unknown>),
            id: d.id,
        }))
        rows.sort((a, b) => {
            const ao = typeof a.order === "number" ? a.order : 0
            const bo = typeof b.order === "number" ? b.order : 0
            return ao - bo
        })
        return rows as unknown as SetlistTrack[]
    }
    return (setlistData?.tracks as SetlistTrack[] | undefined) ?? []
}
