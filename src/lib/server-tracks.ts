// Admin-SDK only. Single source of truth for server-side setlist track reads.
// Embedded-array fallback removed in v60-08-01 after universal backfill —
// always returns rows from top-level `tracks/{id}`. The `setlistData` param
// is retained for ABI stability across 6 server consumers but is no longer
// inspected; callers MAY pass any record-shape.

import type { LocalTrack } from "@/lib/local/types"

export async function getTracksForSetlist(
    db: FirebaseFirestore.Firestore,
    setlistId: string,
    _setlistData: Record<string, unknown>,
): Promise<LocalTrack[]> {
    void _setlistData
    const snap = await db
        .collection("tracks")
        .where("setlistId", "==", setlistId)
        .get()
    const rows = snap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>
        const updatedAtRaw = data.updatedAt as
            | { toMillis?: () => number }
            | number
            | undefined
        const updatedAt =
            typeof updatedAtRaw === "object" &&
            updatedAtRaw !== null &&
            typeof updatedAtRaw.toMillis === "function"
                ? updatedAtRaw.toMillis()
                : typeof updatedAtRaw === "number"
                  ? updatedAtRaw
                  : 0
        return {
            ...data,
            id: d.id,
            setlistId,
            order: typeof data.order === "number" ? data.order : 0,
            updatedAt,
        } as LocalTrack
    })
    rows.sort((a, b) => a.order - b.order)
    return rows
}
