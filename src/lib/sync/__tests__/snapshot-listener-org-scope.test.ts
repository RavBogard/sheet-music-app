// Both Firestore subscribers in snapshot-listener.ts must send the orgId
// filter on the live tracks query. The `tracks` list rule reads
// resource.data.orgId, so a query on setlistId alone is refused for every
// signed-in user except the platform owner (caacfb34, 2026-10-13). The rules
// side of this is asserted on the emulator in
// src/lib/__tests__/snapshot-listener-tracks-rules.emulator.test.ts.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const fs = vi.hoisted(() => ({
    where: vi.fn((field: string, op: string, value: unknown) => ({ kind: 'where', field, op, value })),
    collection: vi.fn((_db: unknown, path: string) => ({ kind: 'collection', path })),
    doc: vi.fn((_db: unknown, path: string, id: string) => ({ kind: 'doc', path, id })),
    query: vi.fn((ref: unknown, ...constraints: unknown[]) => ({ kind: 'query', ref, constraints })),
    onSnapshot: vi.fn(() => () => {}),
    getDoc: vi.fn(),
}))

vi.mock('firebase/firestore', () => ({
    Timestamp: class {},
    collection: fs.collection,
    doc: fs.doc,
    getDoc: fs.getDoc,
    onSnapshot: fs.onSnapshot,
    query: fs.query,
    where: fs.where,
}))

vi.mock('@/lib/firebase', () => ({
    // Run the setup synchronously against a fake Firestore.
    subscribeWithDb: (setup: (db: unknown) => () => void) => setup({ fake: true }),
    getDb: vi.fn(),
    auth: null,
}))

import type { Firestore } from 'firebase/firestore'
import type { LocalDb } from '../../local/schema'
import { startSnapshotListener } from '../snapshot-listener'

type Where = { kind: 'where'; field: string; op: string; value: unknown }

/** The where-constraints of every tracks query built so far. */
function tracksQueryFilters(): Where[][] {
    return fs.query.mock.calls
        .filter((c) => (c[0] as { path?: string }).path === 'tracks')
        .map((c) => (c.slice(1) as Where[]).filter((w) => w.kind === 'where'))
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0))
const db = {} as LocalDb
const logger = { warn: vi.fn(), error: vi.fn() }

describe.each([
    ['test-path subscriber (firestoreDb injected)', { firestoreDb: {} as Firestore }],
    ['production lazy subscriber', {}],
] as const)('%s', (_label, extra) => {
    beforeEach(() => {
        vi.clearAllMocks()
        document.documentElement.dataset.org = 'crc'
    })

    it.each(['crc', 'brotherslazaroff'])('filters the tracks query by the given tenant (%s)', (org) => {
        const stop = startSnapshotListener({ setlistId: 's1', db, orgId: org, logger, ...extra })
        const filters = tracksQueryFilters()
        expect(filters).toHaveLength(1)
        expect(filters[0]).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ field: 'orgId', op: '==', value: org }),
                expect.objectContaining({ field: 'setlistId', op: '==', value: 's1' }),
            ]),
        )
        stop()
    })

    it('without an orgId, waits for the setlist doc and uses its tenant', async () => {
        let resolve!: (v: unknown) => void
        fs.getDoc.mockReturnValueOnce(new Promise((r) => { resolve = r }))
        const stop = startSnapshotListener({ setlistId: 's1', db, logger, ...extra })

        // Nothing goes out on a guess before the setlist is known.
        expect(tracksQueryFilters()).toHaveLength(0)

        resolve({ exists: () => true, data: () => ({ orgId: 'brotherslazaroff' }) })
        await flush()

        const filters = tracksQueryFilters()
        expect(filters).toHaveLength(1)
        expect(filters[0]).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ field: 'orgId', value: 'brotherslazaroff' }),
                expect.objectContaining({ field: 'setlistId', value: 's1' }),
            ]),
        )
        stop()
    })

    it('without an orgId, a setlist with no stamp falls back to the host tenant', async () => {
        document.documentElement.dataset.org = 'brotherslazaroff'
        fs.getDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({}) })
        const stop = startSnapshotListener({ setlistId: 's1', db, logger, ...extra })
        await flush()
        expect(tracksQueryFilters()[0]).toEqual(
            expect.arrayContaining([expect.objectContaining({ field: 'orgId', value: 'brotherslazaroff' })]),
        )
        stop()
    })

    it('unsubscribing before the setlist resolves never attaches the tracks query', async () => {
        let resolve!: (v: unknown) => void
        fs.getDoc.mockReturnValueOnce(new Promise((r) => { resolve = r }))
        const stop = startSnapshotListener({ setlistId: 's1', db, logger, ...extra })
        stop()
        resolve({ exists: () => true, data: () => ({ orgId: 'crc' }) })
        await flush()
        expect(tracksQueryFilters()).toHaveLength(0)
    })
})
