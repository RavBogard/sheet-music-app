// Client-side setlist track reader. Embedded-array fallback removed in
// v60-08-01 after universal backfill of the 15 most-recent setlists; the
// top-level `tracks/{id}` collection is now the single source of truth.
//
//  - getTracksForSetlistClient: synchronous; returns Dexie rows when present,
//    else []. `setlistData` is retained for ABI stability but is no longer
//    inspected (any caller with the helper signature continues to compile).
//  - fetchTracksForSetlistClient: async; admin/one-shot surfaces without a
//    snapshot listener. Always queries top-level `tracks/{id}`.

import { collection, query, where, getDocs } from "firebase/firestore"
import { db } from "@/lib/firebase"
import type { LocalTrack } from "@/lib/local/types"
import type { SetlistTrack } from "@/types/models"

export function getTracksForSetlistClient(
    dexieTracks: LocalTrack[] | undefined,
    _setlistData?: { hydrated?: boolean; tracks?: unknown } | null,
): SetlistTrack[] {
    void _setlistData
    return (dexieTracks ?? []) as unknown as SetlistTrack[]
}

export async function fetchTracksForSetlistClient(
    setlistId: string,
    _setlistData?: { hydrated?: boolean; tracks?: unknown } | null,
): Promise<SetlistTrack[]> {
    void _setlistData
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
