import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import {
    createSetlistServerSide,
    updateSetlistServerSide,
    type SetlistMetadataPatch,
} from "@/lib/setlist-write"
import {
    loadOwnedSetlist,
    addTrack,
    reorderTracks,
    removeTrack,
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
 * All five are owner-scoped: the `uid` comes from the verified MCP bearer
 * token, and every mutation of an existing setlist asserts `ownerId === uid`.
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

export async function createSetlist(uid: string, args: CreateSetlistArgs) {
    initAdmin()
    const db = getFirestore()
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
    return { setlistId: result.setlistId, trackCount: result.trackCount }
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
): Promise<{ ok: true } | ToolError> {
    initAdmin()
    const db = getFirestore()

    const owned = await loadOwnedSetlist(db, args.id, uid)
    if (!owned.ok) return { error: owned.error }

    const patch: SetlistMetadataPatch = {}
    if (args.name !== undefined) patch.name = args.name
    if (args.eventDate !== undefined) patch.eventDate = args.eventDate
    if (args.serviceType !== undefined) {
        patch.serviceType = args.serviceType as SetlistMetadataPatch["serviceType"]
    }
    if (args.rabbi !== undefined) patch.rabbi = args.rabbi
    if (args.serviceNotes !== undefined) patch.serviceNotes = args.serviceNotes

    await updateSetlistServerSide(args.id, patch)
    return { ok: true }
}

// ─── add_track_to_setlist ───────────────────────────────────────────────────

export interface AddTrackArgs {
    setlistId: string
    /** Library song id — when given, title/key/leadMusician default from it. */
    songId?: string
    /** Required for a header row, or to override a song's title. */
    title?: string
    type?: "song" | "header"
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

    const owned = await loadOwnedSetlist(db, args.setlistId, uid)
    if (!owned.ok) return { error: owned.error }

    const type = args.type ?? "song"

    let title = args.title
    let key = args.key
    let leadMusician = args.leadMusician
    if (args.songId) {
        const song = await getSongById(args.songId)
        if (!song) return { error: `Song ${args.songId} not found` }
        title = title ?? song.title
        key = key ?? song.key
        leadMusician = leadMusician ?? song.lead
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
        notes: args.notes,
        position: args.position,
    })
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

    const owned = await loadOwnedSetlist(db, args.setlistId, uid)
    if (!owned.ok) return { error: owned.error }

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

    const owned = await loadOwnedSetlist(db, args.setlistId, uid)
    if (!owned.ok) return { error: owned.error }

    const result = await removeTrack(db, args.setlistId, args.trackId)
    return result.ok ? { ok: true } : { error: result.error }
}
