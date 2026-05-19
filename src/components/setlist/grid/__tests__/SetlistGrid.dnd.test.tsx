import 'fake-indexeddb/auto'
import '@testing-library/jest-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getDb, resetDbForTests } from '@/lib/local/schema'
import type { LocalSong, LocalTrack } from '@/lib/local/types'

// jsdom stubs (cmdk needs both).
class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
}
const g = globalThis as unknown as {
    ResizeObserver?: typeof ResizeObserverStub
}
g.ResizeObserver = ResizeObserverStub
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function () {}
}

const mockBack = vi.fn()
vi.mock('next/navigation', () => ({
    useRouter: () => ({ back: mockBack, push: vi.fn(), refresh: vi.fn() }),
}))

const seedSpy = vi.fn()
vi.mock('@/lib/songs/defaults', () => ({
    propagateTrackEditToSong: vi.fn(),
    seedTrackFromSong: (id: string) => seedSpy(id),
    flushPendingPropagations: vi.fn(),
    __resetForTests: vi.fn(),
}))

import { SetlistGrid } from '../SetlistGrid'

async function seedTracks(setlistId: string, rows: Partial<LocalTrack>[]) {
    const db = getDb()
    const docs: LocalTrack[] = rows.map((r, i) => ({
        id: r.id ?? `${setlistId}-track-${i}`,
        setlistId,
        order: r.order ?? i,
        ...r,
    }))
    await db.tracks.bulkPut(docs)
}

async function seedSongs(songs: Partial<LocalSong>[]) {
    const db = getDb()
    const docs: LocalSong[] = songs.map((s) => ({
        id: s.id ?? `song-${s.title}`,
        title: s.title ?? '',
        normalizedTitle: (s.title ?? '').toLowerCase(),
        ...s,
    }))
    await db.songs.bulkPut(docs)
}

async function getOutboxRows() {
    return getDb().outbox.toArray()
}

describe('SetlistGrid (drag / add / delete)', () => {
    beforeEach(async () => {
        await resetDbForTests()
        seedSpy.mockReset()
        seedSpy.mockResolvedValue({})
        mockBack.mockClear()
    })

    afterEach(async () => {
        await resetDbForTests()
    })

    it('AC-7 add-row: picking a library song with defaults issues set + update', async () => {
        await seedTracks('set-1', [
            { id: 't-1', order: 0, title: 'Adon Olam' },
        ])
        await seedSongs([
            {
                id: 'song-lecha-dodi',
                title: 'Lecha Dodi',
                defaults: { key: 'G', lead: 'Randy', bpm: 90 },
            },
        ])
        seedSpy.mockResolvedValue({ key: 'G', lead: 'Randy', bpm: 90 })

        render(<SetlistGrid setlistId="set-1" />)
        await screen.findByText('Adon Olam')

        await getDb().outbox.clear()

        const trigger = screen.getByTestId('add-row-trigger')
        const user = userEvent.setup()
        await user.click(trigger)

        const filterInput = await screen.findByPlaceholderText(
            /type a song title/i,
        )
        await user.type(filterInput, 'Lecha')
        await user.keyboard('{Enter}')

        await waitFor(async () => {
            const rows = await getOutboxRows()
            // 1 set + 1 update from defaults
            expect(rows.length).toBeGreaterThanOrEqual(2)
        })

        const allRows = await getOutboxRows()
        const setRow = allRows.find((r) => r.op === 'set')
        const updateRow = allRows.find((r) => r.op === 'update')

        expect(setRow).toBeDefined()
        expect(setRow?.collection).toBe('tracks')
        expect(setRow?.payload).toMatchObject({
            songId: 'song-lecha-dodi',
            title: 'Lecha Dodi',
            setlistId: 'set-1',
            order: 1,
        })

        expect(updateRow).toBeDefined()
        expect(updateRow?.payload).toMatchObject({
            key: 'G',
            leadMusician: 'Randy',
            bpm: 90,
        })

        expect(seedSpy).toHaveBeenCalledWith('song-lecha-dodi')
    })

    it('AC-7 add-row: free-text creates a track with no songId', async () => {
        await seedTracks('set-2', [])

        render(<SetlistGrid setlistId="set-2" />)
        // EmptyState is shown when zero rows; skip add-row-trigger and use
        // the secondary CTA.
        const user = userEvent.setup()
        const addCta = await screen.findByTestId('empty-state-add-song-cta')
        await user.click(addCta)

        const filterInput = await screen.findByPlaceholderText(
            /type a song title/i,
        )
        await user.type(filterInput, 'Custom track')

        // No matches → cmdk shows the "Create new track" group.
        const customGroup = await screen.findByText(/create new track called/i)
        await user.click(customGroup)

        await waitFor(async () => {
            const rows = await getOutboxRows()
            expect(rows.some((r) => r.op === 'set')).toBe(true)
        })
        const allRows = await getOutboxRows()
        const setRow = allRows.find((r) => r.op === 'set')
        expect(setRow).toBeDefined()
        expect(setRow?.payload).toMatchObject({
            title: 'Custom track',
            setlistId: 'set-2',
            order: 0,
        })
        expect(setRow?.payload).not.toHaveProperty('songId')
    })

    // QUARANTINED (cycle-9 hardening Lane A, 2026-05-20): the 3 delete-row /
    // drag-handle tests below drive the desktop table (data-testid="drag-handle",
    // table rows) DELETED in 0ec6773c. SetlistGrid renders the mobile-card list;
    // delete/drag now live on MobileRowCard. Needs a card-DOM rewrite — tracked
    // in cycle-9-test-baseline-TRIAGE.md Cluster 1. The other 4 tests in this
    // file (pure computeReorderUpdates logic) still run and pass.
    it.skip('AC-7 delete-row: empty row deletes immediately (no confirmation)', async () => {
        await seedTracks('set-3', [{ id: 't-empty', order: 0 }])
        const confirmFn = vi.fn(() => true)

        render(
            <SetlistGrid
                setlistId="set-3"
                confirmDeleteWithTitle={confirmFn}
            />,
        )

        const handles = await screen.findAllByTestId('drag-handle')
        expect(handles).toHaveLength(1)

        await getDb().outbox.clear()

        const user = userEvent.setup()
        await user.click(handles[0])
        await user.keyboard('{Backspace}')

        await waitFor(async () => {
            const rows = await getOutboxRows()
            expect(rows.some((r) => r.op === 'delete' && r.docId === 't-empty')).toBe(
                true,
            )
        })
        expect(confirmFn).not.toHaveBeenCalled()
    })

    // QUARANTINED — see note above (desktop-table delete path removed in 0ec6773c).
    it.skip('AC-7 delete-row: titled row prompts confirmation; cancel preserves the row', async () => {
        await seedTracks('set-4', [{ id: 't-1', order: 0, title: 'Aleinu' }])
        const confirmFn = vi.fn(() => false)

        render(
            <SetlistGrid
                setlistId="set-4"
                confirmDeleteWithTitle={confirmFn}
            />,
        )

        await screen.findByText('Aleinu')
        const handle = (await screen.findAllByTestId('drag-handle'))[0]

        await getDb().outbox.clear()
        const user = userEvent.setup()
        await user.click(handle)
        await user.keyboard('{Backspace}')

        // confirmDelete called but rejected, no delete dispatched.
        await waitFor(() => expect(confirmFn).toHaveBeenCalledWith('Aleinu'))
        const rows = await getOutboxRows()
        expect(rows.some((r) => r.op === 'delete')).toBe(false)
    })

    it('AC-6 drag-end: computeReorderUpdates emits per-row order patches', async () => {
        // Drag-event simulation in jsdom is genuinely fragile (KeyboardSensor
        // requires layout it can't reliably get). Verify the underlying
        // pure-function reorder logic instead; it's what onDragEnd consumes.
        const { computeReorderUpdates } = await import('../SetlistGrid')
        const before = [
            { id: 't-A', order: 0 },
            { id: 't-B', order: 1 },
            { id: 't-C', order: 2 },
        ]
        // Drag A down two slots to land at C's position.
        const updates = computeReorderUpdates(before, 't-A', 't-C')
        // Result list should be [B, C, A] → A's order=2, C's order=1, B's order=0.
        // B started at 1, ends at 0 → emit update.
        // C started at 2, ends at 1 → emit update.
        // A started at 0, ends at 2 → emit update.
        expect(updates).toEqual(
            expect.arrayContaining([
                { id: 't-B', order: 0 },
                { id: 't-C', order: 1 },
                { id: 't-A', order: 2 },
            ]),
        )
        expect(updates).toHaveLength(3)
    })

    it('AC-6 drag-end: same row drop is a no-op', async () => {
        const { computeReorderUpdates } = await import('../SetlistGrid')
        expect(
            computeReorderUpdates(
                [
                    { id: 't-A', order: 0 },
                    { id: 't-B', order: 1 },
                ],
                't-A',
                't-A',
            ),
        ).toEqual([])
    })

    // QUARANTINED — see note above (desktop drag-handle removed in 0ec6773c;
    // the card grip is mobile-card-handle-* on MobileRowCard).
    it.skip('drag handle has accessible label', async () => {
        await seedTracks('set-6', [{ id: 't-1', order: 0, title: 'Aleinu' }])
        render(<SetlistGrid setlistId="set-6" />)
        await screen.findByText('Aleinu')
        const handle = (await screen.findAllByTestId('drag-handle'))[0]
        expect(handle).toHaveAccessibleName(/drag to reorder.*Aleinu/i)
    })

    // Disable unused import warning for `within`.
    void within
})
