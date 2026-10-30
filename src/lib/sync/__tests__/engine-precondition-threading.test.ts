import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'

import { getDb, resetDbForTests } from '../../local/schema'
import type { OutboxRow } from '../../local/types'
import { applyEdit } from '../../local/write'
import { SyncEngine } from '../engine'
import { type FirestoreAdapter, VersionMismatchError } from '../firestore-adapter'
import { checkUpdatePrecondition } from '../init'

// Regression: opening a setlist showed "Remote changes detected" because the
// engine stamped the server `updatedAt` from one commit onto EVERY pending row
// of the same doc, including rows queued with no precondition. A server write
// landing between the two commits (an MCP edit) then failed the second row.

const flush = async () => {
    for (let i = 0; i < 8; i++) {
        await new Promise((r) => setTimeout(r, 0))
        for (let j = 0; j < 50; j++) await Promise.resolve()
    }
}

/** One remote setlist doc whose commits honour the real precondition check,
 *  exactly as ProductionFirestoreAdapter does. */
class RemoteAdapter implements FirestoreAdapter {
    stamp = 1000
    commits = 0
    beforeCommit?: (n: number) => void
    async commitOutboxRow(row: OutboxRow) {
        this.beforeCommit?.(this.commits + 1)
        const err = checkUpdatePrecondition(row.expectedUpdatedAt, this.stamp)
        if (err) throw new VersionMismatchError(err)
        this.stamp += 1.5
        this.commits++
        return { updatedAt: this.stamp }
    }
    async refreshAuthToken() {}
    async readDoc() {
        return null
    }
}

function engineWith(adapter: FirestoreAdapter) {
    const lock = {
        tryAcquire: () => true,
        onAvailable: () => {},
        onLost: () => {},
        shutdown: () => {},
    } as never
    return new SyncEngine({ adapter, lock, isOnline: () => true })
}

async function drain(engine: SyncEngine) {
    await engine.start()
    await flush()
    await engine.pump()
    await flush()
}

beforeEach(async () => {
    await resetDbForTests()
    await getDb().setlists.put({ id: 'S', ownerId: 'u', updatedAt: 1000 } as never)
})

describe('engine writeback: precondition threading', () => {
    it('leaves a precondition-free pending row precondition-free after a sibling commits', async () => {
        await applyEdit(
            { op: 'update', collection: 'setlists', docId: 'S', patch: { name: 'A' } },
            { withoutUndo: true },
        )
        await applyEdit(
            { op: 'update', collection: 'setlists', docId: 'S', patch: { name: 'B' } },
            { withoutUndo: true },
        )
        const adapter = new RemoteAdapter()
        let secondRowExpected: number | undefined | 'unseen' = 'unseen'
        // Capture what the second row carries when it reaches the adapter.
        const origCommit = adapter.commitOutboxRow.bind(adapter)
        adapter.commitOutboxRow = async (row) => {
            if (adapter.commits === 1) secondRowExpected = row.expectedUpdatedAt
            return origCommit(row)
        }
        await drain(engineWith(adapter))
        expect(adapter.commits).toBe(2)
        expect(secondRowExpected).toBeUndefined()
    })

    it('commits a precondition-free row despite an intervening server write', async () => {
        await applyEdit(
            { op: 'update', collection: 'setlists', docId: 'S', patch: { trackCount: 26 } },
            { withoutUndo: true },
        )
        await applyEdit(
            { op: 'update', collection: 'setlists', docId: 'S', patch: { songCount: 14 } },
            { withoutUndo: true },
        )
        const adapter = new RemoteAdapter()
        // An MCP write to setlists/S lands between the two rows.
        adapter.beforeCommit = (n) => {
            if (n === 2) adapter.stamp += 7.25
        }
        const engine = engineWith(adapter)
        await drain(engine)
        expect(await getDb().outbox.where('status').equals('failed').count()).toBe(0)
        expect(adapter.commits).toBe(2)
        expect(engine.getState()).not.toBe('conflict')
    })

    it('still re-stamps a pending row that carries a precondition', async () => {
        await applyEdit(
            {
                op: 'update',
                collection: 'setlists',
                docId: 'S',
                patch: { name: 'A' },
                expectedUpdatedAt: 1000,
            },
            { withoutUndo: true },
        )
        await applyEdit(
            {
                op: 'update',
                collection: 'setlists',
                docId: 'S',
                patch: { name: 'B' },
                expectedUpdatedAt: 1000,
            },
            { withoutUndo: true },
        )
        const adapter = new RemoteAdapter()
        const engine = engineWith(adapter)
        await drain(engine)
        expect(adapter.commits).toBe(2)
        expect(await getDb().outbox.count()).toBe(0)
    })
})
