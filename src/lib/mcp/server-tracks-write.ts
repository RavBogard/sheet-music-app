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

/** Look up a user's role string — undefined when the user doc is missing. */
export async function readUserRole(
    db: DB,
    uid: string,
): Promise<string | undefined> {
    const snap = await db.collection("users").doc(uid).get()
    return snap.exists ? (snap.data()?.role as string | undefined) : undefined
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
    const role = await readUserRole(db, uid)
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
    type: "song" | "header" | "reading" | "prayer" | "transition" | "note"
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
 * CF1: partial-row patch applied to one track on a setlist. `position` and
 * `order` are intentionally excluded — re-ordering routes through
 * `reorderTracks`. Setting `songId` to a new id re-bonds the row's chart;
 * `fileId` follows automatically (the catalog is keyed by Drive file id).
 */
export interface UpdateTrackPatch {
    key?: string
    leadMusician?: string
    title?: string
    notes?: string
    type?: "song" | "header" | "reading" | "prayer" | "transition" | "note"
    songId?: string
    referenceLink?: string
}

const UPDATABLE_FIELDS = [
    "key",
    "leadMusician",
    "title",
    "notes",
    "type",
    "songId",
    "referenceLink",
] as const

/**
 * Update one track's fields on a setlist. Preserves trackId (unlike
 * remove+add), so external references stay valid. Cross-setlist guard
 * rejects a trackId that belongs to a different setlist than the one
 * passed in.
 */
export async function updateTrack(
    db: DB,
    setlistId: string,
    trackId: string,
    patch: UpdateTrackPatch,
): Promise<{ ok: true; track: Record<string, unknown> } | WriteError> {
    const trackRef = db.collection("tracks").doc(trackId)
    const snap = await trackRef.get()
    if (!snap.exists) return { ok: false, error: "Track not found" }
    const existing = snap.data() as Record<string, unknown>
    if (existing.setlistId !== setlistId) {
        return { ok: false, error: "Track does not belong to this setlist" }
    }

    const update: Record<string, unknown> = {
        updatedAt: FieldValue.serverTimestamp(),
    }
    let changed = false
    for (const k of UPDATABLE_FIELDS) {
        if (patch[k] !== undefined) {
            update[k] = patch[k]
            changed = true
        }
    }
    if (!changed) {
        return {
            ok: false,
            error: "patch must include at least one field to update",
        }
    }

    // songId re-bond — the library is keyed by Drive file id, so fileId
    // tracks songId. fileName is left stale; the client-side
    // SetlistGridHydrator normalizes it on next load (server-side song
    // lookup per update would double the Firestore read cost).
    if (patch.songId !== undefined && patch.songId !== existing.songId) {
        update.fileId = patch.songId
    }

    const batch = db.batch()
    batch.update(trackRef, update)
    batch.update(db.collection("setlists").doc(setlistId), {
        updatedAt: FieldValue.serverTimestamp(),
    })
    await batch.commit()

    logger.info("[mcp] track updated", {
        setlistId,
        trackId,
        fields: Object.keys(update).filter((k) => k !== "updatedAt"),
    })

    const after = (await trackRef.get()).data() as Record<string, unknown>
    return { ok: true, track: { id: trackId, ...after } }
}

export const BULK_UPDATE_MAX_PATCHES = 50

export interface BulkUpdatePatchEntry {
    trackId: string
    patch: UpdateTrackPatch
}

export interface BulkUpdateResult {
    trackId: string
    ok: boolean
    error?: string
    track?: Record<string, unknown>
}

export interface BulkUpdateOptions {
    mode?: "atomic" | "best-effort"
    dryRun?: boolean
}

/**
 * Apply many per-row patches to one setlist's tracks in a single call.
 *
 * `mode='atomic'` (default) wraps every update in a Firestore transaction —
 * all-or-nothing. If any pre-validation fails, no writes happen and the
 * envelope's results[] reports each row's status.
 *
 * `mode='best-effort'` applies each patch independently, accumulating
 * per-row results. Lossier but partial-success is allowed.
 *
 * `dryRun=true` returns the would-apply plan without writing — useful for
 * confirming a large change before committing.
 *
 * Cap: 50 patches per call (chunk longer lists).
 */
export async function bulkUpdateTracks(
    db: DB,
    setlistId: string,
    patches: BulkUpdatePatchEntry[],
    options: BulkUpdateOptions = {},
): Promise<
    | {
          ok: true
          mode: "atomic" | "best-effort"
          results: BulkUpdateResult[]
          dryRun: boolean
      }
    | WriteError
> {
    if (patches.length === 0) {
        return { ok: false, error: "patches must include at least one entry" }
    }
    if (patches.length > BULK_UPDATE_MAX_PATCHES) {
        return {
            ok: false,
            error: `patches exceeds max (${BULK_UPDATE_MAX_PATCHES}); chunk into multiple calls`,
        }
    }
    const mode = options.mode ?? "atomic"
    const dryRun = options.dryRun ?? false

    const existing = await getTracksForSetlist(db, setlistId, {})
    const byId = new Map(existing.map((t) => [t.id, t]))

    const plan: BulkUpdateResult[] = patches.map(({ trackId, patch }) => {
        const row = byId.get(trackId)
        if (!row) {
            return {
                trackId,
                ok: false,
                error: "Track not found in this setlist",
            }
        }
        const fields = UPDATABLE_FIELDS.filter((k) => patch[k] !== undefined)
        if (fields.length === 0) {
            return {
                trackId,
                ok: false,
                error: "patch must include at least one field",
            }
        }
        const previewTrack: Record<string, unknown> = { ...row }
        for (const k of fields) previewTrack[k] = patch[k]
        if (patch.songId !== undefined && patch.songId !== row.songId) {
            previewTrack.fileId = patch.songId
        }
        return { trackId, ok: true, track: previewTrack }
    })

    const anyFailed = plan.some((p) => !p.ok)

    // atomic + any pre-validation failure → reject the whole batch, no writes.
    if (mode === "atomic" && anyFailed) {
        return { ok: true, mode, results: plan, dryRun }
    }

    if (dryRun) {
        return { ok: true, mode, results: plan, dryRun: true }
    }

    if (mode === "atomic") {
        await db.runTransaction(async (tx) => {
            for (const entry of patches) {
                const ref = db.collection("tracks").doc(entry.trackId)
                const update: Record<string, unknown> = {
                    updatedAt: FieldValue.serverTimestamp(),
                }
                for (const k of UPDATABLE_FIELDS) {
                    if (entry.patch[k] !== undefined) update[k] = entry.patch[k]
                }
                const existingRow = byId.get(entry.trackId)
                if (
                    entry.patch.songId !== undefined &&
                    entry.patch.songId !== existingRow?.songId
                ) {
                    update.fileId = entry.patch.songId
                }
                tx.update(ref, update)
            }
            tx.update(db.collection("setlists").doc(setlistId), {
                updatedAt: FieldValue.serverTimestamp(),
            })
        })
        // Re-read the affected rows so callers get the same echo shape as
        // update_track. Cheap relative to the transaction itself.
        for (let i = 0; i < patches.length; i++) {
            if (!plan[i].ok) continue
            const after = (
                await db.collection("tracks").doc(patches[i].trackId).get()
            ).data() as Record<string, unknown> | undefined
            if (after) {
                plan[i] = {
                    trackId: patches[i].trackId,
                    ok: true,
                    track: { id: patches[i].trackId, ...after },
                }
            }
        }
    } else {
        for (let i = 0; i < patches.length; i++) {
            const entry = patches[i]
            if (!plan[i].ok) continue
            try {
                const r = await updateTrack(
                    db,
                    setlistId,
                    entry.trackId,
                    entry.patch,
                )
                plan[i] = r.ok
                    ? { trackId: entry.trackId, ok: true, track: r.track }
                    : { trackId: entry.trackId, ok: false, error: r.error }
            } catch (err) {
                plan[i] = {
                    trackId: entry.trackId,
                    ok: false,
                    error: err instanceof Error ? err.message : String(err),
                }
            }
        }
    }

    logger.info("[mcp] bulk track update", {
        setlistId,
        mode,
        patchCount: patches.length,
        anyFailed: plan.some((p) => !p.ok),
    })

    return { ok: true, mode, results: plan, dryRun: false }
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
