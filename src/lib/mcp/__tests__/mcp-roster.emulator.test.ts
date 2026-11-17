import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest"
import {
    initializeApp,
    deleteApp,
    getApps,
    type App,
} from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

vi.mock("@/lib/rate-limit", () => ({ checkUserRateLimit: vi.fn(async () => null) }))

import {
    listMusicians,
    findUser,
    getMusicianProfile,
} from "../tools/roster"
import { mirrorLegacyRoles } from "@/test-stubs/mirror-legacy-roles"

/**
 * Emulator-backed roster MCP tools (list_musicians, find_user,
 * get_musician_profile): the trusted-leader gate, the happy paths, tenant
 * scoping and the rich envelope on refusal.
 */
describe("MCP roster tools (emulator)", () => {
    let app: App
    const ADMIN = "rabbi-daniel"
    const BAND_LEADER = "david-band-leader"
    const MUSICIAN = "alex-musician"
    const OTHER_MUSICIAN = "sam-musician"
    const NONUSER = "ghost-uid"

    function db() {
        return getFirestore(app)
    }

    async function seedUser(
        uid: string,
        opts: {
            role: "admin" | "band_leader" | "musician" | "member"
            instrument?: string | null
            tier?: "core" | "regular" | "guest"
            email?: string
            displayName?: string
            phone?: string
            orgIds?: string[]
            notificationPreferences?: {
                email?: boolean
                sms?: boolean
                push?: boolean
            }
        },
    ) {
        const payload: Record<string, unknown> = {
            role: opts.role,
            email: opts.email ?? `${uid}@example.com`,
            displayName: opts.displayName ?? uid,
        }
        if (opts.orgIds !== undefined) payload.orgIds = opts.orgIds
        if (opts.instrument !== null) {
            const profile: Record<string, unknown> = {
                instrument: opts.instrument ?? "acoustic_guitar",
                schedulingTier: opts.tier ?? "regular",
            }
            if (opts.phone !== undefined) profile.phone = opts.phone
            if (opts.notificationPreferences !== undefined) {
                profile.notificationPreferences = opts.notificationPreferences
            }
            payload.musicianProfile = profile
        }
        await db().collection("users").doc(uid).set(payload)
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-mcp-roster" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        for (const col of [
            "users",
            "setlists",
            "config",
        ]) {
            const snap = await db().collection(col).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
        await seedUser(ADMIN, { role: "admin", instrument: "piano" })
        await seedUser(BAND_LEADER, {
            role: "band_leader",
            instrument: "electric_guitar",
        })
        await seedUser(MUSICIAN, {
            role: "musician",
            instrument: "electric_bass",
            tier: "regular",
            phone: "+15551234567",
            notificationPreferences: { email: true, sms: true, push: true },
        })
        await seedUser(OTHER_MUSICIAN, {
            role: "musician",
            instrument: "voice",
            tier: "core",
        })
    })

    // ─── list_musicians ─────────────────────────────────────────────────────

    // SEC-02: role gates read memberships only; give each seeded person theirs.
    beforeEach(async () => { await mirrorLegacyRoles(db()) })

    it("list_musicians: refuses non-trusted-leader callers with rich forbidden_role envelope", async () => {
        await mirrorLegacyRoles(db(), { orgs: ["crc"], uids: [MUSICIAN], allRoles: true, keepExisting: true })
        const r = await listMusicians(MUSICIAN)
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "forbidden_role" },
            callerRole: "musician",
        })
        expect("requiredRoles" in r && r.requiredRoles).toContain(
            "band_leader",
        )
    })

    it("list_musicians: returns every musician with an instrument, sorted by name", async () => {
        const r = await listMusicians(ADMIN)
        if (!("ok" in r) || !r.ok) throw new Error("expected ok=true")
        expect(r.count).toBe(4)
        expect(r.musicians.map((m) => m.uid)).toEqual([
            MUSICIAN,
            BAND_LEADER,
            ADMIN,
            OTHER_MUSICIAN,
        ])
        // Notification preferences default surfaces email:true sms:false push:true.
        const other = r.musicians.find((m) => m.uid === OTHER_MUSICIAN)!
        expect(other.notificationPreferences).toEqual({
            email: true,
            sms: false,
            push: true,
        })
    })

    it("list_musicians: filters by instrument slug AND by scheduling tier", async () => {
        const r1 = await listMusicians(BAND_LEADER, {
            instrument: "electric_bass",
        })
        if (!("ok" in r1) || !r1.ok) throw new Error("expected ok=true")
        expect(r1.musicians).toHaveLength(1)
        expect(r1.musicians[0].uid).toBe(MUSICIAN)

        const r2 = await listMusicians(BAND_LEADER, { schedulingTier: "core" })
        if (!("ok" in r2) || !r2.ok) throw new Error("expected ok=true")
        expect(r2.musicians.map((m) => m.uid)).toEqual([OTHER_MUSICIAN])
    })

    it("list_musicians: instrument filter matches by label fragment ('guitar' → electric_guitar)", async () => {
        const r = await listMusicians(ADMIN, { instrument: "guitar" })
        if (!("ok" in r) || !r.ok) throw new Error("expected ok=true")
        expect(r.musicians.map((m) => m.uid)).toContain(BAND_LEADER)
    })

    // ─── v11.7-02: list_musicians includeProfileless interim (AC-4) ───────────

    it("list_musicians: default drops instrument-less users; includeProfileless surfaces them", async () => {
        // A CRC band_leader with NO musicianProfile (the David shape).
        await seedUser("leader-noinstr", {
            role: "band_leader",
            instrument: null,
        })

        const def = await listMusicians(ADMIN)
        if (!("ok" in def) || !def.ok) throw new Error("expected ok=true")
        expect(def.musicians.map((m) => m.uid)).not.toContain("leader-noinstr")

        const incl = await listMusicians(ADMIN, { includeProfileless: true })
        if (!("ok" in incl) || !incl.ok) throw new Error("expected ok=true")
        const row = incl.musicians.find((m) => m.uid === "leader-noinstr")
        expect(row).toBeDefined()
        expect(row!.instrument).toBeNull()
        expect(row!.instrumentLabel).toBeNull()
    })

    // ─── v11.7-02: find_user directory resolver ───────────────────────────────

    describe("find_user (v11.7-02 — Asymmetry Principle)", () => {
        // A CRC band_leader with NO instrument — invisible to list_musicians.
        async function seedDavid() {
            await seedUser("david", {
                role: "band_leader",
                instrument: null,
                email: "David.Lazaroff@example.com",
                displayName: "David Lazaroff",
                orgIds: ["crc"],
            })
        }

        it("find_user: surfaces an instrument-less user by name (the David fix, AC-1)", async () => {
            await seedDavid()
            const r = await findUser(ADMIN, { nameContains: "lazaroff" }, "crc")
            if (!("ok" in r) || !r.ok) throw new Error("expected ok=true")
            const david = r.users.find((u) => u.uid === "david")
            expect(david).toBeDefined()
            expect(david!.instrument).toBeNull()
            expect(david!.role).toBe("band_leader")
            expect(david!.email).toBe("David.Lazaroff@example.com")
        })

        it("find_user: matches email case-insensitively (AC-1)", async () => {
            await seedDavid()
            const r = await findUser(
                ADMIN,
                { email: "david.lazaroff@EXAMPLE.com" },
                "crc",
            )
            if (!("ok" in r) || !r.ok) throw new Error("expected ok=true")
            expect(r.users.map((u) => u.uid)).toContain("david")
        })

        it("find_user: role filter includes the profileless leader, excludes plain musicians (AC-1)", async () => {
            await seedDavid()
            const r = await findUser(ADMIN, { role: "band_leader" }, "crc")
            if (!("ok" in r) || !r.ok) throw new Error("expected ok=true")
            const uids = r.users.map((u) => u.uid)
            expect(uids).toContain("david")
            expect(uids).toContain(BAND_LEADER)
            expect(uids).not.toContain(MUSICIAN)
        })

        it("find_user: tenant wall — broslaz-only user hidden from CRC caller; dual-org visible (AC-2)", async () => {
            await seedUser("bl-only", {
                role: "musician",
                instrument: "voice",
                displayName: "Blair Only",
                orgIds: ["brotherslazaroff"],
            })
            await seedUser("dual", {
                role: "band_leader",
                instrument: null,
                displayName: "Dora Dual",
                orgIds: ["crc", "brotherslazaroff"],
            })

            const r = await findUser(ADMIN, {}, "crc")
            if (!("ok" in r) || !r.ok) throw new Error("expected ok=true")
            const uids = r.users.map((u) => u.uid)
            expect(uids).not.toContain("bl-only")
            expect(uids).toContain("dual")
        })

        it("find_user: refuses a plain musician with the rich forbidden_role envelope (AC-3)", async () => {
            await mirrorLegacyRoles(db(), { orgs: ["crc"], uids: [MUSICIAN], allRoles: true, keepExisting: true })
            const r = await findUser(MUSICIAN, { nameContains: "x" }, "crc")
            expect(r).toMatchObject({
                ok: false,
                error: { machine_code: "forbidden_role" },
                callerRole: "musician",
            })
        })

        it("find_user: an empty call returns the whole org directory incl. profileless (AC-3)", async () => {
            await seedDavid()
            const r = await findUser(ADMIN, {}, "crc")
            if (!("ok" in r) || !r.ok) throw new Error("expected ok=true")
            const uids = r.users.map((u) => u.uid)
            // 4 base CRC users + david
            expect(uids).toContain("david")
            expect(uids).toContain(MUSICIAN)
            expect(uids).toContain(ADMIN)
            // sorted by displayName
            const names = r.users.map((u) => u.displayName)
            expect(names).toEqual([...names].sort((a, b) =>
                a.localeCompare(b, undefined, { sensitivity: "base" }),
            ))
        })

        it("find_user: includeProfileless:false narrows to instrument-bearing musicians", async () => {
            await seedDavid()
            const r = await findUser(
                ADMIN,
                { includeProfileless: false },
                "crc",
            )
            if (!("ok" in r) || !r.ok) throw new Error("expected ok=true")
            expect(r.users.map((u) => u.uid)).not.toContain("david")
        })
    })

    // ─── v11-05-02: org-scoping (multi-org membership via doc.orgIds) ─────────

    async function listUids(caller: string, org: string): Promise<string[]> {
        const r = (await listMusicians(caller, {}, org as never)) as {
            ok: true
            musicians: Array<{ uid: string }>
        }
        if (!("ok" in r) || !r.ok) throw new Error("expected ok=true")
        return r.musicians.map((m) => m.uid).sort()
    }

    it("list_musicians: roster is scoped to the caller org; multi-org member appears in both", async () => {
        // Base beforeEach users carry no orgIds → default ['crc'] (CRC members).
        await seedUser("bl-only", { role: "musician", instrument: "voice", orgIds: ["brotherslazaroff"] })
        await seedUser("david", { role: "band_leader", instrument: "voice", orgIds: ["crc", "brotherslazaroff"] })

        const crc = await listUids(ADMIN, "crc")
        expect(crc).toContain(MUSICIAN) // legacy/no-orgIds → crc by default
        expect(crc).toContain("david")
        expect(crc).not.toContain("bl-only")

        const bl = await listUids(ADMIN, "brotherslazaroff")
        expect(bl).toContain("bl-only")
        expect(bl).toContain("david")
        expect(bl).not.toContain(MUSICIAN)
    })

    it("list_musicians: a legacy user without orgIds stays in CRC (no backfill needed) and is excluded from BL", async () => {
        // MUSICIAN seeded by beforeEach has NO orgIds field.
        const crc = await listUids(ADMIN, "crc")
        expect(crc).toContain(MUSICIAN)
        const bl = await listUids(ADMIN, "brotherslazaroff")
        expect(bl).not.toContain(MUSICIAN)
    })

    // ─── get_musician_profile ───────────────────────────────────────────────

    it("get_musician_profile: refuses non-trusted-leader caller", async () => {
        const r = await getMusicianProfile(MUSICIAN, { uid: BAND_LEADER })
        expect(r).toMatchObject({ ok: false, error: { machine_code: "forbidden_role" } })
    })

    it("get_musician_profile: rejects empty uid with invalid_argument", async () => {
        const r = await getMusicianProfile(ADMIN, { uid: "" })
        expect(r).toMatchObject({ ok: false, error: { machine_code: "invalid_argument" } })
    })

    it("get_musician_profile: returns not_found for ghost uid", async () => {
        const r = await getMusicianProfile(ADMIN, { uid: NONUSER })
        expect(r).toMatchObject({ ok: false, error: { machine_code: "not_found" } })
    })

    it("get_musician_profile: happy path returns the row", async () => {
        const r = await getMusicianProfile(ADMIN, { uid: MUSICIAN })
        if (!("ok" in r) || !r.ok) throw new Error("expected ok=true")
        expect(r.musician.instrument).toBe("electric_bass")
        expect(r.musician.phone).toBe("+15551234567")
    })
})
