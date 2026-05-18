import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
} from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore, Timestamp } from "firebase-admin/firestore"

import { dumpCollectionSize } from "../tools/dump-collection-size"

/**
 * Cycle-5 C5D-013 — admin-only Firestore sizing probe. Covers:
 *  - admin gate (musician + band_leader refused; only admin allowed)
 *  - rich-envelope shape on validation failures (empty collection,
 *    subcollection path, bad ISO date)
 *  - doc-count + estimatedBytes + oldest/newest timestamp on a happy path
 *  - `since` cutoff filters via the `timestamp` field
 *  - `maxDocs` clamps the scan and reports `truncated:true`
 */
describe("dump_collection_size (emulator)", () => {
    let app: App
    const ADMIN = "rabbi-daniel"
    const LEADER = "david-band-leader"
    const MUSICIAN = "musician-randy"

    function db() {
        return getFirestore(app)
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app =
            getApps()[0] ??
            initializeApp({ projectId: "demo-mcp-dump-size" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        for (const coll of ["users", "webVitalsObservations", "empty_probe"]) {
            const snap = await db().collection(coll).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
        await db().collection("users").doc(ADMIN).set({ role: "admin" })
        await db().collection("users").doc(LEADER).set({ role: "band_leader" })
        await db().collection("users").doc(MUSICIAN).set({ role: "musician" })
    })

    it("refuses non-admin (musician)", async () => {
        const r = await dumpCollectionSize(MUSICIAN, {
            collection: "webVitalsObservations",
        })
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "forbidden" },
            callerRole: "musician",
        })
    })

    it("refuses non-admin (band_leader) — admin-only, distinct from MCP trusted-leader bypass", async () => {
        const r = await dumpCollectionSize(LEADER, {
            collection: "webVitalsObservations",
        })
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "forbidden" },
            callerRole: "band_leader",
        })
    })

    it("admin: empty collection returns docCount:0 + zero bytes + nulls", async () => {
        const r = await dumpCollectionSize(ADMIN, {
            collection: "empty_probe",
        })
        if ("error" in r) throw new Error("unexpected error: " + r.error.machine_code)
        expect(r.docCount).toBe(0)
        expect(r.estimatedBytes).toBe(0)
        expect(r.oldestTimestamp).toBeNull()
        expect(r.newestTimestamp).toBeNull()
        expect(r.truncated).toBe(false)
    })

    it("admin: counts docs + accumulates bytes + tracks oldest/newest timestamp", async () => {
        const t0 = Timestamp.fromMillis(Date.parse("2026-01-01T00:00:00Z"))
        const t1 = Timestamp.fromMillis(Date.parse("2026-03-15T12:00:00Z"))
        const t2 = Timestamp.fromMillis(Date.parse("2026-05-18T20:00:00Z"))
        await db().collection("webVitalsObservations").doc("a").set({
            metric: "LCP",
            value: 1234,
            timestamp: t1,
        })
        await db().collection("webVitalsObservations").doc("b").set({
            metric: "CLS",
            value: 0.05,
            timestamp: t0,
        })
        await db().collection("webVitalsObservations").doc("c").set({
            metric: "INP",
            value: 200,
            timestamp: t2,
        })

        const r = await dumpCollectionSize(ADMIN, {
            collection: "webVitalsObservations",
        })
        if ("error" in r) throw new Error("unexpected error: " + r.error.machine_code)
        expect(r.docCount).toBe(3)
        expect(r.estimatedBytes).toBeGreaterThan(0)
        expect(r.oldestTimestamp).toBe(t0.toDate().toISOString())
        expect(r.newestTimestamp).toBe(t2.toDate().toISOString())
        expect(r.truncated).toBe(false)
        expect(r.sinceFilter).toBeNull()
    })

    it("admin: since filter narrows the scan via `timestamp` field", async () => {
        const old = Timestamp.fromMillis(Date.parse("2025-01-01T00:00:00Z"))
        const recent = Timestamp.fromMillis(Date.parse("2026-05-01T00:00:00Z"))
        await db().collection("webVitalsObservations").doc("old1").set({
            metric: "LCP",
            value: 1,
            timestamp: old,
        })
        await db().collection("webVitalsObservations").doc("new1").set({
            metric: "LCP",
            value: 2,
            timestamp: recent,
        })
        await db().collection("webVitalsObservations").doc("new2").set({
            metric: "LCP",
            value: 3,
            timestamp: recent,
        })

        const r = await dumpCollectionSize(ADMIN, {
            collection: "webVitalsObservations",
            since: "2026-04-01T00:00:00Z",
        })
        if ("error" in r) throw new Error("unexpected error: " + r.error.machine_code)
        expect(r.docCount).toBe(2)
        expect(r.sinceFilter).toBe(new Date("2026-04-01T00:00:00Z").toISOString())
    })

    it("admin: maxDocs clamps and reports truncated:true", async () => {
        for (let i = 0; i < 5; i++) {
            await db().collection("webVitalsObservations").doc(`d${i}`).set({
                metric: "LCP",
                value: i,
                timestamp: Timestamp.fromMillis(Date.now()),
            })
        }
        const r = await dumpCollectionSize(ADMIN, {
            collection: "webVitalsObservations",
            maxDocs: 3,
        })
        if ("error" in r) throw new Error("unexpected error: " + r.error.machine_code)
        expect(r.docCount).toBe(3)
        expect(r.truncated).toBe(true)
    })

    it("refuses empty / subcollection / bad-ISO inputs with rich envelopes", async () => {
        const empty = await dumpCollectionSize(ADMIN, { collection: "" })
        expect(empty).toMatchObject({
            ok: false,
            error: { machine_code: "invalid_collection" },
        })

        const nested = await dumpCollectionSize(ADMIN, { collection: "a/b" })
        expect(nested).toMatchObject({
            ok: false,
            error: { machine_code: "subcollection_unsupported" },
        })

        const badSince = await dumpCollectionSize(ADMIN, {
            collection: "webVitalsObservations",
            since: "not-a-date",
        })
        expect(badSince).toMatchObject({
            ok: false,
            error: { machine_code: "invalid_since" },
        })
    })
})
