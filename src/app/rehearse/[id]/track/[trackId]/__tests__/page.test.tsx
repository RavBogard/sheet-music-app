import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
    perform: true,
    load: vi.fn(),
}))

vi.mock('next/navigation', () => ({
    notFound: () => {
        throw new Error('NEXT_NOT_FOUND')
    },
}))
vi.mock('@/lib/org/request-org', () => ({ requestOrg: async () => ({ orgId: 'crc' }) }))
vi.mock('@/lib/org/features', () => ({ hasFeature: async (_org: string, f: string) => f === 'perform' && m.perform }))
vi.mock('../../../load', () => ({ ID_RE: /^[A-Za-z0-9_-]{1,128}$/, loadRehearse: (...a: unknown[]) => m.load(...a) }))
vi.mock('../RehearseTrackClient', () => ({ RehearseTrackClient: () => null }))

import Page from '../page'

const call = (trackId: string) => Page({ params: Promise.resolve({ id: 'sl1', trackId }) })
const song = (id: string) => ({ kind: 'song', id, title: id, key: null, bpm: null, notes: null, fileId: 'f', take: null })

beforeEach(() => {
    m.perform = true
    m.load.mockReset()
    m.load.mockResolvedValue({ name: 'S', eventDate: null, kinds: {}, rows: [song('a'), { kind: 'section', id: 'h', title: 'H' }, song('b')] })
})

describe('Rehearse chart page', () => {
    it('404s when the tenant has Perform off, without loading the setlist', async () => {
        m.perform = false
        await expect(call('a')).rejects.toThrow('NEXT_NOT_FOUND')
        expect(m.load).not.toHaveBeenCalled()
    })

    it('404s for a track that is not a song', async () => {
        await expect(call('h')).rejects.toThrow('NEXT_NOT_FOUND')
    })

    it('passes prev/next that skip section headings', async () => {
        const el = (await call('a')) as { props: { prevId: string | null; nextId: string | null } }
        expect(el.props.prevId).toBeNull()
        expect(el.props.nextId).toBe('b')
    })
})
