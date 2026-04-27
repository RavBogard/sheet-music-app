'use client'

import {
    Copy,
    Edit3,
    FileText,
    GripVertical,
    Music,
    Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useRef } from 'react'

import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuLabel,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from '@/components/ui/context-menu'
import type { LocalTrack } from '@/lib/local/types'
import { cn } from '@/lib/utils'

export interface MobileRowCardProps {
    track: LocalTrack
    isSelected: boolean
    /** True when row is part of a multi-selection ≥ 2 — enables ContextMenu
     *  bulk-routing semantics (Edit/Bind/Duplicate disable; Delete → bulk). */
    isInBulkSelection: boolean
    /** Total selection size — drives the "N rows selected" label. */
    bulkSelectionCount: number
    onSelectionClick: (modifiers: { shift: boolean; meta: boolean }) => void
    /** Plain card tap (no modifier) — opens edit Sheet. */
    onTap: () => void
    onContextEditRow: () => void
    onContextBindChart: () => void
    onContextDuplicate: () => void
    onContextDelete: () => void
}

/**
 * v50-05-05 mobile card row — parallel to desktop SortableRow but for the
 * stacked-card render path (below 768px). Title / key / lead visible at
 * rest, chart-bound icon on the right, drag/select handle on the left.
 *
 * - Plain tap → onTap() (parent opens MobileEditSheet)
 * - Modifier-click on the handle (Shift/Cmd/Ctrl) → onSelectionClick
 * - Long-press 500ms (touch only) → re-emits a synthetic contextmenu
 *   MouseEvent on the card so Radix ContextMenu opens (same trick as
 *   v50-05-04 SortableRow). Cancels on >10px movement or quick release.
 *   pointerType='mouse' skips entirely.
 */
export function MobileRowCard({
    track,
    isSelected,
    isInBulkSelection,
    bulkSelectionCount,
    onSelectionClick,
    onTap,
    onContextEditRow,
    onContextBindChart,
    onContextDuplicate,
    onContextDelete,
}: MobileRowCardProps) {
    const longPressTimerRef = useRef<number | null>(null)
    const longPressStartRef = useRef<{ x: number; y: number } | null>(null)
    const cardElRef = useRef<HTMLLIElement | null>(null)

    const cancelLongPress = useCallback(() => {
        if (longPressTimerRef.current !== null) {
            window.clearTimeout(longPressTimerRef.current)
            longPressTimerRef.current = null
        }
    }, [])

    const handlePointerDown: React.PointerEventHandler<HTMLLIElement> = (e) => {
        if (e.pointerType !== 'touch') return
        cancelLongPress()
        const x = e.clientX
        const y = e.clientY
        longPressStartRef.current = { x, y }
        longPressTimerRef.current = window.setTimeout(() => {
            longPressTimerRef.current = null
            cardElRef.current?.dispatchEvent(
                new MouseEvent('contextmenu', {
                    bubbles: true,
                    cancelable: true,
                    clientX: x,
                    clientY: y,
                }),
            )
        }, 500)
    }

    const handlePointerMove: React.PointerEventHandler<HTMLLIElement> = (e) => {
        if (e.pointerType !== 'touch') return
        if (
            !longPressStartRef.current ||
            longPressTimerRef.current === null
        ) {
            return
        }
        const dx = e.clientX - longPressStartRef.current.x
        const dy = e.clientY - longPressStartRef.current.y
        if (dx * dx + dy * dy > 100) {
            cancelLongPress()
        }
    }

    const handlePointerEnd: React.PointerEventHandler<HTMLLIElement> = () => {
        cancelLongPress()
    }

    useEffect(() => () => cancelLongPress(), [cancelLongPress])

    const handleCardClick: React.MouseEventHandler<HTMLLIElement> = (e) => {
        // Don't fire onTap when the click target is the inner handle button
        // (it has its own onClick that stopPropagation's already).
        if (e.shiftKey || e.metaKey || e.ctrlKey) {
            // Modifier-click on the card body routes to selection too —
            // matches desktop pattern where modifier-click on drag handle
            // is the selection trigger.
            e.preventDefault()
            onSelectionClick({
                shift: e.shiftKey,
                meta: e.metaKey || e.ctrlKey,
            })
            return
        }
        onTap()
    }

    const handleHandleClick: React.MouseEventHandler<HTMLButtonElement> = (
        e,
    ) => {
        e.stopPropagation()
        if (e.shiftKey || e.metaKey || e.ctrlKey) {
            e.preventDefault()
            onSelectionClick({
                shift: e.shiftKey,
                meta: e.metaKey || e.ctrlKey,
            })
            return
        }
        // Plain handle-click on mobile = toggle selection (since there's
        // no drag-from-handle gesture in v1; mobile reorder is done via
        // the edit Sheet's Move up/down buttons).
        onSelectionClick({ shift: false, meta: true })
    }

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <li
                    ref={cardElRef}
                    role="listitem"
                    data-testid={`mobile-card-${track.id}`}
                    data-row-id={track.id}
                    data-selected={isSelected || undefined}
                    onClick={handleCardClick}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerEnd}
                    onPointerLeave={handlePointerEnd}
                    onPointerCancel={handlePointerEnd}
                    style={{ touchAction: 'pan-y' }}
                    tabIndex={0}
                    aria-label={`${track.title || 'Untitled track'}. Tap to edit.`}
                    className={cn(
                        'flex items-center gap-3 rounded-lg border px-3 py-3',
                        'min-h-[64px] cursor-pointer',
                        'border-white/10 bg-card hover:bg-white/[0.02]',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
                        'transition-colors duration-150 motion-reduce:transition-none',
                        isSelected &&
                            'border-indigo-400/40 bg-indigo-500/5',
                    )}
                >
                    <button
                        type="button"
                        aria-label={`${isSelected ? 'Selected — ' : ''}Toggle selection for ${track.title || 'untitled track'}`}
                        aria-pressed={isSelected ? true : undefined}
                        data-testid={`mobile-card-handle-${track.id}`}
                        onClick={handleHandleClick}
                        className={cn(
                            'flex h-11 w-11 flex-none items-center justify-center rounded-sm',
                            'cursor-pointer',
                            isSelected
                                ? 'text-indigo-300 bg-indigo-500/10 ring-1 ring-indigo-400/40'
                                : 'text-muted-foreground/60',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
                            'transition-colors duration-150 motion-reduce:transition-none',
                        )}
                    >
                        <GripVertical aria-hidden className="h-4 w-4" />
                    </button>

                    <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                        <span className="truncate text-sm font-medium text-foreground">
                            {track.title || (
                                <span className="text-muted-foreground/60">
                                    Untitled
                                </span>
                            )}
                        </span>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {track.key ? (
                                <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono">
                                    {track.key}
                                </span>
                            ) : null}
                            {track.leadMusician ? (
                                <span className="truncate">
                                    {track.leadMusician}
                                </span>
                            ) : null}
                        </div>
                    </div>

                    <span
                        aria-label={
                            track.songId ? 'Chart bound' : 'No chart bound'
                        }
                        className="flex-none"
                    >
                        {track.songId ? (
                            <Music
                                aria-hidden
                                className="h-4 w-4 text-indigo-400"
                            />
                        ) : (
                            <FileText
                                aria-hidden
                                className="h-4 w-4 text-muted-foreground/50"
                            />
                        )}
                    </span>
                </li>
            </ContextMenuTrigger>
            <ContextMenuContent
                data-testid={`mobile-card-context-menu-${track.id}`}
            >
                {isInBulkSelection ? (
                    <>
                        <ContextMenuLabel
                            data-testid="mobile-card-context-menu-bulk-label"
                            className="text-indigo-300"
                        >
                            {bulkSelectionCount} rows selected
                        </ContextMenuLabel>
                        <ContextMenuSeparator />
                    </>
                ) : null}
                <ContextMenuItem
                    onSelect={onContextEditRow}
                    disabled={isInBulkSelection}
                    data-testid="mobile-card-context-menu-edit"
                    className="cursor-pointer"
                >
                    <Edit3 aria-hidden className="mr-2 h-4 w-4" />
                    Edit row
                </ContextMenuItem>
                <ContextMenuItem
                    onSelect={onContextBindChart}
                    disabled={isInBulkSelection}
                    data-testid="mobile-card-context-menu-bind-chart"
                    className="cursor-pointer"
                >
                    <Music aria-hidden className="mr-2 h-4 w-4" />
                    Bind chart
                </ContextMenuItem>
                <ContextMenuItem
                    onSelect={onContextDuplicate}
                    disabled={isInBulkSelection}
                    data-testid="mobile-card-context-menu-duplicate"
                    className="cursor-pointer"
                >
                    <Copy aria-hidden className="mr-2 h-4 w-4" />
                    Duplicate row
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                    onSelect={onContextDelete}
                    data-testid="mobile-card-context-menu-delete"
                    className="cursor-pointer text-red-300 focus:text-red-200 focus:bg-red-500/15"
                >
                    <Trash2 aria-hidden className="mr-2 h-4 w-4" />
                    Delete row
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    )
}
