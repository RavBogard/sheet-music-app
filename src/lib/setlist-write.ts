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

import { FieldValue } from "firebase-admin/firestore"

import { getFirestore, initAdmin } from "@/lib/firebase-admin"
import {
    readLastModifiedAt,
    readVersion,
    staleVersionEnvelope,
    type StaleVersionEnvelope,
} from "@/lib/mcp/error-envelopes"
import { parseEventDate as toTimestamp } from "@/lib/parse-event-date"
import { isSongType } from "@/lib/setlist-track-count"
import { isTestSetlist, type Setlist } from "@/types/models"

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
    /**
     * Cycle-5 C5A-003 — optional explicit `isTest:true` override. When set,
     * the doc lands with `isTest:true` regardless of `isTestSetlist()`'s
     * heuristic (which only fires on `test-` ownerId or `[TEST/CYCLE/CF]`
     * name prefixes). Pass from MCP `create_setlist({isTest:true})` when
     * test traffic owns a real-looking name like "test-rehearsal" so the
     * doc still drops out of the /perform public listing. `false` / omitted
     * falls back to the heuristic — the default path stays unchanged.
     */
    isTest?: boolean
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
//
// eventDate parsing delegates to `parseEventDate` (cycle-12 FU-c12-2),
// which interprets naive datetime strings as America/Chicago wall-clock —
// the locale every CRC service runs in. The previous in-line helper fell
// through to `new Date(value)`, which on Vercel UTC parsed naive inputs as
// UTC and corrupted the wall-clock intent (cd2010f4 exemplar:
// `"2026-05-30T10:00"` for 10am Saturday stored as 10am UTC = 5am CDT).

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
    // C11M1-001: denormalize songCount alongside trackCount on every parent
    // write. ServerSetlistTrackInput's `type` is `'song' | 'header'`, but
    // older CSV/import callers may omit it — isSongType treats undefined as
    // song, matching the rule used across the codebase. Critical for CSV
    // import (`/api/setlists/import/execute`) so freshly-imported setlists
    // land with the correct landing-card song count, not "0 songs · N items".
    const seedSongCount = input.tracks.filter((t) => isSongType(t.type)).length
    const setlistPayload: Record<string, unknown> = {
        id: setlistId,
        name: input.name,
        date: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        trackCount: input.tracks.length,
        songCount: seedSongCount,
        hydrated: true,
        ownerId: input.ownerId,
        ownerName: input.ownerName,
        // W-04 Plan 01: stamp initial version + lastModifiedAt so the
        // optimistic-concurrency plumbing has values to compare against
        // from doc-creation time.
        version: 1,
        lastModifiedAt: new Date().toISOString(),
        lastModifiedBy: input.ownerId,
        // Cycle-2 SEC-004: classify test setlists at write time so
        // /perform's public listing can filter them out without a name-
        // prefix heuristic in the read path. Always written (never
        // undefined) so the filter `where isTest == false` is sound for
        // every doc going forward.
        //
        // Cycle-5 C5A-003: callers may pass an explicit `isTest:true` to
        // override the heuristic when test traffic owns a real-looking name
        // (`test-rehearsal`, etc). The explicit value wins; `false` /
        // omitted falls back to the heuristic.
        isTest:
            input.isTest === true
                ? true
                : isTestSetlist({ name: input.name, ownerId: input.ownerId }),
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
    const nowIso = new Date().toISOString()
    input.tracks.forEach((t, i) => {
        const trackId = crypto.randomUUID()
        const trackPayload: Record<string, unknown> = {
            id: trackId,
            setlistId,
            order: i,
            type: t.type ?? 'song',
            title: t.title,
            // W-04 Plan 01: every track starts at version 1.
            version: 1,
            lastModifiedAt: nowIso,
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

export type UpdateSetlistResult =
    | { ok: true }
    | { ok: false; error: "setlist_not_found" }
    | { ok: false; error: "stale_version"; envelope: StaleVersionEnvelope }

/**
 * Patch a setlist's metadata server-side. Metadata-ONLY — does not touch
 * `tracks/{id}` docs, `trackCount`, `ownerId`, or `hydrated`.
 *
 * W-04 Plan 02: optional `lastSeenVersion` gate. When supplied, the patch
 * runs inside a Firestore transaction so the version check + write are
 * atomic. Omit to preserve last-writer-wins behavior (backward-compat for
 * pre-W-04 callers — CSV import, doc import, the in-app editor's silent-
 * LWW path from v6.0).
 */
export async function updateSetlistServerSide(
    setlistId: string,
    patch: SetlistMetadataPatch,
    lastSeenVersion?: number,
): Promise<UpdateSetlistResult> {
    if (!initAdmin()) {
        throw new Error(
            "Firebase Admin not initialized — cannot update setlist.",
        )
    }
    const db = getFirestore()
    const setlistRef = db.collection("setlists").doc(setlistId)

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
    mapped.version = FieldValue.increment(1)
    mapped.lastModifiedAt = new Date().toISOString()

    // Fast path for pre-W-04 callers: skip the tx round-trip when no
    // version gate was requested. Behavior identical to pre-Plan-02.
    if (lastSeenVersion === undefined) {
        await setlistRef.update(mapped)
        return { ok: true }
    }

    return db.runTransaction<UpdateSetlistResult>(async (tx) => {
        const snap = await tx.get(setlistRef)
        if (!snap.exists) {
            return { ok: false, error: "setlist_not_found" }
        }
        const data = snap.data() as Record<string, unknown>
        const currentVersion = readVersion(data)
        if (currentVersion !== lastSeenVersion) {
            return {
                ok: false,
                error: "stale_version",
                envelope: staleVersionEnvelope({
                    resource: "setlist",
                    currentVersion,
                    lastSeenVersion,
                    lastModifiedBy: data.lastModifiedBy as string | undefined,
                    lastModifiedAt: readLastModifiedAt(data),
                }),
            }
        }
        tx.update(setlistRef, mapped)
        return { ok: true }
    })
}
