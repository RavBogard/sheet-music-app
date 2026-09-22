import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import {
    assertFails,
    assertSucceeds,
    initializeTestEnvironment,
    type RulesTestEnvironment,
} from "@firebase/rules-unit-testing"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { deviationId, planReset, planSwap, type Deviation, type OverridesDoc } from "@/lib/performance/tonight"

/**
 * David's ask 4 — rules for tonight-only swaps.
 *
 * `setlists/{id}/performance/overrides`: signed-in get only (signed-out iPads
 * read it through the server); write by band_leader/admin of the setlist's
 * tenant, closed field set, rev +1 per write. `performedDeviations`: create
 * only, in the same commit as the overrides rev it describes.
 */
describe("tonight-only swap rules", () => {
    let testEnv: RulesTestEnvironment
    const DAY = "2026-09-26"

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        const [host, portStr] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080").split(":")
        testEnv = await initializeTestEnvironment({
            projectId: "demo-tonight-rules",
            firestore: {
                rules: readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8"),
                host,
                port: Number.parseInt(portStr ?? "8080", 10),
            },
        })
    })

    afterAll(async () => {
        await testEnv.cleanup()
    })

    beforeEach(async () => {
        await testEnv.clearFirestore()
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
            const db = ctx.firestore()
            await db.collection("setlists").doc("s-crc").set({ name: "CRC Shabbat", orgId: "crc" })
            await db.collection("setlists").doc("s-legacy").set({ name: "Legacy" })
            await db.collection("setlists").doc("s-bl").set({ name: "BL gig", orgId: "brotherslazaroff" })
        })
    })

    const leader = () => testEnv.authenticatedContext("crc-lead", { role: "band_leader" }).firestore()
    const blLeader = () =>
        testEnv.authenticatedContext("bl-lead", { role: "band_leader", orgIds: ["brotherslazaroff"] }).firestore()
    const musician = () => testEnv.authenticatedContext("crc-mus", { role: "musician" }).firestore()
    const admin = () => testEnv.authenticatedContext("admin", { role: "admin" }).firestore()
    const anon = () => testEnv.unauthenticatedContext().firestore()

    function plan(by: string, prior: OverridesDoc | null = null, to = "B") {
        const p = planSwap(prior, {
            rowId: "r1",
            planned: { fileId: "A", title: "Bar'chu" },
            expectedBeforeFileId: prior?.rows.r1?.fileId ?? "A",
            choice: { fileId: to, title: `Bar'chu (${to})` },
            by,
            at: 1_790_000_000_000,
            eventDay: DAY,
        })
        if (p.kind !== "write") throw new Error(p.kind)
        return p
    }

    function write(db: ReturnType<typeof leader>, setlistId: string, next: OverridesDoc, devs: Deviation[]) {
        const batch = db.batch()
        batch.set(db.collection("setlists").doc(setlistId).collection("performance").doc("overrides"), next)
        for (const d of devs) {
            batch.set(db.collection("setlists").doc(setlistId).collection("performedDeviations").doc(deviationId(d)), d)
        }
        return batch.commit()
    }

    it("a band leader of the tenant swaps: overrides + deviation in one commit", async () => {
        const p = plan("crc-lead")
        await assertSucceeds(write(leader(), "s-crc", p.next, p.deviations))
        // Legacy unstamped setlists belong to crc.
        await assertSucceeds(write(leader(), "s-legacy", p.next, p.deviations))
    })

    it("an admin may swap on either tenant", async () => {
        const p = plan("admin")
        await assertSucceeds(write(admin(), "s-bl", p.next, p.deviations))
    })

    it("a musician cannot swap", async () => {
        const p = plan("crc-mus")
        await assertFails(write(musician(), "s-crc", p.next, p.deviations))
    })

    it("a leader of another tenant cannot swap", async () => {
        const p = plan("bl-lead")
        await assertFails(write(blLeader(), "s-crc", p.next, p.deviations))
    })

    it("stale write: rev must advance by exactly one", async () => {
        const first = plan("crc-lead")
        await assertSucceeds(write(leader(), "s-crc", first.next, first.deviations))
        const second = plan("crc-lead", first.next, "C")
        // Replaying the first commit (rev 1 again) is refused.
        await assertFails(write(leader(), "s-crc", first.next, []))
        await assertSucceeds(write(leader(), "s-crc", second.next, second.deviations))
    })

    it("Reset to plan across many rows commits in one write (rules access-call limit)", async () => {
        let doc: OverridesDoc | null = null
        const planned: Record<string, { fileId: string; title: string }> = {}
        for (let i = 0; i < 12; i++) {
            const rowId = `row${i}`
            planned[rowId] = { fileId: `P${i}`, title: `Row ${i}` }
            const p = planSwap(doc, {
                rowId,
                planned: planned[rowId],
                expectedBeforeFileId: `P${i}`,
                choice: { fileId: `S${i}`, title: `Swap ${i}` },
                by: "crc-lead",
                at: 1_790_000_000_000 + i,
                eventDay: DAY,
            })
            if (p.kind !== "write") throw new Error(p.kind)
            await assertSucceeds(write(leader(), "s-crc", p.next, p.deviations))
            doc = p.next
        }
        const reset = planReset(doc, { planned, by: "crc-lead", at: 1_790_000_100_000, eventDay: DAY })
        if (reset.kind !== "write") throw new Error(reset.kind)
        expect(reset.deviations).toHaveLength(12)
        await assertSucceeds(write(leader(), "s-crc", reset.next, reset.deviations))
    })

    it("closed field set and honest author", async () => {
        const p = plan("crc-lead")
        await assertFails(write(leader(), "s-crc", { ...p.next, extra: 1 } as never, p.deviations))
        await assertFails(write(leader(), "s-crc", { ...p.next, updatedBy: "someone-else" }, []))
        await assertFails(write(leader(), "s-crc", { ...p.next, eventDay: "next shabbat" }, []))
    })

    it("a deviation cannot be written without the matching overrides commit", async () => {
        const p = plan("crc-lead")
        const db = leader()
        await assertFails(
            db.collection("setlists").doc("s-crc").collection("performedDeviations").doc(deviationId(p.deviations[0])).set(p.deviations[0]),
        )
    })

    it("deviations are append-only; overrides are never deleted by clients", async () => {
        const p = plan("crc-lead")
        await assertSucceeds(write(leader(), "s-crc", p.next, p.deviations))
        const db = leader()
        const devRef = db.collection("setlists").doc("s-crc").collection("performedDeviations").doc(deviationId(p.deviations[0]))
        await assertFails(devRef.set({ ...p.deviations[0], kind: "undo" }))
        await assertFails(devRef.delete())
        await assertFails(db.collection("setlists").doc("s-crc").collection("performance").doc("overrides").delete())
    })

    it("reads: overrides are signed-in only; deviations are the tenant's leaders'", async () => {
        const p = plan("crc-lead")
        await assertSucceeds(write(leader(), "s-crc", p.next, p.deviations))
        const ov = (db: ReturnType<typeof leader>) =>
            db.collection("setlists").doc("s-crc").collection("performance").doc("overrides").get()
        await assertSucceeds(ov(musician()))
        await assertFails(ov(anon()))
        const devs = (db: ReturnType<typeof leader>) =>
            db.collection("setlists").doc("s-crc").collection("performedDeviations").get()
        await assertSucceeds(devs(leader()))
        await assertFails(devs(musician()))
        await assertFails(devs(blLeader()))
    })
})
