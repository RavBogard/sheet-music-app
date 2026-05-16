import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import {
    createSetlistServerSide,
    updateSetlistServerSide,
    type SetlistMetadataPatch,
} from "@/lib/setlist-write"
import {
    assertEditor,
    loadEditableSetlist,
    addTrack,
    reorderTracks,
    removeTrack,
    readUserRole,
    updateTrack,
    bulkUpdateTracks,
    bulkAddTracks,
    type UpdateTrackPatch,
    type BulkUpdatePatchEntry,
    type BulkUpdateResult,
    type BulkAddTrackInput,
    type BulkAddResult,
} from "@/lib/mcp/server-tracks-write"
import { getSongById } from "@/lib/mcp/server-songs"

/**
 * MCP write tools (Phase 4b). Plain async functions wrapping the shared
 * server-side write path:
 *  - create_setlist / update_setlist wrap @/lib/setlist-write (the ONE
 *    server-side setlist-write module, also used by CSV/doc import).
 *  - add_track / reorder / remove wrap @/lib/mcp/server-tracks-write (discrete
 *    track ops the shared module doesn't provide).
 *
 * All five are role-gated: the `uid` comes from the verified MCP bearer token,
 * and every tool asserts the account is an `admin` or `band_leader`. Those
 * roles may create and edit ANY setlist (matches the app's editing model);
 * everyone else is read-only. See assertEditor in server-tracks-write.
 */

/** A tool result carrying a user-facing error instead of throwing. */
type ToolError = { error: string }

/** Best-effort display name for the setlist's `ownerName` denormalization. */
async function ownerNameFor(
    db: FirebaseFirestore.Firestore,
    uid: string,
): Promise<string> {
    try {
        const snap = await db.collection("users").doc(uid).get()
        const d = snap.exists ? snap.data() : null
        const name = d?.displayName ?? d?.name ?? d?.email
        return typeof name === "string" && name.trim() ? name : "MCP User"
    } catch {
        return "MCP User"
    }
}

// ─── create_setlist ─────────────────────────────────────────────────────────

export interface CreateSetlistArgs {
    name: string
    eventDate?: string
    serviceType?: string
    rabbi?: string
}

export async function createSetlist(
    uid: string,
    args: CreateSetlistArgs,
): Promise<
    | { setlistId: string; trackCount: number; ownerId: string; ownerName: string }
    | ToolError
> {
    initAdmin()
    const db = getFirestore()

    const editor = await assertEditor(db, uid)
    if (!editor.ok) return { error: editor.error }

    const ownerName = await ownerNameFor(db, uid)

    const result = await createSetlistServerSide({
        name: args.name,
        ownerId: uid,
        ownerName,
        eventDate: args.eventDate,
        serviceType: args.serviceType as SetlistMetadataPatch["serviceType"],
        rabbi: args.rabbi,
        tracks: [],
    })
    // G-16: echo owner so callers don't need a follow-up get_setlist to learn
    // who the setlist is owned by (the create_setlist's caller IS the owner,
    // but agent UIs benefit from seeing it in the response).
    return {
        setlistId: result.setlistId,
        trackCount: result.trackCount,
        ownerId: uid,
        ownerName,
    }
}

// ─── update_setlist ─────────────────────────────────────────────────────────

export interface UpdateSetlistArgs {
    id: string
    name?: string
    eventDate?: string
    serviceType?: string
    rabbi?: string
    serviceNotes?: string
}

export async function updateSetlist(
    uid: string,
    args: UpdateSetlistArgs,
): Promise<
    | {
          ok: true
          setlist: {
              id: string
              name: string | null
              eventDate: string | null
              rabbi: string | null
              serviceType: string | null
              serviceNotes: string | null
          }
      }
    | ToolError
> {
    initAdmin()
    const db = getFirestore()

    const loaded = await loadEditableSetlist(db, args.id, uid)
    if (!loaded.ok) return { error: loaded.error }

    const patch: SetlistMetadataPatch = {}
    if (args.name !== undefined) patch.name = args.name
    if (args.eventDate !== undefined) patch.eventDate = args.eventDate
    if (args.serviceType !== undefined) {
        patch.serviceType = args.serviceType as SetlistMetadataPatch["serviceType"]
    }
    if (args.rabbi !== undefined) patch.rabbi = args.rabbi
    if (args.serviceNotes !== undefined) patch.serviceNotes = args.serviceNotes

    await updateSetlistServerSide(args.id, patch)

    // G-11: echo the post-update state so callers don't need a follow-up
    // get_setlist to confirm the patch landed. serviceType is persisted as
    // `templateType` on the setlist doc — surface it under its public name.
    // eventDate is persisted as a Firestore Timestamp; convert to ISO.
    const updated = (
        await db.collection("setlists").doc(args.id).get()
    ).data() as Record<string, unknown> | undefined
    const str = (v: unknown): string | null => {
        if (typeof v === "string") return v
        if (
            v &&
            typeof v === "object" &&
            "toDate" in v &&
            typeof (v as { toDate: unknown }).toDate === "function"
        ) {
            try {
                return (v as { toDate(): Date }).toDate().toISOString()
            } catch {
                return null
            }
        }
        return null
    }
    return {
        ok: true,
        setlist: {
            id: args.id,
            name: str(updated?.name),
            eventDate: str(updated?.eventDate),
            rabbi: str(updated?.rabbi),
            serviceType: str(updated?.templateType ?? updated?.serviceType),
            serviceNotes: str(updated?.serviceNotes),
        },
    }
}

// ─── add_track_to_setlist ───────────────────────────────────────────────────

export interface AddTrackArgs {
    setlistId: string
    /** Library song id — when given, title/key/leadMusician default from it. */
    songId?: string
    /** Required for non-song rows, or to override a song's title. */
    title?: string
    type?: "song" | "header" | "reading" | "prayer" | "transition" | "note"
    key?: string
    leadMusician?: string
    referenceLink?: string
    notes?: string
    /** 0-based insert index; omitted → append. */
    position?: number
}

export async function addTrackToSetlist(
    uid: string,
    args: AddTrackArgs,
): Promise<{ trackId: string; order: number } | ToolError> {
    initAdmin()
    const db = getFirestore()

    const loaded = await loadEditableSetlist(db, args.setlistId, uid)
    if (!loaded.ok) return { error: loaded.error }

    const type = args.type ?? "song"

    let title = args.title
    let key = args.key
    let leadMusician = args.leadMusician
    let fileName: string | undefined
    if (args.songId) {
        const song = await getSongById(args.songId)
        if (!song) return { error: `Song ${args.songId} not found` }
        title = title ?? song.title
        key = key ?? song.key
        leadMusician = leadMusician ?? song.lead
        fileName = song.fileName
    }
    if (!title || !title.trim()) {
        return { error: "title is required (or pass a songId to derive it)" }
    }

    return addTrack(db, {
        setlistId: args.setlistId,
        type,
        title,
        key,
        leadMusician,
        referenceLink: args.referenceLink,
        songId: args.songId,
        // The library catalog is keyed by Drive file id, so a song's id IS its
        // chart file id — bond it as the track's fileId so the chart renders.
        fileId: args.songId,
        fileName,
        notes: args.notes,
        position: args.position,
    })
}

// ─── update_track (CF1) ─────────────────────────────────────────────────────

export interface UpdateTrackArgs {
    setlistId: string
    trackId: string
    patch: UpdateTrackPatch
}

export async function updateSetlistTrack(
    uid: string,
    args: UpdateTrackArgs,
): Promise<{ ok: true; track: Record<string, unknown> } | ToolError> {
    initAdmin()
    const db = getFirestore()

    const loaded = await loadEditableSetlist(db, args.setlistId, uid)
    if (!loaded.ok) return { error: loaded.error }

    const result = await updateTrack(
        db,
        args.setlistId,
        args.trackId,
        args.patch,
        // Re-bond paths look up the new song to refresh the row's fileName
        // (else the row's fileName drifts behind the chart at the new
        // fileId), and the row's title (NOTE-1) when it wasn't customized.
        // Same lookup the bulk_add path uses. Returning null on miss is
        // fine — updateTrack treats both refreshes as best-effort.
        async (songId) => {
            const song = await getSongById(songId)
            if (!song) return null
            return { title: song.title, fileName: song.fileName }
        },
    )
    return result.ok ? { ok: true, track: result.track } : { error: result.error }
}

// ─── bulk_update_tracks (CF1) ───────────────────────────────────────────────

export interface BulkUpdateTracksArgs {
    setlistId: string
    patches: BulkUpdatePatchEntry[]
    mode?: "atomic" | "best-effort"
    dryRun?: boolean
}

export async function bulkUpdateSetlistTracks(
    uid: string,
    args: BulkUpdateTracksArgs,
): Promise<
    | {
          ok: true
          mode: "atomic" | "best-effort"
          committed: boolean
          results: BulkUpdateResult[]
          dryRun: boolean
      }
    | ToolError
> {
    initAdmin()
    const db = getFirestore()

    const loaded = await loadEditableSetlist(db, args.setlistId, uid)
    if (!loaded.ok) return { error: loaded.error }

    const result = await bulkUpdateTracks(db, args.setlistId, args.patches, {
        mode: args.mode,
        dryRun: args.dryRun,
    })
    if (!result.ok) return { error: result.error }
    return {
        ok: true,
        mode: result.mode,
        committed: result.committed,
        results: result.results,
        dryRun: result.dryRun,
    }
}

// ─── bulk_add_tracks (CF3) ──────────────────────────────────────────────────

export interface BulkAddTracksArgs {
    setlistId: string
    tracks: BulkAddTrackInput[]
    position?: number
    mode?: "atomic" | "best-effort"
    dryRun?: boolean
}

export async function bulkAddSetlistTracks(
    uid: string,
    args: BulkAddTracksArgs,
): Promise<
    | {
          ok: true
          mode: "atomic" | "best-effort"
          committed: boolean
          results: BulkAddResult[]
          dryRun: boolean
      }
    | ToolError
> {
    initAdmin()
    const db = getFirestore()

    const loaded = await loadEditableSetlist(db, args.setlistId, uid)
    if (!loaded.ok) return { error: loaded.error }

    const result = await bulkAddTracks(
        db,
        args.setlistId,
        args.tracks,
        {
            position: args.position,
            mode: args.mode,
            dryRun: args.dryRun,
        },
        async (songId) => {
            const song = await getSongById(songId)
            if (!song) return null
            return {
                title: song.title,
                key: song.key,
                lead: song.lead,
                fileName: song.fileName,
            }
        },
    )
    if (!result.ok) return { error: result.error }
    return {
        ok: true,
        mode: result.mode,
        committed: result.committed,
        results: result.results,
        dryRun: result.dryRun,
    }
}

// ─── reorder_setlist ────────────────────────────────────────────────────────

export interface ReorderSetlistArgs {
    setlistId: string
    orderedTrackIds: string[]
}

export async function reorderSetlist(
    uid: string,
    args: ReorderSetlistArgs,
): Promise<{ ok: true } | ToolError> {
    initAdmin()
    const db = getFirestore()

    const loaded = await loadEditableSetlist(db, args.setlistId, uid)
    if (!loaded.ok) return { error: loaded.error }

    const result = await reorderTracks(db, args.setlistId, args.orderedTrackIds)
    return result.ok ? { ok: true } : { error: result.error }
}

// ─── remove_track ───────────────────────────────────────────────────────────

export interface RemoveTrackArgs {
    setlistId: string
    trackId: string
}

export async function removeSetlistTrack(
    uid: string,
    args: RemoveTrackArgs,
): Promise<{ ok: true } | ToolError> {
    initAdmin()
    const db = getFirestore()

    const loaded = await loadEditableSetlist(db, args.setlistId, uid)
    if (!loaded.ok) return { error: loaded.error }

    const result = await removeTrack(db, args.setlistId, args.trackId)
    return result.ok ? { ok: true } : { error: result.error }
}

// ─── delete_setlist ─────────────────────────────────────────────────────────

export interface DeleteSetlistArgs {
    id: string
}

/**
 * Delete a setlist and cascade-delete all of its tracks. Stricter than the
 * other write tools: admin OR the setlist's owner. A band_leader cannot delete
 * a setlist they did not create — delete is destructive and irreversible, and
 * the surface area of "any leader can torch any service" was deemed too wide.
 * Admin keeps the override so stuck artifacts (e.g. stress-test setlists) can
 * still be cleaned up.
 */
export async function deleteSetlist(
    uid: string,
    args: DeleteSetlistArgs,
): Promise<{ ok: true; tracksDeleted: number } | ToolError> {
    initAdmin()
    const db = getFirestore()

    const editor = await assertEditor(db, uid)
    if (!editor.ok) return { error: editor.error }

    const setlistRef = db.collection("setlists").doc(args.id)
    const setlistSnap = await setlistRef.get()
    if (!setlistSnap.exists) return { error: "Setlist not found" }

    const role = await readUserRole(db, uid)
    const ownerId = (setlistSnap.data() as Record<string, unknown>).ownerId
    if (role !== "admin" && ownerId !== uid) {
        return {
            error: "Only the setlist owner or an admin may delete a setlist",
        }
    }

    const tracksSnap = await db
        .collection("tracks")
        .where("setlistId", "==", args.id)
        .get()

    const batch = db.batch()
    tracksSnap.docs.forEach((d) => batch.delete(d.ref))
    batch.delete(setlistRef)
    await batch.commit()

    return { ok: true, tracksDeleted: tracksSnap.size }
}
