import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/firebase', () => ({
    subscribeWithDb: vi.fn(() => () => {}),
    recoverFromFirestoreShutdown: vi.fn(),
}))

import { getDb, resetDbForTests } from '@/lib/local/schema'
import { SONGS_SCOPE_META_KEY, subscribeSongsLibrary, type SubscribeAdapter } from '@/lib/songs/subscribe'

type Push = Parameters<SubscribeAdapter['subscribe']>[0]

function manualAdapter() {
    let push: Push = () => {}
    const adapter: SubscribeAdapter = {
        subscribe(handler) {
            push = handler
            return () => {}
        },
    }
    return { adapter, push: (...a: Parameters<Push>) => push(...a) }
}

const flush = () => new Promise((r) => setTimeout(r, 50))
const ids = async () => (await getDb().songs.toArray()).map((s) => s.id).sort()

describe('subscribeSongsLibrary: songs deleted while away leave the picker', () => {
    beforeEach(async () => {
        await resetDbForTests()
        const db = getDb()
        await db.meta.put({ key: SONGS_SCOPE_META_KEY, value: 'crc|u1' })
        await db.songs.bulkPut([
            { id: 'kept', title: 'Kept', normalizedTitle: 'kept', orgId: 'crc' },
            { id: 'deleted', title: 'Deleted', normalizedTitle: 'deleted', orgId: 'crc' },
            // Shared to crc by another tenant: not in crc's own query.
            { id: 'shared', title: 'Shared', normalizedTitle: 'shared', orgId: 'brotherslazaroff', visibleToOrgs: ['crc'] },
        ])
    })
    afterEach(async () => {
        await resetDbForTests()
    })

    it('the first complete server snapshot drops owned rows the server no longer has', async () => {
        const { adapter, push } = manualAdapter()
        const stop = subscribeSongsLibrary({ db: getDb(), firestore: adapter, orgId: 'crc', uid: 'u1' })
        push([{ type: 'added', id: 'kept', data: { title: 'Kept', orgId: 'crc' } }], { fromCache: false, ids: ['kept'] })
        await flush()
        expect(await ids()).toEqual(['kept', 'shared'])
        stop()
    })

    it('a cached snapshot never prunes (an offline iPad keeps its picker)', async () => {
        const { adapter, push } = manualAdapter()
        const stop = subscribeSongsLibrary({ db: getDb(), firestore: adapter, orgId: 'crc', uid: 'u1' })
        push([], { fromCache: true, ids: [] })
        await flush()
        expect(await ids()).toEqual(['deleted', 'kept', 'shared'])
        stop()
    })

    it('prunes once: a row added after the first server snapshot is not swept by a later one', async () => {
        const { adapter, push } = manualAdapter()
        const stop = subscribeSongsLibrary({ db: getDb(), firestore: adapter, orgId: 'crc', uid: 'u1' })
        push([], { fromCache: false, ids: ['kept', 'deleted'] })
        await flush()
        await getDb().songs.put({ id: 'fresh', title: 'Fresh upload', normalizedTitle: 'fresh upload', orgId: 'crc' })
        push([], { fromCache: false, ids: ['kept', 'deleted'] })
        await flush()
        expect(await ids()).toEqual(['deleted', 'fresh', 'kept', 'shared'])
        stop()
    })
})
