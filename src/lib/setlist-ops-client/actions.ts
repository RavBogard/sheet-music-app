/**
 * Editor actions, each one user action = one batch of intents. They read the
 * VIEW (server cache + pending overlay) the author is looking at, so anchors
 * and base values are what the author saw when they made the edit.
 *
 * Every row payload goes through fields.ts: a duplicate or an undo sends an
 * explicit field list, never a copied row (no `version`, no `updatedAt`, no
 * `undefined`).
 *
 * D2(a): insert, remove and move need a connection. They return false when
 * offline and queue nothing; the editor disables their controls first.
 */
import type { LocalSetlist, LocalTrack } from '@/lib/local/types'
import { useUndoStore, type OpsUndoEntry } from '@/lib/local/undo-store'

import { newRowId as newRowIdForEditor, type IntentInput, type WireOp } from './client'
import { canEditStructure as isOnline } from './connectivity'
import { baseOf, rowEditSet, rowForInsert, setlistBaseOf, setlistEditSet } from './fields'
import { getOpsClient } from './runtime'
import { anchorsAt } from './view'

function labelOf(row: { title?: unknown } | undefined): string | undefined {
    return typeof row?.title === 'string' && row.title.trim() ? row.title : undefined
}

function sameValue(a: unknown, b: unknown): boolean {
    const norm = (v: unknown) => (v === undefined ? null : v)
    return JSON.stringify(norm(a)) === JSON.stringify(norm(b))
}

function pushUndo(entry: Omit<OpsUndoEntry, 'kind' | 'ts'>): void {
    useUndoStore.getState().pushEntry({ kind: 'ops', ts: Date.now(), ...entry })
}

/** Called with the batch key once an action is queued (to `settle` it). */
type OnBatch = (batchKey: string) => void

/** A refused (or, for structural edits, offline) action, for callers that wait. */
export class SetlistOpRefusedError extends Error {
    constructor(
        readonly reason: string,
        readonly field?: string,
    ) {
        super(`setlist op refused: ${reason}${field ? ` (${field})` : ''}`)
        this.name = 'SetlistOpRefusedError'
    }
}

/**
 * Wait for a queued action's answer. Throws SetlistOpRefusedError when it was
 * refused. `offline` is returned, not thrown: a field edit stays queued.
 */
export async function settleBatch(setlistId: string, batchKey: string): Promise<'ok' | 'offline'> {
    const r = await getOpsClient().settle(setlistId, batchKey)
    if (r.ok) return 'ok'
    if (r.reason === 'offline') return 'offline'
    throw new SetlistOpRefusedError(r.reason, r.field)
}

/** Row fields the server will not clear: an undo never sends them as null. */
const NOT_CLEARABLE_ROW = new Set(['title', 'type'])

/** Field edit on one row. Works offline (queues and rebases). */
export async function editRow(
    setlistId: string,
    row: LocalTrack,
    patch: Record<string, unknown>,
    opts: { undo?: boolean; onBatch?: OnBatch } = {},
): Promise<void> {
    const want = rowEditSet(patch)
    const set: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(want)) if (!sameValue(row[k], v)) set[k] = v
    if (Object.keys(set).length === 0) return
    const base = baseOf(row as Record<string, unknown>, Object.keys(set))
    const op: WireOp = { kind: 'editRow', rowId: row.id, set, base }
    const key = await getOpsClient().enqueue(setlistId, [{ op, label: labelOf(row) }])
    opts.onBatch?.(key)
    if (opts.undo !== false) {
        // Undo sets each field back. A field the server cannot clear (title,
        // type) that had no value before is left as it is, never sent as null.
        const undoSet: Record<string, unknown> = {}
        const undoBase: Record<string, unknown> = {}
        for (const k of Object.keys(set)) {
            if (base[k] === null && NOT_CLEARABLE_ROW.has(k)) continue
            undoSet[k] = base[k]
            undoBase[k] = set[k]
        }
        if (Object.keys(undoSet).length > 0) {
            pushUndo({
                setlistId,
                label: `Edit ${labelOf(row) ?? row.id}`,
                undo: [{ kind: 'editRow', rowId: row.id, set: undoSet, base: undoBase }],
                redo: [op],
            })
        }
    }
}

/** Setlist metadata edit (name, date, service type, rabbi, gig parts). Works offline. Returns the batch key ('' when nothing changed). */
export async function editSetlist(
    setlistId: string,
    current: LocalSetlist | undefined,
    patch: Record<string, unknown>,
): Promise<string> {
    const set = setlistEditSet(patch)
    if (Object.keys(set).length === 0) return ''
    const base = setlistBaseOf(current as Record<string, unknown> | undefined, Object.keys(set))
    return getOpsClient().enqueue(setlistId, [
        { op: { kind: 'editSetlist', set, base }, label: typeof current?.name === 'string' ? current.name : undefined },
    ])
}

/**
 * Insert new rows at `index` of the view (in this order). Returns the new
 * row ids, or null when offline.
 */
export async function insertRows(
    setlistId: string,
    view: readonly LocalTrack[],
    index: number,
    rows: ReadonlyArray<Record<string, unknown>>,
    opts: { undo?: boolean; label?: string; onBatch?: OnBatch } = {},
): Promise<string[] | null> {
    if (!isOnline()) return null
    if (rows.length === 0) return []
    const seq = view.map((r) => r.id)
    const { afterRowId, beforeRowId } = anchorsAt(seq, index)
    const ids: string[] = []
    const ops: IntentInput[] = rows.map((src, i) => {
        const id = newRowIdForEditor()
        ids.push(id)
        const op: WireOp = {
            kind: 'insert',
            rowId: id,
            afterRowId: i === 0 ? afterRowId : ids[i - 1],
            beforeRowId,
            row: rowForInsert(src),
        }
        return { op, label: labelOf(src as { title?: unknown }) }
    })
    // Enqueue first: `onBatch?.(…)` would skip its argument when there is no callback.
    const batchKey = await getOpsClient().enqueue(setlistId, ops)
    opts.onBatch?.(batchKey)
    if (opts.undo !== false) {
        pushUndo({
            setlistId,
            label: opts.label ?? `Add ${rows.length} row${rows.length === 1 ? '' : 's'}`,
            undo: ids.map((id) => ({ kind: 'remove', rowId: id })),
            redo: ops.map((o) => o.op),
        })
    }
    return ids
}

/**
 * Append rows to a setlist whose rows this device may not hold (add-to-setlist
 * from the library). The first row anchors on itself, which the server reads
 * as "after a row that is not there": the end.
 */
export async function appendRows(
    setlistId: string,
    rows: ReadonlyArray<Record<string, unknown>>,
    opts: { onBatch?: OnBatch } = {},
): Promise<string[] | null> {
    if (!isOnline()) return null
    const ids: string[] = []
    const ops: IntentInput[] = rows.map((src, i) => {
        const id = newRowIdForEditor()
        ids.push(id)
        return {
            op: { kind: 'insert', rowId: id, afterRowId: i === 0 ? id : ids[i - 1], beforeRowId: null, row: rowForInsert(src) },
            label: labelOf(src as { title?: unknown }),
        }
    })
    // Enqueue first: `onBatch?.(…)` would skip its argument when there is no callback.
    const batchKey = await getOpsClient().enqueue(setlistId, ops)
    opts.onBatch?.(batchKey)
    return ids
}

/** Remove rows (one batch). False when offline. */
export async function removeRows(
    setlistId: string,
    view: readonly LocalTrack[],
    ids: readonly string[],
    opts: { undo?: boolean } = {},
): Promise<boolean> {
    if (!isOnline()) return false
    const doomed = new Set(ids)
    const targets = view.filter((r) => doomed.has(r.id))
    if (targets.length === 0) return true
    await getOpsClient().enqueue(
        setlistId,
        targets.map((r) => ({ op: { kind: 'remove', rowId: r.id }, label: labelOf(r) })),
    )
    if (opts.undo !== false) {
        // Undo puts each row back between the neighbours it had, in order.
        const seq = view.map((r) => r.id)
        const undo: WireOp[] = targets.map((r) => {
            const i = seq.indexOf(r.id)
            return {
                kind: 'insert',
                rowId: r.id,
                afterRowId: i > 0 ? seq[i - 1] : null,
                beforeRowId: i + 1 < seq.length ? seq[i + 1] : null,
                row: rowForInsert(r as Record<string, unknown>),
            }
        })
        pushUndo({
            setlistId,
            label: `Delete ${targets.length} row${targets.length === 1 ? '' : 's'}`,
            undo,
            redo: targets.map((r) => ({ kind: 'remove', rowId: r.id })),
        })
    }
    return true
}

/**
 * Drag `activeId` onto `overId` (dnd-kit's arrayMove semantics). ONE move op:
 * the server renumbers every row in one transaction, so a receiver sees one
 * snapshot. False when offline or when nothing moves.
 */
export async function moveRow(
    setlistId: string,
    view: readonly LocalTrack[],
    activeId: string,
    overId: string,
    opts: { undo?: boolean } = {},
): Promise<boolean> {
    if (activeId === overId) return false
    if (!isOnline()) return false
    const seq = view.map((r) => r.id)
    const from = seq.indexOf(activeId)
    const to = seq.indexOf(overId)
    if (from < 0 || to < 0) return false
    const oldAnchors = { afterRowId: from > 0 ? seq[from - 1] : null, beforeRowId: from + 1 < seq.length ? seq[from + 1] : null }
    const next = seq.slice()
    next.splice(from, 1)
    next.splice(to, 0, activeId)
    const at = next.indexOf(activeId)
    const newAnchors = { afterRowId: at > 0 ? next[at - 1] : null, beforeRowId: at + 1 < next.length ? next[at + 1] : null }
    const op: WireOp = { kind: 'move', rowId: activeId, ...newAnchors }
    const row = view.find((r) => r.id === activeId)
    await getOpsClient().enqueue(setlistId, [{ op, label: labelOf(row) }])
    if (opts.undo !== false) {
        pushUndo({
            setlistId,
            label: `Move ${labelOf(row) ?? activeId}`,
            undo: [{ kind: 'move', rowId: activeId, ...oldAnchors }],
            redo: [op],
        })
    }
    return true
}

/** Duplicate a row right after itself: one insert with the source's fields. */
export async function duplicateRow(
    setlistId: string,
    view: readonly LocalTrack[],
    sourceId: string,
): Promise<string | null> {
    const i = view.findIndex((r) => r.id === sourceId)
    if (i < 0) return null
    const ids = await insertRows(setlistId, view, i + 1, [view[i] as Record<string, unknown>], {
        label: `Duplicate ${labelOf(view[i]) ?? sourceId}`,
    })
    return ids?.[0] ?? null
}

/** Is any op in this list structural (needs a connection)? */
export function isStructural(ops: readonly WireOp[]): boolean {
    return ops.some((o) => o.kind === 'insert' || o.kind === 'remove' || o.kind === 'move')
}

/** Replay an undo/redo entry's ops as one batch. False when it needs a connection we lack. */
export async function replayOps(setlistId: string, ops: readonly WireOp[]): Promise<boolean> {
    if (ops.length === 0) return true
    if (isStructural(ops) && !isOnline()) return false
    await getOpsClient().enqueue(
        setlistId,
        ops.map((op) => ({ op: { ...op } })),
    )
    return true
}
