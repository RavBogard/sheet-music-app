// Admin-SDK only. Single source of truth for server-side setlist track reads.
// Hydrated setlists read top-level `tracks/{id}` (post-v50-05); unhydrated
// setlists fall back to the embedded array. Behavior ported from c9e92a5.

import type { LocalTrack } from "@/lib/local/types"

function toMs(value: unknown): number {
    if (value == null) return 0
    if (typeof value === "number") return value
    if (typeof value === "string") {
        const t = Date.parse(value)
        return Number.isNaN(t) ? 0 : t
    }
    return 0
}

function buildLocalTracks(
    setlistId: string,
    setlistUpdatedAt: number,
    rawTracks: unknown,
): LocalTrack[] {
    if (!Array.isArray(rawTracks)) return []
    return rawTracks.map((t, index) => {
        const track = (t ?? {}) as Record<string, unknown>
        return {
            ...track,
            id: String(track.id ?? `${setlistId}-${index}`),
            setlistId,
            order: typeof track.order === "number" ? track.order : index,
            updatedAt: setlistUpdatedAt,
        } as LocalTrack
    })
}

async function fetchTopLevelTracks(
    db: FirebaseFirestore.Firestore,
    setlistId: string,
): Promise<LocalTrack[]> {
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

export async function getTracksForSetlist(
    db: FirebaseFirestore.Firestore,
    setlistId: string,
    setlistData: Record<string, unknown>,
): Promise<LocalTrack[]> {
    if (setlistData.hydrated === true) {
        return await fetchTopLevelTracks(db, setlistId)
    }
    const updatedAtMs = toMs(setlistData.updatedAt)
    return buildLocalTracks(setlistId, updatedAtMs, setlistData.tracks)
}
