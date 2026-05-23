/**
 * PGR-03 — derive storage-backup health from a `config/storageBackup`
 * snapshot.  Pure: takes the raw snapshot + a `now` ms timestamp and
 * returns the staleness verdict.  Keeping the time math out of the
 * cron route makes it testable without spinning up Firestore.
 *
 * The companion writer is `recordStorageBackupRun` /
 * `writeStorageBackupError` in `./mirror.ts`.  Field shapes preserved
 * from there:
 *   - `lastBackupAt` — set on every successful run (Firestore Timestamp
 *     when read via admin SDK; Date when written; epoch ms when in
 *     unit-test fakes).
 *   - `lastError` — string message of the most recent failure.
 *   - `lastErrorAt` — when the failure happened (same time shapes).
 */

/** 36h ≈ two missed daily cron runs — the threshold supervisor ratified. */
export const STORAGE_BACKUP_STALENESS_HOURS = 36

/** Same threshold expressed in ms, for consumers doing ms math directly. */
export const STORAGE_BACKUP_STALENESS_MS =
    STORAGE_BACKUP_STALENESS_HOURS * 60 * 60 * 1000

/** Output shape returned to the cron caller. */
export type StorageBackupHealth =
    | { status: "unavailable" }
    | { status: "missing" }
    | {
          status: "present"
          lastBackupAt: number | null
          stalenessHours: number
          stale: boolean
          lastError: string | null
          lastErrorAt: number | null
          recentError: boolean
      }

/**
 * Coerce a Firestore-ish timestamp value to epoch-ms.  Handles all four
 * shapes we observe: number, JS Date, ISO-string, and Firestore
 * Timestamp-like (`{toMillis()}` or `{seconds, nanoseconds}`).
 * Returns `null` for anything unparseable so callers fall through to
 * the missing-data branch instead of producing garbage staleness.
 */
function toMillis(value: unknown): number | null {
    if (value == null) return null
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (value instanceof Date) {
        const t = value.getTime()
        return Number.isFinite(t) ? t : null
    }
    if (typeof value === "string") {
        const parsed = Date.parse(value)
        return Number.isFinite(parsed) ? parsed : null
    }
    if (typeof value === "object") {
        const obj = value as { toMillis?: unknown; seconds?: unknown }
        if (typeof obj.toMillis === "function") {
            try {
                const ms = (obj.toMillis as () => number).call(obj)
                return typeof ms === "number" && Number.isFinite(ms) ? ms : null
            } catch {
                return null
            }
        }
        if (typeof obj.seconds === "number" && Number.isFinite(obj.seconds)) {
            return obj.seconds * 1000
        }
    }
    return null
}

/**
 * Derive staleness + recent-error flags from a `config/storageBackup`
 * snapshot.  `null`/`undefined` snapshot means the cron has never run
 * (or the doc was wiped); we report `missing` and let the caller
 * decide whether to alarm (per spec — don't page on a never-run cron).
 */
export function checkStorageBackupHealth(
    snapshot: Record<string, unknown> | null | undefined,
    nowMs: number,
): StorageBackupHealth {
    if (!snapshot) return { status: "missing" }

    const lastBackupAt = toMillis(snapshot.lastBackupAt)
    const lastErrorAt = toMillis(snapshot.lastErrorAt)
    const rawLastError = snapshot.lastError
    const lastError =
        typeof rawLastError === "string" && rawLastError.length > 0
            ? rawLastError
            : null

    // If neither timestamp is parseable AND there's no error string, the
    // doc exists but carries no signal we can act on — treat as missing.
    if (lastBackupAt == null && lastErrorAt == null && !lastError) {
        return { status: "missing" }
    }

    const stalenessMs = lastBackupAt != null ? nowMs - lastBackupAt : Infinity
    const stalenessHours =
        lastBackupAt != null ? stalenessMs / (60 * 60 * 1000) : Infinity
    // Spec: only alarm staleness if the cron has been observed running
    // before.  A never-run cron (no lastBackupAt) is NOT an alarm here;
    // PGR-01 covers the "backup never wired" failure mode separately.
    const stale = lastBackupAt != null && stalenessMs > STORAGE_BACKUP_STALENESS_MS
    const recentError =
        !!lastError &&
        lastErrorAt != null &&
        nowMs - lastErrorAt <= STORAGE_BACKUP_STALENESS_MS

    return {
        status: "present",
        lastBackupAt,
        stalenessHours,
        stale,
        lastError,
        lastErrorAt,
        recentError,
    }
}
