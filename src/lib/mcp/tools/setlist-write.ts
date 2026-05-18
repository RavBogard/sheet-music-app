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
import {
    readLastModifiedAt,
    readVersion,
    richError,
    staleVersionEnvelope,
    type RichErrorEnvelope,
    type StaleVersionEnvelope,
    type TrackNotFoundEnvelope,
} from "@/lib/mcp/error-envelopes"
import { getSongById, resolveTrackBondDefaults } from "@/lib/mcp/server-songs"

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
 *
 * Cycle-2 REG-001b/MCP-003: every error path returns the canonical rich
 * envelope (`{ok:false, error:<snake_machine_code>, message, ..., hint}`)
 * via either the helper's pre-built envelope (forbidden_role,
 * setlist_not_found, stale_version, track_not_found) or `richError()` at
 * the call site. No bare-prose `{error: "..."}` returns survive this file.
 */

/**
 * W-04 Plan 02 wrapper-side error envelope. Surfaces the structured
 * stale-version / track-not-found envelopes the server-side helpers return
 * verbatim through `jsonResult`. The agent sees the structured
 * `currentVersion` / `lastSeenVersion` / `setlistVersion` fields and can
 * recover without a free-text-parse.
 */
type ToolEnvelopeError =
    | StaleVersionEnvelope
    | TrackNotFoundEnvelope

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
    /**
     * Cycle-5 C5A-003 — explicit test-setlist flag. Defaults `false`. No
     * heuristic on the `test-` ownerId/name prefix is applied at the MCP
     * layer; the underlying `createSetlistServerSide` still runs its own
     * `isTestSetlist({name, ownerId})` fallback when this is omitted.
     */
    isTest?: boolean
}

export async function createSetlist(
    uid: string,
    args: CreateSetlistArgs,
): Promise<
    | {
          setlistId: string
          trackCount: number
          ownerId: string
          ownerName: string
          /**
           * W-04: surface the doc's initial version so callers can chain a
           * `lastSeenVersion` follow-up without a separate get_setlist round
           * trip. version-echo-missing NOTE (v6 bugstomp).
           */
          version: number
      }
    | RichErrorEnvelope
> {
    initAdmin()
    const db = getFirestore()

    const editor = await assertEditor(db, uid)
    if (!editor.ok) return editor

    const ownerName = await ownerNameFor(db, uid)

    const result = await createSetlistServerSide({
        name: args.name,
        ownerId: uid,
        ownerName,
        eventDate: args.eventDate,
        serviceType: args.serviceType as SetlistMetadataPatch["serviceType"],
        rabbi: args.rabbi,
        tracks: [],
        isTest: args.isTest === true ? true : undefined,
    })
    // G-16: echo owner so callers don't need a follow-up get_setlist to learn
    // who the setlist is owned by (the create_setlist's caller IS the owner,
    // but agent UIs benefit from seeing it in the response).
    // version: createSetlistServerSide always stamps `version: 1` (W-04
    // Plan 01); no extra Firestore read needed.
    return {
        setlistId: result.setlistId,
        trackCount: result.trackCount,
        ownerId: uid,
        ownerName,
        version: 1,
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
    /** W-04 Plan 02 optimistic-concurrency gate (setlist-level version). */
    lastSeenVersion?: number
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
    | RichErrorEnvelope
    | ToolEnvelopeError
> {
    initAdmin()
    const db = getFirestore()

    const loaded = await loadEditableSetlist(db, args.id, uid)
    if (!loaded.ok) return loaded

    const patch: SetlistMetadataPatch = {}
    if (args.name !== undefined) patch.name = args.name
    if (args.eventDate !== undefined) patch.eventDate = args.eventDate
    if (args.serviceType !== undefined) {
        patch.serviceType = args.serviceType as SetlistMetadataPatch["serviceType"]
    }
    if (args.rabbi !== undefined) patch.rabbi = args.rabbi
    if (args.serviceNotes !== undefined) patch.serviceNotes = args.serviceNotes

    const updateResult = await updateSetlistServerSide(
        args.id,
        patch,
        args.lastSeenVersion,
    )
    if (!updateResult.ok) {
        if (updateResult.error === "stale_version") {
            return updateResult.envelope
        }
        return richError(
            "setlist_not_found",
            `Setlist '${args.id}' was deleted by another writer between load and commit.`,
            { setlistId: args.id },
            "Verify the id via list_setlists.",
        )
    }

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

/**
 * Cycle-5 C5C-016 — add_track_to_setlist returns the full track row (same
 * shape as update_track) instead of the legacy sparse `{trackId, order}`
 * pair, so callers don't need a follow-up get_setlist to confirm what
 * was actually written (title/key/leadMusician resolved from the song
 * binding, version stamp, fileName, etc.). The `trackId` and `order`
 * fields are kept at the top level for back-compat.
 */
export interface AddTrackToSetlistOk {
    ok: true
    trackId: string
    order: number
    track: Record<string, unknown>
}

export async function addTrackToSetlist(
    uid: string,
    args: AddTrackArgs,
): Promise<AddTrackToSetlistOk | RichErrorEnvelope> {
    initAdmin()
    const db = getFirestore()

    const loaded = await loadEditableSetlist(db, args.setlistId, uid)
    if (!loaded.ok) return loaded

    const type = args.type ?? "song"

    // MCP-008 (cycle-2): shared chart-resolve helper. Pre-extraction this
    // path duplicated the songId → {title, key, leadMusician, fileName}
    // resolution that commit_staged_changes's add-proposal handler omitted.
    const resolved = await resolveTrackBondDefaults({
        songId: args.songId,
        title: args.title,
        key: args.key,
        leadMusician: args.leadMusician,
    })
    if (resolved.songMissing) {
        return richError(
            "song_not_found",
            `Library song '${args.songId}' was not found.`,
            { songId: args.songId },
            "Verify the songId via search_library / list_library.",
        )
    }
    if (!resolved.title || !resolved.title.trim()) {
        return richError(
            "title_required",
            "A non-empty title is required (or pass a songId to derive it).",
            { type },
            "Pass `title` for non-song rows, or `songId` to bind a library chart.",
        )
    }

    const { trackId, order } = await addTrack(db, {
        setlistId: args.setlistId,
        type,
        title: resolved.title,
        key: resolved.key,
        leadMusician: resolved.leadMusician,
        referenceLink: args.referenceLink,
        songId: args.songId,
        // The library catalog is keyed by Drive file id, so a song's id IS its
        // chart file id — bond it as the track's fileId so the chart renders.
        fileId: args.songId,
        fileName: resolved.fileName,
        notes: args.notes,
        position: args.position,
    })

    // Re-read the just-written track so the response shape mirrors
    // update_track's `{ok: true, track: {...}}` — cheap single-doc read
    // (server-side, no extra round trip from the caller).
    const trackSnap = await db.collection("tracks").doc(trackId).get()
    const trackData = (trackSnap.data() as Record<string, unknown>) ?? {
        id: trackId,
        setlistId: args.setlistId,
        order,
        type,
        title: resolved.title,
    }

    return { ok: true, trackId, order, track: { id: trackId, ...trackData } }
}

// ─── update_track (CF1) ─────────────────────────────────────────────────────

export interface UpdateTrackArgs {
    setlistId: string
    trackId: string
    patch: UpdateTrackPatch
    /** W-04 Plan 02 optimistic-concurrency gate (track-level version). */
    lastSeenVersion?: number
}

export async function updateSetlistTrack(
    uid: string,
    args: UpdateTrackArgs,
): Promise<
    { ok: true; track: Record<string, unknown> } | RichErrorEnvelope | ToolEnvelopeError
> {
    initAdmin()
    const db = getFirestore()

    const loaded = await loadEditableSetlist(db, args.setlistId, uid)
    if (!loaded.ok) return loaded

    // F-01 (2026-05-16 bugstomp): pre-validate songId before writing. Without
    // this, a patch with a bogus songId silently bonds a row to a non-existent
    // chart — the row looks fine in the editor but every chart fetch in
    // Perform mode 404s. add_track_to_setlist and swap_chart already do this
    // lookup; bringing update_track to parity closes the orphan-manufacture
    // hole the chart-health gates downstream were designed to defend against.
    // bulk_update_tracks shares the same gap but is left for a separate pass.
    if (typeof args.patch.songId === "string" && args.patch.songId.trim()) {
        const newSong = await getSongById(args.patch.songId)
        if (!newSong)
            return richError(
                "song_not_found",
                `Library song '${args.patch.songId}' was not found.`,
                { songId: args.patch.songId },
                "Verify the songId via search_library / list_library before re-bonding.",
            )
    }

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
        args.lastSeenVersion,
    )
    if (result.ok) return { ok: true, track: result.track }
    if ("kind" in result) return result.envelope
    return richError(
        "update_track_failed",
        result.error,
        { setlistId: args.setlistId, trackId: args.trackId },
        "Re-fetch state via get_setlist and retry.",
    )
}

// ─── swap_chart (S-004) ─────────────────────────────────────────────────────

export interface SwapChartArgs {
    setlistId: string
    trackId: string
    newSongId: string
    /**
     * If true (default), title and key are force-synced from the new song's
     * catalog record — even if the existing row had a customized title.
     * If false, title falls back to NOTE-1 semantics (refresh only when
     * the row was using the old song's catalog title); key is untouched.
     */
    syncMetadata?: boolean
}

/**
 * Atomic "swap the chart on this row" operation. The 2026-05-16 Bar
 * Mitzvah session punch-list S-004: swapping a chart with bare
 * `update_track({songId})` left the operator manually cleaning up title
 * + key. swap_chart bundles the bond change with full metadata sync so
 * one call gives the agent a clean swap.
 *
 * Preserves: leadMusician, notes, referenceLink, position. Refreshes:
 * fileId, fileName, title, key (when syncMetadata = true, default).
 */
export async function swapChart(
    uid: string,
    args: SwapChartArgs,
): Promise<
    | { ok: true; track: Record<string, unknown> }
    | RichErrorEnvelope
    | ToolEnvelopeError
> {
    // MCP-002: Zod inputSchema now enforces .min(1) on these fields, but the
    // defensive guard remains so non-MCP callers (server-side imports, tests)
    // get a rich envelope instead of a raw Firestore SDK throw.
    if (!args.setlistId?.trim())
        return richError(
            "invalid_argument",
            "setlistId must be a non-empty string.",
            { field: "setlistId" },
        )
    if (!args.trackId?.trim())
        return richError(
            "invalid_argument",
            "trackId must be a non-empty string.",
            { field: "trackId" },
        )
    if (!args.newSongId?.trim())
        return richError(
            "invalid_argument",
            "newSongId must be a non-empty string.",
            { field: "newSongId" },
        )
    const syncMetadata = args.syncMetadata !== false

    initAdmin()
    const db = getFirestore()

    const loaded = await loadEditableSetlist(db, args.setlistId, uid)
    if (!loaded.ok) return loaded

    // Look up the new song up front so we can build the full patch.
    const newSong = await getSongById(args.newSongId)
    if (!newSong)
        return richError(
            "song_not_found",
            `Library song '${args.newSongId}' was not found.`,
            { songId: args.newSongId },
            "Verify the songId via search_library / list_library.",
        )

    // Build the patch. fileId/fileName come from updateTrack's songLookup
    // path; we only need to surface title + key explicitly when
    // syncMetadata is on, since updateTrack's NOTE-1 path won't override
    // a customized title without an explicit patch.title.
    const patch: UpdateTrackPatch = { songId: args.newSongId }
    if (syncMetadata) {
        patch.title = newSong.title
        if (newSong.key !== undefined) patch.key = newSong.key
    }

    const result = await updateTrack(
        db,
        args.setlistId,
        args.trackId,
        patch,
        async (songId) => {
            const song = await getSongById(songId)
            if (!song) return null
            return { title: song.title, fileName: song.fileName }
        },
    )
    if (result.ok) return { ok: true, track: result.track }
    // swap_chart doesn't pass lastSeenVersion, so stale_version can't fire;
    // track_not_found still can. Cycle-2 REG-001b: pass the rich envelope
    // straight through — the wrapper type now includes ToolEnvelopeError.
    if ("kind" in result) return result.envelope
    return richError(
        "swap_chart_failed",
        result.error,
        {
            setlistId: args.setlistId,
            trackId: args.trackId,
            newSongId: args.newSongId,
        },
        "Re-fetch state via get_setlist and retry.",
    )
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
          staleRows?: Array<{
              trackId: string
              currentVersion: number
              lastSeenVersion: number
          }>
      }
    | RichErrorEnvelope
> {
    initAdmin()
    const db = getFirestore()

    const loaded = await loadEditableSetlist(db, args.setlistId, uid)
    if (!loaded.ok) return loaded

    const result = await bulkUpdateTracks(
        db,
        args.setlistId,
        args.patches,
        {
            mode: args.mode,
            dryRun: args.dryRun,
        },
        async (songId) => {
            const song = await getSongById(songId)
            if (!song) return null
            return { title: song.title, fileName: song.fileName }
        },
    )
    if (!result.ok)
        return richError(
            "bulk_update_failed",
            result.error,
            { setlistId: args.setlistId, patchCount: args.patches.length },
            "Re-fetch state via get_setlist and retry, or split into smaller batches.",
        )
    return {
        ok: true,
        mode: result.mode,
        committed: result.committed,
        results: result.results,
        dryRun: result.dryRun,
        ...(result.staleRows ? { staleRows: result.staleRows } : {}),
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
          /**
           * Post-write setlist version (unchanged on dryRun, bumped on
           * commit). Lets callers chain a `lastSeenVersion` follow-up
           * without a separate get_setlist. version-echo-missing NOTE
           * (v6 bugstomp).
           */
          version: number
      }
    | RichErrorEnvelope
> {
    initAdmin()
    const db = getFirestore()

    const loaded = await loadEditableSetlist(db, args.setlistId, uid)
    if (!loaded.ok) return loaded

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
    if (!result.ok)
        return richError(
            "bulk_add_failed",
            result.error,
            { setlistId: args.setlistId, trackCount: args.tracks.length },
            "Re-fetch state via get_setlist and retry, or split into smaller batches.",
        )
    // version-echo: read post-write setlist version so callers can chain
    // lastSeenVersion. dryRun: unchanged; committed: bumped by bulkAddTracks.
    const setlistSnap = await db
        .collection("setlists")
        .doc(args.setlistId)
        .get()
    const version = readVersion(
        setlistSnap.data() as Record<string, unknown> | undefined,
    )
    return {
        ok: true,
        mode: result.mode,
        committed: result.committed,
        results: result.results,
        dryRun: result.dryRun,
        version,
    }
}

// ─── reorder_setlist ────────────────────────────────────────────────────────

export interface ReorderSetlistArgs {
    setlistId: string
    orderedTrackIds: string[]
    /** W-04 Plan 02 optimistic-concurrency gate (setlist-level version). */
    lastSeenVersion?: number
}

export async function reorderSetlist(
    uid: string,
    args: ReorderSetlistArgs,
): Promise<{ ok: true } | RichErrorEnvelope | ToolEnvelopeError> {
    initAdmin()
    const db = getFirestore()

    const loaded = await loadEditableSetlist(db, args.setlistId, uid)
    if (!loaded.ok) return loaded

    const result = await reorderTracks(
        db,
        args.setlistId,
        args.orderedTrackIds,
        args.lastSeenVersion,
    )
    if (result.ok) return { ok: true }
    if ("kind" in result) return result.envelope
    return richError(
        "reorder_failed",
        result.error,
        { setlistId: args.setlistId },
        "Re-fetch state via get_setlist (orderedTrackIds must list every current track id exactly once).",
    )
}

// ─── remove_track ───────────────────────────────────────────────────────────

export interface RemoveTrackArgs {
    setlistId: string
    trackId: string
    /** W-04 Plan 02 optimistic-concurrency gate (track-level version). */
    lastSeenVersion?: number
}

export async function removeSetlistTrack(
    uid: string,
    args: RemoveTrackArgs,
): Promise<{ ok: true } | RichErrorEnvelope | ToolEnvelopeError> {
    initAdmin()
    const db = getFirestore()

    const loaded = await loadEditableSetlist(db, args.setlistId, uid)
    if (!loaded.ok) return loaded

    const result = await removeTrack(
        db,
        args.setlistId,
        args.trackId,
        args.lastSeenVersion,
    )
    if (result.ok) return { ok: true }
    if ("kind" in result) return result.envelope
    return richError(
        "remove_track_failed",
        result.error,
        { setlistId: args.setlistId, trackId: args.trackId },
        "Re-fetch state via get_setlist and retry.",
    )
}

// ─── delete_setlist ─────────────────────────────────────────────────────────

export interface DeleteSetlistArgs {
    id: string
    /** W-04 Plan 02 optimistic-concurrency gate (setlist-level version). */
    lastSeenVersion?: number
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
): Promise<
    { ok: true; tracksDeleted: number } | RichErrorEnvelope | ToolEnvelopeError
> {
    initAdmin()
    const db = getFirestore()

    const editor = await assertEditor(db, uid)
    if (!editor.ok) return editor
    const role = await readUserRole(db, uid)

    const setlistRef = db.collection("setlists").doc(args.id)

    type TxResult =
        | { ok: true; tracksDeleted: number }
        | { ok: false; envelope: RichErrorEnvelope }
        | { ok: false; envelope: StaleVersionEnvelope }
    const result = await db.runTransaction<TxResult>(async (tx) => {
        const setlistSnap = await tx.get(setlistRef)
        if (!setlistSnap.exists) {
            return {
                ok: false,
                envelope: richError(
                    "setlist_not_found",
                    `Setlist '${args.id}' was not found.`,
                    { setlistId: args.id },
                    "Verify the id via list_setlists.",
                ),
            }
        }
        const setlistData = setlistSnap.data() as Record<string, unknown>
        const ownerId = setlistData.ownerId
        if (role !== "admin" && ownerId !== uid) {
            return {
                ok: false,
                envelope: richError(
                    "forbidden_owner",
                    "Only the setlist owner or an admin may delete a setlist. band_leader can edit but not delete others' setlists by design.",
                    {
                        callerRole: role ?? null,
                        setlistId: args.id,
                        ownerId:
                            typeof ownerId === "string" ? ownerId : null,
                    },
                    "Ask the setlist owner (or an admin) to delete it.",
                ),
            }
        }
        if (args.lastSeenVersion !== undefined) {
            const currentVersion = readVersion(setlistData)
            if (currentVersion !== args.lastSeenVersion) {
                return {
                    ok: false,
                    envelope: staleVersionEnvelope({
                        resource: "setlist",
                        currentVersion,
                        lastSeenVersion: args.lastSeenVersion,
                        lastModifiedBy: setlistData.lastModifiedBy as
                            | string
                            | undefined,
                        lastModifiedAt: readLastModifiedAt(setlistData),
                    }),
                }
            }
        }
        const tracksSnap = await tx.get(
            db.collection("tracks").where("setlistId", "==", args.id),
        )
        tracksSnap.docs.forEach((d) => tx.delete(d.ref))
        tx.delete(setlistRef)
        return { ok: true, tracksDeleted: tracksSnap.size }
    })

    if (result.ok) return { ok: true, tracksDeleted: result.tracksDeleted }
    return result.envelope
}
