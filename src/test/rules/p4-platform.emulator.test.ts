import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing"
import { afterAll, beforeAll, describe, it } from "vitest"

import { A, B, C, dbOf, makeEnv, seedFixtures, type Persona } from "./personas"

/**
 * Multi-tenant phase 4 (lane 1): rules for the platform collections.
 *   invites, platformAudit — server only: nobody reads or writes from a
 *     browser, not even the platform owner (the console reads through routes).
 *   collections — read by members (member and up) of the owner tenant, by
 *     members of a tenant it is shared with or assigned to, and by the
 *     platform owner; written by the server only.
 */
let env: RulesTestEnvironment

beforeAll(async () => {
    env = await makeEnv("demo-lane1-p4-rules")
    await env.clearFirestore()
    await seedFixtures(env)
    await env.withSecurityRulesDisabled(async (c) => {
        const db = c.firestore()
        await db.doc("invites/i1").set({ orgId: A, email: "x@y.org", tokenHash: "h" })
        await db.doc("platformAudit/p1").set({ orgId: A, action: "update_tenant" })
        await db.doc(`collections/${A}__core`).set({ ownerOrgId: A, name: "core", visibility: "private", sharedWith: [], assignedTo: [] })
        await db.doc(`collections/${A}__nava`).set({ ownerOrgId: A, name: "nava", visibility: "private", sharedWith: [B], assignedTo: [] })
        await db.doc(`collections/${C}__x`).set({ ownerOrgId: C, name: "x", visibility: "private", sharedWith: [], assignedTo: [A] })
    })
})
afterAll(async () => {
    await env?.cleanup()
})

const everyone: Persona[] = ["po", "aAdmin", "aBL", "aMu", "aMe", "aPe", "bBL", "dual", "oldBL", "signedOut"]

describe("invites and platformAudit are server only", () => {
    for (const p of everyone) {
        it(`${p}: cannot read or write invites / platformAudit`, async () => {
            const db = dbOf(env, p)
            await assertFails(db.doc("invites/i1").get())
            await assertFails(db.collection("invites").get())
            await assertFails(db.doc("invites/new").set({ orgId: A }))
            await assertFails(db.doc("platformAudit/p1").get())
            await assertFails(db.collection("platformAudit").get())
            await assertFails(db.doc("platformAudit/new").set({ orgId: A }))
        })
    }
})

describe("collections", () => {
    const own = `collections/${A}__core`
    const sharedToB = `collections/${A}__nava`
    const assignedToA = `collections/${C}__x`

    it("owner tenant members (member and up) and the platform owner read", async () => {
        for (const p of ["po", "aAdmin", "aBL", "aMu", "aMe", "dual", "oldBL"] as Persona[]) await assertSucceeds(dbOf(env, p).doc(own).get())
    })

    it("pending, other tenants and signed-out visitors do not", async () => {
        for (const p of ["aPe", "bBL", "signedOut"] as Persona[]) await assertFails(dbOf(env, p).doc(own).get())
    })

    it("a tenant it is shared with reads it", async () => {
        await assertSucceeds(dbOf(env, "bBL").doc(sharedToB).get())
        await assertSucceeds(dbOf(env, "bSE").doc(sharedToB).get())
    })

    it("a tenant it is assigned to reads it; the rest of the world does not", async () => {
        await assertSucceeds(dbOf(env, "aMu").doc(assignedToA).get())
        await assertFails(dbOf(env, "bBL").doc(assignedToA).get())
    })

    it("nobody writes, the platform owner included", async () => {
        for (const p of ["po", "aAdmin"] as Persona[]) {
            await assertFails(dbOf(env, p).doc(own).update({ visibility: "all" }))
            await assertFails(dbOf(env, p).doc(`collections/${A}__new`).set({ ownerOrgId: A }))
            await assertFails(dbOf(env, p).doc(own).delete())
        }
    })
})
