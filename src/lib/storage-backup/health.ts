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
          /**
           * Wall-clock of the most recent cron tick (success, error, OR
           * dormant). Independent of `lastBackupAt` which only stamps on a
           * successful real backup. Null only on pre-fix legacy docs that
           * predate the dormant-heartbeat write (storage-backup-silent-death-probe).
           */
          lastTickAt: number | null
          /** Hours since `lastTickAt`, or Infinity if null. */
          tickStalenessHours: number
          /**
           * True when `lastTickAt` is older than `STORAGE_BACKUP_STALENESS_HOURS`,
           * i.e. the cron itself has stopped firing (independent of dormant vs
           * active mode). PGR-03 alarms on this regardless of `dormant` —
           * a dormant cron that stops ticking is just as broken as an active
           * one.
           */
          tickStale: boolean
          /**
           * True when the last tick was a dormant no-op (CRC_BACKUP_DRIVE_FOLDER_ID
           * unset). PGR-03 does NOT alarm on dormant+fresh — that's
           * intentional pre-activation state. dormant+tickStale STILL alarms
           * via `tickStale`.
           */
          dormant: boolean
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
    const lastTickAt = toMillis(snapshot.lastTickAt)
    const rawLastError = snapshot.lastError
    const lastError =
        typeof rawLastError === "string" && rawLastError.length > 0
            ? rawLastError
            : null
    const dormant = snapshot.dormant === true

    // If no timestamps OR error string are parseable, the doc exists but
    // carries no signal we can act on — treat as missing. `lastTickAt`
    // counts as signal: a dormant-heartbeat-only doc IS present + actionable.
    if (
        lastBackupAt == null &&
        lastErrorAt == null &&
        lastTickAt == null &&
        !lastError
    ) {
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

    const tickStalenessMs = lastTickAt != null ? nowMs - lastTickAt : Infinity
    const tickStalenessHours =
        lastTickAt != null ? tickStalenessMs / (60 * 60 * 1000) : Infinity
    // Mirrors `stale`'s never-run policy: only alarm tickStale if we have
    // observed a tick before (lastTickAt parseable). Pre-fix legacy docs
    // without lastTickAt will register tickStalenessHours=Infinity but
    // tickStale=false until the next deployed tick stamps lastTickAt.
    const tickStale =
        lastTickAt != null && tickStalenessMs > STORAGE_BACKUP_STALENESS_MS

    return {
        status: "present",
        lastBackupAt,
        stalenessHours,
        stale,
        lastError,
        lastErrorAt,
        recentError,
        lastTickAt,
        tickStalenessHours,
        tickStale,
        dormant,
    }
}
