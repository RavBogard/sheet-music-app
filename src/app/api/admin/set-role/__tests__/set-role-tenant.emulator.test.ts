import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { deleteApp, getApps, initializeApp, type App } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"
import { NextRequest } from "next/server"

/**
 * Multi-tenant P2 lane 2 — the per-tenant identity routes (design §5) against
 * the Auth + Firestore emulators. Only the ID-token verification is stubbed
 * (the decoded token is what the browser's token would carry); every
 * membership, claim and audit write is real.
 */
const verify = vi.fn()
vi.mock("@/lib/firebase-admin", async (orig) => ({
    ...(await orig<typeof import("@/lib/firebase-admin")>()),
    verifyIdToken: (...a: unknown[]) => verify(...a),
}))
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => null) }))

import { POST as setRole } from "@/app/api/admin/set-role/route"
import { POST as setSE } from "@/app/api/admin/set-sound-engineer/route"
import { POST as deleteUser } from "@/app/api/admin/delete-user/route"
import { POST as join } from "@/app/api/auth/join/route"
import { GET as people } from "@/app/api/tenant/people/route"
import { __resetPlatformOwnerMemo } from "@/lib/org/access"
import { ensureMembershipsMigrated, setMembership } from "@/lib/org/memberships-write"

const CRC = "crc"
const BL = "brotherslazaroff"
const PO = "po-uid"

describe("tenant identity routes (emulator)", () => {
    let app: App
    const db = () => getFirestore(app)
    const auth = () => getAuth(app)

    function req(path: string, uid: string, org: string, body?: unknown, method = "POST", claims: Record<string, unknown> = {}) {
        verify.mockResolvedValue({ uid, email: `${uid}@example.test`, ...claims })
        const headers: Record<string, string> = { Authorization: "Bearer t", "x-org-id": org }
        if (body !== undefined) headers["Content-Type"] = "application/json"
        return new NextRequest(`http://localhost${path}`, {
            method,
            headers,
            ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        })
    }
    async function person(uid: string, memberships: Array<[string, string]>) {
        await auth().createUser({ uid, email: `${uid}@example.test`, displayName: uid })
        await db().collection("users").doc(uid).set({ email: `${uid}@example.test`, displayName: uid, createdAt: new Date() })
        await ensureMembershipsMigrated(uid)
        for (const [org, role] of memberships) {
            await setMembership({ orgId: org, uid, role: role as never, actorUid: "fixture", reason: "migration" })
        }
    }
    const roleIn = async (org: string, uid: string) =>
        (await db().collection("memberships").doc(`${org}__${uid}`).get()).data()?.role ?? null

    async function wipe() {
        for (const col of ["memberships", "users", "auditLogs", "platform"]) {
            const snap = await db().collection(col).get()
            await Promise.all(snap.docs.map((d) => db().recursiveDelete(d.ref)))
        }
        const list = await auth().listUsers(1000)
        await Promise.all(list.users.map((u) => auth().deleteUser(u.uid)))
        __resetPlatformOwnerMemo()
    }

    beforeAll(() => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-lane2-routes" })
    })
    afterAll(async () => {
        await wipe()
        await deleteApp(app)
    })
    beforeEach(async () => {
        await wipe()
        await db().doc("platform/owners").set({ uids: [PO] })
        await person(PO, [[CRC, "admin"]])
        await person("aAdmin", [[CRC, "admin"]])
        await person("aAdmin2", [[CRC, "admin"]])
        await person("bAdmin", [[BL, "admin"]])
        await person("dual", [[CRC, "band_leader"], [BL, "admin"]])
        await person("aMu", [[CRC, "musician"]])
        await person("bMu", [[BL, "musician"]])
    })

    describe("POST /api/admin/set-role", () => {
        it("tenant admin changes a role in their own tenant; audit row carries orgId; notification written", async () => {
            const res = await setRole(req("/api/admin/set-role", "aAdmin", CRC, { targetUserId: "aMu", newRole: "band_leader" }))
            expect(res.status).toBe(200)
            expect(await res.json()).toEqual({ success: true, tenant: CRC, role: "band_leader", claimsUpdated: true })
            expect(await roleIn(CRC, "aMu")).toBe("band_leader")
            expect((await auth().getUser("aMu")).customClaims).toMatchObject({ m: { crc: "bl" } })
            const audit = (await db().collection("auditLogs").where("targetUserId", "==", "aMu").where("action", "==", "ROLE_CHANGE").get()).docs
            expect(audit.map((d) => d.get("orgId"))).toContain(CRC)
            expect((await db().collection("users").doc("aMu").collection("notifications").get()).size).toBe(1)
        })

        it("tenant admin is refused in another tenant (by body tenant and by host)", async () => {
            const viaBody = await setRole(req("/api/admin/set-role", "aAdmin", CRC, { targetUserId: "bMu", newRole: "admin", tenant: BL }))
            expect(viaBody.status).toBe(403)
            const viaHost = await setRole(req("/api/admin/set-role", "aAdmin", BL, { targetUserId: "bMu", newRole: "admin" }))
            expect(viaHost.status).toBe(403)
            expect(await roleIn(BL, "bMu")).toBe("musician")
        })

        it("dual member: B admin rights give nothing in A", async () => {
            const res = await setRole(req("/api/admin/set-role", "dual", CRC, { targetUserId: "aMu", newRole: "member" }))
            expect(res.status).toBe(403)
            const ok = await setRole(req("/api/admin/set-role", "dual", BL, { targetUserId: "bMu", newRole: "member" }))
            expect(ok.status).toBe(200)
        })

        it("SELF_CHANGE; orgIds accepted and ignored; unknown tenant 400", async () => {
            const self = await setRole(req("/api/admin/set-role", "aAdmin", CRC, { targetUserId: "aAdmin", newRole: "member" }))
            expect(self.status).toBe(400)
            expect((await self.json()).code).toBe("SELF_CHANGE")
            const ign = await setRole(req("/api/admin/set-role", "aAdmin", CRC, { targetUserId: "aMu", newRole: "member", orgIds: ["crc", "brotherslazaroff"] }))
            expect(await ign.json()).toMatchObject({ success: true, tenant: CRC, role: "member", orgIdsIgnored: true })
            expect(await roleIn(BL, "aMu")).toBeNull()
            const bad = await setRole(req("/api/admin/set-role", PO, CRC, { targetUserId: "aMu", newRole: "member", tenant: "nowhere" }))
            expect(bad.status).toBe(400)
        })

        it("SEC-02: an unmigrated legacy admin (tenant-blind claim, no membership) is refused (403)", async () => {
            await auth().createUser({ uid: "legacyAdmin" })
            await auth().setCustomUserClaims("legacyAdmin", { role: "admin" })
            await db().collection("users").doc("legacyAdmin").set({ role: "admin" })
            const asLegacy = (body: unknown) => req("/api/admin/set-role", "legacyAdmin", BL, body, "POST", { role: "admin" })
            const demote = await setRole(asLegacy({ targetUserId: "bAdmin", newRole: "member" }))
            expect(demote.status).toBe(403)
            const promote = await setRole(asLegacy({ targetUserId: "bMu", newRole: "admin" }))
            expect(promote.status).toBe(403)
            expect(await roleIn(BL, "bAdmin")).toBe("admin")
            expect(await roleIn(BL, "bMu")).toBe("musician")
        })

        // With membership-only gates (SEC-02) every non-owner caller who passes
        // the admin check is a counted admin of that tenant, so the route can no
        // longer reach LAST_ADMIN except through self-change, which it refuses
        // first. The guard itself is covered in people-access.test.ts.
        it("the only admin cannot demote or remove themself; po is exempt and may demote them", async () => {
            await setMembership({ orgId: BL, uid: "dual", role: "musician", actorUid: "fixture", reason: "set-role" })
            const demote = await setRole(req("/api/admin/set-role", "bAdmin", BL, { targetUserId: "bAdmin", newRole: "member" }))
            expect(demote.status).toBe(400)
            const remove = await setRole(req("/api/admin/set-role", "bAdmin", BL, { targetUserId: "bAdmin", newRole: null }))
            expect(remove.status).toBe(400)
            expect(await roleIn(BL, "bAdmin")).toBe("admin")
            const po = await setRole(req("/api/admin/set-role", PO, BL, { targetUserId: "bAdmin", newRole: "member" }))
            expect(po.status).toBe(200)
        })

        it("removal (newRole null) deletes the membership and revokes refresh tokens", async () => {
            const before = (await auth().getUser("bMu")).tokensValidAfterTime
            await new Promise((r) => setTimeout(r, 1100))
            const res = await setRole(req("/api/admin/set-role", "bAdmin", BL, { targetUserId: "bMu", newRole: null }))
            expect(res.status).toBe(200)
            expect(await res.json()).toMatchObject({ role: null, tenant: BL })
            expect(await roleIn(BL, "bMu")).toBeNull()
            expect((await auth().getUser("bMu")).tokensValidAfterTime).not.toBe(before)
            expect((await auth().getUser("bMu")).customClaims).toEqual({ m: {}, })
        })

        it("decline sets denied (no claim) and the person stays denied on join", async () => {
            await person("newbie", [])
            await join(req("/api/auth/join", "newbie", BL, {}))
            const res = await setRole(req("/api/admin/set-role", "bAdmin", BL, { targetUserId: "newbie", newRole: "denied" }))
            expect(res.status).toBe(200)
            const again = await join(req("/api/auth/join", "newbie", BL, {}))
            expect(await again.json()).toMatchObject({ tenant: BL, role: "denied", created: false })
            expect((await auth().getUser("newbie")).customClaims).toEqual({ m: {} })
        })
    })

    describe("POST /api/auth/join", () => {
        it("creates a pending membership in the HOST tenant only; idempotent; body ignored", async () => {
            await person("signup", [])
            const r1 = await join(req("/api/auth/join", "signup", BL, { tenant: CRC, role: "admin" }))
            expect(r1.status).toBe(200)
            expect(await r1.json()).toEqual({ tenant: BL, role: "pending", created: true, claimsChanged: true })
            expect(await roleIn(BL, "signup")).toBe("pending")
            expect(await roleIn(CRC, "signup")).toBeNull()
            const r2 = await join(req("/api/auth/join", "signup", BL, {}))
            expect(await r2.json()).toMatchObject({ created: false, role: "pending" })
            const audit = await db().collection("auditLogs").where("action", "==", "MEMBERSHIP_REQUESTED").get()
            expect(audit.size).toBe(1)
            expect(audit.docs[0].get("orgId")).toBe(BL)
        })

        it("a CRC member signing in at BL's address gets a BL pending request and nothing else", async () => {
            const r = await join(req("/api/auth/join", "aMu", BL, {}))
            expect(await r.json()).toMatchObject({ tenant: BL, role: "pending", created: true })
            expect(await roleIn(CRC, "aMu")).toBe("musician")
            expect((await auth().getUser("aMu")).customClaims).toMatchObject({ m: { crc: "mu", brotherslazaroff: "pe" }, orgIds: ["crc"] })
        })
    })

    describe("GET /api/tenant/people", () => {
        it("band leader+ in the host tenant sees that tenant's people only", async () => {
            const res = await people(req("/api/tenant/people", "dual", BL, undefined, "GET"))
            expect(res.status).toBe(200)
            const body = await res.json()
            expect(body.tenant).toBe(BL)
            expect(body.people.map((p: { uid: string }) => p.uid).sort()).toEqual(["bAdmin", "bMu", "dual"])
            expect(body.people.find((p: { uid: string }) => p.uid === "dual").role).toBe("admin")
            const crcView = await people(req("/api/tenant/people", "dual", CRC, undefined, "GET"))
            expect((await crcView.json()).people.find((p: { uid: string }) => p.uid === "dual").role).toBe("band_leader")
        })

        it("refuses below band leader in the host, and another tenant via ?tenant unless po", async () => {
            expect((await people(req("/api/tenant/people", "aMu", CRC, undefined, "GET"))).status).toBe(403)
            expect((await people(req("/api/tenant/people", "aAdmin", BL, undefined, "GET"))).status).toBe(403)
            expect((await people(req("/api/tenant/people?tenant=brotherslazaroff", "aAdmin", CRC, undefined, "GET"))).status).toBe(403)
            const po = await people(req("/api/tenant/people?tenant=brotherslazaroff", PO, CRC, undefined, "GET"))
            expect(po.status).toBe(200)
            expect((await po.json()).tenant).toBe(BL)
        })

        it("pendingCount counts the tenant's requests", async () => {
            await person("req1", [])
            await join(req("/api/auth/join", "req1", CRC, {}))
            const body = await (await people(req("/api/tenant/people", "aAdmin", CRC, undefined, "GET"))).json()
            expect(body.pendingCount).toBe(1)
        })
    })

    describe("set-sound-engineer and delete-user", () => {
        it("sound engineer is per tenant; target must be a member there", async () => {
            const ok = await setSE(req("/api/admin/set-sound-engineer", "dual", CRC, { targetUserId: "aMu", soundEngineer: true }))
            expect(ok.status).toBe(200)
            expect((await auth().getUser("aMu")).customClaims).toMatchObject({ se: ["crc"], soundEngineer: true })
            const notMember = await setSE(req("/api/admin/set-sound-engineer", "dual", CRC, { targetUserId: "bMu", soundEngineer: true }))
            expect(notMember.status).toBe(404)
            const otherTenant = await setSE(req("/api/admin/set-sound-engineer", "aAdmin", CRC, { targetUserId: "bMu", soundEngineer: true, tenant: BL }))
            expect(otherTenant.status).toBe(403)
        })

        it("tenant admin cannot delete a multi-tenant account; po can", async () => {
            const refused = await deleteUser(req("/api/admin/delete-user", "bAdmin", BL, { targetUserId: "dual" }))
            expect(refused.status).toBe(403)
            expect((await refused.json()).code).toBe("MULTI_TENANT_USER")
            const own = await deleteUser(req("/api/admin/delete-user", "bAdmin", BL, { targetUserId: "bMu" }))
            expect(own.status).toBe(200)
            expect((await db().collection("memberships").where("uid", "==", "bMu").get()).size).toBe(0)
            const audit = await db().collection("auditLogs").where("action", "==", "USER_DELETED").get()
            expect(audit.docs[0].get("orgId")).toBe(BL)
            const po = await deleteUser(req("/api/admin/delete-user", PO, BL, { targetUserId: "dual" }))
            expect(po.status).toBe(200)
        })
    })
})
