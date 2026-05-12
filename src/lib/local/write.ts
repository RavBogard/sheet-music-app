import { recordEdit } from '../sync/edit-log'
import { getSyncEngine } from '../sync/init'

import { getDb } from './schema'
import {
    type EditDescriptor,
    type LocalCollection,
    type OutboxRow,
    WriteAtomicityError,
} from './types'
import {
    useUndoStore,
    type SimpleUndoEntry,
    type UndoableDoc,
} from './undo-store'

export interface ApplyEditOptions {
    /** Skip pushing an undo snapshot for this write. Used by:
     *  - The undo/redo handler itself (replaying inverses shouldn't
     *    create new undo entries — they're already on the redo stack)
     *  - Composite-undo cascades (Duplicate row's order-bump cascade,
     *    bulk-set fanout, bulk-delete fanout) — the caller collects
     *    prevDocs first, fires N applyEdit({withoutUndo:true}) calls,
     *    then pushes ONE composite entry. */
    withoutUndo?: boolean
    /** Burst-coalesce key. Same key within UNDO_BURST_MS collapses to
     *  one entry. Default: `${collection}:${docId}`. Cell-level callers
     *  should pass `${collection}:${docId}:${field}` so different fields
     *  on the same row each get their own undo unit. */
    undoKey?: string
}

function buildOutboxRow(
    edit: EditDescriptor,
    payload: Record<string, unknown>,
    now: number,
): Omit<OutboxRow, 'localId'> {
    const expectedUpdatedAt =
        edit.op === 'update' || edit.op === 'delete'
            ? edit.expectedUpdatedAt
            : undefined
    return {
        status: 'pending',
        scheduledFor: now,
        op: edit.op,
        collection: edit.collection,
        docId: edit.op === 'set' ? edit.doc.id : edit.docId,
        payload,
        expectedUpdatedAt,
        attempts: 0,
        createdAt: now,
    }
}

function targetDocId(edit: EditDescriptor): string {
    return edit.op === 'set' ? edit.doc.id : edit.docId
}

// Mutate the entity row + enqueue an outbox row inside ONE Dexie transaction.
// On any throw, Dexie rolls both back; callers receive a typed error.
//
// v50-05-05: when `options.withoutUndo` is falsy, applyEdit also reads the
// prevDoc BEFORE the transaction and pushes a snapshot to the undo store
// AFTER the transaction commits. The push happens after success so that
// failed writes don't leave phantom undo entries.
export async function applyEdit(
    edit: EditDescriptor,
    options?: ApplyEditOptions,
): Promise<void> {
    const db = getDb()
    const collection: LocalCollection = edit.collection
    const now = Date.now()
    const docId = targetDocId(edit)

    // Capture prevDoc before write for undo snapshot. Skip for set ops
    // since they create or overwrite the doc — prevDoc is read for the
    // snapshot but not used by the inverse (set's inverse is delete).
    let prevDoc: UndoableDoc | undefined
    if (!options?.withoutUndo) {
        try {
            const existing = (await db[collection].get(docId)) as
                | UndoableDoc
                | undefined
            prevDoc = existing
        } catch {
            // If the prevDoc read fails for any reason, proceed without
            // an undo snapshot rather than blocking the write. Undo is
            // a best-effort affordance, never a precondition.
            prevDoc = undefined
        }
    }

    try {
        // Bug 2 fix (2026-05-12): tombstones table participates in this tx
        // so delete-intent and physical-delete land atomically. On 'set' we
        // also remove any stale tombstone — re-creating a docId clears its
        // tombstone. On 'delete' we write the tombstone keyed by
        // [collection+docId] (compound primary key auto-dedupes).
        await db.transaction(
            'rw',
            db[collection],
            db.outbox,
            db.tombstones,
            async () => {
                if (edit.op === 'set') {
                    await db[collection].put(edit.doc as never)
                    await db.outbox.add(
                        buildOutboxRow(edit, { ...edit.doc }, now) as OutboxRow,
                    )
                    // Defensive: if a tombstone exists for this docId (user
                    // deleted then recreated with same id — rare but
                    // possible), clear it so the new set isn't blocked by
                    // server-priming guards.
                    await db.tombstones.delete([collection, edit.doc.id])
                    return
                }

                if (edit.op === 'update') {
                    const existing = await db[collection].get(edit.docId)
                    if (!existing) {
                        throw new WriteAtomicityError(
                            `applyEdit update target missing: ${collection}/${edit.docId}`,
                        )
                    }
                    const merged = {
                        ...existing,
                        ...edit.patch,
                        id: edit.docId,
                    }
                    await db[collection].put(merged as never)
                    await db.outbox.add(
                        buildOutboxRow(edit, { ...edit.patch }, now) as OutboxRow,
                    )
                    return
                }

                // delete — write tombstone alongside the physical delete +
                // outbox enqueue. Tombstone survives outbox loss (auto-
                // resolve, dead-letter, user-discard) so subsequent server-
                // priming passes (hydrator, snapshot-listener) can refuse to
                // resurrect a row the user intentionally removed.
                const existingForTombstone = (await db[collection].get(
                    edit.docId,
                )) as { updatedAt?: number } | undefined
                await db[collection].delete(edit.docId)
                await db.outbox.add(buildOutboxRow(edit, {}, now) as OutboxRow)
                await db.tombstones.put({
                    collection,
                    docId: edit.docId,
                    deletedAt: now,
                    originalUpdatedAt: existingForTombstone?.updatedAt,
                })
            },
        )
    } catch (err) {
        if (err instanceof WriteAtomicityError) throw err
        throw new WriteAtomicityError(
            `applyEdit transaction failed for ${edit.op} ${edit.collection}`,
            err,
        )
    }

    // v5h3-01-02: edit-log breadcrumb. Fire-and-forget; recordEdit is
    // failure-swallowing so this never blocks or crashes the caller. Placed
    // OUTSIDE the Dexie tx so instrumentation can't corrupt applyEdit's
    // atomicity (see boundaries in v5h3-01-02-PLAN.md).
    const payloadKeys =
        edit.op === 'set'
            ? Object.keys(edit.doc)
            : edit.op === 'update'
              ? Object.keys(edit.patch)
              : []
    void recordEdit({
        ts: now,
        source: 'apply-edit',
        op: edit.op,
        collection: edit.collection,
        docId,
        payloadKeys,
    })

    // T1.2 fix (2026-05-12): nudge the engine. Without this, if the pump
    // drains to idle and a new edit lands without a concurrent network /
    // lock event, scheduleNextPump early-returns (engine.ts:524) and the
    // pump stays asleep. Edits then sit in the outbox until something
    // unrelated wakes the engine. Fire-and-forget — notifyEditCommitted is
    // async but we don't gate the user's write on the network round-trip.
    // In test environments where the engine hasn't booted (no <SyncEngineBoot/>
    // mounted), getSyncEngine() returns null and the optional-chain no-ops.
    void getSyncEngine()?.notifyEditCommitted()

    // After commit: read newDoc + push undo snapshot. Fire-and-forget so
    // we don't block the user-perceived save latency on the snapshot.
    if (!options?.withoutUndo) {
        const undoKey = options?.undoKey ?? `${collection}:${docId}`
        // Resolve newDoc post-write. For delete ops it's undefined.
        let newDoc: UndoableDoc | undefined
        if (edit.op !== 'delete') {
            try {
                newDoc = (await db[collection].get(docId)) as
                    | UndoableDoc
                    | undefined
            } catch {
                newDoc = undefined
            }
        }

        const entry: SimpleUndoEntry = {
            kind: 'simple',
            op: edit.op,
            collection,
            docId,
            prevDoc,
            newDoc,
            ts: now,
        }

        // Update ops are the burst-coalescing target (cell-level edits).
        // Set + delete are atomic by nature — push immediately.
        if (edit.op === 'update') {
            useUndoStore.getState().pushEntryDebounced(entry, undoKey)
        } else {
            useUndoStore.getState().pushEntry(entry)
        }
    }
}
