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
    bulkUpdateSetlistTracks,
    createSetlist,
} from "../tools/setlist-write"
import { publishSetlist } from "../tools/setlist-publish"

/**
 * W-04 Plan 03 — bulk_update_tracks per-row `lastSeenVersion` pre-flight
 * + publish_setlist optional setlist-level version gate.
 *
 * Atomic-mode pre-flight: when any patch carries `lastSeenVersion` that
 * doesn't match the track's current version, the WHOLE batch rejects with
 * `staleRows[]` (and per-row `results` carry `error: { machine_code: "stale_version" }` for
 * the stale rows + a rollback message for the rest). Zero writes land.
 *
 * Best-effort mode: stale rows skip with `error: { machine_code: "stale_version" }` while
 * valid rows commit normally.
 *
 * publish_setlist gate fires BEFORE the chart-health pre-flight + recipient
 * resolution so a stale call is cheap. Stub email/push/sms via empty
 * recipients so the test doesn't try to actually fan out.
 *
 * Runs only under `npm run test:emulator`.
 */
describe("W-04 Plan 03 — bulk + publish version gating (emulator)", () => {
    let app: App
    const ADMIN = "rabbi-daniel"

    function db() {
        return getFirestore(app)
    }

    async function newSetlistWithTracks(
        titles: string[],
    ): Promise<{ setlistId: string; trackIds: string[] }> {
        const r = (await createSetlist(ADMIN, {
            name: "Plan 03 Test",
        })) as { setlistId: string }
        const trackIds: string[] = []
        for (const title of titles) {
            const t = (await addTrackToSetlist(ADMIN, {
                setlistId: r.setlistId,
                title,
                type: "song",
            })) as { trackId: string }
            trackIds.push(t.trackId)
        }
        return { setlistId: r.setlistId, trackIds }
    }

    async function readVersion(
        coll: string,
        id: string,
    ): Promise<number> {
        const snap = await db().collection(coll).doc(id).get()
        const v = (snap.data() as unknown as Record<string, unknown> | undefined)?.version
        return typeof v === "number" ? v : 0
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app =
            getApps()[0] ??
            initializeApp({ projectId: "demo-mcp-w04-plan03" })
        await db()
            .collection("users")
            .doc(ADMIN)
            .set({
                displayName: "Rabbi Daniel",
                role: "admin",
                email: "rabbi@example.com",
            })
        // Seed at least one bondable song for the publish_setlist tests'
        // chart-health pre-flight, plus a library_index row.
        await db()
            .collection("songs")
            .doc("song-bondable")
            .set({ title: "Bondable.pdf" })
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

    // ─── bulk_update_tracks atomic pre-flight ──────────────────────────────

    it("atomic mode: one stale lastSeenVersion rolls back the whole batch with staleRows[]", async () => {
        const { setlistId, trackIds } = await newSetlistWithTracks([
            "A",
            "B",
            "C",
        ])
        const v0 = await readVersion("tracks", trackIds[0])
        const v1 = await readVersion("tracks", trackIds[1])
        const v2 = await readVersion("tracks", trackIds[2])

        const result = (await bulkUpdateSetlistTracks(ADMIN, {
            setlistId,
            mode: "atomic",
            patches: [
                {
                    trackId: trackIds[0],
                    patch: { title: "New A" },
                    lastSeenVersion: v0,
                },
                {
                    trackId: trackIds[1],
                    patch: { title: "New B" },
                    lastSeenVersion: v1 - 1, // intentionally stale
                },
                {
                    trackId: trackIds[2],
                    patch: { title: "New C" },
                    lastSeenVersion: v2,
                },
            ],
        })) as unknown as {
            ok: true
            committed: boolean
            results: Array<Record<string, unknown>>
            staleRows?: Array<{
                trackId: string
                currentVersion: number
                lastSeenVersion: number
            }>
        }

        expect(result.committed).toBe(false)
        expect(result.staleRows).toBeDefined()
        expect(result.staleRows!.length).toBe(1)
        expect(result.staleRows![0].trackId).toBe(trackIds[1])
        expect(result.staleRows![0].currentVersion).toBe(v1)

        // Each row in `results` carries the appropriate error code: stale_version
        // for the gated row, rollback for the others. Per-row `error` is a flat
        // string (different code path from the top-level rich envelope — see
        // server-tracks-write.ts atomic-rollback path which emits `error:
        // "stale_version"` and `error: "Rolled back: ..."`).
        const byId = new Map(
            result.results.map((r) => [r.trackId as string, r]),
        )
        expect(byId.get(trackIds[1])!.error).toBe("stale_version")
        expect(byId.get(trackIds[0])!.error).toMatch(/Rolled back/)
        expect(byId.get(trackIds[2])!.error).toMatch(/Rolled back/)

        // No row actually committed — titles unchanged, versions unchanged.
        const after0 = (await db().collection("tracks").doc(trackIds[0]).get()).data() as unknown as Record<string, unknown>
        expect(after0.title).toBe("A")
        expect(after0.version).toBe(v0)
    })

    it("atomic mode: all patches match → batch commits + every row's version bumps by 1", async () => {
        const { setlistId, trackIds } = await newSetlistWithTracks(["A", "B"])
        const v0 = await readVersion("tracks", trackIds[0])
        const v1 = await readVersion("tracks", trackIds[1])

        const result = (await bulkUpdateSetlistTracks(ADMIN, {
            setlistId,
            mode: "atomic",
            patches: [
                {
                    trackId: trackIds[0],
                    patch: { title: "Renamed A" },
                    lastSeenVersion: v0,
                },
                {
                    trackId: trackIds[1],
                    patch: { title: "Renamed B" },
                    lastSeenVersion: v1,
                },
            ],
        })) as { ok: true; committed: boolean; staleRows?: unknown }

        expect(result.committed).toBe(true)
        expect(result.staleRows).toBeUndefined()
        expect(await readVersion("tracks", trackIds[0])).toBe(v0 + 1)
        expect(await readVersion("tracks", trackIds[1])).toBe(v1 + 1)
    })

    it("atomic mode: omitted lastSeenVersion → pre-W-04 behavior (no rejection)", async () => {
        const { setlistId, trackIds } = await newSetlistWithTracks(["A", "B"])
        // Background bump on trackIds[0] before our call.
        await db().collection("tracks").doc(trackIds[0]).update({ key: "Em" })

        const result = (await bulkUpdateSetlistTracks(ADMIN, {
            setlistId,
            mode: "atomic",
            patches: [
                { trackId: trackIds[0], patch: { title: "No gate" } },
                { trackId: trackIds[1], patch: { title: "No gate" } },
            ],
        })) as { ok: true; committed: boolean }
        expect(result.committed).toBe(true)
    })

    // ─── bulk_update_tracks best-effort skip ───────────────────────────────

    it("best-effort: stale row skipped with error='stale_version'; other rows commit", async () => {
        const { setlistId, trackIds } = await newSetlistWithTracks([
            "A",
            "B",
            "C",
        ])
        const v0 = await readVersion("tracks", trackIds[0])
        const v1 = await readVersion("tracks", trackIds[1])
        const v2 = await readVersion("tracks", trackIds[2])

        const result = (await bulkUpdateSetlistTracks(ADMIN, {
            setlistId,
            mode: "best-effort",
            patches: [
                {
                    trackId: trackIds[0],
                    patch: { title: "New A" },
                    lastSeenVersion: v0,
                },
                {
                    trackId: trackIds[1],
                    patch: { title: "New B" },
                    lastSeenVersion: v1 - 1, // stale
                },
                {
                    trackId: trackIds[2],
                    patch: { title: "New C" },
                    lastSeenVersion: v2,
                },
            ],
        })) as unknown as {
            ok: true
            committed: boolean
            results: Array<Record<string, unknown>>
        }

        expect(result.committed).toBe(true) // partial success allowed
        const byId = new Map(
            result.results.map((r) => [r.trackId as string, r]),
        )
        expect(byId.get(trackIds[0])!.ok).toBe(true)
        expect(byId.get(trackIds[1])!.ok).toBe(false)
        // Per-row error is a flat string in the best-effort path too (see comment
        // above; server-tracks-write.ts emits `error: "stale_version"` per row).
        expect(byId.get(trackIds[1])!.error).toBe("stale_version")
        expect(byId.get(trackIds[2])!.ok).toBe(true)

        // Stale row's title is unchanged; valid rows committed.
        const stillB = (
            await db().collection("tracks").doc(trackIds[1]).get()
        ).data() as unknown as Record<string, unknown>
        expect(stillB.title).toBe("B")
        expect(stillB.version).toBe(v1)
        const newA = (
            await db().collection("tracks").doc(trackIds[0]).get()
        ).data() as unknown as Record<string, unknown>
        expect(newA.title).toBe("New A")
    })

    // ─── publish_setlist gate ──────────────────────────────────────────────

    it("publish_setlist rejects with stale_version envelope on mismatched lastSeenVersion", async () => {
        const r = (await createSetlist(ADMIN, {
            name: "Publish Stale Test",
        })) as { setlistId: string }
        await addTrackToSetlist(ADMIN, {
            setlistId: r.setlistId,
            songId: "song-bondable",
            title: "Bondable",
        })
        const setlistVersion = await readVersion("setlists", r.setlistId)

        const result = (await publishSetlist(ADMIN, {
            setlistId: r.setlistId,
            recipients: [], // no fan-out — keeps test hermetic
            dryRun: false,
            force: true, // bypass chart-health (no real bytes in emulator)
            lastSeenVersion: setlistVersion - 1, // intentionally stale
        })) as unknown as Record<string, unknown>

        expect((result.error as { machine_code: string }).machine_code).toBe("stale_version")
        expect(result.currentVersion).toBe(setlistVersion)
        expect(result.lastSeenVersion).toBe(setlistVersion - 1)

        // No publish-state mutation occurred.
        const after = (
            await db().collection("setlists").doc(r.setlistId).get()
        ).data() as unknown as Record<string, unknown>
        expect(after.publishedAt).toBeUndefined()
        expect(after.version).toBe(setlistVersion)
    })

    it("publish_setlist with matching lastSeenVersion publishes and bumps version", async () => {
        const r = (await createSetlist(ADMIN, {
            name: "Publish Happy Test",
        })) as { setlistId: string }
        await addTrackToSetlist(ADMIN, {
            setlistId: r.setlistId,
            songId: "song-bondable",
            title: "Bondable",
        })
        const setlistVersion = await readVersion("setlists", r.setlistId)

        const result = (await publishSetlist(ADMIN, {
            setlistId: r.setlistId,
            recipients: [],
            dryRun: false,
            force: true,
            lastSeenVersion: setlistVersion,
        })) as { ok: true; dryRun: boolean }
        expect(result.ok).toBe(true)
        expect(await readVersion("setlists", r.setlistId)).toBe(
            setlistVersion + 1,
        )
    })

    it("publish_setlist dryRun gate fires too — stale dryRun reports refuse", async () => {
        const r = (await createSetlist(ADMIN, {
            name: "Publish DryRun Stale",
        })) as { setlistId: string }
        await addTrackToSetlist(ADMIN, {
            setlistId: r.setlistId,
            songId: "song-bondable",
            title: "Bondable",
        })
        const setlistVersion = await readVersion("setlists", r.setlistId)

        const result = (await publishSetlist(ADMIN, {
            setlistId: r.setlistId,
            recipients: [],
            dryRun: true,
            lastSeenVersion: setlistVersion - 1,
        })) as unknown as Record<string, unknown>
        expect((result.error as { machine_code: string }).machine_code).toBe("stale_version")
    })

    it("publish_setlist omitted lastSeenVersion → pre-W-04 behavior (no gate)", async () => {
        const r = (await createSetlist(ADMIN, {
            name: "Publish No Gate",
        })) as { setlistId: string }
        await addTrackToSetlist(ADMIN, {
            setlistId: r.setlistId,
            songId: "song-bondable",
            title: "Bondable",
        })
        // Background mutation bumps version before our publish.
        await db().collection("setlists").doc(r.setlistId).update({
            serviceNotes: "background tweak",
        })

        const result = (await publishSetlist(ADMIN, {
            setlistId: r.setlistId,
            recipients: [],
            dryRun: false,
            force: true,
            // lastSeenVersion intentionally omitted
        })) as { ok: true }
        expect(result.ok).toBe(true)
    })
})
