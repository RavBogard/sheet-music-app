import { generatePrintPdf, type PrintRequest } from "@/lib/print-pipeline"
import { getTracksForSetlist } from "@/lib/server-tracks"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"
import { rowOrg } from "@/lib/org/membership"
import { pdfI18nForOrg } from "@/lib/pdf/pdf-i18n-server"
import { bookTitle } from "@/lib/books/titles"
import { logger } from "@/lib/logger"
import { TRANSPOSITION_SEMITONES, TRANSPOSITIONS, type Transposition } from "@/lib/gig/model"
import type { OrgId } from "@/lib/org/types"
import type { SetlistTrack } from "@/types/models"

/**
 * BET-5 (TF-09): a sub's part. generate_gig_packet with a `contactId` builds
 * the setlist's packet transposed for that contact's `transposition`, the same
 * pipeline the personal print uses for a signed-in musician. It returns a
 * download link for the leader; nothing is sent to anyone.
 */

type DB = FirebaseFirestore.Firestore

export interface ContactPartInfo {
    contactId: string
    name: string
    instrument?: string
    transposition: Transposition
    /** Semitones from concert pitch to the written part. */
    semitones: number
}

export interface ContactPartPdf {
    bytes: Uint8Array
    part: ContactPartInfo
    trackCount: number
    appendedCount: number
    transposedCount: number
    omitted: Array<{ title: string; fileId?: string; reason: string }>
}

function contactNotFound(contactId: string): RichErrorEnvelope {
    return richError(
        "contact_not_found",
        `Contact '${contactId}' was not found.`,
        { contactId },
        "Find it with list_contacts or find_contact.",
    )
}

/** The contact's part, or a rich error. A contact in another tenant reads as missing. */
export async function readContactPart(db: DB, contactId: string, org: OrgId): Promise<ContactPartInfo | RichErrorEnvelope> {
    const snap = await db.collection("contacts").doc(contactId).get()
    const d = snap.exists ? (snap.data() as Record<string, unknown>) : null
    if (!d || d.orgId !== org) return contactNotFound(contactId)
    const raw = typeof d.transposition === "string" ? d.transposition : null
    if (!raw || !(TRANSPOSITIONS as readonly string[]).includes(raw)) {
        return richError(
            "contact_has_no_transposition",
            `Contact '${contactId}' has no part on record.`,
            { contactId },
            "Ask which part they read (C, Bb, Eb, F or bass), then create_contact again with the same email and that transposition.",
        )
    }
    const transposition = raw as Transposition
    const part: ContactPartInfo = {
        contactId,
        name: typeof d.name === "string" && d.name ? d.name : "Musician",
        transposition,
        semitones: TRANSPOSITION_SEMITONES[transposition],
    }
    if (typeof d.instrument === "string" && d.instrument) part.instrument = d.instrument
    return part
}

/** Build the transposed packet for one contact. The caller has checked the setlist's tenant. */
export async function buildContactPartPdf(
    db: DB,
    setlistId: string,
    setlist: Record<string, unknown>,
    part: ContactPartInfo,
): Promise<ContactPartPdf> {
    const org = rowOrg(setlist.orgId)
    const tracks = (await getTracksForSetlist(db, setlistId, setlist)) as SetlistTrack[]
    const eventDate = setlist.eventDate as { toDate?: () => Date } | undefined
    const req: PrintRequest = {
        title: typeof setlist.name === "string" && setlist.name ? setlist.name : "Setlist",
        date: eventDate?.toDate?.()?.toISOString?.() || (typeof setlist.date === "string" ? setlist.date : ""),
        musicianName: part.instrument ? `${part.name} (${part.instrument})` : part.name,
        bookTitle: bookTitle(typeof setlist.book === "string" ? setlist.book : undefined),
        org,
        tracks: tracks.map((t) => ({
            title: t.title,
            key: t.key || "",
            notes: t.notes || "",
            leadMusician: t.leadMusician || "",
            fileId: t.fileId,
            fileName: t.fileName,
            mimeType: t.mimeType,
            type: t.type,
            performer: t.performer,
            estimatedMinutes: t.estimatedMinutes,
            description: t.description,
            liturgyRef: t.liturgyRef,
            honors: t.honors,
            transposition: (t.transposition || 0) + part.semitones,
        })),
    }
    const i18n = await pdfI18nForOrg(org)
    const result = await generatePrintPdf(req, undefined, i18n)
    logger.info("[mcp] contact part generated", {
        setlistId,
        contactId: part.contactId,
        transposition: part.transposition,
        appended: result.stats.appendedTracks,
        transposed: result.stats.transposedTracks,
    })
    return {
        bytes: result.pdf,
        part,
        trackCount: tracks.length,
        appendedCount: result.stats.appendedTracks,
        transposedCount: result.stats.transposedTracks,
        omitted: result.stats.omittedTracks.map((o) => ({
            title: o.title,
            ...(o.fileId ? { fileId: o.fileId } : {}),
            reason: o.reason,
        })),
    }
}
