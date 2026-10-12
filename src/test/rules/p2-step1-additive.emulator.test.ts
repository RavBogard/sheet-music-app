import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing"
import { afterAll, beforeAll, describe, it } from "vitest"

import { A, B, dbOf, makeEnv, rulesText, seedFixtures, type Persona } from "./personas"

/**
 * Multi-tenant phase 2, deploy step 1 (design §4.2, §8): today's rules plus
 * the identity helpers, `memberships`, `platform` and `config/defaults__{t}`.
 * The file lives at docs/planning/2026-10-12-multitenant/work/
 * firestore.step1-additive.rules for the lead to apply. These cases prove it
 * compiles, grants what the step-1 app needs, and that the step-1 app's
 * orgId-constrained queries (§1.2) pass the OLD rules it ships beside.
 */
const STEP1 = "docs/planning/2026-10-12-multitenant/work/firestore.step1-additive.rules"

describe("P2 step-1 additive rules", () => {
    let env: RulesTestEnvironment
    const db = (p: Persona) => dbOf(env, p)

    beforeAll(async () => {
        env = await makeEnv("demo-p2-step1", { firestoreRules: rulesText(STEP1) })
        await env.clearFirestore()
        await seedFixtures(env)
    })

    afterAll(async () => {
        await env.cleanup()
    })

    describe("memberships", () => {
        it("own membership is readable, existing and missing", async () => {
            await assertSucceeds(db("aMe").doc(`memberships/${A}__aMe`).get())
            await assertSucceeds(db("aMe").doc(`memberships/${B}__aMe`).get())
            await assertSucceeds(db("oldPending").doc(`memberships/${A}__oldPending`).get())
            await assertSucceeds(db("aMe").collection("memberships").where("uid", "==", "aMe").get())
        })
        it("a band leader lists its tenant's memberships; legacy BL as crc", async () => {
            await assertSucceeds(db("aBL").collection("memberships").where("tenantId", "==", A).get())
            await assertSucceeds(db("oldBL").collection("memberships").where("tenantId", "==", A).get())
            await assertSucceeds(db("bBL").doc(`memberships/${B}__bSE`).get())
        })
        it("nobody reads another tenant's memberships or another person's as a member", async () => {
            await assertFails(db("aMe").doc(`memberships/${A}__aBL`).get())
            await assertFails(db("aBL").collection("memberships").where("tenantId", "==", B).get())
            await assertFails(db("oldBL").doc(`memberships/${B}__bBL`).get())
            await assertFails(db("aBL").collection("memberships").get())
            await assertFails(db("signedOut").doc(`memberships/${A}__aMe`).get())
        })
        it("no client writes a membership (admin included)", async () => {
            await assertFails(db("aAdmin").doc(`memberships/${A}__aMe`).update({ role: "admin" }))
            await assertFails(db("aMe").doc(`memberships/${A}__aMe`).set({ uid: "aMe", tenantId: A, role: "admin" }))
            await assertFails(db("oldAdminBoth").doc(`memberships/${B}__x`).set({ uid: "x", tenantId: B, role: "admin" }))
        })
    })

    describe("platform", () => {
        it("is server-only", async () => {
            await assertFails(db("po").doc("platform/owners").get())
            await assertFails(db("aAdmin").doc("platform/owners").set({ uids: ["aAdmin"] }))
        })
    })

    describe("config/defaults__{tenant}", () => {
        it("members of the tenant read; admins of the tenant write", async () => {
            await assertSucceeds(db("bBL").doc(`config/defaults__${B}`).get())
            await assertSucceeds(db("dual").doc(`config/defaults__${B}`).set({ shabbat_morning: "sB" }))
            await assertSucceeds(db("oldAdminBoth").doc(`config/defaults__${B}`).set({ shabbat_morning: "sB" }))
        })
        it("others are refused", async () => {
            await assertFails(db("aMe").doc(`config/defaults__${B}`).get())
            await assertFails(db("bBL").doc(`config/defaults__${B}`).set({ x: 1 }))
            await assertFails(db("aAdmin").doc(`config/defaults__${B}`).set({ x: 1 }))
            await assertFails(db("oldBL").doc(`config/defaults__${B}`).get())
        })
        it("bare config/defaults and config/monitor keep today's behaviour", async () => {
            await assertSucceeds(db("bBL").doc("config/defaults").get())
            await assertSucceeds(db("oldPending").doc("config/monitor").get())
            await assertFails(db("aBL").doc("config/defaults").set({ x: 1 }))
        })
    })

    describe("the step-1 app's orgId-constrained queries pass today's rules", () => {
        it("setlists orgId== with eventDate range / date order (S6-S11)", async () => {
            await assertSucceeds(db("bBL").collection("setlists").where("orgId", "==", B).where("eventDate", ">=", new Date(0)).orderBy("eventDate").limit(1).get())
            await assertSucceeds(db("oldBL").collection("setlists").where("orgId", "==", A).orderBy("date", "desc").limit(10).get())
        })
        it("templates orgId== (TM2), assignments orgId== (SA3), auditLogs orgId== (AL1, admin)", async () => {
            await assertSucceeds(db("bBL").collection("templates").where("orgId", "==", B).get())
            const leader = env.authenticatedContext("blLegacy", { role: "band_leader", orgIds: [B] }).firestore()
            await assertSucceeds(leader.collection("scheduling_assignments").where("orgId", "==", B).where("status", "in", ["pending"]).orderBy("assignedAt", "desc").get())
            const admin = env.authenticatedContext("admLegacy", { role: "admin" }).firestore()
            await assertSucceeds(admin.collection("auditLogs").where("orgId", "==", A).orderBy("timestamp", "desc").limit(20).get())
        })
    })
})
