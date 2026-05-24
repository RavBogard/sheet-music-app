import { describe, expect, it } from "vitest"
import {
    STORAGE_BACKUP_STALENESS_HOURS,
    checkStorageBackupHealth,
} from "../health"

const HOUR = 60 * 60 * 1000
const NOW = new Date("2026-05-23T22:00:00Z").getTime()

describe("checkStorageBackupHealth", () => {
    it("reports missing when snapshot is undefined", () => {
        expect(checkStorageBackupHealth(undefined, NOW)).toEqual({ status: "missing" })
        expect(checkStorageBackupHealth(null, NOW)).toEqual({ status: "missing" })
    })

    it("reports missing when snapshot has no usable timestamp or error", () => {
        expect(
            checkStorageBackupHealth({ ran: false, scanned: 0 }, NOW),
        ).toEqual({ status: "missing" })
    })

    it("reports fresh when lastBackupAt is within the staleness window", () => {
        const result = checkStorageBackupHealth(
            { lastBackupAt: NOW - 10 * HOUR },
            NOW,
        )
        if (result.status !== "present") throw new Error("expected present")
        expect(result.stale).toBe(false)
        expect(result.recentError).toBe(false)
        expect(result.stalenessHours).toBeCloseTo(10, 1)
        expect(result.lastError).toBe(null)
    })

    it("reports stale when lastBackupAt exceeds the staleness window", () => {
        const result = checkStorageBackupHealth(
            { lastBackupAt: NOW - (STORAGE_BACKUP_STALENESS_HOURS + 1) * HOUR },
            NOW,
        )
        if (result.status !== "present") throw new Error("expected present")
        expect(result.stale).toBe(true)
        expect(result.stalenessHours).toBeGreaterThan(STORAGE_BACKUP_STALENESS_HOURS)
    })

    it("flags recentError when lastError + lastErrorAt are inside the window", () => {
        const result = checkStorageBackupHealth(
            {
                lastBackupAt: NOW - 10 * HOUR,
                lastError: "DriveClient threw 403",
                lastErrorAt: NOW - 6 * HOUR,
            },
            NOW,
        )
        if (result.status !== "present") throw new Error("expected present")
        expect(result.stale).toBe(false)
        expect(result.recentError).toBe(true)
        expect(result.lastError).toBe("DriveClient threw 403")
    })

    it("does NOT flag recentError when the failure is older than the window", () => {
        const result = checkStorageBackupHealth(
            {
                lastBackupAt: NOW - 10 * HOUR,
                lastError: "DriveClient threw 403",
                lastErrorAt: NOW - (STORAGE_BACKUP_STALENESS_HOURS + 5) * HOUR,
            },
            NOW,
        )
        if (result.status !== "present") throw new Error("expected present")
        expect(result.recentError).toBe(false)
    })

    it("flags both stale AND recentError when both apply", () => {
        const result = checkStorageBackupHealth(
            {
                lastBackupAt: NOW - 48 * HOUR,
                lastError: "drive 500",
                lastErrorAt: NOW - 4 * HOUR,
            },
            NOW,
        )
        if (result.status !== "present") throw new Error("expected present")
        expect(result.stale).toBe(true)
        expect(result.recentError).toBe(true)
    })

    it("accepts a Firestore Timestamp-shaped lastBackupAt", () => {
        const ts = {
            toMillis: () => NOW - 12 * HOUR,
            seconds: Math.floor((NOW - 12 * HOUR) / 1000),
        }
        const result = checkStorageBackupHealth({ lastBackupAt: ts }, NOW)
        if (result.status !== "present") throw new Error("expected present")
        expect(result.lastBackupAt).toBe(NOW - 12 * HOUR)
        expect(result.stalenessHours).toBeCloseTo(12, 1)
    })

    it("accepts a JS Date lastBackupAt", () => {
        const result = checkStorageBackupHealth(
            { lastBackupAt: new Date(NOW - 15 * HOUR) },
            NOW,
        )
        if (result.status !== "present") throw new Error("expected present")
        expect(result.lastBackupAt).toBe(NOW - 15 * HOUR)
    })

    it("accepts an ISO string lastBackupAt", () => {
        const result = checkStorageBackupHealth(
            { lastBackupAt: new Date(NOW - 5 * HOUR).toISOString() },
            NOW,
        )
        if (result.status !== "present") throw new Error("expected present")
        expect(result.lastBackupAt).toBe(NOW - 5 * HOUR)
    })

    it("treats an empty-string lastError as no error", () => {
        const result = checkStorageBackupHealth(
            {
                lastBackupAt: NOW - 1 * HOUR,
                lastError: "",
                lastErrorAt: NOW - 1 * HOUR,
            },
            NOW,
        )
        if (result.status !== "present") throw new Error("expected present")
        expect(result.lastError).toBe(null)
        expect(result.recentError).toBe(false)
    })

    it("does NOT alarm staleness when lastBackupAt is missing (PGR-01 territory)", () => {
        // Doc exists with only an error — never had a successful run.  We surface
        // recentError so the failure is visible, but the cron caller should NOT
        // raise a staleness alarm (that's PGR-01 / 'never wired').
        const result = checkStorageBackupHealth(
            { lastError: "boom", lastErrorAt: NOW - 2 * HOUR },
            NOW,
        )
        if (result.status !== "present") throw new Error("expected present")
        expect(result.stale).toBe(false)
        expect(result.recentError).toBe(true)
    })

    describe("tickStale + dormant (storage-backup-silent-death-probe)", () => {
        it("reports present when only lastTickAt is set (dormant-heartbeat-only doc)", () => {
            const result = checkStorageBackupHealth(
                { lastTickAt: NOW - 2 * HOUR, dormant: true },
                NOW,
            )
            if (result.status !== "present") throw new Error("expected present")
            expect(result.lastTickAt).toBe(NOW - 2 * HOUR)
            expect(result.tickStale).toBe(false)
            expect(result.tickStalenessHours).toBeCloseTo(2, 1)
            expect(result.dormant).toBe(true)
            // No lastBackupAt → stale is false (PGR-01 territory).
            expect(result.stale).toBe(false)
            // No lastError → recentError is false.
            expect(result.recentError).toBe(false)
        })

        it("flags tickStale when lastTickAt exceeds the staleness window", () => {
            const result = checkStorageBackupHealth(
                {
                    lastTickAt: NOW - (STORAGE_BACKUP_STALENESS_HOURS + 5) * HOUR,
                    dormant: true,
                },
                NOW,
            )
            if (result.status !== "present") throw new Error("expected present")
            expect(result.tickStale).toBe(true)
            expect(result.tickStalenessHours).toBeGreaterThan(
                STORAGE_BACKUP_STALENESS_HOURS,
            )
            expect(result.dormant).toBe(true)
        })

        it("does NOT flag tickStale when lastTickAt is missing (pre-fix legacy doc)", () => {
            // Pre-storage-backup-silent-death-probe docs have only lastBackupAt
            // without lastTickAt. The new code must NOT spuriously alarm them
            // — the next deployed tick will stamp lastTickAt and the alarm
            // becomes meaningful.
            const result = checkStorageBackupHealth(
                { lastBackupAt: NOW - 10 * HOUR },
                NOW,
            )
            if (result.status !== "present") throw new Error("expected present")
            expect(result.lastTickAt).toBe(null)
            expect(result.tickStale).toBe(false)
            expect(result.tickStalenessHours).toBe(Infinity)
            expect(result.dormant).toBe(false)
        })

        it("flags both stale AND tickStale when both apply", () => {
            const result = checkStorageBackupHealth(
                {
                    lastBackupAt: NOW - 48 * HOUR,
                    lastTickAt: NOW - 48 * HOUR,
                    dormant: false,
                },
                NOW,
            )
            if (result.status !== "present") throw new Error("expected present")
            expect(result.stale).toBe(true)
            expect(result.tickStale).toBe(true)
            expect(result.dormant).toBe(false)
        })

        it("dormant pass-through defaults to false when snapshot omits it", () => {
            const result = checkStorageBackupHealth(
                { lastTickAt: NOW - 2 * HOUR, lastBackupAt: NOW - 2 * HOUR },
                NOW,
            )
            if (result.status !== "present") throw new Error("expected present")
            expect(result.dormant).toBe(false)
        })

        it("accepts a Firestore Timestamp-shaped lastTickAt", () => {
            const ts = {
                toMillis: () => NOW - 8 * HOUR,
                seconds: Math.floor((NOW - 8 * HOUR) / 1000),
            }
            const result = checkStorageBackupHealth({ lastTickAt: ts }, NOW)
            if (result.status !== "present") throw new Error("expected present")
            expect(result.lastTickAt).toBe(NOW - 8 * HOUR)
            expect(result.tickStalenessHours).toBeCloseTo(8, 1)
        })
    })
})
