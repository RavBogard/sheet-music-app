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
 * David's ask 2 (2026-09-22) — songs/* read isolation by tenant.
 *
 * The chart pickers read songs/* straight from Firestore into Dexie. Before
 * this, `allow read: if isMember()` let a member of either tenant read every
 * song of both. Now a non-admin reads only its own tenants' songs; an
 * unstamped doc counts as crc (the claimless-CRC default the write rules
 * already use); admins are exempt. And the picker's own query — orgId ==
 * host org — must be provable, or every picker would be denied.
 */
describe("songs/* tenant read isolation", () => {
    let testEnv: RulesTestEnvironment

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        const [host, portStr] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080").split(":")
        testEnv = await initializeTestEnvironment({
            projectId: "demo-songs-tenant",
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
            await db.collection("songs").doc("song-crc").set({ title: "Adon Olam", orgId: "crc" })
            await db.collection("songs").doc("song-legacy").set({ title: "Legacy CRC" })
            await db.collection("songs").doc("song-bl").set({ title: "Pink Supermoon", orgId: "brotherslazaroff" })
        })
    })

    // Claimless CRC musician (no orgIds claim → crc).
    const crcMusician = () => testEnv.authenticatedContext("crc-mus", { role: "musician" }).firestore()
    const blMusician = () =>
        testEnv.authenticatedContext("bl-mus", { role: "musician", orgIds: ["brotherslazaroff"] }).firestore()
    const bothMusician = () =>
        testEnv.authenticatedContext("both-mus", { role: "musician", orgIds: ["crc", "brotherslazaroff"] }).firestore()
    const admin = () => testEnv.authenticatedContext("admin", { role: "admin" }).firestore()

    it("a Brothers Lazaroff member cannot read a CRC song (stamped or legacy)", async () => {
        await assertFails(blMusician().collection("songs").doc("song-crc").get())
        await assertFails(blMusician().collection("songs").doc("song-legacy").get())
        await assertSucceeds(blMusician().collection("songs").doc("song-bl").get())
    })

    it("a CRC member cannot read a Brothers Lazaroff song, and keeps every CRC read", async () => {
        await assertFails(crcMusician().collection("songs").doc("song-bl").get())
        await assertSucceeds(crcMusician().collection("songs").doc("song-crc").get())
        await assertSucceeds(crcMusician().collection("songs").doc("song-legacy").get())
    })

    it("the picker's host-org query is allowed for a member of that org", async () => {
        const blSnap = await assertSucceeds(
            blMusician().collection("songs").where("orgId", "==", "brotherslazaroff").get(),
        )
        expect(blSnap.docs.map((d) => d.id)).toEqual(["song-bl"])
        const crcSnap = await assertSucceeds(crcMusician().collection("songs").where("orgId", "==", "crc").get())
        expect(crcSnap.docs.map((d) => d.id)).toEqual(["song-crc"])
    })

    it("an unscoped or cross-tenant query by a single-tenant member is denied", async () => {
        await assertFails(blMusician().collection("songs").get())
        await assertFails(blMusician().collection("songs").where("orgId", "==", "crc").get())
        await assertFails(crcMusician().collection("songs").where("orgId", "==", "brotherslazaroff").get())
    })

    it("a two-tenant member may query either site; an admin may read anything", async () => {
        await assertSucceeds(bothMusician().collection("songs").where("orgId", "==", "brotherslazaroff").get())
        await assertSucceeds(bothMusician().collection("songs").where("orgId", "==", "crc").get())
        await assertSucceeds(admin().collection("songs").doc("song-bl").get())
        await assertSucceeds(admin().collection("songs").get())
    })

    it("signed-out readers still cannot read songs", async () => {
        await assertFails(testEnv.unauthenticatedContext().firestore().collection("songs").doc("song-crc").get())
    })
})
