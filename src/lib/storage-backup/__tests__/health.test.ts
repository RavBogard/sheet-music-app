import { describe, expect, it } from "vitest"
import {
    STORAGE_BACKUP_STALENESS_HOURS,
    STORAGE_BACKUP_START_NEVER_FINISHED_HOURS,
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

    // ── Fix B — startedButNotFinished (5th alarm: externally-killed silent death) ──
    //
    // The route stamps `lastTickStartedAt` BEFORE `runStorageBackupProd` enters
    // its for-loop. If Vercel later hard-kills the function at `maxDuration:300s`,
    // neither `recordStorageBackupRun` (success) nor `writeStorageBackupError`
    // (failure) ever runs — so no `lastBackupAt` / `lastErrorAt` write happens.
    // The start stamp survives as the only evidence. After the 1h threshold the
    // health helper trips `startedButNotFinished`, and admin-consistency emits a
    // Sentry warning. Closes the silent-death failure class diagnosed at
    // `.paul/research/storage-backup-silent-death/DIAGNOSIS.md`.
    describe("startedButNotFinished (Fix B — externally-killed silent death)", () => {
        const STARTED_AGE =
            (STORAGE_BACKUP_START_NEVER_FINISHED_HOURS + 0.5) * HOUR

        it("flags startedButNotFinished when start is older than 1h with no later success/error", () => {
            const result = checkStorageBackupHealth(
                { lastTickStartedAt: NOW - STARTED_AGE },
                NOW,
            )
            if (result.status !== "present") throw new Error("expected present")
            expect(result.lastTickStartedAt).toBe(NOW - STARTED_AGE)
            expect(result.startedButNotFinished).toBe(true)
        })

        it("does NOT flag startedButNotFinished when lastBackupAt is later than the start", () => {
            // A success-path write landed after the start stamp → the tick
            // finished. The start stamp is benign at this point.
            const result = checkStorageBackupHealth(
                {
                    lastTickStartedAt: NOW - STARTED_AGE,
                    lastBackupAt: NOW - 5 * 60 * 1000, // 5 min ago, AFTER start
                },
                NOW,
            )
            if (result.status !== "present") throw new Error("expected present")
            expect(result.startedButNotFinished).toBe(false)
        })

        it("does NOT flag startedButNotFinished when lastErrorAt is later than the start", () => {
            // A caught-error write landed after the start stamp → the run
            // failed cleanly (writeStorageBackupError ran). That's a different
            // failure class — `recentError` covers it.
            const result = checkStorageBackupHealth(
                {
                    lastTickStartedAt: NOW - STARTED_AGE,
                    lastError: "Drive 400",
                    lastErrorAt: NOW - 5 * 60 * 1000,
                },
                NOW,
            )
            if (result.status !== "present") throw new Error("expected present")
            expect(result.startedButNotFinished).toBe(false)
            // The recentError alarm catches THIS path.
            expect(result.recentError).toBe(true)
        })

        it("does NOT flag startedButNotFinished when the start is younger than the 1h threshold", () => {
            // In-flight run — still has time to either succeed or fail cleanly.
            const result = checkStorageBackupHealth(
                {
                    lastTickStartedAt:
                        NOW - (STORAGE_BACKUP_START_NEVER_FINISHED_HOURS - 0.5) * HOUR,
                },
                NOW,
            )
            if (result.status !== "present") throw new Error("expected present")
            expect(result.startedButNotFinished).toBe(false)
        })

        it("DOES flag startedButNotFinished when lastBackupAt is OLDER than the start (prior tick succeeded, current tick stuck)", () => {
            // A previous tick set lastBackupAt; the current tick started and
            // died externally. The fact that there's a stale success in the
            // record must NOT mask the new silent death.
            const result = checkStorageBackupHealth(
                {
                    lastTickStartedAt: NOW - STARTED_AGE,
                    lastBackupAt: NOW - 26 * HOUR, // 26h ago, BEFORE the new start
                },
                NOW,
            )
            if (result.status !== "present") throw new Error("expected present")
            expect(result.startedButNotFinished).toBe(true)
        })

        it("does NOT flag startedButNotFinished when no start stamp is present (pre-Fix-B legacy doc)", () => {
            // Pre-Fix-B prod doc — no lastTickStartedAt. Must not spuriously
            // alarm until the next deployed tick writes one.
            const result = checkStorageBackupHealth(
                { lastBackupAt: NOW - 10 * HOUR, lastTickAt: NOW - 10 * HOUR },
                NOW,
            )
            if (result.status !== "present") throw new Error("expected present")
            expect(result.lastTickStartedAt).toBe(null)
            expect(result.startedButNotFinished).toBe(false)
        })

        it("treats a Firestore-Timestamp lastTickStartedAt the same as a number", () => {
            const ts = {
                toMillis: () => NOW - STARTED_AGE,
                seconds: Math.floor((NOW - STARTED_AGE) / 1000),
            }
            const result = checkStorageBackupHealth(
                { lastTickStartedAt: ts },
                NOW,
            )
            if (result.status !== "present") throw new Error("expected present")
            expect(result.lastTickStartedAt).toBe(NOW - STARTED_AGE)
            expect(result.startedButNotFinished).toBe(true)
        })

        it("present-status with only lastTickStartedAt as signal (no lastTickAt/lastBackupAt) reports the alarm", () => {
            // A doc that contains ONLY a Fix-B start stamp is still "present"
            // (start is signal), and the alarm should fire.
            const result = checkStorageBackupHealth(
                { lastTickStartedAt: NOW - STARTED_AGE },
                NOW,
            )
            expect(result.status).toBe("present")
            if (result.status !== "present") throw new Error("expected present")
            expect(result.startedButNotFinished).toBe(true)
        })
    })
})
