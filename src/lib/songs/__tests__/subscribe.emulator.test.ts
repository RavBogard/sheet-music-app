import 'fake-indexeddb/auto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb, resetDbForTests } from '@/lib/local/schema'
import { subscribeSongsLibrary } from '@/lib/songs/subscribe'

/**
 * v60-09-01 — subscribeSongsLibrary real-Firestore emulator round-trip.
 *
 * Proves the snapshot-listener contract end-to-end against a real Firestore
 * emulator (NOT an in-memory adapter): writes via firebase-admin trigger
 * onSnapshot delivery, which drives `db.songs.put/delete` in Dexie. Five
 * cases cover the full listener lifecycle: initial / modify /
 * archive-as-status-change / delete / unsubscribe.
 *
 * Adapter choice: firebase-admin's onSnapshot wraps the same emulator
 * connection as the production firebase/firestore client. We use admin for
 * both write and listen because the client SDK depends on streaming APIs
 * that jsdom doesn't fully implement; the SubscribeAdapter abstraction
 * isolates this implementation detail. Firestore's snapshot semantics are
 * shared between the two SDKs — the helper's docChange handling logic +
 * Dexie write path are what this test validates.
 *
 * HFG counter rationale: introducing a new snapshot listener is the same
 * class of engine-adjacent change v60-03 used the emulator harness for.
 * Without this file the listener would inherit a clause-(b) waiver moving
 * the counter from 0/3 → 1/3 — exactly what v60-09 plan boundary forbids.
 */
describe('v60-09-01 subscribeSongsLibrary (real Firestore emulator)', () => {
    let adminDb: import('firebase-admin/firestore').Firestore

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()

        const { initializeApp, getApps } = await import('firebase-admin/app')
        const { getFirestore } = await import('firebase-admin/firestore')
        if (getApps().length === 0) {
            initializeApp({ projectId: 'demo-v60-09-01' })
        }
        adminDb = getFirestore()
    })

    beforeEach(async () => {
        await resetDbForTests()
        const snap = await adminDb.collection('songs').get()
        const batch = adminDb.batch()
        snap.docs.forEach((d) => batch.delete(d.ref))
        if (snap.size > 0) await batch.commit()
    })

    /** Adapter wrapping admin SDK's onSnapshot for the same emulator. */
    function buildAdapter() {
        return {
            subscribe(
                handler: (
                    changes: import('@/lib/songs/subscribe').DocChange[],
                ) => void,
                onError: (err: unknown) => void,
            ): () => void {
                return adminDb.collection('songs').onSnapshot(
                    (snap) => {
                        handler(
                            snap.docChanges().map((c) => ({
                                type: c.type,
                                id: c.doc.id,
                                data: c.doc.data() as Partial<
                                    import('@/lib/local/types').LocalSong
                                >,
                            })),
                        )
                    },
                    (err) => onError(err),
                )
            },
        }
    }

    async function waitForDexie<T>(
        predicate: () => Promise<T | undefined | null>,
        timeoutMs = 5000,
    ): Promise<T> {
        const start = Date.now()
        while (Date.now() - start < timeoutMs) {
            const value = await predicate()
            if (value) return value
            await new Promise((r) => setTimeout(r, 50))
        }
        throw new Error('waitForDexie timeout')
    }

    it('initial snapshot populates Dexie with existing songs/* docs', async () => {
        await adminDb.collection('songs').doc('foo').set({
            title: 'Foo Song',
            normalizedTitle: 'foo song',
            status: 'active',
            updatedAt: 1000,
        })

        const unsubscribe = subscribeSongsLibrary({ firestore: buildAdapter() })

        const row = await waitForDexie(() => getDb().songs.get('foo'))
        expect(row.title).toBe('Foo Song')
        expect(row.status).toBe('active')

        unsubscribe()
    })

    it('modify propagates to Dexie within the listener tick', async () => {
        await adminDb.collection('songs').doc('foo').set({
            title: 'Old Title',
            normalizedTitle: 'old title',
            status: 'active',
            updatedAt: 1000,
        })

        const unsubscribe = subscribeSongsLibrary({ firestore: buildAdapter() })

        await waitForDexie(() => getDb().songs.get('foo'))

        await adminDb.collection('songs').doc('foo').set(
            {
                title: 'New Title',
                normalizedTitle: 'new title',
                updatedAt: 2000,
            },
            { merge: true },
        )

        const updated = await waitForDexie(async () => {
            const r = await getDb().songs.get('foo')
            return r && r.title === 'New Title' ? r : undefined
        })
        expect(updated.title).toBe('New Title')

        unsubscribe()
    })

    it('archive (status change) propagates to Dexie without deleting the row', async () => {
        await adminDb.collection('songs').doc('foo').set({
            title: 'Foo',
            normalizedTitle: 'foo',
            status: 'active',
            updatedAt: 1000,
        })

        const unsubscribe = subscribeSongsLibrary({ firestore: buildAdapter() })

        await waitForDexie(() => getDb().songs.get('foo'))

        await adminDb
            .collection('songs')
            .doc('foo')
            .set({ status: 'archived', updatedAt: 2000 }, { merge: true })

        const archived = await waitForDexie(async () => {
            const r = await getDb().songs.get('foo')
            return r && r.status === 'archived' ? r : undefined
        })
        expect(archived.status).toBe('archived')
        expect(archived.title).toBe('Foo')

        unsubscribe()
    })

    it('delete removes the row from Dexie', async () => {
        await adminDb.collection('songs').doc('foo').set({
            title: 'Foo',
            normalizedTitle: 'foo',
            status: 'active',
            updatedAt: 1000,
        })

        const unsubscribe = subscribeSongsLibrary({ firestore: buildAdapter() })

        await waitForDexie(() => getDb().songs.get('foo'))

        await adminDb.collection('songs').doc('foo').delete()

        const start = Date.now()
        while (Date.now() - start < 5000) {
            const r = await getDb().songs.get('foo')
            if (!r) break
            await new Promise((r) => setTimeout(r, 50))
        }
        expect(await getDb().songs.get('foo')).toBeUndefined()

        unsubscribe()
    })

    it('unsubscribe stops further Dexie writes', async () => {
        await adminDb.collection('songs').doc('foo').set({
            title: 'Before',
            normalizedTitle: 'before',
            status: 'active',
            updatedAt: 1000,
        })

        const unsubscribe = subscribeSongsLibrary({ firestore: buildAdapter() })
        await waitForDexie(() => getDb().songs.get('foo'))

        unsubscribe()

        await adminDb
            .collection('songs')
            .doc('foo')
            .set({ title: 'After Unsubscribe', updatedAt: 2000 }, { merge: true })

        await new Promise((r) => setTimeout(r, 300))

        const row = await getDb().songs.get('foo')
        expect(row?.title).toBe('Before')
    })
})
