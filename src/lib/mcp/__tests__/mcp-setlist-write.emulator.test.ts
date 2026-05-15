import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

import {
    createSetlist,
    updateSetlist,
    addTrackToSetlist,
    reorderSetlist,
    removeSetlistTrack,
    deleteSetlist,
} from "../tools/setlist-write"
import { getSetlist } from "../tools/setlists"

/**
 * MCP Phase 4b — write tools against the Firebase emulator.
 *
 * Order manipulation (insert-shift, reorder-permutation, remove-repack) and
 * the trackCount/updatedAt denormalization are inherently Firestore-coupled —
 * mocking would test the mock, not the logic — so this is emulator-only.
 *
 * Covers: create → update → add (append / insert / songId / header / chart
 * bond) → reorder → remove, plus the role gate (admin/band_leader may edit ANY
 * setlist; everyone else is read-only) and the validation guards.
 *
 * Runs only via `npm run test:emulator` (firebase emulators:exec wrapper).
 */
describe("MCP setlist write tools (emulator)", () => {
    let app: App
    const ADMIN = "rabbi-daniel" // role: admin — creates setlists in most tests
    const LEADER = "randy" // role: band_leader — may edit ANY setlist
    const MEMBER = "guest-musician" // role: musician — read-only, write tools denied
    const NOT_EDITOR_ERROR = "Write tools require an admin or band leader account"

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
        // Seed the three role tiers (write tools gate on users/{uid}.role) and a
        // library song (add_track_to_setlist can derive a row from a songId).
        await db()
            .collection("users")
            .doc(ADMIN)
            .set({ displayName: "Rabbi Daniel", role: "admin" })
        await db()
            .collection("users")
            .doc(LEADER)
            .set({ displayName: "Randy", role: "band_leader" })
        await db()
            .collection("users")
            .doc(MEMBER)
            .set({ displayName: "Guest Musician", role: "musician" })
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

    async function newSetlist(uid = ADMIN): Promise<string> {
        const r = (await createSetlist(uid, { name: "Test Service" })) as {
            setlistId: string
        }
        return r.setlistId
    }

    it("create_setlist makes an empty setlist owned by the creator", async () => {
        const result = (await createSetlist(ADMIN, {
            name: "Shabbat Morning",
            eventDate: "2026-06-07",
            rabbi: "Daniel",
        })) as { setlistId: string; trackCount: number }

        expect(result.setlistId).toBeTruthy()
        expect(result.trackCount).toBe(0)

        const doc = await db().collection("setlists").doc(result.setlistId).get()
        const data = doc.data()!
        expect(data.ownerId).toBe(ADMIN)
        expect(data.ownerName).toBe("Rabbi Daniel")
        expect(data.name).toBe("Shabbat Morning")
        expect(data.trackCount).toBe(0)
        expect(await tracksOf(result.setlistId)).toHaveLength(0)
    })

    it("update_setlist: any editor may edit any setlist; members may not", async () => {
        const id = await newSetlist(ADMIN)

        // The creator (admin) edits.
        expect(await updateSetlist(ADMIN, { id, name: "Renamed" })).toEqual({ ok: true })
        expect((await db().collection("setlists").doc(id).get()).data()!.name).toBe("Renamed")

        // A band leader edits a setlist they did NOT create — role-based, not
        // owner-based access.
        expect(await updateSetlist(LEADER, { id, name: "Leader Edit" })).toEqual({ ok: true })
        expect((await db().collection("setlists").doc(id).get()).data()!.name).toBe(
            "Leader Edit",
        )

        // A member is rejected without mutating anything.
        expect(await updateSetlist(MEMBER, { id, name: "Hijacked" })).toEqual({
            error: NOT_EDITOR_ERROR,
        })
        expect((await db().collection("setlists").doc(id).get()).data()!.name).toBe(
            "Leader Edit",
        )

        // Missing setlist (caller IS an editor — the existence check still runs).
        expect(await updateSetlist(ADMIN, { id: "nope", name: "x" })).toEqual({
            error: "Setlist not found",
        })
    })

    it("a member account is denied every write tool", async () => {
        const id = await newSetlist(ADMIN)
        const t = (await addTrackToSetlist(ADMIN, { setlistId: id, title: "Row" })) as {
            trackId: string
        }

        expect(await createSetlist(MEMBER, { name: "Nope" })).toEqual({
            error: NOT_EDITOR_ERROR,
        })
        expect(await updateSetlist(MEMBER, { id, name: "Nope" })).toEqual({
            error: NOT_EDITOR_ERROR,
        })
        expect(await addTrackToSetlist(MEMBER, { setlistId: id, title: "Nope" })).toEqual({
            error: NOT_EDITOR_ERROR,
        })
        expect(
            await reorderSetlist(MEMBER, { setlistId: id, orderedTrackIds: [t.trackId] }),
        ).toEqual({ error: NOT_EDITOR_ERROR })
        expect(
            await removeSetlistTrack(MEMBER, { setlistId: id, trackId: t.trackId }),
        ).toEqual({ error: NOT_EDITOR_ERROR })

        // Nothing was mutated.
        expect(await tracksOf(id)).toHaveLength(1)
    })

    it("add_track_to_setlist appends, keeping order contiguous + trackCount in sync", async () => {
        const id = await newSetlist()

        const a = (await addTrackToSetlist(ADMIN, { setlistId: id, title: "Song A" })) as {
            trackId: string
            order: number
        }
        const b = (await addTrackToSetlist(ADMIN, { setlistId: id, title: "Song B" })) as {
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
        await addTrackToSetlist(ADMIN, { setlistId: id, title: "A" })
        await addTrackToSetlist(ADMIN, { setlistId: id, title: "C" })

        const inserted = (await addTrackToSetlist(ADMIN, {
            setlistId: id,
            title: "B",
            position: 1,
        })) as { order: number }
        expect(inserted.order).toBe(1)

        expect((await tracksOf(id)).map((t) => t.title)).toEqual(["A", "B", "C"])
    })

    it("add_track_to_setlist derives title/key/lead from a library songId", async () => {
        const id = await newSetlist()
        await addTrackToSetlist(ADMIN, { setlistId: id, songId: "song-oseh" })

        const [row] = await tracksOf(id)
        expect(row.title).toBe("Oseh Shalom") // file extension stripped
        expect(row.key).toBe("G")
        expect(row.leadMusician).toBe("Cantor")
        expect(row.songId).toBe("song-oseh")
        expect(row.type).toBe("song")
    })

    it("add_track_to_setlist bonds the song's chart — fileId/fileName on the row, fileIds on the parent", async () => {
        const id = await newSetlist()
        await addTrackToSetlist(ADMIN, { setlistId: id, songId: "song-oseh" })

        // The row carries the chart file id + cached filename — what the app's
        // chart rendering keys off (a songId alone never renders a chart).
        const [row] = await tracksOf(id)
        expect(row.fileId).toBe("song-oseh")
        expect(row.fileName).toBe("Oseh Shalom.pdf")

        // The parent's denormalized fileIds set includes the chart.
        const setlist = (await db().collection("setlists").doc(id).get()).data()!
        expect(setlist.fileIds).toEqual(["song-oseh"])

        // A header row contributes no chart — fileIds is unchanged.
        await addTrackToSetlist(ADMIN, { setlistId: id, title: "— Closing —", type: "header" })
        const after = (await db().collection("setlists").doc(id).get()).data()!
        expect(after.fileIds).toEqual(["song-oseh"])
    })

    it("remove_track drops the chart from fileIds only when no other row still uses it", async () => {
        const id = await newSetlist()
        // Two rows bound to the same chart, plus a distinct one.
        const dup1 = (await addTrackToSetlist(ADMIN, {
            setlistId: id,
            songId: "song-oseh",
        })) as { trackId: string }
        await addTrackToSetlist(ADMIN, { setlistId: id, songId: "song-oseh" })
        await db()
            .collection("songs")
            .doc("song-other")
            .set({ title: "Hinei Ma Tov.pdf" })
        const other = (await addTrackToSetlist(ADMIN, {
            setlistId: id,
            songId: "song-other",
        })) as { trackId: string }

        // Removing one of the duplicates keeps the chart — the other row uses it.
        await removeSetlistTrack(ADMIN, { setlistId: id, trackId: dup1.trackId })
        let fileIds = (await db().collection("setlists").doc(id).get()).data()!
            .fileIds as string[]
        expect([...fileIds].sort()).toEqual(["song-oseh", "song-other"])

        // Removing the last row using a chart drops it from the set.
        await removeSetlistTrack(ADMIN, { setlistId: id, trackId: other.trackId })
        fileIds = (await db().collection("setlists").doc(id).get()).data()!
            .fileIds as string[]
        expect(fileIds).toEqual(["song-oseh"])
    })

    it("add_track_to_setlist supports header rows and rejects a titleless song", async () => {
        const id = await newSetlist()
        await addTrackToSetlist(ADMIN, { setlistId: id, title: "— Opening —", type: "header" })
        expect((await tracksOf(id))[0].type).toBe("header")

        expect(await addTrackToSetlist(ADMIN, { setlistId: id })).toEqual({
            error: "title is required (or pass a songId to derive it)",
        })
        expect(await addTrackToSetlist(MEMBER, { setlistId: id, title: "x" })).toEqual({
            error: NOT_EDITOR_ERROR,
        })
    })

    it("add_track_to_setlist accepts reading / prayer / transition / note (G-10)", async () => {
        const id = await newSetlist()
        await addTrackToSetlist(ADMIN, {
            setlistId: id,
            title: "V'ahavta",
            type: "reading",
        })
        await addTrackToSetlist(ADMIN, {
            setlistId: id,
            title: "Silent Prayer",
            type: "prayer",
        })
        await addTrackToSetlist(ADMIN, {
            setlistId: id,
            title: "Instrumental",
            type: "transition",
        })
        await addTrackToSetlist(ADMIN, {
            setlistId: id,
            title: "Service Note",
            type: "note",
        })

        const tracks = await tracksOf(id)
        expect(tracks.map((t) => t.type)).toEqual([
            "reading",
            "prayer",
            "transition",
            "note",
        ])
        expect(tracks.map((t) => t.title)).toEqual([
            "V'ahavta",
            "Silent Prayer",
            "Instrumental",
            "Service Note",
        ])
    })

    it("reorder_setlist applies a full permutation and rejects a partial list", async () => {
        const id = await newSetlist()
        const t1 = (await addTrackToSetlist(ADMIN, { setlistId: id, title: "1" })) as {
            trackId: string
        }
        const t2 = (await addTrackToSetlist(ADMIN, { setlistId: id, title: "2" })) as {
            trackId: string
        }
        const t3 = (await addTrackToSetlist(ADMIN, { setlistId: id, title: "3" })) as {
            trackId: string
        }

        // A band leader reorders a setlist the admin created (role-based access).
        expect(
            await reorderSetlist(LEADER, {
                setlistId: id,
                orderedTrackIds: [t3.trackId, t1.trackId, t2.trackId],
            }),
        ).toEqual({ ok: true })
        expect((await tracksOf(id)).map((t) => t.title)).toEqual(["3", "1", "2"])

        // A list that isn't an exact permutation is rejected.
        const partial = await reorderSetlist(ADMIN, {
            setlistId: id,
            orderedTrackIds: [t1.trackId, t2.trackId],
        })
        expect(partial).toHaveProperty("error")
        // Order unchanged after the rejected call.
        expect((await tracksOf(id)).map((t) => t.title)).toEqual(["3", "1", "2"])

        expect(
            await reorderSetlist(MEMBER, {
                setlistId: id,
                orderedTrackIds: [t1.trackId, t2.trackId, t3.trackId],
            }),
        ).toEqual({ error: NOT_EDITOR_ERROR })
    })

    it("add_track + getSetlist round-trips referenceLink (F-4)", async () => {
        // Regression guard for F-4: getSetlist projection used to omit
        // referenceLink even though the write path persists it correctly,
        // silently dropping any URL the caller attached.
        const id = await newSetlist()
        await addTrackToSetlist(ADMIN, {
            setlistId: id,
            title: "Linked Row",
            referenceLink: "https://example.com/chart-ref",
        })

        const view = (await getSetlist(ADMIN, { id })) as {
            tracks: Array<{ referenceLink: string | null }>
        }
        expect(view.tracks[0].referenceLink).toBe("https://example.com/chart-ref")

        // A row added without a referenceLink projects null, not missing.
        await addTrackToSetlist(ADMIN, { setlistId: id, title: "Plain Row" })
        const view2 = (await getSetlist(ADMIN, { id })) as {
            tracks: Array<{ referenceLink: string | null }>
        }
        expect(view2.tracks[1].referenceLink).toBeNull()
    })

    it("remove_track deletes the row, re-packs order, and syncs trackCount", async () => {
        const id = await newSetlist()
        await addTrackToSetlist(ADMIN, { setlistId: id, title: "A" })
        const mid = (await addTrackToSetlist(ADMIN, { setlistId: id, title: "B" })) as {
            trackId: string
        }
        await addTrackToSetlist(ADMIN, { setlistId: id, title: "C" })

        expect(
            await removeSetlistTrack(ADMIN, { setlistId: id, trackId: mid.trackId }),
        ).toEqual({ ok: true })

        const tracks = await tracksOf(id)
        expect(tracks.map((t) => t.title)).toEqual(["A", "C"])
        expect(tracks.map((t) => t.order)).toEqual([0, 1]) // re-packed, no gap
        expect((await db().collection("setlists").doc(id).get()).data()!.trackCount).toBe(2)

        // Unknown track id and a non-editor caller are both rejected.
        expect(
            await removeSetlistTrack(ADMIN, { setlistId: id, trackId: "ghost" }),
        ).toEqual({ error: "Track not found in this setlist" })
        expect(
            await removeSetlistTrack(MEMBER, { setlistId: id, trackId: tracks[0].id as string }),
        ).toEqual({ error: NOT_EDITOR_ERROR })
    })

    describe("delete_setlist (F-10)", () => {
        it("admin deletes their own setlist and cascades all its tracks", async () => {
            const id = await newSetlist(ADMIN)
            await addTrackToSetlist(ADMIN, { setlistId: id, title: "1" })
            await addTrackToSetlist(ADMIN, { setlistId: id, title: "2" })

            expect(await deleteSetlist(ADMIN, { id })).toEqual({
                ok: true,
                tracksDeleted: 2,
            })
            expect((await db().collection("setlists").doc(id).get()).exists).toBe(false)
            expect(await tracksOf(id)).toHaveLength(0)
        })

        it("works on a setlist with no tracks", async () => {
            const id = await newSetlist(ADMIN)
            expect(await deleteSetlist(ADMIN, { id })).toEqual({
                ok: true,
                tracksDeleted: 0,
            })
            expect((await db().collection("setlists").doc(id).get()).exists).toBe(false)
        })

        it("admin can delete a setlist owned by another editor (override)", async () => {
            const id = await newSetlist(LEADER)
            expect(await deleteSetlist(ADMIN, { id })).toEqual({
                ok: true,
                tracksDeleted: 0,
            })
        })

        it("band_leader deletes their own setlist", async () => {
            const id = await newSetlist(LEADER)
            await addTrackToSetlist(LEADER, { setlistId: id, title: "x" })
            expect(await deleteSetlist(LEADER, { id })).toEqual({
                ok: true,
                tracksDeleted: 1,
            })
            expect((await db().collection("setlists").doc(id).get()).exists).toBe(false)
        })

        it("band_leader CANNOT delete a setlist owned by someone else", async () => {
            // Stricter than create/update/add_track, which let any leader edit
            // any setlist. Delete is destructive + irreversible, so it requires
            // ownership (or an admin override).
            const id = await newSetlist(ADMIN)
            expect(await deleteSetlist(LEADER, { id })).toEqual({
                error: "Only the setlist owner or an admin may delete a setlist",
            })
            expect((await db().collection("setlists").doc(id).get()).exists).toBe(true)
        })

        it("member is rejected at the role gate", async () => {
            const id = await newSetlist(ADMIN)
            expect(await deleteSetlist(MEMBER, { id })).toEqual({
                error: NOT_EDITOR_ERROR,
            })
            expect((await db().collection("setlists").doc(id).get()).exists).toBe(true)
        })

        it("nonexistent setlist id returns a clean error", async () => {
            expect(await deleteSetlist(ADMIN, { id: "nope" })).toEqual({
                error: "Setlist not found",
            })
        })

        it("does not touch tracks of other setlists", async () => {
            const a = await newSetlist(ADMIN)
            const b = await newSetlist(ADMIN)
            await addTrackToSetlist(ADMIN, { setlistId: a, title: "a1" })
            await addTrackToSetlist(ADMIN, { setlistId: b, title: "b1" })

            expect(await deleteSetlist(ADMIN, { id: a })).toEqual({
                ok: true,
                tracksDeleted: 1,
            })
            expect(await tracksOf(b)).toHaveLength(1)
            expect((await db().collection("setlists").doc(b).get()).exists).toBe(true)
        })
    })
})
