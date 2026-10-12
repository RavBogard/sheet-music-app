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
 * Multi-tenant phase 0 — the self-assigned-role hole.
 *
 * Before the fix, `users/{uid}` was fully self-writable, so a pending account
 * could write `role: 'admin'` into its own document; `/api/auth/sync-claims`
 * then raised the auth claim from that field (and the session routes signed it
 * into the role cookie). The rule now lets a user create its own document only
 * as pending, and update only profile fields. Every browser writer to the
 * document is modelled below so none of them breaks.
 */
describe("firestore.rules users/{uid} self-writes (multi-tenant P0)", () => {
    let testEnv: RulesTestEnvironment
    const UID = "pending-user"

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        const [host, portStr] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080").split(":")
        testEnv = await initializeTestEnvironment({
            projectId: "demo-mt-p0-self-role",
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
    })

    const me = () =>
        testEnv.authenticatedContext(UID, { email: "pending@example.com" }).firestore()

    async function seedPending(extra: Record<string, unknown> = {}) {
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
            await ctx.firestore().collection("users").doc(UID).set({
                uid: UID,
                email: "pending@example.com",
                displayName: "P",
                role: "pending",
                orgIds: ["crc"],
                ...extra,
            })
        })
    }

    // ── create ──

    it("create as pending with the sign-up fields (today's ensureUserProfile shape) succeeds", async () => {
        await assertSucceeds(
            me().collection("users").doc(UID).set({
                uid: UID,
                email: "pending@example.com",
                displayName: "P",
                photoURL: "https://x/y.png",
                role: "pending",
                orgIds: ["crc", "brotherslazaroff"],
                createdAt: new Date(),
                lastLoginAt: new Date(),
            }),
        )
    })

    it("create without role succeeds", async () => {
        await assertSucceeds(
            me().collection("users").doc(UID).set({ uid: UID, email: "pending@example.com", displayName: "P" }),
        )
    })

    for (const role of ["admin", "band_leader", "musician", "member"]) {
        it(`create with role '${role}' is refused`, async () => {
            await assertFails(
                me().collection("users").doc(UID).set({ uid: UID, email: "pending@example.com", role }),
            )
        })
    }

    it("create with an orgIds value outside the sign-up default is refused", async () => {
        await assertFails(
            me().collection("users").doc(UID).set({ uid: UID, role: "pending", orgIds: ["nava-tehila"] }),
        )
    })

    for (const field of ["m", "po", "soundEngineer", "loginable", "ttlExpiresAt"]) {
        it(`create carrying '${field}' is refused`, async () => {
            await assertFails(
                me().collection("users").doc(UID).set({ uid: UID, role: "pending", [field]: true }),
            )
        })
    }

    it("creating someone else's document is refused", async () => {
        await assertFails(me().collection("users").doc("someone-else").set({ uid: "someone-else", role: "pending" }))
    })

    // ── update: the escalation ──

    it("the precondition attack — pending user writes role:'admin' to its own doc — is refused", async () => {
        await seedPending()
        await assertFails(me().collection("users").doc(UID).update({ role: "admin" }))
    })

    for (const patch of [
        { role: "band_leader" },
        { role: "musician" },
        { orgIds: ["crc", "brotherslazaroff"] },
        { m: { crc: "a" } },
        { po: true },
        { soundEngineer: true },
        { uid: "other" },
        { loginable: true },
        { email: "daniel@centralreform.org" },
    ]) {
        it(`self-update ${JSON.stringify(patch)} is refused`, async () => {
            await seedPending()
            await assertFails(me().collection("users").doc(UID).update(patch))
        })
    }

    it("a full-document overwrite (set without merge) that keeps role is refused when it changes role", async () => {
        await seedPending()
        await assertFails(
            me().collection("users").doc(UID).set({ uid: UID, email: "pending@example.com", role: "admin" }),
        )
    })

    // ── update: every browser profile writer still works ──

    it("ensureUserProfile's sign-in update (lastLoginAt, email = token email, photoURL, displayName) succeeds", async () => {
        await seedPending()
        await assertSucceeds(
            me().collection("users").doc(UID).update({
                lastLoginAt: new Date(),
                email: "pending@example.com",
                photoURL: "https://x/z.png",
                displayName: "New Name",
            }),
        )
    })

    it("saveMusicianProfile / onboarding instrument / calendar feed token (musicianProfile) succeed", async () => {
        await seedPending()
        const db = me()
        await assertSucceeds(db.collection("users").doc(UID).update({ musicianProfile: { instruments: ["guitar"] } }))
        await assertSucceeds(db.collection("users").doc(UID).update({ "musicianProfile.instrument": "piano" }))
        await assertSucceeds(db.collection("users").doc(UID).update({ "musicianProfile.calendarFeedToken": "abc" }))
    })

    it("markWelcomeModalViewed and push-token registration succeed", async () => {
        await seedPending()
        const db = me()
        await assertSucceeds(db.collection("users").doc(UID).update({ viewedWelcomeModal: true }))
        await assertSucceeds(db.collection("users").doc(UID).update({ fcmTokens: ["tok-1"] }))
    })

    it("an unchanged role riding along in a profile write is allowed (no-op)", async () => {
        await seedPending()
        await assertSucceeds(me().collection("users").doc(UID).update({ role: "pending", displayName: "Q" }))
    })

    // Multi-tenant P2: there is no client path to another user's document any
    // more — set-role and memberships are server-side (Admin SDK). Neither a
    // tenant admin nor the platform owner may write it from the browser, and
    // only the platform owner may read it.
    it("a tenant admin can neither write nor read another user's doc (set-role is server-side)", async () => {
        await seedPending()
        for (const claims of [{ role: "admin" }, { m: { crc: "ad" } }]) {
            const admin = testEnv.authenticatedContext("admin-1", claims).firestore()
            await assertFails(admin.collection("users").doc(UID).update({ role: "musician" }))
            await assertFails(admin.collection("users").doc(UID).get())
        }
    })

    it("the platform owner may read another user's doc but not write it", async () => {
        await seedPending()
        const po = testEnv.authenticatedContext("owner", { po: true }).firestore()
        await assertSucceeds(po.collection("users").doc(UID).get())
        await assertFails(po.collection("users").doc(UID).update({ role: "musician" }))
    })

    it("subcollections stay self-writable (songPreferences, preferences)", async () => {
        await seedPending()
        const db = me()
        await assertSucceeds(db.collection("users").doc(UID).collection("songPreferences").doc("f1").set({ t: 1 }))
        await assertSucceeds(db.collection("users").doc(UID).collection("preferences").doc("app").set({ x: 1 }))
    })
})
