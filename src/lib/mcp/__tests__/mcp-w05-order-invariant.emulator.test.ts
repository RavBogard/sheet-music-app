import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
} from "vitest"
import {
    deleteApp,
    getApps,
    initializeApp,
    type App,
} from "firebase-admin/app"
import { FieldValue, getFirestore } from "firebase-admin/firestore"
import crypto from "crypto"

import {
    addTrackToSetlist,
    bulkAddSetlistTracks,
    createSetlist,
    removeSetlistTrack,
    reorderSetlist,
    updateSetlistTrack,
} from "../tools/setlist-write"

/**
 * F-03 / W-05 invariant-on-write — companion to scripts/repack-track-order.ts.
 *
 * The migration script heals existing drift (May 2 setlist had 30 tracks
 * with orders 0..44, 15 gaps). These tests pin the contract that the
 * three named write paths (`remove_track`, `update_track` position-move,
 * `reorder_setlist`) RE-PACK siblings to contiguous `[0..n-1]` even when
 * the input is already non-contiguous. The re-pack is structurally in
 * place in Plan 02's transactional refactor (sort-by-order + assign
 * `order = i`), so this file's job is to catch a future change that
 * weakens it.
 *
 * Each test seeds three tracks with orders [0, 2, 5] (legacy-style
 * drift), exercises ONE named path, then asserts the post-write sorted
 * tracks have orders [0, 1, ...] with no gaps.
 *
 * The append paths are covered too: append means logical tail even when
 * legacy numeric order has gaps/duplicates, and concurrent appends serialize.
 */
describe("W-05 — order-invariant on the 3 named write paths (emulator)", () => {
    let app: App
    const ADMIN = "rabbi-daniel"

    function db() {
        return getFirestore(app)
    }

    /** Seed a setlist with explicit non-contiguous order values. */
    async function seedDriftedSetlist(orders: number[]): Promise<{
        setlistId: string
        trackIds: string[]
    }> {
        const r = (await createSetlist(ADMIN, {
            name: "Drifted Setlist",
        })) as { setlistId: string }
        const setlistId = r.setlistId
        const trackIds: string[] = []
        const batch = db().batch()
        for (let i = 0; i < orders.length; i++) {
            const trackId = crypto.randomUUID()
            trackIds.push(trackId)
            batch.set(db().collection("tracks").doc(trackId), {
                id: trackId,
                setlistId,
                order: orders[i],
                title: `Drifted ${i}`,
                type: "song",
                version: 1,
                lastModifiedAt: new Date().toISOString(),
                updatedAt: FieldValue.serverTimestamp(),
            })
        }
        await batch.commit()
        return { setlistId, trackIds }
    }

    async function readOrdersSorted(setlistId: string): Promise<number[]> {
        const snap = await db()
            .collection("tracks")
            .where("setlistId", "==", setlistId)
            .get()
        return snap.docs
            .map((d) => (d.data() as { order: number }).order)
            .sort((a, b) => a - b)
    }

    async function readTracksInOrder(setlistId: string): Promise<Array<{
        id: string
        title: string
        order: number
    }>> {
        const snap = await db()
            .collection("tracks")
            .where("setlistId", "==", setlistId)
            .get()
        return snap.docs
            .map((d) => ({
                id: d.id,
                title: d.data().title as string,
                order: d.data().order as number,
            }))
            .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app =
            getApps()[0] ??
            initializeApp({ projectId: "demo-mcp-w05-order-invariant" })
        await db()
            .collection("users")
            .doc(ADMIN)
            .set({ displayName: "Rabbi Daniel", role: "admin" })
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

    it("remove_track re-packs drifted siblings to contiguous [0..n-1]", async () => {
        const { setlistId, trackIds } = await seedDriftedSetlist([0, 2, 5])
        // Remove the middle drifted row (order=2). Remaining input orders
        // are [0, 5] — must heal to [0, 1].
        const result = (await removeSetlistTrack(ADMIN, {
            setlistId,
            trackId: trackIds[1],
        })) as { ok: true }
        expect(result.ok).toBe(true)
        expect(await readOrdersSorted(setlistId)).toEqual([0, 1])
    })

    it("remove_track healing also works when the removed row is at the gap edge", async () => {
        const { setlistId, trackIds } = await seedDriftedSetlist([0, 2, 5])
        // Remove the order=5 trail row. Remaining [0, 2] must heal to [0, 1].
        await removeSetlistTrack(ADMIN, { setlistId, trackId: trackIds[2] })
        expect(await readOrdersSorted(setlistId)).toEqual([0, 1])
    })

    it("update_track position-move heals drifted siblings while landing the move", async () => {
        const { setlistId, trackIds } = await seedDriftedSetlist([0, 2, 5])
        // Move the order=0 row to position 2 (end). Post-move sorted
        // array order must be [trackIds[1], trackIds[2], trackIds[0]],
        // and ALL orders must be contiguous [0, 1, 2].
        const result = (await updateSetlistTrack(ADMIN, {
            setlistId,
            trackId: trackIds[0],
            patch: { position: 2 },
        })) as { ok: true; track: Record<string, unknown> }
        expect(result.ok).toBe(true)
        expect(await readOrdersSorted(setlistId)).toEqual([0, 1, 2])

        // Verify the move landed: trackIds[0] should now be at order 2.
        const moved = (
            await db().collection("tracks").doc(trackIds[0]).get()
        ).data() as { order: number }
        expect(moved.order).toBe(2)
    })

    it("reorder_setlist re-packs drifted siblings on a full-permutation reorder", async () => {
        const { setlistId, trackIds } = await seedDriftedSetlist([0, 2, 5])
        // Swap first and last via a full-permutation reorder.
        const result = (await reorderSetlist(ADMIN, {
            setlistId,
            orderedTrackIds: [trackIds[2], trackIds[1], trackIds[0]],
        })) as { ok: true }
        expect(result.ok).toBe(true)
        expect(await readOrdersSorted(setlistId)).toEqual([0, 1, 2])

        // Verify the permutation: trackIds[2] is now at order 0.
        const head = (
            await db().collection("tracks").doc(trackIds[2]).get()
        ).data() as { order: number }
        expect(head.order).toBe(0)
    })

    it("invariant holds even when drift includes duplicate orders", async () => {
        // Race-condition shape: two siblings sharing the same order. The
        // sort is stable on equal keys, so the loop assigns sequential
        // indices and any duplicate at sort-position N becomes order=N.
        const { setlistId, trackIds } = await seedDriftedSetlist([0, 1, 1])
        await removeSetlistTrack(ADMIN, { setlistId, trackId: trackIds[0] })
        expect(await readOrdersSorted(setlistId)).toEqual([0, 1])
    })

    it("add_track append lands at the logical tail and heals gaps", async () => {
        const { setlistId, trackIds } = await seedDriftedSetlist([0, 2, 5])
        const added = (await addTrackToSetlist(ADMIN, {
            setlistId,
            title: "Actual Tail",
        })) as { trackId: string; order: number }

        expect(added.order).toBe(3)
        expect((await readTracksInOrder(setlistId)).map((t) => t.id)).toEqual([
            ...trackIds,
            added.trackId,
        ])
        expect(await readOrdersSorted(setlistId)).toEqual([0, 1, 2, 3])
    })

    it("add_track append lands after every duplicate-order sibling", async () => {
        const { setlistId } = await seedDriftedSetlist([0, 1, 1])
        const added = (await addTrackToSetlist(ADMIN, {
            setlistId,
            title: "After Duplicates",
        })) as { trackId: string; order: number }

        const ordered = await readTracksInOrder(setlistId)
        expect(ordered.at(-1)?.id).toBe(added.trackId)
        expect(ordered.map((t) => t.order)).toEqual([0, 1, 2, 3])
    })

    it("bulk_add append preserves caller order at the logical tail and heals drift", async () => {
        const { setlistId, trackIds } = await seedDriftedSetlist([0, 2, 5])
        const result = (await bulkAddSetlistTracks(ADMIN, {
            setlistId,
            tracks: [{ title: "Bulk Tail A" }, { title: "Bulk Tail B" }],
        })) as {
            committed: boolean
            results: Array<{ trackId: string; order: number }>
        }

        expect(result.committed).toBe(true)
        expect(result.results.map((r) => r.order)).toEqual([3, 4])
        expect((await readTracksInOrder(setlistId)).map((t) => t.id)).toEqual([
            ...trackIds,
            ...result.results.map((r) => r.trackId),
        ])
        expect(await readOrdersSorted(setlistId)).toEqual([0, 1, 2, 3, 4])
    })

    it("concurrent appends serialize without duplicate slots or lost rows", async () => {
        const { setlistId } = await seedDriftedSetlist([0, 2, 5])
        const titles = Array.from({ length: 6 }, (_, i) => `Concurrent ${i}`)

        const results = await Promise.all(
            titles.map((title) => addTrackToSetlist(ADMIN, { setlistId, title })),
        )

        const ordered = await readTracksInOrder(setlistId)
        expect(ordered.map((t) => t.order)).toEqual(
            Array.from({ length: 9 }, (_, i) => i),
        )
        expect(new Set(ordered.map((t) => t.id)).size).toBe(9)
        expect(ordered.slice(3).map((t) => t.title).sort()).toEqual(titles.sort())
        expect(new Set(results.map((r) => (r as { trackId: string }).trackId)).size).toBe(6)
    })

    it("concurrent atomic bulk appends each preserve their block at the tail", async () => {
        const { setlistId } = await seedDriftedSetlist([0, 2, 5])
        const [a, b] = await Promise.all([
            bulkAddSetlistTracks(ADMIN, {
                setlistId,
                tracks: [{ title: "A1" }, { title: "A2" }],
            }),
            bulkAddSetlistTracks(ADMIN, {
                setlistId,
                tracks: [{ title: "B1" }, { title: "B2" }],
            }),
        ])

        const ordered = await readTracksInOrder(setlistId)
        expect(ordered.map((t) => t.order)).toEqual(
            Array.from({ length: 7 }, (_, i) => i),
        )
        const tailTitles = ordered.slice(3).map((t) => t.title)
        expect(tailTitles).toEqual(
            tailTitles[0].startsWith("A")
                ? ["A1", "A2", "B1", "B2"]
                : ["B1", "B2", "A1", "A2"],
        )
        expect(
            [a, b].flatMap((r) =>
                "results" in r
                    ? r.results.map((row) => row.trackId)
                    : [],
            ),
        ).toHaveLength(4)
    })
})
