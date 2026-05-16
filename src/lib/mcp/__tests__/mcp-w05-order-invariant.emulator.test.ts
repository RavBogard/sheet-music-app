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
 * Out of scope: `add_track_to_setlist` and `bulk_add_tracks` are also
 * leak sources (insert-shift doesn't heal pre-existing gaps); left for a
 * separate pass.
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
})
