// v5h3-01-02: upload-on-mount orchestrator for the edit-log breadcrumb
// auto-capture pipeline.
//
// Wired into init.ts after engine.start() as a fire-and-forget call. Runs
// once per app mount: read the most-recent K rows from `edit_log`, push
// each as a Sentry breadcrumb (`addEditBreadcrumb`), then drain the
// uploaded id range so we don't re-send on the next mount.
//
// Discipline (NON-NEGOTIABLE):
//   - Fail-soft. Every helper call is wrapped in try/catch. We MUST NOT
//     block engine startup or crash the app on Sentry/IDB hiccups.
//   - Empty input is a no-op (no `clearUploaded` call when there's
//     nothing to clear).

import type { LocalDb } from '../local/schema'
import { logger } from '../logger'

import { clearUploaded, getRecentEntries } from './edit-log'
import { uploadEditLogBreadcrumbs } from './sentry-capture'

export interface UploadRecentEditLogOpts {
    db?: LocalDb
    /** Max rows to read + flush. Default 50 — matches the breadcrumb
     *  buffer size we expect users to scan in Sentry. */
    max?: number
}

export async function uploadRecentEditLog(
    opts: UploadRecentEditLogOpts = {},
): Promise<void> {
    try {
        const max = opts.max ?? 50
        const entries = await getRecentEntries(max, { db: opts.db })
        if (entries.length === 0) return

        const { lastUploadedId } = uploadEditLogBreadcrumbs(entries)
        if (lastUploadedId !== null) {
            await clearUploaded(lastUploadedId, { db: opts.db })
        }
    } catch (err) {
        logger.warn('[edit-log-upload] uploadRecentEditLog failed (swallowed)', err)
    }
}
