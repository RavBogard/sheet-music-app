import crypto from "crypto"
import { FieldValue } from "firebase-admin/firestore"
import { getTracksForSetlist } from "@/lib/server-tracks"
import { logger } from "@/lib/logger"

/**
 * MCP-owned Admin-SDK write helpers for top-level `tracks/{id}` docs.
 *
 * Why these live in the MCP lane (not @/lib/setlist-write): that module
 * commits whole setlists (parent + a fresh batch of tracks) and has no notion
 * of discrete add / reorder / remove ops. MCP needs single-track mutations on
 * an existing setlist, so it owns this file.
 *
 * Ordering invariant: a setlist's tracks always have contiguous `order` values
 * 0..n-1. Every helper here preserves that — it's what `createSetlistServerSide`
 * seeds and what `getTracksForSetlist` sorts by.
 */

type DB = FirebaseFirestore.Firestore

export interface LoadedSetlist {
    ok: true
    data: Record<string, unknown>
}
export interface WriteError {
    ok: false
    error: string
}

/**
 * Assert `uid` may use the MCP write tools. Per Daniel's instruction
 * (2026-05-14) write access is role-based, not owner-based: any `admin` or
 * `band_leader` account may create and edit ANY setlist; everyone else is
 * read-only. Role is read from `users/{uid}.role` — the same source
 * getServerUser() falls back to (MCP requests carry no session cookie).
 */
export async function assertEditor(
    db: DB,
    uid: string,
): Promise<{ ok: true } | WriteError> {
    const snap = await db.collection("users").doc(uid).get()
    const role = snap.exists ? (snap.data()?.role as string | undefined) : undefined
    if (role === "admin" || role === "band_leader") return { ok: true }
    return {
        ok: false,
        error: "Write tools require an admin or band leader account",
    }
}

/**
 * Assert `uid` may edit, then load the setlist. Admins and band leaders may
 * edit ANY setlist — there is no owner check (see assertEditor).
 */
export async function loadEditableSetlist(
    db: DB,
    setlistId: string,
    uid: string,
): Promise<LoadedSetlist | WriteError> {
    const editor = await assertEditor(db, uid)
    if (!editor.ok) return editor
    const snap = await db.collection("setlists").doc(setlistId).get()
    if (!snap.exists) return { ok: false, error: "Setlist not found" }
    return { ok: true, data: snap.data() as Record<string, unknown> }
}

export interface AddTrackInput {
    setlistId: string
    type: "song" | "header"
    title: string
    key?: string
    leadMusician?: string
    referenceLink?: string
    /** Library song id this row references, if any. */
    songId?: string
    /** Bound chart file id. For a library song this equals `songId` (the
     *  catalog is keyed by Drive file id). Written so the app's chart
     *  rendering + the parent `fileIds` reconciler pick the row up. */
    fileId?: string
    /** Cached chart filename (the song's raw catalog title incl. extension). */
    fileName?: string
    notes?: string
    /** 0-based insert index; out-of-range or omitted → append at the end. */
    position?: number
}

/**
 * Insert one track into a setlist. Shifts existing rows at/after the insert
 * index by +1 so `order` stays contiguous, then bumps the parent's
 * `trackCount` + `updatedAt`. Caller must have already asserted ownership.
 */
export async function addTrack(
    db: DB,
    input: AddTrackInput,
): Promise<{ trackId: string; order: number }> {
    const existing = await getTracksForSetlist(db, input.setlistId, {})
    const insertAt =
        input.position === undefined ||
        input.position < 0 ||
        input.position > existing.length
            ? existing.length
            : input.position

    const trackId = crypto.randomUUID()
    const batch = db.batch()

    // Shift rows at/after the insert point down by one.
    for (const t of existing) {
        if (t.order >= insertAt) {
            batch.update(db.collection("tracks").doc(t.id), { order: t.order + 1 })
        }
    }

    const payload: Record<string, unknown> = {
        id: trackId,
        setlistId: input.setlistId,
        order: insertAt,
        type: input.type,
        title: input.title,
        updatedAt: FieldValue.serverTimestamp(),
    }
    if (input.key !== undefined) payload.key = input.key
    if (input.leadMusician !== undefined) payload.leadMusician = input.leadMusician
    if (input.referenceLink !== undefined) payload.referenceLink = input.referenceLink
    if (input.songId !== undefined) payload.songId = input.songId
    if (input.fileId !== undefined) payload.fileId = input.fileId
    if (input.fileName !== undefined) payload.fileName = input.fileName
    if (input.notes !== undefined) payload.notes = input.notes
    batch.set(db.collection("tracks").doc(trackId), payload)

    const setlistPatch: Record<string, unknown> = {
        trackCount: existing.length + 1,
        updatedAt: FieldValue.serverTimestamp(),
    }
    // Bond the chart into the parent's denormalized fileIds set so the app
    // renders it on the row without waiting for the client-side reconciler.
    // arrayUnion is idempotent; the SetlistGridHydrator reconciler computes
    // the same distinct set and will normalize ordering on next open.
    if (input.fileId) {
        setlistPatch.fileIds = FieldValue.arrayUnion(input.fileId)
    }
    batch.update(db.collection("setlists").doc(input.setlistId), setlistPatch)

    await batch.commit()
    logger.info("[mcp] track added", { setlistId: input.setlistId, trackId, order: insertAt })
    return { trackId, order: insertAt }
}

/**
 * Reorder a setlist's tracks. `orderedTrackIds` must be an exact permutation of
 * the setlist's current track ids — anything else is rejected so a stale or
 * partial list can't silently drop or duplicate rows.
 */
export async function reorderTracks(
    db: DB,
    setlistId: string,
    orderedTrackIds: string[],
): Promise<{ ok: true } | WriteError> {
    const existing = await getTracksForSetlist(db, setlistId, {})
    const existingIds = new Set(existing.map((t) => t.id))

    if (orderedTrackIds.length !== existing.length) {
        return { ok: false, error: "orderedTrackIds must contain every track in the setlist exactly once" }
    }
    const seen = new Set<string>()
    for (const id of orderedTrackIds) {
        if (!existingIds.has(id)) {
            return { ok: false, error: `track ${id} is not in this setlist` }
        }
        if (seen.has(id)) {
            return { ok: false, error: `track ${id} appears more than once` }
        }
        seen.add(id)
    }

    const batch = db.batch()
    orderedTrackIds.forEach((id, i) => {
        batch.update(db.collection("tracks").doc(id), {
            order: i,
            updatedAt: FieldValue.serverTimestamp(),
        })
    })
    batch.update(db.collection("setlists").doc(setlistId), {
        updatedAt: FieldValue.serverTimestamp(),
    })
    await batch.commit()
    logger.info("[mcp] tracks reordered", { setlistId, count: orderedTrackIds.length })
    return { ok: true }
}

/**
 * Remove one track from a setlist, then re-pack the remaining rows' `order` to
 * stay contiguous and update the parent's `trackCount` + `updatedAt`.
 */
export async function removeTrack(
    db: DB,
    setlistId: string,
    trackId: string,
): Promise<{ ok: true } | WriteError> {
    const existing = await getTracksForSetlist(db, setlistId, {})
    const target = existing.find((t) => t.id === trackId)
    if (!target) {
        return { ok: false, error: "Track not found in this setlist" }
    }

    const remaining = existing.filter((t) => t.id !== trackId)
    const batch = db.batch()
    batch.delete(db.collection("tracks").doc(trackId))
    // Re-pack: assign contiguous order to whatever's left.
    remaining.forEach((t, i) => {
        if (t.order !== i) {
            batch.update(db.collection("tracks").doc(t.id), {
                order: i,
                updatedAt: FieldValue.serverTimestamp(),
            })
        }
    })
    const setlistPatch: Record<string, unknown> = {
        trackCount: remaining.length,
        updatedAt: FieldValue.serverTimestamp(),
    }
    // Drop the chart from the parent's fileIds set only when no other track
    // still references it (the array is a distinct set across all tracks).
    const removedFileId = (target as { fileId?: string }).fileId
    if (
        removedFileId &&
        !remaining.some((t) => (t as { fileId?: string }).fileId === removedFileId)
    ) {
        setlistPatch.fileIds = FieldValue.arrayRemove(removedFileId)
    }
    batch.update(db.collection("setlists").doc(setlistId), setlistPatch)
    await batch.commit()
    logger.info("[mcp] track removed", { setlistId, trackId })
    return { ok: true }
}
