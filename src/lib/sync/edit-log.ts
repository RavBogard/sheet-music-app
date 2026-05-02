// v5h3-01-02: edit_log helper module.
//
// Append-only IDB breadcrumb store for the v5.0 sync substrate's hot write
// paths. The 5 instrumented sites (TextCell.commit, DropdownCell.commit,
// applyEdit, engine.drainOnce per-row, snapshot-listener.handleTracks
// per-change) call `recordEdit(...)` to persist a stable-identifier-only
// row; on app mount, `uploadRecentEditLog()` (in edit-log-upload.ts)
// flushes the most-recent K rows to Sentry as breadcrumbs and clears the
// drained range so we don't re-send.
//
// Discipline (NON-NEGOTIABLE):
//   - NO USER-TYPED CONTENT in any field. See LocalEditLog in types.ts.
//   - All public functions wrapped in try/catch — instrumentation MUST
//     NOT crash the production code paths it observes. Failures are
//     logged via `logger.warn` and swallowed.
//   - FIFO cap at 500 rows so the table never grows unbounded on long-
//     lived devices. Eviction is best-effort: if it fails (race, IDB
//     locked), the next call retries.

import { getDb, type LocalDb } from '../local/schema'
import type { LocalEditLog } from '../local/types'
import { logger } from '../logger'

/** Maximum rows retained in `edit_log`. Older rows beyond this are
 *  evicted FIFO on each `recordEdit` call. */
export const EDIT_LOG_MAX_ROWS = 500

interface EditLogDbScope {
    db?: LocalDb
}

function resolveDb(scope: EditLogDbScope | undefined): LocalDb {
    return scope?.db ?? getDb()
}

/** Append a single edit-log entry. Auto-fills `ts` if absent. After the
 *  insert, if the table exceeds `EDIT_LOG_MAX_ROWS`, deletes the oldest
 *  rows (by `ts` ascending) to bring the count back to the cap. ALL
 *  failures are swallowed — the caller (a hot write path) MUST NOT
 *  observe an instrumentation error. */
export async function recordEdit(
    entry: Omit<LocalEditLog, 'id'> & { ts?: number },
    scope?: EditLogDbScope,
): Promise<void> {
    try {
        const db = resolveDb(scope)
        const row: Omit<LocalEditLog, 'id'> = {
            ...entry,
            ts: entry.ts ?? Date.now(),
        }
        await db.transaction('rw', db.edit_log, async () => {
            await db.edit_log.add(row as LocalEditLog)
            const count = await db.edit_log.count()
            if (count > EDIT_LOG_MAX_ROWS) {
                const overflow = count - EDIT_LOG_MAX_ROWS
                const victimKeys = await db.edit_log
                    .orderBy('ts')
                    .limit(overflow)
                    .primaryKeys()
                if (victimKeys.length > 0) {
                    await db.edit_log.bulkDelete(victimKeys)
                }
            }
        })
    } catch (err) {
        logger.warn('[edit-log] recordEdit failed (swallowed)', err)
    }
}

/** Return up to `k` most-recent rows sorted by `ts` descending. Returns
 *  an empty array on failure. */
export async function getRecentEntries(
    k: number = 50,
    scope?: EditLogDbScope,
): Promise<LocalEditLog[]> {
    try {
        const db = resolveDb(scope)
        return await db.edit_log
            .orderBy('ts')
            .reverse()
            .limit(k)
            .toArray()
    } catch (err) {
        logger.warn('[edit-log] getRecentEntries failed (swallowed)', err)
        return []
    }
}

/** Delete every row whose `id <= maxId`. Called after a successful
 *  upload so we don't re-send the same breadcrumbs on the next mount.
 *  Swallows failures. */
export async function clearUploaded(
    maxId: number,
    scope?: EditLogDbScope,
): Promise<void> {
    try {
        const db = resolveDb(scope)
        await db.edit_log.where('id').belowOrEqual(maxId).delete()
    } catch (err) {
        logger.warn('[edit-log] clearUploaded failed (swallowed)', err)
    }
}
