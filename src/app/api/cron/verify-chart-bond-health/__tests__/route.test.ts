/**
 * GET /api/cron/verify-chart-bond-health — scope filter regression.
 *
 * Locks in the 2026-05-28 `[[feedback_err_public_not_gated]]` widening: the
 * cron must sweep every upcoming non-test setlist, not just historically-
 * published ones. Specifically:
 *
 *   1. `publishedAt:null` setlists with upcoming `eventDate` ARE in scope
 *      (regression test for the dropped `.where("publishedAt","!=",null)`
 *      filter — Saturday B'nei Mitzvah `cd2010f4` shape).
 *   2. `isTest:true` rows remain excluded.
 *   3. Test-uid-owned rows remain excluded (Cycle-7 belt-and-braces).
 *   4. Past-event setlists are still skipped (in-process upcoming-only).
 *   5. The Firestore query no longer applies a server-side `where`
 *      (in-process filtering avoids Firestore's `!=`-drops-absent-field quirk
 *      and the publishedAt index coupling).
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { makeReq } from "@/__tests__/api-test-helpers"

interface SetlistFixture {
    id: string
    data: Record<string, unknown>
}

let setlistFixtures: SetlistFixture[] = []
const setlistsWhereSpy = vi.fn()
const alertWrites: Array<Record<string, unknown>> = []

const mockFirestore = {
    collection: vi.fn((name: string) => {
        if (name === "setlists") {
            const query = {
                where: (...args: unknown[]) => {
                    setlistsWhereSpy(...args)
                    return query
                },
                get: async () => ({
                    docs: setlistFixtures.map((f) => ({
                        id: f.id,
                        data: () => f.data,
                    })),
                }),
            }
            return query
        }
        if (name === "chart_bond_alerts") {
            return {
                add: async (payload: Record<string, unknown>) => {
                    alertWrites.push(payload)
                    return { id: `alert-${alertWrites.length}` }
                },
            }
        }
        return {}
    }),
}

vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: vi.fn().mockReturnValue(true),
    getFirestore: vi.fn(() => mockFirestore),
}))

vi.mock("@/lib/logger", () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

const { captureMessageMock, captureExceptionMock } = vi.hoisted(() => ({
    captureMessageMock: vi.fn(),
    captureExceptionMock: vi.fn(),
}))
vi.mock("@/lib/error-reporting", () => ({
    captureMessage: captureMessageMock,
    captureException: captureExceptionMock,
}))

vi.mock("@/env.mjs", () => ({
    env: { CRON_SECRET: "test-secret" },
}))

// recomputeTrackCount is a no-op for these scope tests — we're locking the
// candidate-set shape, not the inline-repair side effect.
vi.mock("@/lib/setlist-track-count", () => ({
    recomputeTrackCount: vi.fn(async () => ({
        drifted: false,
        written: false,
        declared: 0,
        actual: 0,
    })),
}))

// verifySetlistCharts returns a healthy stub for every surveyed setlist; the
// scope tests assert which setlists got surveyed, not the alert math.
const { verifyMock } = vi.hoisted(() => ({
    verifyMock: vi.fn(async (_uid: string, args: { setlistId: string }) => ({
        ok: true as const,
        setlistId: args.setlistId,
        trackCount: 10,
        bondedCount: 10,
        okCount: 10,
        missingCount: 0,
        needsSyncCount: 0,
        shortcutUnresolvedCount: 0,
        phantomBonds: 0,
        rows: [],
    })),
}))
vi.mock("@/lib/mcp/tools/library-verify", () => ({
    verifySetlistCharts: verifyMock,
}))

import { GET } from "../route"

const SECRET = "test-secret"
const NOW = new Date("2026-05-28T12:00:00Z").getTime()

function setlist(
    id: string,
    overrides: Partial<Record<string, unknown>> = {},
): SetlistFixture {
    return {
        id,
        data: {
            name: id,
            ownerId: "prod-uid-aaaa1111",
            ...overrides,
        },
    }
}

beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    setlistFixtures = []
    alertWrites.length = 0
    setlistsWhereSpy.mockClear()
    captureMessageMock.mockClear()
    captureExceptionMock.mockClear()
    verifyMock.mockClear()
})

describe("GET /api/cron/verify-chart-bond-health — auth", () => {
    it("401s without Authorization", async () => {
        const res = await GET(
            makeReq("/api/cron/verify-chart-bond-health"),
        )
        expect(res.status).toBe(401)
    })

    it("401s with wrong bearer", async () => {
        const res = await GET(
            makeReq("/api/cron/verify-chart-bond-health", {
                token: "wrong",
            }),
        )
        expect(res.status).toBe(401)
    })
})

describe("scope filter — publishedAt no longer gates the sweep", () => {
    it("includes publishedAt:null setlists with upcoming eventDate (cd2010f4 shape)", async () => {
        setlistFixtures = [
            // The `cd2010f4` Saturday B'nei Mitzvah shape: no publishedAt,
            // upcoming eventDate — under the OLD filter this would be
            // silently excluded.
            setlist("cd2010f4-bnei-mitzvah", {
                publishedAt: null,
                eventDate: "2026-05-30T18:00:00Z",
            }),
            // A historically-published upcoming setlist — always in scope.
            setlist("upcoming-published", {
                publishedAt: "2026-05-01T00:00:00Z",
                eventDate: "2026-05-29T18:00:00Z",
            }),
        ]
        const res = await GET(
            makeReq("/api/cron/verify-chart-bond-health", { token: SECRET }),
        )
        expect(res.status).toBe(200)
        const json = (await res.json()) as { surveyed: number }
        expect(json.surveyed).toBe(2)
        const surveyedIds = verifyMock.mock.calls.map(
            (c) => (c[1] as { setlistId: string }).setlistId,
        )
        expect(surveyedIds).toContain("cd2010f4-bnei-mitzvah")
        expect(surveyedIds).toContain("upcoming-published")
    })

    it("excludes isTest:true rows", async () => {
        setlistFixtures = [
            setlist("prod-upcoming", {
                publishedAt: null,
                eventDate: "2026-05-30T18:00:00Z",
            }),
            setlist("test-fixture", {
                publishedAt: null,
                eventDate: "2026-05-30T18:00:00Z",
                isTest: true,
            }),
        ]
        const res = await GET(
            makeReq("/api/cron/verify-chart-bond-health", { token: SECRET }),
        )
        expect(res.status).toBe(200)
        const json = (await res.json()) as { surveyed: number }
        expect(json.surveyed).toBe(1)
        const surveyedIds = verifyMock.mock.calls.map(
            (c) => (c[1] as { setlistId: string }).setlistId,
        )
        expect(surveyedIds).toEqual(["prod-upcoming"])
    })

    it("excludes test-uid-owned rows (Cycle-7 belt-and-braces)", async () => {
        setlistFixtures = [
            setlist("prod-upcoming", {
                eventDate: "2026-05-30T18:00:00Z",
            }),
            setlist("test-uid-owned", {
                ownerId: "test-band_leader-deadbeef",
                eventDate: "2026-05-30T18:00:00Z",
            }),
            setlist("cycle-probe-owned", {
                ownerId: "c11i1-band_leader-12345678",
                eventDate: "2026-05-30T18:00:00Z",
            }),
        ]
        const res = await GET(
            makeReq("/api/cron/verify-chart-bond-health", { token: SECRET }),
        )
        expect(res.status).toBe(200)
        const json = (await res.json()) as { surveyed: number }
        expect(json.surveyed).toBe(1)
        const surveyedIds = verifyMock.mock.calls.map(
            (c) => (c[1] as { setlistId: string }).setlistId,
        )
        expect(surveyedIds).toEqual(["prod-upcoming"])
    })

    it("still skips past-event setlists", async () => {
        setlistFixtures = [
            setlist("past-event", {
                publishedAt: null,
                eventDate: "2025-12-01T18:00:00Z",
            }),
            setlist("upcoming", {
                publishedAt: null,
                eventDate: "2026-05-30T18:00:00Z",
            }),
        ]
        const res = await GET(
            makeReq("/api/cron/verify-chart-bond-health", { token: SECRET }),
        )
        expect(res.status).toBe(200)
        const json = (await res.json()) as { surveyed: number }
        expect(json.surveyed).toBe(1)
        const surveyedIds = verifyMock.mock.calls.map(
            (c) => (c[1] as { setlistId: string }).setlistId,
        )
        expect(surveyedIds).toEqual(["upcoming"])
    })

    it("includes undated setlists (permanent items)", async () => {
        setlistFixtures = [
            setlist("undated", { publishedAt: null }),
            setlist("upcoming", {
                publishedAt: null,
                eventDate: "2026-05-30T18:00:00Z",
            }),
        ]
        const res = await GET(
            makeReq("/api/cron/verify-chart-bond-health", { token: SECRET }),
        )
        expect(res.status).toBe(200)
        const json = (await res.json()) as { surveyed: number }
        expect(json.surveyed).toBe(2)
    })

    it("issues NO server-side `where` filter on the setlists collection", async () => {
        setlistFixtures = [
            setlist("a", { eventDate: "2026-05-30T18:00:00Z" }),
        ]
        await GET(
            makeReq("/api/cron/verify-chart-bond-health", { token: SECRET }),
        )
        // The filter was dropped in 2026-05-28; reintroducing any server-side
        // `where` (especially `publishedAt != null` or `isTest != true`) risks
        // re-excluding `publishedAt:null` rows or legacy `isTest`-absent
        // setlists. Test-fixture exclusion happens in-process.
        expect(setlistsWhereSpy).not.toHaveBeenCalled()
    })
})
