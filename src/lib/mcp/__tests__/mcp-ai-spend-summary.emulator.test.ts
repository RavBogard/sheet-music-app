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

import { getAiSpendSummary } from "../tools/ai-spend-summary"

/**
 * PGR-04 — admin-only AI-spend rollup MCP tool. Covers:
 *  - admin gate (musician + band_leader refused; only admin allowed)
 *  - trailing 7-day vs 30-day window split over a real `aiSpend` sink
 *  - per-model breakdown + costUsd summation
 */
describe("get_ai_spend_summary (emulator)", () => {
    let app: App
    const ADMIN = "rabbi-daniel"
    const LEADER = "david-band-leader"
    const MUSICIAN = "musician-randy"
    const DAY = 24 * 60 * 60 * 1000

    function db() {
        return getFirestore(app)
    }

    function daysAgoIso(n: number): string {
        return new Date(Date.now() - n * DAY).toISOString()
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-ai-spend" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        for (const coll of ["users", "aiSpend"]) {
            const snap = await db().collection(coll).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
        await db().collection("users").doc(ADMIN).set({ role: "admin" })
        await db().collection("users").doc(LEADER).set({ role: "band_leader" })
        await db().collection("users").doc(MUSICIAN).set({ role: "musician" })
    })

    it("refuses non-admin (musician)", async () => {
        const r = await getAiSpendSummary(MUSICIAN, {})
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "forbidden" },
            callerRole: "musician",
        })
    })

    it("refuses non-admin (band_leader) — admin-only, not trusted-leader", async () => {
        const r = await getAiSpendSummary(LEADER, {})
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "forbidden" },
            callerRole: "band_leader",
        })
    })

    it("admin: empty sink → zeroed windows", async () => {
        const r = await getAiSpendSummary(ADMIN, {})
        if ("error" in r) throw new Error("unexpected: " + r.error.machine_code)
        expect(r.windows.last7Days.sampleCount).toBe(0)
        expect(r.windows.last30Days.sampleCount).toBe(0)
        expect(r.windows.last7Days.totalCostUsd).toBe(0)
        expect(r.truncated).toBe(false)
    })

    it("admin: splits 7-day vs 30-day windows + per-model breakdown", async () => {
        await db().collection("aiSpend").add({
            rowId: "r1",
            model: "gemini-3.1-pro-preview",
            totalTokens: 100,
            costUsd: 0.001,
            ts: daysAgoIso(1),
        })
        await db().collection("aiSpend").add({
            rowId: "r2",
            model: "gemini-3.1-pro-preview",
            totalTokens: 200,
            costUsd: 0.002,
            ts: daysAgoIso(20), // outside 7d, inside 30d
        })
        await db().collection("aiSpend").add({
            rowId: "r3",
            model: "other-model",
            totalTokens: 50,
            costUsd: 0.0005,
            ts: daysAgoIso(2),
        })

        const r = await getAiSpendSummary(ADMIN, {})
        if ("error" in r) throw new Error("unexpected: " + r.error.machine_code)

        // 7-day: r1 + r3 only.
        expect(r.windows.last7Days.sampleCount).toBe(2)
        expect(r.windows.last7Days.totalTokens).toBe(150)
        expect(r.windows.last7Days.totalCostUsd).toBeCloseTo(0.0015, 8)

        // 30-day: all three.
        expect(r.windows.last30Days.sampleCount).toBe(3)
        expect(r.windows.last30Days.totalTokens).toBe(350)
        expect(
            r.windows.last30Days.byModel["gemini-3.1-pro-preview"].sampleCount,
        ).toBe(2)
        expect(r.windows.last30Days.byModel["other-model"].sampleCount).toBe(1)
    })

    it("admin: docs older than 30d are excluded from the scan", async () => {
        await db().collection("aiSpend").add({
            rowId: "ancient",
            model: "gemini-3.1-pro-preview",
            totalTokens: 9999,
            costUsd: 9.99,
            ts: daysAgoIso(45),
        })
        const r = await getAiSpendSummary(ADMIN, {})
        if ("error" in r) throw new Error("unexpected: " + r.error.machine_code)
        expect(r.windows.last30Days.sampleCount).toBe(0)
    })
})
