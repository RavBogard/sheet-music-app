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
 * AMENDED 2026-09-19 (R-0919-audit-2). That fix was right about the problem
 * and too broad in the remedy: `allow read: if true` granted `list` as well
 * as `get`, so it also let anyone query the whole collection, both tenants.
 * The rule is now split — `get` public, `list` signed-in — and the signed-out
 * Perform view reads its rows through /api/setlists/{setlistId}/tracks
 * instead. Scenario B below was inverted to match; everything Daniel's 2026-05-13
 * UAT was about (open the link, see the tracks) still works.
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

    it('Scenario B: unauthenticated query (where setlistId == X) is now DENIED', async () => {
        // Inverted by R-0919-audit-2 (2026-09-19). This test used to assert
        // the query succeeded, which is exactly the hole that was closed: a
        // `where` clause does not make a query anything other than a `list`,
        // and the rule cannot see the filter — so allowing it allowed
        // enumerating every track of every setlist of both tenants.
        //
        // The capability itself did not go away. Signed-out Perform gets these
        // rows from /api/setlists/{setlistId}/tracks, which is public and
        // rate-limited and can only answer for the one setlist it is given.
        // Single-document `get` below is untouched and still public.
        const unauth = testEnv.unauthenticatedContext().firestore()
        await assertFails(
            unauth.collection('tracks').where('setlistId', '==', 'setlist-1').get(),
        )
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
