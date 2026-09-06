import crypto from "crypto"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { FieldValue } from "firebase-admin/firestore"
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
import { getChartHealth } from "@/lib/file-fetcher"
import { liturgyRefGuard, bookSlugGuard } from "@/lib/mcp/liturgy-ref-guard"
import { rowOrg } from "@/lib/mcp/org-context"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"
import { parseEventDate } from "@/lib/parse-event-date"
import { isTestSetlist } from "@/types/models"
import {
    WRITE_RECEIPTS_COLLECTION,
    type StoredWriteReceipt,
    writeInputHash,
    writeReceiptId,
} from "@/lib/mcp/write-receipts"

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
    /**
     * Date for the new service. eventDate is a wall-clock-LOCAL concept
     * (America/Chicago). Accepted shapes:
     *   - `"YYYY-MM-DD"` (date-only — recommended) → noon America/Chicago.
     *   - `"YYYY-MM-DDTHH:MM"` (naive datetime) → that wall clock in
     *     America/Chicago (DST-aware).
     *   - `"...-05:00"` / `"...-06:00"` (explicit offset) → honored.
     *   - `"...Z"` (UTC zero) → honored verbatim — AVOID for CRC services;
     *     a 10am Saturday is `"2026-05-30T10:00"`, NOT `"...T10:00:00Z"`.
     */
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
    /**
     * Task 5 (liturgy outlines Phase 2) — registry slug of the liturgy book
     * used at this service, e.g. 'crc-friday'. Optional; threaded straight
     * through to createSetlistServerSide's CreateSetlistInput.book so it
     * lands in the same atomic batch as the rest of the setlist doc.
     */
    book?: string
    /**
     * Optional caller-minted retry key. Reusing the same key with the same
     * payload returns the original receipt; omit it for a deliberate new
     * setlist, even when every visible field is identical.
     */
    idempotencyKey?: string
}

interface CreateSetlistOk {
    setlistId: string
    trackCount: number
    ownerId: string
    ownerName: string
    version: number
    receiptId?: string
    replayed?: boolean
}

export async function createSetlist(
    uid: string,
    args: CreateSetlistArgs,
    org: OrgId = DEFAULT_ORG_ID,
): Promise<
    | CreateSetlistOk
    | RichErrorEnvelope
> {
    initAdmin()
    const db = getFirestore()

    const editor = await assertEditor(db, uid)
    if (!editor.ok) return editor

    // Task 7 (liturgy outlines Phase 3): reject an unknown book slug before
    // any write. Zod only checked the shape of `book`; the registry is the
    // only source of truth for whether the slug exists.
    const badBook = bookSlugGuard(args.book)
    if (badBook) return badBook

    const idempotencyKey = args.idempotencyKey?.trim()
    if (args.idempotencyKey !== undefined && (!idempotencyKey || idempotencyKey.length > 128)) {
        return richError(
            "invalid_argument",
            "idempotencyKey must be 1-128 non-whitespace characters when supplied.",
            { field: "idempotencyKey" },
        )
    }

    const ownerName = await ownerNameFor(db, uid)

    if (idempotencyKey) {
        const tool = "create_setlist"
        const receiptId = writeReceiptId(tool, uid, org, idempotencyKey)
        const receiptRef = db.collection(WRITE_RECEIPTS_COLLECTION).doc(receiptId)
        const inputHash = writeInputHash({
            name: args.name,
            eventDate: args.eventDate,
            serviceType: args.serviceType,
            rabbi: args.rabbi,
            isTest: args.isTest,
            book: args.book,
        })
        // Allocate once per invocation. If Firestore retries this transaction,
        // the callback keeps the same target id; a concurrent invocation loses
        // the receipt race and returns the winner's stored target instead.
        const candidateSetlistId = crypto.randomUUID()
        const outcome = await db.runTransaction<
            | { kind: "ok"; result: CreateSetlistOk }
            | { kind: "conflict" }
        >(async (tx) => {
            const receiptSnap = await tx.get(receiptRef)
            if (receiptSnap.exists) {
                const receipt = receiptSnap.data() as StoredWriteReceipt<CreateSetlistOk>
                if (receipt.inputHash !== inputHash) return { kind: "conflict" }
                if (receipt.state === "complete" && receipt.result) {
                    return {
                        kind: "ok",
                        result: { ...receipt.result, receiptId, replayed: true },
                    }
                }
                // create_setlist writes its result atomically with the receipt,
                // so an in-progress row is never expected here.
                throw new Error(`Incomplete ${tool} receipt '${receiptId}'.`)
            }

            const result: CreateSetlistOk = {
                setlistId: candidateSetlistId,
                trackCount: 0,
                ownerId: uid,
                ownerName,
                version: 1,
                receiptId,
                replayed: false,
            }
            const nowIso = new Date().toISOString()
            const setlistPayload: Record<string, unknown> = {
                id: candidateSetlistId,
                orgId: org,
                name: args.name,
                date: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
                trackCount: 0,
                songCount: 0,
                hydrated: true,
                ownerId: uid,
                ownerName,
                version: 1,
                lastModifiedAt: nowIso,
                lastModifiedBy: uid,
                isTest:
                    args.isTest === true
                        ? true
                        : isTestSetlist({ name: args.name, ownerId: uid }),
            }
            if (args.eventDate !== undefined) {
                setlistPayload.eventDate = parseEventDate(args.eventDate)
            }
            if (args.serviceType !== undefined) setlistPayload.templateType = args.serviceType
            if (args.rabbi !== undefined) setlistPayload.rabbi = args.rabbi
            if (args.book !== undefined) setlistPayload.book = args.book

            tx.create(db.collection("setlists").doc(candidateSetlistId), setlistPayload)
            tx.create(receiptRef, {
                tool,
                uid,
                orgId: org,
                idempotencyKey,
                inputHash,
                state: "complete",
                result,
                createdAt: FieldValue.serverTimestamp(),
                completedAt: FieldValue.serverTimestamp(),
            } satisfies StoredWriteReceipt<CreateSetlistOk>)
            return { kind: "ok", result }
        })
        if (outcome.kind === "conflict") {
            return richError(
                "idempotency_key_reused",
                "This idempotencyKey was already used for a different create_setlist payload.",
                { idempotencyKey, receiptId },
                "Use the original payload to retrieve its receipt, or mint a new key for a deliberate new setlist.",
            )
        }
        return outcome.result
    }

    const result = await createSetlistServerSide({
        name: args.name,
        ownerId: uid,
        ownerName,
        // v11-02-03: stamp the CALLER's org (v11-01-02 added the optional
        // orgId field, defaulting crc; this passes the bearer's org).
        orgId: org,
        eventDate: args.eventDate,
        serviceType: args.serviceType as SetlistMetadataPatch["serviceType"],
        rabbi: args.rabbi,
        book: args.book,
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
    /**
     * Replacement eventDate (wall-clock-LOCAL America/Chicago). See
     * `create_setlist`'s eventDate for accepted shapes. To recover a legacy
     * row whose stored eventDate was a UTC-zero trap, edit with the naive
     * wall-clock form: `update_setlist({id, eventDate: "2026-05-30T10:00"})`.
     */
    eventDate?: string
    serviceType?: string
    rabbi?: string
    serviceNotes?: string
    /**
     * Task 5 (liturgy outlines Phase 2) — see CreateSetlistArgs.book. Threaded
     * through to updateSetlistServerSide's SetlistMetadataPatch.book so it
     * lands in the same write as the rest of the patch.
     */
    book?: string
    /** W-04 Plan 02 optimistic-concurrency gate (setlist-level version). */
    lastSeenVersion?: number
}

export async function updateSetlist(
    uid: string,
    args: UpdateSetlistArgs,
    org: OrgId = DEFAULT_ORG_ID,
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

    const loaded = await loadEditableSetlist(db, args.id, uid, org)
    if (!loaded.ok) return loaded

    // Task 7 (liturgy outlines Phase 3): reject an unknown book slug before
    // any write.
    const badBook = bookSlugGuard(args.book)
    if (badBook) return badBook

    const patch: SetlistMetadataPatch = {}
    if (args.name !== undefined) patch.name = args.name
    if (args.eventDate !== undefined) patch.eventDate = args.eventDate
    if (args.serviceType !== undefined) {
        patch.serviceType = args.serviceType as SetlistMetadataPatch["serviceType"]
    }
    if (args.rabbi !== undefined) patch.rabbi = args.rabbi
    if (args.serviceNotes !== undefined) patch.serviceNotes = args.serviceNotes
    if (args.book !== undefined) patch.book = args.book

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
    /** F-017 — override the denormed tempo; otherwise inherited from the song. */
    bpm?: number
    leadMusician?: string
    referenceLink?: string
    notes?: string
    /** 0-based insert index; omitted → append. */
    position?: number
    /**
     * C9I2-001: bypass the dead-chart bind guard. By default a songId whose
     * chart bytes are dead (missing 404 or an unembeddable Drive shortcut)
     * is refused — binding it would render a broken row in Perform mode and
     * drop from gig packets. Set true to bind anyway (e.g. you're about to
     * re-upload the bytes, or the row will be reconciled).
     */
    force?: boolean
    /** Task 5 (liturgy outlines Phase 2) — service-flow fields, on the model
     *  since v6 but unreachable via MCP add until now. */
    performer?: string
    description?: string
    estimatedMinutes?: number
    liturgyRef?: { book: string; unitId?: string; folio: number }
    honors?: Array<{ name: string; note?: string }>
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
    /**
     * Cycle-7-fixes Lane 4 sub-task H (C7I3-003) — when the caller passed
     * `position` and it was out of `[0, existing.length]`, the insert
     * silently clamped (to 0 for negatives, to `existing.length` for
     * overshoot / undefined). The warning surfaces the clamp so callers
     * can correct future calls (e.g. "I asked for 999, you got 10").
     * Absent on a no-clamp insert.
     */
    warning?: string
}

/**
 * Read a chart's MIME from its library_index row — the source of truth for the
 * track's mimeType cache. Scraped/text/image charts have extension-less fileIds
 * (`upload-{uuid}`) and bare-title fileNames, so without persisting this mime
 * onto the track, queue-utils.toQueueItem can't distinguish a text chart from a
 * PDF and defaults to the PDF renderer → "Failed to render PDF" in Perform.
 * Fail-soft: returns undefined on any miss. [[project_track_mimetype_gotcha]]
 */
async function readLibraryMimeType(
    db: FirebaseFirestore.Firestore,
    songId: string,
): Promise<string | undefined> {
    try {
        const idx = await db.collection("library_index").doc(songId).get()
        const m = idx.exists ? idx.data()?.mimeType : undefined
        return typeof m === "string" ? m : undefined
    } catch {
        return undefined
    }
}

export async function addTrackToSetlist(
    uid: string,
    args: AddTrackArgs,
    org: OrgId = DEFAULT_ORG_ID,
): Promise<AddTrackToSetlistOk | RichErrorEnvelope> {
    initAdmin()
    const db = getFirestore()

    const loaded = await loadEditableSetlist(db, args.setlistId, uid, org)
    if (!loaded.ok) return loaded

    // Task 7 (liturgy outlines Phase 3): registry-backed check BEFORE any
    // write. Zod (Task 6) only validated the shape of liturgyRef; only the
    // book registry knows whether the book exists and the page is inside
    // it. A wrong page number reaching the rabbi's printed sheet is the one
    // failure mode this feature cannot afford.
    const badLiturgyRef = liturgyRefGuard(args.liturgyRef)
    if (badLiturgyRef) return badLiturgyRef

    const type = args.type ?? "song"

    // MCP-008 (cycle-2): shared chart-resolve helper. Pre-extraction this
    // path duplicated the songId → {title, key, leadMusician, fileName}
    // resolution that commit_staged_changes's add-proposal handler omitted.
    const resolved = await resolveTrackBondDefaults({
        songId: args.songId,
        title: args.title,
        key: args.key,
        bpm: args.bpm,
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

    // C9I2-001: refuse binding a chart whose bytes are dead — `missing` (404
    // in both Storage and Drive) or `shortcut_unresolved` (an unembeddable
    // Google Drive shortcut). Pre-fix, active-status library_index rows whose
    // bytes had 404'd were silently bindable, producing rows that 404 in
    // Perform mode and drop from gig packets (the Lechu-Goldman class). The
    // library_index mimeType hint is read so a row whose canonical mime is a
    // shortcut is caught even when Storage holds a stale shortcut blob
    // (BUG-002). `needs_storage_sync` (serves via Drive fallback) and
    // `unreachable` (transient blip) are allowed. `force: true` overrides.
    // Resolve the chart's library_index mimeType up front (cheap single-doc
    // read): it is BOTH the chart-health hint AND the value persisted onto the
    // track so queue-utils.toQueueItem routes scraped/text/image charts to the
    // right viewer. Pre-fix this read was gated behind `!args.force`, so a
    // forced bind never stamped mimeType and forced text charts rendered as
    // broken PDFs. [[project_track_mimetype_gotcha]]
    const mimeHint = args.songId
        ? await readLibraryMimeType(db, args.songId)
        : undefined

    if (args.songId && !args.force) {
        const health = await getChartHealth(args.songId, mimeHint)
        if (
            health.status === "missing" ||
            health.status === "shortcut_unresolved"
        ) {
            return richError(
                "chart_unbindable",
                health.status === "missing"
                    ? `Chart '${args.songId}' has no renderable bytes (Storage and Drive both miss). Binding it would create a row that 404s in Perform mode.`
                    : `Chart '${args.songId}' resolves to an unembeddable Google Drive shortcut. Binding it would drop the chart from gig packets and 404 in Perform mode.`,
                {
                    songId: args.songId,
                    chartStatus: health.status,
                    reason:
                        "reason" in health ? health.reason : undefined,
                },
                "Heal the chart first (re-upload the bytes, or run reconcile_library to re-bond a shortcut to its target), or pass force: true to bind anyway.",
            )
        }
    }

    const { trackId, order } = await addTrack(db, {
        setlistId: args.setlistId,
        type,
        title: resolved.title,
        key: resolved.key,
        bpm: resolved.bpm,
        leadMusician: resolved.leadMusician,
        referenceLink: args.referenceLink,
        songId: args.songId,
        // The library catalog is keyed by Drive file id, so a song's id IS its
        // chart file id — bond it as the track's fileId so the chart renders.
        fileId: args.songId,
        fileName: resolved.fileName,
        mimeType: mimeHint,
        notes: args.notes,
        position: args.position,
        performer: args.performer,
        description: args.description,
        estimatedMinutes: args.estimatedMinutes,
        liturgyRef: args.liturgyRef,
        honors: args.honors,
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

    const result: AddTrackToSetlistOk = {
        ok: true,
        trackId,
        order,
        track: { id: trackId, ...trackData },
    }
    // C7I3-003: surface silent position clamping. addTrack treats any
    // position outside [0, existing.length] as "append" — without this
    // warning, callers who passed `position: 999` had no way to know
    // their row landed at the end.
    if (typeof args.position === "number" && args.position !== order) {
        result.warning = `position clamped from ${args.position} to ${order} (insert range is [0, ${order}] for the post-insert track count of ${order + 1})`
    }
    return result
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
    org: OrgId = DEFAULT_ORG_ID,
): Promise<
    { ok: true; track: Record<string, unknown> } | RichErrorEnvelope | ToolEnvelopeError
> {
    initAdmin()
    const db = getFirestore()

    const loaded = await loadEditableSetlist(db, args.setlistId, uid, org)
    if (!loaded.ok) return loaded

    // Task 7 (liturgy outlines Phase 3): registry-backed check BEFORE any
    // write. Guarded here (the MCP wrapper) rather than inside
    // server-tracks-write.ts's low-level `updateTrack` because that
    // function's return type (`WriteError | WriteRejection`) has no slot for
    // a RichErrorEnvelope with a preserved machine_code — mirrors the
    // existing pre-validate-in-the-wrapper pattern used for `patch.songId`
    // immediately below.
    const badLiturgyRef = liturgyRefGuard(args.patch.liturgyRef)
    if (badLiturgyRef) return badLiturgyRef

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
            return {
                title: song.title,
                fileName: song.fileName,
                mimeType: await readLibraryMimeType(db, songId),
            }
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
 * fileId, fileName, title, key, bpm (when syncMetadata = true, default).
 */
export async function swapChart(
    uid: string,
    args: SwapChartArgs,
    org: OrgId = DEFAULT_ORG_ID,
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

    const loaded = await loadEditableSetlist(db, args.setlistId, uid, org)
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
        // F-017 — sync tempo alongside key so a swap leaves a coherent row.
        if (newSong.bpm !== undefined) patch.bpm = newSong.bpm
    }

    const result = await updateTrack(
        db,
        args.setlistId,
        args.trackId,
        patch,
        async (songId) => {
            const song = await getSongById(songId)
            if (!song) return null
            return {
                title: song.title,
                fileName: song.fileName,
                mimeType: await readLibraryMimeType(db, songId),
            }
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
    org: OrgId = DEFAULT_ORG_ID,
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

    const loaded = await loadEditableSetlist(db, args.setlistId, uid, org)
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
            return {
                title: song.title,
                fileName: song.fileName,
                mimeType: await readLibraryMimeType(db, songId),
            }
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
    org: OrgId = DEFAULT_ORG_ID,
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

    const loaded = await loadEditableSetlist(db, args.setlistId, uid, org)
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
                bpm: song.bpm,
                lead: song.lead,
                fileName: song.fileName,
                // Stamp the denormalized mimeType cache at write time so the
                // bonded track routes to the correct Perform viewer (text/image
                // charts vs PDF) for non-leader viewers. Mirrors
                // add_track_to_setlist. [[project_track_mimetype_render_outage]]
                mimeType: await readLibraryMimeType(db, songId),
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
    org: OrgId = DEFAULT_ORG_ID,
): Promise<{ ok: true } | RichErrorEnvelope | ToolEnvelopeError> {
    initAdmin()
    const db = getFirestore()

    const loaded = await loadEditableSetlist(db, args.setlistId, uid, org)
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
    org: OrgId = DEFAULT_ORG_ID,
): Promise<{ ok: true } | RichErrorEnvelope | ToolEnvelopeError> {
    initAdmin()
    const db = getFirestore()

    const loaded = await loadEditableSetlist(db, args.setlistId, uid, org)
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
    org: OrgId = DEFAULT_ORG_ID,
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
        // v11-02-03: cross-tenant write wall — a caller may not delete another
        // org's setlist. Return setlist_not_found (not forbidden) BEFORE the
        // owner check so a cross-tenant caller never learns the doc exists or
        // who owns it. (delete_setlist doesn't use loadEditableSetlist — it owns
        // this transaction — so the guard is replicated here.)
        if (rowOrg(setlistData.orgId) !== org) {
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

// ─── recompute_setlist_track_count ──────────────────────────────────────────

export interface RecomputeSetlistTrackCountArgs {
    setlistId: string
}

export interface RecomputeSetlistTrackCountResult {
    ok: true
    setlistId: string
    declared: number
    actual: number
    /** Declared `songCount` (song-type subset, shown on the public landing). */
    declaredSongs: number
    /** Actual song-type track count recomputed from the subcollection. */
    actualSongs: number
    drifted: boolean
    written: boolean
}

/**
 * Cycle-7-fixes Lane 3 — admin-only one-shot to repair a stale denormalized
 * `setlists/{id}.trackCount` counter. Re-reads the actual `tracks/{*}` top-
 * level subcollection and writes the corrected count when drifted. Idempotent.
 *
 * Backstop for setlists outside the daily verify-chart-bond-health cron's
 * window (past services, drafts). Closes C7I4-002 root-cause repairs that
 * accumulated before the `/api/setlist/delete` HTTP cascade gap fix shipped.
 *
 * Admin-only: the underlying issue is data-hygiene and the operator should
 * confirm intent. band_leader bypass not extended — this tool can mask real
 * write-path bugs if called blindly across the catalog.
 */
export async function recomputeSetlistTrackCount(
    uid: string,
    args: RecomputeSetlistTrackCountArgs,
    org: OrgId = DEFAULT_ORG_ID,
): Promise<RecomputeSetlistTrackCountResult | RichErrorEnvelope> {
    if (!args.setlistId?.trim())
        return richError(
            "invalid_argument",
            "setlistId must be a non-empty string.",
            { field: "setlistId" },
        )

    initAdmin()
    const db = getFirestore()

    const role = await readUserRole(db, uid)
    if (role !== "admin") {
        return richError(
            "forbidden_role",
            "recompute_setlist_track_count is admin-only.",
            { callerRole: role ?? null, requiredRoles: ["admin"] },
            "Ask an admin to run the repair, or invoke the verify-chart-bond-health cron which auto-heals upcoming-published setlists.",
        )
    }

    const setlistRef = db.collection("setlists").doc(args.setlistId.trim())
    const snap = await setlistRef.get()
    if (!snap.exists) {
        return richError(
            "setlist_not_found",
            `Setlist '${args.setlistId}' was not found.`,
            { setlistId: args.setlistId },
            "Verify the id via list_setlists.",
        )
    }
    // v11-02-03: cross-tenant write wall — recompute mutates the setlist doc by
    // id, so deny when it belongs to another org (not-found, no existence leak).
    if (rowOrg(snap.data()?.orgId) !== org) {
        return richError(
            "setlist_not_found",
            `Setlist '${args.setlistId}' was not found.`,
            { setlistId: args.setlistId },
            "Verify the id via list_setlists.",
        )
    }
    const { recomputeTrackCount } = await import("@/lib/setlist-track-count")
    const result = await recomputeTrackCount(
        db,
        args.setlistId.trim(),
        snap.data() as Record<string, unknown>,
    )
    return {
        ok: true,
        setlistId: result.setlistId,
        declared: result.declared,
        actual: result.actual,
        declaredSongs: result.declaredSongs,
        actualSongs: result.actualSongs,
        drifted: result.drifted,
        written: result.written,
    }
}
