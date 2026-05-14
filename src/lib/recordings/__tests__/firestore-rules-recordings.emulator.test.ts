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
 * v70-02-01 — firestore.rules recordings/{recordingId} rule coverage.
 *
 * The recordings/{id} collection is NEW in v7.0 (reference audio for songs;
 * songId is an optional FK). Rules mirror songs/{songId}: read for members,
 * write for band-leader/admin. Recordings are band-internal content — NOT
 * part of the public perform view, so unauthenticated read is REJECTED
 * (unlike tracks/*, which v60-12-01 opened to public read).
 *
 * Firestore rules edits are high-blast-radius — this suite is the safety net.
 * Runs against the Firebase emulator (port 8080). Invoked via
 * `npm run test:emulator` which wraps with `firebase emulators:exec`.
 */
describe('v70-02-01 firestore.rules recordings/{recordingId}', () => {
    let testEnv: RulesTestEnvironment

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        const [host, portStr] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':')
        const port = Number.parseInt(portStr ?? '8080', 10)

        testEnv = await initializeTestEnvironment({
            projectId: 'demo-v70-02-01',
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
        // Seed a song + a recording via privileged context (bypasses rules).
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
            const db = ctx.firestore()
            await db.collection('songs').doc('song-1').set({
                title: 'Dodi Li',
                normalizedTitle: 'dodi li',
                status: 'active',
            })
            await db.collection('recordings').doc('rec-1').set({
                songId: 'song-1',
                title: 'Reference Take',
                storagePath: 'recordings/rec-1.mp3',
                notes: 'Randy, 2024 rehearsal',
                createdAt: Date.now(),
                createdBy: 'leader-uid',
            })
        })
    })

    it('Scenario A: unauthenticated read on recordings/{recordingId} is REJECTED', async () => {
        const unauth = testEnv.unauthenticatedContext().firestore()
        await assertFails(unauth.collection('recordings').doc('rec-1').get())
    })

    it('Scenario B: member read on recordings/{recordingId} SUCCEEDS', async () => {
        const member = testEnv.authenticatedContext('member-uid', { role: 'member' }).firestore()
        await assertSucceeds(member.collection('recordings').doc('rec-1').get())
    })

    it('Scenario C: member query (where songId == X) SUCCEEDS and returns the recording', async () => {
        const member = testEnv.authenticatedContext('member-uid', { role: 'member' }).firestore()
        const snap = await assertSucceeds(
            member.collection('recordings').where('songId', '==', 'song-1').get(),
        )
        expect((snap as { size: number }).size).toBe(1)
    })

    it('Scenario D: unauthenticated CREATE on recordings/{recordingId} is REJECTED', async () => {
        const unauth = testEnv.unauthenticatedContext().firestore()
        await assertFails(
            unauth.collection('recordings').doc('new-rec').set({
                songId: 'song-1',
                title: 'Hacker Take',
                storagePath: 'recordings/new-rec.mp3',
                createdAt: Date.now(),
                createdBy: 'anon',
            }),
        )
    })

    it('Scenario E: unauthenticated UPDATE on recordings/{recordingId} is REJECTED', async () => {
        const unauth = testEnv.unauthenticatedContext().firestore()
        await assertFails(
            unauth.collection('recordings').doc('rec-1').update({ title: 'Hacked' }),
        )
    })

    it('Scenario F: unauthenticated DELETE on recordings/{recordingId} is REJECTED', async () => {
        const unauth = testEnv.unauthenticatedContext().firestore()
        await assertFails(unauth.collection('recordings').doc('rec-1').delete())
    })

    it('Scenario G: member-only user (role=member) CANNOT write — write-side regression check', async () => {
        const member = testEnv.authenticatedContext('member-uid', { role: 'member' }).firestore()
        await assertFails(
            member.collection('recordings').doc('member-rec').set({
                songId: 'song-1',
                title: 'Member Take',
                storagePath: 'recordings/member-rec.mp3',
                createdAt: Date.now(),
                createdBy: 'member-uid',
            }),
        )
    })

    it('Scenario H: band-leader CAN create — existing-shape regression check', async () => {
        const leader = testEnv
            .authenticatedContext('leader-uid', { role: 'band_leader' })
            .firestore()
        await assertSucceeds(
            leader.collection('recordings').doc('leader-rec').set({
                songId: 'song-1',
                title: 'Leader Take',
                storagePath: 'recordings/leader-rec.mp3',
                createdAt: Date.now(),
                createdBy: 'leader-uid',
            }),
        )
    })

    it('Scenario I: band-leader CAN update and delete', async () => {
        const leader = testEnv
            .authenticatedContext('leader-uid', { role: 'band_leader' })
            .firestore()
        await assertSucceeds(
            leader.collection('recordings').doc('rec-1').update({ notes: 'updated note' }),
        )
        await assertSucceeds(leader.collection('recordings').doc('rec-1').delete())
    })

    it('Scenario J: admin CAN create', async () => {
        const admin = testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore()
        await assertSucceeds(
            admin.collection('recordings').doc('admin-rec').set({
                songId: 'song-1',
                title: 'Admin Take',
                storagePath: 'recordings/admin-rec.mp3',
                createdAt: Date.now(),
                createdBy: 'admin-uid',
            }),
        )
    })
})
