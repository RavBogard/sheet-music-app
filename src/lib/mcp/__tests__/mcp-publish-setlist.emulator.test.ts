import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

// Mock external side-effecting helpers — email/Push/SMS/song-usage. Real
// Firestore via the emulator handles auth lookup, setlist + track reads,
// snapshot write, in-app notification batch, and the history audit doc.
const mockEmailAllMembers = vi.fn().mockResolvedValue({
    sent: 0,
    failed: 0,
    errors: [],
    messageIds: [],
})
vi.mock("@/lib/email", () => ({
    emailAllMembers: (...args: unknown[]) => mockEmailAllMembers(...args),
}))
const mockSendPushToUsers = vi.fn().mockResolvedValue({ sent: 0, failed: 0 })
vi.mock("@/lib/push-send", () => ({
    sendPushToUsers: (...args: unknown[]) => mockSendPushToUsers(...args),
}))
const mockSendSMS = vi.fn().mockResolvedValue(undefined)
vi.mock("@/lib/sms", () => ({
    sendSMS: (...args: unknown[]) => mockSendSMS(...args),
}))
const mockRecordSongUsage = vi
    .fn()
    .mockResolvedValue({ recorded: 0, skipped: 0 })
vi.mock("@/lib/song-usage", () => ({
    recordSongUsage: (...args: unknown[]) => mockRecordSongUsage(...args),
}))
vi.mock("@/lib/rate-limit", () => ({
    checkUserRateLimit: vi.fn().mockResolvedValue(null),
}))

// B-003 pre-flight check: getChartHealth is HEAD-probed for every bonded
// track before publish. In the emulator there's no Storage/Drive backing,
// so default the mock to "ok" — individual tests override for the
// missing/unreachable cases.
const mockGetChartHealth = vi.fn().mockResolvedValue({
    status: "ok",
    source: "firebase-storage",
})
vi.mock("@/lib/file-fetcher", () => ({
    getChartHealth: (...args: unknown[]) => mockGetChartHealth(...args),
    fetchFileById: vi.fn(),
}))

import { publishSetlist } from "../tools/setlist-publish"

/**
 * MCP publish_setlist against the Firebase emulator.
 *
 * Covers the contract from the 2026-05-15 cowork report (publish/notify gap):
 *  - Snapshot + publishedAt + lastNotifiedAt write on first publish
 *  - Re-publish refreshes snapshot but skips SMS (cost control)
 *  - Default-audience recipient derivation: band roles minus caller
 *  - audience='all' adds members
 *  - recipients[] override bypasses default derivation
 *  - dryRun returns the plan without writing or dispatching
 *  - Validation: setlist not found, no bonded songs
 *  - Auth gate: non-leader denied
 *  - Each delivery channel (in-app, push, email, SMS) called with expected args
 */
describe("MCP publish_setlist (emulator)", () => {
    let app: App
    const ADMIN = "rabbi-daniel"
    const LEADER = "david-leader"
    const MUSICIAN_1 = "alex-musician"
    const MUSICIAN_2 = "sam-musician"
    const MEMBER = "guest-member"
    const NONLEADER = "guest-musician-no-write"

    function db() {
        return getFirestore(app)
    }

    async function seedUser(
        uid: string,
        data: Record<string, unknown>,
    ): Promise<void> {
        await db().collection("users").doc(uid).set(data)
    }

    async function seedSetlist(
        id: string,
        data: Record<string, unknown> = {},
    ): Promise<void> {
        await db()
            .collection("setlists")
            .doc(id)
            .set({
                name: "Shabbat Morning",
                ownerId: ADMIN,
                trackCount: 0,
                ...data,
            })
    }

    async function seedTrack(
        id: string,
        setlistId: string,
        order: number,
        fields: Record<string, unknown>,
    ): Promise<void> {
        await db()
            .collection("tracks")
            .doc(id)
            .set({ setlistId, order, ...fields })
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app =
            getApps()[0] ??
            initializeApp({ projectId: "demo-mcp-publish-setlist" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        mockEmailAllMembers.mockClear()
        mockSendPushToUsers.mockClear()
        mockSendSMS.mockClear()
        mockRecordSongUsage.mockClear()
        for (const col of ["users", "setlists", "tracks"]) {
            const snap = await db().collection(col).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
        await seedUser(ADMIN, {
            role: "admin",
            email: "daniel@centralreform.org",
            displayName: "Rabbi Daniel",
        })
        await seedUser(LEADER, {
            role: "band_leader",
            email: "david@example.com",
            displayName: "David L",
        })
        await seedUser(MUSICIAN_1, {
            role: "musician",
            email: "alex@example.com",
            displayName: "Alex",
            musicianProfile: {
                phone: "+15551234567",
                notificationPreferences: { sms: true },
            },
        })
        await seedUser(MUSICIAN_2, {
            role: "musician",
            email: "sam@example.com",
            displayName: "Sam",
        })
        await seedUser(MEMBER, {
            role: "member",
            email: "guest-member@example.com",
            displayName: "Guest Member",
        })
        await seedUser(NONLEADER, {
            role: "musician",
            email: "deniedwriter@example.com",
            displayName: "Read-only musician",
        })
    })

    async function seedPublishableSetlist(setlistId: string): Promise<void> {
        await seedSetlist(setlistId)
        await seedTrack("t1", setlistId, 0, {
            type: "song",
            title: "Oseh Shalom",
            fileId: "upload-osehshalom",
        })
        await seedTrack("t2", setlistId, 1, {
            type: "song",
            title: "Mi Chamocha",
            fileId: "upload-michamocha",
        })
        await seedTrack("h1", setlistId, 2, {
            type: "header",
            title: "Kabbalat Shabbat",
        })
    }

    it("happy path: first-publish writes snapshot + publishedAt + lastNotifiedAt and fans out across all channels", async () => {
        const id = "set-pub-1"
        await seedPublishableSetlist(id)

        mockEmailAllMembers.mockResolvedValueOnce({
            sent: 3,
            failed: 0,
            errors: [],
            messageIds: [],
        })
        mockSendPushToUsers.mockResolvedValueOnce({ sent: 3, failed: 0 })

        const r = await publishSetlist(ADMIN, { setlistId: id })
        expect("ok" in r && r.ok).toBe(true)
        if (!("ok" in r) || !r.ok) return

        expect(r.wasAlreadyPublished).toBe(false)
        expect(r.dryRun).toBe(false)
        // Default audience excludes the publisher (ADMIN) and members. So
        // LEADER + MUSICIAN_1 + MUSICIAN_2 + NONLEADER are eligible (4 band-
        // role accounts minus ADMIN himself).
        expect(r.recipientCount).toBe(4)
        const uids = r.recipients.map((x) => x.uid).sort()
        expect(uids).toEqual([LEADER, MUSICIAN_1, MUSICIAN_2, NONLEADER].sort())

        // Snapshot captured the two song rows but not the header.
        expect(r.snapshot).toHaveLength(2)
        expect(r.snapshot.map((s) => s.title)).toEqual([
            "Oseh Shalom",
            "Mi Chamocha",
        ])

        // Firestore state: publishedAt + snapshot now persisted.
        const post = (await db().collection("setlists").doc(id).get()).data()!
        expect(post.publishedAt).toBeTruthy()
        expect(post.publishedSnapshot).toHaveLength(2)
        expect(post.lastNotifiedAt).toBeTruthy()
        // version-echo NOTE (v6 bugstomp): a real publish bumps the setlist
        // version (Plan 03) and surfaces the post-bump value so callers can
        // chain lastSeenVersion without a separate get_setlist round trip.
        expect(r.version).toBe(post.version)
        expect(typeof r.version).toBe("number")

        // In-app: 4 notifications written under users/{uid}/notifications/
        for (const uid of uids) {
            const notifSnap = await db()
                .collection("users")
                .doc(uid)
                .collection("notifications")
                .get()
            expect(notifSnap.size).toBeGreaterThanOrEqual(1)
        }
        expect(r.delivery.inApp.sent).toBe(4)

        // Push called with all 4 recipient uids
        expect(mockSendPushToUsers).toHaveBeenCalledTimes(1)
        const pushUids = mockSendPushToUsers.mock.calls[0][0] as string[]
        expect(pushUids.sort()).toEqual(uids)

        // Email called once with the 4 recipients
        expect(mockEmailAllMembers).toHaveBeenCalledTimes(1)
        const emailTargets = mockEmailAllMembers.mock.calls[0][0] as Array<{
            email: string
        }>
        expect(emailTargets).toHaveLength(4)

        // SMS — first publish AND MUSICIAN_1 opted in → exactly one call
        expect(mockSendSMS).toHaveBeenCalledTimes(1)
        expect(mockSendSMS.mock.calls[0][0]).toBe("+15551234567")
        expect(r.delivery.sms.sent).toBe(1)
        expect(r.delivery.sms.skippedRepublish).toBe(false)

        // Song-usage recorded (fire-and-forget; awaited in the test only to
        // confirm it was invoked).
        expect(mockRecordSongUsage).toHaveBeenCalledTimes(1)

        // History audit doc written under setlists/{id}/history/
        const history = await db()
            .collection("setlists")
            .doc(id)
            .collection("history")
            .get()
        expect(history.size).toBeGreaterThanOrEqual(1)
        const audit = history.docs[0].data() as unknown as Record<string, unknown>
        expect(audit.action).toBe("published")
        expect((audit.details as { source?: string }).source).toBe("mcp")
    })

    it("re-publish refreshes snapshot + lastNotifiedAt but skips SMS", async () => {
        const id = "set-pub-republish"
        await seedPublishableSetlist(id)
        // Mark already-published
        await db()
            .collection("setlists")
            .doc(id)
            .update({
                publishedAt: new Date("2026-05-10T00:00:00Z"),
                publishedSnapshot: [{ title: "Old", key: "", fileId: "x" }],
            })

        const r = await publishSetlist(ADMIN, { setlistId: id })
        expect("ok" in r && r.ok).toBe(true)
        if (!("ok" in r) || !r.ok) return

        expect(r.wasAlreadyPublished).toBe(true)
        expect(r.delivery.sms.skippedRepublish).toBe(true)
        expect(r.delivery.sms.sent).toBe(0)
        expect(mockSendSMS).not.toHaveBeenCalled()

        // Snapshot replaced with the fresh one
        const post = (await db().collection("setlists").doc(id).get()).data()!
        expect((post.publishedSnapshot as Array<{ title: string }>).map((s) => s.title))
            .toEqual(["Oseh Shalom", "Mi Chamocha"])
    })

    it("dryRun=true returns the plan without writing or dispatching", async () => {
        const id = "set-pub-dry"
        await seedPublishableSetlist(id)

        const r = await publishSetlist(ADMIN, { setlistId: id, dryRun: true })
        expect("ok" in r && r.ok).toBe(true)
        if (!("ok" in r) || !r.ok) return

        expect(r.dryRun).toBe(true)
        expect(r.recipientCount).toBeGreaterThan(0)
        // No external dispatch
        expect(mockEmailAllMembers).not.toHaveBeenCalled()
        expect(mockSendPushToUsers).not.toHaveBeenCalled()
        expect(mockSendSMS).not.toHaveBeenCalled()
        expect(mockRecordSongUsage).not.toHaveBeenCalled()
        // No Firestore mutations
        const post = (await db().collection("setlists").doc(id).get()).data()!
        expect(post.publishedAt).toBeFalsy()
        expect(post.publishedSnapshot).toBeUndefined()
        // version-echo NOTE (v6 bugstomp): dryRun surfaces the current
        // setlist version unchanged (no bump on dry-run). This seed
        // intentionally omits `version` to represent a pre-W-04 doc; the
        // echoed `version: 0` is what `readVersion` returns for missing
        // and matches the in-doc state (also missing).
        expect(typeof r.version).toBe("number")
        const expectedVersion =
            typeof post.version === "number" ? post.version : 0
        expect(r.version).toBe(expectedVersion)
    })

    it("audience='all' includes members in the default recipient set", async () => {
        const id = "set-pub-all"
        await seedPublishableSetlist(id)

        const r = await publishSetlist(ADMIN, {
            setlistId: id,
            audience: "all",
            dryRun: true,
        })
        if (!("ok" in r) || !r.ok) throw new Error("expected ok result")
        const uids = r.recipients.map((x) => x.uid).sort()
        expect(uids).toEqual(
            [LEADER, MUSICIAN_1, MUSICIAN_2, MEMBER, NONLEADER].sort(),
        )
    })

    it("recipients[] override bypasses default derivation", async () => {
        const id = "set-pub-override"
        await seedPublishableSetlist(id)

        const r = await publishSetlist(ADMIN, {
            setlistId: id,
            recipients: [
                { uid: MUSICIAN_1 },
                { name: "External Guest", email: "guest@example.com" },
            ],
            dryRun: true,
        })
        if (!("ok" in r) || !r.ok) throw new Error("expected ok result")
        expect(r.recipientCount).toBe(2)
        const names = r.recipients.map((x) => x.name).sort()
        expect(names).toEqual(["Alex", "External Guest"])
    })

    it("rejects publish when the setlist has no bonded song rows", async () => {
        const id = "set-pub-empty"
        await seedSetlist(id)
        await seedTrack("h1", id, 0, {
            type: "header",
            title: "Header only",
        })

        const r = await publishSetlist(ADMIN, { setlistId: id })
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "no_bonded_songs", message: expect.stringContaining("at least one song row") },
        })
    })

    it("returns setlist_not_found for a missing setlist", async () => {
        const r = await publishSetlist(ADMIN, { setlistId: "ghost" })
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "setlist_not_found" },
            setlistId: "ghost",
        })
    })

    it("rejects an empty setlistId", async () => {
        const r = await publishSetlist(ADMIN, { setlistId: "   " })
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "invalid_argument" },
            field: "setlistId",
        })
    })

    it("non-leader caller is denied at the editor gate", async () => {
        const id = "set-pub-denied"
        await seedPublishableSetlist(id)

        const r = await publishSetlist(NONLEADER, { setlistId: id })
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "forbidden_role" },
            requiredRoles: expect.arrayContaining(["admin", "band_leader"]),
            message: expect.stringContaining("admin or band leader"),
        })
    })

    it("band_leader (non-owner) may publish", async () => {
        const id = "set-pub-bandleader"
        await seedPublishableSetlist(id) // owned by ADMIN, not LEADER

        const r = await publishSetlist(LEADER, {
            setlistId: id,
            dryRun: true,
        })
        expect("ok" in r && r.ok).toBe(true)
    })

    it("pre-flight refuses publish when any bonded chart is missing (B-003)", async () => {
        // 2026-05-16 Bar Mitzvah session: 4 of 21 published charts 404'd in
        // the band's email — the orphaned songIds passed every existence
        // check until the user opened each chart. Pre-flight now HEAD-probes
        // every bonded chart and refuses by default.
        const id = "set-pub-broken"
        await seedPublishableSetlist(id)

        mockGetChartHealth.mockImplementation(async (fileId: string) =>
            fileId === "upload-osehshalom"
                ? { status: "ok", source: "firebase-storage" as const }
                : {
                      status: "missing" as const,
                      reason: "library_index row points at a deleted Drive file",
                  },
        )

        const r = await publishSetlist(ADMIN, { setlistId: id })
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "publish_refused_unhealthy_charts", message: expect.stringMatching(/Publish refused.*won't render.*Mi Chamocha/s) },
            hint: expect.stringContaining("force: true"),
        })

        // Setlist was NOT mutated — no publishedAt write on refusal.
        const post = (await db().collection("setlists").doc(id).get()).data()!
        expect(post.publishedAt).toBeFalsy()
        expect(mockSendPushToUsers).not.toHaveBeenCalled()
        expect(mockEmailAllMembers).not.toHaveBeenCalled()
    })

    it("pre-flight bypasses with force: true and still publishes; chartHealth report carries the unhealthy list", async () => {
        const id = "set-pub-force"
        await seedPublishableSetlist(id)

        mockGetChartHealth.mockImplementation(async (fileId: string) =>
            fileId === "upload-osehshalom"
                ? { status: "ok", source: "firebase-storage" as const }
                : {
                      status: "missing" as const,
                      reason: "library_index row points at a deleted Drive file",
                  },
        )

        const r = await publishSetlist(ADMIN, {
            setlistId: id,
            force: true,
        })
        expect("ok" in r && r.ok).toBe(true)
        if (!("ok" in r) || !r.ok) return

        expect(r.chartHealth.bondedCount).toBe(2)
        expect(r.chartHealth.okCount).toBe(1)
        // F-006: chartHealth carries aggregate counts so the caller doesn't
        // have to filter `unhealthy[]` themselves; same shape preview_publish
        // returns.
        expect(r.chartHealth.missingCount).toBe(1)
        expect(r.chartHealth.unreachableCount).toBe(0)
        // b5 followup: needsSyncCount mirrors verify_setlist_charts' NEW-5 field.
        expect(r.chartHealth.needsSyncCount).toBe(0)
        expect(r.chartHealth.unhealthy).toHaveLength(1)
        expect(r.chartHealth.unhealthy[0]).toMatchObject({
            fileId: "upload-michamocha",
            status: "missing",
        })

        // Setlist actually got published — the force flag means "yes, ship
        // the broken charts, the band will deal".
        const post = (await db().collection("setlists").doc(id).get()).data()!
        expect(post.publishedAt).toBeTruthy()
    })

    it("dryRun on an unhealthy setlist returns the preview without force (F-01 → F-05)", async () => {
        // 2026-05-16 bugstomp F-05: pre-fix, dryRun on a setlist with any
        // broken bond refused with the same error as a non-dryRun publish,
        // meaning operators had to pass `force: true` just to see the
        // chartHealth report — they had to opt into "ship anyway" to learn
        // whether they were okay shipping anyway. The refuse-gate now
        // fires only on a real publish; dryRun always returns the report.
        const id = "set-pub-dry-broken"
        await seedPublishableSetlist(id)

        mockGetChartHealth.mockImplementation(async (fileId: string) =>
            fileId === "upload-osehshalom"
                ? { status: "ok", source: "firebase-storage" as const }
                : {
                      status: "missing" as const,
                      reason: "library_index row points at a deleted Drive file",
                  },
        )

        const r = await publishSetlist(ADMIN, {
            setlistId: id,
            dryRun: true,
        })
        expect("ok" in r && r.ok).toBe(true)
        if (!("ok" in r) || !r.ok) return

        // dryRun returned the report — operator can now see what's broken
        // BEFORE deciding whether to force-publish.
        expect(r.dryRun).toBe(true)
        expect(r.chartHealth.bondedCount).toBe(2)
        expect(r.chartHealth.okCount).toBe(1)
        expect(r.chartHealth.unhealthy).toHaveLength(1)
        expect(r.chartHealth.unhealthy[0]).toMatchObject({
            fileId: "upload-michamocha",
            status: "missing",
        })

        // Nothing was dispatched and the setlist was NOT mutated.
        const post = (await db().collection("setlists").doc(id).get()).data()!
        expect(post.publishedAt).toBeFalsy()
        expect(mockSendPushToUsers).not.toHaveBeenCalled()
        expect(mockEmailAllMembers).not.toHaveBeenCalled()
    })

    it("dryRun returns the chartHealth report even when all charts ok", async () => {
        const id = "set-pub-dry-health"
        await seedPublishableSetlist(id)

        // Restore the file-scope default (previous tests overrode it with
        // an implementation that surfaces "missing" for non-osehshalom ids).
        mockGetChartHealth.mockReset()
        mockGetChartHealth.mockResolvedValue({
            status: "ok",
            source: "firebase-storage",
        })

        const r = await publishSetlist(ADMIN, {
            setlistId: id,
            dryRun: true,
        })
        expect("ok" in r && r.ok).toBe(true)
        if (!("ok" in r) || !r.ok) return

        expect(r.chartHealth.bondedCount).toBe(2)
        expect(r.chartHealth.okCount).toBe(2)
        // F-006: clean-state aggregates are both zero.
        expect(r.chartHealth.missingCount).toBe(0)
        expect(r.chartHealth.unreachableCount).toBe(0)
        // b5 followup: clean-state needsSyncCount is zero too.
        expect(r.chartHealth.needsSyncCount).toBe(0)
        expect(r.chartHealth.unhealthy).toEqual([])
    })

    it("needs_storage_sync surfaces in chartHealth.needsSyncCount; publish does NOT refuse (b5 followup)", async () => {
        // Cycle-3 b5 mirror of verify_setlist_charts' NEW-5 field. A chart
        // in Drive but not yet in Storage SERVES via file-fetcher Drive
        // fallback, so publish proceeds without `force`. The count flows
        // through so callers can flag mid-resolving rows alongside the
        // publish report.
        const id = "set-pub-needs-sync"
        await seedPublishableSetlist(id)

        mockGetChartHealth.mockImplementation(async (fileId: string) =>
            fileId === "upload-osehshalom"
                ? { status: "ok", source: "firebase-storage" as const }
                : {
                      status: "needs_storage_sync" as const,
                      reason: "drive_only",
                      mimeType: "application/pdf",
                  },
        )

        const r = await publishSetlist(ADMIN, { setlistId: id })
        expect("ok" in r && r.ok).toBe(true)
        if (!("ok" in r) || !r.ok) return

        expect(r.chartHealth.bondedCount).toBe(2)
        expect(r.chartHealth.okCount).toBe(1)
        expect(r.chartHealth.missingCount).toBe(0)
        expect(r.chartHealth.unreachableCount).toBe(0)
        expect(r.chartHealth.needsSyncCount).toBe(1)
        // needs_storage_sync is NOT unhealthy — chart still renders.
        expect(r.chartHealth.unhealthy).toEqual([])

        // Publish actually went through — no refuse, no force needed.
        const post = (await db().collection("setlists").doc(id).get()).data()!
        expect(post.publishedAt).toBeTruthy()
    })
})
