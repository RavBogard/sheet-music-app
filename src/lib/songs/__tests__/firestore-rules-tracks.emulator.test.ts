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
 * v60-12-01 — firestore.rules tracks/{trackId} public-read rule coverage.
 *
 * Daniel UAT 2026-05-13: incognito-browser visitors to centralreform.live
 * could click "Perform" on the upcoming setlist but the page showed "No
 * tracks yet" because tracks/{trackId} required isMember() to read.
 * v60-12-01 opened public read on tracks/{trackId}; writes remain
 * locked to band-leader/admin.
 *
 * This suite is the safety net. Firestore rules edits are high-blast-radius
 * (a typo can lock out production). The 8 scenarios cover the read-write
 * matrix for unauthenticated / member-only / band-leader / admin contexts.
 *
 * Runs against the Firebase emulator (port 8080) set up by v60-03. Invoked
 * via `npm run test:emulator` which wraps with `firebase emulators:exec`.
 */
describe('v60-12-01 firestore.rules tracks/{trackId}', () => {
    let testEnv: RulesTestEnvironment

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        const [host, portStr] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':')
        const port = Number.parseInt(portStr ?? '8080', 10)

        testEnv = await initializeTestEnvironment({
            projectId: 'demo-v60-12-01',
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
        // Seed a setlist + 3 tracks via privileged context (bypasses rules).
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
            const db = ctx.firestore()
            await db.collection('setlists').doc('setlist-1').set({
                name: 'Test',
                ownerId: 'leader-uid',
                hydrated: true,
                trackCount: 3,
            })
            for (let i = 0; i < 3; i++) {
                await db.collection('tracks').doc(`track-${i}`).set({
                    setlistId: 'setlist-1',
                    title: `Song ${i}`,
                    order: i,
                    type: 'song',
                })
            }
        })
    })

    it('Scenario A: unauthenticated single-doc read on tracks/{trackId} SUCCEEDS', async () => {
        const unauth = testEnv.unauthenticatedContext().firestore()
        await assertSucceeds(unauth.collection('tracks').doc('track-0').get())
    })

    it('Scenario B: unauthenticated query (where setlistId == X) SUCCEEDS and returns all 3 docs', async () => {
        const unauth = testEnv.unauthenticatedContext().firestore()
        const snap = await assertSucceeds(
            unauth.collection('tracks').where('setlistId', '==', 'setlist-1').get(),
        )
        expect((snap as { size: number }).size).toBe(3)
    })

    it('Scenario C: unauthenticated CREATE on tracks/{trackId} is REJECTED', async () => {
        const unauth = testEnv.unauthenticatedContext().firestore()
        await assertFails(
            unauth.collection('tracks').doc('new-track').set({
                setlistId: 'setlist-1',
                title: 'Hacker Song',
                order: 99,
                type: 'song',
            }),
        )
    })

    it('Scenario D: unauthenticated UPDATE on tracks/{trackId} is REJECTED', async () => {
        const unauth = testEnv.unauthenticatedContext().firestore()
        await assertFails(
            unauth.collection('tracks').doc('track-0').update({ title: 'Hacked' }),
        )
    })

    it('Scenario E: unauthenticated DELETE on tracks/{trackId} is REJECTED', async () => {
        const unauth = testEnv.unauthenticatedContext().firestore()
        await assertFails(unauth.collection('tracks').doc('track-0').delete())
    })

    it('Scenario F: member-only user (role=member) CANNOT write — write-side regression check', async () => {
        const member = testEnv.authenticatedContext('member-uid', { role: 'member' }).firestore()
        await assertFails(
            member.collection('tracks').doc('member-track').set({
                setlistId: 'setlist-1',
                title: 'Member Song',
                order: 99,
                type: 'song',
            }),
        )
    })

    it('Scenario G: band-leader CAN write — existing behavior regression check', async () => {
        const leader = testEnv
            .authenticatedContext('leader-uid', { role: 'band_leader' })
            .firestore()
        await assertSucceeds(
            leader.collection('tracks').doc('leader-track').set({
                setlistId: 'setlist-1',
                title: 'Leader Song',
                order: 99,
                type: 'song',
            }),
        )
    })

    it('Scenario H: admin CAN write — existing behavior regression check', async () => {
        const admin = testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore()
        await assertSucceeds(
            admin.collection('tracks').doc('admin-track').set({
                setlistId: 'setlist-1',
                title: 'Admin Song',
                order: 99,
                type: 'song',
            }),
        )
    })
})
