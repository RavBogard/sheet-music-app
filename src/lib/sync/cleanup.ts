// v52-03-01: outbox cleanup primitives — user-initiated recovery for the
// terminal `failed` FSM state. Only deletes rows with status === 'failed';
// pending / sending rows are preserved (in-flight work must not be lost).
//
// Recovery flow:
//   1. User taps the failed-state SyncIndicator action button.
//   2. SyncIndicator calls `discardFailedOutboxRows()` (explicit give-up path).
//   3. Failed rows are removed from `db.outbox`.
//   4. The engine's existing interval-based pump observes the now-clean
//      outbox on its next tick and the FSM derives back to 'idle' (or
//      'offline' if still offline). No explicit `engine.pump()` nudge
//      from this module — keeps cleanup decoupled from engine internals,
//      mirroring v50-06-03's "write to Dexie, let pump observe" pattern.

import { getDb } from '@/lib/local/schema'
import type { LocalDb } from '@/lib/local/schema'
import { getSyncEngine } from '@/lib/sync/init'

export interface ClearFailedResult {
    removed: number
}

export interface ClearFailedOptions {
    db?: LocalDb
}

/**
 * Discard every failed outbox row (does NOT retry). Pending / sending rows
 * are preserved. Use this for an explicit, user-confirmed "give up" path —
 * never as the default action of a button labeled "retry".
 */
export async function discardFailedOutboxRows(
    options: ClearFailedOptions = {},
): Promise<ClearFailedResult> {
    const db = options.db ?? getDb()
    const failedRows = await db.outbox
        .where('status')
        .equals('failed')
        .toArray()

    let removed = 0
    for (const row of failedRows) {
        if (row.localId !== undefined) {
            await db.outbox.delete(row.localId)
            removed += 1
        }
    }

    return { removed }
}

export interface RetryFailedResult {
    retried: number
}

export interface RetryFailedOptions {
    db?: LocalDb
    /** Test seam — defaults to the engine singleton from init.ts. */
    pump?: () => Promise<void> | void
}

/**
 * Reset every failed outbox row to status='pending' (attempts=0,
 * scheduledFor=now, lastError=undefined) and nudge the engine to drain.
 *
 * This is the systemic fix for the previous "Failed — retry" pill which
 * actually deleted rows. The button now does what its label says.
 */
export async function retryFailedOutboxRows(
    options: RetryFailedOptions = {},
): Promise<RetryFailedResult> {
    const db = options.db ?? getDb()
    const now = Date.now()
    const failedRows = await db.outbox
        .where('status')
        .equals('failed')
        .toArray()

    let retried = 0
    for (const row of failedRows) {
        if (row.localId !== undefined) {
            await db.outbox.update(row.localId, {
                status: 'pending',
                attempts: 0,
                scheduledFor: now,
                lastError: undefined,
                // v60-01: mark this row as "user clicked retry" so the
                // engine's VersionMismatch branch can take silent LWW +
                // Sentry capture on the retry instead of re-failing the
                // row. Sole-admin app per locked decision #4 — manual
                // retry IS intent to overwrite. discardFailedOutboxRows
                // does NOT set this flag (explicit give-up path).
                forceLwwOnConflict: true,
            })
            retried += 1
        }
    }

    if (retried > 0) {
        try {
            const pump =
                options.pump ??
                (async () => {
                    const engine = getSyncEngine()
                    if (engine) await engine.pump()
                })
            await pump()
        } catch {
            // Best-effort. If pump throws, the engine's interval timer will
            // pick up the now-pending rows on its next tick.
        }
    }

    return { retried }
}
