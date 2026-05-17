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
import { getFirestore } from "firebase-admin/firestore"

import {
    addTrackToSetlist,
    createSetlist,
    deleteSetlist,
    removeSetlistTrack,
    reorderSetlist,
    updateSetlist,
    updateSetlistTrack,
} from "../tools/setlist-write"

/**
 * W-04 Plan 02 — optimistic-concurrency gating across the five single-row
 * write paths: update_track, update_setlist, remove_track, reorder_setlist,
 * delete_setlist.
 *
 * Each path is tested in three modes:
 *   - omitted lastSeenVersion → write succeeds (back-compat).
 *   - matching lastSeenVersion → write succeeds and bumps version.
 *   - stale lastSeenVersion   → write rejects with the stale_version
 *     envelope and the underlying doc is NOT mutated.
 *
 * Plus update_track + remove_track with a missing trackId → trackNotFound
 * envelope carrying setlistVersion + setlistLastModifiedAt.
 *
 * Runs only under `npm run test:emulator`.
 */
describe("W-04 Plan 02 — lastSeenVersion gating (emulator)", () => {
    let app: App
    const ADMIN = "rabbi-daniel"

    function db() {
        return getFirestore(app)
    }

    async function newSetlist(): Promise<string> {
        const r = (await createSetlist(ADMIN, { name: "Plan 02 Test" })) as {
            setlistId: string
        }
        return r.setlistId
    }

    async function addOne(setlistId: string, title = "Track A"): Promise<string> {
        const r = (await addTrackToSetlist(ADMIN, {
            setlistId,
            title,
            type: "song",
        })) as { trackId: string }
        return r.trackId
    }

    async function readVersion(coll: string, id: string): Promise<number> {
        const snap = await db().collection(coll).doc(id).get()
        const v = (snap.data() as Record<string, unknown> | undefined)?.version
        return typeof v === "number" ? v : 0
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app =
            getApps()[0] ??
            initializeApp({ projectId: "demo-mcp-w04-plan02" })
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

    // ─── update_track ──────────────────────────────────────────────────────

    it("update_track rejects with stale_version envelope when lastSeenVersion mismatches", async () => {
        const setlistId = await newSetlist()
        const trackId = await addOne(setlistId)
        const versionBeforeStaleAttempt = await readVersion("tracks", trackId)

        const result = (await updateSetlistTrack(ADMIN, {
            setlistId,
            trackId,
            patch: { title: "Renamed by ghost" },
            lastSeenVersion: versionBeforeStaleAttempt - 1, // intentionally stale
        })) as Record<string, unknown>

        expect(result.error).toBe("stale_version")
        expect(result.currentVersion).toBe(versionBeforeStaleAttempt)
        expect(result.lastSeenVersion).toBe(versionBeforeStaleAttempt - 1)
        expect(result.hint).toMatch(/get_setlist/)
        // W04-track-stale-envelope NOTE (v6 bugstomp): track-scoped stale
        // envelope hydrates BOTH lastModifiedBy + lastModifiedAt from the
        // parent setlist (not the track), matching setlist-scoped writes.
        const envSetlist = result.setlist as
            | { lastModifiedBy?: unknown; lastModifiedAt?: unknown }
            | undefined
        expect(envSetlist).toBeDefined()
        expect(typeof envSetlist!.lastModifiedBy).toBe("string")
        expect(envSetlist!.lastModifiedBy).toBe(ADMIN)
        expect(typeof envSetlist!.lastModifiedAt).toBe("string")

        // Doc must NOT have mutated — version is unchanged and title intact.
        const afterSnap = await db().collection("tracks").doc(trackId).get()
        const after = afterSnap.data() as Record<string, unknown>
        expect(after.version).toBe(versionBeforeStaleAttempt)
        expect(after.title).toBe("Track A")
    })

    it("update_track succeeds when lastSeenVersion matches and bumps the version", async () => {
        const setlistId = await newSetlist()
        const trackId = await addOne(setlistId)
        const current = await readVersion("tracks", trackId)

        const result = (await updateSetlistTrack(ADMIN, {
            setlistId,
            trackId,
            patch: { title: "Renamed safely" },
            lastSeenVersion: current,
        })) as { ok: true; track: Record<string, unknown> }

        expect(result.ok).toBe(true)
        expect(await readVersion("tracks", trackId)).toBe(current + 1)
        const after = (
            await db().collection("tracks").doc(trackId).get()
        ).data() as Record<string, unknown>
        expect(after.title).toBe("Renamed safely")
    })

    it("update_track preserves pre-W-04 last-writer-wins when lastSeenVersion is omitted", async () => {
        const setlistId = await newSetlist()
        const trackId = await addOne(setlistId)

        // Background writer bumps version first.
        await db().collection("tracks").doc(trackId).update({ key: "Em" })

        const result = (await updateSetlistTrack(ADMIN, {
            setlistId,
            trackId,
            patch: { title: "No gate" },
        })) as { ok: true; track: Record<string, unknown> }

        expect(result.ok).toBe(true)
    })

    it("update_track returns track_not_found envelope with setlistVersion when trackId is gone", async () => {
        const setlistId = await newSetlist()

        const result = (await updateSetlistTrack(ADMIN, {
            setlistId,
            trackId: "track-that-never-existed",
            patch: { title: "x" },
        })) as Record<string, unknown>

        expect(result.error).toBe("track_not_found")
        expect(result.message).toMatch(/track-that-never-existed/)
        expect(typeof result.setlistVersion).toBe("number")
        // Setlist exists but was just created → version is at least 1.
        expect(result.setlistVersion as number).toBeGreaterThanOrEqual(1)
        expect(result.hint).toMatch(/get_setlist/)
    })

    // ─── update_setlist ────────────────────────────────────────────────────

    it("update_setlist rejects with stale_version envelope on mismatch", async () => {
        const setlistId = await newSetlist()
        const current = await readVersion("setlists", setlistId)

        const result = (await updateSetlist(ADMIN, {
            id: setlistId,
            name: "Stale rename",
            lastSeenVersion: current - 1,
        })) as Record<string, unknown>

        expect(result.error).toBe("stale_version")
        expect(result.currentVersion).toBe(current)
        expect(result.lastSeenVersion).toBe(current - 1)

        const after = (
            await db().collection("setlists").doc(setlistId).get()
        ).data() as Record<string, unknown>
        expect(after.version).toBe(current) // unchanged
        expect(after.name).toBe("Plan 02 Test") // unchanged
    })

    it("update_setlist with matching lastSeenVersion writes and bumps version", async () => {
        const setlistId = await newSetlist()
        const current = await readVersion("setlists", setlistId)

        const result = (await updateSetlist(ADMIN, {
            id: setlistId,
            name: "Safely renamed",
            lastSeenVersion: current,
        })) as { ok: true; setlist: Record<string, unknown> }

        expect(result.ok).toBe(true)
        expect(await readVersion("setlists", setlistId)).toBe(current + 1)
    })

    // ─── remove_track ──────────────────────────────────────────────────────

    it("remove_track rejects with stale_version envelope on mismatch", async () => {
        const setlistId = await newSetlist()
        const trackId = await addOne(setlistId)
        const current = await readVersion("tracks", trackId)

        const result = (await removeSetlistTrack(ADMIN, {
            setlistId,
            trackId,
            lastSeenVersion: current - 1,
        })) as Record<string, unknown>

        expect(result.error).toBe("stale_version")
        expect(result.currentVersion).toBe(current)
        // W04-track-stale-envelope NOTE (v6 bugstomp): remove_track gets the
        // same lastModifiedBy + lastModifiedAt hydration from parent setlist
        // as update_track.
        const envSetlist = result.setlist as
            | { lastModifiedBy?: unknown; lastModifiedAt?: unknown }
            | undefined
        expect(envSetlist).toBeDefined()
        expect(envSetlist!.lastModifiedBy).toBe(ADMIN)
        expect(typeof envSetlist!.lastModifiedAt).toBe("string")

        // Track must still exist.
        const stillThere = await db().collection("tracks").doc(trackId).get()
        expect(stillThere.exists).toBe(true)
    })

    it("remove_track succeeds with matching lastSeenVersion", async () => {
        const setlistId = await newSetlist()
        const trackId = await addOne(setlistId)
        const current = await readVersion("tracks", trackId)

        const result = (await removeSetlistTrack(ADMIN, {
            setlistId,
            trackId,
            lastSeenVersion: current,
        })) as { ok: true }
        expect(result.ok).toBe(true)
        const gone = await db().collection("tracks").doc(trackId).get()
        expect(gone.exists).toBe(false)
    })

    it("remove_track returns track_not_found envelope with setlistVersion", async () => {
        const setlistId = await newSetlist()

        const result = (await removeSetlistTrack(ADMIN, {
            setlistId,
            trackId: "phantom-track",
        })) as Record<string, unknown>

        expect(result.error).toBe("track_not_found")
        expect(typeof result.setlistVersion).toBe("number")
        expect(result.hint).toMatch(/get_setlist/)
    })

    // ─── reorder_setlist ───────────────────────────────────────────────────

    it("reorder_setlist rejects with setlist-level stale_version envelope on mismatch", async () => {
        const setlistId = await newSetlist()
        const t1 = await addOne(setlistId, "T1")
        const t2 = await addOne(setlistId, "T2")
        const current = await readVersion("setlists", setlistId)

        const result = (await reorderSetlist(ADMIN, {
            setlistId,
            orderedTrackIds: [t2, t1],
            lastSeenVersion: current - 1,
        })) as Record<string, unknown>

        expect(result.error).toBe("stale_version")
        expect(result.currentVersion).toBe(current)

        // Order must be unchanged: t1 still at order 0.
        const t1After = (
            await db().collection("tracks").doc(t1).get()
        ).data() as Record<string, unknown>
        expect(t1After.order).toBe(0)
    })

    it("reorder_setlist with matching setlist lastSeenVersion swaps order and bumps versions", async () => {
        const setlistId = await newSetlist()
        const t1 = await addOne(setlistId, "T1")
        const t2 = await addOne(setlistId, "T2")
        const setlistVersion = await readVersion("setlists", setlistId)

        const result = (await reorderSetlist(ADMIN, {
            setlistId,
            orderedTrackIds: [t2, t1],
            lastSeenVersion: setlistVersion,
        })) as { ok: true }
        expect(result.ok).toBe(true)

        const t1After = (
            await db().collection("tracks").doc(t1).get()
        ).data() as Record<string, unknown>
        const t2After = (
            await db().collection("tracks").doc(t2).get()
        ).data() as Record<string, unknown>
        expect(t1After.order).toBe(1)
        expect(t2After.order).toBe(0)
        expect(await readVersion("setlists", setlistId)).toBe(
            setlistVersion + 1,
        )
    })

    // ─── delete_setlist ────────────────────────────────────────────────────

    it("delete_setlist rejects with stale_version envelope on mismatch (setlist + tracks survive)", async () => {
        const setlistId = await newSetlist()
        const trackId = await addOne(setlistId)
        const current = await readVersion("setlists", setlistId)

        const result = (await deleteSetlist(ADMIN, {
            id: setlistId,
            lastSeenVersion: current - 1,
        })) as Record<string, unknown>

        expect(result.error).toBe("stale_version")
        expect(result.currentVersion).toBe(current)

        // Both setlist and track must still exist.
        expect((await db().collection("setlists").doc(setlistId).get()).exists).toBe(true)
        expect((await db().collection("tracks").doc(trackId).get()).exists).toBe(true)
    })

    it("delete_setlist with matching lastSeenVersion cascades", async () => {
        const setlistId = await newSetlist()
        const trackId = await addOne(setlistId)
        const current = await readVersion("setlists", setlistId)

        const result = (await deleteSetlist(ADMIN, {
            id: setlistId,
            lastSeenVersion: current,
        })) as { ok: true; tracksDeleted: number }
        expect(result.ok).toBe(true)
        expect(result.tracksDeleted).toBe(1)

        expect((await db().collection("setlists").doc(setlistId).get()).exists).toBe(false)
        expect((await db().collection("tracks").doc(trackId).get()).exists).toBe(false)
    })
})
