import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Multi-tenant phase 2 — browser setlist writers and the defaults pointer:
 *   - every seeded track (create / duplicate / clone / save-as-template)
 *     carries the parent setlist's orgId;
 *   - saveAsTemplate stamps orgId on the new setlist;
 *   - config/defaults is per tenant (crc keeps `defaults`, others `defaults__<org>`);
 *   - the wizard's last-matching-service fallback query is narrowed to the tenant.
 */

const h = vi.hoisted(() => ({
    added: [] as Array<{ path: string; data: Record<string, unknown> }>,
    edits: [] as Array<Record<string, unknown>>,
    sourceTracks: [] as Array<Record<string, unknown>>,
    getDoc: vi.fn(),
    getDocs: vi.fn(),
    setDoc: vi.fn(),
    where: vi.fn((...args: unknown[]) => ({ __where: args })),
    query: vi.fn((...args: unknown[]) => ({ __query: args })),
}))

vi.mock('firebase/firestore', () => {
    const ref = (...args: unknown[]) => ({ args, withConverter: () => ({ args }) })
    return {
        collection: (_db: unknown, path: string) => ({ path, withConverter: () => ({ path }) }),
        doc: (...args: unknown[]) => ref(...args),
        addDoc: async (col: { path: string }, data: Record<string, unknown>) => {
            h.added.push({ path: col.path, data })
            return { id: `new-${h.added.length}` }
        },
        getDoc: (...a: unknown[]) => h.getDoc(...a),
        getDocs: (...a: unknown[]) => h.getDocs(...a),
        setDoc: (...a: unknown[]) => h.setDoc(...a),
        query: (...a: unknown[]) => h.query(...a),
        where: (...a: unknown[]) => h.where(...a),
        orderBy: (...a: unknown[]) => ({ __orderBy: a }),
        limit: (n: number) => ({ __limit: n }),
        updateDoc: vi.fn(), deleteDoc: vi.fn(), onSnapshot: vi.fn(), writeBatch: vi.fn(),
        runTransaction: vi.fn(), deleteField: vi.fn(),
        serverTimestamp: () => ({ __ts: true }),
        Timestamp: Object.assign(function Timestamp() {}, {
            fromDate: (d: Date) => ({ toDate: () => d }),
            now: () => ({}),
        }),
    }
})
vi.mock('@/lib/firebase', () => ({ getDb: async () => ({}), subscribeWithDb: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('@/lib/api-client', () => ({ apiFetch: vi.fn() }))
vi.mock('@/lib/setlist-audit', () => ({ logSetlistChange: vi.fn() }))
vi.mock('@/lib/sync/sentry-capture', () => ({ captureSyncFailure: vi.fn() }))
vi.mock('@/types/schemas', () => ({ setlistConverter: {} }))
vi.mock('@/lib/local/write', () => ({
    applyEdit: async (edit: { doc: Record<string, unknown> }) => { h.edits.push(edit.doc) },
}))
vi.mock('@/lib/client-tracks', () => ({
    fetchTracksForSetlistClient: async () => h.sourceTracks,
}))
vi.mock('@/lib/liturgical-calendar', () => ({
    getFullServiceContext: async () => ({}),
    getServiceContext: () => ({ type: 'friday_night' }),
}))
vi.mock('@/lib/liturgical-templates', () => ({ generateSetlistName: () => 'Cloned' }))

import { createSetlistService, defaultsDocId, type Setlist } from '@/lib/setlist-firebase'

const svc = () => createSetlistService('u1', 'Tester')
const BL = 'brotherslazaroff'

beforeEach(() => {
    h.added.length = 0
    h.edits.length = 0
    h.sourceTracks = [
        { id: 't1', title: 'One', order: 0, setlistId: 'src' },
        { id: 't2', title: 'Two', order: 1, setlistId: 'src' },
    ]
    h.getDoc.mockReset()
    h.getDocs.mockReset()
    h.setDoc.mockReset()
    h.where.mockClear()
    document.documentElement.dataset.org = BL
})
afterEach(() => { delete document.documentElement.dataset.org })

describe('seeded tracks carry the parent setlist orgId', () => {
    it('createSetlist: host tenant on the setlist and on every track', async () => {
        await svc().createSetlist('New', [
            { id: 'a', title: 'A' } as never,
            { id: 'b', title: 'B' } as never,
        ])
        expect(h.added[0].data.orgId).toBe(BL)
        expect(h.edits.map((t) => t.orgId)).toEqual([BL, BL])
        expect(h.edits.every((t) => t.setlistId === 'new-1')).toBe(true)
    })

    it('createSetlist: an explicit additionalData.orgId wins for both', async () => {
        await svc().createSetlist('New', [{ id: 'a', title: 'A' } as never], { orgId: 'crc' } as never)
        expect(h.added[0].data.orgId).toBe('crc')
        expect(h.edits[0].orgId).toBe('crc')
    })

    it('duplicateSetlist: the source setlist tenant', async () => {
        document.documentElement.dataset.org = 'crc'
        await svc().duplicateSetlist('src', { id: 'src', name: 'S', orgId: BL } as Setlist)
        expect(h.added[0].data.orgId).toBe(BL)
        expect(h.edits.map((t) => t.orgId)).toEqual([BL, BL])
    })

    it('cloneSetlist: the source setlist tenant', async () => {
        document.documentElement.dataset.org = 'crc'
        await svc().cloneSetlist({ id: 'src', name: 'S', orgId: BL } as Setlist, new Date(2026, 9, 16))
        expect(h.added[0].data.orgId).toBe(BL)
        expect(h.edits.map((t) => t.orgId)).toEqual([BL, BL])
    })

    it('a source without orgId is crc (rowOrg)', async () => {
        await svc().duplicateSetlist('src', { id: 'src', name: 'S' } as Setlist)
        expect(h.edits.map((t) => t.orgId)).toEqual(['crc', 'crc'])
    })
})

describe('saveAsTemplate', () => {
    it('stamps orgId on the template setlist and its tracks', async () => {
        await svc().saveAsTemplate({ id: 'src', name: 'S', orgId: BL } as Setlist)
        expect(h.added[0].data).toMatchObject({ isTemplate: true, orgId: BL })
        expect(h.edits.map((t) => t.orgId)).toEqual([BL, BL])
    })

    it('a crc source stays crc', async () => {
        await svc().saveAsTemplate({ id: 'src', name: 'S', orgId: 'crc' } as Setlist)
        expect(h.added[0].data.orgId).toBe('crc')
    })
})

describe('per-tenant defaults', () => {
    it('defaultsDocId: crc keeps defaults, others defaults__<org>', () => {
        expect(defaultsDocId('crc')).toBe('defaults')
        expect(defaultsDocId(BL)).toBe('defaults__brotherslazaroff')
    })

    it('setDefaultForServiceType writes the tenant doc', async () => {
        await svc().setDefaultForServiceType('friday_night', 'sl1', BL)
        const [ref] = h.setDoc.mock.calls[0] as [{ args: unknown[] }]
        expect(ref.args.slice(1)).toEqual(['config', 'defaults__brotherslazaroff'])
        await svc().setDefaultForServiceType('friday_night', 'sl1', 'crc')
        const [ref2] = h.setDoc.mock.calls[1] as [{ args: unknown[] }]
        expect(ref2.args.slice(1)).toEqual(['config', 'defaults'])
    })

    it('getDefaultForServiceType reads the tenant doc', async () => {
        h.getDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({ friday_night: 'p1' }) })
        expect(await svc().getDefaultForServiceType('friday_night', BL)).toBe('p1')
        const [ref] = h.getDoc.mock.calls[0] as [{ args: unknown[] }]
        expect(ref.args.slice(1)).toEqual(['config', 'defaults__brotherslazaroff'])
    })

    it('the host tenant is the default when no org is passed', async () => {
        await svc().setDefaultForServiceType('friday_night', 'sl1')
        const [ref] = h.setDoc.mock.calls[0] as [{ args: unknown[] }]
        expect(ref.args.slice(1)).toEqual(['config', 'defaults__brotherslazaroff'])
    })
})

describe('findLastMatchingService', () => {
    it('narrows the fallback query to the tenant and ignores another tenant pointer target', async () => {
        // pointer → a CRC setlist (should be ignored for BL)
        h.getDoc
            .mockResolvedValueOnce({ exists: () => true, data: () => ({ friday_night: 'crc-sl' }) })
            .mockResolvedValueOnce({ exists: () => true, data: () => ({ id: 'crc-sl', orgId: 'crc', templateType: 'friday_night', date: new Date(2026, 3, 17) }) })
        h.getDocs.mockResolvedValueOnce({
            docs: [{ data: () => ({ id: 'bl-sl', orgId: BL, templateType: 'friday_night', date: new Date(2026, 3, 17) }) }],
        })
        const found = await svc().findLastMatchingService('friday_night', new Date(2026, 3, 30), BL)
        expect(found?.id).toBe('bl-sl')
        expect(h.where).toHaveBeenCalledWith('orgId', '==', BL)
    })
})
