import crypto from "crypto"
import { FieldValue, Timestamp } from "firebase-admin/firestore"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import {
    assertEditor,
    readUserRole,
} from "@/lib/mcp/server-tracks-write"
import { checkUserRateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"
import {
    richError,
    type RichErrorEnvelope,
} from "@/lib/mcp/error-envelopes"
import { isTestSetlist } from "@/types/models"
import { isSongType } from "@/lib/setlist-track-count"
import {
    auditBondedRows,
    detectOccasionTokens,
    toBondReviewRows,
    type BondReviewRow,
} from "./chart-bond-audit"

/**
 * GAP-002 (cycle-2) — clone an existing setlist into a brand new one.
 *
 * Daniel's authoring flow is 90% "clone last week + tweak a few songs", and
 * the agent had no first-class tool for it pre-fix — every clone required a
 * full get_setlist + create_setlist + N bulk_add_tracks round trip, eating
 * dozens of MCP calls per weekly service prep.
 *
 * This tool reads the source setlist + its tracks atomically, writes a new
 * setlist owned by the caller with copied metadata + tracks (fresh trackIds,
 * `version: 1` on every doc, contiguous `order` from 0), and returns the
 * new setlistId. Chart bonds (`fileId`/`fileName`/`songId`) are copied
 * verbatim so the new rows render charts without re-resolution.
 *
 * Role gate: admin OR band_leader (same as create_setlist). Trusted-leader
 * rate-limit bypass applies per [[feedback_admin_rate_limit_bypass]].
 */

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Coerce a Date / ISO string into a Firestore Timestamp the same way the
 * shared setlist-write module does. Date-only strings anchor at LOCAL NOON
 * to dodge UTC-vs-local-day drift (cowork CF1 §3.4).
 */
function toTimestamp(value: Date | string): Timestamp {
    if (typeof value === "string" && DATE_ONLY_RE.test(value)) {
        const [y, m, d] = value.split("-").map(Number)
        return Timestamp.fromDate(new Date(y, m - 1, d, 12, 0, 0, 0))
    }
    return Timestamp.fromDate(value instanceof Date ? value : new Date(value))
}

/** Best-effort display name for ownerName denormalization (mirrors setlist-write.ts). */
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

export interface CloneSetlistArgs {
    /** Source setlist id to clone. */
    sourceSetlistId: string
    /** Name for the new setlist. Default: "Copy of <source.name>". */
    newName?: string
    /**
     * ISO date for the new event. Default: omitted entirely (no eventDate
     * on the clone — the rabbi typically sets the new date as part of the
     * tweak step). Pass `null` explicitly to be explicit about no-date.
     */
    newEventDate?: string | null
    /**
     * Whether to copy the source's `serviceNotes` onto the clone. Default
     * `true` — preserves week-over-week pastoral notes that travel with
     * the service template.
     */
    copyServiceNotes?: boolean
}

/** Cloned track row carrying occasion-specific tokens that may be stale. */
export interface StaleMetadataRow {
    trackId: string
    title: string
    /** Parsha/holiday/date tokens found in the title (see detectOccasionTokens). */
    matchedTokens: string[]
}

/**
 * setlist-fixes Lane B (Bug 4 / UX-7) — non-blocking staleness hints surfaced
 * on a clone. The clone still copies everything verbatim; this is advisory.
 */
export interface StaleMetadataCandidates {
    /** Cloned rows whose titles look occasion-specific (e.g. "Torah Service — Parashat Emor"). */
    rows: StaleMetadataRow[]
    /** True iff the clone's name carries an occasion/date token. */
    nameFlagged: boolean
    nameTokens: string[]
    /** True iff the copied serviceNotes carry an occasion/date token. */
    serviceNotesFlagged: boolean
    serviceNotesTokens: string[]
}

export interface CloneSetlistResult {
    ok: true
    setlistId: string
    sourceSetlistId: string
    trackCount: number
    ownerId: string
    ownerName: string
    /** Always 1 — the clone is a fresh doc, not a forked version. */
    version: 1
    /**
     * setlist-fixes Lane B (Bug 1) — number of cloned rows whose song title
     * diverges from the bonded chart's filename (clones inherit bonds verbatim,
     * so a bad source bond propagates silently). Non-blocking; prompt Daniel to
     * run `review_chart_bonds` post-clone to walk the flagged rows. 0 when no
     * bonded row looks mismatched (or the audit read failed — fail-soft).
     */
    bondReviewCount: number
    /**
     * FU-c12-4 — the rows behind {@link bondReviewCount}. One entry per cloned
     * row flagged as a likely title/filename mismatch, so
     * `bondReviewRows.length === bondReviewCount`. Empty array when no mismatch
     * (or the audit read failed — fail-soft). Each entry carries the clone-side
     * `position` + fresh `trackId` so the caller can target a `swap_chart` /
     * `review_chart_bonds` follow-up directly without re-fetching the clone.
     */
    bondReviewRows: BondReviewRow[]
    /**
     * setlist-fixes Lane B (Bug 4 / UX-7) — advisory list of metadata that may
     * be stale from the source's occasion (parsha/holiday/date tokens in track
     * titles, the clone name, or the copied serviceNotes). The clone still
     * wrote everything verbatim; this just flags what to double-check.
     */
    staleMetadataCandidates: StaleMetadataCandidates
}

/** Track-row fields safe to copy verbatim from source → clone. */
const COPYABLE_TRACK_FIELDS = [
    "type",
    "title",
    "key",
    "bpm",
    "leadMusician",
    "referenceLink",
    "notes",
    "songId",
    "fileId",
    "fileName",
] as const

export async function cloneSetlist(
    uid: string,
    args: CloneSetlistArgs,
): Promise<CloneSetlistResult | RichErrorEnvelope> {
    if (!args.sourceSetlistId?.trim()) {
        return richError(
            "invalid_argument",
            "sourceSetlistId is required.",
            { sourceSetlistId: args.sourceSetlistId ?? null },
            "Pass a non-empty sourceSetlistId from list_setlists.",
        )
    }

    initAdmin()
    const db = getFirestore()

    // Role gate — admin OR band_leader. Mirrors create_setlist.
    const editor = await assertEditor(db, uid)
    if (!editor.ok) return editor

    // Trusted-leader rate-limit bypass per
    // [[feedback_admin_rate_limit_bypass]]. assertEditor already proved the
    // role; readUserRole is the cheap canonical fetch for the bypass flag.
    const role = await readUserRole(db, uid)
    const bypass = role === "admin" || role === "band_leader"
    const limited = await checkUserRateLimit(uid, "api", { bypass })
    if (limited)
        return richError("rate_limited", limited.error, undefined, undefined)

    const sourceRef = db.collection("setlists").doc(args.sourceSetlistId)
    const sourceSnap = await sourceRef.get()
    if (!sourceSnap.exists) {
        return richError(
            "setlist_not_found",
            `Source setlist '${args.sourceSetlistId}' was not found.`,
            { sourceSetlistId: args.sourceSetlistId },
            "Verify the id via list_setlists.",
        )
    }
    const sourceData = sourceSnap.data() as Record<string, unknown>

    const sourceTracksSnap = await db
        .collection("tracks")
        .where("setlistId", "==", args.sourceSetlistId)
        .get()
    const sourceTracks = sourceTracksSnap.docs
        .map((d) => {
            const data = d.data() as Record<string, unknown>
            const order = typeof data.order === "number" ? data.order : 0
            return { id: d.id, data, order }
        })
        .sort((a, b) => a.order - b.order)

    const ownerName = await ownerNameFor(db, uid)
    const newSetlistId = crypto.randomUUID()
    const copyServiceNotes = args.copyServiceNotes !== false

    const sourceName =
        typeof sourceData.name === "string" ? sourceData.name : "Untitled"
    const newName = args.newName?.trim()
        ? args.newName.trim()
        : `Copy of ${sourceName}`

    // Build the new setlist parent doc. ownerId + version + lastModifiedAt
    // reset on a clone — the clone is a fresh resource, not a continuation
    // of the source's history.
    // C11M1-001: songCount (song-type subset, rendered on /perform landing)
    // must be denormalized on every setlist write — `setlists/{id}.songCount`
    // was previously absent on cloned setlists, leaving the landing card stuck
    // at "0 songs" until the in-app client-side reconciler ran (which never
    // runs for setlists authored end-to-end through Claude Desktop, the
    // primary authoring surface per [[user_mcp_is_primary_author_workflow]]).
    const sourceSongCount = sourceTracks.filter((t) =>
        isSongType((t.data as { type?: unknown }).type),
    ).length
    const setlistPayload: Record<string, unknown> = {
        id: newSetlistId,
        name: newName,
        date: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        trackCount: sourceTracks.length,
        songCount: sourceSongCount,
        hydrated: true,
        ownerId: uid,
        ownerName,
        version: 1,
        lastModifiedAt: new Date().toISOString(),
        lastModifiedBy: uid,
    }

    // eventDate handling: explicit override > omit. We intentionally do NOT
    // copy the source's eventDate by default — week-over-week clones almost
    // always need a new date, and silently inheriting last week's calendar
    // would land on the wrong Friday.
    if (args.newEventDate !== undefined && args.newEventDate !== null) {
        if (!args.newEventDate.trim()) {
            return richError(
                "invalid_argument",
                "newEventDate must be a non-empty ISO date.",
                { newEventDate: args.newEventDate },
                "Pass a YYYY-MM-DD or full ISO date string, or omit to skip the override.",
            )
        }
        if (Number.isNaN(Date.parse(args.newEventDate))) {
            return richError(
                "invalid_argument",
                `newEventDate must be an ISO date string (got "${args.newEventDate}").`,
                { newEventDate: args.newEventDate },
                "Pass a YYYY-MM-DD or full ISO date string.",
            )
        }
        setlistPayload.eventDate = toTimestamp(args.newEventDate)
    }

    // Template + rabbi travel with the clone — they're attributes of the
    // service kind, not the calendar date.
    if (typeof sourceData.templateType === "string") {
        setlistPayload.templateType = sourceData.templateType
    }
    if (typeof sourceData.rabbi === "string") {
        setlistPayload.rabbi = sourceData.rabbi
    }
    if (copyServiceNotes && typeof sourceData.serviceNotes === "string") {
        setlistPayload.serviceNotes = sourceData.serviceNotes
    }

    // C9I5 §6.2 — writer-side isTest stamp. clone_setlist bypasses
    // createSetlistServerSide (it writes the parent doc via a raw batch.set),
    // so it never inherited the create-time isTest classification. A clone is a
    // test artifact when EITHER (a) the source setlist was already isTest — a
    // test fixture cloned stays a fixture even if renamed cleanly — OR (b) the
    // new name classifies as test via the shared isTestSetlist heuristic
    // (covers the un-bracketed `c<N>i<N>-` / `test-` / `-CLONE-` conventions).
    // Without this, admin-owned test clones leaked into the public /perform
    // listing and escaped cleanup_all_test_data (cross-confirmed C9I1-008 +
    // C9I2-003 + i5). Only stamp when true — real clones keep the field absent.
    if (
        sourceData.isTest === true ||
        isTestSetlist({ name: newName, ownerId: uid })
    ) {
        setlistPayload.isTest = true
    }

    // Carry the denormalized fileIds[] over so the client renders charts
    // before the SetlistGridHydrator reconciler runs. Dedupe defensively
    // (source could be drifted) — same shape arrayUnion would produce.
    const canonicalFileIds = new Set<string>()
    for (const t of sourceTracks) {
        const fid = t.data.fileId
        if (typeof fid === "string" && fid) canonicalFileIds.add(fid)
    }
    if (canonicalFileIds.size > 0) {
        setlistPayload.fileIds = [...canonicalFileIds]
    }

    // Atomic batch — parent + every track in one commit, same shape
    // createSetlistServerSide uses. A typical weekly setlist is well under
    // the 500-write batch limit.
    const batch = db.batch()
    batch.set(db.collection("setlists").doc(newSetlistId), setlistPayload)

    const nowIso = new Date().toISOString()
    const newTrackIds: string[] = []
    sourceTracks.forEach((src, i) => {
        const newTrackId = crypto.randomUUID()
        newTrackIds.push(newTrackId)
        const payload: Record<string, unknown> = {
            id: newTrackId,
            setlistId: newSetlistId,
            order: i,
            version: 1,
            lastModifiedAt: nowIso,
        }
        for (const field of COPYABLE_TRACK_FIELDS) {
            const v = src.data[field]
            if (v !== undefined && v !== null) {
                payload[field] = v
            }
        }
        // Defensive: every track needs at least a title + type for the
        // editor to render it. Source rows missing one are pathological —
        // surface defaults rather than write a broken row.
        if (typeof payload.title !== "string") payload.title = ""
        if (typeof payload.type !== "string") payload.type = "song"
        batch.set(db.collection("tracks").doc(newTrackId), payload)
    })

    await batch.commit()
    logger.info("[mcp] clone_setlist committed", {
        sourceSetlistId: args.sourceSetlistId,
        newSetlistId,
        trackCount: sourceTracks.length,
        copiedFileIds: canonicalFileIds.size,
        bypass,
    })

    // setlist-fixes Lane B — additive, advisory reports computed AFTER the
    // commit so a failed audit never blocks the clone write. Bond review reuses
    // the shared title-vs-filename detector; staleMetadata flags occasion tokens
    // that travelled with the verbatim copy.
    const titleByIndex = sourceTracks.map((src) =>
        typeof src.data.title === "string" ? src.data.title : "",
    )

    let bondReviewCount = 0
    let bondReviewRows: BondReviewRow[] = []
    try {
        const bondedRows = sourceTracks
            .map((src, i) => ({
                trackId: newTrackIds[i],
                title: titleByIndex[i],
                fileId: typeof src.data.fileId === "string" ? src.data.fileId : "",
            }))
            .filter((b) => b.fileId)
        const audit = await auditBondedRows(db, bondedRows)
        bondReviewCount = audit.mismatchCount
        // newTrackIds[i] is the clone row at `order: i` (see batch loop above),
        // so the index IS the position the caller targets in the new setlist.
        const positionByTrackId = new Map(newTrackIds.map((id, i) => [id, i]))
        bondReviewRows = toBondReviewRows(audit, positionByTrackId)
    } catch (err) {
        logger.warn("[mcp] clone_setlist bond audit failed (fail-soft)", {
            newSetlistId,
            err: err instanceof Error ? err.message : String(err),
        })
    }

    const staleRows: StaleMetadataRow[] = []
    sourceTracks.forEach((_src, i) => {
        const title = titleByIndex[i]
        const matchedTokens = detectOccasionTokens(title)
        if (matchedTokens.length > 0) {
            staleRows.push({ trackId: newTrackIds[i], title, matchedTokens })
        }
    })
    const nameTokens = detectOccasionTokens(newName)
    const serviceNotesText =
        typeof setlistPayload.serviceNotes === "string"
            ? setlistPayload.serviceNotes
            : ""
    const serviceNotesTokens = detectOccasionTokens(serviceNotesText)

    return {
        ok: true,
        setlistId: newSetlistId,
        sourceSetlistId: args.sourceSetlistId,
        trackCount: sourceTracks.length,
        ownerId: uid,
        ownerName,
        version: 1,
        bondReviewCount,
        bondReviewRows,
        staleMetadataCandidates: {
            rows: staleRows,
            nameFlagged: nameTokens.length > 0,
            nameTokens,
            serviceNotesFlagged: serviceNotesTokens.length > 0,
            serviceNotesTokens,
        },
    }
}
