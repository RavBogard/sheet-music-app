import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
    assertFails,
    initializeTestEnvironment,
    type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

/**
 * Batch chart intake — firestore.rules upload_batches/{batchId}.
 *
 * The collection is server-only: the MCP batch-intake tools, the Inngest import
 * processor and /api/cron/import-batches-resume all reach it through the Admin
 * SDK (which bypasses these rules), and the drop-zone iframe reaches it only
 * through those tools. A batch doc names staged Storage paths and the library
 * rows a duplicate matched against, so BOTH reads and writes are denied to
 * every client — admin included.
 *
 * Runs against the Firebase emulator via `npm run test:emulator`.
 */
describe('firestore.rules upload_batches/{batchId}', () => {
    let testEnv: RulesTestEnvironment

    const batchDoc = {
        ownerUid: 'rabbi-daniel',
        orgId: 'crc',
        source: 'dropzone',
        status: 'open',
        defaults: {},
        counts: { total: 0, pending: 0, imported: 0, parked: 0, failed: 0, skipped: 0 },
        items: {},
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        const [host, portStr] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':')
        const port = Number.parseInt(portStr ?? '8080', 10)

        testEnv = await initializeTestEnvironment({
            projectId: 'demo-upload-batches-rules',
            firestore: {
                rules: readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8'),
                host,
                port,
            },
        })
    })

    afterAll(async () => {
        await testEnv.cleanup()
    })

    beforeEach(async () => {
        await testEnv.clearFirestore()
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
            await ctx.firestore().collection('config').doc('admins').set({ uids: [] })
            await ctx.firestore().collection('upload_batches').doc('ub-aaaaaaaaaaaa').set(batchDoc)
        })
    })

    it('A: unauthenticated read is DENIED', async () => {
        const db = testEnv.unauthenticatedContext().firestore()
        await assertFails(db.collection('upload_batches').doc('ub-aaaaaaaaaaaa').get())
    })

    it('B: the batch owner cannot read their own batch (server-only)', async () => {
        const db = testEnv.authenticatedContext('rabbi-daniel', { role: 'admin' }).firestore()
        await assertFails(db.collection('upload_batches').doc('ub-aaaaaaaaaaaa').get())
    })

    it('C: band_leader read is DENIED', async () => {
        const db = testEnv.authenticatedContext('leader-uid', { role: 'band_leader' }).firestore()
        await assertFails(db.collection('upload_batches').doc('ub-aaaaaaaaaaaa').get())
    })

    it('D: listing the collection is DENIED', async () => {
        const db = testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore()
        await assertFails(db.collection('upload_batches').get())
    })

    it('E: create is DENIED (admin cannot forge a batch)', async () => {
        const db = testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore()
        await assertFails(db.collection('upload_batches').doc('ub-bbbbbbbbbbbb').set(batchDoc))
    })

    it('F: update is DENIED (no client can flip an item to imported)', async () => {
        const db = testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore()
        await assertFails(
            db.collection('upload_batches').doc('ub-aaaaaaaaaaaa').update({ status: 'done' }),
        )
    })

    it('G: delete is DENIED', async () => {
        const db = testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore()
        await assertFails(db.collection('upload_batches').doc('ub-aaaaaaaaaaaa').delete())
    })
})
