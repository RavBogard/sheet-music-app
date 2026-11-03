import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Live-director writes go through the setlist ops client (setlist sync PR 3):
 * a key or chart change is ONE editRow on the row as the device last had it
 * from the server; an insert is ONE insert anchored at the display position,
 * with the song's defaults in the same row.
 */

const cached = new Map<string, Record<string, unknown>>()
vi.mock('@/lib/local/schema', () => ({
    getDb: () => ({ tracks: { get: async (id: string) => cached.get(id) } }),
}))
const settle = vi.hoisted(() => ({ outcome: 'ok' as 'ok' | 'offline' | 'refused' }))
vi.mock('@/lib/setlist-ops-client/actions', () => {
    class SetlistOpRefusedError extends Error {
        constructor(readonly reason: string, readonly field?: string) {
            super(reason)
        }
    }
    return {
        SetlistOpRefusedError,
        editRow: vi.fn(async (_s: string, _r: unknown, _p: unknown, o?: { onBatch?: (k: string) => void }) => o?.onBatch?.('b1')),
        insertRows: vi.fn(async (_s: string, _v: unknown, _i: number, _r: unknown, o?: { onBatch?: (k: string) => void }) => {
            o?.onBatch?.('b2')
            return ['new-row']
        }),
        settleBatch: vi.fn(async () => {
            if (settle.outcome === 'refused') throw new SetlistOpRefusedError('field', 'key')
            return settle.outcome
        }),
    }
})
vi.mock('@/lib/songs/defaults', () => ({
    seedTrackFromSong: vi.fn(async () => ({})),
}))

import { editRow, insertRows } from '@/lib/setlist-ops-client/actions'
import { seedTrackFromSong } from '@/lib/songs/defaults'
import { changeTrackKey, swapTrackChart, insertTrack } from '@/lib/live-director'
import type { DriveFile, SetlistTrack } from '@/types/models'

const mockedEdit = vi.mocked(editRow)
const mockedInsert = vi.mocked(insertRows)
const mockedSeed = vi.mocked(seedTrackFromSong)

const libFile = (id: string, fields: Partial<DriveFile> = {}): DriveFile =>
    ({ id, name: `${id}.pdf`, displayName: undefined, mimeType: 'application/pdf', ...fields }) as DriveFile
const track = (id: string): SetlistTrack => ({ id, title: `Track ${id}`, type: 'song' }) as SetlistTrack

beforeEach(() => {
    vi.clearAllMocks()
    mockedSeed.mockResolvedValue({})
    mockedInsert.mockResolvedValue(['new-row'])
    cached.clear()
    settle.outcome = "ok"
    cached.set('t1', { id: 't1', setlistId: 's1', order: 0, title: 'Lecha Dodi', key: 'F' })
})

describe('changeTrackKey', () => {
    it('one editRow on the cached server row (its values are the base)', async () => {
        await changeTrackKey('t1', 'D')
        expect(mockedEdit).toHaveBeenCalledTimes(1)
        const [setlistId, row, patch, opts] = mockedEdit.mock.calls[0]
        expect(setlistId).toBe('s1')
        expect(row).toMatchObject({ id: 't1', key: 'F' })
        expect(patch).toEqual({ key: 'D' })
        expect(opts).toMatchObject({ undo: false })
    })

    it('waits for the answer: a refusal throws with its reason (the modal stays open); offline throws offline', async () => {
        settle.outcome = 'refused'
        await expect(changeTrackKey('t1', 'D')).rejects.toMatchObject({ reason: 'field', field: 'key' })
        settle.outcome = 'offline'
        await expect(changeTrackKey('t1', 'D')).rejects.toMatchObject({ reason: 'offline' })
    })
})

describe('swapTrackChart', () => {
    it('rebinds fileId / songId / title / fileName / mimeType and the catalog key in ONE edit', async () => {
        mockedSeed.mockResolvedValue({ key: 'G', bpm: 96, lead: 'Sam' })
        await swapTrackChart('t1', libFile('c2', { displayName: 'Hinei Ma Tov', mimeType: 'image/png' }))
        expect(mockedEdit).toHaveBeenCalledTimes(1)
        expect(mockedEdit.mock.calls[0][2]).toEqual({
            fileId: 'c2',
            songId: 'c2',
            title: 'Hinei Ma Tov',
            fileName: 'c2.pdf',
            mimeType: 'image/png',
            key: 'G',
            bpm: 96,
        })
    })

    it('still swaps when the catalog defaults cannot be read', async () => {
        mockedSeed.mockRejectedValue(new Error('no row'))
        await swapTrackChart('t1', libFile('c3'))
        expect(mockedEdit.mock.calls[0][2]).toMatchObject({ fileId: 'c3', title: 'c3.pdf' })
    })
})

describe('insertTrack', () => {
    const tracks = [track('a'), track('b'), track('c')]

    it.each([
        ['append', 1, 3],
        ['before', 1, 1],
        ['after', 1, 2],
    ] as const)('%s: one insert at display index', async (placement, currentIndex, index) => {
        const id = await insertTrack({ setlistId: 's1', song: libFile('song-1'), placement, currentIndex, currentTracks: tracks })
        expect(id).toBe('new-row')
        expect(mockedInsert).toHaveBeenCalledTimes(1)
        const [setlistId, view, at, rows] = mockedInsert.mock.calls[0]
        expect(setlistId).toBe('s1')
        expect(view.map((r) => r.id)).toEqual(['a', 'b', 'c'])
        expect(at).toBe(index)
        expect(rows).toEqual([{ songId: 'song-1', fileId: 'song-1', title: 'song-1.pdf', type: 'song', mimeType: 'application/pdf' }])
    })

    it('carries the catalog defaults on the same row', async () => {
        mockedSeed.mockResolvedValue({ key: 'Am', lead: 'Sam', bpm: 70 })
        await insertTrack({ setlistId: 's1', song: libFile('song-2'), placement: 'append', currentIndex: 0, currentTracks: tracks })
        expect(mockedInsert.mock.calls[0][3][0]).toMatchObject({ key: 'Am', leadMusician: 'Sam', bpm: 70 })
    })

    it('throws when offline (structural edits need a connection), so the caller shows its error', async () => {
        mockedInsert.mockResolvedValue(null)
        await expect(
            insertTrack({ setlistId: 's1', song: libFile('song-3'), placement: 'append', currentIndex: 0, currentTracks: tracks }),
        ).rejects.toThrow(/offline/)
    })
})
