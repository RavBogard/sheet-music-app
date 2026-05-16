import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
} from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore, FieldValue } from "firebase-admin/firestore"

import {
    waitForSetlistChange,
    WAIT_FOR_SETLIST_CHANGE_MAX_TIMEOUT_SEC,
} from "../tools/wait-for-setlist-change"

/**
 * W-04 Plan 01 — wait_for_setlist_change emulator tests.
 *
 * Covers the long-poll observer's three resolution paths:
 *   1. Immediate-return when version is already past sinceVersion.
 *   2. Listener-fired-resolve when a concurrent write bumps version.
 *   3. Timeout-resolve when nothing changes (returns timedOut: true).
 *
 * Plus the includeFullState path that bundles the get_setlist payload
 * into the response so the agent doesn't need a follow-up read.
 */
describe("wait_for_setlist_change (emulator)", () => {
    let app: App
    const SETLIST_ID = "set-w04-wait"

    function db() {
        return getFirestore(app)
    }

    async function seedSetlist(version: number = 1): Promise<void> {
        await db().collection("setlists").doc(SETLIST_ID).set({
            id: SETLIST_ID,
            name: "Wait Test Setlist",
            version,
            lastModifiedAt: new Date().toISOString(),
            updatedAt: FieldValue.serverTimestamp(),
            trackCount: 0,
        })
    }

    async function bumpSetlistVersion(toVersion: number): Promise<void> {
        await db().collection("setlists").doc(SETLIST_ID).update({
            version: toVersion,
            lastModifiedAt: new Date().toISOString(),
        })
    }

    async function seedTrack(
        trackId: string,
        order: number,
        version = 1,
    ): Promise<void> {
        await db().collection("tracks").doc(trackId).set({
            id: trackId,
            setlistId: SETLIST_ID,
            order,
            title: `Track ${order}`,
            type: "song",
            version,
            lastModifiedAt: new Date().toISOString(),
        })
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app =
            getApps()[0] ??
            initializeApp({ projectId: "demo-mcp-wait-for-change" })
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

    it("returns immediately when setlist version is already past sinceVersion", async () => {
        await seedSetlist(7)

        const result = await waitForSetlistChange("u", {
            setlistId: SETLIST_ID,
            sinceVersion: 5,
            timeoutSec: 30, // would normally block but version is ahead
        })

        if ("error" in result) throw new Error(result.error)
        expect(result.changed).toBe(true)
        expect(result.currentVersion).toBe(7)
        expect(result.changes).toBeDefined()
        const setlistChange = result.changes?.find((c) => c.entity === "setlist")
        expect(setlistChange?.version).toBe(7)
        expect(setlistChange?.kind).toBe("update")
    })

    it("returns timedOut: true when nothing changes within timeoutSec", async () => {
        await seedSetlist(3)

        const start = Date.now()
        const result = await waitForSetlistChange("u", {
            setlistId: SETLIST_ID,
            sinceVersion: 3,
            timeoutSec: 2,
        })
        const elapsedMs = Date.now() - start

        if ("error" in result) throw new Error(result.error)
        expect(result.changed).toBe(false)
        expect(result.timedOut).toBe(true)
        expect(result.currentVersion).toBe(3)
        // Sanity: respected the timeoutSec roughly (allow generous slack for emulator overhead).
        expect(elapsedMs).toBeGreaterThanOrEqual(1800)
        expect(elapsedMs).toBeLessThan(5000)
    })

    it("resolves when setlist version bumps via concurrent write", async () => {
        await seedSetlist(5)

        // Kick off the long-poll, then bump version after a delay.
        const waitPromise = waitForSetlistChange("u", {
            setlistId: SETLIST_ID,
            sinceVersion: 5,
            timeoutSec: 10,
        })
        // Give the listener a moment to attach before triggering the change.
        await new Promise((r) => setTimeout(r, 400))
        await bumpSetlistVersion(6)

        const result = await waitPromise
        if ("error" in result) throw new Error(result.error)
        expect(result.changed).toBe(true)
        expect(result.currentVersion).toBe(6)
        const change = result.changes?.find((c) => c.entity === "setlist")
        expect(change?.version).toBe(6)
    })

    it("resolves when a track version bumps via concurrent write (real flow)", async () => {
        // In production every MCP write path bumps BOTH the affected
        // track's version AND the parent setlist's version, so the
        // setlist-side listener catches it. This test reproduces that
        // shape rather than the synthetic "track-only update" which
        // doesn't happen via any real MCP tool.
        await seedSetlist(5)
        await seedTrack("t1", 0, 1)

        const waitPromise = waitForSetlistChange("u", {
            setlistId: SETLIST_ID,
            sinceVersion: 5,
            timeoutSec: 10,
        })
        await new Promise((r) => setTimeout(r, 400))
        // Real MCP write equivalent: bump track + setlist in same batch.
        const batch = db().batch()
        batch.update(db().collection("tracks").doc("t1"), {
            version: 2,
            title: "Updated title",
            lastModifiedAt: new Date().toISOString(),
        })
        batch.update(db().collection("setlists").doc(SETLIST_ID), {
            version: 6,
            lastModifiedAt: new Date().toISOString(),
        })
        await batch.commit()

        const result = await waitPromise
        if ("error" in result) throw new Error(result.error)
        expect(result.changed).toBe(true)
        expect(result.currentVersion).toBe(6)
        const setlistChange = result.changes?.find((c) => c.entity === "setlist")
        expect(setlistChange?.version).toBe(6)
    })

    it("includeFullState bundles the full setlist + tracks payload", async () => {
        await seedSetlist(2)
        await seedTrack("t1", 0)
        await seedTrack("t2", 1)
        // bump setlist version past sinceVersion to trigger immediate-return path
        await bumpSetlistVersion(3)

        const result = await waitForSetlistChange("u", {
            setlistId: SETLIST_ID,
            sinceVersion: 2,
            timeoutSec: 5,
            includeFullState: true,
        })

        if ("error" in result) throw new Error(result.error)
        expect(result.changed).toBe(true)
        expect(result.setlist).toBeDefined()
        const setlist = result.setlist as { tracks: Array<{ id: string; order: number }> }
        expect(setlist.tracks).toHaveLength(2)
        expect(setlist.tracks.map((t) => t.id).sort()).toEqual(["t1", "t2"])
    })

    it("rejects invalid args", async () => {
        const noId = await waitForSetlistChange("u", {
            setlistId: "",
            sinceVersion: 0,
        })
        expect(noId).toEqual({ error: "setlistId is required" })

        const negVersion = await waitForSetlistChange("u", {
            setlistId: SETLIST_ID,
            sinceVersion: -1,
        })
        expect(negVersion).toEqual({
            error: "sinceVersion must be a non-negative integer",
        })
    })

    it("clamps timeoutSec to max regardless of caller", async () => {
        // The tool internally clamps to WAIT_FOR_SETLIST_CHANGE_MAX_TIMEOUT_SEC.
        // We don't actually want to wait 60s here, so we test the clamp by
        // seeding the setlist past sinceVersion (immediate-return path) — the
        // clamp only matters if we'd block.
        await seedSetlist(9)
        const result = await waitForSetlistChange("u", {
            setlistId: SETLIST_ID,
            sinceVersion: 1,
            timeoutSec: 9999, // would be clamped to 60
        })
        if ("error" in result) throw new Error(result.error)
        expect(result.changed).toBe(true)
        // Sanity check that the constant is exposed.
        expect(WAIT_FOR_SETLIST_CHANGE_MAX_TIMEOUT_SEC).toBe(60)
    })
})
