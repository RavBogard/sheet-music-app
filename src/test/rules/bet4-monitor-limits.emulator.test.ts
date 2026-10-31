import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing"
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest"

import { B, dbOf, makeEnv, seedFixtures, type Persona } from "./personas"

/**
 * BET-4 — wedge ceilings and saved mixes, both tenants.
 *
 *  config/monitor.ceilings : the crc sound engineer and crc admins write it;
 *                            crc musicians do not; nobody from Brothers
 *                            Lazaroff does (not even its admin or its engineer);
 *                            a write must keep a usable default and name its writer.
 *  monitor-live/snapshots/buses/{bus}/items/{id} : no client writes; an engineer
 *                            or admin reads any; a musician reads only their own
 *                            named mix; the other tenant reads none.
 */
describe("BET-4 ceilings and snapshots", () => {
    let env: RulesTestEnvironment
    const db = (p: Persona) => dbOf(env, p)
    const blAdmin = () => env.authenticatedContext("blAdmin", { m: { [B]: "ad" } }).firestore()

    const ceilings = (uid: string, send = 0.8) => ({
        ceilings: { default: { send, master: 0.8 }, perBus: { "2": { send: 0.7 } }, updatedBy: uid, updatedAt: 1 },
    })
    const snap = (path: string) => `monitor-live/snapshots/buses/2/items/${path}`

    beforeAll(async () => {
        env = await makeEnv("demo-bet4-limits")
    })

    beforeEach(async () => {
        await env.clearFirestore()
        await seedFixtures(env)
        await env.withSecurityRulesDisabled(async (c) => {
            const f = c.firestore()
            await f.doc(snap("namedMu")).set({ busIndex: 2, kind: "named", name: "Fri", ownerUid: "aMu", sends: [], master: 0.6, createdAt: 1 })
            await f.doc(snap("namedOther")).set({ busIndex: 2, kind: "named", name: "X", ownerUid: "aBL", sends: [], master: 0.6, createdAt: 1 })
            await f.doc(snap("auto1")).set({ busIndex: 2, kind: "auto", sends: [], master: 0.6, createdAt: 1 })
        })
    })

    afterAll(async () => {
        await env.cleanup()
    })

    for (const p of ["aMuSE", "aAdmin"] as Persona[]) {
        it(`${p} (crc engineer / admin) writes the ceilings`, async () => {
            await assertSucceeds(db(p).doc("config/monitor").update(ceilings(p)))
        })
    }

    for (const p of ["aMu", "aBL", "aMe", "bSE", "bBL"] as Persona[]) {
        it(`${p} cannot write the ceilings`, async () => {
            await assertFails(db(p).doc("config/monitor").update(ceilings(p)))
        })
    }

    it("a Brothers Lazaroff admin cannot write crc's ceilings", async () => {
        await assertFails(blAdmin().doc("config/monitor").update(ceilings("blAdmin")))
    })

    it("a ceilings write must keep a usable default and name its writer", async () => {
        const d = db("aAdmin")
        await assertFails(d.doc("config/monitor").update(ceilings("aAdmin", 1.5)))
        await assertFails(d.doc("config/monitor").update(ceilings("someone-else")))
        await assertFails(d.doc("config/monitor").update({ ceilings: { perBus: {}, updatedBy: "aAdmin" } }))
    })

    it("an unrelated config/monitor write by an engineer still works, and cannot drop the ceilings", async () => {
        await assertSucceeds(db("aMuSE").doc("config/monitor").update(ceilings("aMuSE")))
        await assertSucceeds(db("aMuSE").doc("config/monitor").update({ defaultChannels: [1, 2] }))
        await assertFails(db("aAdmin").doc("config/monitor").set({ busAssignments: {} }))
    })

    it("snapshots: engineer and admin read any, musician only their own named, nobody writes", async () => {
        await assertSucceeds(db("aMuSE").doc(snap("namedOther")).get())
        await assertSucceeds(db("aAdmin").doc(snap("auto1")).get())
        await assertSucceeds(db("aMu").doc(snap("namedMu")).get())
        await assertFails(db("aMu").doc(snap("namedOther")).get())
        await assertFails(db("aMu").doc(snap("auto1")).get())
        for (const p of ["aMu", "aMuSE", "aAdmin"] as Persona[]) {
            await assertFails(db(p).doc(snap(`new-${p}`)).set({ busIndex: 2, kind: "named", ownerUid: p, sends: [], createdAt: 1 }))
            await assertFails(db(p).doc(snap("namedMu")).delete())
        }
    })

    it("snapshots: the other tenant reads none", async () => {
        await assertFails(db("bSE").doc(snap("auto1")).get())
        await assertFails(db("bBL").doc(snap("namedMu")).get())
        await assertFails(blAdmin().doc(snap("auto1")).get())
    })
})
