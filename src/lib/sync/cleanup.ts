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
 * v60-13-03 (2026-05-13): ALSO marks every PENDING row with
 * forceLwwOnConflict=true. Reason: the engine stops draining on the first
 * VersionMismatch (engine.ts:447 returns 'stop-drain'). Daniel UAT showed a
 * 49-row stuck queue (1 failed + 48 pending) where each pending edit hits
 * its own VersionMismatch as soon as the previous row's write changes
 * updatedAt — so retrying ONLY failed rows surfaces a "Saving forever"
 * symptom that requires 49 separate clicks to drain the queue. Marking the
 * queue tail with forceLwwOnConflict=true lets the engine's silent-LWW
 * branch auto-resolve every conflict in one drain pass, matching the
 * "manual retry IS intent to overwrite" intent of locked decision #4.
 * Sole-admin app — there is no other writer to conflict with.
 *
 * NOT touched: rows in 'sending' status (in-flight to Firestore;
 * touching them risks double-write). They'll either succeed and be
 * removed, or fail and become 'failed' next pass — either way the next
 * retry click resolves them.
 *
 * This is the systemic fix for the previous "Failed — retry" pill which
 * actually deleted rows. The button now does what its label says: retry
 * everything pending in the queue, with overwrite intent.
 */
export async function retryFailedOutboxRows(
    options: RetryFailedOptions = {},
): Promise<RetryFailedResult> {
    const db = options.db ?? getDb()
    const now = Date.now()

    // v60-13-03: include both failed AND pending rows so the entire queue
    // drains as LWW on a single retry click. Avoids the 49-clicks-to-drain
    // symptom Daniel hit with a stuck queue.
    const failedRows = await db.outbox
        .where('status')
        .equals('failed')
        .toArray()
    const pendingRows = await db.outbox
        .where('status')
        .equals('pending')
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
    // v60-13-03: also stamp pending rows with forceLwwOnConflict so the
    // engine doesn't stop-drain on the next VersionMismatch in the queue.
    // Don't reset their status/attempts/scheduledFor — those are already
    // valid; we just want the LWW flag to be honored when their turn arrives.
    for (const row of pendingRows) {
        if (row.localId !== undefined && row.forceLwwOnConflict !== true) {
            await db.outbox.update(row.localId, { forceLwwOnConflict: true })
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
