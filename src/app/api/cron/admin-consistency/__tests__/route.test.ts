/**
 * GET /api/cron/admin-consistency — admin claim drift check
 *   + PGR-03 storage-backup staleness alarm
 *   + PGR-04 library_index bytes-present invariant alarm.
 *
 * Mocked Firestore + Auth so we can drive the route across the
 * fresh / stale / recent-error / both / missing matrix and assert
 * which captureMessage calls fired with which level + extras.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { makeReq } from "@/__tests__/api-test-helpers"

const HOUR = 60 * 60 * 1000
const NOW = new Date("2026-05-23T22:00:00Z").getTime()

// ── Firestore mock — collection-aware so we can vary admins + storageBackup ──
let storageBackupDoc: Record<string, unknown> | null = null
let storageBackupExists = false
let storageBackupReadThrows = false
let adminUids: string[] = []
let libraryIndexDocs: Array<{ id: string; data: Record<string, unknown> }> = []
let libraryIndexReadThrows = false

const mockFirestore = {
    collection: vi.fn((name: string) => {
        if (name === "config") {
            return {
                doc: (id: string) => ({
                    get: async () => {
                        if (id === "admins") {
                            return { data: () => ({ uids: adminUids }) }
                        }
                        if (id === "storageBackup") {
                            if (storageBackupReadThrows) {
                                throw new Error("firestore read transient failure")
                            }
                            return {
                                exists: storageBackupExists,
                                data: () => storageBackupDoc ?? undefined,
                            }
                        }
                        return { data: () => undefined }
                    },
                }),
            }
        }
        if (name === "library_index") {
            // Build a chainable where/orderBy/limit query that yields whatever
            // libraryIndexDocs we've seeded. Order/limit are honored opaquely
            // (the route trusts Firestore — the helper does the verdict math).
            const query = {
                where: () => query,
                orderBy: () => query,
                limit: () => query,
                get: async () => {
                    if (libraryIndexReadThrows) {
                        throw new Error("firestore library_index read failed")
                    }
                    return {
                        size: libraryIndexDocs.length,
                        docs: libraryIndexDocs.map((d) => ({
                            id: d.id,
                            data: () => d.data,
                        })),
                    }
                },
            }
            return query
        }
        return { doc: () => ({ get: async () => ({ data: () => undefined }) }) }
    }),
}

// ── Storage bucket mock — drive missing/present + outage cases ──────────────
let bucketPresent: Set<string> = new Set()
let bucketInitThrows = false
const getFilesMock = vi.fn(async ({ prefix }: { prefix: string }) => {
    const id = prefix.replace(/^library\//, "")
    if (bucketPresent.has(id)) return [[{ name: `library/${id}.pdf` }]]
    return [[]]
})

vi.mock("firebase-admin/storage", () => ({
    getStorage: vi.fn(() => {
        if (bucketInitThrows) throw new Error("storage init failed")
        return { bucket: () => ({ getFiles: getFilesMock }) }
    }),
}))

const getUserMock = vi.fn(async (uid: string) => ({
    uid,
    customClaims: { role: "admin" },
}))

vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: vi.fn().mockReturnValue(true),
    getFirestore: vi.fn(() => mockFirestore),
    getAuth: vi.fn(() => ({ getUser: getUserMock })),
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

import { GET } from "../route"

const SECRET = "test-secret"

beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    captureMessageMock.mockClear()
    captureExceptionMock.mockClear()
    getUserMock.mockClear()
    getFilesMock.mockClear()
    adminUids = []
    storageBackupDoc = null
    storageBackupExists = false
    storageBackupReadThrows = false
    libraryIndexDocs = []
    libraryIndexReadThrows = false
    bucketPresent = new Set()
    bucketInitThrows = false
})

describe("GET /api/cron/admin-consistency — auth", () => {
    it("401s without Authorization", async () => {
        const res = await GET(makeReq("/api/cron/admin-consistency"))
        expect(res.status).toBe(401)
    })

    it("401s with wrong bearer", async () => {
        const res = await GET(
            makeReq("/api/cron/admin-consistency", { token: "wrong" }),
        )
        expect(res.status).toBe(401)
    })
})

describe("PGR-03 — storage backup staleness alarm", () => {
    it("no Sentry call when config/storageBackup is missing", async () => {
        storageBackupExists = false
        const res = await GET(
            makeReq("/api/cron/admin-consistency", { token: SECRET }),
        )
        expect(res.status).toBe(200)
        const json = (await res.json()) as {
            storageBackupHealth: { status: string }
        }
        expect(json.storageBackupHealth.status).toBe("missing")
        expect(captureMessageMock).not.toHaveBeenCalled()
    })

    it("no Sentry call when backup is fresh (no error)", async () => {
        storageBackupExists = true
        storageBackupDoc = { lastBackupAt: NOW - 10 * HOUR }
        const res = await GET(
            makeReq("/api/cron/admin-consistency", { token: SECRET }),
        )
        expect(res.status).toBe(200)
        const json = (await res.json()) as {
            storageBackupHealth: {
                status: string
                stale: boolean
                stalenessHours: number
            }
        }
        expect(json.storageBackupHealth.status).toBe("present")
        expect(json.storageBackupHealth.stale).toBe(false)
        expect(captureMessageMock).not.toHaveBeenCalled()
    })

    it("captures a 'warning' for stale backup (>36h)", async () => {
        storageBackupExists = true
        storageBackupDoc = { lastBackupAt: NOW - 48 * HOUR }
        await GET(makeReq("/api/cron/admin-consistency", { token: SECRET }))
        expect(captureMessageMock).toHaveBeenCalledTimes(1)
        const [msg, ctx, level] = captureMessageMock.mock.calls[0]
        expect(msg).toMatch(/storage backup stale/i)
        expect(ctx).toMatchObject({
            source: "cron",
            location: "admin-consistency",
        })
        expect(ctx.extra.stalenessHours).toBeCloseTo(48, 0)
        expect(level).toBe("warning")
    })

    it("captures an 'error' for a recent lastError", async () => {
        storageBackupExists = true
        storageBackupDoc = {
            lastBackupAt: NOW - 10 * HOUR,
            lastError: "DriveClient threw 403",
            lastErrorAt: NOW - 4 * HOUR,
        }
        await GET(makeReq("/api/cron/admin-consistency", { token: SECRET }))
        expect(captureMessageMock).toHaveBeenCalledTimes(1)
        const [msg, ctx, level] = captureMessageMock.mock.calls[0]
        expect(msg).toMatch(/last run failed.*DriveClient threw 403/i)
        expect(ctx.extra.lastError).toBe("DriveClient threw 403")
        expect(level).toBe("error")
    })

    it("captures BOTH a warning AND an error when stale + recent error coincide", async () => {
        storageBackupExists = true
        storageBackupDoc = {
            lastBackupAt: NOW - 48 * HOUR,
            lastError: "drive 500",
            lastErrorAt: NOW - 4 * HOUR,
        }
        await GET(makeReq("/api/cron/admin-consistency", { token: SECRET }))
        expect(captureMessageMock).toHaveBeenCalledTimes(2)
        const levels = captureMessageMock.mock.calls.map((c) => c[2])
        expect(levels).toEqual(expect.arrayContaining(["warning", "error"]))
    })

    it("does NOT alarm staleness alone if there is no lastBackupAt yet", async () => {
        // Doc exists with only an error and no successful run.  This is PGR-01
        // territory (cron never ran), not PGR-03.  We still alarm the error
        // (recentError) but NOT staleness.
        storageBackupExists = true
        storageBackupDoc = {
            lastError: "first-run boom",
            lastErrorAt: NOW - 2 * HOUR,
        }
        await GET(makeReq("/api/cron/admin-consistency", { token: SECRET }))
        const levels = captureMessageMock.mock.calls.map((c) => c[2])
        expect(levels).toContain("error")
        expect(levels).not.toContain("warning")
    })

    it("reports storageBackupHealth='unavailable' when the Firestore read throws", async () => {
        storageBackupExists = true
        storageBackupReadThrows = true
        const res = await GET(
            makeReq("/api/cron/admin-consistency", { token: SECRET }),
        )
        expect(res.status).toBe(200)
        const json = (await res.json()) as {
            storageBackupHealth: { status: string }
        }
        expect(json.storageBackupHealth.status).toBe("unavailable")
        expect(captureMessageMock).not.toHaveBeenCalled()
    })
})

describe("admin-claim drift (regression — existing v4.3 C02 behavior preserved)", () => {
    it("returns drift=[] + storageBackupHealth when admins are consistent", async () => {
        adminUids = ["uid-a", "uid-b"]
        getUserMock.mockImplementation(async (uid) => ({
            uid,
            customClaims: { role: "admin" },
        }))
        storageBackupExists = true
        storageBackupDoc = { lastBackupAt: NOW - 10 * HOUR }
        const res = await GET(
            makeReq("/api/cron/admin-consistency", { token: SECRET }),
        )
        expect(res.status).toBe(200)
        const json = (await res.json()) as {
            checked: number
            drift: unknown[]
            storageBackupHealth: { status: string }
        }
        expect(json.checked).toBe(2)
        expect(json.drift).toEqual([])
        expect(json.storageBackupHealth.status).toBe("present")
    })

    it("captures admin-drift via captureMessage when a uid lacks the claim", async () => {
        adminUids = ["uid-good", "uid-bad"]
        getUserMock.mockImplementation(async (uid) =>
            uid === "uid-bad"
                ? { uid, customClaims: { role: "member" } }
                : { uid, customClaims: { role: "admin" } },
        )
        const res = await GET(
            makeReq("/api/cron/admin-consistency", { token: SECRET }),
        )
        expect(res.status).toBe(200)
        const json = (await res.json()) as { drift: Array<{ uid: string }> }
        expect(json.drift).toHaveLength(1)
        expect(json.drift[0].uid).toBe("uid-bad")
        // captureMessage fires for drift (no level → default "warning")
        const driftCall = captureMessageMock.mock.calls.find((c) =>
            String(c[0]).includes("claim drift"),
        )
        expect(driftCall).toBeTruthy()
    })
})

describe("PGR-04 — library_index bytes-present invariant alarm", () => {
    const lib = (fileId: string, ageHours = 1) => ({
        id: fileId,
        data: { lastSyncedAt: NOW - ageHours * HOUR },
    })

    it("no Sentry call when every sampled row has bytes", async () => {
        libraryIndexDocs = [lib("a"), lib("b"), lib("c")]
        bucketPresent = new Set(["a", "b", "c"])
        const res = await GET(
            makeReq("/api/cron/admin-consistency", { token: SECRET }),
        )
        expect(res.status).toBe(200)
        const json = (await res.json()) as {
            libraryBytesHealth: {
                status: string
                missingCount: number
                verdict: string
            }
        }
        expect(json.libraryBytesHealth.status).toBe("ok")
        expect(json.libraryBytesHealth.missingCount).toBe(0)
        expect(json.libraryBytesHealth.verdict).toBe("healthy")
        const pgr04 = captureMessageMock.mock.calls.find((c) =>
            String(c[0]).includes("library_index"),
        )
        expect(pgr04).toBeFalsy()
    })

    it("captures a 'warning' when missing fraction is below 5%", async () => {
        // 100 rows, 4 missing — under the 5% (=5) error threshold.
        libraryIndexDocs = Array.from({ length: 100 }, (_, i) => lib(`f${i}`))
        bucketPresent = new Set(
            Array.from({ length: 96 }, (_, i) => `f${i + 4}`),
        )
        const res = await GET(
            makeReq("/api/cron/admin-consistency", { token: SECRET }),
        )
        expect(res.status).toBe(200)
        const pgr04 = captureMessageMock.mock.calls.find((c) =>
            String(c[0]).includes("library_index"),
        )
        expect(pgr04).toBeTruthy()
        const [msg, ctx, level] = pgr04!
        expect(msg).toMatch(/library_index bytes missing.*4 of 100/i)
        expect(ctx).toMatchObject({
            source: "cron",
            location: "admin-consistency",
        })
        expect(ctx.extra.subsystem).toBe("library-bytes-health")
        expect(ctx.extra.missingCount).toBe(4)
        expect(ctx.extra.scanned).toBe(100)
        expect(ctx.extra.missing).toHaveLength(4)
        expect(level).toBe("warning")
    })

    it("captures an 'error' when missing fraction reaches 5%", async () => {
        // 100 rows, 5 missing — at the threshold.
        libraryIndexDocs = Array.from({ length: 100 }, (_, i) => lib(`f${i}`))
        bucketPresent = new Set(
            Array.from({ length: 95 }, (_, i) => `f${i + 5}`),
        )
        await GET(makeReq("/api/cron/admin-consistency", { token: SECRET }))
        const pgr04 = captureMessageMock.mock.calls.find((c) =>
            String(c[0]).includes("library_index"),
        )
        expect(pgr04).toBeTruthy()
        const [msg, , level] = pgr04!
        expect(msg).toMatch(/library_index bytes blast.*5 of 100/i)
        expect(level).toBe("error")
    })

    it("includes oldestMissing + age in the Sentry extras", async () => {
        // 100 rows; only the oldest two missing (so the oldest age dominates).
        libraryIndexDocs = Array.from({ length: 100 }, (_, i) =>
            lib(`f${i}`, i + 1),
        )
        bucketPresent = new Set(
            Array.from({ length: 98 }, (_, i) => `f${i}`),
        )
        await GET(makeReq("/api/cron/admin-consistency", { token: SECRET }))
        const pgr04 = captureMessageMock.mock.calls.find((c) =>
            String(c[0]).includes("library_index"),
        )
        expect(pgr04).toBeTruthy()
        const [, ctx] = pgr04!
        // Oldest missing fileId is f99 → 100h ago.
        expect(ctx.extra.oldestMissingAgeHours).toBeCloseTo(100, 0)
    })

    it("reports libraryBytesHealth='unavailable' when library_index read throws", async () => {
        libraryIndexReadThrows = true
        const res = await GET(
            makeReq("/api/cron/admin-consistency", { token: SECRET }),
        )
        expect(res.status).toBe(200)
        const json = (await res.json()) as {
            libraryBytesHealth: { status: string }
        }
        expect(json.libraryBytesHealth.status).toBe("unavailable")
        // PGR-03 may have fired its own captures unrelated to PGR-04; make
        // sure no PGR-04 message slipped through on a read failure.
        const pgr04 = captureMessageMock.mock.calls.find((c) =>
            String(c[0]).includes("library_index"),
        )
        expect(pgr04).toBeFalsy()
    })

    it("reports libraryBytesHealth='unavailable' when the Storage bucket init throws", async () => {
        libraryIndexDocs = [lib("a")]
        bucketInitThrows = true
        const res = await GET(
            makeReq("/api/cron/admin-consistency", { token: SECRET }),
        )
        expect(res.status).toBe(200)
        const json = (await res.json()) as {
            libraryBytesHealth: { status: string }
        }
        expect(json.libraryBytesHealth.status).toBe("unavailable")
        const pgr04 = captureMessageMock.mock.calls.find((c) =>
            String(c[0]).includes("library_index"),
        )
        expect(pgr04).toBeFalsy()
    })

    it("PGR-03 + PGR-04 alarms can co-fire on a really bad day", async () => {
        // PGR-03: backup stale + recent error
        storageBackupExists = true
        storageBackupDoc = {
            lastBackupAt: NOW - 48 * HOUR,
            lastError: "boom",
            lastErrorAt: NOW - 4 * HOUR,
        }
        // PGR-04: 100 rows, all missing → error
        libraryIndexDocs = Array.from({ length: 100 }, (_, i) => lib(`f${i}`))
        bucketPresent = new Set()

        await GET(makeReq("/api/cron/admin-consistency", { token: SECRET }))
        const subjects = captureMessageMock.mock.calls.map((c) => String(c[0]))
        expect(subjects.some((s) => /storage backup stale/i.test(s))).toBe(true)
        expect(subjects.some((s) => /storage backup last run failed/i.test(s))).toBe(
            true,
        )
        expect(subjects.some((s) => /library_index bytes blast/i.test(s))).toBe(
            true,
        )
    })
})
