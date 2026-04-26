import { getDb } from './schema'
import {
    type EditDescriptor,
    type LocalCollection,
    type OutboxRow,
    WriteAtomicityError,
} from './types'

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

// Mutate the entity row + enqueue an outbox row inside ONE Dexie transaction.
// On any throw, Dexie rolls both back; callers receive a typed error.
export async function applyEdit(edit: EditDescriptor): Promise<void> {
    const db = getDb()
    const collection: LocalCollection = edit.collection
    const now = Date.now()

    try {
        await db.transaction('rw', db[collection], db.outbox, async () => {
            if (edit.op === 'set') {
                await db[collection].put(edit.doc as never)
                await db.outbox.add(
                    buildOutboxRow(edit, { ...edit.doc }, now) as OutboxRow,
                )
                return
            }

            if (edit.op === 'update') {
                const existing = await db[collection].get(edit.docId)
                if (!existing) {
                    throw new WriteAtomicityError(
                        `applyEdit update target missing: ${collection}/${edit.docId}`,
                    )
                }
                const merged = { ...existing, ...edit.patch, id: edit.docId }
                await db[collection].put(merged as never)
                await db.outbox.add(
                    buildOutboxRow(edit, { ...edit.patch }, now) as OutboxRow,
                )
                return
            }

            // delete
            await db[collection].delete(edit.docId)
            await db.outbox.add(buildOutboxRow(edit, {}, now) as OutboxRow)
        })
    } catch (err) {
        if (err instanceof WriteAtomicityError) throw err
        throw new WriteAtomicityError(
            `applyEdit transaction failed for ${edit.op} ${edit.collection}`,
            err,
        )
    }
}
