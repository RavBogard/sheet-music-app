import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import {
    deleteApp,
    getApps,
    initializeApp,
    type App,
} from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

import { commitDocumentSetlist } from '@/lib/setlist-import/commit'
import type { ResolvedTrack } from '@/lib/setlist-import/resolve'

/**
 * v70-07-03 — commitDocumentSetlist against the Firebase Local Emulator Suite.
 *
 * HFG data-layer coverage: this plan WRITES to Firestore (the doc-import commit
 * path), so it ships real-Firestore coverage — NOT a clause-(b) waiver. Rides
 * the v60-03 emulator harness (`npm run test:emulator`).
 *
 * Seeding an admin app here lets setlist-write.ts's internal initAdmin()
 * early-return true and getFirestore() auto-detect FIRESTORE_EMULATOR_HOST.
 */
describe('commitDocumentSetlist (real Firestore emulator)', () => {
    let app: App
    let db: import('firebase-admin/firestore').Firestore

    beforeAll(() => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: 'demo-commit-doc' })
        db = getFirestore(app)
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    it('AC-1: flattens a resolved structure (interleaved headers, bound charts, ungrouped last) and persists it', async () => {
        // Two sections + one ungrouped track. Track A has a libraryMatch (chart
        // bound), track B is missingChart (no chart). `order` is interleaved to
        // prove the per-section sort, not just input order.
        const tracks: ResolvedTrack[] = [
            {
                title: 'Hineh Mah Tov',
                key: 'G',
                vocalLead: 'Randy',
                sectionName: 'Pre-Service',
                order: 0,
                missingChart: false,
                libraryMatch: { fileId: 'lib-hineh', name: 'Hineh Mah Tov.pdf', confidence: 0.97 },
                recordingCandidates: [
                    { fileId: 'rec-hineh', name: 'Hineh Mah Tov.mp3', confidence: 0.95 },
                ],
            },
            {
                title: 'Mi Chamocha',
                sectionName: 'Awakening',
                order: 2,
                missingChart: true,
                recordingCandidates: [],
            },
            {
                title: 'Closing Niggun',
                order: 3,
                missingChart: true,
                recordingCandidates: [],
            },
            {
                title: 'Adon Olam',
                key: 'D',
                sectionName: 'Pre-Service',
                order: 1,
                missingChart: true,
                recordingCandidates: [],
            },
        ]

        const result = await commitDocumentSetlist({
            name: 'May 15th Shir Shabbat',
            ownerId: 'uid-commit-1',
            ownerName: 'Rabbi Daniel',
            eventDate: '2026-05-15',
            serviceType: 'friday_night',
            rabbi: 'Rabbi Daniel',
            sections: [
                { name: 'Pre-Service', order: 0 },
                { name: 'Awakening', order: 1 },
            ],
            tracks,
        })

        // 2 headers + 4 songs = 6 flattened tracks.
        expect(result.trackCount).toBe(6)
        expect(result.setlistId).toBeTruthy()

        // Parent setlist doc carries the interview metadata.
        const s = (
            await db.collection('setlists').doc(result.setlistId).get()
        ).data()!
        expect(s.name).toBe('May 15th Shir Shabbat')
        expect(s.templateType).toBe('friday_night')
        expect(s.rabbi).toBe('Rabbi Daniel')
        expect(s.eventDate).toBeTruthy()
        expect(s.trackCount).toBe(6)

        // Flattened track order: header → its songs (per-section order) →
        // next header → … → ungrouped last.
        const tracksSnap = await db
            .collection('tracks')
            .where('setlistId', '==', result.setlistId)
            .get()
        const flat = tracksSnap.docs
            .map((d) => d.data())
            .sort((a, b) => a.order - b.order)

        expect(flat.map((t) => t.title)).toEqual([
            'Pre-Service',     // header
            'Hineh Mah Tov',   // section order 0
            'Adon Olam',       // section order 1
            'Awakening',       // header
            'Mi Chamocha',     // section order 2
            'Closing Niggun',  // ungrouped, last
        ])
        expect(flat.map((t) => t.type)).toEqual([
            'header', 'song', 'song', 'header', 'song', 'song',
        ])

        // Matched chart bound; vocalLead → leadMusician.
        const hineh = flat.find((t) => t.title === 'Hineh Mah Tov')!
        expect(hineh.fileId).toBe('lib-hineh')
        expect(hineh.fileName).toBe('Hineh Mah Tov.pdf')
        expect(hineh.leadMusician).toBe('Randy')
        expect(hineh.key).toBe('G')

        // missingChart song carries no fileId; recordingCandidates ignored.
        const adon = flat.find((t) => t.title === 'Adon Olam')!
        expect(adon.fileId).toBeUndefined()
        const miChamocha = flat.find((t) => t.title === 'Mi Chamocha')!
        expect(miChamocha.fileId).toBeUndefined()
    })

    it('AC-1: a structure with no sections puts every track in the ungrouped bucket', async () => {
        const result = await commitDocumentSetlist({
            name: 'No Sections',
            ownerId: 'uid-commit-2',
            ownerName: 'Owner Two',
            sections: [],
            tracks: [
                { title: 'First', order: 0, missingChart: true, recordingCandidates: [] },
                { title: 'Second', order: 1, missingChart: true, recordingCandidates: [] },
            ],
        })

        expect(result.trackCount).toBe(2)
        const flat = (
            await db
                .collection('tracks')
                .where('setlistId', '==', result.setlistId)
                .get()
        ).docs
            .map((d) => d.data())
            .sort((a, b) => a.order - b.order)
        expect(flat.map((t) => t.title)).toEqual(['First', 'Second'])
        expect(flat.every((t) => t.type === 'song')).toBe(true)

        // No optional metadata written when omitted.
        const s = (
            await db.collection('setlists').doc(result.setlistId).get()
        ).data()!
        expect(s.eventDate).toBeUndefined()
        expect(s.templateType).toBeUndefined()
        expect(s.rabbi).toBeUndefined()
    })
})
