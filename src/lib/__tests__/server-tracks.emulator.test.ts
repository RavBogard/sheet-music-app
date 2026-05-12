import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getTracksForSetlist } from '@/lib/server-tracks'

/**
 * v60-04-01 — getTracksForSetlist hydration-aware reader.
 *
 * Real Firestore (Local Emulator Suite) proves the branching contract that
 * v60-04 introduces: hydrated setlists read top-level `tracks/{id}` rows;
 * unhydrated setlists fall back to the embedded `setlists/{S}.tracks[]`.
 *
 * Rides the v60-03 emulator harness (Java JDK 21 + `firebase emulators:exec`
 * + vitest.emulator.config.ts `*.emulator.test.ts` glob). HFG counter stays
 * at 0/3 — this file adds real coverage, NOT a clause-(b) waiver.
 */
describe('v60-04-01 getTracksForSetlist (real Firestore emulator)', () => {
    let db: import('firebase-admin/firestore').Firestore

    beforeAll(async () => {
        const { initializeApp, getApps } = await import('firebase-admin/app')
        const { getFirestore } = await import('firebase-admin/firestore')

        if (getApps().length === 0) {
            initializeApp({ projectId: 'demo-v60-04-01' })
        }
        db = getFirestore()

        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
    })

    // Each test uses a unique setlistId so we don't need cross-test cleanup;
    // the emulator's per-`emulators:exec` lifecycle handles teardown.
    let setlistCounter = 0
    const nextSetlistId = () => `v60-04-01-S-${++setlistCounter}`

    beforeEach(() => {
        // No-op; setlistCounter increments per test.
    })

    it('hydrated branch: returns top-level tracks/{id} rows and IGNORES stale embedded tracks[]', async () => {
        const setlistId = nextSetlistId()

        // Seed two top-level track rows under setlistId.
        await db.collection('tracks').doc(`${setlistId}-T1`).set({
            setlistId,
            order: 0,
            title: 'Adon Olam',
            type: 'song',
            updatedAt: 1000,
        })
        await db.collection('tracks').doc(`${setlistId}-T2`).set({
            setlistId,
            order: 1,
            title: 'Avinu Malkenu',
            type: 'song',
            updatedAt: 2000,
        })

        // Seed the parent setlist with hydrated:true AND a stale embedded
        // array — the helper must NOT return the stale row.
        const setlistData = {
            hydrated: true,
            updatedAt: 3000,
            tracks: [{ title: 'STALE_DO_NOT_RETURN', order: 0 }],
        }
        await db.collection('setlists').doc(setlistId).set(setlistData)

        const rows = await getTracksForSetlist(db, setlistId, setlistData)

        expect(rows.map((r) => r.title)).toEqual(['Adon Olam', 'Avinu Malkenu'])
        expect(rows.find((r) => r.title === 'STALE_DO_NOT_RETURN')).toBeUndefined()
        expect(rows).toHaveLength(2)
    })

    it('unhydrated branch: returns embedded setlist.tracks[] (top-level rows IGNORED)', async () => {
        const setlistId = nextSetlistId()

        // Seed a top-level row that MUST NOT appear in the result, to prove
        // the unhydrated branch did not query the tracks collection.
        await db.collection('tracks').doc(`${setlistId}-T1`).set({
            setlistId,
            order: 0,
            title: 'SHOULD_NOT_APPEAR',
            type: 'song',
            updatedAt: 1000,
        })

        const setlistData = {
            hydrated: false,
            updatedAt: 5000,
            tracks: [
                { title: 'Embedded Song 1', order: 0 },
                { title: 'Embedded Song 2', order: 1 },
            ],
        }
        await db.collection('setlists').doc(setlistId).set(setlistData)

        const rows = await getTracksForSetlist(db, setlistId, setlistData)

        expect(rows.map((r) => r.title)).toEqual(['Embedded Song 1', 'Embedded Song 2'])
        expect(rows.find((r) => r.title === 'SHOULD_NOT_APPEAR')).toBeUndefined()
        // Embedded rows inherit the setlist's updatedAt (buildLocalTracks contract).
        expect(rows.every((r) => r.updatedAt === 5000)).toBe(true)
    })

    it('hydrated branch: sorts top-level rows by order ascending', async () => {
        const setlistId = nextSetlistId()

        // Insert out of order to prove the sort happens client-side in the helper.
        await db.collection('tracks').doc(`${setlistId}-T1`).set({
            setlistId,
            order: 2,
            title: 'Third',
            updatedAt: 1000,
        })
        await db.collection('tracks').doc(`${setlistId}-T2`).set({
            setlistId,
            order: 0,
            title: 'First',
            updatedAt: 1000,
        })
        await db.collection('tracks').doc(`${setlistId}-T3`).set({
            setlistId,
            order: 1,
            title: 'Second',
            updatedAt: 1000,
        })

        const setlistData = { hydrated: true, updatedAt: 9000, tracks: [] }
        await db.collection('setlists').doc(setlistId).set(setlistData)

        const rows = await getTracksForSetlist(db, setlistId, setlistData)

        expect(rows.map((r) => r.title)).toEqual(['First', 'Second', 'Third'])
        expect(rows.map((r) => r.order)).toEqual([0, 1, 2])
    })
})
