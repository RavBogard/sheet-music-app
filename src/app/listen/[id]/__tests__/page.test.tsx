import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
    setlist: null as null | Record<string, unknown>,
    hostOrg: 'crc',
    tracks: [] as Array<Record<string, unknown>>,
    featured: vi.fn(),
}))

vi.mock('next/navigation', () => ({
    notFound: () => {
        throw new Error('NEXT_NOT_FOUND')
    },
}))
vi.mock('@/lib/firebase-admin', () => ({
    initAdmin: () => true,
    getFirestore: () => ({
        collection: () => ({
            doc: () => ({
                get: async () => ({ exists: !!m.setlist, id: 'sl1', data: () => m.setlist }),
            }),
        }),
    }),
}))
vi.mock('@/lib/org/request-org', () => ({ requestOrg: async () => ({ orgId: m.hostOrg }) }))
vi.mock('@/lib/server-auth', () => ({ serializeSetlist: (id: string, d: object) => ({ id, ...d }) }))
vi.mock('@/lib/server-tracks', () => ({ getTracksForSetlist: async () => m.tracks }))
vi.mock('@/lib/recordings/featured-server', () => ({ getFeaturedForSongs: (...a: unknown[]) => m.featured(...a) }))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }))
vi.mock('../ListenClient', () => ({ ListenClient: () => null }))

import ListenPage from '../page'

const call = (id: string) => ListenPage({ params: Promise.resolve({ id }) })

beforeEach(() => {
    m.setlist = { name: 'Shabbat', orgId: 'crc' }
    m.hostOrg = 'crc'
    m.tracks = [{ id: 't1', title: 'Hashkivenu', type: 'song', songId: 's1' }]
    m.featured.mockReset()
    m.featured.mockResolvedValue({})
})

describe('Listen page', () => {
    it('a setlist from another tenant host is a 404', async () => {
        m.hostOrg = 'brotherslazaroff'
        await expect(call('sl1')).rejects.toThrow('NEXT_NOT_FOUND')
    })

    it('a missing setlist is a 404', async () => {
        m.setlist = null
        await expect(call('sl1')).rejects.toThrow('NEXT_NOT_FOUND')
    })

    it('a malformed id is a 404', async () => {
        await expect(call('../x')).rejects.toThrow('NEXT_NOT_FOUND')
    })

    it('a featured-lookup failure still renders the rows', async () => {
        m.featured.mockRejectedValue(new Error('boom'))
        const el = (await call('sl1')) as { props: { rows: Array<{ title: string; take: unknown }> } }
        expect(el.props.rows).toEqual([{ kind: 'song', id: 't1', title: 'Hashkivenu', take: null }])
    })
})
