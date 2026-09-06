import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { initializeApp as initWebApp, deleteApp } from 'firebase/app'
import {
    connectAuthEmulator,
    getAuth,
    signInWithCustomToken,
    type Auth,
} from 'firebase/auth'
import {
    collection,
    connectFirestoreEmulator,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    initializeFirestore,
    query,
    setDoc,
    where,
    type Firestore,
} from 'firebase/firestore'

import { reconcileSetlistTrackCount } from '@/lib/sync/track-count-sync'

/**
 * Cycle-9 Lane B — trackCount drift-producer regression.
 *
 * Exercises the REAL production `reconcileSetlistTrackCount` (the function the
 * sync-engine flush chokepoint calls after every client track create/delete)
 * against REAL emulator Firestore under REAL `firestore.rules` — high fidelity
 * per [[feedback_harness_real_firestore]] (in-memory fakes miss rule + write
 * semantics).
 *
 * Auth: `firestore.rules` gates `setlists` update on the band_leader/admin token
 * role claim (or owner). We mint an admin custom token carrying
 * `{ role: 'band_leader' }` and sign the modular Web SDK in, mirroring how the
 * in-app grid editor (a band_leader) actually writes.
 *
 * The tests reproduce the producer bug — a track add/delete that does NOT touch
 * the parent counter (exactly what SetlistGrid.tsx does) — then prove the
 * reconcile leaves `trackCount === tracks/.size` for both add and remove, heals
 * the observed 45-vs-30 drift, is idempotent, and never resurrects a missing
 * parent.
 */

const PROJECT_ID = 'demo-cycle9-trackcount'
const OWNER_UID = 'leader-uid'

let webDb: Firestore
let webAuth: Auth
const webAppName = 'cycle9-trackcount-web'
let webApp: any
let adminDb: import('firebase-admin/firestore').Firestore

async function seedSetlist(
    setlistId: string,
    declaredCount: number,
    trackCount: number,
): Promise<void> {
    // Seed via Admin SDK (rules-bypassed) so we can plant arbitrary drift
    // (declaredCount != trackCount) the way real production data drifted.
    const batch = adminDb.batch()
    batch.set(adminDb.collection('setlists').doc(setlistId), {
        name: `Setlist ${setlistId}`,
        ownerId: OWNER_UID,
        hydrated: true,
        trackCount: declaredCount,
    })
    for (let i = 0; i < trackCount; i++) {
        batch.set(adminDb.collection('tracks').doc(`${setlistId}-t${i}`), {
            id: `${setlistId}-t${i}`,
            setlistId,
            title: `Song ${i}`,
            order: i,
            type: 'song',
        })
    }
    await batch.commit()
}

async function readDeclaredCount(setlistId: string): Promise<number | undefined> {
    const snap = await getDoc(doc(webDb, 'setlists', setlistId))
    return snap.exists()
        ? (snap.data() as { trackCount?: number }).trackCount
        : undefined
}

async function actualTrackCount(setlistId: string): Promise<number> {
    const snap = await getDocs(
        query(collection(webDb, 'tracks'), where('setlistId', '==', setlistId)),
    )
    return snap.size
}

describe('cycle-9 Lane B — reconcileSetlistTrackCount (real emulator Firestore + rules)', () => {
    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toBeTruthy()

        // Admin app — seeds fixtures (rules-bypassed) + mints a band_leader
        // custom token for the Web client.
        const { initializeApp: initAdminApp, getApps } = await import(
            'firebase-admin/app'
        )
        const { getFirestore } = await import('firebase-admin/firestore')
        const { getAuth: getAdminAuth } = await import('firebase-admin/auth')
        if (!getApps().some((a) => a.name === '[DEFAULT]')) {
            initAdminApp({ projectId: PROJECT_ID })
        }
        adminDb = getFirestore()
        const customToken = await getAdminAuth().createCustomToken(OWNER_UID, {
            role: 'band_leader',
        })

        // Modular Web SDK app — the SDK the production adapter uses. Point it
        // at the emulators and sign in as the band_leader.
        webApp = initWebApp({ projectId: PROJECT_ID, apiKey: 'fake-api-key' }, webAppName)
        webDb = initializeFirestore(webApp, {})
        const [fsHost, fsPort] = (
            process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080'
        ).split(':')
        connectFirestoreEmulator(webDb, fsHost, Number.parseInt(fsPort, 10))
        webAuth = getAuth(webApp)
        connectAuthEmulator(
            webAuth,
            `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`,
            { disableWarnings: true },
        )
        await signInWithCustomToken(webAuth, customToken)
    })

    afterAll(async () => {
        try {
            await deleteApp(webApp)
        } catch {
            // best-effort teardown
        }
    })

    beforeEach(async () => {
        // Each test uses a distinct setlistId; clear the collections so a
        // re-run starts clean.
        const setlists = await adminDb.collection('setlists').get()
        const tracks = await adminDb.collection('tracks').get()
        const batch = adminDb.batch()
        setlists.forEach((d) => batch.delete(d.ref))
        tracks.forEach((d) => batch.delete(d.ref))
        await batch.commit()
    })

    it('add: an in-app track add (no counter maintenance) is reconciled to actual', async () => {
        const id = 'sl-add'
        await seedSetlist(id, 3, 3)

        // Reproduce SetlistGrid's add: write a new tracks/{id} doc and DO NOT
        // touch the parent trackCount.
        await setDoc(doc(webDb, 'tracks', `${id}-new`), {
            id: `${id}-new`,
            setlistId: id,
            title: 'Newly added',
            order: 3,
            type: 'song',
        })
        expect(await readDeclaredCount(id)).toBe(3) // drifted low pre-fix

        await reconcileSetlistTrackCount(webDb, id)

        expect(await readDeclaredCount(id)).toBe(4)
        expect(await readDeclaredCount(id)).toBe(await actualTrackCount(id))
    })

    it('remove: an in-app track delete (no counter maintenance) is reconciled to actual', async () => {
        const id = 'sl-remove'
        await seedSetlist(id, 3, 3)

        // Reproduce SetlistGrid's row delete.
        await deleteDoc(doc(webDb, 'tracks', `${id}-t1`))
        expect(await readDeclaredCount(id)).toBe(3) // drifted high pre-fix

        await reconcileSetlistTrackCount(webDb, id)

        expect(await readDeclaredCount(id)).toBe(2)
        expect(await readDeclaredCount(id)).toBe(await actualTrackCount(id))
    })

    it('heals the observed 45-vs-30 inflation drift to the true count', async () => {
        const id = 'sl-drift'
        await seedSetlist(id, 45, 30) // declared 45, actually 30 (C8I2-003 shape)

        await reconcileSetlistTrackCount(webDb, id)

        expect(await readDeclaredCount(id)).toBe(30)
        expect(await readDeclaredCount(id)).toBe(await actualTrackCount(id))
    })

    it('is idempotent — a second reconcile after no mutation is a no-op', async () => {
        const id = 'sl-idem'
        await seedSetlist(id, 10, 4)

        await reconcileSetlistTrackCount(webDb, id)
        expect(await readDeclaredCount(id)).toBe(4)
        await reconcileSetlistTrackCount(webDb, id)
        expect(await readDeclaredCount(id)).toBe(4)
    })

    it('swallows a missing parent — never resurrects a deleted setlist as a stub', async () => {
        const id = 'sl-orphan'
        // Tracks exist but the parent setlist doc does NOT (orphan shape).
        await adminDb.collection('tracks').doc(`${id}-t0`).set({
            id: `${id}-t0`,
            setlistId: id,
            title: 'Orphan',
            order: 0,
            type: 'song',
        })

        await expect(
            reconcileSetlistTrackCount(webDb, id),
        ).resolves.toBeUndefined()

        const parent = await getDoc(doc(webDb, 'setlists', id))
        expect(parent.exists()).toBe(false)
    })
})
