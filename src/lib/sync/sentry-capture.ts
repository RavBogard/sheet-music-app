// v50-07-05: Sentry capture wrapper for v5.0 sync substrate.
//
// Centralizes the tag/level/extra shape so every silent-failure capture site
// in the engine + listener + hydrator emits a consistent, filterable event in
// Sentry. The user wires alert rules in the Sentry dashboard against the
// `feature` tag (lazy-hydration / dead-letter / snapshot-listener / write-
// atomicity) — see .paul/phases/v50-07-migration-cutover/v50-07-05-SHIP-
// CHECKLIST.md for the alert taxonomy.
//
// Contract:
//   - NEVER throws. The sync engine must not crash because of telemetry —
//     catches its own SDK errors and swallows them.
//   - Tags are coerced to strings (Sentry's tag indexer requires strings).
//   - Level defaults: dead-letter + write-atomicity → 'error'; lazy-hydration
//     + snapshot-listener → 'warning'. (Conflict-state transitions and per-
//     attempt drain failures are intentionally NOT captured — see PLAN
//     boundaries.)
//   - Payload contents (user-authored notes, song titles) are NEVER passed
//     to Sentry. Only stable identifiers + opcodes.

import * as Sentry from '@sentry/nextjs'

import type { LocalEditLog } from '../local/types'

export type SyncFailureFeature =
    | 'lazy-hydration'
    | 'dead-letter'
    | 'snapshot-listener'
    | 'write-atomicity'

export interface SyncFailureContext {
    feature: SyncFailureFeature
    setlistId?: string
    collection?: string
    docId?: string
    op?: string
    attempts?: number
    site?: string
    trackCount?: number
    [key: string]: unknown
}

const ERROR_LEVEL_FEATURES: ReadonlySet<SyncFailureFeature> = new Set([
    'dead-letter',
    'write-atomicity',
])

function levelFor(feature: SyncFailureFeature): 'error' | 'warning' {
    return ERROR_LEVEL_FEATURES.has(feature) ? 'error' : 'warning'
}

function stringifyTags(
    context: SyncFailureContext,
): Record<string, string> {
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(context)) {
        if (v === undefined || v === null) continue
        out[k] = typeof v === 'string' ? v : String(v)
    }
    return out
}

export function captureSyncFailure(
    err: unknown,
    context: SyncFailureContext,
): void {
    try {
        Sentry.captureException(err, {
            tags: stringifyTags(context),
            extra: { ...context },
            level: levelFor(context.feature),
        })
    } catch {
        // Telemetry MUST NOT crash the engine. If the Sentry SDK throws
        // (uninitialized in tests, transport failure, etc.), swallow.
    }
}

// v5h3-01-02: Sentry breadcrumb wrapper for the edit-log auto-capture
// pipeline (see .paul/phases/v5h3-01-save-loss-recurrence). Edits are
// recorded to IDB via `recordEdit` and then flushed to Sentry as
// breadcrumbs on app mount via `uploadRecentEditLog` (edit-log-upload.ts).
//
// PII discipline (NON-NEGOTIABLE — same as captureSyncFailure):
//   - Only stable identifiers reach Sentry: source, op, collection, docId,
//     cellType, payloadKeys (FIELD NAMES, never values), outcome, attempts,
//     localUpdatedAt, ts.
//   - Tag values are coerced to strings; undefined/null are dropped (no
//     "undefined" string leaks into Sentry's tag indexer).
//   - Wrapped in try/catch — if Sentry is uninitialized (tests) or its
//     SDK throws, swallow. Instrumentation MUST NOT crash callers.

/** Project a `LocalEditLog` row down to the stable-identifier set that
 *  is safe to attach as Sentry breadcrumb data. Drops undefined/null;
 *  coerces non-string values to strings; flattens `payloadKeys` (an
 *  array of field names) to a comma-joined string for indexing. */
function stableTagsFromEntry(entry: LocalEditLog): Record<string, string> {
    const candidates: Record<string, unknown> = {
        source: entry.source,
        op: entry.op,
        collection: entry.collection,
        docId: entry.docId,
        cellType: entry.cellType,
        payloadKeys:
            entry.payloadKeys && entry.payloadKeys.length > 0
                ? entry.payloadKeys.join(',')
                : undefined,
        outcome: entry.outcome,
        attempts: entry.attempts,
        localUpdatedAt: entry.localUpdatedAt,
    }
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(candidates)) {
        if (v === undefined || v === null) continue
        out[k] = typeof v === 'string' ? v : String(v)
    }
    return out
}

export function addEditBreadcrumb(entry: LocalEditLog): void {
    try {
        const data = stableTagsFromEntry(entry)
        Sentry.addBreadcrumb({
            category: 'edit-log',
            level: 'info',
            message: `${entry.source}/${entry.outcome ?? 'recorded'}`,
            data,
            timestamp: entry.ts / 1000,
        })
    } catch {
        // Telemetry MUST NOT crash the caller. Same contract as
        // captureSyncFailure.
    }
}

/** Push a batch of edit-log rows to Sentry as breadcrumbs in chronological
 *  (oldest-first) order so the breadcrumb panel reads top-to-bottom as a
 *  timeline. Returns the highest `id` seen so the orchestrator can call
 *  `clearUploaded(id)` to drain the persisted log range. */
export function uploadEditLogBreadcrumbs(
    entries: LocalEditLog[],
): { lastUploadedId: number | null } {
    let lastUploadedId: number | null = null
    try {
        // Caller (`getRecentEntries`) hands us descending-by-ts; reverse
        // so breadcrumbs land in chronological order.
        const ordered = [...entries].reverse()
        for (const entry of ordered) {
            addEditBreadcrumb(entry)
            if (entry.id !== undefined) {
                if (lastUploadedId === null || entry.id > lastUploadedId) {
                    lastUploadedId = entry.id
                }
            }
        }
    } catch {
        // Same swallow contract; partial uploads are acceptable.
    }
    return { lastUploadedId }
}
