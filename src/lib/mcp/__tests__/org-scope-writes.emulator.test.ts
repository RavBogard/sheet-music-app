import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
} from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

import {
    createSetlist,
    updateSetlist,
    addTrackToSetlist,
    updateSetlistTrack,
    swapChart,
    bulkUpdateSetlistTracks,
    bulkAddSetlistTracks,
    reorderSetlist,
    removeSetlistTrack,
    deleteSetlist,
    recomputeSetlistTrackCount,
} from "../tools/setlist-write"
import { cloneSetlist } from "../tools/clone-setlist"
import { cloneSetlistFromTemplate } from "../tools/templates"
import { updateSong } from "../tools/song-metadata"
import { deleteChart } from "../tools/library-upload"
import { listSetlists } from "../tools/setlists"
import { stampOrg } from "../org-context"

/**
 * v11-02-03 — MCP WRITE org-scoping against the Firebase emulator.
 *
 * The write-wall proof: a brotherslazaroff (BL) caller cannot mutate, delete, or
 * clone any CRC doc by id (every by-id write returns the standard not-found
 * envelope and leaves the CRC doc byte-unchanged), and every MCP create stamps
 * the caller's org. CRC (default-org) writes are unchanged.
 *
 * The chart-create tools (upload_chart / save_scraped_chart) route through the
 * shared processChartUpload pipeline (Storage + dedup), too heavy to drive in
 * the emulator — their org-stamping unit (`stampOrg`) is proven directly; the
 * wrapper wiring (org → stampOrg) is covered by tsc + the threading.
 */
describe("MCP write org-scoping (emulator)", () => {
    let app: App
    const ADMIN = "rabbi-daniel"
    const CRC = "crc"
    const BL = "brotherslazaroff"

    function db() {
        return getFirestore(app)
    }

    /** Rich-error machine code, or undefined if the result wasn't an error envelope. */
    function code(r: unknown): string | undefined {
        const e = r as { ok?: boolean; error?: { machine_code?: string } }
        return e && e.ok === false && e.error ? e.error.machine_code : undefined
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-org-scope-writes" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        for (const coll of [
            "setlists",
            "tracks",
            "songs",
            "library_index",
            "setlistTemplates",
            "users",
            "library_signals",
        ]) {
            const snap = await db().collection(coll).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
    })

    async function seed() {
        // Admin user — passes assertEditor + loadUploader (trusted-leader,
        // rate-limit bypass).
        await db()
            .collection("users")
            .doc(ADMIN)
            .set({ role: "admin", email: "rabbi@crc.test" })

        // CRC setlist + one track (the cross-tenant write target).
        await db().collection("setlists").doc("s-crc").set({
            name: "CRC Shabbat",
            orgId: CRC,
            date: "2026-06-05T00:00:00.000Z",
            trackCount: 1,
            songCount: 1,
            version: 1,
            ownerId: ADMIN,
        })
        await db().collection("tracks").doc("t-crc-1").set({
            setlistId: "s-crc",
            orgId: CRC,
            order: 0,
            type: "song",
            title: "CRC song",
            version: 1,
        })

        // BL setlist + one track (the clone source for the create-stamp test).
        await db().collection("setlists").doc("s-bl").set({
            name: "BL Gig",
            orgId: BL,
            date: "2026-06-06T00:00:00.000Z",
            trackCount: 1,
            songCount: 1,
            version: 1,
            ownerId: ADMIN,
        })
        await db().collection("tracks").doc("t-bl-1").set({
            setlistId: "s-bl",
            orgId: BL,
            order: 0,
            type: "song",
            title: "BL song",
            version: 1,
        })

        // CRC chart on both catalog surfaces (update_song / delete_chart target).
        await db()
            .collection("library_index")
            .doc("c-crc")
            .set({
                name: "CRC Chart.pdf",
                title: "CRC Chart.pdf",
                orgId: CRC,
                key: "C",
                status: "active",
                collection: "uploads",
                uploadedBy: ADMIN,
            })
        await db()
            .collection("songs")
            .doc("c-crc")
            .set({ title: "CRC Chart.pdf", orgId: CRC, defaults: { key: "C" } })

        // A BL template — cloneSetlistFromTemplate stamps the NEW setlist BL.
        // v11-05-01 org-scoped setlistTemplates reads, so the template must
        // carry orgId=BL to be visible to (and clonable by) a BL caller. (Prior
        // to v11-05-01 template read-scoping was deferred and this seed omitted
        // orgId; the v11-06-01 close-gate audit re-ran the full emulator suite
        // and updated this lagging fixture.)
        await db()
            .collection("setlistTemplates")
            .doc("tpl")
            .set({
                name: "BL template",
                templateType: "gig",
                ownerId: ADMIN,
                version: 1,
                orgId: BL,
                tracks: [{ type: "song", title: "Tmpl song", key: "G" }],
            })
    }

    // ─── AC-1: cross-tenant setlist mutation is denied (not-found wall) ─────────

    it("AC-1: every by-id setlist write by a BL caller on a CRC setlist → setlist_not_found, no mutation", async () => {
        await seed()

        expect(code(await updateSetlist(ADMIN, { id: "s-crc", name: "HACK" }, BL))).toBe(
            "setlist_not_found",
        )
        expect(
            code(await addTrackToSetlist(ADMIN, { setlistId: "s-crc", title: "x" }, BL)),
        ).toBe("setlist_not_found")
        expect(
            code(
                await updateSetlistTrack(
                    ADMIN,
                    { setlistId: "s-crc", trackId: "t-crc-1", patch: { key: "X" } },
                    BL,
                ),
            ),
        ).toBe("setlist_not_found")
        expect(
            code(
                await swapChart(
                    ADMIN,
                    { setlistId: "s-crc", trackId: "t-crc-1", newSongId: "c-crc" },
                    BL,
                ),
            ),
        ).toBe("setlist_not_found")
        expect(
            code(
                await reorderSetlist(
                    ADMIN,
                    { setlistId: "s-crc", orderedTrackIds: ["t-crc-1"] },
                    BL,
                ),
            ),
        ).toBe("setlist_not_found")
        expect(
            code(
                await bulkUpdateSetlistTracks(
                    ADMIN,
                    { setlistId: "s-crc", patches: [{ trackId: "t-crc-1", patch: { key: "Z" } }] },
                    BL,
                ),
            ),
        ).toBe("setlist_not_found")
        expect(
            code(
                await bulkAddSetlistTracks(
                    ADMIN,
                    { setlistId: "s-crc", tracks: [{ title: "y" }] },
                    BL,
                ),
            ),
        ).toBe("setlist_not_found")
        expect(
            code(await recomputeSetlistTrackCount(ADMIN, { setlistId: "s-crc" }, BL)),
        ).toBe("setlist_not_found")
        expect(
            code(await removeSetlistTrack(ADMIN, { setlistId: "s-crc", trackId: "t-crc-1" }, BL)),
        ).toBe("setlist_not_found")
        expect(code(await deleteSetlist(ADMIN, { id: "s-crc" }, BL))).toBe(
            "setlist_not_found",
        )

        // The CRC setlist + its track are byte-unchanged: still present, original
        // name + key, trackCount intact.
        const sl = (await db().collection("setlists").doc("s-crc").get()).data()
        expect(sl?.name).toBe("CRC Shabbat")
        expect(sl?.trackCount).toBe(1)
        const tr = (await db().collection("tracks").doc("t-crc-1").get()).data()
        expect(tr?.title).toBe("CRC song")
        expect(tr?.key).toBeUndefined()
    })

    // ─── AC-2: cross-tenant clone source is denied ──────────────────────────────

    it("AC-2: BL clone of a CRC source → setlist_not_found, no new setlist", async () => {
        await seed()
        const before = (await listSetlists(ADMIN, {}, BL)) as Array<{ id: string }>
        expect(code(await cloneSetlist(ADMIN, { sourceSetlistId: "s-crc" }, BL))).toBe(
            "setlist_not_found",
        )
        const after = (await listSetlists(ADMIN, {}, BL)) as Array<{ id: string }>
        expect(after.length).toBe(before.length)
    })

    // ─── AC-4: cross-tenant chart/song mutation is denied ───────────────────────

    it("AC-4: BL update_song / delete_chart on a CRC chart → not-found, doc untouched", async () => {
        await seed()
        expect(code(await updateSong(ADMIN, { id: "c-crc", key: "X" }, BL))).toBe(
            "song_not_found",
        )
        expect(code(await deleteChart(ADMIN, { fileId: "c-crc" }, BL))).toBe(
            "chart_not_found",
        )
        // Both catalog surfaces unchanged + still present.
        const li = (await db().collection("library_index").doc("c-crc").get()).data()
        expect(li?.key).toBe("C")
        expect(li?.orgId).toBe(CRC)
        const sg = (await db().collection("songs").doc("c-crc").get()).data()
        expect((sg?.defaults as { key?: string })?.key).toBe("C")
    })

    // ─── AC-3: MCP creates stamp the caller's org ───────────────────────────────

    it("AC-3: create_setlist stamps caller org on the setlist (+ inherited by tracks)", async () => {
        await seed()
        const created = (await createSetlist(ADMIN, { name: "BL new" }, BL)) as {
            setlistId: string
        }
        const sl = (await db().collection("setlists").doc(created.setlistId).get()).data()
        expect(sl?.orgId).toBe(BL)

        // A BL caller CAN write to its own BL setlist, and the track inherits BL.
        const added = (await addTrackToSetlist(
            ADMIN,
            { setlistId: created.setlistId, title: "BL row" },
            BL,
        )) as { ok: true; trackId: string }
        expect(added.ok).toBe(true)
        const tr = (await db().collection("tracks").doc(added.trackId).get()).data()
        expect(tr?.orgId).toBe(BL)
    })

    it("AC-3: clone_setlist of a BL source stamps the clone + every track BL", async () => {
        await seed()
        const cloned = (await cloneSetlist(ADMIN, { sourceSetlistId: "s-bl" }, BL)) as {
            setlistId: string
        }
        const sl = (await db().collection("setlists").doc(cloned.setlistId).get()).data()
        expect(sl?.orgId).toBe(BL)
        const tracks = await db()
            .collection("tracks")
            .where("setlistId", "==", cloned.setlistId)
            .get()
        expect(tracks.size).toBe(1)
        expect(tracks.docs.every((d) => d.data().orgId === BL)).toBe(true)
    })

    it("AC-3: clone_setlist_from_template stamps the new setlist + tracks BL", async () => {
        await seed()
        const made = (await cloneSetlistFromTemplate(
            ADMIN,
            { templateId: "tpl", newName: "BL from template" },
            BL,
        )) as { setlistId: string }
        const sl = (await db().collection("setlists").doc(made.setlistId).get()).data()
        expect(sl?.orgId).toBe(BL)
        const tracks = await db()
            .collection("tracks")
            .where("setlistId", "==", made.setlistId)
            .get()
        expect(tracks.size).toBe(1)
        expect(tracks.docs.every((d) => d.data().orgId === BL)).toBe(true)
    })

    it("AC-3: stampOrg tags a freshly-created chart on BOTH catalog surfaces", async () => {
        // Simulate processChartUpload output (no orgId yet) on both surfaces.
        await db()
            .collection("library_index")
            .doc("up-1")
            .set({ name: "New.pdf", status: "active" })
        await db().collection("songs").doc("up-1").set({ defaults: {} })

        await stampOrg(db(), "up-1", BL)

        expect((await db().collection("library_index").doc("up-1").get()).data()?.orgId).toBe(BL)
        expect((await db().collection("songs").doc("up-1").get()).data()?.orgId).toBe(BL)
    })

    // ─── AC-5: CRC (default-org) behavior unchanged + cross-read confirmation ────

    it("AC-5: a CRC caller's own-org write succeeds; BL creates stay invisible to CRC", async () => {
        await seed()
        // Own-org write succeeds and lands.
        const ok = (await updateSetlist(ADMIN, { id: "s-crc", name: "CRC renamed" }, CRC)) as {
            ok: boolean
        }
        expect(ok.ok).toBe(true)
        expect((await db().collection("setlists").doc("s-crc").get()).data()?.name).toBe(
            "CRC renamed",
        )

        // A BL create is surfaced to BL, hidden from CRC (ties write-stamp to v11-02-02 reads).
        const created = (await createSetlist(ADMIN, { name: "BL only" }, BL)) as {
            setlistId: string
        }
        const crcList = (await listSetlists(ADMIN, {}, CRC)) as Array<{ id: string }>
        const blList = (await listSetlists(ADMIN, {}, BL)) as Array<{ id: string }>
        expect(crcList.map((s) => s.id)).not.toContain(created.setlistId)
        expect(blList.map((s) => s.id)).toContain(created.setlistId)
    })
})
