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

    // Defense-in-depth (v11.5 chart-render outage): Perform's viewer routing
    // (resolveViewerKind → PDFOverlay) keys on `track.mimeType` for the band —
    // the in-app library store (`useLibraryStore.allFiles`) only hydrates for
    // LEADERS, so musicians/anon have no `libraryRow` to fall back on. Tracks
    // written by bulk_add / clone / template paths historically didn't stamp
    // the denormalized `mimeType` cache, so an extension-less text/image chart
    // (`upload-{uuid}`) misrouted to the PDF viewer and failed to render for
    // everyone but leaders. Backfill the field from `library_index` at READ
    // time so the frame is correct regardless of which write path created the
    // row. Zero extra reads in the steady state (every bonded row stamped after
    // backfill_track_mimetype); read-only — data-at-rest is the write paths'
    // job. [[project_track_mimetype_render_outage]] [[project_track_mimetype_gotcha]]
    // v11.5-05-02 (F4): the SAME pass also resolves a missing `track.key` from
    // `library_index/{fileId}.key`. SetlistRow's key badge keys on `track.key`
    // with NO org gate, and (like mimeType) musicians/anon never hydrate the
    // leader-only `useLibraryStore`, so the SSR frame is their only source.
    // Read-only + zero extra reads (same `getAll`). It can only fill a key the
    // catalog actually has — a chart uploaded without a key anywhere stays
    // badge-less until one is authored (the live BL gap; see
    // .paul/research/v11-5-05-02-f4-bl-key-probe.md).
    await enrichMissingFromLibraryIndex(db, rows)

    rows.sort((a, b) => a.order - b.order)
    return rows
}

/** Mutates `rows` in place: for every bonded row missing a `mimeType` AND/OR a
 *  `key`, resolve the missing field(s) from `library_index/{fileId}` (the same
 *  source the live bind paths read). Bonded = `fileId` or `audioFileId` present.
 *  No-op (and no reads) when every bonded row already has both. One batched
 *  `getAll` fills both fields. v11.5-05-02: generalized from the mimeType-only
 *  `enrichMissingMimeTypes` to also heal `track.key` for the Perform key badge. */
async function enrichMissingFromLibraryIndex(
    db: FirebaseFirestore.Firestore,
    rows: LocalTrack[],
): Promise<void> {
    const bondKey = (r: LocalTrack): string => {
        const fileId = typeof r.fileId === "string" ? r.fileId.trim() : ""
        const audioFileId =
            typeof (r as { audioFileId?: unknown }).audioFileId === "string"
                ? (r as { audioFileId?: string }).audioFileId!.trim()
                : ""
        return fileId || audioFileId
    }
    const hasMime = (r: LocalTrack): boolean =>
        typeof r.mimeType === "string" && r.mimeType.trim() !== ""
    const hasKey = (r: LocalTrack): boolean =>
        typeof (r as { key?: unknown }).key === "string" &&
        (r as { key?: string }).key!.trim() !== ""

    const need = rows.filter(
        (r) => bondKey(r) !== "" && (!hasMime(r) || !hasKey(r)),
    )
    if (need.length === 0) return

    const uniqueIds = [...new Set(need.map(bondKey))]
    const refs = uniqueIds.map((id) => db.collection("library_index").doc(id))
    const docs = await db.getAll(...refs)
    const mimeById = new Map<string, string>()
    const keyById = new Map<string, string>()
    docs.forEach((doc, i) => {
        const data = doc.exists
            ? (doc.data() as Record<string, unknown> | undefined)
            : undefined
        const m = data?.mimeType
        if (typeof m === "string" && m.trim()) mimeById.set(uniqueIds[i], m.trim())
        const k = data?.key
        if (typeof k === "string" && k.trim()) keyById.set(uniqueIds[i], k.trim())
    })
    for (const r of need) {
        const id = bondKey(r)
        if (!hasMime(r)) {
            const m = mimeById.get(id)
            if (m) (r as { mimeType?: string }).mimeType = m
        }
        if (!hasKey(r)) {
            const k = keyById.get(id)
            if (k) (r as { key?: string }).key = k
        }
    }
}
