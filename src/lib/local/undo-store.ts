/**
 * v50-05-05 Undo store — ephemeral, in-memory undo/redo for the
 * spreadsheet editor.
 *
 * Wraps a small zustand store around local Dexie writes; intercept
 * BEFORE applyEdit, snapshot prevDoc; after applyEdit succeeds, push
 * (op, collection, docId, prevDoc, newDoc) to the undo stack. Cmd-Z
 * pops and fires the inverse via applyEdit (NOT direct db.put — the
 * inverse round-trips to Firestore through the v50-03 sync engine).
 *
 * Burst coalescing: per-cell-blur edits with the same `${docId}:${field}`
 * key within 500ms collapse to ONE undo entry. prevDoc = state BEFORE
 * the first burst entry; newDoc = state AFTER the latest entry. Cell-
 * level burst is the right unit (typing letter-by-letter shouldn't
 * leave 5 undo entries).
 *
 * Decision (planned inline in v50-05-05-PLAN): plain zustand + a pure-
 * data entries array. The `zundo` temporal middleware automatically
 * snapshots state setters which is the wrong granularity for our
 * fine-grained per-cell-blur model. Manual pushEntry is the right
 * shape; one less dep.
 *
 * Cap 50 entries; FIFO drop oldest on overflow. Ephemeral — Dexie is
 * the persistence layer; reload wipes the in-memory undo stack on
 * purpose (matches user mental model: undo is a session intent).
 */

import { create } from 'zustand'

import type { LocalCollection } from './types'

export const UNDO_BURST_MS = 500
export const UNDO_MAX_ENTRIES = 50

export type UndoableDoc = Record<string, unknown> & { id: string }

export interface SimpleUndoEntry {
    kind: 'simple'
    op: 'set' | 'update' | 'delete'
    collection: LocalCollection
    docId: string
    /** State BEFORE the write (undefined for set ops on a fresh doc). */
    prevDoc: UndoableDoc | undefined
    /** State AFTER the write (undefined for delete ops). */
    newDoc: UndoableDoc | undefined
    ts: number
}

export interface CompositeUndoEntry {
    kind: 'composite'
    label: string
    entries: ReadonlyArray<{
        op: 'set' | 'update' | 'delete'
        collection: LocalCollection
        docId: string
        prevDoc: UndoableDoc | undefined
        newDoc: UndoableDoc | undefined
    }>
    ts: number
}

export type UndoEntry = SimpleUndoEntry | CompositeUndoEntry

interface UndoStoreState {
    undoStack: UndoEntry[]
    redoStack: UndoEntry[]
}

interface UndoStoreActions {
    /** Push immediately. Used for set/delete ops + composites (which are
     *  collected by callers before push). Clears redo stack. */
    pushEntry: (entry: UndoEntry) => void
    /** Push with debounce. Same key within UNDO_BURST_MS coalesces to a
     *  single entry (prevDoc = first; newDoc = latest). Cleared redo
     *  stack happens on the eventual push, not on each call. */
    pushEntryDebounced: (
        entry: SimpleUndoEntry,
        key: string,
        ms?: number,
    ) => void
    /** Test/integration helper: synchronously fire a pending burst
     *  timer (so tests can assert the entry has landed). */
    flushBurst: (key: string) => void
    /** Pop the latest undo entry; pushes it onto the redo stack. */
    popUndo: () => UndoEntry | undefined
    /** Pop the latest redo entry; pushes it back onto the undo stack. */
    popRedo: () => UndoEntry | undefined
    /** Clear both stacks + cancel any pending bursts. Test helper. */
    clear: () => void
}

interface PendingBurst {
    timer: number
    firstPrev: UndoableDoc | undefined
    latestEntry: SimpleUndoEntry
}

// Module-scoped per-key burst state. Held outside zustand because timer
// IDs and partial entries aren't worth re-rendering subscribers over.
const pendingBursts = new Map<string, PendingBurst>()

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

        pushEntryDebounced: (entry, key, ms = UNDO_BURST_MS) => {
            const existing = pendingBursts.get(key)
            if (existing) {
                // Continue the burst. Keep the original prevDoc; bump
                // newDoc to the latest. Reset the timer.
                clearTimeout(existing.timer)
                existing.latestEntry = {
                    ...entry,
                    prevDoc: existing.firstPrev,
                    ts: entry.ts,
                }
            } else {
                pendingBursts.set(key, {
                    timer: 0, // overwritten below
                    firstPrev: entry.prevDoc,
                    latestEntry: entry,
                })
            }
            const burst = pendingBursts.get(key)!
            burst.timer = setTimeout(() => {
                pendingBursts.delete(key)
                get().pushEntry(burst.latestEntry)
            }, ms) as unknown as number
        },

        flushBurst: (key) => {
            const burst = pendingBursts.get(key)
            if (!burst) return
            clearTimeout(burst.timer)
            pendingBursts.delete(key)
            get().pushEntry(burst.latestEntry)
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
            for (const burst of pendingBursts.values()) {
                clearTimeout(burst.timer)
            }
            pendingBursts.clear()
            set({ undoStack: [], redoStack: [] })
        },
    }),
)

/** Test-only helper: reset all module state (store + pending bursts). */
export function __resetUndoForTests(): void {
    useUndoStore.getState().clear()
}

/** Convenience: flush every pending burst (used by undo handler before
 *  popUndo to make sure in-flight cell edits are captured first). */
export function flushAllBursts(): void {
    const keys = Array.from(pendingBursts.keys())
    for (const key of keys) {
        useUndoStore.getState().flushBurst(key)
    }
}
