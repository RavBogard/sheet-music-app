import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest'

import {
    UNDO_BURST_MS,
    UNDO_MAX_ENTRIES,
    __resetUndoForTests,
    flushAllBursts,
    useUndoStore,
    type SimpleUndoEntry,
    type UndoEntry,
} from '../undo-store'

function makeSimple(
    overrides: Partial<SimpleUndoEntry> = {},
): SimpleUndoEntry {
    return {
        kind: 'simple',
        op: 'update',
        collection: 'tracks',
        docId: 't-0',
        prevDoc: { id: 't-0', title: 'Old' },
        newDoc: { id: 't-0', title: 'New' },
        ts: Date.now(),
        ...overrides,
    }
}

describe('undo-store (pure)', () => {
    beforeEach(() => {
        __resetUndoForTests()
    })

    afterEach(() => {
        __resetUndoForTests()
        vi.useRealTimers()
    })

    it('pushEntry grows the undo stack and clears redo', () => {
        const store = useUndoStore.getState()
        store.pushEntry(makeSimple({ docId: 't-0' }))
        store.pushEntry(makeSimple({ docId: 't-1' }))
        expect(useUndoStore.getState().undoStack).toHaveLength(2)
        expect(useUndoStore.getState().redoStack).toHaveLength(0)

        useUndoStore.getState().popUndo()
        expect(useUndoStore.getState().redoStack).toHaveLength(1)

        // A new push clears redo.
        useUndoStore.getState().pushEntry(makeSimple({ docId: 't-2' }))
        expect(useUndoStore.getState().redoStack).toHaveLength(0)
    })

    it('caps the undo stack at UNDO_MAX_ENTRIES (drops oldest)', () => {
        const store = useUndoStore.getState()
        for (let i = 0; i < UNDO_MAX_ENTRIES + 5; i++) {
            store.pushEntry(
                makeSimple({ docId: `t-${i}` }),
            )
        }
        const stack = useUndoStore.getState().undoStack
        expect(stack).toHaveLength(UNDO_MAX_ENTRIES)
        // First survivor should be the (5th) entry — earliest 5 dropped.
        const firstId = (stack[0] as SimpleUndoEntry).docId
        expect(firstId).toBe('t-5')
    })

    it('popUndo returns the latest entry and pushes it onto the redo stack', () => {
        const store = useUndoStore.getState()
        const entry = makeSimple({ docId: 't-0' })
        store.pushEntry(entry)

        const popped = useUndoStore.getState().popUndo()
        expect(popped).toBe(entry)
        expect(useUndoStore.getState().undoStack).toHaveLength(0)
        expect(useUndoStore.getState().redoStack).toHaveLength(1)
        expect(useUndoStore.getState().redoStack[0]).toBe(entry)
    })

    it('popRedo cycles the entry back to the undo stack', () => {
        const store = useUndoStore.getState()
        const entry = makeSimple({ docId: 't-0' })
        store.pushEntry(entry)
        useUndoStore.getState().popUndo()

        const redone = useUndoStore.getState().popRedo()
        expect(redone).toBe(entry)
        expect(useUndoStore.getState().redoStack).toHaveLength(0)
        expect(useUndoStore.getState().undoStack).toHaveLength(1)
    })

    it('pushEntryDebounced same key within UNDO_BURST_MS coalesces to ONE entry', () => {
        vi.useFakeTimers()
        const store = useUndoStore.getState()

        // 5 burst writes with the same key, prevDoc=A→B, B→C, C→D, D→E, E→F
        store.pushEntryDebounced(
            makeSimple({
                prevDoc: { id: 't-0', title: 'A' },
                newDoc: { id: 't-0', title: 'B' },
            }),
            't-0:title',
        )
        store.pushEntryDebounced(
            makeSimple({
                prevDoc: { id: 't-0', title: 'B' },
                newDoc: { id: 't-0', title: 'C' },
            }),
            't-0:title',
        )
        store.pushEntryDebounced(
            makeSimple({
                prevDoc: { id: 't-0', title: 'D' },
                newDoc: { id: 't-0', title: 'E' },
            }),
            't-0:title',
        )

        expect(useUndoStore.getState().undoStack).toHaveLength(0)

        vi.advanceTimersByTime(UNDO_BURST_MS + 10)

        const stack = useUndoStore.getState().undoStack
        expect(stack).toHaveLength(1)
        const entry = stack[0] as SimpleUndoEntry
        expect(entry.prevDoc?.title).toBe('A') // first prev wins
        expect(entry.newDoc?.title).toBe('E') // latest new wins
    })

    it('pushEntryDebounced different keys produce independent timers', () => {
        vi.useFakeTimers()
        const store = useUndoStore.getState()

        store.pushEntryDebounced(makeSimple({ docId: 't-0' }), 't-0:title')
        store.pushEntryDebounced(makeSimple({ docId: 't-1' }), 't-1:title')

        vi.advanceTimersByTime(UNDO_BURST_MS + 10)
        expect(useUndoStore.getState().undoStack).toHaveLength(2)
    })

    it('flushBurst synchronously fires a pending burst', () => {
        vi.useFakeTimers()
        const store = useUndoStore.getState()
        store.pushEntryDebounced(makeSimple(), 't-0:title')
        expect(useUndoStore.getState().undoStack).toHaveLength(0)

        store.flushBurst('t-0:title')
        expect(useUndoStore.getState().undoStack).toHaveLength(1)
    })

    it('flushAllBursts settles every pending burst', () => {
        vi.useFakeTimers()
        const store = useUndoStore.getState()
        store.pushEntryDebounced(makeSimple({ docId: 't-0' }), 't-0:title')
        store.pushEntryDebounced(makeSimple({ docId: 't-1' }), 't-1:title')

        flushAllBursts()
        expect(useUndoStore.getState().undoStack).toHaveLength(2)
    })

    it('clear resets both stacks AND cancels pending bursts', () => {
        vi.useFakeTimers()
        const store = useUndoStore.getState()
        store.pushEntry(makeSimple({ docId: 't-keep' }))
        store.pushEntryDebounced(
            makeSimple({ docId: 't-pending' }),
            't-pending:title',
        )

        store.clear()
        expect(useUndoStore.getState().undoStack).toHaveLength(0)
        // Advance past burst window — the cancelled timer should NOT fire.
        vi.advanceTimersByTime(UNDO_BURST_MS + 100)
        expect(useUndoStore.getState().undoStack).toHaveLength(0)
    })

    it('composite entries push as one unit; popUndo returns the whole composite', () => {
        const composite: UndoEntry = {
            kind: 'composite',
            label: 'Bulk-set on 3 rows',
            entries: [
                {
                    op: 'update',
                    collection: 'tracks',
                    docId: 't-0',
                    prevDoc: { id: 't-0', title: 'A' },
                    newDoc: { id: 't-0', title: 'B' },
                },
                {
                    op: 'update',
                    collection: 'tracks',
                    docId: 't-1',
                    prevDoc: { id: 't-1', title: 'C' },
                    newDoc: { id: 't-1', title: 'D' },
                },
            ],
            ts: Date.now(),
        }

        useUndoStore.getState().pushEntry(composite)
        expect(useUndoStore.getState().undoStack).toHaveLength(1)
        const popped = useUndoStore.getState().popUndo()
        expect(popped).toBe(composite)
        if (popped?.kind !== 'composite') throw new Error('expected composite')
        expect(popped.entries).toHaveLength(2)
    })
})
