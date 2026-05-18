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

// publishSetlist HEAD-probes every bonded chart via getChartHealth before it
// commits. In the emulator there's no Storage backing, so default the mock to
// "ok" — the dryRun test only cares about default-audience derivation, not the
// chart-health code path.
const mockGetChartHealth = vi.fn().mockResolvedValue({
    status: "ok",
    source: "firebase-storage",
})
vi.mock("@/lib/file-fetcher", () => ({
    getChartHealth: (...args: unknown[]) => mockGetChartHealth(...args),
    fetchFileById: vi.fn(),
}))
vi.mock("@/lib/rate-limit", () => ({
    checkUserRateLimit: vi.fn().mockResolvedValue(null),
    checkRateLimit: vi.fn().mockResolvedValue(null),
}))
// Side-effecting publish helpers — dryRun returns BEFORE these fire, but the
// mocks guard against unintended imports / side effects under emulator runs.
vi.mock("@/lib/email", () => ({
    emailAllMembers: vi
        .fn()
        .mockResolvedValue({ sent: 0, failed: 0, errors: [], messageIds: [] }),
}))
vi.mock("@/lib/push-send", () => ({
    sendPushToUsers: vi.fn().mockResolvedValue({ sent: 0, failed: 0 }),
}))
vi.mock("@/lib/sms", () => ({ sendSMS: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/song-usage", () => ({
    recordSongUsage: vi.fn().mockResolvedValue({ recorded: 0, skipped: 0 }),
}))

import { listSetlists } from "../tools/setlists"
import { listServicePersonnel } from "../tools/service-personnel"
import { createSetlist, addTrackToSetlist } from "../tools/setlist-write"
import { getAiConfig } from "../tools/ai-config"
import { publishSetlist } from "../tools/setlist-publish"

/**
 * Cycle-5 fixes Lane 5 — coverage for the read/shape changes that don't
 * already live in a tool-specific emulator file:
 *  - list_setlists publishedAt field + sort discriminant (C5C-010 + C5C-011)
 *  - publish_setlist default-audience test-* filter (C5C-005)
 *  - list_service_personnel new MCP tool (C5C-014)
 *  - get_ai_config provider discriminant + post-Gemini-swap key shape
 *    (C5A-B4-aien)
 *
 * Pure unit tests for the rich-envelope conformance (api-auth.ts +
 * login proxy intercept + caller-context helper) live next to the source
 * (api-auth.test.ts, proxy unit test below, caller-context.test.ts).
 *
 * Runs only via `npm run test:emulator` (the Firestore-emulator wrapper).
 */
describe("Cycle-5 Lane 5 — list_setlists / publish / service-personnel / ai-config (emulator)", () => {
    let app: App
    const ADMIN = "rabbi-daniel"
    const LEADER = "randy"
    const MEMBER = "guest-member"

    function db() {
        return getFirestore(app)
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-cycle5-lane5" })
        await db()
            .collection("users")
            .doc(ADMIN)
            .set({ displayName: "Rabbi Daniel", role: "admin", email: "rabbi@example.com" })
        await db()
            .collection("users")
            .doc(LEADER)
            .set({ displayName: "Randy", role: "band_leader", email: "randy@example.com" })
        await db()
            .collection("users")
            .doc(MEMBER)
            .set({ displayName: "Guest", role: "member", email: "guest@example.com" })
        await db()
            .collection("songs")
            .doc("song-oseh")
            .set({ title: "Oseh Shalom.pdf", key: "G", leadMusician: "Cantor", fileName: "Oseh Shalom.pdf" })
    })

    afterAll(async () => {
        if (app) await deleteApp(app)
    })

    beforeEach(async () => {
        // Reset the working collections between tests but keep seed users + songs.
        const drop = async (col: string) => {
            const snap = await db().collection(col).get()
            const batch = db().batch()
            snap.docs.forEach((d) => batch.delete(d.ref))
            if (snap.docs.length) await batch.commit()
        }
        await drop("setlists")
        await drop("tracks")
    })

    // ─── C5C-010 + C5C-011: list_setlists sort + publishedAt ─────────────

    describe("C5C-010 + C5C-011 — list_setlists sort + publishedAt", () => {
        async function seedSetlist(
            id: string,
            opts: {
                name: string
                date: Date
                eventDate: Date
                publishedAt?: string | null
            },
        ) {
            const payload: Record<string, unknown> = {
                id,
                name: opts.name,
                date: opts.date,
                eventDate: opts.eventDate,
                ownerId: ADMIN,
                ownerName: "Rabbi Daniel",
                trackCount: 0,
                isTest: false,
            }
            if (opts.publishedAt !== undefined) {
                payload.publishedAt =
                    opts.publishedAt === null ? null : opts.publishedAt
            }
            await db().collection("setlists").doc(id).set(payload)
        }

        it("publishedAt surfaces on the row (ISO string or null)", async () => {
            await seedSetlist("s-published", {
                name: "Published",
                date: new Date("2026-05-01T10:00:00Z"),
                eventDate: new Date("2026-05-15T19:00:00Z"),
                publishedAt: "2026-05-10T12:00:00.000Z",
            })
            await seedSetlist("s-unpublished", {
                name: "Unpublished",
                date: new Date("2026-05-02T10:00:00Z"),
                eventDate: new Date("2026-05-16T19:00:00Z"),
            })

            const rows = (await listSetlists(ADMIN, {})) as Array<{
                id: string
                publishedAt: string | null
            }>
            expect(Array.isArray(rows)).toBe(true)
            const byId = new Map(rows.map((r) => [r.id, r]))
            expect(byId.get("s-published")?.publishedAt).toBe("2026-05-10T12:00:00.000Z")
            expect(byId.get("s-unpublished")?.publishedAt).toBeNull()
        })

        it("default sort orders by date desc (recent_write back-compat)", async () => {
            await seedSetlist("s-old-doc-future-event", {
                name: "Old Doc Future Event",
                date: new Date("2026-04-01T10:00:00Z"),
                eventDate: new Date("2026-08-15T19:00:00Z"),
            })
            await seedSetlist("s-new-doc-past-event", {
                name: "New Doc Past Event",
                date: new Date("2026-05-05T10:00:00Z"),
                eventDate: new Date("2026-03-15T19:00:00Z"),
            })

            const rows = (await listSetlists(ADMIN, {})) as Array<{ id: string }>
            // recent_write default: newer write timestamp wins regardless of eventDate.
            expect(rows[0].id).toBe("s-new-doc-past-event")
            expect(rows[1].id).toBe("s-old-doc-future-event")
        })

        it("sort='recent_event' orders by eventDate desc", async () => {
            await seedSetlist("s-old-doc-future-event", {
                name: "Old Doc Future Event",
                date: new Date("2026-04-01T10:00:00Z"),
                eventDate: new Date("2026-08-15T19:00:00Z"),
            })
            await seedSetlist("s-new-doc-past-event", {
                name: "New Doc Past Event",
                date: new Date("2026-05-05T10:00:00Z"),
                eventDate: new Date("2026-03-15T19:00:00Z"),
            })

            const rows = (await listSetlists(ADMIN, { sort: "recent_event" })) as Array<{
                id: string
            }>
            // recent_event: future eventDate wins regardless of when the doc was written.
            expect(rows[0].id).toBe("s-old-doc-future-event")
            expect(rows[1].id).toBe("s-new-doc-past-event")
        })
    })

    // ─── C5C-014: list_service_personnel ─────────────────────────────────

    describe("C5C-014 — list_service_personnel", () => {
        async function seedSetlistWithTracks(opts: {
            id: string
            name: string
            eventDate: Date
            vocalLeads: (string | null)[]
        }) {
            await db()
                .collection("setlists")
                .doc(opts.id)
                .set({
                    id: opts.id,
                    name: opts.name,
                    eventDate: opts.eventDate,
                    ownerId: ADMIN,
                    ownerName: "Rabbi Daniel",
                    trackCount: opts.vocalLeads.length,
                    isTest: false,
                })
            const batch = db().batch()
            opts.vocalLeads.forEach((lead, idx) => {
                const trackId = `${opts.id}-t${idx}`
                const payload: Record<string, unknown> = {
                    id: trackId,
                    setlistId: opts.id,
                    order: idx,
                    type: "song",
                    title: `Song ${idx}`,
                }
                if (lead !== null) payload.leadMusician = lead
                batch.set(db().collection("tracks").doc(trackId), payload)
            })
            await batch.commit()
        }

        async function seedAssignment(opts: {
            assignmentId: string
            setlistId: string
            setlistName: string
            musicianUid: string
            musicianName: string
            instrument: string | null
            status: "pending" | "confirmed" | "declined" | "cancelled"
        }) {
            await db().collection("scheduling_assignments").doc(opts.assignmentId).set(opts)
        }

        beforeEach(async () => {
            const snap = await db().collection("scheduling_assignments").get()
            const batch = db().batch()
            snap.docs.forEach((d) => batch.delete(d.ref))
            if (snap.docs.length) await batch.commit()
        })

        it("by setlistId — returns matched setlist, grouped assignments + distinct vocal_leads", async () => {
            await seedSetlistWithTracks({
                id: "set-friday",
                name: "Friday Night",
                eventDate: new Date("2026-06-12T19:00:00Z"),
                vocalLeads: ["Cantor", "Daniel", "Cantor", null, "Daniel"],
            })
            await seedAssignment({
                assignmentId: "a1",
                setlistId: "set-friday",
                setlistName: "Friday Night",
                musicianUid: "musician-a",
                musicianName: "Alice",
                instrument: "voice",
                status: "confirmed",
            })
            await seedAssignment({
                assignmentId: "a2",
                setlistId: "set-friday",
                setlistName: "Friday Night",
                musicianUid: "musician-b",
                musicianName: "Bob",
                instrument: "acoustic_guitar",
                status: "pending",
            })

            const r = (await listServicePersonnel(ADMIN, {
                setlistId: "set-friday",
            })) as {
                ok: true
                matchedSetlists: { id: string }[]
                scheduling_assignments: {
                    pending: Array<{ musicianUid: string }>
                    confirmed: Array<{ musicianUid: string }>
                    declined: Array<unknown>
                    cancelled: Array<unknown>
                }
                vocal_leads: string[]
                total: number
            }
            expect(r.ok).toBe(true)
            expect(r.matchedSetlists.map((s) => s.id)).toEqual(["set-friday"])
            expect(r.scheduling_assignments.confirmed.map((a) => a.musicianUid)).toEqual([
                "musician-a",
            ])
            expect(r.scheduling_assignments.pending.map((a) => a.musicianUid)).toEqual([
                "musician-b",
            ])
            // distinct + alphabetical
            expect(r.vocal_leads).toEqual(["Cantor", "Daniel"])
            expect(r.total).toBe(2)
        })

        it("by eventDate — joins every setlist on the UTC day", async () => {
            await seedSetlistWithTracks({
                id: "set-morning",
                name: "Shabbat Morning",
                eventDate: new Date("2026-06-13T10:00:00Z"),
                vocalLeads: ["Cantor"],
            })
            await seedSetlistWithTracks({
                id: "set-evening",
                name: "Shabbat Evening",
                eventDate: new Date("2026-06-13T19:00:00Z"),
                vocalLeads: ["Daniel"],
            })
            const r = (await listServicePersonnel(ADMIN, {
                eventDate: "2026-06-13",
            })) as { ok: true; matchedSetlists: { id: string }[]; vocal_leads: string[] }
            expect(new Set(r.matchedSetlists.map((s) => s.id))).toEqual(
                new Set(["set-morning", "set-evening"]),
            )
            // distinct vocal leads across both setlists, alphabetical
            expect(r.vocal_leads).toEqual(["Cantor", "Daniel"])
        })

        it("refuses callers without admin/band_leader (forbidden_role)", async () => {
            await seedSetlistWithTracks({
                id: "set-x",
                name: "X",
                eventDate: new Date("2026-06-14T19:00:00Z"),
                vocalLeads: [],
            })
            const r = await listServicePersonnel(MEMBER, { setlistId: "set-x" })
            expect("ok" in r && r.ok === false).toBe(true)
            if ("ok" in r && r.ok === false) {
                expect((r.error as { machine_code: string }).machine_code).toBe(
                    "forbidden_role",
                )
            }
        })

        it("requires setlistId OR eventDate (invalid_argument otherwise)", async () => {
            const r = await listServicePersonnel(ADMIN, {} as { setlistId?: string })
            expect("ok" in r && r.ok === false).toBe(true)
            if ("ok" in r && r.ok === false) {
                expect((r.error as { machine_code: string }).machine_code).toBe(
                    "invalid_argument",
                )
            }
        })
    })

    // ─── C5C-005: publish_setlist test-* default-audience filter ─────────

    describe("C5C-005 — publish_setlist default-audience filters test-* uids", () => {
        beforeEach(async () => {
            // Seed users including a test-* row that must NOT receive the default audience.
            await db()
                .collection("users")
                .doc("test-bot-musician")
                .set({
                    displayName: "[TEST] Bot",
                    role: "musician",
                    email: "bot@test.example",
                })
            await db()
                .collection("users")
                .doc("real-musician")
                .set({
                    displayName: "Real Musician",
                    role: "musician",
                    email: "real@example.com",
                })
        })

        async function seedPublishableSetlist(): Promise<string> {
            const created = (await createSetlist(ADMIN, {
                name: "Service A",
                eventDate: "2026-06-20",
            })) as { setlistId: string }
            await addTrackToSetlist(ADMIN, {
                setlistId: created.setlistId,
                songId: "song-oseh",
            })
            // mark the chart healthy so publishSetlist doesn't refuse on chart-health.
            await db().collection("library_index").doc("song-oseh").set({
                fileId: "song-oseh",
                name: "Oseh Shalom.pdf",
                mimeType: "application/pdf",
                fileSize: 1024,
                status: "active",
                hasStorageObject: true,
            })
            return created.setlistId
        }

        it("dryRun default-audience derivation excludes test-* uids", async () => {
            const setlistId = await seedPublishableSetlist()
            const r = (await publishSetlist(ADMIN, {
                setlistId,
                audience: "band",
                dryRun: true,
                force: true,
            })) as {
                ok: true
                recipientCount: number
                recipients?: Array<{ uid: string }>
            }
            // The shape varies slightly across the codebase; the load-bearing
            // assertion is that no test-* uid appears in the audience.
            const json = JSON.stringify(r)
            expect(json).not.toContain("test-bot-musician")
            // Real musician should still be derivable in the default audience.
            expect(json).toContain("real-musician")
        })
    })

    // ─── C5A-B4-aien: get_ai_config provider discriminant ────────────────

    describe("C5A-B4-aien — get_ai_config provider discriminant", () => {
        const ORIGINAL_GEMINI_KEY = process.env.GEMINI_API_KEY
        afterAll(() => {
            if (ORIGINAL_GEMINI_KEY === undefined) {
                delete process.env.GEMINI_API_KEY
            } else {
                process.env.GEMINI_API_KEY = ORIGINAL_GEMINI_KEY
            }
        })

        it("returns provider:'gemini' when GEMINI_API_KEY is set", async () => {
            process.env.GEMINI_API_KEY = "test-key-not-real"
            const r = (await getAiConfig(ADMIN)) as {
                ok: true
                provider: "gemini" | "anthropic" | null
                subscriberActive: boolean
            }
            expect(r.ok).toBe(true)
            expect(r.provider).toBe("gemini")
            expect(r.subscriberActive).toBe(true)
        })

        it("returns provider:null when no provider key is set", async () => {
            delete process.env.GEMINI_API_KEY
            const r = (await getAiConfig(ADMIN)) as {
                ok: true
                provider: "gemini" | "anthropic" | null
                subscriberActive: boolean
            }
            expect(r.provider).toBeNull()
            expect(r.subscriberActive).toBe(false)
        })
    })
})
