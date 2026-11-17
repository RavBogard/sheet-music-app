/**
 * Undo store — ephemeral, in-memory undo/redo for the spreadsheet editor.
 *
 * Each entry is a setlist action (setlist sync PR 3): explicit undo/redo op
 * lists for the ops endpoint, pushed by setlist-ops-client/actions.ts and
 * replayed by SetlistGrid's Cmd-Z / Cmd-Shift-Z handler.
 *
 * Cap 50 entries; FIFO drop oldest on overflow. Ephemeral — reload wipes
 * the in-memory undo stack on purpose (undo is a session intent).
 */

import { create } from 'zustand'

export const UNDO_MAX_ENTRIES = 50

/**
 * A setlist action (setlist sync PR 3). Undo and redo are explicit op lists
 * for the ops endpoint, built when the action was taken: field lists and
 * anchors, never a copied row.
 */
export interface OpsUndoEntry {
    kind: 'ops'
    setlistId: string
    label: string
    undo: ReadonlyArray<Record<string, unknown> & { kind: 'insert' | 'remove' | 'move' | 'editRow' | 'editSetlist' }>
    redo: ReadonlyArray<Record<string, unknown> & { kind: 'insert' | 'remove' | 'move' | 'editRow' | 'editSetlist' }>
    ts: number
}

export type UndoEntry = OpsUndoEntry

interface UndoStoreState {
    undoStack: UndoEntry[]
    redoStack: UndoEntry[]
}

interface UndoStoreActions {
    /** Push an entry. Clears the redo stack. */
    pushEntry: (entry: UndoEntry) => void
    /** Pop the latest undo entry; pushes it onto the redo stack. */
    popUndo: () => UndoEntry | undefined
    /** Pop the latest redo entry; pushes it back onto the undo stack. */
    popRedo: () => UndoEntry | undefined
    /** Clear both stacks. Test helper. */
    clear: () => void
}

function trimToCap(stack: UndoEntry[]): UndoEntry[] {
    if (stack.length <= UNDO_MAX_ENTRIES) return stack
    // Drop oldest. The most recent UNDO_MAX_ENTRIES stay reachable.
    return stack.slice(stack.length - UNDO_MAX_ENTRIES)
}

export const useUndoStore = create<UndoStoreState & UndoStoreActions>(
    (set, get) => ({
        undoStack: [],
        redoStack: [],

        pushEntry: (entry) => {
            set((state) => ({
                undoStack: trimToCap([...state.undoStack, entry]),
                redoStack: [], // any new edit invalidates redo
            }))
        },

        popUndo: () => {
            const stack = get().undoStack
            if (stack.length === 0) return undefined
            const entry = stack[stack.length - 1]
            set((state) => ({
                undoStack: state.undoStack.slice(0, -1),
                redoStack: [...state.redoStack, entry],
            }))
            return entry
        },

        popRedo: () => {
            const stack = get().redoStack
            if (stack.length === 0) return undefined
            const entry = stack[stack.length - 1]
            set((state) => ({
                redoStack: state.redoStack.slice(0, -1),
                undoStack: trimToCap([...state.undoStack, entry]),
            }))
            return entry
        },

        clear: () => {
            set({ undoStack: [], redoStack: [] })
        },
    }),
)

/** Test-only helper: reset the store. */
export function __resetUndoForTests(): void {
    useUndoStore.getState().clear()
}
