import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing"
import { afterAll, beforeAll, describe, it } from "vitest"

import { A, B, C, busCmd, dbOf, makeEnv, matrixCmd, pendingCmds, seedFixtures, type Persona } from "./personas"

/**
 * Multi-tenant phase 2 — design §3.5 transition rule. A token without `m` is
 * read through the legacy claims: `role` restricted to `orgIds` (missing →
 * ['crc']). Legacy admin is a tenant admin of its orgIds tenants, never a
 * bypass. Step 5 (§8) deletes this fallback; until then these must hold.
 */
describe("P2 §3.5 — legacy-claims personas", () => {
    let env: RulesTestEnvironment
    const db = (p: Persona) => dbOf(env, p)

    beforeAll(async () => {
        env = await makeEnv("demo-p2-transition")
        await env.clearFirestore()
        await seedFixtures(env)
    })

    afterAll(async () => {
        await env.cleanup()
    })

    describe("oldBL ({role:'band_leader'}, no orgIds) behaves as aBL in crc", () => {
        it("reads A songs/contacts/templates and runs the leader queries", async () => {
            const d = db("oldBL")
            await assertSucceeds(d.doc("songs/songA").get())
            await assertSucceeds(d.collection("songs").where("orgId", "==", A).get())
            await assertSucceeds(d.doc("contacts/cA").get())
            await assertSucceeds(d.collection("templates").where("orgId", "==", A).get())
            await assertSucceeds(d.collection("scheduling_assignments").where("orgId", "==", A).where("status", "in", ["pending"]).orderBy("assignedAt", "desc").get())
            await assertSucceeds(d.collection("memberships").where("tenantId", "==", A).get())
        })
        it("edits A setlists and tracks (stamped and unstamped)", async () => {
            const d = db("oldBL")
            await assertSucceeds(d.doc("setlists/sA").update({ name: "old leader" }))
            await assertSucceeds(d.doc("tracks/oT1").set({ setlistId: "sA", title: "T", order: 7, type: "song", orgId: A }))
            await assertSucceeds(d.doc("tracks/oT2").set({ setlistId: "sA", title: "T", order: 8, type: "song" }))
            await assertSucceeds(d.doc("tracks/tAu").update({ key: "F" }))
        })
        it("cannot do admin-only things in A", async () => {
            await assertFails(db("oldBL").doc("config/defaults").set({ x: 1 }))
            await assertFails(db("oldBL").doc("setlists/sA/history/h1").get())
            await assertFails(db("oldBL").doc("auditLogs/alA").get())
        })
        it("is a mixer operator in crc (musician or above)", async () => {
            await assertSucceeds(pendingCmds(db("oldBL")).doc("ob1").set(busCmd("oldBL")))
            await assertFails(pendingCmds(db("oldBL")).doc("ob2").set(matrixCmd("oldBL")))
        })
    })

    describe("oldAdminBoth ({role:'admin', orgIds:[crc,bl], soundEngineer}) is admin in A and B, not po", () => {
        for (const [org, setlist] of [
            [A, "sA"],
            [B, "sB"],
        ] as const) {
            it(`admin in ${org}`, async () => {
                const d = db("oldAdminBoth")
                await assertSucceeds(d.doc(`setlists/${setlist}/history/h1`).get())
                await assertSucceeds(d.collection("auditLogs").where("orgId", "==", org).orderBy("timestamp", "desc").limit(20).get())
                await assertSucceeds(d.doc(org === A ? "config/defaults" : `config/defaults__${org}`).set({ shabbat_morning: setlist }))
                await assertSucceeds(d.doc(`songs/song${org === A ? "A" : "B"}`).update({ title: "admin edit" }))
            })
        }
        it("legacy sound engineer: matrix command and config/monitor write (crc in orgIds)", async () => {
            const d = db("oldAdminBoth")
            await assertSucceeds(pendingCmds(d).doc("oa1").set(matrixCmd("oldAdminBoth")))
            await assertSucceeds(d.doc("config/monitor").set({ busAssignments: {} }))
        })
        it("is not po: no ops collections, no users list, no tenant C", async () => {
            const d = db("oldAdminBoth")
            await assertFails(d.doc("aiConfig/enrichment").get())
            await assertFails(d.collection("users").get())
            await assertFails(d.doc("songs/songC").get())
            await assertFails(d.collection("setlists").doc("sC").update({ name: "x" }))
            await assertFails(d.doc("system/globalAlert").set({ message: "x" }))
        })
    })

    describe("legacy admin limited to its orgIds", () => {
        it("{role:'admin'} with no orgIds is a crc admin only", async () => {
            const d = env.authenticatedContext("oldAdminCrc", { role: "admin" }).firestore()
            await assertSucceeds(d.doc("auditLogs/alA").get())
            await assertFails(d.doc("auditLogs/alB").get())
            await assertFails(d.doc("songs/songB").get())
            await assertFails(d.doc(`setlists/sB/performance/overrides`).set({ rows: {}, eventDay: "2026-10-16", rev: 2, updatedAt: 2, updatedBy: "oldAdminCrc" }))
        })
        it("{role:'band_leader', orgIds:[bl]} cannot reach crc", async () => {
            const d = env.authenticatedContext("oldBLbl", { role: "band_leader", orgIds: [B] }).firestore()
            await assertSucceeds(d.doc("songs/songB").get())
            await assertFails(d.doc("songs/songA").get())
            await assertFails(d.doc("setlists/sA").update({ name: "x" }))
            await assertFails(pendingCmds(d).doc("x").set(busCmd("oldBLbl")))
        })
        it("a token with an m map ignores the legacy role claim entirely", async () => {
            // m present but empty for B; legacy role says admin of both.
            const d = env.authenticatedContext("mixed", { m: { [A]: "me" }, role: "admin", orgIds: [A, B] }).firestore()
            await assertSucceeds(d.doc("songs/songA").get())
            await assertFails(d.doc("songs/songB").get())
            await assertFails(d.doc("auditLogs/alA").get())
        })
        it("a legacy role pointing at an unknown tenant grants nothing elsewhere", async () => {
            const d = env.authenticatedContext("oldC", { role: "admin", orgIds: [C] }).firestore()
            await assertSucceeds(d.doc("songs/songC").get())
            await assertFails(d.doc("songs/songA").get())
        })
    })

    describe("oldPending ({}) gets nothing beyond signed-in basics", () => {
        it("no songs, no setlist create, no mixer, no defaults", async () => {
            const d = db("oldPending")
            await assertFails(d.doc("songs/songA").get())
            await assertFails(d.collection("songs").where("orgId", "==", A).get())
            await assertFails(d.doc("setlists/oP").set({ name: "x", ownerId: "oldPending", orgId: A }))
            await assertFails(pendingCmds(d).doc("op").set(busCmd("oldPending")))
            await assertFails(d.doc("config/defaults").get())
            await assertFails(d.doc("config/monitor").get())
        })
        it("still has the signed-in basics (branding, own profile, a setlist by id)", async () => {
            const d = db("oldPending")
            // Phase 9: listing setlists now needs standing in the tenant, and
            // a claimless token has none anywhere. Nothing this persona can
            // see changes — no client query is unfiltered, and every surface
            // that lists setlists is already behind a role gate. Opening one
            // setlist by id stays public, which is the service-block case.
            await assertFails(d.collection("setlists").get())
            await assertSucceeds(d.doc("setlists/sA").get())
            await assertSucceeds(d.doc("config/congregation").get())
            await assertSucceeds(d.doc("users/oldPending").get())
            await assertSucceeds(d.doc(`memberships/${A}__oldPending`).get())
        })
    })
})
