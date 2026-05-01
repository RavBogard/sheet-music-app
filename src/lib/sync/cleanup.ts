// v52-03-01: outbox cleanup primitives — user-initiated recovery for the
// terminal `failed` FSM state. Only deletes rows with status === 'failed';
// pending / sending rows are preserved (in-flight work must not be lost).
//
// Recovery flow:
//   1. User taps the failed-state SyncIndicator action button.
//   2. SyncIndicator calls `clearFailedOutboxRows()`.
//   3. Failed rows are removed from `db.outbox`.
//   4. The engine's existing interval-based pump observes the now-clean
//      outbox on its next tick and the FSM derives back to 'idle' (or
//      'offline' if still offline). No explicit `engine.pump()` nudge
//      from this module — keeps cleanup decoupled from engine internals,
//      mirroring v50-06-03's "write to Dexie, let pump observe" pattern.

import { getDb } from '@/lib/local/schema'
import type { LocalDb } from '@/lib/local/schema'

export interface ClearFailedResult {
    removed: number
}

export interface ClearFailedOptions {
    db?: LocalDb
}

export async function clearFailedOutboxRows(
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
