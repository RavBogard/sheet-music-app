import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
    UNDO_MAX_ENTRIES,
    __resetUndoForTests,
    useUndoStore,
    type UndoEntry,
} from '../undo-store'

function makeOps(setlistId = 's-0', label = 'Edit'): UndoEntry {
    return {
        kind: 'ops',
        setlistId,
        label,
        undo: [{ kind: 'editRow', rowId: 't-0', set: { title: 'Old' } }],
        redo: [{ kind: 'editRow', rowId: 't-0', set: { title: 'New' } }],
        ts: Date.now(),
    }
}

describe('undo-store (pure)', () => {
    beforeEach(() => {
        __resetUndoForTests()
    })

    afterEach(() => {
        __resetUndoForTests()
    })

    it('pushEntry grows the undo stack and clears redo', () => {
        const store = useUndoStore.getState()
        store.pushEntry(makeOps('s-0'))
        store.pushEntry(makeOps('s-1'))
        expect(useUndoStore.getState().undoStack).toHaveLength(2)
        expect(useUndoStore.getState().redoStack).toHaveLength(0)

        useUndoStore.getState().popUndo()
        expect(useUndoStore.getState().redoStack).toHaveLength(1)

        // A new push clears redo.
        useUndoStore.getState().pushEntry(makeOps('s-2'))
        expect(useUndoStore.getState().redoStack).toHaveLength(0)
    })

    it('caps the undo stack at UNDO_MAX_ENTRIES (drops oldest)', () => {
        const store = useUndoStore.getState()
        for (let i = 0; i < UNDO_MAX_ENTRIES + 5; i++) {
            store.pushEntry(makeOps(`s-${i}`))
        }
        const stack = useUndoStore.getState().undoStack
        expect(stack).toHaveLength(UNDO_MAX_ENTRIES)
        // First survivor should be the (5th) entry — earliest 5 dropped.
        expect(stack[0].setlistId).toBe('s-5')
    })

    it('popUndo returns the latest entry and pushes it onto the redo stack', () => {
        const store = useUndoStore.getState()
        const entry = makeOps()
        store.pushEntry(entry)

        const popped = useUndoStore.getState().popUndo()
        expect(popped).toBe(entry)
        expect(useUndoStore.getState().undoStack).toHaveLength(0)
        expect(useUndoStore.getState().redoStack).toHaveLength(1)
        expect(useUndoStore.getState().redoStack[0]).toBe(entry)
    })

    it('popRedo cycles the entry back to the undo stack', () => {
        const store = useUndoStore.getState()
        const entry = makeOps()
        store.pushEntry(entry)
        useUndoStore.getState().popUndo()

        const redone = useUndoStore.getState().popRedo()
        expect(redone).toBe(entry)
        expect(useUndoStore.getState().redoStack).toHaveLength(0)
        expect(useUndoStore.getState().undoStack).toHaveLength(1)
    })

    it('clear resets both stacks', () => {
        const store = useUndoStore.getState()
        store.pushEntry(makeOps('s-keep'))
        store.pushEntry(makeOps('s-undone'))
        useUndoStore.getState().popUndo()

        store.clear()
        expect(useUndoStore.getState().undoStack).toHaveLength(0)
        expect(useUndoStore.getState().redoStack).toHaveLength(0)
    })

    it('popUndo / popRedo on an empty stack return undefined', () => {
        expect(useUndoStore.getState().popUndo()).toBeUndefined()
        expect(useUndoStore.getState().popRedo()).toBeUndefined()
    })
})
