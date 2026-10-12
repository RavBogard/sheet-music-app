import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { deleteApp, getApps, initializeApp, type App } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"

import { ensureMembershipsMigrated, setMembership } from "@/lib/org/memberships-write"
import { rebuildClaims } from "@/lib/org/claims"
import {
    __resetPlatformOwnerMemo,
    getTenantAccess,
    hasTenantRole,
    listTenantMembers,
    readTenantRole,
} from "@/lib/org/access"

/**
 * Multi-tenant P2 lane 2: setMembership / ensureMembershipsMigrated /
 * rebuildClaims / getTenantAccess against the Auth + Firestore emulators.
 */
describe("memberships (emulator)", () => {
    let app: App
    const db = () => getFirestore(app)
    const auth = () => getAuth(app)
    const DANIEL = "93Xn3DbS0bSNb8zmfzLyfOMX1A13"
    const DAVID = "HTks9a8YRiVCQ5lVipUJcBsWjnB3"

    async function wipe() {
        for (const col of ["memberships", "users", "auditLogs", "platform"]) {
            const snap = await db().collection(col).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
        const list = await auth().listUsers(1000)
        await Promise.all(list.users.map((u) => auth().deleteUser(u.uid)))
        __resetPlatformOwnerMemo()
    }

    async function user(uid: string, claims: Record<string, unknown> | null, doc: Record<string, unknown> | null) {
        await auth().createUser({ uid, email: `${uid.toLowerCase()}@example.test` })
        if (claims) await auth().setCustomUserClaims(uid, claims)
        if (doc) await db().collection("users").doc(uid).set(doc)
    }
    const claimsOf = async (uid: string) => (await auth().getUser(uid)).customClaims ?? {}

    beforeAll(() => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-lane2-memberships" })
    })
    afterAll(async () => {
        await wipe()
        await deleteApp(app)
    })
    beforeEach(async () => {
        await wipe()
        await db().collection("platform").doc("owners").set({ uids: [DANIEL] })
        await db()
            .collection("platform")
            .doc("membershipMigration")
            .set({ overrides: { [DAVID]: { brotherslazaroff: "admin" } } })
    })

    it("ensureMembershipsMigrated: ruling 5 for David, idempotent, claims rebuilt with legacy kept", async () => {
        await user(DAVID, { role: "admin", orgIds: ["crc", "brotherslazaroff"] }, { role: "admin", orgIds: ["crc", "brotherslazaroff"] })
        const dry = await ensureMembershipsMigrated(DAVID, { dryRun: true })
        expect(dry.memberships.map((m) => `${m.orgId}:${m.role}`)).toEqual(["crc:admin", "brotherslazaroff:admin"])
        expect((await db().collection("memberships").get()).size).toBe(0)

        const first = await ensureMembershipsMigrated(DAVID)
        expect(first.alreadyMigrated).toBe(false)
        const second = await ensureMembershipsMigrated(DAVID)
        expect(second.alreadyMigrated).toBe(true)
        expect((await db().collection("memberships").get()).size).toBe(2)
        expect(await claimsOf(DAVID)).toEqual({
            m: { crc: "ad", brotherslazaroff: "ad" },
            role: "admin",
            orgIds: ["crc", "brotherslazaroff"],
        })
        const doc = (await db().collection("users").doc(DAVID).get()).data()!
        expect(doc.membershipsMigratedAt).toBeTruthy()
        expect(doc.claimsUpdatedAt).toBeTruthy()
    })

    it("other admins become crc-only admins; Daniel gets po", async () => {
        await user("karen", { role: "admin", orgIds: ["crc", "brotherslazaroff"] }, { role: "admin" })
        await user(DANIEL, { role: "admin", orgIds: ["crc", "brotherslazaroff"], soundEngineer: true }, { role: "admin" })
        await ensureMembershipsMigrated("karen")
        await ensureMembershipsMigrated(DANIEL)
        expect(await claimsOf("karen")).toEqual({ m: { crc: "ad" }, role: "admin", orgIds: ["crc"] })
        expect(await claimsOf(DANIEL)).toEqual({
            po: true,
            m: { crc: "ad" },
            se: ["crc"],
            role: "admin",
            orgIds: ["crc"],
            soundEngineer: true,
        })
        const k = await getTenantAccess("karen", "brotherslazaroff")
        expect(k).toMatchObject({ role: null, effectiveRole: null, source: "none", po: false })
        const d = await getTenantAccess(DANIEL, "brotherslazaroff")
        expect(d).toMatchObject({ role: null, effectiveRole: "admin", po: true })
        expect(hasTenantRole(d, "admin")).toBe(true)
    })

    it("getTenantAccess: legacy fallback only while unmigrated", async () => {
        await user("old", { role: "band_leader" }, { role: "band_leader", soundEngineer: true, canUpload: true })
        const legacy = await getTenantAccess("old", "brotherslazaroff")
        expect(legacy).toMatchObject({ source: "legacy", role: "band_leader", soundEngineer: true, canUpload: true })
        const viaClaims = await getTenantAccess("old", "crc", { legacyClaims: { role: "musician" } })
        expect(viaClaims.role).toBe("musician")
        await ensureMembershipsMigrated("old")
        expect(await readTenantRole(db(), "old", "brotherslazaroff")).toBeUndefined()
        expect(await readTenantRole(db(), "old", "crc")).toBe("band_leader")
    })

    it("setMembership: create, change, audit row with orgId, removal deletes and revokes", async () => {
        await user("mu", { role: "musician" }, { role: "musician" })
        const before = (await auth().getUser("mu")).tokensValidAfterTime

        const r1 = await setMembership({ orgId: "brotherslazaroff", uid: "mu", role: "band_leader", actorUid: DAVID, reason: "set-role" })
        expect(r1.before).toBeNull()
        expect(r1.claims).toMatchObject({ m: { crc: "mu", brotherslazaroff: "bl" }, role: "band_leader" })

        const r2 = await setMembership({ orgId: "crc", uid: "mu", role: "member", actorUid: DAVID, reason: "set-role" })
        expect(r2.before?.role).toBe("musician")
        expect(r2.after?.role).toBe("member")

        const audits = (await db().collection("auditLogs").get()).docs.map((d) => d.data())
        expect(audits).toHaveLength(2)
        expect(audits.every((a) => a.action === "ROLE_CHANGE" && typeof a.orgId === "string")).toBe(true)

        await new Promise((r) => setTimeout(r, 1100))
        const r3 = await setMembership({ orgId: "brotherslazaroff", uid: "mu", role: null, actorUid: DAVID, reason: "set-role" })
        expect(r3.after).toBeNull()
        expect(r3.claims).toEqual({ m: { crc: "me" }, role: "member", orgIds: ["crc"] })
        expect((await db().collection("memberships").doc("brotherslazaroff__mu").get()).exists).toBe(false)
        const after = (await auth().getUser("mu")).tokensValidAfterTime
        expect(after).not.toBe(before)
        const removal = (await db().collection("auditLogs").where("action", "==", "MEMBERSHIP_REMOVED").get()).size
        expect(removal).toBe(1)
    })

    it("setMembership: no-op change writes no audit row; soundEngineer kept unless given", async () => {
        await user("se", null, { role: "pending" })
        await setMembership({ orgId: "crc", uid: "se", role: "musician", soundEngineer: true, actorUid: "a", reason: "set-role" })
        await setMembership({ orgId: "crc", uid: "se", role: "musician", actorUid: "a", reason: "set-role" })
        expect((await db().collection("auditLogs").get()).size).toBe(1)
        expect(await claimsOf("se")).toEqual({ m: { crc: "mu" }, se: ["crc"], role: "musician", orgIds: ["crc"], soundEngineer: true })
        await setMembership({ orgId: "crc", uid: "se", role: "musician", soundEngineer: false, actorUid: "a", reason: "sound-engineer" })
        expect(await claimsOf("se")).toEqual({ m: { crc: "mu" }, role: "musician", orgIds: ["crc"] })
    })

    it("rebuildClaims preserves foreign keys and is unchanged on a second run", async () => {
        await user("t", { admin_test: true }, { role: "pending" })
        await setMembership({ orgId: "crc", uid: "t", role: "admin", actorUid: "x", reason: "test-account", extraClaims: { admin_test: true } })
        expect(await claimsOf("t")).toEqual({ admin_test: true, m: { crc: "ad" }, role: "admin", orgIds: ["crc"] })
        const again = await rebuildClaims("t")
        expect(again.changed).toBe(false)
        expect((await db().collection("memberships").doc("crc__t").get()).data()?.addedBy).toBe("test-account")
    })

    it("listTenantMembers: memberships plus unmigrated people by the ruling-5 legacy map", async () => {
        await user("m1", { role: "musician", orgIds: ["crc", "brotherslazaroff"] }, { role: "musician", displayName: "M1" })
        await user("legacyBL", { role: "band_leader", orgIds: ["brotherslazaroff"] }, { role: "band_leader" })
        await user("docOnlyBL", { role: "member" }, { role: "member", orgIds: ["brotherslazaroff"] })
        await user("oldAdmin", { role: "admin", orgIds: ["crc", "brotherslazaroff"] }, { role: "admin" })
        await user(DAVID, { role: "admin", orgIds: ["crc", "brotherslazaroff"] }, { role: "admin" })
        await user("signup", null, { role: "pending", orgIds: ["crc", "brotherslazaroff"] })
        await ensureMembershipsMigrated("m1")
        const bl = await listTenantMembers("brotherslazaroff")
        expect(bl.map((m) => `${m.uid}:${m.role}:${m.addedBy}`).sort()).toEqual([
            `${DAVID}:admin:legacy`,
            "legacyBL:band_leader:legacy",
            "m1:musician:migration",
            "signup:pending:legacy",
        ])
        expect(bl.find((m) => m.uid === "m1")?.profile?.displayName).toBe("M1")
        const crcAdmins = await listTenantMembers("crc", { roles: ["admin"] })
        expect(crcAdmins.map((m) => m.uid).sort()).toEqual([DAVID, "oldAdmin"].sort())
        const crcMus = await listTenantMembers("crc", { roles: ["musician"] })
        expect(crcMus.map((m) => m.uid)).toEqual(["m1"])
    })
})
