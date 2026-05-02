import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getDb, resetDbForTests } from '@/lib/local/schema'

import { primeSongsLibrary, type PrimeAdapter } from '../prime'

describe('primeSongsLibrary (v53-02-01)', () => {
    beforeEach(async () => {
        await resetDbForTests()
    })

    afterEach(async () => {
        await resetDbForTests()
    })

    it('writes all songs from the adapter into Dexie', async () => {
        const adapter: PrimeAdapter = {
            getAllSongs: vi.fn(async () => [
                {
                    id: 'song-1',
                    data: {
                        title: 'Adon Olam',
                        normalizedTitle: 'adon olam',
                    },
                },
                {
                    id: 'song-2',
                    data: {
                        title: 'Lecha Dodi',
                        normalizedTitle: 'lecha dodi',
                    },
                },
            ]),
        }

        const result = await primeSongsLibrary({ firestore: adapter })

        expect(result).toEqual({ written: 2 })
        const rows = await getDb().songs.toArray()
        expect(rows).toHaveLength(2)
        expect(rows.map((r) => r.id).sort()).toEqual(['song-1', 'song-2'])
        expect(rows.find((r) => r.id === 'song-1')?.title).toBe('Adon Olam')
    })

    it('is idempotent — second call overwrites without duplicating rows', async () => {
        const adapter: PrimeAdapter = {
            getAllSongs: async () => [
                {
                    id: 'song-1',
                    data: { title: 'Adon Olam (v1)' },
                },
            ],
        }
        const adapterV2: PrimeAdapter = {
            getAllSongs: async () => [
                {
                    id: 'song-1',
                    data: { title: 'Adon Olam (v2)' },
                },
            ],
        }

        await primeSongsLibrary({ firestore: adapter })
        const result = await primeSongsLibrary({ firestore: adapterV2 })

        expect(result.written).toBe(1)
        const rows = await getDb().songs.toArray()
        expect(rows).toHaveLength(1)
        expect(rows[0]?.title).toBe('Adon Olam (v2)')
    })

    it('honors the limit option', async () => {
        const adapter: PrimeAdapter = {
            getAllSongs: async () =>
                Array.from({ length: 10 }, (_, i) => ({
                    id: `song-${i}`,
                    data: { title: `Song ${i}` },
                })),
        }

        const result = await primeSongsLibrary({
            firestore: adapter,
            limit: 3,
        })

        expect(result.written).toBe(3)
        const rows = await getDb().songs.toArray()
        expect(rows).toHaveLength(3)
    })

    it('swallows adapter errors and returns { written: 0 }', async () => {
        const adapter: PrimeAdapter = {
            getAllSongs: async () => {
                throw new Error('firestore boom')
            },
        }

        const result = await primeSongsLibrary({ firestore: adapter })

        expect(result).toEqual({ written: 0 })
        const rows = await getDb().songs.toArray()
        expect(rows).toHaveLength(0)
    })

    it('skips remote rows missing a title', async () => {
        const adapter: PrimeAdapter = {
            getAllSongs: async () => [
                { id: 'good', data: { title: 'Adon Olam' } },
                { id: 'no-title', data: {} },
                { id: 'empty-title', data: { title: '   ' } },
                { id: 'good-2', data: { title: 'Lecha Dodi' } },
            ],
        }

        const result = await primeSongsLibrary({ firestore: adapter })

        expect(result.written).toBe(2)
        const rows = await getDb().songs.toArray()
        expect(rows.map((r) => r.id).sort()).toEqual(['good', 'good-2'])
    })
})
