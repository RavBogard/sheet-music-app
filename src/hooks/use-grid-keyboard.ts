'use client'

import { useCallback, useState } from 'react'

/**
 * Roving-focus controller for the spreadsheet editor grid. Tracks which cell
 * (rowIndex × colId) currently owns Tab focus. Cells render with `tabIndex=0`
 * only when they are the focused cell; all other cells render `tabIndex=-1`,
 * so a single Tab press moves OUT of the grid rather than walking through
 * every cell. Arrow keys move focus within the grid; Enter/Tab commits and
 * advances; Esc deselects.
 *
 * Caller responsibility: invoke `handleCellFocus(rowIndex, colId)` from the
 * cell's onFocus, and call `handleCellKeyDown` from the cell's onKeyDown
 * (after letting the cell handle Esc/Enter/Tab itself when in edit mode).
 */
export interface FocusedCell {
    rowIndex: number
    colId: string
}

export interface UseGridKeyboardOptions {
    rowCount: number
    /** Editable column ids in display order, e.g. `['type','title','key','bpm','leadMusician','notes']` */
    editableColIds: string[]
    /** Optional: forwarded by callers wanting to know when focus exits the grid (e.g. continuous-add). */
    onTabPastLastCell?: () => void
    onShiftTabPastFirstCell?: () => void
}

export interface UseGridKeyboardResult {
    focusedCell: FocusedCell | null
    isCellFocused: (rowIndex: number, colId: string) => boolean
    handleCellFocus: (rowIndex: number, colId: string) => void
    handleCellBlur: () => void
    moveFocus: (
        direction: 'up' | 'down' | 'left' | 'right' | 'firstCell' | 'lastCell',
    ) => FocusedCell | null
    /** Returns true if the event was consumed by navigation. */
    handleCellKeyDown: (
        event: KeyboardEvent | React.KeyboardEvent,
        rowIndex: number,
        colId: string,
    ) => boolean
}

export function useGridKeyboard({
    rowCount,
    editableColIds,
    onTabPastLastCell,
    onShiftTabPastFirstCell,
}: UseGridKeyboardOptions): UseGridKeyboardResult {
    const [focusedCell, setFocusedCell] = useState<FocusedCell | null>(null)

    const isCellFocused = useCallback(
        (rowIndex: number, colId: string) =>
            focusedCell?.rowIndex === rowIndex && focusedCell?.colId === colId,
        [focusedCell],
    )

    const handleCellFocus = useCallback(
        (rowIndex: number, colId: string) => {
            setFocusedCell({ rowIndex, colId })
        },
        [],
    )

    const handleCellBlur = useCallback(() => {
        // Intentionally noop: keep `focusedCell` so roving tabindex stays
        // consistent across re-renders. Callers that want to clear focus
        // (e.g. on Esc) call moveFocus accordingly or set focusedCell to
        // null explicitly via the caller — but we keep this private.
    }, [])

    const moveFocus = useCallback(
        (
            direction:
                | 'up'
                | 'down'
                | 'left'
                | 'right'
                | 'firstCell'
                | 'lastCell',
        ): FocusedCell | null => {
            if (editableColIds.length === 0 || rowCount === 0) return null

            if (direction === 'firstCell') {
                const next = { rowIndex: 0, colId: editableColIds[0] }
                setFocusedCell(next)
                return next
            }
            if (direction === 'lastCell') {
                const next = {
                    rowIndex: rowCount - 1,
                    colId: editableColIds[editableColIds.length - 1],
                }
                setFocusedCell(next)
                return next
            }

            if (!focusedCell) {
                const next = { rowIndex: 0, colId: editableColIds[0] }
                setFocusedCell(next)
                return next
            }

            const colIdx = editableColIds.indexOf(focusedCell.colId)
            if (colIdx === -1) {
                const fallback = {
                    rowIndex: focusedCell.rowIndex,
                    colId: editableColIds[0],
                }
                setFocusedCell(fallback)
                return fallback
            }

            let nextRow = focusedCell.rowIndex
            let nextCol = colIdx

            if (direction === 'up') nextRow = Math.max(0, focusedCell.rowIndex - 1)
            else if (direction === 'down')
                nextRow = Math.min(rowCount - 1, focusedCell.rowIndex + 1)
            else if (direction === 'left') {
                if (colIdx === 0) {
                    if (focusedCell.rowIndex === 0) {
                        onShiftTabPastFirstCell?.()
                        return null
                    }
                    nextRow = focusedCell.rowIndex - 1
                    nextCol = editableColIds.length - 1
                } else {
                    nextCol = colIdx - 1
                }
            } else if (direction === 'right') {
                if (colIdx === editableColIds.length - 1) {
                    if (focusedCell.rowIndex === rowCount - 1) {
                        onTabPastLastCell?.()
                        return null
                    }
                    nextRow = focusedCell.rowIndex + 1
                    nextCol = 0
                } else {
                    nextCol = colIdx + 1
                }
            }

            const next: FocusedCell = {
                rowIndex: nextRow,
                colId: editableColIds[nextCol],
            }
            setFocusedCell(next)
            return next
        },
        [focusedCell, editableColIds, rowCount, onTabPastLastCell, onShiftTabPastFirstCell],
    )

    const handleCellKeyDown = useCallback(
        (
            event: KeyboardEvent | React.KeyboardEvent,
            rowIndex: number,
            colId: string,
        ): boolean => {
            const key = event.key
            if (key === 'ArrowUp') {
                event.preventDefault()
                moveFocus('up')
                return true
            }
            if (key === 'ArrowDown') {
                event.preventDefault()
                moveFocus('down')
                return true
            }
            if (key === 'ArrowLeft') {
                // Don't intercept when editing — input has its own arrow keys.
                event.preventDefault()
                moveFocus('left')
                return true
            }
            if (key === 'ArrowRight') {
                event.preventDefault()
                moveFocus('right')
                return true
            }
            // Tab/Enter/Esc are handled by the cells themselves so they can
            // commit drafts before navigation. Cells call moveFocus(left/right)
            // post-commit.
            void rowIndex
            void colId
            return false
        },
        [moveFocus],
    )

    return {
        focusedCell,
        isCellFocused,
        handleCellFocus,
        handleCellBlur,
        moveFocus,
        handleCellKeyDown,
    }
}
