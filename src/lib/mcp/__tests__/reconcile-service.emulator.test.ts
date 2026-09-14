// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore, Timestamp } from "firebase-admin/firestore"
import type { HistoryRow } from "@/lib/performed/types"

/**
 * D-W3 — `reconcile_service`.
 *
 * The one thing this file exists to prove: **promoting never touches the plan.**
 * Everything else about the reconcile is unit-tested against the RH Day 2
 * fixture; what needs a real Firestore is the write path — that the clone gets
 * the changes, the source does not, and both end up in the list.
 *
 * Overlays' /api/history does not exist yet, so the client is mocked. That is
 * the honest boundary: this asserts what `.live` does with a cue log, not that
 * the cue log is reachable.
 */

let HISTORY: HistoryRow[] = []
let historyFails: string | null = null
vi.mock("@/lib/performed/history-client", () => ({
    historyConfigured: () => true,
    fetchHistory: async () =>
        historyFails
            ? { ok: false, code: "history_unreachable", message: historyFails }
            : { ok: true, rows: HISTORY, truncated: false },
}))
vi.mock("@/lib/rate-limit", () => ({ checkUserRateLimit: vi.fn().mockResolvedValue(null) }))

import { reconcileService } from "../tools/performed"

describe("reconcile_service (emulator)", () => {
    let app: App
    const ADMIN = "rabbi-daniel"
    const db = () => getFirestore(app)
    const SETLIST = "planned-service"

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-reconcile-service" })
        await db()
            .collection("users")
            .doc(ADMIN)
            .set({ displayName: "Rabbi Daniel", role: "admin" })
    })
    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        historyFails = null
        for (const col of ["setlists", "tracks"]) {
            const snap = await db().collection(col).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
        await seed()
    })

    /** A small service: two rows that fire, one page-carrying row that does not. */
    async function seed() {
        await db()
            .collection("setlists")
            .doc(SETLIST)
            .set({
                id: SETLIST,
                orgId: "crc",
                name: "RH Day 2 — CRC Machzor",
                book: "crc-machzor-2008",
                eventDate: Timestamp.fromDate(new Date("2026-09-13T14:00:00.000Z")),
                date: Timestamp.fromDate(new Date("2026-09-10T12:00:00.000Z")),
                trackCount: 4,
                ownerId: ADMIN,
                version: 3,
            })
        const rows = [
            { id: "r0", order: 0, title: "Modeh Ani", type: "song", liturgyRef: { book: "crc-machzor-2008", folio: 39 } },
            { id: "r1", order: 1, title: "Birchot HaShachar", type: "prayer", liturgyRef: { book: "crc-machzor-2008", folio: 42 } },
            { id: "r2", order: 2, title: "A band-only niggun", type: "song" },
            { id: "r3", order: 3, title: "Mi Chamocha", type: "song", liturgyRef: { book: "crc-machzor-2008", folio: 52 } },
        ]
        for (const r of rows) {
            await db().collection("tracks").doc(r.id).set({ ...r, setlistId: SETLIST, orgId: "crc", version: 1 })
        }
        HISTORY = [
            { seq: 1, at: "2026-09-13T14:05:00.000Z", action: "show", book: "crc-machzor-2008", folio: 39 },
            { seq: 2, at: "2026-09-13T14:25:00.000Z", action: "show", book: "crc-machzor-2008", folio: 52 },
        ]
    }

    it("dryRun stages the diff and writes absolutely nothing", async () => {
        const before = (await db().collection("setlists").get()).size
        const res = await reconcileService(ADMIN, { setlistId: SETLIST })
        expect("ok" in res && res.ok).toBe(true)
        if (!("ok" in res) || !res.ok) return

        expect(res.dryRun).toBe(true)
        expect(res.promoted).toBeNull()
        expect(res.diff.counts.performed).toBe(3) // two fired + the bracketed niggun
        expect(res.diff.counts.skipped).toBe(1) // Birchot HaShachar has a page
        expect((await db().collection("setlists").get()).size).toBe(before)
    })

    it("centres the window on the setlist's eventDate", async () => {
        const res = await reconcileService(ADMIN, { setlistId: SETLIST })
        if (!("ok" in res) || !res.ok) throw new Error("expected ok")
        expect(res.window.since).toBe("2026-09-13T13:30:00.000Z")
        expect(res.window.until).toBe("2026-09-13T18:00:00.000Z")
    })

    it("promote creates a new setlist and LEAVES THE PLAN UNTOUCHED", async () => {
        const planBefore = (await db().collection("setlists").doc(SETLIST).get()).data()
        const tracksBefore = (
            await db().collection("tracks").where("setlistId", "==", SETLIST).get()
        ).docs
            .map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }) as Record<string, unknown>)
            .sort((a, b) => Number(a.order) - Number(b.order))

        const res = await reconcileService(ADMIN, { setlistId: SETLIST, dryRun: false })
        if (!("ok" in res) || !res.ok) throw new Error("expected ok")
        expect(res.promoted).not.toBeNull()
        const cloneId = res.promoted!.setlistId
        expect(cloneId).not.toBe(SETLIST)
        expect(res.promoted!.name).toBe("RH Day 2 — CRC Machzor (as performed)")

        // The plan, byte for byte.
        const planAfter = (await db().collection("setlists").doc(SETLIST).get()).data()
        expect(planAfter).toEqual(planBefore)
        const tracksAfter = (
            await db().collection("tracks").where("setlistId", "==", SETLIST).get()
        ).docs
            .map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }) as Record<string, unknown>)
            .sort((a, b) => Number(a.order) - Number(b.order))
        expect(tracksAfter).toEqual(tracksBefore)
        expect(tracksAfter).toHaveLength(4)
    })

    it("the performed version drops the skipped row and stamps performedAt", async () => {
        const res = await reconcileService(ADMIN, { setlistId: SETLIST, dryRun: false })
        if (!("ok" in res) || !res.ok) throw new Error("expected ok")
        const cloneId = res.promoted!.setlistId

        const rows = (await db().collection("tracks").where("setlistId", "==", cloneId).get()).docs
            .map((d) => d.data() as Record<string, unknown>)
            .sort((a, b) => Number(a.order) - Number(b.order))

        expect(rows.map((r) => r.title)).toEqual([
            "Modeh Ani",
            "A band-only niggun",
            "Mi Chamocha",
        ])
        expect(res.promoted!.rowsRemoved).toBe(1)
        expect(rows[0].performedAt).toBe("2026-09-13T14:05:00.000Z")
        expect(rows[2].performedAt).toBe("2026-09-13T14:25:00.000Z")
        // The bracketed band-only row inherited "performed" but no cue fired
        // for it, so it carries no timestamp to claim.
        expect(rows[1].performedAt).toBeUndefined()
        // `order` is renumbered contiguously over what survived.
        expect(rows.map((r) => r.order)).toEqual([0, 1, 2])
    })

    it("splices an audible into the performed version with its page", async () => {
        HISTORY = [
            ...HISTORY,
            {
                seq: 3,
                at: "2026-09-13T14:40:00.000Z",
                action: "show",
                momentId: "oseh-shalom",
                book: "crc-machzor-2008",
                folio: 63,
            },
        ]
        const res = await reconcileService(ADMIN, { setlistId: SETLIST, dryRun: false })
        if (!("ok" in res) || !res.ok) throw new Error("expected ok")
        expect(res.promoted!.rowsAdded).toBe(1)

        const rows = (
            await db().collection("tracks").where("setlistId", "==", res.promoted!.setlistId).get()
        ).docs
            .map((d) => d.data() as Record<string, unknown>)
            .sort((a, b) => Number(a.order) - Number(b.order))
        const audible = rows.find((r) => r.title === "oseh-shalom")
        expect(audible).toBeTruthy()
        expect(audible!.type).toBe("prayer")
        expect(audible!.liturgyRef).toEqual({ book: "crc-machzor-2008", folio: 63 })
    })

    it("returns chapter lines counted from the first cue", async () => {
        const res = await reconcileService(ADMIN, { setlistId: SETLIST })
        if (!("ok" in res) || !res.ok) throw new Error("expected ok")
        expect(res.chapters).toEqual(["0:00  Modeh Ani", "20:00  Mi Chamocha"])
    })

    it("an empty cue log says so, and calls nothing skipped", async () => {
        HISTORY = []
        const res = await reconcileService(ADMIN, { setlistId: SETLIST })
        if (!("ok" in res) || !res.ok) throw new Error("expected ok")
        expect(res.diff.counts.skipped).toBe(0)
        expect(res.diff.counts.untracked).toBe(4)
        expect(res.summary).toContain("not about the service")
    })

    it("a history read failure refuses and writes nothing", async () => {
        historyFails = "Overlays /api/history could not be reached."
        const before = (await db().collection("setlists").get()).size
        const res = await reconcileService(ADMIN, { setlistId: SETLIST, dryRun: false })
        expect("error" in res).toBe(true)
        expect((await db().collection("setlists").get()).size).toBe(before)
    })

    it("refuses a setlist with no eventDate rather than guessing a window", async () => {
        await db().collection("setlists").doc(SETLIST).update({
            eventDate: null,
            date: null,
        })
        const res = await reconcileService(ADMIN, { setlistId: SETLIST })
        expect("error" in res).toBe(true)
        if (!("error" in res)) return
        // Rich envelope: `error` is an object; the machine code is inside it.
        expect((res.error as { machine_code: string }).machine_code).toBe("no_event_date")
    })

    it("refuses `since` without `until`", async () => {
        const res = await reconcileService(ADMIN, {
            setlistId: SETLIST,
            since: "2026-09-13T13:00:00.000Z",
        })
        expect("error" in res).toBe(true)
    })

    it("walls off another tenant's setlist", async () => {
        await db().collection("setlists").doc(SETLIST).update({ orgId: "brotherslazaroff" })
        const res = await reconcileService(ADMIN, { setlistId: SETLIST })
        expect("error" in res).toBe(true)
        if (!("error" in res)) return
        expect((res.error as { machine_code: string }).machine_code).toBe("setlist_not_found")
    })
})
