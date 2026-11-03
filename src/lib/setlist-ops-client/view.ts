/**
 * The setlist view: server cache + this device's pending intents, drawn over
 * it. Pure, no React and no Dexie, so the editor today and Perform (PR 4)
 * share it.
 *
 * - Rows start in the server's canonical sequence (order, then id).
 * - Pending and in-flight intents apply in queue order: an insert or move
 *   lands where its anchors say in the CURRENT sequence (the server's own
 *   placement rule), a remove drops the row, an edit overlays its fields.
 * - Refused intents are NOT drawn: a refused edit stops masking the server's
 *   row and shows in the refused list instead.
 * - `order` on every returned row is its index in the view, so code that
 *   reasons about positions reads the sequence the author sees.
 */
import type { LocalSetlist, LocalTrack, SetlistIntent } from '@/lib/local/types'

export interface PendingMark {
    /** The row itself is pending (an insert, or a move). */
    row: boolean
    /** Fields with a pending edit. */
    fields: string[]
}

export interface SetlistView {
    rows: LocalTrack[]
    setlist: LocalSetlist | undefined
    /** rowId → what is pending on it. Rows with nothing pending are absent. */
    pending: Record<string, PendingMark>
    /** Setlist fields with a pending edit. */
    pendingSetlistFields: string[]
}

export function canonicalOrder<T extends { id: string; order: number }>(rows: readonly T[]): T[] {
    return [...rows].sort((a, b) => a.order - b.order || String(a.id).localeCompare(String(b.id)))
}

/** The server's placement rule (src/lib/setlist-ops/pure.ts placementIndex). */
export function placeIndex(seq: readonly string[], afterRowId: string | null, beforeRowId: string | null): number {
    if (afterRowId !== null) {
        const i = seq.indexOf(afterRowId)
        if (i >= 0) return i + 1
    }
    if (beforeRowId !== null) {
        const j = seq.indexOf(beforeRowId)
        if (j >= 0) return j
    }
    if (afterRowId === null) return 0
    return seq.length
}

function mark(pending: Record<string, PendingMark>, id: string): PendingMark {
    return (pending[id] ??= { row: false, fields: [] })
}

function overlay(target: Record<string, unknown>, set: Record<string, unknown>): void {
    for (const [k, v] of Object.entries(set)) {
        if (v === null) delete target[k]
        else target[k] = v
    }
}

export function computeView(
    serverRows: readonly LocalTrack[],
    serverSetlist: LocalSetlist | undefined,
    intents: readonly SetlistIntent[],
): SetlistView {
    const byId = new Map<string, LocalTrack>()
    for (const r of serverRows) byId.set(r.id, { ...r })
    let seq = canonicalOrder(serverRows).map((r) => r.id)
    const pending: Record<string, PendingMark> = {}
    const pendingSetlistFields = new Set<string>()
    const setlist: LocalSetlist | undefined = serverSetlist ? { ...serverSetlist } : undefined

    const live = intents
        .filter((i) => i.status !== 'refused')
        .sort((a, b) => (a.localId ?? 0) - (b.localId ?? 0))
    for (const it of live) {
        const op = it.op as Record<string, unknown>
        const rowId = typeof op.rowId === 'string' ? op.rowId : ''
        switch (op.kind) {
            case 'insert': {
                if (byId.has(rowId) && seq.includes(rowId)) break // already on the server
                const row = { ...(op.row as Record<string, unknown>), id: rowId, setlistId: it.setlistId, order: 0 } as LocalTrack
                byId.set(rowId, row)
                seq = seq.filter((x) => x !== rowId)
                seq.splice(placeIndex(seq, (op.afterRowId as string | null) ?? null, (op.beforeRowId as string | null) ?? null), 0, rowId)
                mark(pending, rowId).row = true
                break
            }
            case 'remove': {
                seq = seq.filter((x) => x !== rowId)
                delete pending[rowId]
                break
            }
            case 'move': {
                const i = seq.indexOf(rowId)
                if (i < 0) break
                if (op.afterRowId === rowId || op.beforeRowId === rowId) break
                seq.splice(i, 1)
                seq.splice(placeIndex(seq, (op.afterRowId as string | null) ?? null, (op.beforeRowId as string | null) ?? null), 0, rowId)
                mark(pending, rowId).row = true
                break
            }
            case 'editRow': {
                const row = byId.get(rowId)
                if (!row || !seq.includes(rowId)) break
                const set = (op.set ?? {}) as Record<string, unknown>
                overlay(row as Record<string, unknown>, set)
                const m = mark(pending, rowId)
                for (const k of Object.keys(set)) if (!m.fields.includes(k)) m.fields.push(k)
                break
            }
            case 'editSetlist': {
                if (!setlist) break
                const set = (op.set ?? {}) as Record<string, unknown>
                overlay(setlist as Record<string, unknown>, set)
                for (const k of Object.keys(set)) pendingSetlistFields.add(k)
                break
            }
        }
    }

    const rows = seq.map((id, order) => ({ ...byId.get(id)!, order }))
    return { rows, setlist, pending, pendingSetlistFields: [...pendingSetlistFields] }
}

/** Anchors that put a row at `index` of `seq` (which does not contain it). */
export function anchorsAt(seq: readonly string[], index: number): { afterRowId: string | null; beforeRowId: string | null } {
    const i = Math.max(0, Math.min(index, seq.length))
    return { afterRowId: i > 0 ? seq[i - 1] : null, beforeRowId: i < seq.length ? seq[i] : null }
}
