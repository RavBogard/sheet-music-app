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
import { getFirestore, Timestamp } from "firebase-admin/firestore"

// ── Mocks (must be declared BEFORE the tool imports) ──

const mockSendEmail = vi.fn(async (_opts?: unknown) => ({ ok: true }))
vi.mock("@/lib/email-scheduling", () => ({
    sendSchedulingEmail: (...args: unknown[]) => mockSendEmail(args[0]),
}))

const mockSendAssignmentSMS = vi.fn(async (_opts?: unknown) => ({ ok: true }))
const mockSendCancellationSMS = vi.fn(async (_opts?: unknown) => ({
    ok: true,
}))
vi.mock("@/lib/sms", () => ({
    sendSchedulingAssignmentSMS: (...args: unknown[]) =>
        mockSendAssignmentSMS(args[0]),
    sendSchedulingCancellationSMS: (...args: unknown[]) =>
        mockSendCancellationSMS(args[0]),
}))

const mockSendPush = vi.fn(async (_uids?: unknown, _opts?: unknown) => ({
    sent: 0,
    failed: 0,
}))
vi.mock("@/lib/push-send", () => ({
    sendPushToUsers: (...args: unknown[]) =>
        mockSendPush(args[0], args[1]),
}))

vi.mock("@/lib/new-song-detector", () => ({
    detectNewSongs: vi.fn(async () => []),
}))

vi.mock("@/lib/constants", () => ({
    BASE_URL: "http://localhost:3000",
}))

const mockCheckUserRateLimit = vi.fn<
    (uid: string, tier: string, opts?: unknown) => Promise<null | { error: string; retryAfterSec: number }>
>(async () => null)
vi.mock("@/lib/rate-limit", () => ({
    checkUserRateLimit: (uid: string, tier: string, opts?: unknown) =>
        mockCheckUserRateLimit(uid, tier, opts),
}))

// ── Imports AFTER mocks ──

import {
    listMusicians,
    getMusicianProfile,
    listMusiciansOnDate,
    listPendingAssignments,
    suggestMusicians,
    suggestBand,
    assignMusician,
    unassignMusician,
    respondToAssignment,
} from "../tools/roster"

/**
 * Cycle-3 c1 — emulator-backed roster + scheduling MCP tools.
 *
 * Covers the inbox spec checklist verbatim:
 *  - trusted-leader gate refusal on each tool (musician → forbidden)
 *  - respond_to_assignment own-assignment gate
 *  - happy path on each read tool
 *  - dryRun-default + force-gated on assign/unassign
 *  - idempotent assign
 *  - rich envelope on every refusal/validation path
 *  - side-effect verification (notification fan-out called)
 */
describe("MCP roster tools — cycle-3 c1 (emulator)", () => {
    let app: App
    const ADMIN = "rabbi-daniel"
    const BAND_LEADER = "david-band-leader"
    const MUSICIAN = "alex-musician"
    const OTHER_MUSICIAN = "sam-musician"
    const NONUSER = "ghost-uid"

    const SETLIST_ID = "setlist-friday-1"
    const SETLIST_NAME = "Erev Shabbat — June 6"
    const EVENT_DATE_ISO = "2026-06-06"

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

    async function seedSetlist(
        id: string,
        opts: {
            name?: string
            eventDate?: string
            templateType?: string
            rabbi?: string
            assignedUids?: string[]
        } = {},
    ) {
        const payload: Record<string, unknown> = {
            name: opts.name ?? SETLIST_NAME,
            ownerId: ADMIN,
            trackCount: 0,
        }
        if (opts.eventDate) {
            payload.eventDate = Timestamp.fromDate(
                new Date(`${opts.eventDate}T00:00:00.000Z`),
            )
        }
        if (opts.templateType) payload.templateType = opts.templateType
        if (opts.rabbi) payload.rabbi = opts.rabbi
        if (opts.assignedUids) payload.assignedUids = opts.assignedUids
        await db().collection("setlists").doc(id).set(payload)
    }

    async function seedAssignment(
        id: string,
        opts: {
            setlistId: string
            musicianUid: string
            musicianName?: string
            musicianPhone?: string
            instrument?: string
            status: "pending" | "confirmed" | "declined" | "cancelled"
            autoConfirmed?: boolean
            setlistName?: string
            assignedBy?: string
        },
    ) {
        await db()
            .collection("scheduling_assignments")
            .doc(id)
            .set({
                setlistId: opts.setlistId,
                setlistName: opts.setlistName ?? SETLIST_NAME,
                musicianUid: opts.musicianUid,
                musicianName: opts.musicianName ?? opts.musicianUid,
                musicianEmail: `${opts.musicianUid}@example.com`,
                musicianPhone: opts.musicianPhone ?? "+15551234567",
                instrument: opts.instrument ?? null,
                status: opts.status,
                autoConfirmed: opts.autoConfirmed === true,
                assignedBy: opts.assignedBy ?? ADMIN,
                assignedAt: Timestamp.now(),
                notifiedVia: [],
            })
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-mcp-roster" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        mockSendEmail.mockClear()
        mockSendAssignmentSMS.mockClear()
        mockSendCancellationSMS.mockClear()
        mockSendPush.mockClear()
        mockCheckUserRateLimit.mockReset()
        mockCheckUserRateLimit.mockResolvedValue(null)
        for (const col of [
            "users",
            "setlists",
            "scheduling_assignments",
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

    it("list_musicians: refuses non-trusted-leader callers with rich forbidden_role envelope", async () => {
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

    // ─── list_musicians_on_date ─────────────────────────────────────────────

    it("list_musicians_on_date: refuses non-trusted-leader caller", async () => {
        const r = await listMusiciansOnDate(MUSICIAN, {
            eventDate: EVENT_DATE_ISO,
        })
        expect(r).toMatchObject({ ok: false, error: { machine_code: "forbidden_role" } })
    })

    it("list_musicians_on_date: rejects unparseable date with invalid_argument", async () => {
        const r = await listMusiciansOnDate(ADMIN, { eventDate: "not-a-date" })
        expect(r).toMatchObject({ ok: false, error: { machine_code: "invalid_argument" } })
    })

    it("list_musicians_on_date: groups assignments by status, narrowed by templateType", async () => {
        await seedSetlist(SETLIST_ID, {
            eventDate: EVENT_DATE_ISO,
            templateType: "friday_night",
        })
        await seedSetlist("setlist-other", {
            eventDate: EVENT_DATE_ISO,
            templateType: "shabbat_morning",
        })
        await seedAssignment("a1", {
            setlistId: SETLIST_ID,
            musicianUid: MUSICIAN,
            status: "pending",
        })
        await seedAssignment("a2", {
            setlistId: SETLIST_ID,
            musicianUid: OTHER_MUSICIAN,
            status: "confirmed",
        })
        await seedAssignment("a3", {
            setlistId: "setlist-other",
            musicianUid: MUSICIAN,
            status: "pending",
        })

        const r = await listMusiciansOnDate(ADMIN, {
            eventDate: EVENT_DATE_ISO,
            templateType: "friday_night",
        })
        if (!("ok" in r) || !r.ok) throw new Error("expected ok=true")
        expect(r.matchedSetlists).toHaveLength(1)
        expect(r.matchedSetlists[0].id).toBe(SETLIST_ID)
        expect(r.grouped.pending.map((a) => a.musicianUid)).toEqual([MUSICIAN])
        expect(r.grouped.confirmed.map((a) => a.musicianUid)).toEqual([
            OTHER_MUSICIAN,
        ])
        expect(r.total).toBe(2)
    })

    it("C9I4-001: matches ISO-STRING eventDate setlists (date-only form)", async () => {
        // Every CURRENT setlist stores eventDate as an ISO string; the old
        // Timestamp-only range query returned matchedSetlists:[] for them.
        await db().collection("setlists").doc("set-str-dateonly").set({
            name: "Erev Shabbat",
            ownerId: ADMIN,
            trackCount: 0,
            eventDate: "2026-06-06", // STRING, not Timestamp
        })
        await seedAssignment("as1", {
            setlistId: "set-str-dateonly",
            musicianUid: MUSICIAN,
            status: "confirmed",
        })

        const r = await listMusiciansOnDate(ADMIN, { eventDate: "2026-06-06" })
        if (!("ok" in r) || !r.ok) throw new Error("expected ok=true")
        expect(r.matchedSetlists.map((s) => s.id)).toContain("set-str-dateonly")
        expect(r.grouped.confirmed.map((a) => a.musicianUid)).toEqual([MUSICIAN])
        expect(r.total).toBe(1)
    })

    it("C9I4-001: matches full-ISO-STRING eventDate within the day window", async () => {
        await db().collection("setlists").doc("set-str-fulliso").set({
            name: "Friday Night",
            ownerId: ADMIN,
            trackCount: 0,
            eventDate: "2026-06-06T19:00:00.000Z", // STRING, time-of-day
        })
        await seedAssignment("as2", {
            setlistId: "set-str-fulliso",
            musicianUid: OTHER_MUSICIAN,
            status: "pending",
        })

        const r = await listMusiciansOnDate(ADMIN, { eventDate: "2026-06-06" })
        if (!("ok" in r) || !r.ok) throw new Error("expected ok=true")
        expect(r.matchedSetlists.map((s) => s.id)).toContain("set-str-fulliso")
        expect(r.grouped.pending.map((a) => a.musicianUid)).toEqual([
            OTHER_MUSICIAN,
        ])
    })

    it("C9I4-001: still matches Timestamp eventDate rows (no regression)", async () => {
        // seedSetlist stores a Timestamp — both query paths must coexist.
        await seedSetlist(SETLIST_ID, { eventDate: EVENT_DATE_ISO })
        await seedAssignment("as3", {
            setlistId: SETLIST_ID,
            musicianUid: MUSICIAN,
            status: "pending",
        })
        const r = await listMusiciansOnDate(ADMIN, { eventDate: EVENT_DATE_ISO })
        if (!("ok" in r) || !r.ok) throw new Error("expected ok=true")
        expect(r.matchedSetlists.map((s) => s.id)).toContain(SETLIST_ID)
        expect(r.total).toBe(1)
    })

    it("C9I4-001: a string eventDate OUTSIDE the day window does not match", async () => {
        await db().collection("setlists").doc("set-str-otherday").set({
            name: "Next Week",
            ownerId: ADMIN,
            trackCount: 0,
            eventDate: "2026-06-13",
        })
        const r = await listMusiciansOnDate(ADMIN, { eventDate: "2026-06-06" })
        if (!("ok" in r) || !r.ok) throw new Error("expected ok=true")
        expect(r.matchedSetlists.map((s) => s.id)).not.toContain(
            "set-str-otherday",
        )
    })

    // ─── list_pending_assignments ───────────────────────────────────────────

    it("list_pending_assignments: refuses non-trusted-leader caller", async () => {
        const r = await listPendingAssignments(MUSICIAN)
        expect(r).toMatchObject({ ok: false, error: { machine_code: "forbidden_role" } })
    })

    it("list_pending_assignments: returns only pending rows; uid filter narrows further", async () => {
        await seedSetlist(SETLIST_ID, { eventDate: EVENT_DATE_ISO })
        await seedAssignment("a1", {
            setlistId: SETLIST_ID,
            musicianUid: MUSICIAN,
            status: "pending",
        })
        await seedAssignment("a2", {
            setlistId: SETLIST_ID,
            musicianUid: OTHER_MUSICIAN,
            status: "confirmed",
        })
        await seedAssignment("a3", {
            setlistId: SETLIST_ID,
            musicianUid: OTHER_MUSICIAN,
            status: "pending",
        })

        const all = await listPendingAssignments(ADMIN)
        if (!("ok" in all) || !all.ok) throw new Error("expected ok=true")
        expect(all.count).toBe(2)

        const filtered = await listPendingAssignments(ADMIN, {
            uid: MUSICIAN,
        })
        if (!("ok" in filtered) || !filtered.ok)
            throw new Error("expected ok=true")
        expect(filtered.count).toBe(1)
        expect(filtered.assignments[0].musicianUid).toBe(MUSICIAN)
    })

    // ─── suggest_musicians ──────────────────────────────────────────────────

    it("suggest_musicians: refuses non-trusted-leader caller", async () => {
        const r = await suggestMusicians(MUSICIAN, { setlistId: SETLIST_ID })
        expect(r).toMatchObject({ ok: false, error: { machine_code: "forbidden_role" } })
    })

    it("suggest_musicians: not_found for missing setlist", async () => {
        const r = await suggestMusicians(ADMIN, { setlistId: "no-such-id" })
        expect(r).toMatchObject({ ok: false, error: { machine_code: "not_found" } })
    })

    it("suggest_musicians: filters out already-assigned musicians and sorts core first", async () => {
        await seedSetlist(SETLIST_ID, {
            eventDate: EVENT_DATE_ISO,
            assignedUids: [BAND_LEADER],
        })
        await seedAssignment("a1", {
            setlistId: SETLIST_ID,
            musicianUid: BAND_LEADER,
            status: "confirmed",
        })

        const r = await suggestMusicians(ADMIN, { setlistId: SETLIST_ID })
        if (!("ok" in r) || !r.ok) throw new Error("expected ok=true")
        const uids = r.suggestions.map((s) => s.uid)
        expect(uids).not.toContain(BAND_LEADER)
        // OTHER_MUSICIAN is core; should sort before regular MUSICIAN.
        const coreIdx = uids.indexOf(OTHER_MUSICIAN)
        const regIdx = uids.indexOf(MUSICIAN)
        expect(coreIdx).toBeGreaterThanOrEqual(0)
        expect(coreIdx).toBeLessThan(regIdx)
    })

    // ─── suggest_band ───────────────────────────────────────────────────────

    it("suggest_band: refuses non-trusted-leader caller", async () => {
        const r = await suggestBand(MUSICIAN, { setlistId: SETLIST_ID })
        expect(r).toMatchObject({ ok: false, error: { machine_code: "forbidden_role" } })
    })

    it("suggest_band: returns ranked candidates with coverageGap including missing required slots", async () => {
        await seedSetlist(SETLIST_ID, { eventDate: EVENT_DATE_ISO })
        const r = await suggestBand(ADMIN, { setlistId: SETLIST_ID })
        if (!("ok" in r) || !r.ok) throw new Error("expected ok=true")
        expect(Array.isArray(r.suggestions)).toBe(true)
        expect(r.suggestions.length).toBeGreaterThan(0)
        // REQUIRED_INSTRUMENTS = acoustic_guitar/electric_bass/hand_drums/piano/voice.
        // With no one selected, every required slot is uncovered.
        expect(r.coverageGap).toContain("acoustic_guitar")
        expect(r.coverageGap).toContain("hand_drums")
    })

    it("C9I4-004: free-text instruments count toward coverage (Guitar→acoustic_guitar, Drums→hand_drums)", async () => {
        // A musician whose profile.instrument is the free-text "Guitar" / "Drums"
        // (not the canonical slug) must satisfy the required slot. Pre-fix the
        // exact-equality check left acoustic_guitar/hand_drums in the gap.
        await seedUser("gtr-user", {
            role: "musician",
            instrument: "Guitar",
            tier: "regular",
        })
        await seedUser("drm-user", {
            role: "musician",
            instrument: "Drums",
            tier: "regular",
        })
        await seedSetlist(SETLIST_ID, {
            eventDate: EVENT_DATE_ISO,
            assignedUids: ["gtr-user", "drm-user"],
        })

        const r = await suggestBand(ADMIN, { setlistId: SETLIST_ID })
        if (!("ok" in r) || !r.ok) throw new Error("expected ok=true")
        // Free-text Guitar/Drums now cover their required slugs.
        expect(r.coverageGap).not.toContain("acoustic_guitar")
        expect(r.coverageGap).not.toContain("hand_drums")
        // Genuinely-uncovered slots still surface.
        expect(r.coverageGap).toContain("electric_bass")
        expect(r.coverageGap).toContain("piano")
        expect(r.coverageGap).toContain("voice")
    })

    // ─── assign_musician ────────────────────────────────────────────────────

    it("assign_musician: refuses non-trusted-leader caller", async () => {
        await seedSetlist(SETLIST_ID, { eventDate: EVENT_DATE_ISO })
        const r = await assignMusician(MUSICIAN, {
            setlistId: SETLIST_ID,
            uid: OTHER_MUSICIAN,
        })
        expect(r).toMatchObject({ ok: false, error: { machine_code: "forbidden_role" } })
    })

    it("assign_musician: rejects empty setlistId / uid with invalid_argument", async () => {
        const r = await assignMusician(ADMIN, {
            setlistId: "",
            uid: MUSICIAN,
        })
        expect(r).toMatchObject({ ok: false, error: { machine_code: "invalid_argument" } })
    })

    it("assign_musician: not_found on missing setlist", async () => {
        const r = await assignMusician(ADMIN, {
            setlistId: "ghost-setlist",
            uid: MUSICIAN,
        })
        expect(r).toMatchObject({ ok: false, error: { machine_code: "not_found" } })
    })

    it("assign_musician: dryRun (default) returns plan without writing or notifying", async () => {
        await seedSetlist(SETLIST_ID, { eventDate: EVENT_DATE_ISO })
        const r = await assignMusician(ADMIN, {
            setlistId: SETLIST_ID,
            uid: MUSICIAN,
        })
        if (!("ok" in r) || !r.ok) throw new Error("expected ok=true")
        expect(r).toMatchObject({
            ok: true,
            setlistId: SETLIST_ID,
            projectedStatus: "pending",
            alreadyAssigned: false,
            dryRun: true,
            committed: false,
        })

        const assignmentsSnap = await db()
            .collection("scheduling_assignments")
            .get()
        expect(assignmentsSnap.empty).toBe(true)
        expect(mockSendEmail).not.toHaveBeenCalled()
    })

    it("assign_musician: projects 'confirmed' for core musicians (auto-confirmed)", async () => {
        await seedSetlist(SETLIST_ID, { eventDate: EVENT_DATE_ISO })
        const r = await assignMusician(ADMIN, {
            setlistId: SETLIST_ID,
            uid: OTHER_MUSICIAN, // core
        })
        if (!("ok" in r) || !r.ok) throw new Error("expected ok=true")
        expect(r.projectedStatus).toBe("confirmed")
    })

    it("assign_musician: real-run without force → rich force_required envelope, no write, no notification", async () => {
        await seedSetlist(SETLIST_ID, { eventDate: EVENT_DATE_ISO })
        const r = await assignMusician(ADMIN, {
            setlistId: SETLIST_ID,
            uid: MUSICIAN,
            dryRun: false,
        })
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "force_required", code: 409 },
            setlistId: SETLIST_ID,
            dryRunPlan: {
                committed: false,
            },
        })

        const assignmentsSnap = await db()
            .collection("scheduling_assignments")
            .get()
        expect(assignmentsSnap.empty).toBe(true)
        expect(mockSendEmail).not.toHaveBeenCalled()
    })

    it("assign_musician: force:true commits + fires notification cascade for non-core (pending status)", async () => {
        await seedSetlist(SETLIST_ID, { eventDate: EVENT_DATE_ISO })
        const r = await assignMusician(ADMIN, {
            setlistId: SETLIST_ID,
            uid: MUSICIAN,
            dryRun: false,
            force: true,
        })
        if (!("ok" in r) || !r.ok) throw new Error("expected ok=true")
        expect(r.committed).toBe(true)

        const assignmentsSnap = await db()
            .collection("scheduling_assignments")
            .where("musicianUid", "==", MUSICIAN)
            .get()
        expect(assignmentsSnap.size).toBe(1)
        expect(assignmentsSnap.docs[0].data().status).toBe("pending")

        // Notification fan-out: email + SMS (musician opted in) + push fired.
        expect(mockSendEmail).toHaveBeenCalledTimes(1)
        expect(mockSendAssignmentSMS).toHaveBeenCalledTimes(1)
        expect(mockSendPush).toHaveBeenCalledTimes(1)
    })

    it("assign_musician: idempotent — re-assigning an already-active musician is a no-op", async () => {
        await seedSetlist(SETLIST_ID, { eventDate: EVENT_DATE_ISO })
        await seedAssignment("existing", {
            setlistId: SETLIST_ID,
            musicianUid: MUSICIAN,
            status: "confirmed",
        })

        const dry = await assignMusician(ADMIN, {
            setlistId: SETLIST_ID,
            uid: MUSICIAN,
        })
        if (!("ok" in dry) || !dry.ok) throw new Error("expected ok=true")
        expect(dry.alreadyAssigned).toBe(true)
        expect(dry.dryRun).toBe(true)

        const real = await assignMusician(ADMIN, {
            setlistId: SETLIST_ID,
            uid: MUSICIAN,
            dryRun: false,
            force: true,
        })
        if (!("ok" in real) || !real.ok) throw new Error("expected ok=true")
        expect(real.alreadyAssigned).toBe(true)
        expect(real.committed).toBe(false)
        // No new doc, no notifications.
        const snap = await db().collection("scheduling_assignments").get()
        expect(snap.size).toBe(1)
        expect(mockSendEmail).not.toHaveBeenCalled()
    })

    it("assign_musician: surfaces rate_limited rich envelope for non-trusted caller when limiter trips", async () => {
        await seedSetlist(SETLIST_ID, { eventDate: EVENT_DATE_ISO })
        mockCheckUserRateLimit.mockResolvedValueOnce({
            error: "Too many requests.",
            retryAfterSec: 60,
        })
        const r = await assignMusician(ADMIN, {
            setlistId: SETLIST_ID,
            uid: MUSICIAN,
        })
        expect(r).toMatchObject({ ok: false, error: { machine_code: "rate_limited" } })
    })

    // ─── unassign_musician ──────────────────────────────────────────────────

    it("unassign_musician: refuses non-trusted-leader caller", async () => {
        const r = await unassignMusician(MUSICIAN, {
            setlistId: SETLIST_ID,
            uid: OTHER_MUSICIAN,
        })
        expect(r).toMatchObject({ ok: false, error: { machine_code: "forbidden_role" } })
    })

    it("unassign_musician: not_found on missing setlist", async () => {
        const r = await unassignMusician(ADMIN, {
            setlistId: "ghost",
            uid: MUSICIAN,
        })
        expect(r).toMatchObject({ ok: false, error: { machine_code: "not_found" } })
    })

    it("unassign_musician: dryRun shows previousStatus + assignmentId without writing", async () => {
        await seedSetlist(SETLIST_ID, { eventDate: EVENT_DATE_ISO })
        await seedAssignment("a1", {
            setlistId: SETLIST_ID,
            musicianUid: MUSICIAN,
            status: "pending",
        })
        const r = await unassignMusician(ADMIN, {
            setlistId: SETLIST_ID,
            uid: MUSICIAN,
        })
        if (!("ok" in r) || !r.ok) throw new Error("expected ok=true")
        expect(r).toMatchObject({
            ok: true,
            assignmentId: "a1",
            previousStatus: "pending",
            dryRun: true,
            committed: false,
        })
        const snap = await db().collection("scheduling_assignments").doc("a1").get()
        expect(snap.data()?.status).toBe("pending")
    })

    it("unassign_musician: real-run without force → refused, no write", async () => {
        await seedSetlist(SETLIST_ID, { eventDate: EVENT_DATE_ISO })
        await seedAssignment("a1", {
            setlistId: SETLIST_ID,
            musicianUid: MUSICIAN,
            status: "pending",
        })
        const r = await unassignMusician(ADMIN, {
            setlistId: SETLIST_ID,
            uid: MUSICIAN,
            dryRun: false,
        })
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "force_required", code: 409 },
            dryRunPlan: { committed: false },
        })
    })

    it("unassign_musician: force:true cancels and fires cancellation cascade", async () => {
        await seedSetlist(SETLIST_ID, { eventDate: EVENT_DATE_ISO })
        await seedAssignment("a1", {
            setlistId: SETLIST_ID,
            musicianUid: MUSICIAN,
            status: "confirmed",
        })
        const r = await unassignMusician(ADMIN, {
            setlistId: SETLIST_ID,
            uid: MUSICIAN,
            dryRun: false,
            force: true,
        })
        if (!("ok" in r) || !r.ok) throw new Error("expected ok=true")
        expect(r.committed).toBe(true)
        expect(r.previousStatus).toBe("confirmed")

        const after = await db()
            .collection("scheduling_assignments")
            .doc("a1")
            .get()
        expect(after.data()?.status).toBe("cancelled")
        expect(mockSendEmail).toHaveBeenCalledTimes(1)
        expect(mockSendCancellationSMS).toHaveBeenCalledTimes(1)
    })

    it("unassign_musician: no active assignment → committed:false, no-op (not an error)", async () => {
        await seedSetlist(SETLIST_ID, { eventDate: EVENT_DATE_ISO })
        const r = await unassignMusician(ADMIN, {
            setlistId: SETLIST_ID,
            uid: MUSICIAN,
            dryRun: false,
            force: true,
        })
        if (!("ok" in r) || !r.ok) throw new Error("expected ok=true")
        expect(r.assignmentId).toBeNull()
        expect(r.committed).toBe(false)
    })

    // ─── respond_to_assignment ──────────────────────────────────────────────

    it("respond_to_assignment: rejects invalid status with invalid_argument", async () => {
        const r = await respondToAssignment(MUSICIAN, {
            assignmentId: "a1",
            // @ts-expect-error — bad shape on purpose
            status: "pending",
        })
        expect(r).toMatchObject({ ok: false, error: { machine_code: "invalid_argument" } })
    })

    it("respond_to_assignment: not_found on missing assignment", async () => {
        const r = await respondToAssignment(MUSICIAN, {
            assignmentId: "ghost-assignment",
            status: "confirmed",
        })
        expect(r).toMatchObject({ ok: false, error: { machine_code: "not_found" } })
    })

    it("respond_to_assignment: forbidden_assignment when responding to someone else's invitation", async () => {
        await seedSetlist(SETLIST_ID, { eventDate: EVENT_DATE_ISO })
        await seedAssignment("a1", {
            setlistId: SETLIST_ID,
            musicianUid: OTHER_MUSICIAN,
            status: "pending",
        })
        const r = await respondToAssignment(MUSICIAN, {
            assignmentId: "a1",
            status: "confirmed",
        })
        expect(r).toMatchObject({ ok: false, error: { machine_code: "forbidden_assignment" } })
    })

    it("respond_to_assignment: musician accepts own pending → status flips to confirmed", async () => {
        await seedSetlist(SETLIST_ID, { eventDate: EVENT_DATE_ISO })
        await seedAssignment("a1", {
            setlistId: SETLIST_ID,
            musicianUid: MUSICIAN,
            status: "pending",
        })
        const r = await respondToAssignment(MUSICIAN, {
            assignmentId: "a1",
            status: "confirmed",
        })
        if (!("ok" in r) || !r.ok) throw new Error("expected ok=true")
        expect(r.status).toBe("confirmed")
        const after = await db()
            .collection("scheduling_assignments")
            .doc("a1")
            .get()
        expect(after.data()?.status).toBe("confirmed")
    })

    it("respond_to_assignment: musician declines own pending → flips to declined and surfaces declineReason", async () => {
        await seedSetlist(SETLIST_ID, { eventDate: EVENT_DATE_ISO })
        await seedAssignment("a1", {
            setlistId: SETLIST_ID,
            musicianUid: MUSICIAN,
            status: "pending",
        })
        const r = await respondToAssignment(MUSICIAN, {
            assignmentId: "a1",
            status: "declined",
            declineReason: "Travel that weekend",
        })
        if (!("ok" in r) || !r.ok) throw new Error("expected ok=true")
        expect(r.status).toBe("declined")
        const after = await db()
            .collection("scheduling_assignments")
            .doc("a1")
            .get()
        expect(after.data()?.status).toBe("declined")
        expect(after.data()?.declineReason).toBe("Travel that weekend")
    })

    it("respond_to_assignment: validation_error when assignment already responded", async () => {
        await seedSetlist(SETLIST_ID, { eventDate: EVENT_DATE_ISO })
        await seedAssignment("a1", {
            setlistId: SETLIST_ID,
            musicianUid: MUSICIAN,
            status: "confirmed",
        })
        const r = await respondToAssignment(MUSICIAN, {
            assignmentId: "a1",
            status: "declined",
        })
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "validation_error" },
            currentStatus: "confirmed",
        })
    })
})
