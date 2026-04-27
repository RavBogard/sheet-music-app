import 'fake-indexeddb/auto'
import '@testing-library/jest-dom'
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

const propagateSpy = vi.fn()
vi.mock('@/lib/songs/defaults', () => ({
    propagateTrackEditToSong: (...args: unknown[]) => propagateSpy(...args),
    seedTrackFromSong: vi.fn(async () => ({})),
    flushPendingPropagations: vi.fn(),
    __resetForTests: vi.fn(),
}))

import { getDb, resetDbForTests } from '@/lib/local/schema'
import type { LocalTrack } from '@/lib/local/types'
import {
    UNDO_BURST_MS,
    __resetUndoForTests,
    useUndoStore,
} from '@/lib/local/undo-store'

import { DeleteConfirmProvider } from '../DeleteConfirmProvider'
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function dispatchUndo(target: HTMLElement) {
    fireEvent.keyDown(target, {
        key: 'z',
        code: 'KeyZ',
        metaKey: true,
    })
}

function dispatchRedo(target: HTMLElement) {
    fireEvent.keyDown(target, {
        key: 'z',
        code: 'KeyZ',
        metaKey: true,
        shiftKey: true,
    })
}

describe('SetlistGrid — Undo via zustand temporal middleware (v50-05-05)', () => {
    beforeEach(async () => {
        await resetDbForTests()
        mockBack.mockClear()
        propagateSpy.mockClear()
        __resetUndoForTests()
    })

    afterEach(async () => {
        cleanup()
        await resetDbForTests()
        __resetUndoForTests()
    })

    it('AC-4: Cmd-Z reverts a Title cell edit via applyEdit-inverse', async () => {
        await seedTracks('set-a', [
            { id: 't-0', order: 0, title: 'Old' },
        ])
        render(
            <DeleteConfirmProvider>
                <SetlistGrid setlistId="set-a" name="Test" />
            </DeleteConfirmProvider>,
        )

        // Wait for hydration.
        await screen.findByTestId('drag-handle')

        // Edit the Title cell directly via applyEdit (skipping the cell
        // UI — the integration tested here is keyboard handler →
        // popUndo → applyEdit inverse round-trip, not cell-edit UX).
        const { applyEdit } = await import('@/lib/local/write')
        await act(async () => {
            await applyEdit(
                {
                    op: 'update',
                    collection: 'tracks',
                    docId: 't-0',
                    patch: { title: 'New' },
                },
                { undoKey: 'tracks:t-0:title' },
            )
        })

        // Settle the burst.
        await sleep(UNDO_BURST_MS + 50)

        // Verify the new state landed.
        let tracks = await getDb().tracks.toArray()
        expect(tracks[0].title).toBe('New')
        expect(useUndoStore.getState().undoStack).toHaveLength(1)

        // Fire Cmd-Z on the grid root.
        const grid = screen.getByTestId('setlist-grid')
        await act(async () => {
            dispatchUndo(grid)
        })

        await waitFor(async () => {
            tracks = await getDb().tracks.toArray()
            expect(tracks[0].title).toBe('Old')
        })

        // Undo entry moved to redo stack.
        expect(useUndoStore.getState().undoStack).toHaveLength(0)
        expect(useUndoStore.getState().redoStack).toHaveLength(1)
    })

    it('AC-4: Cmd-Shift-Z (redo) re-applies the change', async () => {
        await seedTracks('set-a', [
            { id: 't-0', order: 0, title: 'Old' },
        ])
        render(
            <DeleteConfirmProvider>
                <SetlistGrid setlistId="set-a" name="Test" />
            </DeleteConfirmProvider>,
        )
        await screen.findByTestId('drag-handle')

        const { applyEdit } = await import('@/lib/local/write')
        await act(async () => {
            await applyEdit(
                {
                    op: 'update',
                    collection: 'tracks',
                    docId: 't-0',
                    patch: { title: 'New' },
                },
                { undoKey: 'tracks:t-0:title' },
            )
        })
        await sleep(UNDO_BURST_MS + 50)

        const grid = screen.getByTestId('setlist-grid')
        await act(async () => {
            dispatchUndo(grid)
        })
        await waitFor(async () => {
            const t = await getDb().tracks.toArray()
            expect(t[0].title).toBe('Old')
        })

        await act(async () => {
            dispatchRedo(grid)
        })
        await waitFor(async () => {
            const t = await getDb().tracks.toArray()
            expect(t[0].title).toBe('New')
        })
    })

    it('AC-4: Cmd-Z reverts a delete by re-inserting the row (full snapshot)', async () => {
        await seedTracks('set-a', [
            {
                id: 't-0',
                order: 0,
                title: 'Doomed',
                key: 'D',
                bpm: 120,
                leadMusician: 'Daniel',
                notes: 'tight',
            },
        ])
        render(
            <DeleteConfirmProvider>
                <SetlistGrid setlistId="set-a" name="Test" />
            </DeleteConfirmProvider>,
        )
        await screen.findByTestId('drag-handle')

        const { applyEdit } = await import('@/lib/local/write')
        await act(async () => {
            await applyEdit({
                op: 'delete',
                collection: 'tracks',
                docId: 't-0',
            })
        })

        await waitFor(async () => {
            const t = await getDb().tracks.toArray()
            expect(t).toHaveLength(0)
        })

        const grid = screen.getByTestId('setlist-grid')
        await act(async () => {
            dispatchUndo(grid)
        })

        await waitFor(async () => {
            const t = await getDb().tracks.toArray()
            expect(t).toHaveLength(1)
        })
        const restored = (await getDb().tracks.toArray())[0]
        expect(restored.id).toBe('t-0')
        expect(restored.title).toBe('Doomed')
        expect(restored.key).toBe('D')
        expect(restored.bpm).toBe(120)
        expect(restored.leadMusician).toBe('Daniel')
        expect(restored.notes).toBe('tight')
    })

    it('AC-4: Cmd-Z is a no-op when typing inside a focused INPUT', async () => {
        await seedTracks('set-a', [
            { id: 't-0', order: 0, title: 'Old' },
        ])
        render(
            <DeleteConfirmProvider>
                <SetlistGrid setlistId="set-a" name="Test" />
            </DeleteConfirmProvider>,
        )
        await screen.findByTestId('drag-handle')

        const { applyEdit } = await import('@/lib/local/write')
        await act(async () => {
            await applyEdit(
                {
                    op: 'update',
                    collection: 'tracks',
                    docId: 't-0',
                    patch: { title: 'New' },
                },
                { undoKey: 'tracks:t-0:title' },
            )
        })
        await sleep(UNDO_BURST_MS + 50)

        // Render an input inside the grid (simulated focused field).
        const grid = screen.getByTestId('setlist-grid')
        const fakeInput = document.createElement('input')
        grid.appendChild(fakeInput)
        fakeInput.focus()

        const undoCountBefore = useUndoStore.getState().undoStack.length
        // Fire the keydown WITH target=input (since input is focused).
        await act(async () => {
            fireEvent.keyDown(fakeInput, {
                key: 'z',
                code: 'KeyZ',
                metaKey: true,
            })
        })

        // Stack didn't pop — handler skipped on input-focused target.
        expect(useUndoStore.getState().undoStack.length).toBe(
            undoCountBefore,
        )
    })

    it('AC-5: burst-coalesced cell edits revert in ONE step', async () => {
        await seedTracks('set-a', [
            { id: 't-0', order: 0, title: 'A' },
        ])
        render(
            <DeleteConfirmProvider>
                <SetlistGrid setlistId="set-a" name="Test" />
            </DeleteConfirmProvider>,
        )
        await screen.findByTestId('drag-handle')

        const { applyEdit } = await import('@/lib/local/write')

        // Simulate burst typing: 5 commits within < UNDO_BURST_MS, all
        // sharing the same undoKey. Should coalesce to ONE undo entry.
        for (const next of ['Hi', 'Hel', 'Hell', 'Hello']) {
            await act(async () => {
                await applyEdit(
                    {
                        op: 'update',
                        collection: 'tracks',
                        docId: 't-0',
                        patch: { title: next },
                    },
                    { undoKey: 'tracks:t-0:title' },
                )
            })
            // Same-tick — no advance.
        }

        // Settle the burst window.
        await sleep(UNDO_BURST_MS + 50)

        expect(useUndoStore.getState().undoStack).toHaveLength(1)

        const grid = screen.getByTestId('setlist-grid')
        await act(async () => {
            dispatchUndo(grid)
        })

        // Single undo step reverts ALL 5 burst writes back to 'A'.
        await waitFor(async () => {
            const t = await getDb().tracks.toArray()
            expect(t[0].title).toBe('A')
        })
    })
})
