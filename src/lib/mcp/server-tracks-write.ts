import crypto from "crypto"
import { FieldValue } from "firebase-admin/firestore"
import { getTracksForSetlist } from "@/lib/server-tracks"
import { logger } from "@/lib/logger"
import {
    readLastModifiedAt,
    readVersion,
    staleVersionEnvelope,
    trackNotFoundEnvelope,
    type WriteRejection,
} from "@/lib/mcp/error-envelopes"

/**
 * W-04 Plan 01: every write path stamps `version: increment(1)` +
 * `lastModifiedAt` on the setlist + affected tracks. Plan 02 swaps to
 * read-check-write transactions for stale-version rejection; Plan 01
 * is purely additive — callers see new fields on reads, behavior is
 * unchanged.
 */
const versionBumpFields = (): Record<string, unknown> => ({
    version: FieldValue.increment(1),
    lastModifiedAt: new Date().toISOString(),
})
const initialVersionFields = (): Record<string, unknown> => ({
    version: 1,
    lastModifiedAt: new Date().toISOString(),
})

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
        ...initialVersionFields(), // W-04 Plan 01: new track → version 1
    }
    if (input.key !== undefined) payload.key = input.key
    if (input.leadMusician !== undefined) payload.leadMusician = input.leadMusician
    if (input.referenceLink !== undefined) payload.referenceLink = input.referenceLink
    if (input.songId !== undefined) payload.songId = input.songId
    if (input.fileId !== undefined) payload.fileId = input.fileId
    if (input.fileName !== undefined) payload.fileName = input.fileName
    if (input.notes !== undefined) payload.notes = input.notes
    batch.set(db.collection("tracks").doc(trackId), payload)

    // W-04 Plan 01: shifted siblings get their version bumped too — their
    // `order` is mutating, which means callers reading them with an old
    // version are stale. Plan 02 will gate writes on it; Plan 01 stamps.
    for (const t of existing) {
        if (t.order >= insertAt) {
            // Already added to batch above with order update — extend with
            // versionBumpFields by re-writing the same ref.
            batch.update(db.collection("tracks").doc(t.id), versionBumpFields())
        }
    }

    const setlistPatch: Record<string, unknown> = {
        trackCount: existing.length + 1,
        updatedAt: FieldValue.serverTimestamp(),
        ...versionBumpFields(), // W-04 Plan 01: setlist mutation → bump
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
    /**
     * W-04 Plan 02 optimistic-concurrency gate. Reorder gates on the
     * SETLIST's version (not per-track) — see W-04 §Q decision: a reorder
     * touches every row's `order` and so naturally races at the setlist
     * scope, not per row.
     */
    lastSeenVersion?: number,
): Promise<{ ok: true } | WriteError | WriteRejection> {
    const setlistRef = db.collection("setlists").doc(setlistId)

    type TxResult = { ok: true } | WriteError | WriteRejection
    const result = await db.runTransaction<TxResult>(async (tx) => {
        const setlistSnap = await tx.get(setlistRef)
        if (!setlistSnap.exists) {
            return { ok: false, error: "Setlist not found" }
        }
        const setlistData = setlistSnap.data() as Record<string, unknown>
        if (lastSeenVersion !== undefined) {
            const currentVersion = readVersion(setlistData)
            if (currentVersion !== lastSeenVersion) {
                return {
                    ok: false,
                    kind: "stale_version",
                    envelope: staleVersionEnvelope({
                        resource: "setlist",
                        currentVersion,
                        lastSeenVersion,
                        lastModifiedBy: setlistData.lastModifiedBy as
                            | string
                            | undefined,
                        lastModifiedAt: readLastModifiedAt(setlistData),
                    }),
                }
            }
        }

        const sibSnap = await tx.get(
            db.collection("tracks").where("setlistId", "==", setlistId),
        )
        const existing = sibSnap.docs.map((d) => ({ id: d.id }))
        const existingIds = new Set(existing.map((t) => t.id))
        if (orderedTrackIds.length !== existing.length) {
            return {
                ok: false,
                error:
                    "orderedTrackIds must contain every track in the setlist exactly once",
            }
        }
        const seen = new Set<string>()
        for (const id of orderedTrackIds) {
            if (!existingIds.has(id)) {
                return {
                    ok: false,
                    error: `track ${id} is not in this setlist`,
                }
            }
            if (seen.has(id)) {
                return {
                    ok: false,
                    error: `track ${id} appears more than once`,
                }
            }
            seen.add(id)
        }

        orderedTrackIds.forEach((id, i) => {
            tx.update(db.collection("tracks").doc(id), {
                order: i,
                updatedAt: FieldValue.serverTimestamp(),
                ...versionBumpFields(),
            })
        })
        tx.update(setlistRef, {
            updatedAt: FieldValue.serverTimestamp(),
            ...versionBumpFields(),
        })
        return { ok: true }
    })

    if (!result.ok) return result
    logger.info("[mcp] tracks reordered", {
        setlistId,
        count: orderedTrackIds.length,
    })
    return { ok: true }
}

/**
 * CF1: partial-row patch applied to one track on a setlist. Setting `songId`
 * to a new id re-bonds the row's chart; `fileId` follows automatically
 * (the catalog is keyed by Drive file id).
 *
 * CF3 extension: `position` (0-based) moves the row to a new index in a
 * single update_track call — closes the "to move one row I must call
 * reorder_setlist with the full ordered id list" gap. Single-row only;
 * bulk_update_tracks rejects `position` because mixing reorders with
 * field patches in one batch makes the result ordering ambiguous.
 */
export interface UpdateTrackPatch {
    key?: string
    leadMusician?: string
    title?: string
    notes?: string
    type?: "song" | "header" | "reading" | "prayer" | "transition" | "note"
    songId?: string
    referenceLink?: string
    /** 0-based target position; clamps into [0, trackCount-1]. */
    position?: number
}

/** Field patches that survive into the Firestore update (not the reorder). */
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
/**
 * Optional song-row lookup, supplied by the MCP wrapper. On a `songId`
 * re-bond, the track's `fileName` cache becomes stale — the chart at the
 * new fileId is a different file. The wrapper has access to `getSongById`
 * and forwards a thin lookup so server-tracks-write.ts stays decoupled
 * from the catalog module. Returning `null` (or omitting fileName) keeps
 * the row's existing fileName in place — fail-soft, never block the patch.
 */
export type SongLookup = (
    songId: string,
) => Promise<{ title?: string; fileName?: string } | null>

export async function updateTrack(
    db: DB,
    setlistId: string,
    trackId: string,
    patch: UpdateTrackPatch,
    songLookup?: SongLookup,
    /**
     * W-04 Plan 02 optimistic-concurrency gate. When provided, the write
     * rejects with `staleVersionEnvelope` if the track's current version
     * differs from `lastSeenVersion`. Omit to preserve last-writer-wins
     * behavior (backward-compat for pre-W-04 callers).
     */
    lastSeenVersion?: number,
): Promise<
    { ok: true; track: Record<string, unknown> } | WriteError | WriteRejection
> {
    const trackRef = db.collection("tracks").doc(trackId)
    const setlistRef = db.collection("setlists").doc(setlistId)

    // Stage A (outside tx): peek at existing track to decide what async
    // songLookup work needs to happen — songLookup is async and Firestore
    // transactions don't allow awaiting non-tx promises mid-stream. The
    // tx-time version check (Stage B) catches any race here.
    const peek = await trackRef.get()
    if (!peek.exists) {
        const setlistSnap = await setlistRef.get()
        const setlistData = setlistSnap.data() as
            | Record<string, unknown>
            | undefined
        return {
            ok: false,
            kind: "track_not_found",
            envelope: trackNotFoundEnvelope({
                trackId,
                setlistId,
                setlistVersion: readVersion(setlistData),
                setlistLastModifiedAt: readLastModifiedAt(setlistData),
            }),
        }
    }
    const peekData = peek.data() as Record<string, unknown>
    if (peekData.setlistId !== setlistId) {
        return { ok: false, error: "Track does not belong to this setlist" }
    }

    // Build the patch up front. Field-only validation; no Firestore writes
    // yet. We mutate `fieldUpdate` in place as we resolve songLookup-driven
    // side-effects so the tx body can apply it verbatim.
    const fieldUpdate: Record<string, unknown> = {}
    let changed = false
    for (const k of UPDATABLE_FIELDS) {
        if (patch[k] !== undefined) {
            fieldUpdate[k] = patch[k]
            changed = true
        }
    }
    const wantsMove = patch.position !== undefined
    if (!changed && !wantsMove) {
        return {
            ok: false,
            error: "patch must include at least one field to update",
        }
    }

    // songId re-bond — the library is keyed by Drive file id, so fileId
    // tracks songId. 2026-05-15 stress test (H-1/H-5/F-2): on a re-bond,
    // (a) the row's `fileName` cache becomes stale (different chart at the
    // new fileId), and (b) the parent setlist's `fileIds[]` aggregate
    // doesn't update — Perform mode prefetches from that aggregate, so
    // re-bonded charts fail to load with "Image failed to load". Both gaps
    // close here: refresh fileName via the wrapper's song lookup, and
    // recompute the canonical `fileIds[]` from the post-patch track state
    // in the same batch as the field write so the aggregate can't drift.
    const oldFileId =
        typeof peekData.fileId === "string"
            ? (peekData.fileId as string)
            : undefined
    let newFileId: string | undefined
    if (patch.songId !== undefined && patch.songId !== peekData.songId) {
        fieldUpdate.fileId = patch.songId
        newFileId = patch.songId
        if (songLookup) {
            try {
                const newSong = await songLookup(patch.songId)
                if (newSong?.fileName !== undefined) {
                    fieldUpdate.fileName = newSong.fileName
                }
                // Stress-test v3 NOTE-1: on a re-bond, if the row's `title`
                // still equals the OLD song's catalog title (i.e. the user
                // hadn't customized it), auto-update title to the new
                // song's. Skips the auto-refresh when the patch explicitly
                // sets title (caller wins) or when titles disagree (caller
                // customized — preserve their intent). Perform mode shows
                // the row's title under each chart, so a stale label after
                // a re-bond was operator-confusing.
                const explicitTitle =
                    typeof patch.title === "string" && patch.title.trim().length > 0
                const currentTitle =
                    typeof peekData.title === "string"
                        ? peekData.title.trim()
                        : ""
                if (
                    !explicitTitle &&
                    newSong?.title &&
                    typeof oldFileId === "string" &&
                    oldFileId.length > 0 &&
                    currentTitle.length > 0
                ) {
                    try {
                        const oldSong = await songLookup(oldFileId)
                        if (oldSong?.title && currentTitle === oldSong.title.trim()) {
                            fieldUpdate.title = newSong.title
                        }
                    } catch (lookupErr) {
                        // Fail-soft — without the old song record we can't
                        // tell if the title was customized, so keep it.
                        logger.warn("[mcp] update_track old-song lookup failed", {
                            setlistId,
                            trackId,
                            oldFileId,
                            err:
                                lookupErr instanceof Error
                                    ? lookupErr.message
                                    : String(lookupErr),
                        })
                    }
                }
            } catch (err) {
                // Fail-soft on lookup error — the patch still lands, fileName
                // just stays whatever the row had.
                logger.warn("[mcp] update_track songLookup failed", {
                    setlistId,
                    trackId,
                    songId: patch.songId,
                    err: err instanceof Error ? err.message : String(err),
                })
            }
        }
    }
    const wantsFileIdsRebuild =
        newFileId !== undefined && newFileId !== oldFileId

    // Stage B (inside tx): re-read track for version gating + existence
    // (atomic with the writes below). Also read sibling tracks via the
    // tx's get(query) if we need them for in-place reorder or fileIds
    // canonical rebuild — these reads happen BEFORE any writes per the
    // Firestore transaction contract.
    type TxResult =
        | { ok: true; track: Record<string, unknown> }
        | WriteError
        | WriteRejection
    const txResult = await db.runTransaction<TxResult>(async (tx) => {
        const txTrackSnap = await tx.get(trackRef)
        if (!txTrackSnap.exists) {
            const txSetlistSnap = await tx.get(setlistRef)
            return {
                ok: false,
                kind: "track_not_found",
                envelope: trackNotFoundEnvelope({
                    trackId,
                    setlistId,
                    setlistVersion: readVersion(txSetlistSnap.data()),
                    setlistLastModifiedAt: readLastModifiedAt(
                        txSetlistSnap.data(),
                    ),
                }),
            }
        }
        const txData = txTrackSnap.data() as Record<string, unknown>
        if (txData.setlistId !== setlistId) {
            return {
                ok: false,
                error: "Track does not belong to this setlist",
            }
        }

        if (lastSeenVersion !== undefined) {
            const currentVersion = readVersion(txData)
            if (currentVersion !== lastSeenVersion) {
                const txSetlistSnap = await tx.get(setlistRef)
                return {
                    ok: false,
                    kind: "stale_version",
                    envelope: staleVersionEnvelope({
                        resource: "track",
                        currentVersion,
                        lastSeenVersion,
                        lastModifiedBy: txData.lastModifiedBy as
                            | string
                            | undefined,
                        lastModifiedAt: readLastModifiedAt(
                            txSetlistSnap.data(),
                        ),
                    }),
                }
            }
        }

        // Sibling reads (still in the read-phase of the tx). For the in-
        // place reorder we need every track on the setlist; for the
        // fileIds[] canonical rebuild we likewise need every sibling's
        // current fileId. Use a tx.get on the query so all reads stay
        // consistent with the version-checked track snapshot above.
        let allTracks: Array<{
            id: string
            order: number
            fileId?: string
        }> | null = null
        if (wantsMove || wantsFileIdsRebuild) {
            const sibSnap = await tx.get(
                db.collection("tracks").where("setlistId", "==", setlistId),
            )
            allTracks = sibSnap.docs.map((d) => {
                const data = d.data() as Record<string, unknown>
                return {
                    id: d.id,
                    order: typeof data.order === "number" ? data.order : 0,
                    fileId:
                        typeof data.fileId === "string"
                            ? (data.fileId as string)
                            : undefined,
                }
            })
            allTracks.sort((a, b) => a.order - b.order)
        }

        // Writes (transaction's write-phase). Build the target row's
        // update; merge any reorder-derived `order` BEFORE the single
        // tx.update(trackRef, ...) call (Firestore rejects two writes to
        // the same ref inside one transaction, so we must combine).
        const update: Record<string, unknown> = {
            ...fieldUpdate,
            updatedAt: FieldValue.serverTimestamp(),
            ...versionBumpFields(),
        }

        // CF3: in-place reorder. Clamp the target into the valid range,
        // then splice the row out + back in to compute new `order` values
        // for every affected sibling.
        if (wantsMove && allTracks && allTracks.length > 0) {
            const currentIdx = allTracks.findIndex((t) => t.id === trackId)
            const target = Math.max(
                0,
                Math.min(patch.position as number, allTracks.length - 1),
            )
            if (currentIdx !== -1 && currentIdx !== target) {
                const reordered = allTracks.slice()
                const [moved] = reordered.splice(currentIdx, 1)
                reordered.splice(target, 0, moved)
                reordered.forEach((t, i) => {
                    if (t.order === i) return
                    if (t.id === trackId) {
                        // Merge into the target row's combined update.
                        update.order = i
                    } else {
                        tx.update(db.collection("tracks").doc(t.id), {
                            order: i,
                            ...versionBumpFields(),
                        })
                    }
                })
            }
        }

        tx.update(trackRef, update)

        const setlistPatch: Record<string, unknown> = {
            updatedAt: FieldValue.serverTimestamp(),
            ...versionBumpFields(),
        }

        // Re-bond reconcile: replace the parent's `fileIds[]` with the
        // canonical set derived from the post-patch track state. Self-
        // heals any prior drift; safer than arrayUnion(new) + arrayRemove(
        // old, if no siblings), which can leave the aggregate stale if
        // siblings reference the old chart elsewhere on the setlist.
        if (wantsFileIdsRebuild && allTracks) {
            const canonical = new Set<string>()
            for (const t of allTracks) {
                const tFileId =
                    t.id === trackId ? newFileId : t.fileId
                if (typeof tFileId === "string" && tFileId) {
                    canonical.add(tFileId)
                }
            }
            setlistPatch.fileIds = [...canonical]
        }

        tx.update(setlistRef, setlistPatch)
        return { ok: true, track: { id: trackId } }
    })

    if (!txResult.ok) return txResult

    logger.info("[mcp] track updated", {
        setlistId,
        trackId,
        fields: Object.keys(fieldUpdate),
        moved: wantsMove,
        rebonded: wantsFileIdsRebuild,
    })

    const after = (await trackRef.get()).data() as Record<string, unknown>
    return { ok: true, track: normalizeTrackEcho(trackId, after) }
}

/**
 * Convert a raw Firestore track doc into the JSON-friendly echo shape we
 * return from update_track / bulk_update_tracks. Specifically: surface
 * `updatedAt` as an ISO string regardless of whether the source was a
 * Firestore Timestamp (post-commit re-read), a {toMillis}-shaped
 * normalization (from getTracksForSetlist), or a ms-since-epoch number.
 *
 * The cowork CF1 verification (2026-05-15, §3.3) flagged the inconsistent
 * shape: plan-path rows came through as ms numbers; committed-path rows
 * came through as raw `{_seconds, _nanoseconds}` Timestamps. Callers had
 * no portable way to read the field.
 */
function normalizeTrackEcho(
    id: string,
    data: Record<string, unknown> | undefined,
): Record<string, unknown> {
    const echo: Record<string, unknown> = { id }
    if (!data) return echo
    for (const [k, v] of Object.entries(data)) {
        if (k === "updatedAt") {
            echo[k] = toIsoString(v)
        } else {
            echo[k] = v
        }
    }
    return echo
}

function toIsoString(v: unknown): string | null {
    if (typeof v === "string") return v
    if (typeof v === "number") return new Date(v).toISOString()
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
    if (
        v &&
        typeof v === "object" &&
        "toMillis" in v &&
        typeof (v as { toMillis: unknown }).toMillis === "function"
    ) {
        try {
            return new Date((v as { toMillis(): number }).toMillis()).toISOString()
        } catch {
            return null
        }
    }
    return null
}

export const BULK_UPDATE_MAX_PATCHES = 50

export interface BulkUpdatePatchEntry {
    trackId: string
    patch: UpdateTrackPatch
    /**
     * W-04 Plan 03 per-row optimistic-concurrency gate. When supplied,
     * the atomic-mode pre-flight rejects the WHOLE batch (no writes)
     * with `staleRows[]` if any patch's track has advanced past
     * `lastSeenVersion`. Best-effort mode skips just the stale row.
     */
    lastSeenVersion?: number
}

export interface BulkUpdateResult {
    trackId: string
    ok: boolean
    error?: string
    /** W-04 Plan 03: server's current version when `error === "stale_version"`. */
    currentVersion?: number
    /** W-04 Plan 03: caller's asserted version when `error === "stale_version"`. */
    lastSeenVersion?: number
    track?: Record<string, unknown>
}

export interface BulkUpdateOptions {
    mode?: "atomic" | "best-effort"
    dryRun?: boolean
}

/** W-04 Plan 03 stale-row tuple for atomic-batch rejection envelopes. */
export interface BulkStaleRow {
    trackId: string
    currentVersion: number
    lastSeenVersion: number
}

/**
 * Apply many per-row patches to one setlist's tracks in a single call.
 *
 * `mode='atomic'` (default) wraps every update in a Firestore transaction —
 * all-or-nothing. If any pre-validation fails, NO writes happen and the
 * response carries `committed: false` plus per-row results explaining
 * exactly which patch failed and which were rolled back.
 *
 * `mode='best-effort'` applies each patch independently, accumulating
 * per-row results. Lossier but partial-success is allowed.
 *
 * `dryRun=true` returns the would-apply plan without writing — useful for
 * confirming a large change before committing. `committed: false` in this
 * case too (intentionally not committed, not failed).
 *
 * Response invariant (post-CF1-fix 2026-05-15): `committed` answers
 * "did Firestore writes actually land?" The cowork eval flagged that
 * the old envelope used `ok: true` for both "committed" and "rolled back
 * atomically" — callers couldn't distinguish. `committed: boolean` is the
 * load-bearing signal now.
 *
 * Cap: 50 patches per call (chunk longer lists).
 */
export async function bulkUpdateTracks(
    db: DB,
    setlistId: string,
    patches: BulkUpdatePatchEntry[],
    options: BulkUpdateOptions = {},
    songLookup?: SongLookup,
): Promise<
    | {
          ok: true
          mode: "atomic" | "best-effort"
          committed: boolean
          results: BulkUpdateResult[]
          dryRun: boolean
          /**
           * W-04 Plan 03 — populated only when an atomic batch was
           * rejected due to per-row `lastSeenVersion` mismatch. Each
           * entry mirrors a stale row in `results[]`; the field surfaces
           * the batch-level rejection at the envelope top so callers
           * don't have to filter per-row to discover the staleness.
           */
          staleRows?: BulkStaleRow[]
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

    // F-01 parity (2026-05-16 bugstomp): pre-resolve every re-bond patch's
    // songIds (NEW + OLD) BEFORE building plan entries, so a bogus NEW
    // songId fails at the plan stage (atomic mode rejects all; best-effort
    // marks the bad row invalid and continues). Pre-fix, songLookup
    // returned null on miss and the bulk path silently wrote the patch
    // anyway — same orphan-manufacture hole F-01 closed on `update_track`.
    // The same cache also feeds the existing NOTE-1 title-refresh path
    // (old-song lookups for "was the title customized?"), so we collect
    // both up front and one fetch phase serves both purposes. songLookup
    // is optional — without it we can't validate, so we skip the check
    // (parity with the no-lookup semantics in applyRebondSideEffects).
    const songCache = new Map<
        string,
        { title?: string; fileName?: string } | null
    >()
    if (songLookup) {
        const idsToFetch = new Set<string>()
        for (const { trackId, patch } of patches) {
            if (patch.songId === undefined) continue
            const row = byId.get(trackId) as Record<string, unknown> | undefined
            if (!row) continue
            if (patch.songId !== row.songId) {
                idsToFetch.add(patch.songId)
                const oldFid = row.fileId
                if (typeof oldFid === "string" && oldFid) idsToFetch.add(oldFid)
            }
        }
        await Promise.all(
            [...idsToFetch].map(async (sid) => {
                try {
                    songCache.set(sid, await songLookup(sid))
                } catch (err) {
                    logger.warn("[mcp] bulk_update_tracks songLookup failed", {
                        sid,
                        err: err instanceof Error ? err.message : String(err),
                    })
                    songCache.set(sid, null)
                }
            }),
        )
    }

    type PlanEntry =
        | { kind: "preview"; result: BulkUpdateResult }
        | { kind: "invalid"; result: BulkUpdateResult }

    const planEntries: PlanEntry[] = patches.map(({ trackId, patch }) => {
        const row = byId.get(trackId)
        if (!row) {
            return {
                kind: "invalid",
                result: {
                    trackId,
                    ok: false,
                    error: "Track not found in this setlist",
                },
            }
        }
        // CF3: `position` is single-track only — bulk reorders + bulk field
        // patches in one call have ambiguous result ordering. Callers should
        // use reorder_setlist for multi-row moves or update_track (singular)
        // for one move.
        if (patch.position !== undefined) {
            return {
                kind: "invalid",
                result: {
                    trackId,
                    ok: false,
                    error:
                        "`position` is not supported in bulk_update_tracks — use update_track for a single move or reorder_setlist for a multi-row reorder",
                },
            }
        }
        const fields = UPDATABLE_FIELDS.filter((k) => patch[k] !== undefined)
        if (fields.length === 0) {
            return {
                kind: "invalid",
                result: {
                    trackId,
                    ok: false,
                    error: "patch must include at least one field",
                },
            }
        }
        // F-01 parity: a re-bond patch (songId differs from current) whose
        // new songId resolved to null in the pre-fetch is rejected — same
        // contract as update_track. Only fires when songLookup was provided
        // and the bond is actually changing.
        if (
            songLookup &&
            patch.songId !== undefined &&
            patch.songId !== row.songId &&
            songCache.get(patch.songId) === null
        ) {
            return {
                kind: "invalid",
                result: {
                    trackId,
                    ok: false,
                    error: `Song ${patch.songId} not found`,
                },
            }
        }
        const preview: Record<string, unknown> = { ...row }
        for (const k of fields) preview[k] = patch[k]
        if (patch.songId !== undefined && patch.songId !== row.songId) {
            preview.fileId = patch.songId
        }
        return {
            kind: "preview",
            result: {
                trackId,
                ok: true,
                track: normalizeTrackEcho(trackId, preview),
            },
        }
    })

    const anyInvalid = planEntries.some((p) => p.kind === "invalid")

    // atomic + any pre-validation failure → reject the whole batch, no writes.
    // The previously-valid rows must be marked ok:false with an explicit
    // rollback message — they did NOT commit, and a caller reading the
    // envelope shouldn't be fooled by a stale-looking `ok: true`.
    if (mode === "atomic" && anyInvalid) {
        const results: BulkUpdateResult[] = planEntries.map((p) =>
            p.kind === "invalid"
                ? p.result
                : {
                      trackId: p.result.trackId,
                      ok: false,
                      error:
                          "Rolled back: another patch in the atomic batch failed pre-validation",
                  },
        )
        logger.info("[mcp] bulk track update — atomic rollback", {
            setlistId,
            patchCount: patches.length,
            invalidCount: planEntries.filter((p) => p.kind === "invalid").length,
        })
        return { ok: true, mode, committed: false, results, dryRun }
    }

    if (dryRun) {
        return {
            ok: true,
            mode,
            committed: false,
            results: planEntries.map((p) => p.result),
            dryRun: true,
        }
    }

    const results: BulkUpdateResult[] = planEntries.map((p) => p.result)

    // songCache populated above in the F-01-parity pre-fetch — both NEW
    // and OLD song lookups are already cached for the side-effects path.

    // Resolve the {fileName, title} side-effects of a single re-bond into the
    // update map. Reused by both atomic and best-effort paths so the contract
    // matches what update_track does (H-1/H-5/F-2 + NOTE-1).
    function applyRebondSideEffects(
        update: Record<string, unknown>,
        existingRow: Record<string, unknown>,
        patch: UpdateTrackPatch,
    ): void {
        if (patch.songId === undefined || patch.songId === existingRow.songId) {
            return
        }
        update.fileId = patch.songId
        if (!songLookup) return
        const newSong = songCache.get(patch.songId)
        if (newSong?.fileName !== undefined) update.fileName = newSong.fileName

        const explicitTitle =
            typeof patch.title === "string" && patch.title.trim().length > 0
        const currentTitle =
            typeof existingRow.title === "string" ? existingRow.title.trim() : ""
        const oldFid =
            typeof existingRow.fileId === "string"
                ? (existingRow.fileId as string)
                : ""
        if (!explicitTitle && newSong?.title && oldFid && currentTitle) {
            const oldSong = songCache.get(oldFid)
            if (oldSong?.title && currentTitle === oldSong.title.trim()) {
                update.title = newSong.title
            }
        }
    }

    if (mode === "atomic") {
        // W-04 Plan 03 atomic pre-flight: any patch carrying
        // `lastSeenVersion` must match the track's CURRENT version inside
        // the same transaction as the writes. Single mismatch aborts the
        // whole batch with `staleRows[]` — none of the valid patches land.
        type AtomicTxResult =
            | { kind: "ok" }
            | { kind: "stale_version"; staleRows: BulkStaleRow[] }
        const txResult = await db.runTransaction<AtomicTxResult>(async (tx) => {
            // Read phase — pull current version for every gated row first.
            // (Firestore transactions require all reads before any writes.)
            const gated = patches.filter(
                (p): p is BulkUpdatePatchEntry & { lastSeenVersion: number } =>
                    p.lastSeenVersion !== undefined,
            )
            const versionSnaps = await Promise.all(
                gated.map((p) =>
                    tx.get(db.collection("tracks").doc(p.trackId)),
                ),
            )
            const staleRows: BulkStaleRow[] = []
            gated.forEach((p, i) => {
                const currentVersion = readVersion(versionSnaps[i].data())
                if (currentVersion !== p.lastSeenVersion) {
                    staleRows.push({
                        trackId: p.trackId,
                        currentVersion,
                        lastSeenVersion: p.lastSeenVersion,
                    })
                }
            })
            if (staleRows.length > 0) {
                return { kind: "stale_version", staleRows }
            }

            // Write phase — unchanged from pre-Plan-03 shape.
            for (const entry of patches) {
                const ref = db.collection("tracks").doc(entry.trackId)
                const update: Record<string, unknown> = {
                    updatedAt: FieldValue.serverTimestamp(),
                    ...versionBumpFields(), // W-04 Plan 01
                }
                for (const k of UPDATABLE_FIELDS) {
                    if (entry.patch[k] !== undefined) update[k] = entry.patch[k]
                }
                const existingRow = byId.get(entry.trackId) as
                    | Record<string, unknown>
                    | undefined
                if (existingRow) {
                    applyRebondSideEffects(update, existingRow, entry.patch)
                }
                tx.update(ref, update)
            }
            // Canonical fileIds[] rebuild from post-patch state — same
            // contract as update_track's re-bond path. Self-heals any prior
            // drift in one transaction-scoped write.
            const anyRebond = patches.some((p) => {
                const row = byId.get(p.trackId) as
                    | Record<string, unknown>
                    | undefined
                return (
                    p.patch.songId !== undefined &&
                    row !== undefined &&
                    p.patch.songId !== row.songId
                )
            })
            const setlistPatch: Record<string, unknown> = {
                updatedAt: FieldValue.serverTimestamp(),
                ...versionBumpFields(), // W-04 Plan 01
            }
            if (anyRebond) {
                const patchedFileId = new Map<string, string | undefined>()
                for (const p of patches) {
                    const row = byId.get(p.trackId) as
                        | Record<string, unknown>
                        | undefined
                    if (!row) continue
                    if (p.patch.songId !== undefined && p.patch.songId !== row.songId) {
                        patchedFileId.set(p.trackId, p.patch.songId)
                    }
                }
                const canonical = new Set<string>()
                for (const t of existing) {
                    const tRec = t as Record<string, unknown>
                    const tFileId = patchedFileId.has(tRec.id as string)
                        ? patchedFileId.get(tRec.id as string)
                        : (tRec.fileId as string | undefined)
                    if (typeof tFileId === "string" && tFileId) {
                        canonical.add(tFileId)
                    }
                }
                setlistPatch.fileIds = [...canonical]
            }
            tx.update(db.collection("setlists").doc(setlistId), setlistPatch)
            return { kind: "ok" }
        })

        // W-04 Plan 03: if the atomic pre-flight rejected, build the per-
        // row results in the same shape as pre-validation rollback —
        // stale rows carry their currentVersion + lastSeenVersion + the
        // stale_version error; non-stale rows get the rollback message.
        if (txResult.kind === "stale_version") {
            const staleById = new Map(
                txResult.staleRows.map((r) => [r.trackId, r]),
            )
            const rolledBack: BulkUpdateResult[] = patches.map((p) => {
                const stale = staleById.get(p.trackId)
                if (stale) {
                    return {
                        trackId: p.trackId,
                        ok: false,
                        error: "stale_version",
                        currentVersion: stale.currentVersion,
                        lastSeenVersion: stale.lastSeenVersion,
                    }
                }
                return {
                    trackId: p.trackId,
                    ok: false,
                    error:
                        "Rolled back: another patch in the atomic batch had a stale lastSeenVersion",
                }
            })
            logger.info("[mcp] bulk track update — stale_version rollback", {
                setlistId,
                staleCount: txResult.staleRows.length,
                patchCount: patches.length,
            })
            return {
                ok: true,
                mode,
                committed: false,
                results: rolledBack,
                dryRun: false,
                staleRows: txResult.staleRows,
            }
        }

        // Re-read the affected rows so callers get the actual post-commit
        // state (including the server-stamped updatedAt). normalizeTrackEcho
        // turns the Firestore Timestamp into an ISO string for consistency
        // with the plan-path echo shape.
        for (let i = 0; i < patches.length; i++) {
            if (!results[i].ok) continue
            const after = (
                await db.collection("tracks").doc(patches[i].trackId).get()
            ).data() as Record<string, unknown> | undefined
            if (after) {
                results[i] = {
                    trackId: patches[i].trackId,
                    ok: true,
                    track: normalizeTrackEcho(patches[i].trackId, after),
                }
            }
        }
    } else {
        for (let i = 0; i < patches.length; i++) {
            const entry = patches[i]
            if (!results[i].ok) continue
            try {
                // W-04 Plan 03: forward per-patch lastSeenVersion to the
                // per-row updateTrack call so best-effort skips just the
                // stale row instead of refusing the whole batch.
                const r = await updateTrack(
                    db,
                    setlistId,
                    entry.trackId,
                    entry.patch,
                    songLookup,
                    entry.lastSeenVersion,
                )
                results[i] = r.ok
                    ? { trackId: entry.trackId, ok: true, track: r.track }
                    : "kind" in r && r.kind === "stale_version"
                      ? {
                            trackId: entry.trackId,
                            ok: false,
                            error: "stale_version",
                            currentVersion: r.envelope.currentVersion,
                            lastSeenVersion: r.envelope.lastSeenVersion,
                        }
                      : {
                          trackId: entry.trackId,
                          ok: false,
                          // Best-effort: track_not_found flattens to a
                          // string error (envelope.message carries the
                          // setlistVersion-bearing context if the agent
                          // needs to inspect; this row surfaces the
                          // machine-friendly error code).
                          error:
                              "kind" in r ? r.envelope.message : r.error,
                      }
            } catch (err) {
                results[i] = {
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
        anyFailed: results.some((p) => !p.ok),
    })

    return { ok: true, mode, committed: true, results, dryRun: false }
}

// ─── CF3: bulk_add_tracks ───────────────────────────────────────────────────

export const BULK_ADD_MAX_TRACKS = 50

export interface BulkAddTrackInput {
    type?: "song" | "header" | "reading" | "prayer" | "transition" | "note"
    title?: string
    key?: string
    leadMusician?: string
    referenceLink?: string
    songId?: string
    fileId?: string
    fileName?: string
    notes?: string
}

export interface BulkAddTracksOptions {
    /**
     * Insert anchor — all rows are spliced in starting at this index, in array
     * order. Out-of-range / omitted → append at the end. There's no per-row
     * `position` (the array's order IS the desired order of the new rows).
     */
    position?: number
    mode?: "atomic" | "best-effort"
    dryRun?: boolean
}

export interface BulkAddResult {
    index: number
    ok: boolean
    error?: string
    trackId?: string
    order?: number
}

/**
 * Insert many tracks into one setlist in a single call — closes the weekly-
 * flow N+1 ("9 sequential add_track_to_setlist calls for one new service")
 * cowork flagged as the top remaining gap.
 *
 * The array's order IS the desired performance order of the new rows. All
 * rows are spliced in starting at `position` (or appended), preserving the
 * caller's order. No per-row position field — multiple per-row positions in
 * one batch have ambiguous semantics; for arbitrary reorders use reorder_setlist.
 *
 * `mode='atomic'` (default): all-or-nothing batch commit. Pre-validates every
 * row; if any row fails validation, NO writes happen and the response carries
 * `committed: false` plus per-row results explaining which row tripped it.
 *
 * `mode='best-effort'`: each row is inserted independently via `addTrack`.
 * Partial success allowed. Lossier but never blocks on one bad row.
 *
 * `dryRun=true` returns the would-apply plan without writing.
 */
export async function bulkAddTracks(
    db: DB,
    setlistId: string,
    rows: BulkAddTrackInput[],
    options: BulkAddTracksOptions = {},
    resolveSongTitle?: (
        songId: string,
    ) => Promise<{ title: string; key?: string; lead?: string; fileName?: string } | null>,
): Promise<
    | {
          ok: true
          mode: "atomic" | "best-effort"
          committed: boolean
          results: BulkAddResult[]
          dryRun: boolean
      }
    | WriteError
> {
    if (rows.length === 0) {
        return { ok: false, error: "tracks must include at least one entry" }
    }
    if (rows.length > BULK_ADD_MAX_TRACKS) {
        return {
            ok: false,
            error: `tracks exceeds max (${BULK_ADD_MAX_TRACKS}); chunk into multiple calls`,
        }
    }
    const mode = options.mode ?? "atomic"
    const dryRun = options.dryRun ?? false

    const existing = await getTracksForSetlist(db, setlistId, {})
    const anchor =
        options.position === undefined ||
        options.position < 0 ||
        options.position > existing.length
            ? existing.length
            : options.position

    // Pre-resolve song lookups so the atomic batch has no async surprises.
    const planned: Array<
        | { kind: "ok"; index: number; trackId: string; payload: Record<string, unknown>; order: number; fileId?: string }
        | { kind: "invalid"; index: number; error: string }
    > = []

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        const type = row.type ?? "song"

        let title = row.title
        let key = row.key
        let leadMusician = row.leadMusician
        let fileId = row.fileId
        let fileName = row.fileName

        if (row.songId) {
            if (!resolveSongTitle) {
                planned.push({
                    kind: "invalid",
                    index: i,
                    error: "songId resolver not provided",
                })
                continue
            }
            const song = await resolveSongTitle(row.songId)
            if (!song) {
                planned.push({
                    kind: "invalid",
                    index: i,
                    error: `Song ${row.songId} not found`,
                })
                continue
            }
            title = title ?? song.title
            key = key ?? song.key
            leadMusician = leadMusician ?? song.lead
            fileName = fileName ?? song.fileName
            fileId = fileId ?? row.songId
        }

        if (!title || !title.trim()) {
            planned.push({
                kind: "invalid",
                index: i,
                error: "title is required (or pass a songId to derive it)",
            })
            continue
        }

        const trackId = crypto.randomUUID()
        const order = anchor + planned.filter((p) => p.kind === "ok").length

        const payload: Record<string, unknown> = {
            id: trackId,
            setlistId,
            order,
            type,
            title,
            updatedAt: FieldValue.serverTimestamp(),
            ...initialVersionFields(), // W-04 Plan 01: new track → version 1
        }
        if (key !== undefined) payload.key = key
        if (leadMusician !== undefined) payload.leadMusician = leadMusician
        if (row.referenceLink !== undefined) payload.referenceLink = row.referenceLink
        if (row.songId !== undefined) payload.songId = row.songId
        if (fileId !== undefined) payload.fileId = fileId
        if (fileName !== undefined) payload.fileName = fileName
        if (row.notes !== undefined) payload.notes = row.notes

        planned.push({
            kind: "ok",
            index: i,
            trackId,
            payload,
            order,
            fileId,
        })
    }

    const anyInvalid = planned.some((p) => p.kind === "invalid")

    if (mode === "atomic" && anyInvalid) {
        const results: BulkAddResult[] = planned.map((p) =>
            p.kind === "invalid"
                ? { index: p.index, ok: false, error: p.error }
                : {
                      index: p.index,
                      ok: false,
                      error:
                          "Rolled back: another row in the atomic batch failed pre-validation",
                  },
        )
        logger.info("[mcp] bulk track add — atomic rollback", {
            setlistId,
            rowCount: rows.length,
            invalidCount: planned.filter((p) => p.kind === "invalid").length,
        })
        return { ok: true, mode, committed: false, results, dryRun }
    }

    const results: BulkAddResult[] = planned.map((p) =>
        p.kind === "invalid"
            ? { index: p.index, ok: false, error: p.error }
            : { index: p.index, ok: true, trackId: p.trackId, order: p.order },
    )

    if (dryRun) {
        return { ok: true, mode, committed: false, results, dryRun: true }
    }

    if (mode === "atomic") {
        const batch = db.batch()
        // Shift existing rows at/after the anchor down by the insert count.
        const insertCount = planned.filter((p) => p.kind === "ok").length
        for (const t of existing) {
            if (t.order >= anchor) {
                batch.update(db.collection("tracks").doc(t.id), {
                    order: t.order + insertCount,
                    ...versionBumpFields(), // W-04 Plan 01: shifted siblings
                })
            }
        }
        const newFileIds = new Set<string>()
        for (const p of planned) {
            if (p.kind !== "ok") continue
            batch.set(db.collection("tracks").doc(p.trackId), p.payload)
            if (p.fileId) newFileIds.add(p.fileId)
        }
        const setlistPatch: Record<string, unknown> = {
            trackCount: existing.length + insertCount,
            updatedAt: FieldValue.serverTimestamp(),
            ...versionBumpFields(), // W-04 Plan 01
        }
        if (newFileIds.size > 0) {
            setlistPatch.fileIds = FieldValue.arrayUnion(...newFileIds)
        }
        batch.update(db.collection("setlists").doc(setlistId), setlistPatch)
        await batch.commit()
    } else {
        // Best-effort: insert each row independently. addTrack re-reads the
        // current setlist state per call, so positions stay contiguous even
        // if a row in the middle fails. We pass `position: anchor + i` for
        // the first successful insert and let subsequent ones drift naturally.
        let writtenSoFar = 0
        for (let i = 0; i < planned.length; i++) {
            const p = planned[i]
            if (p.kind !== "ok") continue
            try {
                const inserted = await addTrack(db, {
                    setlistId,
                    type: (p.payload.type as BulkAddTrackInput["type"]) ?? "song",
                    title: p.payload.title as string,
                    key: p.payload.key as string | undefined,
                    leadMusician: p.payload.leadMusician as string | undefined,
                    referenceLink: p.payload.referenceLink as string | undefined,
                    songId: p.payload.songId as string | undefined,
                    fileId: p.fileId,
                    fileName: p.payload.fileName as string | undefined,
                    notes: p.payload.notes as string | undefined,
                    position: anchor + writtenSoFar,
                })
                results[i] = {
                    index: p.index,
                    ok: true,
                    trackId: inserted.trackId,
                    order: inserted.order,
                }
                writtenSoFar++
            } catch (err) {
                results[i] = {
                    index: p.index,
                    ok: false,
                    error: err instanceof Error ? err.message : String(err),
                }
            }
        }
    }

    logger.info("[mcp] bulk tracks added", {
        setlistId,
        mode,
        rowCount: rows.length,
        anyFailed: results.some((r) => !r.ok),
    })

    return { ok: true, mode, committed: true, results, dryRun: false }
}

/**
 * Remove one track from a setlist, then re-pack the remaining rows' `order` to
 * stay contiguous and update the parent's `trackCount` + `updatedAt`.
 */
export async function removeTrack(
    db: DB,
    setlistId: string,
    trackId: string,
    /**
     * W-04 Plan 02 optimistic-concurrency gate. Rejects with
     * `staleVersionEnvelope` when the target row's version differs from
     * `lastSeenVersion`. Omit to keep last-writer-wins behavior.
     */
    lastSeenVersion?: number,
): Promise<{ ok: true } | WriteError | WriteRejection> {
    const setlistRef = db.collection("setlists").doc(setlistId)
    const trackRef = db.collection("tracks").doc(trackId)

    type TxResult = { ok: true } | WriteError | WriteRejection
    const result = await db.runTransaction<TxResult>(async (tx) => {
        // Read the target track first; if missing return the structured
        // not-found envelope (carries current setlist version so the
        // agent can re-fetch without guessing).
        const trackSnap = await tx.get(trackRef)
        if (!trackSnap.exists) {
            const setlistSnap = await tx.get(setlistRef)
            return {
                ok: false,
                kind: "track_not_found",
                envelope: trackNotFoundEnvelope({
                    trackId,
                    setlistId,
                    setlistVersion: readVersion(setlistSnap.data()),
                    setlistLastModifiedAt: readLastModifiedAt(
                        setlistSnap.data(),
                    ),
                }),
            }
        }
        const trackData = trackSnap.data() as Record<string, unknown>
        if (trackData.setlistId !== setlistId) {
            return {
                ok: false,
                error: "Track does not belong to this setlist",
            }
        }
        if (lastSeenVersion !== undefined) {
            const currentVersion = readVersion(trackData)
            if (currentVersion !== lastSeenVersion) {
                return {
                    ok: false,
                    kind: "stale_version",
                    envelope: staleVersionEnvelope({
                        resource: "track",
                        currentVersion,
                        lastSeenVersion,
                        lastModifiedBy: trackData.lastModifiedBy as
                            | string
                            | undefined,
                        lastModifiedAt: readLastModifiedAt(trackData),
                    }),
                }
            }
        }

        // Read all siblings (still in the tx's read-phase) to compute the
        // post-delete re-pack and to decide whether the removed chart's
        // fileId should drop from the parent setlist's fileIds[] aggregate.
        const sibSnap = await tx.get(
            db.collection("tracks").where("setlistId", "==", setlistId),
        )
        const existing = sibSnap.docs.map((d) => {
            const data = d.data() as Record<string, unknown>
            return {
                id: d.id,
                order: typeof data.order === "number" ? data.order : 0,
                fileId:
                    typeof data.fileId === "string"
                        ? (data.fileId as string)
                        : undefined,
            }
        })
        existing.sort((a, b) => a.order - b.order)
        const remaining = existing.filter((t) => t.id !== trackId)

        // Writes — delete the target + re-pack siblings + setlist patch.
        tx.delete(trackRef)
        remaining.forEach((t, i) => {
            if (t.order !== i) {
                tx.update(db.collection("tracks").doc(t.id), {
                    order: i,
                    updatedAt: FieldValue.serverTimestamp(),
                    ...versionBumpFields(),
                })
            }
        })
        const setlistPatch: Record<string, unknown> = {
            trackCount: remaining.length,
            updatedAt: FieldValue.serverTimestamp(),
            ...versionBumpFields(),
        }
        // Drop the chart from the parent's fileIds set only when no other
        // track still references it (the array is a distinct set across
        // all tracks).
        const removedFileId = trackData.fileId
        if (
            typeof removedFileId === "string" &&
            removedFileId &&
            !remaining.some((t) => t.fileId === removedFileId)
        ) {
            setlistPatch.fileIds = FieldValue.arrayRemove(removedFileId)
        }
        tx.update(setlistRef, setlistPatch)
        return { ok: true }
    })

    if (!result.ok) return result
    logger.info("[mcp] track removed", { setlistId, trackId })
    return { ok: true }
}
