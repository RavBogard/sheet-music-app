import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getTracksForSetlist } from '@/lib/server-tracks'

/**
 * v60-04-01 → v60-08-01 — getTracksForSetlist single-branch reader.
 *
 * Real Firestore (Local Emulator Suite) proves the post-cleanup contract:
 * the helper ALWAYS queries top-level `tracks/{id}` rows for a setlistId,
 * regardless of any `hydrated` flag on the setlist document. v60-08-01
 * removed the unhydrated-array fallback after universal backfill.
 *
 * Rides the v60-03 emulator harness (Java JDK 21 + `firebase emulators:exec`
 * + vitest.emulator.config.ts `*.emulator.test.ts` glob). HFG counter stays
 * at 0/3 — this file remains real-Firestore coverage, NOT a clause-(b) waiver.
 */
describe('v60-08-01 getTracksForSetlist (real Firestore emulator)', () => {
    let db: import('firebase-admin/firestore').Firestore

    beforeAll(async () => {
        const { initializeApp, getApps } = await import('firebase-admin/app')
        const { getFirestore } = await import('firebase-admin/firestore')

        if (getApps().length === 0) {
            initializeApp({ projectId: 'demo-v60-08-01' })
        }
        db = getFirestore()

        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
    })

    // Each test uses a unique setlistId so we don't need cross-test cleanup;
    // the emulator's per-`emulators:exec` lifecycle handles teardown.
    let setlistCounter = 0
    const nextSetlistId = () => `v60-08-01-S-${++setlistCounter}`

    beforeEach(() => {
        // No-op; setlistCounter increments per test.
    })

    it('hydrated setlist: returns top-level tracks/{id} rows and IGNORES stale embedded tracks[]', async () => {
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

        // Seed the parent setlist with a stale embedded array — the helper
        // must NOT return the stale row.
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

    it('unhydrated setlist: ALSO reads top-level tracks/{id} (no embedded fallback)', async () => {
        const setlistId = nextSetlistId()

        // Seed a single top-level row; embedded array carries different data.
        await db.collection('tracks').doc(`${setlistId}-T1`).set({
            setlistId,
            order: 0,
            title: 'Top-level Wins',
            type: 'song',
            updatedAt: 1000,
        })

        const setlistData = {
            hydrated: false,
            updatedAt: 5000,
            tracks: [
                { title: 'SHOULD_NOT_APPEAR', order: 0 },
                { title: 'ALSO_NOT', order: 1 },
            ],
        }
        await db.collection('setlists').doc(setlistId).set(setlistData)

        const rows = await getTracksForSetlist(db, setlistId, setlistData)

        // Post-v60-08-01: hydrated flag is no longer consulted.
        expect(rows.map((r) => r.title)).toEqual(['Top-level Wins'])
        expect(rows.find((r) => r.title === 'SHOULD_NOT_APPEAR')).toBeUndefined()
    })

    it('setlist with no top-level rows: returns [] (no embedded fallback)', async () => {
        const setlistId = nextSetlistId()

        // No tracks/* rows seeded. Setlist carries legacy embedded array.
        const setlistData = {
            hydrated: false,
            updatedAt: 7000,
            tracks: [
                { title: 'Embedded Only', order: 0 },
            ],
        }
        await db.collection('setlists').doc(setlistId).set(setlistData)

        const rows = await getTracksForSetlist(db, setlistId, setlistData)

        expect(rows).toEqual([])
    })

    it('sorts top-level rows by order ascending', async () => {
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
