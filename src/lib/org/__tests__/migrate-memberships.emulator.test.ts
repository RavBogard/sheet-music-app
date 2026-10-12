import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { deleteApp, getApps, initializeApp, type App } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore, Timestamp } from "firebase-admin/firestore"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
    applyAll,
    DANIEL_UID,
    DAVID_UID,
    planAll,
    seed,
    undoManifest,
    verifyAll,
} from "../../../../scripts/ops/multitenant/migrate-memberships"
import { applyExtras, planExtras, undoExtras } from "../../../../scripts/ops/multitenant/stamp-p2-extras"
import { __resetPlatformOwnerMemo } from "@/lib/org/access"

/**
 * Multi-tenant P2 lane 2 — rehearsal of migrate-memberships --seed/--plan/
 * --apply/--undo and stamp-p2-extras on the emulators, with a fixture that
 * mirrors the production shapes the lead read (31 Auth users: 6 admins with
 * orgIds [crc, brotherslazaroff] incl. Daniel and David; 1 band leader (both);
 * 12 musicians (both); 7 musicians + 3 members with no orgIds claim; 2
 * accounts with no claims whose doc is pending with the both-tenants sign-up
 * default; config/admins with a dead uid; config/defaults → a crc setlist).
 * The undo must leave every account's custom claims byte-identical.
 */
const BOTH = ["crc", "brotherslazaroff"]
type Fixture = { uid: string; claims: Record<string, unknown> | null; doc: Record<string, unknown> }

function fixture(): Fixture[] {
    const out: Fixture[] = []
    const ts = Timestamp.fromMillis(1_760_000_000_123)
    const admins = [DANIEL_UID, DAVID_UID, "karen", "drew-1", "drew-2", "crcmusic"]
    for (const uid of admins) {
        const se = uid === DANIEL_UID
        out.push({
            uid,
            claims: { role: "admin", orgIds: BOTH, ...(se ? { soundEngineer: true } : {}) },
            doc: { role: "admin", orgIds: BOTH, canUpload: true, claimsUpdatedAt: ts, ...(se ? { soundEngineer: true } : {}) },
        })
    }
    out.push({ uid: "bl-1", claims: { role: "band_leader", orgIds: BOTH }, doc: { role: "band_leader", orgIds: BOTH, canUpload: true } })
    for (let i = 0; i < 12; i++) out.push({ uid: `mu-both-${i}`, claims: { orgIds: BOTH, role: "musician" }, doc: { role: "musician", orgIds: BOTH } })
    for (let i = 0; i < 7; i++) out.push({ uid: `mu-crc-${i}`, claims: { role: "musician" }, doc: { role: "musician", orgIds: BOTH } })
    for (let i = 0; i < 3; i++) out.push({ uid: `me-crc-${i}`, claims: { role: "member" }, doc: { role: "member" } })
    for (let i = 0; i < 2; i++) out.push({ uid: `pending-${i}`, claims: null, doc: { role: "pending", orgIds: BOTH } })
    return out
}

describe("migrate-memberships rehearsal (emulator)", () => {
    let app: App
    const db = () => getFirestore(app)
    const auth = () => getAuth(app)
    const dir = mkdtempSync(join(tmpdir(), "lane2-manifests-"))
    const people = fixture()
    const before = new Map<string, string>()
    const docBefore = new Map<string, Record<string, unknown>>()

    beforeAll(async () => {
        expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-lane2-migrate" })
        for (const col of ["memberships", "users", "auditLogs", "platform", "templates", "config", "setlists"]) {
            const snap = await db().collection(col).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
        const list = await auth().listUsers(1000)
        await Promise.all(list.users.map((u) => auth().deleteUser(u.uid)))
        __resetPlatformOwnerMemo()

        for (const p of people) {
            await auth().createUser({ uid: p.uid, email: `${p.uid.toLowerCase()}@example.test` })
            if (p.claims) await auth().setCustomUserClaims(p.uid, p.claims)
            await db().collection("users").doc(p.uid).set({ email: `${p.uid.toLowerCase()}@example.test`, ...p.doc })
        }
        for (const p of people) {
            before.set(p.uid, JSON.stringify((await auth().getUser(p.uid)).customClaims ?? null))
            docBefore.set(p.uid, (await db().collection("users").doc(p.uid).get()).data()!)
        }
        await db().doc("config/admins").set({ uids: ["dead-uid-0000"] })
        await db().doc("setlists/crc-shabbat").set({ name: "Shabbat", orgId: "crc" })
        await db().doc("setlists/bl-gig").set({ name: "Gig", orgId: "brotherslazaroff" })
        await db().doc("config/defaults").set({ shabbat_morning: "crc-shabbat", gig: "bl-gig", updatedBy: "x" })
        await db().doc("templates/friday_night").set({ rows: [] })
        await db().doc("templates/brotherslazaroff__gig").set({ rows: [] })
        await db().doc("templates/crc__x").set({ rows: [], orgId: "crc" })
        await db().collection("auditLogs").doc("a1").set({ action: "ROLE_CHANGE" })
        await db().collection("auditLogs").doc("a2").set({ action: "ROLE_CHANGE", orgId: "crc" })
    })
    afterAll(async () => {
        await deleteApp(app)
    })

    let seedManifest: string | null = null
    let manifest = ""

    it("--seed writes platform/owners and the David override (manifest records absence)", async () => {
        const dry = await seed(db(), false, dir)
        expect(dry.path).toBeNull()
        expect((await db().doc("platform/owners").get()).exists).toBe(false)
        const r = await seed(db(), true, dir)
        seedManifest = r.path
        expect(r.wrote).toEqual(["platform/owners", "platform/membershipMigration"])
        expect((await db().doc("platform/owners").get()).get("uids")).toEqual([DANIEL_UID])
        expect((await db().doc("platform/membershipMigration").get()).get("overrides")).toEqual({ [DAVID_UID]: { brotherslazaroff: "admin" } })
        expect((await seed(db(), true, dir)).wrote).toEqual([]) // idempotent
    })

    it("--plan: ruling 5, pending rule, bytes, globals — and writes nothing", async () => {
        const { rows, globals } = await planAll(db(), auth())
        expect(rows).toHaveLength(31)
        const by = (uid: string) => rows.find((r) => r.uid === uid)!
        expect(by(DAVID_UID).plannedText).toBe("crc:admin brotherslazaroff:admin")
        expect(by(DANIEL_UID)).toMatchObject({ plannedText: "crc:admin:se", po: true })
        for (const uid of ["karen", "drew-1", "drew-2", "crcmusic"]) {
            expect(by(uid).plannedText).toBe("crc:admin")
            expect(by(uid).flags).toContain("ruling5_admin_crc_only")
        }
        expect(by("bl-1").plannedText).toBe("crc:band_leader brotherslazaroff:band_leader")
        expect(by("mu-both-3").plannedText).toBe("crc:musician brotherslazaroff:musician")
        expect(by("mu-crc-2").plannedText).toBe("crc:musician")
        expect(by("mu-crc-2").flags).toContain("doc_orgIds≠claim")
        expect(by("me-crc-0").plannedText).toBe("crc:member")
        expect(by("pending-1").plannedText).toBe("crc:pending brotherslazaroff:pending")
        expect(by("pending-1").flags).toContain("pending_default_both")
        expect(Math.max(...rows.map((r) => r.plannedClaimsBytes ?? 0))).toBeLessThan(900)
        expect(globals.claimAdmins).toHaveLength(6)
        expect(globals.configAdminsUids).toEqual(["dead-uid-0000"])
        expect(globals.templatesWithoutOrgId).toEqual(["brotherslazaroff__gig", "friday_night"])
        expect(globals.membershipsCount).toBe(0)
        expect((await db().collection("memberships").get()).size).toBe(0)
    })

    it("--apply: manifest first, 47 memberships, claims rebuilt with legacy kept; idempotent; verify OK", async () => {
        const r = await applyAll(db(), auth(), dir)
        manifest = r.path
        expect(r.migrated).toHaveLength(31)
        const m = JSON.parse(readFileSync(manifest, "utf8"))
        expect(m.users).toHaveLength(31)
        expect((await db().collection("memberships").get()).size).toBe(47)
        expect((await auth().getUser("karen")).customClaims).toEqual({ m: { crc: "ad" }, role: "admin", orgIds: ["crc"] })
        expect((await auth().getUser(DAVID_UID)).customClaims).toEqual({ m: { crc: "ad", brotherslazaroff: "ad" }, role: "admin", orgIds: BOTH })
        expect((await auth().getUser(DANIEL_UID)).customClaims).toEqual({
            po: true, m: { crc: "ad" }, se: ["crc"], role: "admin", orgIds: ["crc"], soundEngineer: true,
        })
        expect((await auth().getUser("pending-0")).customClaims).toEqual({ m: { crc: "pe", brotherslazaroff: "pe" }, role: "pending" })
        expect((await auth().getUser("mu-crc-0")).customClaims).toEqual({ m: { crc: "mu" }, role: "musician", orgIds: ["crc"] })
        const again = await applyAll(db(), auth(), dir)
        expect(again.migrated).toEqual([])
        expect(await verifyAll(db(), auth())).toEqual({ ok: true, problems: [] })
    })

    it("--undo restores every account's claims byte-identically and the users docs exactly", async () => {
        const dry = await undoManifest(db(), auth(), manifest, false)
        expect(dry.deleted).toHaveLength(47)
        expect((await db().collection("memberships").get()).size).toBe(47) // dry run wrote nothing
        const r = await undoManifest(db(), auth(), manifest, true)
        expect(r.restored).toHaveLength(31)
        expect(r.keptChanged).toEqual([])
        expect((await db().collection("memberships").get()).size).toBe(0)
        for (const p of people) {
            const after = JSON.stringify((await auth().getUser(p.uid)).customClaims ?? null)
            if (before.get(p.uid) === "null") {
                // An account that never had custom claims: the Admin SDK can only
                // "clear" to {} (setCustomUserClaims(uid, null) stores {}), which
                // puts no claim in the token — the same token as before.
                expect(["null", "{}"], p.uid).toContain(after)
            } else {
                expect(after, p.uid).toBe(before.get(p.uid))
            }
            const doc = (await db().collection("users").doc(p.uid).get()).data()!
            expect(doc, p.uid).toEqual(docBefore.get(p.uid))
        }
    })

    it("seed undo removes the platform docs it created", async () => {
        await undoManifest(db(), auth(), seedManifest!, true)
        expect((await db().doc("platform/owners").get()).exists).toBe(false)
        expect((await db().doc("platform/membershipMigration").get()).exists).toBe(false)
    })

    it("stamp-p2-extras: templates/auditLogs/defaults/admins apply and undo exactly", async () => {
        const plan = await planExtras(db(), ["templates", "auditLogs", "defaults", "admins"])
        expect(plan.stamps.map((s) => `${s.collection}/${s.id}=${s.orgId}`).sort()).toEqual([
            "auditLogs/a1=crc",
            "templates/brotherslazaroff__gig=brotherslazaroff",
            "templates/friday_night=crc",
        ])
        const path = (await applyExtras(db(), plan, dir))!
        expect((await db().doc("templates/brotherslazaroff__gig").get()).get("orgId")).toBe("brotherslazaroff")
        expect((await db().doc("config/defaults").get()).data()).toEqual({ shabbat_morning: "crc-shabbat", updatedBy: "x" })
        expect((await db().doc("config/defaults__brotherslazaroff").get()).data()).toEqual({ gig: "bl-gig" })
        expect((await db().doc("config/admins").get()).exists).toBe(false)

        const u = await undoExtras(db(), path, true)
        expect(u.unstamped).toBe(3)
        expect((await db().doc("templates/friday_night").get()).get("orgId")).toBeUndefined()
        expect((await db().doc("templates/crc__x").get()).get("orgId")).toBe("crc")
        expect((await db().doc("auditLogs/a2").get()).get("orgId")).toBe("crc")
        expect((await db().doc("config/defaults").get()).data()).toEqual({ shabbat_morning: "crc-shabbat", gig: "bl-gig", updatedBy: "x" })
        expect((await db().doc("config/defaults__brotherslazaroff").get()).exists).toBe(false)
        expect((await db().doc("config/admins").get()).get("uids")).toEqual(["dead-uid-0000"])
    })
})
