import crypto from "crypto"
import { PDFDocument } from "pdf-lib"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { checkUserRateLimit } from "@/lib/rate-limit"
import { getTracksForSetlist } from "@/lib/server-tracks"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/errors"
import { renderServiceSheetPdf, type ServiceSheetTrack } from "@/lib/pdf/service-sheet-pdf"
import { getRegistryEntry } from "@/lib/books/registry"
import { logger } from "@/lib/logger"
import { readLeaderRole, gigPacketBucket } from "./library-download"

/**
 * MCP generate_service_sheet tool (liturgy-outlines Phase 1-3, Task 11).
 *
 * The counterpart to generate_gig_packet: where the gig packet is the band's
 * charts, this is the rabbi's printed order of service — page references
 * into that day's siddur/machzor, who leads each moment, and named honors.
 * Deliberately text-only (renderServiceSheetPdf), no charts/keys/BPM.
 *
 * Mirrors generateGigPacket in library-download.ts wherever the shape is
 * shared: same rate-limit gate + trusted-leader bypass (readLeaderRole,
 * exported from library-download.ts for this reuse), same bucket resolver
 * (gigPacketBucket, also exported from there), same getTracksForSetlist
 * performance-ordered read, same Storage-write + v4-signed-URL pattern, and
 * the same `setlist_not_found` machine code the read tools use. Deliberate
 * differences: no size cap and no missing-charts appendix (the sheet is
 * text-only and small), and a distinct storage prefix
 * (`service-sheets/{setlistId}/...` vs `gig-packets/{setlistId}/...`).
 *
 * Generation must never be blocked by missing data: a setlist with no
 * `book`, or rows with no `liturgyRef` / malformed `liturgyRef` / `honors`,
 * still produces a sheet — the field helpers below drop anything malformed
 * rather than throwing.
 */

/** Matches GIG_PACKET_SIGNED_URL_TTL_MS in library-download.ts — same
 *  10-minute window, kept as a separate constant so the two tools' TTLs
 *  can diverge independently if a future need arises. */
const SERVICE_SHEET_SIGNED_URL_TTL_MS = 10 * 60 * 1000

const SERVICE_SHEET_STORAGE_PREFIX = "service-sheets"

function serviceSheetStoragePath(setlistId: string): string {
    const nonce = crypto.randomUUID().slice(0, 8)
    return `${SERVICE_SHEET_STORAGE_PREFIX}/${setlistId}/${Date.now()}-${nonce}.pdf`
}

function toStringOrUndef(v: unknown): string | undefined {
    return typeof v === "string" && v.length > 0 ? v : undefined
}

/**
 * The header's service date.
 *
 * `eventDate` is persisted as a Firestore Timestamp on every write path
 * (create_setlist / update_setlist / clone_setlist all run the string through
 * parseEventDate first), so the previous `typeof eventDate === "string"` test
 * was ALWAYS false and the sheet always printed with no date at all — last
 * week's sheet and this week's were indistinguishable on the lectern. Same
 * Timestamp-unwrap shape as `str()` in setlist-write.ts's get-back echo, but
 * formatted for a human reading it aloud rather than as an ISO string:
 * "September 4, 2026", matching setlist-publish.ts's existing en-US long-date
 * precedent. Pinned to America/Chicago (the CRC service locale, and the zone
 * parseEventDate anchors to) so a UTC-hosted serverless run can't print the
 * neighbouring day. A legacy string value is passed through verbatim.
 */
function toEventDateLabel(v: unknown): string | undefined {
    if (typeof v === "string") return v.length > 0 ? v : undefined
    if (
        v &&
        typeof v === "object" &&
        "toDate" in v &&
        typeof (v as { toDate: unknown }).toDate === "function"
    ) {
        try {
            return (v as { toDate(): Date }).toDate().toLocaleDateString("en-US", {
                timeZone: "America/Chicago",
                month: "long",
                day: "numeric",
                year: "numeric",
            })
        } catch {
            return undefined
        }
    }
    return undefined
}

function toLiturgyRef(v: unknown): ServiceSheetTrack["liturgyRef"] {
    if (!v || typeof v !== "object") return undefined
    const r = v as Record<string, unknown>
    if (typeof r.book !== "string" || typeof r.folio !== "number") return undefined
    return {
        book: r.book,
        folio: r.folio,
        unitId: typeof r.unitId === "string" ? r.unitId : undefined,
    }
}

function toHonors(v: unknown): ServiceSheetTrack["honors"] {
    if (!Array.isArray(v)) return undefined
    const out: Array<{ name: string; note?: string }> = []
    for (const item of v) {
        if (!item || typeof item !== "object") continue
        const r = item as Record<string, unknown>
        if (typeof r.name !== "string" || !r.name) continue
        out.push({
            name: r.name,
            note: typeof r.note === "string" ? r.note : undefined,
        })
    }
    return out.length > 0 ? out : undefined
}

export interface GenerateServiceSheetArgs {
    setlistId: string
}

export interface GenerateServiceSheetOk {
    ok: true
    /** Short-lived (10-minute) v4 signed read URL to the sheet PDF in
     *  Firebase Storage. Re-call this tool to mint a fresh URL after expiry. */
    downloadUrl: string
    /** ISO timestamp at which `downloadUrl` stops working. */
    expiresAt: string
    /** Storage object path. Fresh per call — each generate_service_sheet
     *  call writes a new nonce'd blob. */
    storagePath: string
    sizeBytes: number
    pageCount: number
    setlistName: string
    trackCount: number
}

export async function generateServiceSheet(
    uid: string,
    args: GenerateServiceSheetArgs,
): Promise<GenerateServiceSheetOk | RichErrorEnvelope> {
    if (!args.setlistId?.trim()) {
        return richError(
            "invalid_argument",
            "setlistId must be a non-empty string.",
            { field: "setlistId" },
        )
    }

    initAdmin()
    const db = getFirestore()

    const role = await readLeaderRole(db, uid)
    const bypass = role === "admin" || role === "band_leader"

    const limited = await checkUserRateLimit(uid, "api", { bypass })
    if (limited) {
        return richError(
            "rate_limited",
            limited.error,
            undefined,
            "Retry after the cooldown window.",
        )
    }

    const setlistDoc = await db.collection("setlists").doc(args.setlistId).get()
    if (!setlistDoc.exists) {
        return richError(
            "setlist_not_found",
            "Setlist not found",
            { setlistId: args.setlistId },
            "Confirm the setlistId with list_setlists; pass the `id` field exactly.",
        )
    }
    const setlistData = setlistDoc.data() as Record<string, unknown>
    const setlistName =
        (typeof setlistData.name === "string" && setlistData.name) || args.setlistId
    const eventDate = toEventDateLabel(setlistData.eventDate)
    const rabbi = typeof setlistData.rabbi === "string" ? setlistData.rabbi : undefined
    const book = typeof setlistData.book === "string" ? setlistData.book : undefined
    const bookTitle = book ? getRegistryEntry(book)?.title : undefined

    const tracks = await getTracksForSetlist(db, args.setlistId, setlistData)

    const bytes = await renderServiceSheetPdf({
        setlistName,
        eventDate,
        rabbi,
        book,
        bookTitle,
        tracks: tracks.map((t) => {
            const row = t as unknown as Record<string, unknown>
            return {
                id: t.id,
                title: toStringOrUndef(row.title),
                type: toStringOrUndef(row.type),
                performer: toStringOrUndef(row.performer),
                leadMusician: toStringOrUndef(row.leadMusician),
                description: toStringOrUndef(row.description),
                liturgyRef: toLiturgyRef(row.liturgyRef),
                honors: toHonors(row.honors),
            } satisfies ServiceSheetTrack
        }),
    })

    const pageCount = (await PDFDocument.load(bytes)).getPageCount()
    const buffer = Buffer.from(bytes)
    const sizeBytes = buffer.byteLength

    const bucket = gigPacketBucket()
    const path = serviceSheetStoragePath(args.setlistId)
    const file = bucket.file(path)
    const expiresAtMs = Date.now() + SERVICE_SHEET_SIGNED_URL_TTL_MS

    try {
        await file.save(buffer, {
            contentType: "application/pdf",
            metadata: {
                contentType: "application/pdf",
                metadata: {
                    setlistId: args.setlistId,
                    setlistName,
                    generatedBy: uid,
                    generatedAt: new Date().toISOString(),
                },
            },
        })
    } catch (err) {
        logger.warn("[mcp] generate_service_sheet storage write failed", {
            setlistId: args.setlistId,
            path,
            err: err instanceof Error ? err.message : String(err),
        })
        return richError(
            "storage_upload_failed",
            `Could not write service sheet to Storage: ${err instanceof Error ? err.message : err}`,
            { storagePath: path, errorCode: 502 },
            "Retry generate_service_sheet. If the failure persists the Storage bucket may be misconfigured — surface the storagePath to an admin.",
        )
    }

    let downloadUrl: string
    try {
        const [url] = await file.getSignedUrl({
            action: "read",
            version: "v4",
            expires: expiresAtMs,
        })
        downloadUrl = url
    } catch (err) {
        logger.warn("[mcp] generate_service_sheet signing failed", {
            setlistId: args.setlistId,
            path,
            err: err instanceof Error ? err.message : String(err),
        })
        return richError(
            "storage_signing_failed",
            `Could not mint signed download URL: ${err instanceof Error ? err.message : err}`,
            { storagePath: path, errorCode: 502 },
            "The sheet bytes exist at storagePath; an admin can fetch them via the Firebase console or retry the tool.",
        )
    }

    logger.info("[mcp] service sheet generated", {
        setlistId: args.setlistId,
        size: sizeBytes,
        pages: pageCount,
        tracks: tracks.length,
        path,
    })

    return {
        ok: true,
        downloadUrl,
        expiresAt: new Date(expiresAtMs).toISOString(),
        storagePath: path,
        sizeBytes,
        pageCount,
        setlistName,
        trackCount: tracks.length,
    }
}
