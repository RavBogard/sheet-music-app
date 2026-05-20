import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

import { reviewChartBonds } from "../tools/chart-bond-audit"
import { cloneSetlist } from "../tools/clone-setlist"

/**
 * setlist-fixes Lane B (Bug 1 + Bug 4 + UX-7) — emulator coverage.
 *
 *  - review_chart_bonds flags a wrong bond (Barchu → Ahava Raba.pdf) and passes
 *    a clean bond (Hineh Ma Tov → Hineh_Ma_Tov_Lev.pdf); unbonded rows ignored.
 *  - role gate / rate-limit bypass mirrors verify_setlist_charts (musician
 *    passes the read; missing setlist → typed error).
 *  - clone_setlist surfaces bondReviewCount + staleMetadataCandidates additively
 *    without changing existing fields or write behavior.
 *
 * Runs only via `npm run test:emulator`.
 */
describe("MCP review_chart_bonds + clone audit (emulator)", () => {
    let app: App
    const ADMIN = "rabbi-daniel"
    const MEMBER = "guest-musician"

    function db() {
        return getFirestore(app)
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-chart-bond-audit" })
        await db()
            .collection("users")
            .doc(ADMIN)
            .set({ displayName: "Rabbi Daniel", role: "admin" })
        await db()
            .collection("users")
            .doc(MEMBER)
            .set({ displayName: "Guest", role: "musician" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        for (const col of ["setlists", "tracks", "library_index"]) {
            const snap = await db().collection(col).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
    })

    /** Catalog rows whose `name` is the raw chart filename. */
    async function seedLibrary() {
        await db()
            .collection("library_index")
            .doc("ahava-file")
            .set({ id: "ahava-file", name: "Ahava Raba.pdf" })
        await db()
            .collection("library_index")
            .doc("hineh-file")
            .set({ id: "hineh-file", name: "Hineh_Ma_Tov_Lev.pdf" })
    }

    /** Setlist with a wrong bond (Barchu→Ahava), a clean bond, and a header. */
    async function seedSetlist(id: string, extras?: Record<string, unknown>) {
        await db()
            .collection("setlists")
            .doc(id)
            .set({ id, name: "Shabbat Morning", ownerId: ADMIN, ...extras })
        await db().collection("tracks").doc(`${id}-t1`).set({
            id: `${id}-t1`,
            setlistId: id,
            order: 0,
            type: "song",
            title: "Barchu",
            fileId: "ahava-file",
        })
        await db().collection("tracks").doc(`${id}-t2`).set({
            id: `${id}-t2`,
            setlistId: id,
            order: 1,
            type: "song",
            title: "Hineh Ma Tov",
            fileId: "hineh-file",
        })
        await db().collection("tracks").doc(`${id}-t3`).set({
            id: `${id}-t3`,
            setlistId: id,
            order: 2,
            type: "header",
            title: "D'var Torah",
        })
    }

    it("flags the wrong bond and clears the clean one", async () => {
        await seedLibrary()
        await seedSetlist("sl-audit")

        const res = (await reviewChartBonds(ADMIN, {
            setlistId: "sl-audit",
        })) as {
            ok: true
            trackCount: number
            bondedCount: number
            mismatchCount: number
            rows: Array<{
                trackId: string
                chartFileName: string | null
                mismatch: boolean
            }>
        }

        expect(res.ok).toBe(true)
        expect(res.trackCount).toBe(3)
        expect(res.bondedCount).toBe(2) // header row has no fileId
        expect(res.mismatchCount).toBe(1)

        const barchu = res.rows.find((r) => r.trackId === "sl-audit-t1")
        expect(barchu?.mismatch).toBe(true)
        expect(barchu?.chartFileName).toBe("Ahava Raba.pdf")

        const hineh = res.rows.find((r) => r.trackId === "sl-audit-t2")
        expect(hineh?.mismatch).toBe(false)
    })

    it("reports chartFileName:null for a phantom bond (no catalog row)", async () => {
        // No seedLibrary — the fileIds have no library_index doc.
        await seedSetlist("sl-phantom")
        const res = (await reviewChartBonds(ADMIN, {
            setlistId: "sl-phantom",
        })) as {
            mismatchCount: number
            rows: Array<{ trackId: string; chartFileName: string | null; mismatch: boolean }>
        }
        // Can't assert a wrong SONG without a filename — byte-health is
        // verify_setlist_charts' job, so a phantom bond is never a mismatch.
        expect(res.mismatchCount).toBe(0)
        const barchu = res.rows.find((r) => r.trackId === "sl-phantom-t1")
        expect(barchu?.chartFileName).toBeNull()
        expect(barchu?.mismatch).toBe(false)
    })

    it("musician may run the read (mirrors verify_setlist_charts gate)", async () => {
        await seedLibrary()
        await seedSetlist("sl-musician")
        const res = await reviewChartBonds(MEMBER, { setlistId: "sl-musician" })
        expect((res as { ok: boolean }).ok).toBe(true)
    })

    it("missing setlist surfaces a typed error", async () => {
        const res = await reviewChartBonds(ADMIN, { setlistId: "nope" })
        expect(res).toMatchObject({
            ok: false,
            error: { machine_code: "setlist_not_found" },
        })
    })

    it("rejects an empty setlistId", async () => {
        const res = await reviewChartBonds(ADMIN, { setlistId: "  " })
        expect(res).toMatchObject({
            ok: false,
            error: { machine_code: "invalid_argument" },
        })
    })

    it("clone surfaces bondReviewCount + staleMetadataCandidates additively", async () => {
        await seedLibrary()
        // Source carries a wrong bond AND occasion-specific metadata.
        await db().collection("setlists").doc("src").set({
            id: "src",
            name: "Shabbat Morning — Parashat Emor",
            ownerId: ADMIN,
            serviceNotes: "Yizkor remembrance — 2026-05-02",
            templateType: "shabbat-morning",
        })
        await db().collection("tracks").doc("src-t1").set({
            id: "src-t1",
            setlistId: "src",
            order: 0,
            type: "song",
            title: "Barchu", // bonded to Ahava Raba.pdf → mismatch
            fileId: "ahava-file",
        })
        await db().collection("tracks").doc("src-t2").set({
            id: "src-t2",
            setlistId: "src",
            order: 1,
            type: "header",
            title: "Torah Service — Parashat Emor", // stale occasion title
        })
        await db().collection("tracks").doc("src-t3").set({
            id: "src-t3",
            setlistId: "src",
            order: 2,
            type: "song",
            title: "Hineh Ma Tov", // clean bond
            fileId: "hineh-file",
        })

        const res = (await cloneSetlist(ADMIN, {
            sourceSetlistId: "src",
        })) as {
            ok: true
            setlistId: string
            trackCount: number
            version: 1
            bondReviewCount: number
            staleMetadataCandidates: {
                rows: Array<{ title: string; matchedTokens: string[] }>
                nameFlagged: boolean
                serviceNotesFlagged: boolean
                serviceNotesTokens: string[]
            }
        }

        // Existing contract unchanged.
        expect(res.ok).toBe(true)
        expect(res.trackCount).toBe(3)
        expect(res.version).toBe(1)

        // New advisory reports.
        expect(res.bondReviewCount).toBe(1) // the Barchu→Ahava row

        const stale = res.staleMetadataCandidates
        // Default clone name "Copy of Shabbat Morning — Parashat Emor" + the
        // Torah-service header row both carry the stale parsha.
        expect(stale.nameFlagged).toBe(true)
        expect(stale.serviceNotesFlagged).toBe(true)
        expect(stale.serviceNotesTokens).toEqual(
            expect.arrayContaining(["yizkor", "<iso-date>"]),
        )
        const emorRow = stale.rows.find((r) => r.matchedTokens.includes("emor"))
        expect(emorRow).toBeDefined()
    })

    it("clone of a clean source reports zero review/stale signals", async () => {
        await seedLibrary()
        await db().collection("setlists").doc("clean-src").set({
            id: "clean-src",
            name: "Weekly Service",
            ownerId: ADMIN,
        })
        await db().collection("tracks").doc("clean-t1").set({
            id: "clean-t1",
            setlistId: "clean-src",
            order: 0,
            type: "song",
            title: "Hineh Ma Tov", // clean bond
            fileId: "hineh-file",
        })

        const res = (await cloneSetlist(ADMIN, {
            sourceSetlistId: "clean-src",
        })) as {
            bondReviewCount: number
            staleMetadataCandidates: {
                rows: unknown[]
                nameFlagged: boolean
                serviceNotesFlagged: boolean
            }
        }
        expect(res.bondReviewCount).toBe(0)
        expect(res.staleMetadataCandidates.rows).toHaveLength(0)
        expect(res.staleMetadataCandidates.nameFlagged).toBe(false)
        expect(res.staleMetadataCandidates.serviceNotesFlagged).toBe(false)
    })
})
