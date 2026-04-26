'use client'

import { useCallback, useState } from 'react'

/**
 * Multi-select state for the spreadsheet editor grid (v50-05-03).
 *
 * Selection lives on the row level — wired to the drag handle's modifier-aware
 * onClick. Cell clicks remain isolated to cell focus/edit (per ARCHITECTURE.md
 * §6.6: "Shift+Click row drag handle: extend selection to range / Cmd/Ctrl+Click
 * row drag handle: toggle individual rows").
 *
 * Anchor moves with each toggle so subsequent Shift-clicks extend from the most
 * recent toggle rather than a fixed start. `extendRange` REPLACES the current
 * selection with the inclusive index range — Sheets convention, not additive.
 */
export interface GridSelection {
    selectedIds: ReadonlySet<string>
    anchorId: string | null
    /** Cmd/Ctrl-click semantics: flip id in/out, anchor moves to id. */
    toggle: (id: string) => void
    /** Shift-click semantics: replace selection with inclusive range from anchor to id (in `allIds` order). Falls back to single-select when anchor is null. */
    extendRange: (id: string, allIds: string[]) => void
    /** Esc / programmatic clear. */
    clear: () => void
    has: (id: string) => boolean
    /**
     * Drop ids not present in `validIds` (e.g., when a remote delete removes a
     * row from the live query). Preserves anchor if still valid. Survivor ids
     * stay selected — surgical, not all-or-nothing.
     */
    pruneTo: (validIds: Iterable<string>) => void
}

/**
 * Pure helper extracted for unit testing without React. Returns the inclusive
 * index range between `anchorId` and `currentId` in `allIds` order. Anchor
 * after current is supported (reverse-direction Shift-click).
 */
export function computeRangeSelection(
    allIds: string[],
    anchorId: string | null,
    currentId: string,
): Set<string> {
    if (!anchorId || anchorId === currentId) {
        return new Set([currentId])
    }
    const anchorIdx = allIds.indexOf(anchorId)
    const currentIdx = allIds.indexOf(currentId)
    if (anchorIdx === -1 || currentIdx === -1) {
        // Stale anchor (deleted row, etc.) — degrade to single-select.
        return new Set([currentId])
    }
    const lo = Math.min(anchorIdx, currentIdx)
    const hi = Math.max(anchorIdx, currentIdx)
    const out = new Set<string>()
    for (let i = lo; i <= hi; i++) out.add(allIds[i])
    return out
}

export function useGridSelection(): GridSelection {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(
        () => new Set(),
    )
    const [anchorId, setAnchorId] = useState<string | null>(null)

    const toggle = useCallback((id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
        setAnchorId(id)
    }, [])

    const extendRange = useCallback(
        (id: string, allIds: string[]) => {
            setSelectedIds((prev) => {
                const range = computeRangeSelection(allIds, anchorId, id)
                // If no anchor was set, also stash the new id as anchor below.
                return range
            })
            if (!anchorId) setAnchorId(id)
        },
        [anchorId],
    )

    const clear = useCallback(() => {
        setSelectedIds((prev) => (prev.size === 0 ? prev : new Set()))
        setAnchorId(null)
    }, [])

    const has = useCallback(
        (id: string) => selectedIds.has(id),
        [selectedIds],
    )

    const pruneTo = useCallback((validIds: Iterable<string>) => {
        const valid = new Set(validIds)
        setSelectedIds((prev) => {
            let changed = false
            const next = new Set<string>()
            for (const id of prev) {
                if (valid.has(id)) next.add(id)
                else changed = true
            }
            return changed ? next : prev
        })
        setAnchorId((prev) =>
            prev !== null && !valid.has(prev) ? null : prev,
        )
    }, [])

    return {
        selectedIds,
        anchorId,
        toggle,
        extendRange,
        clear,
        has,
        pruneTo,
    }
}
