/**
 * Live reorder on the Perform page (Daniel, 2026-10-31): a leader moves rows
 * mid-service and every iPad follows. These are the pure pieces: the move
 * itself, laying a pending order over the rows, and working out which rows a
 * remote reorder moved so a receiver can highlight them.
 *
 * Moving a row is an explicit author action (row order is the author's); the
 * write goes through the same server path as the editor and MCP
 * `reorder_setlist`. Nothing here decides an order on its own.
 */

/** Move the row at `from` to `to`. Out-of-range or no-op moves return the input. */
export function moveRow(ids: readonly string[], from: number, to: number): string[] {
    if (from === to || from < 0 || to < 0 || from >= ids.length || to >= ids.length) {
        return ids.slice()
    }
    const next = ids.slice()
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    return next
}

/** Move `activeId` into `overId`'s slot (a drag drop). Unknown ids are a no-op. */
export function moveRowById(ids: readonly string[], activeId: string, overId: string): string[] {
    return moveRow(ids, ids.indexOf(activeId), ids.indexOf(overId))
}

export function sameOrder(a: readonly string[], b: readonly string[]): boolean {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
    return true
}

/**
 * Lay `order` over `rows`. Rows the order names come first in its order; rows
 * it doesn't name (one arrived meanwhile) keep their place after them. Ids in
 * the order with no row are skipped. Returns `rows` itself when nothing moves.
 */
export function applyOrder<T extends { id?: string }>(rows: readonly T[], order: readonly string[] | null): readonly T[] {
    if (!order || order.length === 0) return rows
    const byId = new Map<string, T>()
    for (const r of rows) if (r.id) byId.set(r.id, r)
    const out: T[] = []
    const used = new Set<string>()
    for (const id of order) {
        const row = byId.get(id)
        if (row && !used.has(id)) {
            out.push(row)
            used.add(id)
        }
    }
    for (const r of rows) if (!r.id || !used.has(r.id)) out.push(r)
    let same = out.length === rows.length
    for (let i = 0; same && i < out.length; i++) if (out[i] !== rows[i]) same = false
    return same ? rows : out
}

/**
 * Which rows a reorder moved. Only rows present in both lists count. The rows
 * that kept their relative order form the longest increasing run of old
 * positions; every other row is one that moved. A single drag of one row
 * therefore reports just that row, not every row it slid past.
 */
export function movedRowIds(prev: readonly string[], next: readonly string[]): string[] {
    const prevPos = new Map<string, number>()
    prev.forEach((id, i) => prevPos.set(id, i))
    const common = next.filter((id) => prevPos.has(id))
    if (common.length < 2) return []
    const seq = common.map((id) => prevPos.get(id) as number)

    // Longest increasing subsequence (patience sorting, O(n log n)).
    const tailIdx: number[] = []
    const parent: number[] = new Array(seq.length).fill(-1)
    for (let i = 0; i < seq.length; i++) {
        let lo = 0
        let hi = tailIdx.length
        while (lo < hi) {
            const mid = (lo + hi) >> 1
            if (seq[tailIdx[mid]] < seq[i]) lo = mid + 1
            else hi = mid
        }
        if (lo > 0) parent[i] = tailIdx[lo - 1]
        tailIdx[lo] = i
    }
    const keep = new Set<number>()
    let k = tailIdx.length ? tailIdx[tailIdx.length - 1] : -1
    while (k >= 0) {
        keep.add(k)
        k = parent[k]
    }
    return common.filter((_, i) => !keep.has(i))
}

/** A leader's move, kept so it can be re-applied on a fresher order. */
export interface IntendedMove {
    rowId: string
    to: number
}

/**
 * Re-apply a move on the server's current order (after a stale write).
 * Returns null when the moved row is gone from the setlist.
 */
export function reapplyMove(current: readonly string[], move: IntendedMove): string[] | null {
    const from = current.indexOf(move.rowId)
    if (from < 0) return null
    return moveRow(current, from, Math.max(0, Math.min(move.to, current.length - 1)))
}

/**
 * Live-director insert while a reorder is pending: positions must come from
 * the order the server has, not from the order on screen. Finds the anchor
 * row (the one at `index` on screen) in the server order. Falls back to the
 * screen when there is no server order or the anchor isn't in it.
 */
export function rebaseOnServerOrder<T extends { id?: string }>(
    shown: readonly T[],
    index: number,
    server: readonly T[] | null | undefined,
): { currentIndex: number; currentTracks: T[] } {
    if (!server) return { currentIndex: index, currentTracks: shown.slice() }
    const anchorId = shown[index]?.id
    const at = anchorId ? server.findIndex((t) => t.id === anchorId) : -1
    if (at < 0) return { currentIndex: index, currentTracks: shown.slice() }
    return { currentIndex: at, currentTracks: server.slice() }
}
