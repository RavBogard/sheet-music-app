// v70-07-01: server-callable setlist-write module. Extracted from the inline
// write logic in src/app/api/setlists/import/execute/route.ts so there is ONE
// server-side setlist-write path — consumed by v70-07's doc-import commit, the
// CSV import/execute route, and (per Daniel's MCP-workstream handoff) the MCP
// write tools.
//
// firebase-admin only — this is a server module. It does NOT use the client
// Firestore SDK or the v6.0 client-side applyEdit outbox; it writes directly
// via the Admin SDK (the same pattern import/execute already used).

import crypto from "crypto"

import { FieldValue, Timestamp } from "firebase-admin/firestore"

import { getFirestore, initAdmin } from "@/lib/firebase-admin"
import type { Setlist } from "@/types/models"

// ─── Types ───────────────────────────────────────────────────────────

export interface ServerSetlistTrackInput {
    type: 'song' | 'header'
    title: string
    key?: string
    /** "Vocal Lead" — stored on the track as `leadMusician`. */
    leadMusician?: string
    referenceLink?: string
    /** Bound chart — a library_index doc id. */
    fileId?: string
    fileName?: string
}

export interface CreateSetlistInput {
    name: string
    ownerId: string
    ownerName: string
    eventDate?: Date | string
    /** Maps to the setlist doc's `templateType` field. */
    serviceType?: Setlist['templateType']
    rabbi?: string
    tracks: ServerSetlistTrackInput[]
}

export interface CreateSetlistResult {
    setlistId: string
    trackCount: number
}

/** Metadata-only patch — does NOT touch tracks / trackCount / ownerId. */
export type SetlistMetadataPatch = Partial<{
    name: string
    eventDate: Date | string
    serviceType: Setlist['templateType']
    rabbi: string
    serviceNotes: string
}>

// ─── Helpers ─────────────────────────────────────────────────────────

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/

/** Date | ISO string → a Firestore Timestamp (firestoreTimestampSchema
 *  accepts Date / {seconds,nanoseconds} / string; a server-side Timestamp is
 *  the cleanest representation).
 *
 *  Date-only strings (`"2026-05-22"`) are coerced to LOCAL NOON on that
 *  calendar day. Cowork CF1 UAT (2026-05-15, §3.4) flagged that
 *  `new Date("2026-05-22")` parses as UTC midnight per ECMAScript spec —
 *  in CDT (UTC-5) that renders as "Thursday May 21", one day off the
 *  intended Friday May 22. Noon is the safest local anchor: a DST flip
 *  is ±1h around 2am, never near noon, so the calendar day is stable
 *  across the year. Datetimes with explicit time-of-day (`"2026-05-22T19:00"`)
 *  pass through unchanged.
 */
function toTimestamp(value: Date | string): Timestamp {
    if (typeof value === "string" && DATE_ONLY_RE.test(value)) {
        const [y, m, d] = value.split("-").map(Number)
        return Timestamp.fromDate(new Date(y, m - 1, d, 12, 0, 0, 0))
    }
    return Timestamp.fromDate(value instanceof Date ? value : new Date(value))
}

// ─── Create ──────────────────────────────────────────────────────────

/**
 * Create a setlist + its top-level tracks server-side. Writes the
 * `setlists/{id}` parent doc and one `tracks/{id}` doc per input track in a
 * SINGLE atomic Firestore batch — the Admin-SDK equivalent of
 * createSetlistService's client-side applyEdit fanout. One batch means the
 * whole setlist commits or nothing does (no partial-write window); a worship
 * setlist is well under the 500-write batch limit.
 */
export async function createSetlistServerSide(
    input: CreateSetlistInput,
): Promise<CreateSetlistResult> {
    if (!initAdmin()) {
        throw new Error(
            "Firebase Admin not initialized — cannot create setlist.",
        )
    }
    const db = getFirestore()

    const setlistId = crypto.randomUUID()
    // Parent doc carries denormalization markers only — top-level tracks/{id}
    // rows are seeded below. FieldValue.serverTimestamp() produces a proper
    // Firestore Timestamp so the first editor edit round-trips cleanly.
    const setlistPayload: Record<string, unknown> = {
        id: setlistId,
        name: input.name,
        date: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        trackCount: input.tracks.length,
        hydrated: true,
        ownerId: input.ownerId,
        ownerName: input.ownerName,
    }
    // Optional fields — written only when explicitly provided (NOT defaulted;
    // the CSV-import quirk of defaulting eventDate to serverTimestamp is not
    // carried into this shared module).
    if (input.eventDate !== undefined) {
        setlistPayload.eventDate = toTimestamp(input.eventDate)
    }
    if (input.serviceType !== undefined) {
        setlistPayload.templateType = input.serviceType
    }
    if (input.rabbi !== undefined) {
        setlistPayload.rabbi = input.rabbi
    }

    // One atomic batch: the parent setlists/{id} doc + every top-level
    // tracks/{id} seed. Either the whole setlist commits or nothing does.
    const batch = db.batch()
    batch.set(db.collection('setlists').doc(setlistId), setlistPayload)
    input.tracks.forEach((t, i) => {
        const trackId = crypto.randomUUID()
        const trackPayload: Record<string, unknown> = {
            id: trackId,
            setlistId,
            order: i,
            type: t.type ?? 'song',
            title: t.title,
        }
        if (t.key !== undefined) trackPayload.key = t.key
        if (t.leadMusician !== undefined) {
            trackPayload.leadMusician = t.leadMusician
        }
        if (t.referenceLink !== undefined) {
            trackPayload.referenceLink = t.referenceLink
        }
        if (t.fileId !== undefined) trackPayload.fileId = t.fileId
        if (t.fileName !== undefined) trackPayload.fileName = t.fileName
        batch.set(db.collection('tracks').doc(trackId), trackPayload)
    })
    await batch.commit()

    return { setlistId, trackCount: input.tracks.length }
}

// ─── Update ──────────────────────────────────────────────────────────

/**
 * Patch a setlist's metadata server-side. Metadata-ONLY — does not touch
 * `tracks/{id}` docs, `trackCount`, `ownerId`, or `hydrated`. No
 * version-precondition: the sole-admin app's silent-LWW-on-conflict posture
 * (v6.0 decision) makes server-side preconditions unnecessary here.
 */
export async function updateSetlistServerSide(
    setlistId: string,
    patch: SetlistMetadataPatch,
): Promise<void> {
    if (!initAdmin()) {
        throw new Error(
            "Firebase Admin not initialized — cannot update setlist.",
        )
    }
    const db = getFirestore()

    const mapped: Record<string, unknown> = {}
    if (patch.name !== undefined) mapped.name = patch.name
    if (patch.rabbi !== undefined) mapped.rabbi = patch.rabbi
    if (patch.serviceNotes !== undefined) {
        mapped.serviceNotes = patch.serviceNotes
    }
    if (patch.serviceType !== undefined) {
        mapped.templateType = patch.serviceType
    }
    if (patch.eventDate !== undefined) {
        mapped.eventDate = toTimestamp(patch.eventDate)
    }
    mapped.updatedAt = FieldValue.serverTimestamp()

    await db.collection('setlists').doc(setlistId).update(mapped)
}
