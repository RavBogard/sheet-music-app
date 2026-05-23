import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/local/write', () => ({
    applyEdit: vi.fn(async () => undefined),
}))
vi.mock('@/lib/songs/defaults', () => ({
    seedTrackFromSong: vi.fn(async () => ({})),
}))

import { applyEdit } from '@/lib/local/write'
import { seedTrackFromSong } from '@/lib/songs/defaults'
import {
    changeTrackKey,
    swapTrackChart,
    insertTrack,
} from '@/lib/live-director'
import type { DriveFile, SetlistTrack } from '@/types/models'

const mockedApplyEdit = vi.mocked(applyEdit)
const mockedSeed = vi.mocked(seedTrackFromSong)

function track(id: string, fields: Partial<SetlistTrack> = {}): SetlistTrack {
    return {
        id,
        title: `Track ${id}`,
        type: 'song',
        ...fields,
    } as SetlistTrack
}

function libFile(id: string, fields: Partial<DriveFile> = {}): DriveFile {
    return {
        id,
        name: `${id}.pdf`,
        displayName: undefined,
        mimeType: 'application/pdf',
        ...fields,
    } as DriveFile
}

beforeEach(() => {
    mockedApplyEdit.mockReset()
    mockedApplyEdit.mockResolvedValue(undefined)
    mockedSeed.mockReset()
    mockedSeed.mockResolvedValue({})
})

describe('changeTrackKey', () => {
    it('writes tracks/{id}.key via applyEdit update', async () => {
        await changeTrackKey('t1', 'D')
        expect(mockedApplyEdit).toHaveBeenCalledTimes(1)
        expect(mockedApplyEdit).toHaveBeenCalledWith({
            op: 'update',
            collection: 'tracks',
            docId: 't1',
            patch: { key: 'D' },
        })
    })

    it('passes through empty-string to clear the key (KeyPicker Clear behavior)', async () => {
        await changeTrackKey('t1', '')
        expect(mockedApplyEdit).toHaveBeenCalledWith({
            op: 'update',
            collection: 'tracks',
            docId: 't1',
            patch: { key: '' },
        })
    })
})

describe('swapTrackChart', () => {
    it('refreshes fileId / songId / title / fileName + catalog key on swap', async () => {
        mockedSeed.mockResolvedValue({ key: 'G', bpm: 90 })
        const newSong = libFile('lib-123', {
            name: 'eli_eli.musicxml',
            displayName: 'Eili Eili',
            mimeType: 'application/vnd.recordare.musicxml',
        })

        await swapTrackChart('track-A', newSong)

        expect(mockedApplyEdit).toHaveBeenCalledTimes(1)
        expect(mockedApplyEdit).toHaveBeenCalledWith({
            op: 'update',
            collection: 'tracks',
            docId: 'track-A',
            patch: {
                fileId: 'lib-123',
                songId: 'lib-123',
                title: 'Eili Eili',
                fileName: 'eli_eli.musicxml',
                mimeType: 'application/vnd.recordare.musicxml',
                key: 'G',
                bpm: 90,
            },
        })
    })

    it('falls back to song.name when displayName missing', async () => {
        const newSong = libFile('lib-2', { name: 'Adon Olam.pdf' })
        await swapTrackChart('track-A', newSong)
        expect(mockedApplyEdit.mock.calls[0]?.[0]).toMatchObject({
            patch: expect.objectContaining({ title: 'Adon Olam.pdf' }),
        })
    })

    it('still completes the swap when seedTrackFromSong throws', async () => {
        mockedSeed.mockRejectedValueOnce(new Error('songs row missing'))
        const newSong = libFile('lib-3')
        await expect(swapTrackChart('track-A', newSong)).resolves.toBeUndefined()
        expect(mockedApplyEdit).toHaveBeenCalledTimes(1)
        const patch = (mockedApplyEdit.mock.calls[0]?.[0] as { patch: Record<string, unknown> }).patch
        expect(patch.key).toBeUndefined()
        expect(patch.bpm).toBeUndefined()
    })

    it('omits mimeType when the catalog row exposes none (PDF default route remains)', async () => {
        const newSong = libFile('lib-4')
        ;(newSong as { mimeType?: string }).mimeType = ''
        await swapTrackChart('track-A', newSong)
        const patch = (mockedApplyEdit.mock.calls[0]?.[0] as { patch: Record<string, unknown> }).patch
        expect(patch).not.toHaveProperty('mimeType')
    })
})

describe('insertTrack', () => {
    const baseTracks = [
        track('t0'),
        track('t1'),
        track('t2'),
        track('t3'),
    ]

    it('append: writes the new row at order=length with no order bumps', async () => {
        const song = libFile('lib-new')
        const id = await insertTrack({
            setlistId: 'sl-1',
            song,
            placement: 'append',
            currentIndex: 1,
            currentTracks: baseTracks,
        })
        expect(typeof id).toBe('string')
        const setCalls = mockedApplyEdit.mock.calls.filter(
            (c) => (c[0] as { op: string }).op === 'set',
        )
        expect(setCalls).toHaveLength(1)
        const setDoc = (setCalls[0]![0] as { doc: Record<string, unknown> }).doc
        expect(setDoc.order).toBe(4)
        expect(setDoc.setlistId).toBe('sl-1')
        expect(setDoc.fileId).toBe('lib-new')
        expect(setDoc.songId).toBe('lib-new')
        // No order-bump updates on existing tracks for append.
        const orderBumps = mockedApplyEdit.mock.calls.filter(
            (c) =>
                (c[0] as { op: string }).op === 'update' &&
                'patch' in (c[0] as object) &&
                'order' in (c[0] as { patch: Record<string, unknown> }).patch,
        )
        expect(orderBumps).toHaveLength(0)
    })

    it('after: bumps rows downstream of currentIndex+1 and inserts at that position', async () => {
        await insertTrack({
            setlistId: 'sl-1',
            song: libFile('lib-new'),
            placement: 'after',
            currentIndex: 1,
            currentTracks: baseTracks,
        })
        // Insert position = 2 → bump t2 (index 2) → 3 and t3 (index 3) → 4.
        const bumps = mockedApplyEdit.mock.calls.filter(
            (c) =>
                (c[0] as { op: string }).op === 'update' &&
                'patch' in (c[0] as object) &&
                'order' in (c[0] as { patch: Record<string, unknown> }).patch,
        )
        expect(bumps).toHaveLength(2)
        const targets = bumps.map((c) => {
            const arg = c[0] as unknown as { docId: string; patch: { order: number } }
            return [arg.docId, arg.patch.order] as const
        })
        expect(targets).toEqual(
            expect.arrayContaining([
                ['t2', 3],
                ['t3', 4],
            ]),
        )
        const set = mockedApplyEdit.mock.calls.find(
            (c) => (c[0] as { op: string }).op === 'set',
        )!
        expect((set[0] as { doc: Record<string, unknown> }).doc.order).toBe(2)
    })

    it('before: bumps rows from currentIndex downward and inserts at that position', async () => {
        await insertTrack({
            setlistId: 'sl-1',
            song: libFile('lib-new'),
            placement: 'before',
            currentIndex: 1,
            currentTracks: baseTracks,
        })
        const bumps = mockedApplyEdit.mock.calls.filter(
            (c) =>
                (c[0] as { op: string }).op === 'update' &&
                'patch' in (c[0] as object) &&
                'order' in (c[0] as { patch: Record<string, unknown> }).patch,
        )
        expect(bumps).toHaveLength(3)
        const targets = new Map(
            bumps.map((c) => {
                const arg = c[0] as unknown as { docId: string; patch: { order: number } }
                return [arg.docId, arg.patch.order] as const
            }),
        )
        expect(targets.get('t1')).toBe(2)
        expect(targets.get('t2')).toBe(3)
        expect(targets.get('t3')).toBe(4)
        const set = mockedApplyEdit.mock.calls.find(
            (c) => (c[0] as { op: string }).op === 'set',
        )!
        expect((set[0] as { doc: Record<string, unknown> }).doc.order).toBe(1)
    })

    it('seeds key/lead/bpm defaults from the song catalog row when present', async () => {
        mockedSeed.mockResolvedValue({ key: 'A', lead: 'Bryn', bpm: 88 })
        await insertTrack({
            setlistId: 'sl-1',
            song: libFile('lib-new'),
            placement: 'append',
            currentIndex: 0,
            currentTracks: [track('t0')],
        })
        const seedPatch = mockedApplyEdit.mock.calls
            .map((c) => c[0] as { op: string; patch?: Record<string, unknown> })
            .find(
                (e) =>
                    e.op === 'update' &&
                    e.patch &&
                    ('key' in e.patch || 'leadMusician' in e.patch || 'bpm' in e.patch),
            )
        expect(seedPatch?.patch).toEqual({ key: 'A', leadMusician: 'Bryn', bpm: 88 })
    })

    it('does NOT emit a defaults patch when the catalog row has none', async () => {
        mockedSeed.mockResolvedValue({})
        await insertTrack({
            setlistId: 'sl-1',
            song: libFile('lib-new'),
            placement: 'append',
            currentIndex: 0,
            currentTracks: [track('t0')],
        })
        const updates = mockedApplyEdit.mock.calls.filter(
            (c) => (c[0] as { op: string }).op === 'update',
        )
        // append → 0 order bumps + 0 seed patches.
        expect(updates).toHaveLength(0)
    })
})
