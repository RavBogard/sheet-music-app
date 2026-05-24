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
let healthBootstrapDoc: Record<string, unknown> | null = null
let healthBootstrapExists = false
const healthBootstrapWrites: Array<{ payload: Record<string, unknown>; merge: boolean }> = []

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
                        if (id === "healthBootstrap") {
                            return {
                                exists: healthBootstrapExists,
                                data: () => healthBootstrapDoc ?? undefined,
                            }
                        }
                        return { data: () => undefined }
                    },
                    set: async (
                        payload: Record<string, unknown>,
                        options?: { merge?: boolean },
                    ) => {
                        if (id === "healthBootstrap") {
                            healthBootstrapWrites.push({
                                payload,
                                merge: !!options?.merge,
                            })
                            // mirror the write so subsequent reads in the same
                            // tick see the stamp
                            healthBootstrapExists = true
                            healthBootstrapDoc = {
                                ...(healthBootstrapDoc ?? {}),
                                ...payload,
                            }
                        }
                    },
                }),
            }
        }
        if (name === "library_index") {
            // Build a chainable where/orderBy/limit query that yields whatever
            // libraryIndexDocs we've seeded. orderBy(field, ...) models
            // Firestore's STRICT-EXCLUDE semantics: docs missing the ordered
            // field are filtered out of the result set (the bug that PGR-04
            // sample-fix targets — `lastSyncedAt` is only stamped on the
            // legacy Drive-sync path, so the upload-{uuid} majority was
            // silently excluded). Where/limit are honored opaquely; the
            // helper does the verdict math.
            const orderByFields: string[] = []
            const query = {
                where: () => query,
                orderBy: (field: string) => {
                    orderByFields.push(field)
                    return query
                },
                limit: () => query,
                get: async () => {
                    if (libraryIndexReadThrows) {
                        throw new Error("firestore library_index read failed")
                    }
                    const filtered = libraryIndexDocs.filter((d) =>
                        orderByFields.every((f) => f in d.data),
                    )
                    return {
                        size: filtered.length,
                        docs: filtered.map((d) => ({
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
    healthBootstrapDoc = null
    healthBootstrapExists = false
    healthBootstrapWrites.length = 0
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

    it("samples upload-{uuid}-shape rows (no lastSyncedAt) alongside Drive-sync rows", async () => {
        // FINDING-2 regression guard. `lastSyncedAt` is written ONLY by
        // syncLibraryIndex (the Drive-sync path). The modern upload path
        // — `upload-{uuid}` doc ids minted by processChartUpload, which
        // is the post-Drive-sync majority — never stamps it. A naive
        // `.orderBy("lastSyncedAt", "desc")` here would silently strict-
        // exclude every upload-{uuid} row, so a future bytes-blast hitting
        // them wouldn't trip PGR-04 regardless of how many vanished. The
        // sample must include both shapes when present in the active set.
        libraryIndexDocs = [
            // Drive-sync shape — bare Drive file id, lastSyncedAt stamped.
            { id: "1AbCdEf_drive_id", data: { lastSyncedAt: NOW - 1 * HOUR } },
            // Modern upload shape — `upload-{uuid}`, no lastSyncedAt.
            { id: "upload-11111111-2222-3333-4444-555555555555", data: {} },
            { id: "upload-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", data: {} },
        ]
        // Drive row has bytes; both upload rows have missing bytes →
        // 2 of 3 missing → verdict = error (well above the 5% threshold).
        bucketPresent = new Set(["1AbCdEf_drive_id"])
        const res = await GET(
            makeReq("/api/cron/admin-consistency", { token: SECRET }),
        )
        expect(res.status).toBe(200)
        const json = (await res.json()) as {
            libraryBytesHealth: {
                status: string
                scanned: number
                missingCount: number
                missing: Array<{ fileId: string }>
                verdict: string
            }
        }
        expect(json.libraryBytesHealth.status).toBe("ok")
        // The smoking gun: all 3 rows reach the helper, NOT just the
        // single Drive-sync row. Pre-fix, orderBy("lastSyncedAt") would
        // strict-exclude the 2 upload rows → scanned=1.
        expect(json.libraryBytesHealth.scanned).toBe(3)
        expect(json.libraryBytesHealth.missingCount).toBe(2)
        const missingIds = json.libraryBytesHealth.missing.map((m) => m.fileId)
        expect(missingIds).toEqual(
            expect.arrayContaining([
                "upload-11111111-2222-3333-4444-555555555555",
                "upload-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
            ]),
        )
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

// ── tickStale + missing-aged + bootstrap stamp ─────────────────────────────
//
// storage-backup-silent-death-probe: the dormant-skip in
// /api/cron/storage-backup/route.ts was invisible to PGR-03 because the
// dormant path wrote zero docs and PGR-03 fail-opened silently on missing-
// doc. The fix writes a `lastTickAt` heartbeat on every tick (success,
// error, OR dormant) so PGR-03 can distinguish "cron is firing but env
// unset" from "cron stopped firing entirely". The bootstrap stamp on
// `config/healthBootstrap.firstAdminTickAt` is the deploy-age oracle that
// distinguishes "pre-activation" from "real silent death" when the
// storage-backup doc is missing altogether.

describe("PGR-03 — tickStale alarm (cron stopped firing)", () => {
    it("captures a 'warning' when lastTickAt is older than 36h, even in dormant mode", async () => {
        // Cron has been dormant for a while AND stopped ticking entirely —
        // distinct from a healthy-dormant tick (which would be fresh).
        storageBackupExists = true
        storageBackupDoc = {
            lastTickAt: NOW - 48 * HOUR,
            dormant: true,
            dormantReason: "CRC_BACKUP_DRIVE_FOLDER_ID unset",
        }
        await GET(makeReq("/api/cron/admin-consistency", { token: SECRET }))
        const tickStaleCall = captureMessageMock.mock.calls.find((c) =>
            String(c[0]).includes("has not ticked"),
        )
        expect(tickStaleCall).toBeTruthy()
        const [msg, ctx, level] = tickStaleCall!
        expect(msg).toMatch(/dormant=true/)
        expect(ctx).toMatchObject({
            source: "cron",
            location: "admin-consistency",
        })
        expect(ctx.extra.tickStalenessHours).toBeCloseTo(48, 0)
        expect(ctx.extra.dormant).toBe(true)
        expect(level).toBe("warning")
    })

    it("does NOT alarm tickStale when dormant tick is fresh (intentional pre-activation state)", async () => {
        storageBackupExists = true
        storageBackupDoc = {
            lastTickAt: NOW - 2 * HOUR,
            dormant: true,
            dormantReason: "CRC_BACKUP_DRIVE_FOLDER_ID unset",
        }
        await GET(makeReq("/api/cron/admin-consistency", { token: SECRET }))
        const tickStaleCall = captureMessageMock.mock.calls.find((c) =>
            String(c[0]).includes("has not ticked"),
        )
        expect(tickStaleCall).toBeFalsy()
    })

    it("captures a 'warning' when an active cron's lastTickAt goes stale even with fresh lastBackupAt", async () => {
        // Pathological case: success was recorded, then writeStorageBackupRun
        // started failing in a way that no longer stamps lastTickAt. Defensive
        // coverage — practically impossible after this lane lands, but the
        // alarm is independent of stale so a regression in the writer would
        // be caught.
        storageBackupExists = true
        storageBackupDoc = {
            lastBackupAt: NOW - 10 * HOUR, // fresh per existing PGR-03
            lastTickAt: NOW - 48 * HOUR, // but tick stamps stopped
            dormant: false,
        }
        await GET(makeReq("/api/cron/admin-consistency", { token: SECRET }))
        const tickStaleCall = captureMessageMock.mock.calls.find((c) =>
            String(c[0]).includes("has not ticked"),
        )
        expect(tickStaleCall).toBeTruthy()
    })

    it("pre-fix legacy doc (lastBackupAt present, lastTickAt absent) does NOT spuriously alarm tickStale", async () => {
        // Real prod doc shape on first deploy of this lane — the existing
        // recordStorageBackupRun's `lastBackupAt` write predates lastTickAt.
        // Until the next deployed tick re-writes, lastTickAt is null →
        // tickStale should be false (no false-positive page).
        storageBackupExists = true
        storageBackupDoc = { lastBackupAt: NOW - 10 * HOUR }
        await GET(makeReq("/api/cron/admin-consistency", { token: SECRET }))
        const tickStaleCall = captureMessageMock.mock.calls.find((c) =>
            String(c[0]).includes("has not ticked"),
        )
        expect(tickStaleCall).toBeFalsy()
    })
})

describe("PGR-03 — missing-doc + deploy-aged alarm", () => {
    it("captures a 'warning' when storageBackup doc is missing AND bootstrap is >36h old", async () => {
        storageBackupExists = false
        // Bootstrap stamp predates this tick by 48h — deploy is mature, the
        // cron should have written something by now → real silent death.
        healthBootstrapExists = true
        healthBootstrapDoc = { firstAdminTickAt: new Date(NOW - 48 * HOUR) }
        await GET(makeReq("/api/cron/admin-consistency", { token: SECRET }))
        const missingAgedCall = captureMessageMock.mock.calls.find((c) =>
            String(c[0]).includes("never written a heartbeat"),
        )
        expect(missingAgedCall).toBeTruthy()
        const [, ctx, level] = missingAgedCall!
        expect(ctx).toMatchObject({
            source: "cron",
            location: "admin-consistency",
        })
        expect(ctx.extra.subsystem).toBe("storage-backup-health")
        expect(ctx.extra.deployAgeHours).toBeCloseTo(48, 0)
        expect(level).toBe("warning")
    })

    it("does NOT alarm missing-doc on a fresh deploy (bootstrap <36h old)", async () => {
        // PGR-03 spec: don't page on a never-run cron in the first 36h post-
        // deploy. The bootstrap stamp is fresh → pre-activation state.
        storageBackupExists = false
        healthBootstrapExists = true
        healthBootstrapDoc = { firstAdminTickAt: new Date(NOW - 2 * HOUR) }
        await GET(makeReq("/api/cron/admin-consistency", { token: SECRET }))
        const missingAgedCall = captureMessageMock.mock.calls.find((c) =>
            String(c[0]).includes("never written a heartbeat"),
        )
        expect(missingAgedCall).toBeFalsy()
    })

    it("does NOT alarm missing-doc on the very first admin-consistency tick (bootstrap not yet stamped)", async () => {
        storageBackupExists = false
        healthBootstrapExists = false // first ever tick
        await GET(makeReq("/api/cron/admin-consistency", { token: SECRET }))
        const missingAgedCall = captureMessageMock.mock.calls.find((c) =>
            String(c[0]).includes("never written a heartbeat"),
        )
        expect(missingAgedCall).toBeFalsy()
        // And the bootstrap stamp WAS written this tick.
        expect(healthBootstrapWrites).toHaveLength(1)
        expect(healthBootstrapWrites[0].payload).toHaveProperty("firstAdminTickAt")
    })

    it("bootstrap stamp is idempotent — second tick does NOT overwrite firstAdminTickAt", async () => {
        // First tick — seed it via the actual route call so the test mirrors
        // prod behavior.
        healthBootstrapExists = false
        await GET(makeReq("/api/cron/admin-consistency", { token: SECRET }))
        expect(healthBootstrapWrites).toHaveLength(1)
        const firstWrite = healthBootstrapWrites[0]

        // Second tick — should NOT write again (doc now exists with valid
        // stamp).
        await GET(makeReq("/api/cron/admin-consistency", { token: SECRET }))
        expect(healthBootstrapWrites).toHaveLength(1) // unchanged
        expect(healthBootstrapWrites[0]).toBe(firstWrite)
    })
})

describe("PGR-03 — dormant fresh tick is intentionally silent", () => {
    it("dormant + fresh tick fires NO Sentry alarms (pre-activation steady state)", async () => {
        // Fresh deploy, env var unset, cron tick'd happily — the new
        // observable steady state. PGR-03 must remain silent here, otherwise
        // we'd be paging Daniel daily while he sets up the Shared Drive.
        storageBackupExists = true
        storageBackupDoc = {
            lastTickAt: NOW - 1 * HOUR,
            dormant: true,
            dormantReason: "CRC_BACKUP_DRIVE_FOLDER_ID unset",
        }
        // Bootstrap fresh too.
        healthBootstrapExists = true
        healthBootstrapDoc = { firstAdminTickAt: new Date(NOW - 5 * HOUR) }

        await GET(makeReq("/api/cron/admin-consistency", { token: SECRET }))
        const storageBackupCalls = captureMessageMock.mock.calls.filter((c) =>
            /storage backup/i.test(String(c[0])),
        )
        expect(storageBackupCalls).toHaveLength(0)
    })
})
