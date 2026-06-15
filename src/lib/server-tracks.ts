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
    await enrichMissingMimeTypes(db, rows)

    rows.sort((a, b) => a.order - b.order)
    return rows
}

/** Mutates `rows` in place: for every bonded row missing a `mimeType`, resolve
 *  it from `library_index/{fileId}` (the same source the live bind paths read).
 *  Bonded = `fileId` or `audioFileId` present. No-op (and no reads) when every
 *  bonded row is already stamped. */
async function enrichMissingMimeTypes(
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
    const needMime = rows.filter((r) => {
        const mime = typeof r.mimeType === "string" ? r.mimeType.trim() : ""
        return !mime && bondKey(r) !== ""
    })
    if (needMime.length === 0) return

    const uniqueIds = [...new Set(needMime.map(bondKey))]
    const refs = uniqueIds.map((id) => db.collection("library_index").doc(id))
    const docs = await db.getAll(...refs)
    const mimeById = new Map<string, string>()
    docs.forEach((doc, i) => {
        const m = doc.exists
            ? (doc.data() as Record<string, unknown> | undefined)?.mimeType
            : undefined
        if (typeof m === "string" && m.trim()) mimeById.set(uniqueIds[i], m.trim())
    })
    for (const r of needMime) {
        const m = mimeById.get(bondKey(r))
        if (m) (r as { mimeType?: string }).mimeType = m
    }
}
