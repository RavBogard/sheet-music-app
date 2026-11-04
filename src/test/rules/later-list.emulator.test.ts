import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing"
import { afterAll, beforeAll, describe, it } from "vitest"

import { A, B, dbOf, makeEnv } from "./personas"

/**
 * Setlist sync later list (2026-11-03):
 *  - `sync_runs` (the admin Data tab's "last sync") is readable by that
 *    tenant's admins and the platform owner, and by no one else. It had no
 *    rule, so the catch-all denied everyone and the tab was always blank.
 *  - `songs/*` is a server-only write: the grid's sticky defaults go through
 *    POST /api/songs/defaults, the catalogue fields through catalog-mirror.ts.
 * Both tenants are asserted.
 */
describe("sync_runs read rule and songs server-only writes", () => {
    let env: RulesTestEnvironment

    beforeAll(async () => {
        env = await makeEnv("demo-later-list")
        await env.withSecurityRulesDisabled(async (c) => {
            const db = c.firestore()
            await db.doc("sync_runs/runA").set({ orgId: A, startedAt: "2026-11-03T10:00:00Z", status: "completed" })
            await db.doc("sync_runs/runB").set({ orgId: B, startedAt: "2026-11-03T10:00:00Z", status: "completed" })
            await db.doc("songs/songA").set({ orgId: A, title: "A" })
            await db.doc("songs/songB").set({ orgId: B, title: "B" })
        })
    })
    afterAll(async () => {
        await env.cleanup()
    })

    const lastRun = (org: string) => (p: Parameters<typeof dbOf>[1]) =>
        dbOf(env, p).collection("sync_runs").where("orgId", "==", org).orderBy("startedAt", "desc").limit(1).get()

    it("an admin lists and reads their own tenant's runs (crc admin; BL admin via dual)", async () => {
        await assertSucceeds(lastRun(A)("aAdmin"))
        await assertSucceeds(dbOf(env, "aAdmin").doc("sync_runs/runA").get())
        // dual: admin of BL, band leader of crc.
        await assertSucceeds(lastRun(B)("dual"))
        await assertSucceeds(dbOf(env, "dual").doc("sync_runs/runB").get())
    })

    it("an admin of one tenant cannot read the other's runs", async () => {
        await assertFails(lastRun(B)("aAdmin"))
        await assertFails(dbOf(env, "aAdmin").doc("sync_runs/runB").get())
        await assertFails(lastRun(A)("dual"))
        await assertFails(dbOf(env, "dual").doc("sync_runs/runA").get())
    })

    it("below admin, signed out, or unfiltered: refused", async () => {
        await assertFails(lastRun(A)("aBL"))
        await assertFails(lastRun(B)("bBL"))
        await assertFails(lastRun(A)("aMu"))
        await assertFails(lastRun(A)("signedOut"))
        await assertFails(dbOf(env, "aAdmin").collection("sync_runs").get())
    })

    it("the platform owner reads both tenants' runs; nobody writes them", async () => {
        await assertSucceeds(lastRun(A)("po"))
        await assertSucceeds(lastRun(B)("po"))
        await assertFails(dbOf(env, "po").doc("sync_runs/x").set({ orgId: A }))
        await assertFails(dbOf(env, "aAdmin").doc("sync_runs/runA").update({ status: "x" }))
    })

    it("songs: no browser write in either tenant, the platform owner included", async () => {
        await assertFails(dbOf(env, "aBL").doc("songs/songA").update({ defaults: { key: "D" } }))
        await assertFails(dbOf(env, "bBL").doc("songs/songB").update({ defaults: { key: "D" } }))
        await assertFails(dbOf(env, "aAdmin").doc("songs/new").set({ orgId: A, title: "N" }))
        await assertFails(dbOf(env, "bBL").doc("songs/songB").delete())
        await assertFails(dbOf(env, "po").doc("songs/songB").update({ title: "x" }))
        // Reads are unchanged.
        await assertSucceeds(dbOf(env, "aBL").doc("songs/songA").get())
        await assertSucceeds(dbOf(env, "bBL").doc("songs/songB").get())
    })
})
