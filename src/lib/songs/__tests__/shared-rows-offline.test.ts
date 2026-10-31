import 'fake-indexeddb/auto'
import { waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/firebase', () => ({
    subscribeWithDb: vi.fn(() => () => {}),
    recoverFromFirestoreShutdown: vi.fn(),
    getDb: vi.fn(async () => ({})),
}))
vi.mock('@/lib/pdf-worker-offline', () => ({ primeOfflineWorker: vi.fn(async () => {}) }))

import {
    chipCollections,
    chipPrefsKey,
    isSharedPickable,
    isVisibilitySectionRow,
    readChipPrefs,
    rowsForChips,
    sectionRows,
    writeChipPrefs,
    type SharedFile,
} from '@/lib/library/shared-collections'
import { cacheSharedSongs, loadSharedRows, setSharedSourceForTests, toSharedFile } from '@/lib/library/shared-source'
import { collectionIdOf, isOwnedBy, visibleTo } from '@/lib/library/visibility'
import { getDb, resetDbForTests } from '@/lib/local/schema'
import { clearAll, getFile } from '@/lib/offline-idb'
import { prefetchSetlistPDFs } from '@/lib/prefetch'
import { scopeLocalSongs, subscribeSongsLibrary, type DocChange, type SubscribeAdapter } from '@/lib/songs/subscribe'

// Multi-tenant phase 5: shared rows cache like own rows, so a setlist that
// uses a shared chart works offline, and CRC's nava rows survive the move.

const MOVED_NAVA = (id: string, name: string): SharedFile =>
    toSharedFile(id, {
        name: `${name}.pdf`,
        mimeType: 'application/pdf',
        orgId: 'nava-tehila',
        visibleToOrgs: ['nava-tehila', 'crc'],
        collection: 'nava',
        collectionId: 'nava-tehila__nava',
        status: 'active',
    })!

describe('visibility contract (lane 1 owns visibility.ts)', () => {
    it('owner and listed tenants see a row; only the owner owns it', () => {
        const row = { orgId: 'nava-tehila', visibleToOrgs: ['nava-tehila', 'crc'], collection: 'nava' }
        expect(visibleTo(row, 'crc')).toBe(true)
        expect(visibleTo(row, 'brotherslazaroff')).toBe(false)
        expect(isOwnedBy(row, 'crc')).toBe(false)
        expect(isOwnedBy({}, 'crc')).toBe(true) // no orgId = crc
        expect(collectionIdOf(row)).toBe('nava-tehila__nava')
        expect(collectionIdOf({ ...row, collectionId: 'x__y' })).toBe('x__y')
    })
})

describe('shared-collection helpers', () => {
    it('CRC nava rows after the move feed CRC’s own section, never BL’s', () => {
        const r = MOVED_NAVA('n1', 'Lecha Dodi (Nava)')
        expect(isVisibilitySectionRow(r, 'crc')).toBe(true)
        expect(isVisibilitySectionRow(r, 'brotherslazaroff')).toBe(false)
        expect(sectionRows([r], 'crc').map((x) => x.id)).toEqual(['n1'])
    })

    it('a shared core collection is a chip, not a section, and the nava record is no chip for CRC', () => {
        const recs = [
            { id: 'nava-tehila__nava', ownerOrgId: 'nava-tehila', name: 'nava', label: 'Nava Tehila' },
            { id: 'crc__core', ownerOrgId: 'crc', name: 'core', label: 'CRC Charts' },
            { id: 'bl__core', ownerOrgId: 'brotherslazaroff', name: 'core', label: 'BL Charts' },
        ]
        expect(chipCollections(recs, 'crc').map((c) => c.id)).toEqual(['bl__core'])
        expect(chipCollections(recs, 'brotherslazaroff').map((c) => c.id)).toEqual(['crc__core', 'nava-tehila__nava'])
        const shared = toSharedFile('c1', { name: 'Adon Olam.pdf', orgId: 'crc', visibleToOrgs: ['crc', 'brotherslazaroff'], collection: 'core' })!
        expect(isVisibilitySectionRow(shared, 'brotherslazaroff')).toBe(false)
        expect(rowsForChips([shared], new Set(), 'brotherslazaroff')).toEqual([])
        expect(rowsForChips([shared], new Set(['crc__core']), 'brotherslazaroff').map((r) => r.id)).toEqual(['c1'])
        expect(isSharedPickable({ ...shared, status: 'archived' }, 'brotherslazaroff')).toBe(false)
    })

    it('chip memory is per user and tenant, and survives storage that throws', () => {
        writeChipPrefs('u1', 'brotherslazaroff', new Set(['crc__core']))
        expect([...readChipPrefs('u1', 'brotherslazaroff')]).toEqual(['crc__core'])
        expect(readChipPrefs('u2', 'brotherslazaroff').size).toBe(0)
        expect(readChipPrefs('u1', 'crc').size).toBe(0)
        expect(chipPrefsKey('u1', 'crc')).toBe('sharedChips.v1:u1:crc')
        const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('blocked')
        })
        expect(readChipPrefs('u1', 'brotherslazaroff').size).toBe(0)
        spy.mockRestore()
        const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('quota')
        })
        expect(() => writeChipPrefs('u1', 'crc', new Set(['a']))).not.toThrow()
        set.mockRestore()
        localStorage.clear()
    })
})

describe('offline: shared rows cache like own rows', () => {
    beforeEach(async () => {
        await resetDbForTests()
        await clearAll()
    })
    afterEach(async () => {
        setSharedSourceForTests(null)
        vi.unstubAllGlobals()
        await resetDbForTests()
    })

    it('shared rows are written to the local songs table and survive the next (offline) scope reset', async () => {
        await getDb().songs.put({ id: 'own', title: 'Adon Olam', normalizedTitle: 'adon olam', orgId: 'crc' })
        await cacheSharedSongs([MOVED_NAVA('n1', 'Lecha Dodi (Nava)')], 'crc', getDb())
        await scopeLocalSongs(getDb(), 'crc', 'u1')
        await scopeLocalSongs(getDb(), 'crc', 'u1')
        const rows = await getDb().songs.toArray()
        expect(rows.map((r) => r.id).sort()).toEqual(['n1', 'own'])
        expect(rows.find((r) => r.id === 'n1')).toMatchObject({ title: 'Lecha Dodi (Nava)', orgId: 'nava-tehila' })
        // Another tenant's site never keeps it.
        await scopeLocalSongs(getDb(), 'brotherslazaroff', 'u1')
        expect(await getDb().songs.count()).toBe(0)
    })

    it('a row no longer shared is dropped on the next read; own rows are untouched', async () => {
        await getDb().songs.put({ id: 'own', title: 'Adon Olam', normalizedTitle: 'adon olam', orgId: 'crc' })
        await cacheSharedSongs([MOVED_NAVA('n1', 'A'), MOVED_NAVA('n2', 'B')], 'crc', getDb())
        await cacheSharedSongs([MOVED_NAVA('n2', 'B')], 'crc', getDb())
        expect((await getDb().songs.toArray()).map((r) => r.id).sort()).toEqual(['n2', 'own'])
    })

    it('a failed (offline) shared read keeps the cached rows and is retried next time', async () => {
        await cacheSharedSongs([MOVED_NAVA('n1', 'A')], 'crc', getDb())
        let calls = 0
        setSharedSourceForTests({
            listCollections: async () => [],
            listSharedRows: async () => {
                calls++
                throw new Error('offline')
            },
            ownerName: async () => null,
        })
        expect((await loadSharedRows('crc', 'u1', getDb())).failed).toBe(true)
        expect(await getDb().songs.get('n1')).toBeTruthy()
        await loadSharedRows('crc', 'u1', getDb())
        expect(calls).toBe(2)
    })

    it('the songs listener does not delete a moved row that is now shared back', async () => {
        const calls: Array<(c: DocChange[]) => void> = []
        const adapter: SubscribeAdapter = {
            subscribe(handler) {
                calls.push(handler)
                return () => {}
            },
        }
        const stop = subscribeSongsLibrary({ db: getDb(), firestore: adapter, orgId: 'crc', uid: 'u1' })
        calls[0]([{ type: 'added', id: 'own', data: { title: 'Gone', orgId: 'crc' } }])
        await waitFor(async () => expect(await getDb().songs.get('own')).toBeTruthy())
        await cacheSharedSongs([MOVED_NAVA('n1', 'A')], 'crc', getDb())
        calls[0]([
            { type: 'removed', id: 'n1', data: {} },
            { type: 'removed', id: 'own', data: {} },
        ])
        await waitFor(async () => expect(await getDb().songs.get('own')).toBeUndefined())
        expect(await getDb().songs.get('n1')).toBeTruthy()
        stop()
    })

    it('Save offline caches a shared chart’s bytes by fileId like an own chart', async () => {
        // Stay in jsdom's browser Blob realm. Node 22's native Response and
        // jsdom's FileReader Blob polyfill are not interchangeable.
        // Realistic bytes: a %PDF header and a plausible size. The save pass
        // refuses PDF-typed bodies under 64 bytes (a portal stub or a cut-off
        // download is never a chart).
        const sharedPdf = `%PDF-1.7 shared${' '.repeat(240)}%%EOF`
        const fetchSpy = vi.fn(async () => ({
            ok: true,
            headers: new Headers({ 'content-type': 'application/pdf' }),
            blob: async () => new Blob([sharedPdf], { type: 'application/pdf' }),
        } as Response))
        vi.stubGlobal('fetch', fetchSpy)
        const n = await prefetchSetlistPDFs(['own-1', 'n1'])
        expect(n).toBe(2)
        expect(fetchSpy.mock.calls.map((c) => String((c as unknown[])[0]))).toEqual([
            '/api/drive/file/own-1',
            '/api/drive/file/n1',
        ])
        expect(await (await getFile('n1'))?.text()).toBe(sharedPdf)
    })
})
