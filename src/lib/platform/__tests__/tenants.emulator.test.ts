import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { getApps, initializeApp, type App } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { Timestamp, getFirestore } from "firebase-admin/firestore"

import {
    __setPlatformDeps,
    acceptInvite,
    assignCollection,
    createTenant,
    getTenant,
    inviteTenantAdmin,
    listCollections,
    listInvites,
    listPlatformActivity,
    listTenantMembersForPlatform,
    listTenants,
    mintTenantViewBearer,
    peekInvite,
    PlatformError,
    removeTenantMember,
    setCollectionSharing,
    setTenantFeatures,
    setTenantMemberRole,
    setTenantStatus,
    updateTenant,
    type Actor,
} from "@/lib/platform/tenants"
import { __resetPlatformOwnerMemo } from "@/lib/org/access"
import { codeOrgConfig } from "@/lib/org/config-code"
import { hashToken } from "@/lib/mcp/tokens"

/**
 * Multi-tenant phase 4, lane 1: src/lib/platform/tenants.ts against the
 * Firestore + Auth emulators. For each write: the dry run writes nothing; the
 * applied write changes the document and leaves exactly one platformAudit row;
 * bad input is refused with a plain message; crc reads fall back to the code
 * config when its document is missing.
 */

const PO = "po-daniel"
const actor: Actor = { uid: PO, email: "daniel@example.test", via: "console" }
let app: App
const db = () => getFirestore(app)
const auth = () => getAuth(app)
let now = Date.parse("2026-10-12T12:00:00Z")
const provisioned: Array<{ orgId: string; slug: string }> = []

async function wipe() {
    for (const col of ["orgs", "memberships", "users", "auditLogs", "platform", "platformAudit", "invites", "collections", "mcpTokens", "library_index"]) {
        const snap = await db().collection(col).get()
        await Promise.all(snap.docs.map((d) => d.ref.delete()))
    }
    const list = await auth().listUsers(1000)
    await Promise.all(list.users.map((u) => auth().deleteUser(u.uid)))
    __resetPlatformOwnerMemo()
}

async function user(uid: string, email: string) {
    await auth().createUser({ uid, email })
    await db().collection("users").doc(uid).set({ email, displayName: uid, membershipsMigratedAt: new Date() })
}

const auditCount = async () => (await db().collection("platformAudit").get()).size

beforeAll(() => {
    expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
    expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toBeTruthy()
    app = getApps()[0] ?? initializeApp({ projectId: "demo-lane1-p4" })
    __setPlatformDeps({
        db: db(),
        auth: auth(),
        now: () => now,
        revalidateConfig: () => {},
        revalidateHosts: async () => {},
        provisionAddress: async (orgId, slug) => {
            provisioned.push({ orgId, slug })
            const host = `${slug}.vercel.app`
            await db().collection("orgs").doc(orgId).update({ domains: { primary: host, aliases: [] }, defaultAddress: { host } })
            return { orgId, host, reused: false, tried: [], authDomainsSize: 9 }
        },
    })
})
afterAll(async () => {
    await wipe()
    __setPlatformDeps({})
})
beforeEach(async () => {
    await wipe()
    provisioned.length = 0
    now = Date.parse("2026-10-12T12:00:00Z")
    await db().collection("platform").doc("owners").set({ uids: [PO] })
    await user(PO, "daniel@example.test")
})

describe("reads", () => {
    it("crc and BL appear from the code configs when their documents are missing", async () => {
        const list = await listTenants()
        expect(list.map((t) => t.orgId).sort()).toEqual(["brotherslazaroff", "crc"])
        const crc = await getTenant("crc")
        expect(crc!.config).toEqual(codeOrgConfig("crc"))
        expect(crc!.summary.featuresOn).toEqual(["mixer", "driveInbox", "schedulingEmails", "todayFeed", "notifyBand", "perform"])
        expect(await getTenant("nope")).toBeNull()
    })

    it("counts members and pending per tenant", async () => {
        await db().collection("memberships").doc("crc__a").set({ uid: "a", tenantId: "crc", role: "admin" })
        await db().collection("memberships").doc("crc__b").set({ uid: "b", tenantId: "crc", role: "pending" })
        await db().collection("memberships").doc("brotherslazaroff__a").set({ uid: "a", tenantId: "brotherslazaroff", role: "musician" })
        const crc = (await listTenants()).find((t) => t.orgId === "crc")!
        expect(crc).toMatchObject({ memberCount: 1, pendingCount: 1 })
        expect((await getTenant("crc"))!.membersByRole).toEqual({ admin: 1, pending: 1 })
    })
})

describe("createTenant", () => {
    const input = { orgId: "nava-tehila", subdomain: "nava", config: { name: "Nava Tehila", locale: { language: "he" as const, timeZone: "Asia/Jerusalem" } }, copyLiturgyFrom: "crc" }

    it("dry run: returns the config and address, writes nothing", async () => {
        const r = await createTenant(input, { actor })
        expect(r.dryRun).toBe(true)
        expect(r.after!.locale).toMatchObject({ language: "he", direction: "rtl", timeZone: "Asia/Jerusalem" })
        expect(r.after!.liturgy.serviceTypes).toEqual(codeOrgConfig("crc")!.liturgy.serviceTypes)
        expect(r.address).toBe("nava.vercel.app")
        expect((await db().collection("orgs").doc("nava-tehila").get()).exists).toBe(false)
        expect(provisioned).toEqual([])
        expect(await auditCount()).toBe(0)
    })

    it("apply: writes the doc, attaches the address, one audit row, next steps", async () => {
        const r = await createTenant(input, { actor, dryRun: false })
        expect(r.dryRun).toBe(false)
        expect(r.address).toBe("nava.vercel.app")
        expect(r.nextSteps[0]).toMatch(/invite_tenant_admin/)
        expect(provisioned).toEqual([{ orgId: "nava-tehila", slug: "nava" }])
        const doc = (await db().collection("orgs").doc("nava-tehila").get()).data()!
        expect(doc.status).toBe("active")
        expect(doc.name).toBe("Nava Tehila")
        const rows = await listPlatformActivity({ orgId: "nava-tehila" })
        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({ action: "create_tenant", actorUid: PO, via: "console", orgId: "nava-tehila" })
    })

    it("refuses an existing or built-in id, a bad id, a bad subdomain, no name", async () => {
        await expect(createTenant({ ...input, orgId: "crc" }, { actor })).rejects.toMatchObject({ kind: "conflict" })
        await expect(createTenant({ ...input, orgId: "Bad Id" }, { actor })).rejects.toMatchObject({ kind: "invalid" })
        await expect(createTenant({ ...input, subdomain: "x y" }, { actor })).rejects.toMatchObject({ kind: "invalid" })
        await expect(createTenant({ ...input, config: { name: " " } }, { actor })).rejects.toMatchObject({ kind: "invalid" })
        await createTenant(input, { actor, dryRun: false })
        await expect(createTenant(input, { actor })).rejects.toMatchObject({ kind: "conflict" })
    })
})

describe("updateTenant / features / status", () => {
    beforeEach(async () => {
        await createTenant({ orgId: "probe", subdomain: "probe", config: { name: "Probe" } }, { actor, dryRun: false })
        await db().collection("platformAudit").get().then((s) => Promise.all(s.docs.map((d) => d.ref.delete())))
    })

    it("dry run shows the diff and writes nothing", async () => {
        const before = (await db().collection("orgs").doc("probe").get()).data()
        const r = await updateTenant("probe", { branding: { shortName: "P" } } as never, { actor })
        expect(r).toMatchObject({ dryRun: true, changed: true })
        expect(r.diff).toEqual([{ path: "branding.shortName", before: "Probe", after: "P" }])
        expect((await db().collection("orgs").doc("probe").get()).data()).toEqual(before)
        expect(await auditCount()).toBe(0)
    })

    it("apply writes the changed field whole and one audit row", async () => {
        const r = await updateTenant("probe", { branding: { shortName: "P" } } as never, { actor, dryRun: false })
        expect(r.changed).toBe(true)
        expect(r.auditId).toBeTruthy()
        const doc = (await db().collection("orgs").doc("probe").get()).data()!
        expect(doc.branding.shortName).toBe("P")
        expect(doc.branding.appName).toBe("Probe")
        const rows = await listPlatformActivity({ orgId: "probe" })
        expect(rows).toHaveLength(1)
        expect(rows[0].action).toBe("update_tenant")
        expect(Object.keys(rows[0].after as object)).toEqual(["branding"])
    })

    it("refuses an invalid result and an id change", async () => {
        await expect(updateTenant("probe", { branding: { themeColor: "nope" } } as never, { actor })).rejects.toMatchObject({ kind: "invalid" })
        await expect(updateTenant("probe", { id: "other" }, { actor })).rejects.toMatchObject({ kind: "invalid" })
        await expect(updateTenant("ghost", { name: "x" }, { actor })).rejects.toMatchObject({ kind: "not_found" })
    })

    it("an unchanged apply writes nothing and records nothing", async () => {
        const r = await updateTenant("probe", { name: "Probe" }, { actor, dryRun: false })
        expect(r.changed).toBe(false)
        expect(await auditCount()).toBe(0)
    })

    it("features: only named switches change; unknown names refused", async () => {
        const r = await setTenantFeatures("probe", { mixer: true }, { actor, dryRun: false })
        expect(r.before).toMatchObject({ mixer: false, perform: true })
        expect(r.after).toMatchObject({ mixer: true, perform: true })
        expect((await db().collection("orgs").doc("probe").get()).data()!.features.mixer).toBe(true)
        await expect(setTenantFeatures("probe", { monitor: true } as never, { actor })).rejects.toMatchObject({ kind: "invalid" })
    })

    it("status suspended warns; crc without a document is written whole on apply", async () => {
        const r = await setTenantStatus("probe", "suspended", { actor, dryRun: false })
        expect(r.after).toBe("suspended")
        expect(r.warnings?.[0]).toMatch(/no such site/)
        const c = await updateTenant("crc", { agentGuide: "x" }, { actor })
        expect(c.diff).toEqual([{ path: "agentGuide", before: "", after: "x" }])
        expect((await db().collection("orgs").doc("crc").get()).exists).toBe(false)
    })
})

describe("members", () => {
    beforeEach(async () => {
        await createTenant({ orgId: "probe", subdomain: "probe", config: { name: "Probe" } }, { actor, dryRun: false })
        await user("alice", "alice@example.test")
        await db().collection("platformAudit").get().then((s) => Promise.all(s.docs.map((d) => d.ref.delete())))
    })

    it("set role by email: dry run then apply (membership + auditLogs orgId + platformAudit)", async () => {
        const dry = await setTenantMemberRole("probe", { email: "ALICE@example.test" }, "admin", { actor })
        expect(dry).toMatchObject({ dryRun: true, changed: true, before: null })
        expect((await db().collection("memberships").doc("probe__alice").get()).exists).toBe(false)

        const r = await setTenantMemberRole("probe", { email: "alice@example.test" }, "admin", { actor, dryRun: false })
        expect(r.after).toMatchObject({ uid: "alice", role: "admin" })
        expect((await db().collection("memberships").doc("probe__alice").get()).data()!.role).toBe("admin")
        const logs = await db().collection("auditLogs").where("targetUserId", "==", "alice").get()
        expect(logs.docs.map((d) => d.data().orgId)).toEqual(["probe"])
        expect(await auditCount()).toBe(1)
        const members = await listTenantMembersForPlatform("probe")
        expect(members.map((m) => [m.uid, m.role])).toEqual([["alice", "admin"]])
    })

    it("an email with no account is refused with the invite suggestion", async () => {
        await expect(setTenantMemberRole("probe", { email: "nobody@example.test" }, "admin", { actor })).rejects.toThrow(/invite_tenant_admin/)
    })

    it("removing the last admin is allowed but warned", async () => {
        await setTenantMemberRole("probe", { uid: "alice" }, "admin", { actor, dryRun: false })
        const dry = await removeTenantMember("probe", "alice", { actor })
        expect(dry.warnings?.[0]).toMatch(/no admin/)
        const r = await removeTenantMember("probe", "alice", { actor, dryRun: false })
        expect(r).toMatchObject({ changed: true, after: null })
        expect((await db().collection("memberships").doc("probe__alice").get()).exists).toBe(false)
        await expect(removeTenantMember("probe", "alice", { actor })).rejects.toMatchObject({ kind: "not_found" })
    })
})

describe("invites", () => {
    let token = ""
    beforeEach(async () => {
        await createTenant({ orgId: "probe", subdomain: "probe", config: { name: "Probe" } }, { actor, dryRun: false })
        await user("bob", "bob@example.test")
        await user("eve", "eve@example.test")
        const dry = await inviteTenantAdmin("probe", "Bob@Example.test", "admin", { actor })
        expect(dry.dryRun).toBe(true)
        expect((await db().collection("invites").get()).size).toBe(0)
        const r = await inviteTenantAdmin("probe", "Bob@Example.test", "admin", { actor, dryRun: false })
        expect(r.after!.link).toMatch(/^https:\/\/probe\.vercel\.app\/invite\/[0-9a-f]{64}$/)
        token = r.after!.link.split("/invite/")[1]
    })

    it("stores only the hash, expires in 7 days, lists without the link", async () => {
        const docs = (await db().collection("invites").get()).docs.map((d) => d.data())
        expect(docs).toHaveLength(1)
        expect(docs[0].tokenHash).toBe(hashToken(token))
        expect(JSON.stringify(docs[0])).not.toContain(token)
        expect((docs[0].expiresAt as Timestamp).toMillis() - now).toBe(7 * 24 * 3600 * 1000)
        const list = await listInvites("probe")
        expect(list).toEqual([expect.objectContaining({ email: "bob@example.test", role: "admin", link: "", acceptedAt: null })])
        expect(await peekInvite(token)).toMatchObject({ orgId: "probe", tenantName: "Probe", status: "open" })
    })

    it("the invited email accepts once (case-insensitive) and becomes admin", async () => {
        expect(await acceptInvite(token, "bob", "BOB@example.test")).toEqual({ orgId: "probe", role: "admin" })
        expect((await db().collection("memberships").doc("probe__bob").get()).data()!.role).toBe("admin")
        await expect(acceptInvite(token, "bob", "bob@example.test")).rejects.toMatchObject({ kind: "used" })
        expect((await peekInvite(token))!.status).toBe("accepted")
    })

    it("another email is refused; the platform owner may accept", async () => {
        await expect(acceptInvite(token, "eve", "eve@example.test")).rejects.toMatchObject({ kind: "forbidden" })
        expect((await db().collection("memberships").doc("probe__eve").get()).exists).toBe(false)
        expect(await acceptInvite(token, PO, "daniel@example.test")).toEqual({ orgId: "probe", role: "admin" })
    })

    it("an expired or unknown link is refused", async () => {
        now += 8 * 24 * 3600 * 1000
        await expect(acceptInvite(token, "bob", "bob@example.test")).rejects.toMatchObject({ kind: "expired" })
        await expect(acceptInvite("f".repeat(64), "bob", "bob@example.test")).rejects.toBeInstanceOf(PlatformError)
        expect(await peekInvite("nope")).toBeNull()
    })
})

describe("collections", () => {
    beforeEach(async () => {
        await db().collection("orgs").doc("probe").set({ name: "probe-raw" }) // invalid config doc → not a tenant
        await createTenant({ orgId: "nava-tehila", subdomain: "nava", config: { name: "Nava Tehila" } }, { actor, dryRun: false })
        await db().collection("collections").doc("crc__nava").set({
            ownerOrgId: "crc", name: "nava", label: "Nava Tehilah", visibility: "private", sharedWith: [], assignedTo: [],
        })
        await db().collection("collections").doc("crc__core").set({
            ownerOrgId: "crc", name: "core", label: "CRC Charts", visibility: "private", sharedWith: [], assignedTo: [],
        })
        const rows: Array<[string, Record<string, unknown>]> = [
            ["n1", { orgId: "crc", collection: "nava" }],
            ["n2", { orgId: "crc", collection: "nava" }],
            ["c1", { orgId: "crc", collection: "core" }],
            ["c2", { orgId: "crc" }],
            ["s1", { orgId: "crc", collection: "supplemental" }],
            ["b1", { orgId: "brotherslazaroff", collection: "nava" }],
        ]
        await Promise.all(rows.map(([id, d]) => db().collection("library_index").doc(id).set(d)))
        await db().collection("platformAudit").get().then((s) => Promise.all(s.docs.map((d) => d.ref.delete())))
    })

    it("counts charts per owner and collection; bare collection counts as core", async () => {
        const all = await listCollections()
        expect(Object.fromEntries(all.map((c) => [c.id, c.chartCount]))).toEqual({ crc__core: 2, crc__nava: 2 })
        expect(await listCollections("nava-tehila")).toEqual([])
    })

    it("sharing: dry run, apply, audit; unknown tenant refused; owner stripped", async () => {
        const dry = await setCollectionSharing("crc__nava", { visibility: "private", sharedWith: ["nava-tehila", "crc"] }, { actor })
        expect(dry.diff).toEqual([{ path: "sharedWith", before: [], after: ["nava-tehila"] }])
        expect(dry.after!.chartCount).toBe(2)
        expect((await db().collection("collections").doc("crc__nava").get()).data()!.sharedWith).toEqual([])
        await setCollectionSharing("crc__nava", { visibility: "listed", sharedWith: ["nava-tehila"] }, { actor, dryRun: false })
        expect((await db().collection("collections").doc("crc__nava").get()).data()).toMatchObject({ visibility: "listed", sharedWith: ["nava-tehila"] })
        expect((await listCollections("nava-tehila")).map((c) => c.id)).toEqual(["crc__nava"])
        expect(await auditCount()).toBe(1)
        await expect(setCollectionSharing("crc__nava", { visibility: "private", sharedWith: ["probe"] }, { actor })).rejects.toMatchObject({ kind: "invalid" })
        await expect(setCollectionSharing("crc__nava", { visibility: "public" as never, sharedWith: [] }, { actor })).rejects.toMatchObject({ kind: "invalid" })
    })

    it("assign and unassign; the owner cannot be assigned", async () => {
        const r = await assignCollection("crc__core", "nava-tehila", true, { actor, dryRun: false })
        expect(r.after!.assignedTo).toEqual(["nava-tehila"])
        const u = await assignCollection("crc__core", "nava-tehila", false, { actor, dryRun: false })
        expect(u.after!.assignedTo).toEqual([])
        await expect(assignCollection("crc__core", "crc", true, { actor })).rejects.toMatchObject({ kind: "invalid" })
        await expect(assignCollection("ghost", "crc", true, { actor })).rejects.toMatchObject({ kind: "not_found" })
        expect(await auditCount()).toBe(2)
    })
})

describe("view-as bearer", () => {
    it("mints a read-only, view-as, ≤60-minute token owned by the platform owner", async () => {
        const r = await mintTenantViewBearer("crc", 30, actor)
        expect(r.token).toMatch(/^crl_view_[0-9a-f]{64}$/)
        const doc = (await db().collection("mcpTokens").doc(r.tokenId).get()).data()!
        expect(doc).toMatchObject({ uid: PO, orgId: "crc", kind: "view_as", readOnly: true, viewAs: true, tokenHash: hashToken(r.token) })
        expect((doc.ttlExpiresAt as Timestamp).toMillis()).toBe(now + 30 * 60_000)
        expect(r.expiresAt).toBe(new Date(now + 30 * 60_000).toISOString())
        expect((await listPlatformActivity()).map((a) => a.action)).toEqual(["mint_tenant_view_bearer"])
    })

    it("refuses more than 60 minutes, an unknown tenant, and a non-owner", async () => {
        await expect(mintTenantViewBearer("crc", 61, actor)).rejects.toMatchObject({ kind: "invalid" })
        await expect(mintTenantViewBearer("ghost", 10, actor)).rejects.toMatchObject({ kind: "not_found" })
        await expect(mintTenantViewBearer("crc", 10, { uid: "someone", via: "claude" })).rejects.toMatchObject({ kind: "forbidden" })
    })
})

describe("activity", () => {
    it("filters by tenant and since, newest first", async () => {
        await createTenant({ orgId: "a-one", subdomain: "a-one", config: { name: "A" } }, { actor, dryRun: false })
        now += 60_000
        await createTenant({ orgId: "b-two", subdomain: "b-two", config: { name: "B" } }, { actor, dryRun: false })
        expect((await listPlatformActivity()).map((a) => a.orgId)).toEqual(["b-two", "a-one"])
        expect((await listPlatformActivity({ orgId: "a-one" })).map((a) => a.orgId)).toEqual(["a-one"])
        expect((await listPlatformActivity({ since: new Date(now).toISOString() })).map((a) => a.orgId)).toEqual(["b-two"])
        expect(await listPlatformActivity({ limit: 1 })).toHaveLength(1)
    })
})
