import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import {
    deleteApp,
    getApps,
    initializeApp,
    type App,
} from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

import {
    createSetlistServerSide,
    updateSetlistServerSide,
} from '@/lib/setlist-write'

/**
 * v70-07-01 — setlist-write.ts against the Firebase Local Emulator Suite.
 *
 * HFG data-layer coverage: this phase WRITES to Firestore (setlists/ + tracks/),
 * so it ships real-Firestore coverage — NOT a clause-(b) waiver. Rides the
 * v60-03 emulator harness (`npm run test:emulator` → firebase emulators:exec +
 * vitest.emulator.config.ts `*.emulator.test.ts` glob).
 *
 * Seeding an admin app here lets setlist-write.ts's internal initAdmin()
 * early-return true (an app already exists) and getFirestore() auto-detect
 * FIRESTORE_EMULATOR_HOST — same pattern as mcp-token-flow.emulator.test.ts.
 */
describe('setlist-write (real Firestore emulator)', () => {
    let app: App
    let db: import('firebase-admin/firestore').Firestore

    beforeAll(() => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: 'demo-setlist-write' })
        db = getFirestore(app)
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    it('AC-1: createSetlistServerSide writes the setlist doc + one tracks/{id} per track', async () => {
        const result = await createSetlistServerSide({
            name: 'Shabbat Morning',
            ownerId: 'uid-1',
            ownerName: 'Rabbi Daniel',
            eventDate: new Date('2026-05-16T12:00:00Z'),
            serviceType: 'shabbat_morning',
            rabbi: 'Rabbi Daniel',
            tracks: [
                { type: 'header', title: 'Pre-Service' },
                {
                    type: 'song',
                    title: 'Adon Olam',
                    key: 'D',
                    leadMusician: 'Randy',
                    fileId: 'lib-adon',
                    fileName: 'Adon Olam.pdf',
                },
                { type: 'song', title: 'Hineh Mah Tov' },
            ],
        })

        expect(result.trackCount).toBe(3)
        expect(result.setlistId).toBeTruthy()

        // Parent setlist doc.
        const setlistSnap = await db
            .collection('setlists')
            .doc(result.setlistId)
            .get()
        expect(setlistSnap.exists).toBe(true)
        const s = setlistSnap.data()!
        expect(s.name).toBe('Shabbat Morning')
        expect(s.ownerId).toBe('uid-1')
        expect(s.ownerName).toBe('Rabbi Daniel')
        expect(s.trackCount).toBe(3)
        expect(s.hydrated).toBe(true)
        expect(s.templateType).toBe('shabbat_morning')
        expect(s.rabbi).toBe('Rabbi Daniel')
        expect(s.eventDate).toBeTruthy()
        expect(s.date).toBeTruthy()
        expect(s.updatedAt).toBeTruthy()

        // Top-level tracks/{id} — one per input track, 0-based order in sequence.
        const tracksSnap = await db
            .collection('tracks')
            .where('setlistId', '==', result.setlistId)
            .get()
        expect(tracksSnap.size).toBe(3)
        const tracks = tracksSnap.docs
            .map((d) => d.data())
            .sort((a, b) => a.order - b.order)
        expect(tracks.map((t) => t.order)).toEqual([0, 1, 2])
        expect(tracks.map((t) => t.title)).toEqual([
            'Pre-Service',
            'Adon Olam',
            'Hineh Mah Tov',
        ])
        expect(tracks[0].type).toBe('header')
        expect(tracks[1].type).toBe('song')
        expect(tracks[1].key).toBe('D')
        expect(tracks[1].leadMusician).toBe('Randy')
        expect(tracks[1].fileId).toBe('lib-adon')
        expect(tracks[1].fileName).toBe('Adon Olam.pdf')
        expect(tracks[1].setlistId).toBe(result.setlistId)
    })

    it('AC-1: createSetlistServerSide omits eventDate / templateType / rabbi when not provided', async () => {
        const result = await createSetlistServerSide({
            name: 'Minimal',
            ownerId: 'uid-2',
            ownerName: 'Someone',
            tracks: [{ type: 'song', title: 'Only Song' }],
        })

        const s = (
            await db.collection('setlists').doc(result.setlistId).get()
        ).data()!
        expect(s.eventDate).toBeUndefined()
        expect(s.templateType).toBeUndefined()
        expect(s.rabbi).toBeUndefined()
        expect(s.trackCount).toBe(1)
        expect(result).toEqual({
            setlistId: result.setlistId,
            trackCount: 1,
        })
    })

    it('AC-2: updateSetlistServerSide patches metadata; leaves tracks / trackCount / ownerId untouched', async () => {
        const created = await createSetlistServerSide({
            name: 'Before',
            ownerId: 'uid-3',
            ownerName: 'Owner Three',
            tracks: [
                { type: 'song', title: 'T1' },
                { type: 'song', title: 'T2' },
            ],
        })
        const beforeSnap = (
            await db.collection('setlists').doc(created.setlistId).get()
        ).data()!
        const beforeUpdatedAtMs = beforeSnap.updatedAt.toMillis()

        await updateSetlistServerSide(created.setlistId, {
            name: 'After',
            rabbi: 'New Rabbi',
            serviceType: 'friday_night',
        })

        const after = (
            await db.collection('setlists').doc(created.setlistId).get()
        ).data()!
        // Patched fields.
        expect(after.name).toBe('After')
        expect(after.rabbi).toBe('New Rabbi')
        expect(after.templateType).toBe('friday_night')
        // updatedAt re-stamped (>= because emulator timestamps could collide
        // within a millisecond — the real proof is the patched fields above).
        expect(after.updatedAt.toMillis()).toBeGreaterThanOrEqual(
            beforeUpdatedAtMs,
        )
        // Untouched.
        expect(after.ownerId).toBe('uid-3')
        expect(after.trackCount).toBe(2)
        expect(after.hydrated).toBe(true)
        const tracksSnap = await db
            .collection('tracks')
            .where('setlistId', '==', created.setlistId)
            .get()
        expect(tracksSnap.size).toBe(2)
    })
})
