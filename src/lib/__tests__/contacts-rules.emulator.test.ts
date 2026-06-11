import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import {
    assertFails,
    assertSucceeds,
    initializeTestEnvironment,
    type RulesTestEnvironment,
} from "@firebase/rules-unit-testing"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

/**
 * v11.4-03 (D8 item 3) — contacts collection Firestore rules.
 *
 * Contacts are a leader's address book (remembered ad-hoc recipients). They are
 * NOT member-facing, so READ is leader/admin only and org-isolated. Proves:
 *  - AC-1: a band_leader can create/read/delete a contact in their OWN org; a
 *    plain musician/member is denied create AND read.
 *  - AC-2: a leader of org Y cannot read or delete org X's contact (tenant wall);
 *    cross-tenant orgId on create is denied.
 *
 * Rules edits are high-blast-radius — this is a blocking gate before
 * `firebase deploy`. Runs via `npm run test:emulator`.
 */
describe("v11.4-03 firestore.rules — contacts", () => {
    let testEnv: RulesTestEnvironment

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        const [host, portStr] = (
            process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080"
        ).split(":")
        const port = Number.parseInt(portStr ?? "8080", 10)

        testEnv = await initializeTestEnvironment({
            projectId: "demo-v11-4-03-contacts",
            firestore: {
                rules: readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8"),
                host,
                port,
            },
        })
    })

    afterAll(async () => {
        await testEnv.cleanup()
    })

    beforeEach(async () => {
        await testEnv.clearFirestore()
        // Seed a crc contact and a bl contact via a privileged context.
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
            const db = ctx.firestore()
            await db.collection("contacts").doc("c-crc").set({
                orgId: "crc",
                name: "Jane Guest",
                email: "jane@example.com",
                createdBy: "crc-leader",
            })
            await db.collection("contacts").doc("c-bl").set({
                orgId: "brotherslazaroff",
                name: "BL Guest",
                email: "guest@bl.example",
                createdBy: "bl-leader",
            })
        })
    })

    // Claimless CRC band_leader (no orgIds claim → defaults to crc in rules).
    const crcLeader = () =>
        testEnv.authenticatedContext("crc-leader", { role: "band_leader" }).firestore()
    const blLeader = () =>
        testEnv
            .authenticatedContext("bl-leader", {
                role: "band_leader",
                orgIds: ["brotherslazaroff"],
            })
            .firestore()
    const musician = () =>
        testEnv.authenticatedContext("m-uid", { role: "musician" }).firestore()
    const member = () =>
        testEnv.authenticatedContext("mem-uid", { role: "member" }).firestore()

    // ─── AC-1: leader CRUD in own org; non-leaders denied ──────────────────

    it("AC-1: a crc leader can create + read + delete a crc contact", async () => {
        const db = crcLeader()
        await assertSucceeds(
            db.collection("contacts").doc("c-new").set({
                orgId: "crc",
                name: "New Person",
                email: "new@example.com",
                createdBy: "crc-leader",
            }),
        )
        await assertSucceeds(db.collection("contacts").doc("c-crc").get())
        await assertSucceeds(db.collection("contacts").doc("c-crc").delete())
    })

    it("AC-1: a plain musician is DENIED create AND read of contacts", async () => {
        await assertFails(
            musician().collection("contacts").doc("c-x").set({
                orgId: "crc",
                name: "X",
                email: "x@example.com",
                createdBy: "m-uid",
            }),
        )
        await assertFails(musician().collection("contacts").doc("c-crc").get())
    })

    it("AC-1: a member is DENIED read of contacts (not member-facing)", async () => {
        await assertFails(member().collection("contacts").doc("c-crc").get())
    })

    // ─── AC-2: tenant wall ──────────────────────────────────────────────────

    it("AC-2: a BL leader CANNOT read or delete a CRC contact; CAN read its own", async () => {
        await assertFails(blLeader().collection("contacts").doc("c-crc").get())
        await assertFails(blLeader().collection("contacts").doc("c-crc").delete())
        await assertSucceeds(blLeader().collection("contacts").doc("c-bl").get())
    })

    it("AC-2: a BL leader CANNOT create a crc-tenant contact (cross-tenant write denied)", async () => {
        await assertFails(
            blLeader().collection("contacts").doc("c-cross").set({
                orgId: "crc",
                name: "Cross",
                email: "cross@example.com",
                createdBy: "bl-leader",
            }),
        )
        await assertSucceeds(
            blLeader().collection("contacts").doc("c-bl-new").set({
                orgId: "brotherslazaroff",
                name: "BL New",
                email: "blnew@bl.example",
                createdBy: "bl-leader",
            }),
        )
    })

    it("AC-2: a crc leader CANNOT read the bl contact", async () => {
        await assertFails(crcLeader().collection("contacts").doc("c-bl").get())
    })
})
