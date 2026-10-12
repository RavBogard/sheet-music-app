// @vitest-environment node
import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing"
import { afterAll, beforeAll, describe, it } from "vitest"

import { A, B, C, dbOf, makeEnv, seedFixtures, type Persona } from "./personas"

/**
 * Multi-tenant phase 5 — shared collections in firestore.rules.
 *
 * GOLDEN (captured on 9e0c6fac, before any phase-5 rule): own-tenant catalogue
 * reads that must keep working, and cross-tenant reads that must stay refused,
 * for rows that carry no visibility stamp and for rows stamped visible only to
 * their owner.
 */
describe("P5 rules golden — own-tenant catalogue reads", () => {
    let env: RulesTestEnvironment

    beforeAll(async () => {
        env = await makeEnv("demo-p5-shared")
        await env.clearFirestore()
        await seedFixtures(env)
        await env.withSecurityRulesDisabled(async (c) => {
            const db = c.firestore()
            // Stamped as the phase-5 stamp script leaves them: visible to the owner only.
            await db.doc("songs/songAs").set({ title: "A stamped", orgId: A, collectionId: `${A}__core`, visibleToOrgs: [A] })
            await db.doc("songs/songBs").set({ title: "B stamped", orgId: B, collectionId: `${B}__core`, visibleToOrgs: [B] })
        })
    }, 120_000)

    afterAll(async () => {
        await env.cleanup()
    })

    const get = (p: Persona, path: string) => dbOf(env, p).doc(path).get()
    const listOrg = (p: Persona, org: string) => dbOf(env, p).collection("songs").where("orgId", "==", org).get()

    const CAN_GET: Array<[Persona, string]> = [
        ["aMe", "songs/songA"],
        ["aMe", "songs/songAs"],
        ["aMu", "songs/songA"],
        ["bBL", "songs/songB"],
        ["bBL", "songs/songBs"],
        ["dual", "songs/songA"],
        ["dual", "songs/songBs"],
        ["po", "songs/songC"],
        ["oldBL", "songs/songAs"],
    ]
    const CANNOT_GET: Array<[Persona, string]> = [
        ["aMe", "songs/songB"],
        ["aMe", "songs/songBs"],
        ["aMe", "songs/songC"],
        ["aPe", "songs/songA"],
        ["aPe", "songs/songAs"],
        ["bBL", "songs/songA"],
        ["bBL", "songs/songAs"],
        ["oldPending", "songs/songA"],
        ["signedOut", "songs/songA"],
    ]
    for (const [p, path] of CAN_GET) it(`${p} gets ${path}`, async () => void (await assertSucceeds(get(p, path))))
    for (const [p, path] of CANNOT_GET) it(`${p} cannot get ${path}`, async () => void (await assertFails(get(p, path))))

    it("aMe lists songs where orgId == crc", async () => void (await assertSucceeds(listOrg("aMe", A))))
    it("bBL lists songs where orgId == brotherslazaroff", async () => void (await assertSucceeds(listOrg("bBL", B))))
    it("aMe cannot list songs where orgId == brotherslazaroff", async () => void (await assertFails(listOrg("aMe", B))))
    it("aPe cannot list songs where orgId == crc", async () => void (await assertFails(listOrg("aPe", A))))
    it("aMe cannot list songs unfiltered", async () => void (await assertFails(dbOf(env, "aMe").collection("songs").get())))
    it("nobody but po writes library_index", async () => {
        await assertFails(dbOf(env, "aAdmin").doc("library_index/x").set({ orgId: A }))
        await assertFails(dbOf(env, "bBL").doc("library_index/x").set({ orgId: B }))
    })
    it("tenant C rows stay invisible to A and B members", async () => {
        await assertFails(get("aAdmin", "songs/songC"))
        await assertFails(get("bBL", "songs/songC"))
        void C
    })
})
