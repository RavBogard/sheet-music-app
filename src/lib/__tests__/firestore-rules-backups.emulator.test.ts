import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
    assertFails,
    assertSucceeds,
    initializeTestEnvironment,
    type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

/**
 * PGR-01 — firestore.rules backups/{YYYY-MM-DD} audit collection.
 *
 * The /api/cron/backup route writes a dated audit doc per run via the Admin
 * SDK (which bypasses these rules). These rules pin the client-facing surface:
 *   - reads are admin-only (staleness/observability for Daniel; feeds PGR-03);
 *   - ALL client writes are denied (admin included) — only the server may
 *     write, so a hard `false` prevents forged backup records.
 *
 * Runs against the Firebase emulator via `npm run test:emulator`.
 */
describe('PGR-01 firestore.rules backups/{id}', () => {
    let testEnv: RulesTestEnvironment

    const backups = (db: ReturnType<ReturnType<RulesTestEnvironment['authenticatedContext']>['firestore']>) =>
        db.collection('backups')

    const auditDoc = {
        ts: Date.now(),
        timestamp: '2026-05-21T03-00-00-000Z',
        status: 'export_initiated',
        type: 'gcs',
        bucketPath: 'gs://centralreform-backups/backups/2026-05-21T03-00-00-000Z',
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        const [host, portStr] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':')
        const port = Number.parseInt(portStr ?? '8080', 10)

        testEnv = await initializeTestEnvironment({
            projectId: 'demo-pgr01-backups',
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
        // Seed config/admins so isAdmin()'s get() resolves a real (empty) doc
        // rather than relying on CEL error-absorption for non-admin paths.
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
            await ctx.firestore().collection('config').doc('admins').set({ uids: [] })
            // Seed an audit doc the Admin-SDK way for the read assertions.
            await ctx.firestore().collection('backups').doc('2026-05-21').set(auditDoc)
        })
    })

    // ─── Reads: admin-only ───

    it('A: unauthenticated read is DENIED', async () => {
        const db = testEnv.unauthenticatedContext().firestore()
        await assertFails(backups(db).doc('2026-05-21').get())
    })

    it('B: member read is DENIED', async () => {
        const db = testEnv.authenticatedContext('member-uid', { role: 'member' }).firestore()
        await assertFails(backups(db).doc('2026-05-21').get())
    })

    it('C: musician read is DENIED', async () => {
        const db = testEnv.authenticatedContext('musician-uid', { role: 'musician' }).firestore()
        await assertFails(backups(db).doc('2026-05-21').get())
    })

    it('D: admin (role claim) read is ALLOWED', async () => {
        const db = testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore()
        await assertSucceeds(backups(db).doc('2026-05-21').get())
    })

    // ─── Writes: server-only (everyone denied, admin included) ───

    it('E: unauthenticated write is DENIED', async () => {
        const db = testEnv.unauthenticatedContext().firestore()
        await assertFails(backups(db).doc('2026-05-22').set(auditDoc))
    })

    it('F: member write is DENIED', async () => {
        const db = testEnv.authenticatedContext('member-uid', { role: 'member' }).firestore()
        await assertFails(backups(db).doc('2026-05-22').set(auditDoc))
    })

    it('G: admin write is DENIED (server-only — admin cannot forge a backup record)', async () => {
        const db = testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore()
        await assertFails(backups(db).doc('2026-05-22').set(auditDoc))
    })

    it('H: admin update/delete is DENIED', async () => {
        const db = testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore()
        await assertFails(backups(db).doc('2026-05-21').update({ status: 'tampered' }))
        await assertFails(backups(db).doc('2026-05-21').delete())
    })
})
