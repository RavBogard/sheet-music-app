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

/**
 * Phase 5 proper: a row shared from tenant C (owner) to A. Members (not
 * pending) of A read it by id and through `visibleToOrgs array-contains A`;
 * B does not; nobody but C's band leaders writes it; unfiltered queries stay
 * refused; library_index is readable by the same visibility and never written.
 */
describe("P5 rules — shared chart rows", () => {
    let env: RulesTestEnvironment
    const sharedRow = { title: "Shared", orgId: C, collection: "nava", collectionId: `${C}__nava`, visibleToOrgs: [C, A], libraryOrgs: [C, A] }
    const privateC = { title: "C only", orgId: C, collectionId: `${C}__core`, visibleToOrgs: [C], libraryOrgs: [C] }

    beforeAll(async () => {
        env = await makeEnv("demo-p5-shared-rows")
        await env.clearFirestore()
        await seedFixtures(env)
        await env.withSecurityRulesDisabled(async (c) => {
            const db = c.firestore()
            await db.doc("songs/shared1").set(sharedRow)
            await db.doc("songs/privC").set(privateC)
            await db.doc("library_index/shared1").set({ ...sharedRow, name: "Shared.pdf" })
            await db.doc("library_index/privC").set({ ...privateC, name: "C.pdf" })
            await db.doc("library_index/ownA").set({ name: "A.pdf", orgId: A, visibleToOrgs: [A] })
            await db.doc("library_index/legacyA").set({ name: "Legacy.pdf", orgId: A })
        })
    }, 120_000)

    afterAll(async () => {
        await env.cleanup()
    })

    const get = (p: Persona, path: string) => dbOf(env, p).doc(path).get()
    const shared = (p: Persona, coll: string, org: string) =>
        dbOf(env, p).collection(coll).where("visibleToOrgs", "array-contains", org).get()

    for (const coll of ["songs", "library_index"]) {
        for (const p of ["aMe", "aMu", "aBL", "aAdmin", "dual", "po", "oldBL"] as Persona[]) {
            it(`${p} gets ${coll}/shared1`, async () => void (await assertSucceeds(get(p, `${coll}/shared1`))))
        }
        for (const p of ["aPe", "bBL", "bSE", "oldPending", "signedOut"] as Persona[]) {
            it(`${p} cannot get ${coll}/shared1`, async () => void (await assertFails(get(p, `${coll}/shared1`))))
        }
        for (const p of ["aMe", "aAdmin", "bBL", "dual"] as Persona[]) {
            it(`${p} cannot get ${coll}/privC`, async () => void (await assertFails(get(p, `${coll}/privC`))))
        }
        it(`aMe queries ${coll} visibleToOrgs array-contains crc`, async () => {
            const snap = await assertSucceeds(shared("aMe", coll, A))
            const ids = snap.docs.map((d) => d.id)
            if (!ids.includes("shared1") || ids.includes("privC")) throw new Error(ids.join(","))
        })
        it(`dual queries ${coll} for both its tenants`, async () => {
            await assertSucceeds(shared("dual", coll, A))
            await assertSucceeds(shared("dual", coll, B))
        })
        it(`oldBL (legacy claims) queries ${coll} for crc`, async () => void (await assertSucceeds(shared("oldBL", coll, A))))
        it(`aMe cannot query ${coll} for brotherslazaroff or nava-tehila`, async () => {
            await assertFails(shared("aMe", coll, B))
            await assertFails(shared("aMe", coll, C))
        })
        it(`aPe and oldPending cannot query ${coll} for crc`, async () => {
            await assertFails(shared("aPe", coll, A))
            await assertFails(shared("oldPending", coll, A))
        })
        it(`a member pending elsewhere still queries ${coll} for its own tenant`, async () => {
            const db = env.authenticatedContext("mixed", { m: { [A]: "me", [B]: "pe" } }).firestore()
            await assertSucceeds(db.collection(coll).where("visibleToOrgs", "array-contains", A).get())
            await assertFails(db.collection(coll).where("visibleToOrgs", "array-contains", B).get())
        })
        it(`aMe cannot query ${coll} unfiltered`, async () => void (await assertFails(dbOf(env, "aMe").collection(coll).get())))
    }

    it("aMe lists library_index where orgId == crc (own rows, stamped or not)", async () => {
        const snap = await assertSucceeds(dbOf(env, "aMe").collection("library_index").where("orgId", "==", A).get())
        const ids = snap.docs.map((d) => d.id).sort()
        if (ids.join() !== "legacyA,ownA") throw new Error(ids.join())
    })

    it("no consumer writes a shared row; library_index is never written from the browser", async () => {
        await assertFails(dbOf(env, "aAdmin").doc("songs/shared1").update({ title: "x" }))
        await assertFails(dbOf(env, "aBL").doc("songs/shared1").delete())
        await assertFails(dbOf(env, "aAdmin").doc("library_index/shared1").update({ name: "x" }))
        await assertFails(dbOf(env, "po").doc("library_index/shared1").update({ name: "x" }))
    })
})
