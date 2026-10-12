import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing"
import { afterAll, beforeAll, describe, it } from "vitest"

import { busCmd, dbOf, makeEnv, matrixCmd, pendingCmds, seedFixtures, type Persona } from "./personas"

/**
 * Multi-tenant phase 2 — the mixer (config/monitor, monitor-live/*, the bridge
 * command queue) belongs to the bridge tenant, crc (design §4.1 "Mixer").
 *   read      : member or above in crc, or a crc sound engineer
 *   command   : musician or above in crc, or a crc sound engineer
 *   matrix    : admin in crc, or a crc sound engineer who is musician or above
 *   config    : same as matrix
 * Per-bus ownership stays at the bridge. People of another tenant — including
 * that tenant's sound engineers — get none of it.
 */
describe("P2 mixer — bridge tenant crc", () => {
    let env: RulesTestEnvironment
    const db = (p: Persona) => dbOf(env, p)

    beforeAll(async () => {
        env = await makeEnv("demo-p2-mixer")
        await env.clearFirestore()
        await seedFixtures(env)
    })

    afterAll(async () => {
        await env.cleanup()
    })

    const READ_OK: Persona[] = ["aMe", "aMu", "aMuSE", "aBL", "aAdmin", "po", "dual", "oldBL", "oldAdminBoth"]
    const READ_NO: Persona[] = ["aPe", "bBL", "bSE", "oldPending", "signedOut"]
    for (const p of READ_OK) {
        it(`${p} reads config/monitor and monitor-live/state`, async () => {
            await assertSucceeds(db(p).doc("config/monitor").get())
            await assertSucceeds(db(p).doc("monitor-live/state").get())
        })
    }
    for (const p of READ_NO) {
        it(`${p} cannot read config/monitor or monitor-live/state`, async () => {
            await assertFails(db(p).doc("config/monitor").get())
            await assertFails(db(p).doc("monitor-live/state").get())
        })
    }

    const CMD_OK: Persona[] = ["aMu", "aMuSE", "aBL", "aAdmin", "po", "dual", "oldBL", "oldAdminBoth"]
    const CMD_NO: Persona[] = ["aMe", "aPe", "bBL", "bSE", "oldPending"]
    for (const p of CMD_OK) {
        it(`${p} enqueues a bus command`, async () => {
            await assertSucceeds(pendingCmds(db(p)).doc(`bus-${p}`).set(busCmd(p)))
        })
    }
    for (const p of CMD_NO) {
        it(`${p} cannot enqueue a bus command`, async () => {
            await assertFails(pendingCmds(db(p)).doc(`bus-${p}`).set(busCmd(p)))
        })
    }

    const MATRIX_OK: Persona[] = ["aMuSE", "aAdmin", "po", "oldAdminBoth"]
    const MATRIX_NO: Persona[] = ["aMu", "aBL", "aMe", "bSE", "bBL", "dual", "oldBL"]
    for (const p of MATRIX_OK) {
        it(`${p} sends a matrix command and writes config/monitor`, async () => {
            await assertSucceeds(pendingCmds(db(p)).doc(`mx-${p}`).set(matrixCmd(p)))
            await assertSucceeds(db(p).doc("config/monitor").set({ busAssignments: { aMu: [2] } }))
        })
    }
    for (const p of MATRIX_NO) {
        it(`${p} cannot send a matrix command or write config/monitor`, async () => {
            await assertFails(pendingCmds(db(p)).doc(`mx-${p}`).set(matrixCmd(p)))
            await assertFails(db(p).doc("config/monitor").set({ busAssignments: {} }))
        })
    }

    it("a crc sound engineer with no crc role cannot reach the matrix (se needs ≥ musician)", async () => {
        const d = env.authenticatedContext("seOnly", { m: {}, se: ["crc"] }).firestore()
        await assertSucceeds(d.doc("config/monitor").get())
        await assertSucceeds(pendingCmds(d).doc("se-bus").set(busCmd("seOnly")))
        await assertFails(pendingCmds(d).doc("se-mx").set(matrixCmd("seOnly")))
    })

    it("attribution and shape: forged uid, unknown type, extra field are refused", async () => {
        const d = db("aAdmin")
        await assertFails(pendingCmds(d).doc("f1").set(busCmd("someone-else")))
        await assertFails(pendingCmds(d).doc("f2").set({ ...busCmd("aAdmin"), type: "set_everything" }))
        await assertFails(pendingCmds(d).doc("f3").set({ ...busCmd("aAdmin"), evil: 1 }))
    })

    it("acks: operator reads own, nobody reads another's, members read none", async () => {
        await assertSucceeds(db("aMu").doc("monitor-live/commands/acks/ackMu").get())
        await assertFails(db("aMuSE").doc("monitor-live/commands/acks/ackMu").get())
        await assertFails(db("aAdmin").doc("monitor-live/commands/acks/ackMu").get())
        await assertFails(db("aMe").doc("monitor-live/commands/acks/ackMu").get())
        await assertFails(db("aMu").doc("monitor-live/commands/acks/ackMu").update({ status: "x" }))
    })

    it("pending queue is unreadable and immutable for clients (po included)", async () => {
        await assertFails(pendingCmds(db("po")).doc("bus-po").get())
        await assertFails(pendingCmds(db("po")).doc("bus-po").delete())
    })
})
