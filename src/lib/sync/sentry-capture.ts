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
