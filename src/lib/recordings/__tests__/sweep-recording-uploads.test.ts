/**
 * The recording-upload sweep (run from the import-batches-resume cron):
 * pending uploads whose signed URL expired over an hour ago are removed, and
 * an unfinished one takes its Storage object with it.
 */
import { describe, expect, it, vi } from "vitest"
import { Timestamp } from "firebase-admin/firestore"

vi.mock("@/lib/firebase-admin", () => ({ initAdmin: () => true }))

import { fakeDb } from "./fake-db"
import { PENDING_COLLECTION, sweepExpiredRecordingUploads } from "../direct-upload-server"

const NOW = Date.parse("2026-11-02T12:00:00Z")
const MIN = 60 * 1000

async function seed(db: ReturnType<typeof fakeDb>, id: string, expiresAgoMin: number, extra: Record<string, unknown> = {}) {
    await db.collection(PENDING_COLLECTION).doc(id).set({
        recordingId: id,
        uid: "u1",
        orgId: "crc",
        storagePath: `recordings/${id}.mp3`,
        expiresAt: Timestamp.fromMillis(NOW - expiresAgoMin * MIN),
        ...extra,
    })
}

describe("sweepExpiredRecordingUploads", () => {
    it("removes long-expired unfinished uploads with their object, and keeps everything else", async () => {
        const db = fakeDb({ recordings: { "rec-done": { orgId: "crc", storagePath: "recordings/rec-done.mp3" } } })
        await seed(db, "rec-abandoned", 90)                                     // expired 90 min ago, never finished
        await seed(db, "rec-fresh-expiry", 30)                                  // expired 30 min ago: inside the grace hour
        await seed(db, "rec-live", -10)                                         // signed URL still live
        await seed(db, "rec-done", 90, { completedAt: "2026-11-02T10:00:00Z" }) // finished long ago
        await seed(db, "rec-racing", 90)                                        // no completedAt, but its recording exists
        db.store.recordings["rec-racing"] = { orgId: "crc", storagePath: "recordings/rec-racing.mp3" }

        const deleted: string[] = []
        const out = await sweepExpiredRecordingUploads(db as never, NOW, async (p) => {
            deleted.push(p)
        })

        expect(deleted).toEqual(["recordings/rec-abandoned.mp3"])
        expect(out).toEqual({ removed: 3, objectsDeleted: 1 })
        expect(Object.keys(db.store[PENDING_COLLECTION]).sort()).toEqual(["rec-fresh-expiry", "rec-live"])
        expect(Object.keys(db.store.recordings).sort()).toEqual(["rec-done", "rec-racing"])
    })
})
