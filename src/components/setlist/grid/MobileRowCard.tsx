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
                        'group flex items-center gap-4 rounded-2xl border px-4 py-4',
                        'min-h-[72px] cursor-pointer relative overflow-hidden',
                        'bg-white/[0.02] backdrop-blur-md border-white/10 hover:bg-white-[0.04]',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                        'transition-all duration-200 motion-reduce:transition-none',
                        isSelected &&
                            'border-brand/40 bg-brand/5 shadow-[0_0_15px_rgba(67,56,202,0.15)]',
                    )}
                >
                    <button
                        type="button"
                        aria-label={`${isSelected ? 'Selected — ' : ''}Toggle selection for ${track.title || 'untitled track'}`}
                        aria-pressed={isSelected ? true : undefined}
                        data-testid={`mobile-card-handle-${track.id}`}
                        onClick={handleHandleClick}
                        className={cn(
                            'flex flex-col items-center gap-1 justify-center rounded-md',
                            'cursor-pointer p-2 -ml-2',
                            isSelected
                                ? 'text-brand bg-brand/10 ring-1 ring-brand/40'
                                : 'text-muted-foreground/50 hover:text-muted-foreground',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                            'transition-colors duration-150 motion-reduce:transition-none',
                        )}
                    >
                        <GripVertical aria-hidden className="h-5 w-5" />
                        <span className="text-[10px] font-bold opacity-40 font-mono tracking-widest">{(track.order + 1).toString().padStart(2, '0')}</span>
                    </button>

                    <div className="min-w-0 flex-1 flex flex-col gap-1">
                        <span className="truncate text-lg font-semibold text-foreground group-hover:text-brand transition-colors">
                            {track.title || (
                                <span className="text-muted-foreground/60 font-medium">
                                    Untitled Track
                                </span>
                            )}
                        </span>
                        {/* Empty subtitle slot for potential future use (e.g. artist) */}
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                        {track.key ? (
                            <div className="bg-brand/10 border border-brand/20 rounded-lg px-2.5 py-1 text-center min-w-[3rem]">
                                <p className="text-[9px] text-brand/70 uppercase font-bold tracking-tighter leading-none mb-0.5">Key</p>
                                <p className="text-brand font-bold text-xs leading-none">{track.key}</p>
                            </div>
                        ) : null}
                        
                        {track.leadMusician ? (
                            <div className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1 text-center max-w-[5rem]">
                                <p className="text-[9px] text-muted-foreground/70 uppercase font-bold tracking-tighter leading-none mb-0.5">Lead</p>
                                <p className="text-foreground font-bold text-xs leading-none truncate">{track.leadMusician}</p>
                            </div>
                        ) : null}
                    </div>

                    <span
                        aria-label={
                            track.songId ? 'Chart bound' : 'No chart bound'
                        }
                        className="flex-none ml-2"
                    >
                        {track.songId ? (
                            <Music
                                aria-hidden
                                className="h-5 w-5 text-brand opacity-80"
                            />
                        ) : (
                            <FileText
                                aria-hidden
                                className="h-5 w-5 text-muted-foreground/30"
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
