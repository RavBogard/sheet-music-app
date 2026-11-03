import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { deleteApp, getApps, initializeApp, type App } from "firebase-admin/app"
import { getFirestore, Timestamp } from "firebase-admin/firestore"
import { assertFails, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing"

import { applyOps, applyOpsAuthorized, writeRowFields, OP_BATCHES } from "@/lib/setlist-ops"
import type { Op, OpsOk, OpsRequest } from "@/lib/setlist-ops"

/**
 * OPS-CONTRACT engine, against the Firestore emulator. One transaction per
 * batch, anchor rebase, per-field merge, renumber, stamps, idempotency, and
 * the tenant wall, for both tenants.
 */
describe("setlist ops engine (emulator)", () => {
    let app: App
    const db = () => getFirestore(app)

    const CRC_LEAD = "crc-lead"
    const BL_LEAD = "bl-lead"
    const CRC_MUS = "crc-mus"

    let n = 0
    const batchId = () => `b-${Date.now()}-${n++}`
    const req = (ops: Op[], clientBatchId = batchId()): OpsRequest => ({ clientBatchId, baseVersion: 0, ops })

    async function seed(orgId: string, orders: number[], extra: Array<Record<string, unknown>> = []) {
        const setlistId = `s-${orgId}-${n++}`
        await db().collection("setlists").doc(setlistId).set({ id: setlistId, orgId, name: "S", version: 5, trackCount: orders.length })
        const ids: string[] = []
        const batch = db().batch()
        orders.forEach((order, i) => {
            const id = `${setlistId}-r${i}`
            ids.push(id)
            batch.set(db().collection("tracks").doc(id), {
                id, setlistId, orgId, order, title: `Row ${i}`, type: "song", version: 1,
                updatedAt: Timestamp.fromMillis(1_000), ...(extra[i] ?? {}),
            })
        })
        await batch.commit()
        return { setlistId, ids }
    }

    async function rows(setlistId: string) {
        const snap = await db().collection("tracks").where("setlistId", "==", setlistId).get()
        return snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }) as Record<string, unknown> & { id: string; order: number })
            .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    }
    const setlist = async (id: string) => (await db().collection("setlists").doc(id).get()).data()!

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-setlist-ops" })
        const m = db().collection("memberships")
        await Promise.all([
            m.doc(`crc__${CRC_LEAD}`).set({ uid: CRC_LEAD, tenantId: "crc", role: "band_leader" }),
            m.doc(`brotherslazaroff__${BL_LEAD}`).set({ uid: BL_LEAD, tenantId: "brotherslazaroff", role: "band_leader" }),
            m.doc(`crc__${CRC_MUS}`).set({ uid: CRC_MUS, tenantId: "crc", role: "musician" }),
        ])
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    it("insert lands after its anchor, then before the before-anchor, then at the end, and renumbers 0..n-1", async () => {
        const { setlistId, ids } = await seed("crc", [0, 1, 2])
        const r = (await applyOps(db(), CRC_LEAD, setlistId, req([
            { kind: "insert", rowId: `${setlistId}-x`, afterRowId: ids[0], beforeRowId: ids[1], row: { title: "X", type: "song" } },
            { kind: "insert", rowId: `${setlistId}-y`, afterRowId: "gone", beforeRowId: ids[2], row: { title: "Y", type: "note" } },
            { kind: "insert", rowId: `${setlistId}-z`, afterRowId: "gone", beforeRowId: "gone-too", row: { title: "Z" } },
        ]))) as OpsOk
        expect(r.ok).toBe(true)
        expect(r.applied).toEqual([0, 1, 2])
        const after = await rows(setlistId)
        expect(after.map((x) => x.id)).toEqual([ids[0], `${setlistId}-x`, ids[1], `${setlistId}-y`, ids[2], `${setlistId}-z`])
        expect(after.map((x) => x.order)).toEqual([0, 1, 2, 3, 4, 5])
        const x = after[1]
        expect(x).toMatchObject({ orgId: "crc", setlistId, version: 1 })
        expect(x.createdAt).toBeDefined()
        const s = await setlist(setlistId)
        expect(s.version).toBe(6)
        expect(s.trackCount).toBe(6)
        expect(s.songCount).toBe(5)
        expect(s.lastModifiedBy).toBe(CRC_LEAD)
        expect(r.version).toBe(6)
    })

    it("a move whose anchor is gone rebases onto the before-anchor; a move of a missing row is row-gone", async () => {
        const { setlistId, ids } = await seed("crc", [0, 1, 2, 3])
        // Someone removed ids[1] between the client's read and this batch.
        await db().collection("tracks").doc(ids[1]).delete()
        const r = (await applyOps(db(), CRC_LEAD, setlistId, req([
            { kind: "move", rowId: ids[3], afterRowId: ids[1], beforeRowId: ids[2] },
            { kind: "move", rowId: ids[1], afterRowId: null, beforeRowId: null },
        ]))) as OpsOk
        expect(r.applied).toEqual([0])
        expect(r.conflicts).toEqual([{ opIndex: 1, reason: "row-gone" }])
        const after = await rows(setlistId)
        expect(after.map((x) => x.id)).toEqual([ids[0], ids[3], ids[2]])
        expect(after.map((x) => x.order)).toEqual([0, 1, 2])
    })

    it("field merge applies against an unchanged base and reports a conflict per changed field", async () => {
        const { setlistId, ids } = await seed("crc", [0, 1], [{ key: "C", notes: "a" }, { key: "G" }])
        // Another writer changed ids[0].key to E after the client read C.
        await db().collection("tracks").doc(ids[0]).update({ key: "E" })
        const r = (await applyOps(db(), CRC_LEAD, setlistId, req([
            { kind: "editRow", rowId: ids[0], set: { key: "D", notes: "b" }, base: { key: "C", notes: "a" } },
            { kind: "editRow", rowId: ids[1], set: { key: "A" }, base: { key: "G" } },
        ]))) as OpsOk
        expect(r.applied).toEqual([0, 1])
        expect(r.conflicts).toEqual([{ opIndex: 0, reason: "field", field: "key", server: "E", mine: "D" }])
        const after = await rows(setlistId)
        expect(after[0]).toMatchObject({ key: "E", notes: "b", version: 2 })
        expect(after[1]).toMatchObject({ key: "A", version: 2 })
        expect((after[0].updatedAt as Timestamp).toMillis()).toBeGreaterThan(1_000)
        // Touched rows come back with their new state.
        expect(r.rows.map((x) => x.id).sort()).toEqual([...ids].sort())
    })

    it("removing a row that is already gone is a no-op success", async () => {
        const { setlistId, ids } = await seed("crc", [0, 1])
        const r = (await applyOps(db(), CRC_LEAD, setlistId, req([
            { kind: "remove", rowId: "never-existed" },
            { kind: "remove", rowId: ids[0] },
        ]))) as OpsOk
        expect(r.ok).toBe(true)
        expect(r.applied).toEqual([0, 1])
        expect(r.removed).toEqual([ids[0]])
        const after = await rows(setlistId)
        expect(after.map((x) => [x.id, x.order])).toEqual([[ids[1], 0]])
        expect((await setlist(setlistId)).trackCount).toBe(1)
    })

    it("insert is idempotent by clientBatchId; another batch reusing the row id is row-exists", async () => {
        const { setlistId, ids } = await seed("crc", [0])
        const id = `${setlistId}-new`
        const first = req([{ kind: "insert", rowId: id, afterRowId: ids[0], beforeRowId: null, row: { title: "N" } }])
        const a = (await applyOps(db(), CRC_LEAD, setlistId, first)) as OpsOk
        const b = (await applyOps(db(), CRC_LEAD, setlistId, first)) as OpsOk
        expect(b.replayed).toBe(true)
        expect(b.version).toBe(a.version)
        expect(b.applied).toEqual(a.applied)
        expect((await rows(setlistId)).length).toBe(2)
        expect((await setlist(setlistId)).version).toBe(6)

        // The receipt is server-only and expires.
        const receipt = await db().collection("setlists").doc(setlistId).collection(OP_BATCHES).doc(first.clientBatchId).get()
        expect(receipt.data()?.expiresAt).toBeInstanceOf(Timestamp)

        // With the receipt gone, the same batch's insert is still recognised as its own.
        await receipt.ref.delete()
        const c = (await applyOps(db(), CRC_LEAD, setlistId, first)) as OpsOk
        expect(c.conflicts).toEqual([])
        expect(c.applied).toEqual([0])

        const other = (await applyOps(db(), CRC_LEAD, setlistId, req([
            { kind: "insert", rowId: id, afterRowId: null, beforeRowId: null, row: { title: "dup" } },
        ]))) as OpsOk
        expect(other.conflicts).toEqual([{ opIndex: 0, reason: "row-exists" }])
        expect((await rows(setlistId)).length).toBe(2)
    })

    it("renumber heals drifted orders to 0..n-1 and leaves rows whose order did not change untouched", async () => {
        const { setlistId, ids } = await seed("crc", [0, 2, 5, 5])
        const r = (await applyOps(db(), CRC_LEAD, setlistId, req([
            { kind: "move", rowId: ids[0], afterRowId: ids[1], beforeRowId: ids[2] },
        ]))) as OpsOk
        const after = await rows(setlistId)
        expect(after.map((x) => x.id)).toEqual([ids[1], ids[0], ids[2], ids[3]])
        expect(after.map((x) => x.order)).toEqual([0, 1, 2, 3])
        // Every row's stored order changed (drift healed), so each was touched once.
        for (const row of after) expect(row.version).toBe(2)
        expect(r.rows.length).toBe(4)

        // A second, field-only batch touches one row and no others.
        await applyOps(db(), CRC_LEAD, setlistId, req([{ kind: "editRow", rowId: ids[3], set: { notes: "n" }, base: {} }]))
        const again = await rows(setlistId)
        expect(again.map((x) => x.version)).toEqual([2, 2, 2, 3])
    })

    it("a whole-list reorder is ONE transaction and one setlist version", async () => {
        const { setlistId, ids } = await seed("crc", [0, 1, 2, 3, 4])
        const reversed = [...ids].reverse()
        const ops: Op[] = reversed.map((rowId, i) => ({ kind: "move", rowId, afterRowId: i === 0 ? null : reversed[i - 1], beforeRowId: null }))
        ops[0] = { kind: "move", rowId: reversed[0], afterRowId: null, beforeRowId: null }
        const spy = vi.spyOn(db(), "runTransaction")
        const r = (await applyOpsAuthorized(db(), setlistId, req(ops), { actor: CRC_LEAD })) as OpsOk
        expect(spy).toHaveBeenCalledTimes(1)
        spy.mockRestore()
        expect(r.conflicts).toEqual([])
        expect((await rows(setlistId)).map((x) => x.id)).toEqual(reversed)
        expect((await setlist(setlistId)).version).toBe(6)
    })

    it("works the same for the Brothers Lazaroff tenant, stamping its orgId", async () => {
        const { setlistId, ids } = await seed("brotherslazaroff", [0, 1])
        const r = (await applyOps(db(), BL_LEAD, setlistId, req([
            { kind: "insert", rowId: `${setlistId}-n`, afterRowId: ids[1], beforeRowId: null, row: { title: "Set 2" } },
        ]))) as OpsOk
        expect(r.ok).toBe(true)
        const row = (await rows(setlistId))[2]
        expect(row.orgId).toBe("brotherslazaroff")
    })

    it("refuses a leader of another tenant as not-found and a musician as forbidden, writing nothing", async () => {
        const bl = await seed("brotherslazaroff", [0])
        const crc = await seed("crc", [0])
        const op: Op[] = [{ kind: "remove", rowId: "x" }]
        expect(await applyOps(db(), CRC_LEAD, bl.setlistId, req(op))).toEqual({ ok: false, reason: "not-found" })
        expect(await applyOps(db(), BL_LEAD, crc.setlistId, req(op))).toEqual({ ok: false, reason: "not-found" })
        expect(await applyOps(db(), CRC_MUS, crc.setlistId, req(op))).toEqual({ ok: false, reason: "forbidden" })
        expect(await applyOps(db(), CRC_LEAD, "no-such-setlist", req(op))).toEqual({ ok: false, reason: "not-found" })
        expect((await setlist(bl.setlistId)).version).toBe(5)
        expect((await setlist(crc.setlistId)).version).toBe(5)
    })

    it("never writes undefined: it is stripped from inserts and edits; null clears", async () => {
        const { setlistId, ids } = await seed("crc", [0], [{ bpm: 80, key: "C" }])
        const r = (await applyOps(db(), CRC_LEAD, setlistId, req([
            { kind: "insert", rowId: `${setlistId}-u`, afterRowId: ids[0], beforeRowId: null, row: { title: "U", bpm: undefined, liturgyRef: { book: "b", folio: 2, unitId: undefined } } },
            { kind: "editRow", rowId: ids[0], set: { bpm: undefined, key: null }, base: { key: "C" } },
        ]))) as OpsOk
        expect(r.ok).toBe(true)
        const after = await rows(setlistId)
        expect("bpm" in after[1]).toBe(false)
        expect(after[1].liturgyRef).toEqual({ book: "b", folio: 2 })
        expect(after[0].bpm).toBe(80)
        expect("key" in after[0]).toBe(false)
    })

    it("server field writes (page binds) bump the row's updatedAt + version and the setlist's version", async () => {
        const { setlistId, ids } = await seed("crc", [0, 1])
        const res = await writeRowFields(db(), setlistId, [
            { rowId: ids[0], patch: { liturgyRef: { book: "b", folio: 7 } } },
            { rowId: "gone", patch: { liturgyRef: { book: "b", folio: 8 } } },
        ])
        expect(res).toEqual({ written: [ids[0]], skipped: ["gone"] })
        const [row0, row1] = await rows(setlistId)
        expect(row0.version).toBe(2)
        expect((row0.updatedAt as Timestamp).toMillis()).toBeGreaterThan(1_000)
        expect(row1.version).toBe(1)
        expect((await setlist(setlistId)).version).toBe(6)
    })
})

describe("opBatches receipts are closed to clients (rules)", () => {
    let testEnv: RulesTestEnvironment
    beforeAll(async () => {
        const [host, portStr] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080").split(":")
        testEnv = await initializeTestEnvironment({
            projectId: "demo-setlist-ops-rules",
            firestore: { rules: readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8"), host, port: Number.parseInt(portStr ?? "8080", 10) },
        })
    })
    afterAll(async () => {
        await testEnv.cleanup()
    })
    beforeEach(async () => {
        await testEnv.clearFirestore()
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
            await ctx.firestore().collection("setlists").doc("s1").set({ orgId: "crc" })
            await ctx.firestore().collection("setlists").doc("s1").collection("opBatches").doc("b1").set({ applied: [] })
        })
    })

    it("a band leader of the tenant can neither read nor write a receipt", async () => {
        const leader = testEnv.authenticatedContext("crc-lead", { m: { crc: "bl" } }).firestore()
        const ref = leader.collection("setlists").doc("s1").collection("opBatches").doc("b1")
        await assertFails(ref.get())
        await assertFails(ref.set({ applied: [0] }))
        await assertFails(leader.collection("setlists").doc("s1").collection("opBatches").doc("b2").set({}))
    })
})
