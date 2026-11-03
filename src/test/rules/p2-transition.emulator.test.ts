import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing"
import { afterAll, beforeAll, describe, it } from "vitest"

import { A, B, C, busCmd, ctx, dbOf, makeEnv, matrixCmd, pendingCmds, seedFixtures, type Persona } from "./personas"

/**
 * SEC-03 (2026-11-02): the §3.5 transition fallback is gone. A token without
 * `m` used to be read through the legacy claims (`role` + `orgIds`,
 * `soundEngineer`); it now holds no tenant role in either tenant, in
 * firestore.rules and storage.rules alike. Every prod account carries `m`
 * (migrate-memberships --plan: 0 unmigrated), so nobody is locked out; a
 * token minted after a migrate --undo gets signed-in basics only.
 *
 * The other half — a normal membership token still works in each tenant —
 * is asserted here too, so this file alone shows the change is a deny for
 * legacy tokens and nothing else.
 */
describe("SEC-03 — legacy-claims tokens hold no tenant role", () => {
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

    describe("Firestore: a legacy-only token is denied in crc", () => {
        it("oldBL ({role:'band_leader'}) reads and edits nothing crc-scoped", async () => {
            const d = db("oldBL")
            await assertFails(d.doc("songs/songA").get())
            await assertFails(d.collection("songs").where("orgId", "==", A).get())
            await assertFails(d.doc("contacts/cA").get())
            await assertFails(d.collection("templates").where("orgId", "==", A).get())
            await assertFails(d.doc("setlists/sA").update({ name: "old leader" }))
            await assertFails(d.doc("tracks/oT1").set({ setlistId: "sA", title: "T", order: 7, type: "song", orgId: A }))
            await assertFails(d.doc("tracks/tAu").update({ key: "F" }))
            await assertFails(pendingCmds(d).doc("ob1").set(busCmd("oldBL")))
        })
        it("{role:'admin'} with no orgIds is not a crc admin", async () => {
            const d = env.authenticatedContext("oldAdminCrc", { role: "admin" }).firestore()
            await assertFails(d.doc("auditLogs/alA").get())
            await assertFails(d.doc("config/defaults").set({ shabbat_morning: "sA" }))
            await assertFails(d.doc("setlists/sA/history/h1").get())
        })
    })

    describe("Firestore: a legacy-only token is denied in brotherslazaroff", () => {
        it("{role:'band_leader', orgIds:[bl]} reads and edits nothing bl-scoped", async () => {
            const d = env.authenticatedContext("oldBLbl", { role: "band_leader", orgIds: [B] }).firestore()
            await assertFails(d.doc("songs/songB").get())
            await assertFails(d.collection("songs").where("orgId", "==", B).get())
            await assertFails(d.doc("setlists/sB").update({ name: "x" }))
            await assertFails(d.doc("contacts/cB").get())
        })
        it("oldAdminBoth ({role:'admin', orgIds:[crc,bl], soundEngineer}) is admin nowhere", async () => {
            const d = db("oldAdminBoth")
            for (const [org, setlist] of [
                [A, "sA"],
                [B, "sB"],
            ] as const) {
                await assertFails(d.doc(`setlists/${setlist}/history/h1`).get())
                await assertFails(d.collection("auditLogs").where("orgId", "==", org).orderBy("timestamp", "desc").limit(20).get())
                await assertFails(d.doc(org === A ? "config/defaults" : `config/defaults__${org}`).set({ shabbat_morning: setlist }))
                await assertFails(d.doc(`songs/song${org === A ? "A" : "B"}`).update({ title: "admin edit" }))
            }
            // The legacy soundEngineer flag is ignored too.
            await assertFails(pendingCmds(d).doc("oa1").set(matrixCmd("oldAdminBoth")))
            await assertFails(d.doc("config/monitor").set({ busAssignments: {} }))
            await assertFails(d.doc("songs/songC").get())
        })
    })

    describe("Firestore: a membership token still works in each tenant", () => {
        it("aBL ({m:{crc:'bl'}}) reads and edits crc", async () => {
            const d = db("aBL")
            await assertSucceeds(d.doc("songs/songA").get())
            await assertSucceeds(d.collection("songs").where("orgId", "==", A).get())
            // Setlists and tracks are server-written only (setlist sync PR 3).
            await assertFails(d.doc("setlists/sA").update({ name: "leader edit" }))
            await assertFails(d.doc("tracks/mT1").set({ setlistId: "sA", title: "T", order: 7, type: "song", orgId: A }))
            await assertSucceeds(pendingCmds(d).doc("mb1").set(busCmd("aBL")))
        })
        it("bBL ({m:{brotherslazaroff:'bl'}}) reads and edits brotherslazaroff", async () => {
            const d = db("bBL")
            await assertSucceeds(d.doc("songs/songB").get())
            await assertSucceeds(d.collection("songs").where("orgId", "==", B).get())
            await assertFails(d.doc("setlists/sB").update({ name: "leader edit" }))
            await assertSucceeds(d.doc("contacts/cB").get())
        })
        it("an m map wins over legacy claims on the same token", async () => {
            const d = env.authenticatedContext("mixed", { m: { [A]: "me" }, role: "admin", orgIds: [A, B] }).firestore()
            await assertSucceeds(d.doc("songs/songA").get())
            await assertFails(d.doc("songs/songB").get())
            await assertFails(d.doc("auditLogs/alA").get())
        })
        it("a legacy role at an unknown tenant grants nothing there either", async () => {
            const d = env.authenticatedContext("oldC", { role: "admin", orgIds: [C] }).firestore()
            await assertFails(d.doc("songs/songC").get())
        })
    })

    describe("oldPending ({}) keeps the signed-in basics", () => {
        it("a setlist by id, branding, own profile and own membership doc", async () => {
            const d = db("oldPending")
            await assertFails(d.collection("setlists").get())
            await assertFails(d.doc("songs/songA").get())
            await assertSucceeds(d.doc("setlists/sA").get())
            await assertSucceeds(d.doc("config/congregation").get())
            await assertSucceeds(d.doc("users/oldPending").get())
            await assertSucceeds(d.doc(`memberships/${A}__oldPending`).get())
        })
        it("a legacy-only token keeps them too (no lockout of public surfaces)", async () => {
            const d = ctx(env, "oldBL").firestore()
            await assertSucceeds(d.doc("setlists/sA").get())
            await assertSucceeds(d.doc("setlists/sB").get())
            await assertSucceeds(d.doc("users/oldBL").get())
        })
    })
})
