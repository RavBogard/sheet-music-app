import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { deleteApp, getApps, initializeApp, type App } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"
import { NextRequest } from "next/server"

/**
 * Multi-tenant P2: /api/auth/sync-claims = "rebuild my claims from my
 * memberships" (migrating on first touch). It can never raise a role: the
 * P0 attack (a pending account self-writes users/{uid}.role = 'admin') stays
 * refused. Auth + Firestore emulators; only ID-token verification is stubbed.
 */
const verify = vi.fn()
vi.mock("@/lib/firebase-admin", async (orig) => ({
    ...(await orig<typeof import("@/lib/firebase-admin")>()),
    verifyIdToken: (...a: unknown[]) => verify(...a),
}))
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => null) }))

import { POST } from "@/app/api/auth/sync-claims/route"
import { __resetPlatformOwnerMemo } from "@/lib/org/access"

describe("POST /api/auth/sync-claims (emulator)", () => {
    let app: App
    const db = () => getFirestore(app)
    const auth = () => getAuth(app)
    const call = (uid: string | null) => {
        if (uid) verify.mockResolvedValue({ uid })
        return POST(new NextRequest("http://localhost/api/auth/sync-claims", {
            method: "POST",
            headers: uid ? { Authorization: "Bearer t", "x-org-id": "crc" } : {},
        }))
    }

    beforeAll(() => {
        expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-lane2-sync" })
    })
    afterAll(async () => {
        await deleteApp(app)
    })
    beforeEach(async () => {
        for (const col of ["memberships", "users", "auditLogs", "platform"]) {
            const snap = await db().collection(col).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
        const list = await auth().listUsers(1000)
        await Promise.all(list.users.map((u) => auth().deleteUser(u.uid)))
        __resetPlatformOwnerMemo()
    })

    it("rejects unauthenticated", async () => {
        expect((await call(null)).status).toBe(401)
    })

    it("P0 attack stays refused: a pending account that self-wrote role 'admin' gets no role", async () => {
        await auth().createUser({ uid: "attacker" })
        await db().collection("users").doc("attacker").set({ role: "admin", orgIds: ["crc", "brotherslazaroff"] })
        const res = await call("attacker")
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ synced: true, role: null })
        expect((await auth().getUser("attacker")).customClaims).toEqual({ m: {} })
        expect((await db().collection("memberships").get()).size).toBe(0)
        expect((await db().collection("users").doc("attacker").get()).get("role")).toBe("pending")
    })

    it("migrates a legacy musician on first call, then is a no-op; unrelated claims kept", async () => {
        await auth().createUser({ uid: "mu" })
        await auth().setCustomUserClaims("mu", { role: "musician", orgIds: ["crc", "brotherslazaroff"], foo: "bar" })
        await db().collection("users").doc("mu").set({ role: "musician" })
        const first = await call("mu")
        expect(await first.json()).toEqual({ synced: true, role: "musician" })
        expect((await auth().getUser("mu")).customClaims).toEqual({
            foo: "bar",
            m: { crc: "mu", brotherslazaroff: "mu" },
            role: "musician",
            orgIds: ["crc", "brotherslazaroff"],
        })
        const second = await call("mu")
        expect(await second.json()).toEqual({ synced: false, role: "musician", reason: "already_synced" })
    })
})
