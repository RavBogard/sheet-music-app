import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore, Timestamp } from "firebase-admin/firestore"

import { exportSetlistsTool, getSongHistoryTool } from "../tools/history"

/**
 * Setlist memory, release 1 — tenant wall on get_song_history / export_setlists.
 *
 * A CRC setlist and a Brothers Lazaroff setlist each carry a "Mi Chamocha"
 * song bound to their own org's library row. Each org's call sees only its
 * own setlist and its own chart.
 */
describe("history tools tenant isolation (emulator)", () => {
    let app: App
    const CRC = "crc"
    const BL = "brotherslazaroff"

    function db() {
        return getFirestore(app)
    }

    beforeAll(() => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-history-tenant" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        for (const coll of ["setlists", "tracks", "library_index"]) {
            const snap = await db().collection(coll).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
        const seed = async (org: string, setlistId: string, fileId: string, chartName: string) => {
            await db().collection("setlists").doc(setlistId).set({
                orgId: org,
                name: `Shabbat Morning ${org}`,
                templateType: "shabbat_morning",
                eventDate: Timestamp.fromDate(new Date("2026-09-12T15:00:00Z")),
                date: Timestamp.fromDate(new Date("2026-09-01T12:00:00Z")),
                isTest: false,
                ownerName: org,
            })
            await db().collection("tracks").doc(`${setlistId}-t1`).set({
                orgId: org,
                setlistId,
                order: 0,
                type: "song",
                title: "Mi Chamocha",
                fileId,
                key: "Dm",
            })
            await db().collection("library_index").doc(fileId).set({
                orgId: org,
                name: chartName,
                key: "Dm",
            })
        }
        await seed(CRC, "sl-crc", "file-crc", "Mi Chamocha (CRC chart)")
        await seed(BL, "sl-bl", "file-bl", "Mi Chamocha (BL chart)")
    })

    it.each([
        [CRC, "sl-crc", "Mi Chamocha (CRC chart)"],
        [BL, "sl-bl", "Mi Chamocha (BL chart)"],
    ])("get_song_history for %s sees only its own setlist and chart", async (org, setlistId, chartName) => {
        const r = (await getSongHistoryTool("u", { title: "Mi Chamocha" }, org)) as {
            ok: boolean
            entries: Array<{ setlistId: string; chartName: string }>
            byChart: Array<{ chartName: string }>
        }
        expect(r.ok).toBe(true)
        expect(r.entries.map((e) => e.setlistId)).toEqual([setlistId])
        expect(r.entries[0].chartName).toBe(chartName)
        expect(r.byChart.map((c) => c.chartName)).toEqual([chartName])
    })

    it("get_song_history by the other org's fileId finds nothing", async () => {
        const r = (await getSongHistoryTool("u", { fileId: "file-bl" }, CRC)) as { entries: unknown[] }
        expect(r.entries).toEqual([])
    })

    it.each([
        [CRC, "sl-crc", "Mi Chamocha (CRC chart)"],
        [BL, "sl-bl", "Mi Chamocha (BL chart)"],
    ])("export_setlists for %s sees only its own setlist and chart", async (org, setlistId, chartName) => {
        const r = (await exportSetlistsTool("u", {}, org)) as {
            ok: boolean
            setlists: Array<{ id: string; tracks: Array<{ chartName: string }> }>
        }
        expect(r.ok).toBe(true)
        expect(r.setlists.map((s) => s.id)).toEqual([setlistId])
        expect(r.setlists[0].tracks[0].chartName).toBe(chartName)
    })
})
