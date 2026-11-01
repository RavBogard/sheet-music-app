import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
    assertFails,
    assertSucceeds,
    initializeTestEnvironment,
    type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

// PERF-15: part_presets. A member reads their own tenant's presets, the other
// tenant reads none, and no client writes (the MCP server does). Both tenants.
describe('PERF-15 firestore.rules part_presets', () => {
    let testEnv: RulesTestEnvironment

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        const [host, portStr] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':')
        testEnv = await initializeTestEnvironment({
            projectId: 'demo-perf15-part-presets',
            firestore: {
                rules: readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8'),
                host,
                port: Number.parseInt(portStr ?? '8080', 10),
            },
        })
    })

    afterAll(async () => {
        await testEnv.cleanup()
    })

    beforeEach(async () => {
        await testEnv.clearFirestore()
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
            const col = ctx.firestore().collection('part_presets')
            await col.doc('crc__user__u1').set({ orgId: 'crc', scope: { kind: 'user', uid: 'u1' }, patterns: ['Bass'] })
            await col.doc('brotherslazaroff__user__u2').set({ orgId: 'brotherslazaroff', scope: { kind: 'user', uid: 'u2' }, patterns: ['Piano'] })
        })
    })

    const crcMember = () => testEnv.authenticatedContext('u1', { m: { crc: 'me' } }).firestore()
    const blMember = () => testEnv.authenticatedContext('u2', { m: { brotherslazaroff: 'me' } }).firestore()

    it('a member reads and lists their own tenant presets', async () => {
        await assertSucceeds(crcMember().collection('part_presets').doc('crc__user__u1').get())
        const snap = await assertSucceeds(crcMember().collection('part_presets').where('orgId', '==', 'crc').get())
        expect(snap.size).toBe(1)
        const bl = await assertSucceeds(blMember().collection('part_presets').where('orgId', '==', 'brotherslazaroff').get())
        expect(bl.size).toBe(1)
    })

    it('tenant B cannot read tenant A presets, by id or by query, and the reverse', async () => {
        await assertFails(blMember().collection('part_presets').doc('crc__user__u1').get())
        await assertFails(blMember().collection('part_presets').where('orgId', '==', 'crc').get())
        await assertFails(crcMember().collection('part_presets').doc('brotherslazaroff__user__u2').get())
    })

    it('signed-out devices read nothing', async () => {
        const db = testEnv.unauthenticatedContext().firestore()
        await assertFails(db.collection('part_presets').doc('crc__user__u1').get())
    })

    it('no client writes, admin included', async () => {
        const admin = testEnv.authenticatedContext('u1', { m: { crc: 'ad' } }).firestore()
        await assertFails(admin.collection('part_presets').doc('x').set({ orgId: 'crc', patterns: [] }))
        await assertFails(admin.collection('part_presets').doc('crc__user__u1').delete())
    })
})
