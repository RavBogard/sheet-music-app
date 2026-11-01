// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { deleteApp, getApps, initializeApp, type App } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"

import { listAccessRequests, setMemberRole } from "@/lib/mcp/tools/people-access"
import { __resetPlatformOwnerMemo } from "@/lib/org/access"
import { ensureMembershipsMigrated, setMembership } from "@/lib/org/memberships-write"

/**
 * list_access_requests / set_member_role against the Auth + Firestore
 * emulators: memberships, claims, audit rows and notifications are real.
 */
const CRC = "crc"
const BL = "brotherslazaroff"

describe("people access MCP tools (emulator)", () => {
    let app: App
    const db = () => getFirestore(app)
    const auth = () => getAuth(app)

    async function person(uid: string, memberships: Array<[string, string]>) {
        await auth().createUser({ uid, email: `${uid}@example.test`, displayName: uid })
        await db().collection("users").doc(uid).set({ email: `${uid}@example.test`, displayName: uid, createdAt: new Date() })
        await ensureMembershipsMigrated(uid)
        for (const [org, role] of memberships) {
            await setMembership({ orgId: org, uid, role: role as never, actorUid: "fixture", reason: role === "pending" ? "join" : "migration" })
        }
    }
    const roleIn = async (org: string, uid: string) =>
        (await db().collection("memberships").doc(`${org}__${uid}`).get()).data()?.role ?? null
    const auditFor = async (uid: string) =>
        (await db().collection("auditLogs").where("targetUserId", "==", uid).where("action", "==", "ROLE_CHANGE").get()).docs.map((d) => d.data())
    const notes = async (uid: string) => (await db().collection("users").doc(uid).collection("notifications").get()).size

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
        app = getApps()[0] ?? initializeApp({ projectId: "demo-people-access" })
    })
    afterAll(async () => {
        await wipe()
        await deleteApp(app)
    })
    beforeEach(async () => {
        await wipe()
        await db().doc("platform/owners").set({ uids: [] })
        await person("aAdmin", [[CRC, "admin"]])
        await person("aLeader", [[CRC, "band_leader"]])
        await person("aMu", [[CRC, "musician"]])
        await person("aPending", [[CRC, "pending"]])
        await person("aPending2", [[CRC, "pending"]])
        await person("bAdmin", [[BL, "admin"]])
        await person("bPending", [[BL, "pending"]])
    })

    it("lists this tenant's pending requests only, for admins and band leaders", async () => {
        const r = (await listAccessRequests("aLeader", {}, CRC)) as { ok: true; requests: Array<{ uid: string; status: string; email: string | null; requestedAt: string | null }> }
        expect(r.ok).toBe(true)
        expect(r.requests.map((x) => x.uid).sort()).toEqual(["aPending", "aPending2"])
        expect(r.requests[0]).toMatchObject({ status: "pending", email: expect.stringContaining("@example.test") })
        expect(r.requests[0].requestedAt).toBeTruthy()
        const all = (await listAccessRequests("aAdmin", { status: "all" }, CRC)) as { requests: Array<{ uid: string }> }
        expect(all.requests.map((x) => x.uid)).not.toContain("bPending")
        expect(all.requests.map((x) => x.uid)).not.toContain("bAdmin")

        const refused = await listAccessRequests("aMu", {}, CRC)
        expect(refused).toMatchObject({ ok: false, error: { machine_code: "forbidden_role" } })
    })

    it("dry run (the default) reports before/after and writes nothing", async () => {
        const r = await setMemberRole("aAdmin", { uid: "aPending", role: "musician" }, CRC)
        expect(r).toMatchObject({ ok: true, dryRun: true, before: { role: "pending" }, after: { role: "musician" }, changed: true, person: { uid: "aPending" } })
        const noForce = await setMemberRole("aAdmin", { uid: "aPending", role: "musician", dryRun: false }, CRC)
        expect(noForce).toMatchObject({ ok: false, error: { machine_code: "force_required" } })
        expect(await roleIn(CRC, "aPending")).toBe("pending")
        expect(await auditFor("aPending")).toHaveLength(0)
        expect(await notes("aPending")).toBe(0)
    })

    it("approves a pending person: membership, claims, audit row with reason, in-app notification", async () => {
        const r = await setMemberRole("aAdmin", { uid: "aPending", role: "musician", reason: "plays bass", dryRun: false, force: true }, CRC)
        expect(r).toMatchObject({ ok: true, dryRun: false, before: { role: "pending" }, after: { role: "musician" } })
        expect(await roleIn(CRC, "aPending")).toBe("musician")
        expect((await auth().getUser("aPending")).customClaims).toMatchObject({ m: { crc: "mu" } })
        const audit = await auditFor("aPending")
        expect(audit[0]).toMatchObject({ orgId: CRC, previousRole: "pending", newRole: "musician", actorUid: "aAdmin", note: "plays bass", via: "mcp" })
        expect(await notes("aPending")).toBe(1)
    })

    it("denies a pending person", async () => {
        const r = await setMemberRole("aAdmin", { uid: "aPending2", role: "denied", dryRun: false, force: true }, CRC)
        expect(r).toMatchObject({ ok: true, after: { role: "denied" } })
        expect(await roleIn(CRC, "aPending2")).toBe("denied")
        const claims = (await auth().getUser("aPending2")).customClaims as { m?: Record<string, string> }
        expect(claims.m?.crc).toBeUndefined()
    })

    it("changes a role; granting admin also needs confirm", async () => {
        expect(await setMemberRole("aAdmin", { uid: "aMu", role: "band_leader", dryRun: false, force: true }, CRC)).toMatchObject({ ok: true })
        expect(await roleIn(CRC, "aMu")).toBe("band_leader")

        const dry = await setMemberRole("aAdmin", { uid: "aMu", role: "admin" }, CRC)
        expect(dry).toMatchObject({ ok: true, dryRun: true, requiresConfirm: true })
        const noConfirm = await setMemberRole("aAdmin", { uid: "aMu", role: "admin", dryRun: false, force: true }, CRC)
        expect(noConfirm).toMatchObject({ ok: false, error: { machine_code: "confirm_required" } })
        expect(await roleIn(CRC, "aMu")).toBe("band_leader")
        expect(await setMemberRole("aAdmin", { uid: "aMu", role: "admin", dryRun: false, force: true, confirm: true }, CRC)).toMatchObject({ ok: true })
        expect(await roleIn(CRC, "aMu")).toBe("admin")
    })

    it("a band leader (non-admin) is refused", async () => {
        const r = await setMemberRole("aLeader", { uid: "aPending", role: "musician", dryRun: false, force: true }, CRC)
        expect(r).toMatchObject({ ok: false, error: { machine_code: "forbidden_role" } })
        expect(await roleIn(CRC, "aPending")).toBe("pending")
    })

    it("the other tenant's people are invisible and unchangeable", async () => {
        const r = await setMemberRole("aAdmin", { uid: "bPending", role: "musician", dryRun: false, force: true }, CRC)
        expect(r).toMatchObject({ ok: false, error: { machine_code: "user_not_found" } })
        expect(await roleIn(BL, "bPending")).toBe("pending")
        expect(await roleIn(CRC, "bPending")).toBeNull()
        // And a CRC admin acting through a BL token is not an admin there.
        const viaBl = await setMemberRole("aAdmin", { uid: "bPending", role: "musician", dryRun: false, force: true }, BL)
        expect(viaBl).toMatchObject({ ok: false, error: { machine_code: "forbidden_role" } })
    })

    it("nobody changes their own role", async () => {
        const r = await setMemberRole("aAdmin", { uid: "aAdmin", role: "member", dryRun: false, force: true }, CRC)
        expect(r).toMatchObject({ ok: false, error: { machine_code: "self_change_refused" } })
        expect(await roleIn(CRC, "aAdmin")).toBe("admin")
    })

    it("the last admin is never demoted, even by a platform owner", async () => {
        await person("po", [])
        await db().doc("platform/owners").set({ uids: ["po"] })
        __resetPlatformOwnerMemo()
        const r = await setMemberRole("po", { uid: "aAdmin", role: "member", dryRun: false, force: true }, CRC)
        expect(r).toMatchObject({ ok: false, error: { machine_code: "last_admin" } })
        expect(await roleIn(CRC, "aAdmin")).toBe("admin")
        // With a second admin, the demotion goes through.
        await setMembership({ orgId: CRC, uid: "aMu", role: "admin", actorUid: "fixture", reason: "migration" })
        expect(await setMemberRole("po", { uid: "aAdmin", role: "member", dryRun: false, force: true }, CRC)).toMatchObject({ ok: true })
    })

    it("concurrent demotions of the last two admins: at least one is refused, an admin remains", async () => {
        await person("po", [])
        await person("aAdmin2", [[CRC, "admin"]])
        await db().doc("platform/owners").set({ uids: ["po"] })
        __resetPlatformOwnerMemo()
        const [r1, r2] = await Promise.all([
            setMemberRole("po", { uid: "aAdmin", role: "member", dryRun: false, force: true }, CRC),
            setMemberRole("po", { uid: "aAdmin2", role: "member", dryRun: false, force: true }, CRC),
        ])
        const refused = [r1, r2].filter((r) => (r as { error?: { machine_code?: string } }).error?.machine_code === "last_admin")
        expect(refused.length).toBeGreaterThanOrEqual(1)
        const admins = await db().collection("memberships").where("tenantId", "==", CRC).where("role", "==", "admin").get()
        expect(admins.size).toBeGreaterThanOrEqual(1)
    })

    it("a person in both tenants: changing their CRC role leaves BL membership and BL claims alone", async () => {
        await person("dual", [[CRC, "musician"], [BL, "band_leader"]])
        expect((await auth().getUser("dual")).customClaims).toMatchObject({ m: { crc: "mu", brotherslazaroff: "bl" } })
        const r = await setMemberRole("aAdmin", { uid: "dual", role: "band_leader", dryRun: false, force: true }, CRC)
        expect(r).toMatchObject({ ok: true, before: { role: "musician" }, after: { role: "band_leader" } })
        expect(await roleIn(BL, "dual")).toBe("band_leader")
        expect((await auth().getUser("dual")).customClaims).toMatchObject({ m: { crc: "bl", brotherslazaroff: "bl" } })
        const denied = await setMemberRole("aAdmin", { uid: "dual", role: "denied", dryRun: false, force: true }, CRC)
        expect(denied).toMatchObject({ ok: true })
        expect(await roleIn(BL, "dual")).toBe("band_leader")
        const claims = (await auth().getUser("dual")).customClaims as { m: Record<string, string> }
        expect(claims.m.brotherslazaroff).toBe("bl")
        expect(claims.m.crc).toBeUndefined()
    })

    it("the caller's role comes from their membership in the token's tenant, never the users-doc role", async () => {
        // Unmigrated BL band leader whose users doc says band_leader (tenant-blind).
        await auth().createUser({ uid: "legacyBl", email: "legacyBl@example.test" })
        await auth().setCustomUserClaims("legacyBl", { role: "band_leader", orgIds: [BL] })
        await db().collection("users").doc("legacyBl").set({ email: "legacyBl@example.test", role: "band_leader", orgIds: [BL] })
        const r = await listAccessRequests("legacyBl", {}, CRC)
        expect(r).toMatchObject({ ok: false, error: { machine_code: "forbidden_role" } })
        const ok = await listAccessRequests("legacyBl", {}, BL)
        expect(ok).toMatchObject({ ok: true })
    })
})
