import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

import {
    createSetlist,
    updateSetlist,
    addTrackToSetlist,
    reorderSetlist,
    removeSetlistTrack,
} from "../tools/setlist-write"

/**
 * MCP Phase 4b — write tools against the Firebase emulator.
 *
 * Order manipulation (insert-shift, reorder-permutation, remove-repack) and
 * the trackCount/updatedAt denormalization are inherently Firestore-coupled —
 * mocking would test the mock, not the logic — so this is emulator-only.
 *
 * Covers: create → owner-scoped update → add (append / insert / songId /
 * header) → reorder → remove, plus the ownership and validation guards.
 *
 * Runs only via `npm run test:emulator` (firebase emulators:exec wrapper).
 */
describe("MCP setlist write tools (emulator)", () => {
    let app: App
    const OWNER = "rabbi-daniel"
    const OTHER = "randy"

    function db() {
        return getFirestore(app)
    }

    /** tracks/{id} rows for a setlist, sorted by order. */
    async function tracksOf(setlistId: string) {
        const snap = await db()
            .collection("tracks")
            .where("setlistId", "==", setlistId)
            .get()
        return snap.docs
            .map((d) => d.data() as Record<string, unknown>)
            .sort((a, b) => (a.order as number) - (b.order as number))
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-mcp-setlist-write" })
        // Seed the owner's profile (createSetlist denormalizes ownerName) and a
        // library song (add_track_to_setlist can derive a row from a songId).
        await db().collection("users").doc(OWNER).set({ displayName: "Rabbi Daniel" })
        await db()
            .collection("songs")
            .doc("song-oseh")
            .set({ title: "Oseh Shalom.pdf", defaults: { key: "G", lead: "Cantor" } })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        for (const col of ["setlists", "tracks"]) {
            const snap = await db().collection(col).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
    })

    async function newSetlist(uid = OWNER): Promise<string> {
        const r = (await createSetlist(uid, { name: "Test Service" })) as {
            setlistId: string
        }
        return r.setlistId
    }

    it("create_setlist makes an empty owner-scoped setlist", async () => {
        const result = (await createSetlist(OWNER, {
            name: "Shabbat Morning",
            eventDate: "2026-06-07",
            rabbi: "Daniel",
        })) as { setlistId: string; trackCount: number }

        expect(result.setlistId).toBeTruthy()
        expect(result.trackCount).toBe(0)

        const doc = await db().collection("setlists").doc(result.setlistId).get()
        const data = doc.data()!
        expect(data.ownerId).toBe(OWNER)
        expect(data.ownerName).toBe("Rabbi Daniel")
        expect(data.name).toBe("Shabbat Morning")
        expect(data.trackCount).toBe(0)
        expect(await tracksOf(result.setlistId)).toHaveLength(0)
    })

    it("update_setlist patches metadata for the owner only", async () => {
        const id = await newSetlist()

        expect(await updateSetlist(OWNER, { id, name: "Renamed" })).toEqual({ ok: true })
        expect((await db().collection("setlists").doc(id).get()).data()!.name).toBe("Renamed")

        // Non-owner is rejected without mutating anything.
        expect(await updateSetlist(OTHER, { id, name: "Hijacked" })).toEqual({
            error: "You do not own this setlist",
        })
        expect((await db().collection("setlists").doc(id).get()).data()!.name).toBe("Renamed")

        // Missing setlist.
        expect(await updateSetlist(OWNER, { id: "nope", name: "x" })).toEqual({
            error: "Setlist not found",
        })
    })

    it("add_track_to_setlist appends, keeping order contiguous + trackCount in sync", async () => {
        const id = await newSetlist()

        const a = (await addTrackToSetlist(OWNER, { setlistId: id, title: "Song A" })) as {
            trackId: string
            order: number
        }
        const b = (await addTrackToSetlist(OWNER, { setlistId: id, title: "Song B" })) as {
            order: number
        }
        expect(a.order).toBe(0)
        expect(b.order).toBe(1)

        const tracks = await tracksOf(id)
        expect(tracks.map((t) => t.title)).toEqual(["Song A", "Song B"])
        expect((await db().collection("setlists").doc(id).get()).data()!.trackCount).toBe(2)
    })

    it("add_track_to_setlist inserts at a position, shifting later rows down", async () => {
        const id = await newSetlist()
        await addTrackToSetlist(OWNER, { setlistId: id, title: "A" })
        await addTrackToSetlist(OWNER, { setlistId: id, title: "C" })

        const inserted = (await addTrackToSetlist(OWNER, {
            setlistId: id,
            title: "B",
            position: 1,
        })) as { order: number }
        expect(inserted.order).toBe(1)

        expect((await tracksOf(id)).map((t) => t.title)).toEqual(["A", "B", "C"])
    })

    it("add_track_to_setlist derives title/key/lead from a library songId", async () => {
        const id = await newSetlist()
        await addTrackToSetlist(OWNER, { setlistId: id, songId: "song-oseh" })

        const [row] = await tracksOf(id)
        expect(row.title).toBe("Oseh Shalom") // file extension stripped
        expect(row.key).toBe("G")
        expect(row.leadMusician).toBe("Cantor")
        expect(row.songId).toBe("song-oseh")
        expect(row.type).toBe("song")
    })

    it("add_track_to_setlist supports header rows and rejects a titleless song", async () => {
        const id = await newSetlist()
        await addTrackToSetlist(OWNER, { setlistId: id, title: "— Opening —", type: "header" })
        expect((await tracksOf(id))[0].type).toBe("header")

        expect(await addTrackToSetlist(OWNER, { setlistId: id })).toEqual({
            error: "title is required (or pass a songId to derive it)",
        })
        expect(await addTrackToSetlist(OTHER, { setlistId: id, title: "x" })).toEqual({
            error: "You do not own this setlist",
        })
    })

    it("reorder_setlist applies a full permutation and rejects a partial list", async () => {
        const id = await newSetlist()
        const t1 = (await addTrackToSetlist(OWNER, { setlistId: id, title: "1" })) as {
            trackId: string
        }
        const t2 = (await addTrackToSetlist(OWNER, { setlistId: id, title: "2" })) as {
            trackId: string
        }
        const t3 = (await addTrackToSetlist(OWNER, { setlistId: id, title: "3" })) as {
            trackId: string
        }

        expect(
            await reorderSetlist(OWNER, {
                setlistId: id,
                orderedTrackIds: [t3.trackId, t1.trackId, t2.trackId],
            }),
        ).toEqual({ ok: true })
        expect((await tracksOf(id)).map((t) => t.title)).toEqual(["3", "1", "2"])

        // A list that isn't an exact permutation is rejected.
        const partial = await reorderSetlist(OWNER, {
            setlistId: id,
            orderedTrackIds: [t1.trackId, t2.trackId],
        })
        expect(partial).toHaveProperty("error")
        // Order unchanged after the rejected call.
        expect((await tracksOf(id)).map((t) => t.title)).toEqual(["3", "1", "2"])

        expect(
            await reorderSetlist(OTHER, {
                setlistId: id,
                orderedTrackIds: [t1.trackId, t2.trackId, t3.trackId],
            }),
        ).toEqual({ error: "You do not own this setlist" })
    })

    it("remove_track deletes the row, re-packs order, and syncs trackCount", async () => {
        const id = await newSetlist()
        await addTrackToSetlist(OWNER, { setlistId: id, title: "A" })
        const mid = (await addTrackToSetlist(OWNER, { setlistId: id, title: "B" })) as {
            trackId: string
        }
        await addTrackToSetlist(OWNER, { setlistId: id, title: "C" })

        expect(
            await removeSetlistTrack(OWNER, { setlistId: id, trackId: mid.trackId }),
        ).toEqual({ ok: true })

        const tracks = await tracksOf(id)
        expect(tracks.map((t) => t.title)).toEqual(["A", "C"])
        expect(tracks.map((t) => t.order)).toEqual([0, 1]) // re-packed, no gap
        expect((await db().collection("setlists").doc(id).get()).data()!.trackCount).toBe(2)

        // Unknown track id and non-owner are both rejected.
        expect(
            await removeSetlistTrack(OWNER, { setlistId: id, trackId: "ghost" }),
        ).toEqual({ error: "Track not found in this setlist" })
        expect(
            await removeSetlistTrack(OTHER, { setlistId: id, trackId: tracks[0].id as string }),
        ).toEqual({ error: "You do not own this setlist" })
    })
})
