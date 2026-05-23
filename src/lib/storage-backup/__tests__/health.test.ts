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
})
