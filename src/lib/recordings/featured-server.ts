import "server-only"

import type { Firestore } from "firebase-admin/firestore"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"
import { rowOrg } from "@/lib/org/membership"
import type { Recording } from "@/types/models"
import { isPlayable, pickFeatured, toFeatured, type FeaturedRecording } from "./featured"

/**
 * Recordings 2026-11 — server reads and writes of the featured take. Every
 * read keeps the caller's congregation only (`rowOrg(orgId) === org`): the
 * files are public, but each tenant LISTS only its own recordings.
 */

const COLLECTION = "recordings"
const IN_CHUNK = 30

/** A refusal from a recordings write; `envelope` is the richError to return. */
export class RecordingRefusal extends Error {
    constructor(
        public readonly envelope: RichErrorEnvelope,
        public readonly status: number,
    ) {
        super(envelope.error.message)
        this.name = "RecordingRefusal"
    }
}

export function recordingFromDoc(id: string, data: Record<string, unknown>): Recording {
    return { ...(data as Omit<Recording, "id">), id }
}

/** This org's recordings for the given songs, all statuses. Queried in `in` chunks of 30. */
export async function loadRecordingsForSongs(
    db: Firestore,
    orgId: string,
    songIds: string[],
): Promise<Map<string, Recording[]>> {
    const ids = [...new Set(songIds.filter((s) => typeof s === "string" && s.length > 0))]
    const out = new Map<string, Recording[]>()
    for (let i = 0; i < ids.length; i += IN_CHUNK) {
        const chunk = ids.slice(i, i + IN_CHUNK)
        const snap = await db.collection(COLLECTION).where("songId", "in", chunk).get()
        for (const d of snap.docs) {
            const data = d.data() as Record<string, unknown>
            if (rowOrg(data.orgId) !== orgId) continue
            const songId = data.songId as string
            const list = out.get(songId) ?? []
            list.push(recordingFromDoc(d.id, data))
            out.set(songId, list)
        }
    }
    return out
}

/** songId → its one featured take, for songs that have a playable take. `url` is site-relative. */
export async function getFeaturedForSongs(
    db: Firestore,
    orgId: string,
    songIds: string[],
): Promise<Record<string, FeaturedRecording>> {
    const bySong = await loadRecordingsForSongs(db, orgId, songIds)
    const out: Record<string, FeaturedRecording> = {}
    for (const [songId, recs] of bySong) {
        const pick = pickFeatured(recs)
        if (pick) out[songId] = toFeatured(pick)
    }
    return out
}

/**
 * Make `recordingId` its song's featured take, in one transaction: the target
 * gets `featured: true`, the song's other takes in this org `featured: false`.
 * Refuses (RecordingRefusal) a recording of another org (answered as not
 * found), one with no song, or one that is held or hidden.
 */
export async function setFeaturedRecording(
    db: Firestore,
    orgId: string,
    recordingId: string,
): Promise<{ songId: string; unset: string[] }> {
    const ref = db.collection(COLLECTION).doc(recordingId)
    return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref)
        const data = snap.exists ? (snap.data() as Record<string, unknown>) : null
        if (!data || rowOrg(data.orgId) !== orgId) {
            throw new RecordingRefusal(
                richError("recording_not_found", `Recording '${recordingId}' was not found.`, { recordingId, errorCode: 404 }, "Use list_recordings to find the id."),
                404,
            )
        }
        const songId = typeof data.songId === "string" && data.songId ? data.songId : null
        if (!songId) {
            throw new RecordingRefusal(
                richError("recording_has_no_song", "This recording is not attached to a song.", { recordingId, errorCode: 409 }, "Attach it to a song first."),
                409,
            )
        }
        if (!isPlayable(data as Pick<Recording, "status">)) {
            throw new RecordingRefusal(
                richError(
                    "recording_not_playable",
                    `Recording '${recordingId}' is ${String(data.status)}; only a live take can be featured.`,
                    { recordingId, status: data.status, errorCode: 409 },
                    "Set its status to live first.",
                ),
                409,
            )
        }
        const siblings = await tx.get(db.collection(COLLECTION).where("songId", "==", songId))
        const unset: string[] = []
        for (const d of siblings.docs) {
            if (d.id === recordingId) continue
            const sd = d.data() as Record<string, unknown>
            if (rowOrg(sd.orgId) !== orgId || sd.featured !== true) continue
            tx.update(d.ref, { featured: false })
            unset.push(d.id)
        }
        tx.update(ref, { featured: true })
        return { songId, unset }
    })
}
