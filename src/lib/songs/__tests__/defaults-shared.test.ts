import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Multi-tenant phase 5: a shared chart's songs doc belongs to its owner, so a
// key/lead edit on this site's track row must not queue a write to it (the
// rules would refuse it and the outbox would keep retrying).

const applyEdit = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('@/lib/local/write', () => ({ applyEdit }))

import { getDb, resetDbForTests } from '@/lib/local/schema'
import { __resetForTests, flushPendingPropagations, propagateTrackEditToSong } from '@/lib/songs/defaults'

describe('sticky song defaults on shared charts', () => {
    beforeEach(async () => {
        await resetDbForTests()
        document.documentElement.dataset.org = 'crc'
        applyEdit.mockClear()
    })
    afterEach(async () => {
        __resetForTests()
        delete document.documentElement.dataset.org
        await resetDbForTests()
    })

    it('own chart: propagates as before; shared chart: nothing is queued', async () => {
        await getDb().songs.bulkPut([
            { id: 'own', title: 'Adon Olam', normalizedTitle: 'adon olam', orgId: 'crc' },
            { id: 'legacy', title: 'Barchu', normalizedTitle: 'barchu' },
            {
                id: 'nava',
                title: 'Lecha Dodi (Nava)',
                normalizedTitle: 'lecha dodi (nava)',
                orgId: 'nava-tehila',
                visibleToOrgs: ['nava-tehila', 'crc'],
            },
        ])
        for (const id of ['own', 'legacy', 'nava']) propagateTrackEditToSong(id, { key: 'D' }, 'set-1')
        await flushPendingPropagations()
        expect(applyEdit.mock.calls.map((c) => (c as unknown as [{ docId: string }])[0].docId).sort()).toEqual(['legacy', 'own'])
    })
})
