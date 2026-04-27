'use client'

import {
    DndContext,
    type DragEndEvent,
    KeyboardSensor,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
} from '@dnd-kit/core'
import {
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
    type CellContext,
    type ColumnDef,
    type Row,
    flexRender,
    getCoreRowModel,
    type Table as TanstackTable,
    useReactTable,
} from '@tanstack/react-table'
import { useLiveQuery } from 'dexie-react-hooks'
import { Copy, Edit3, Music, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuLabel,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { getDb } from '@/lib/local/schema'
import type { LocalTrack } from '@/lib/local/types'
import { applyEdit } from '@/lib/local/write'
import {
    propagateTrackEditToSong,
    seedTrackFromSong,
    type TrackDefaults,
} from '@/lib/songs/defaults'
import { useGridKeyboard } from '@/hooks/use-grid-keyboard'
import { useGridSelection } from '@/hooks/use-grid-selection'
import { cn } from '@/lib/utils'

import { AddRowPlaceholder } from './AddRowPlaceholder'
import { BatchActionBar, type BulkSetPatch } from './BatchActionBar'
import { ChartBindPopover, type ChartBindSelection } from './ChartBindPopover'
import { ChartCell } from './cells/ChartCell'
import {
    useDeleteConfirmOptional,
    type ConfirmInfo,
} from './DeleteConfirmProvider'
import { DragHandleCell } from './cells/DragHandleCell'
import { KeyCell } from './cells/KeyCell'
import { LeadCell } from './cells/LeadCell'
import { TextCell } from './cells/TextCell'
import { TypeCell } from './cells/TypeCell'
import { EmptyState } from './EmptyState'
import { SetlistGridTopBar } from './SetlistGridTopBar'

const EDITABLE_COL_IDS = [
    'type',
    'title',
    'key',
    'bpm',
    'leadMusician',
    'notes',
] as const

interface GridMeta {
    setlistId: string
    isCellFocused: (rowIndex: number, colId: string) => boolean
    handleCellFocus: (rowIndex: number, colId: string) => void
    moveFocus: (
        direction: 'up' | 'down' | 'left' | 'right',
    ) => unknown
    handleCellKeyDown: (
        event: React.KeyboardEvent,
        rowIndex: number,
        colId: string,
    ) => boolean
    setlistLeads: string[]
    onDeleteRow: (track: LocalTrack) => void
    onCommitTrackPatch: (
        docId: string,
        patch: Record<string, unknown>,
    ) => Promise<void>
    onBindChart: (track: LocalTrack, selection: ChartBindSelection) => void
    setlistIdForPropagation: string
    /** v50-05-03: row id ∈ multi-select set. */
    selectedIds: ReadonlySet<string>
    /** v50-05-03: drag-handle modifier-aware click → selection action. */
    onDragHandleClick: (
        rowId: string,
        modifiers: { shift: boolean; meta: boolean },
    ) => void
    /** v50-05-04: ChartBindPopover is open for this row (or null). */
    chartBindOpenRowId: string | null
    /** v50-05-04: open / close ChartBindPopover for a specific row. */
    onChartBindOpenChange: (rowId: string, next: boolean) => void
}

declare module '@tanstack/react-table' {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    interface TableMeta<TData extends unknown> extends GridMeta {}
}

function getMeta(table: TanstackTable<LocalTrack>): GridMeta {
    return table.options.meta as GridMeta
}

function maybePropagate(
    row: LocalTrack,
    helperPatch: TrackDefaults,
    setlistId: string,
): void {
    if (!row.songId) return
    if (Object.keys(helperPatch).length === 0) return
    propagateTrackEditToSong(row.songId, helperPatch, setlistId)
}

const COLUMNS: ColumnDef<LocalTrack>[] = [
    {
        id: 'drag',
        header: () => <span className="sr-only">Drag handle</span>,
        size: 44,
        cell: () => null, // Rendered by SortableRow with sortable attrs
    },
    {
        id: 'type',
        accessorKey: 'type',
        header: 'Type',
        size: 120,
        cell: (ctx: CellContext<LocalTrack, unknown>) => {
            const meta = getMeta(ctx.table)
            const row = ctx.row.original
            const colId = 'type'
            return (
                <TypeCell
                    value={String(ctx.getValue() ?? 'song')}
                    isFocused={meta.isCellFocused(ctx.row.index, colId)}
                    onFocus={() => meta.handleCellFocus(ctx.row.index, colId)}
                    onMoveFocus={(d) => meta.moveFocus(d)}
                    onCellKeyDown={(e) =>
                        meta.handleCellKeyDown(e, ctx.row.index, colId)
                    }
                    onCommit={(next) => {
                        if (!next || next === (row.type as string)) return
                        void meta.onCommitTrackPatch(row.id, { type: next })
                    }}
                />
            )
        },
    },
    {
        id: 'title',
        accessorKey: 'title',
        header: 'Title',
        cell: (ctx: CellContext<LocalTrack, unknown>) => {
            const meta = getMeta(ctx.table)
            const row = ctx.row.original
            const colId = 'title'
            return (
                <TextCell
                    value={(ctx.getValue() ?? '') as string}
                    isFocused={meta.isCellFocused(ctx.row.index, colId)}
                    onFocus={() => meta.handleCellFocus(ctx.row.index, colId)}
                    onMoveFocus={(d) => meta.moveFocus(d)}
                    onCellKeyDown={(e) =>
                        meta.handleCellKeyDown(e, ctx.row.index, colId)
                    }
                    placeholder="Title"
                    ariaLabel="Track title"
                    onCommit={(next) => {
                        void meta.onCommitTrackPatch(row.id, { title: next })
                    }}
                />
            )
        },
    },
    {
        id: 'key',
        accessorKey: 'key',
        header: 'Key',
        size: 80,
        cell: (ctx: CellContext<LocalTrack, unknown>) => {
            const meta = getMeta(ctx.table)
            const row = ctx.row.original
            const colId = 'key'
            return (
                <KeyCell
                    value={(ctx.getValue() ?? undefined) as string | undefined}
                    isFocused={meta.isCellFocused(ctx.row.index, colId)}
                    onFocus={() => meta.handleCellFocus(ctx.row.index, colId)}
                    onMoveFocus={(d) => meta.moveFocus(d)}
                    onCellKeyDown={(e) =>
                        meta.handleCellKeyDown(e, ctx.row.index, colId)
                    }
                    onCommit={(next) => {
                        void meta.onCommitTrackPatch(row.id, { key: next })
                        maybePropagate(
                            row,
                            { key: next },
                            meta.setlistIdForPropagation,
                        )
                    }}
                />
            )
        },
    },
    {
        id: 'bpm',
        accessorKey: 'bpm',
        header: 'BPM',
        size: 72,
        cell: (ctx: CellContext<LocalTrack, unknown>) => {
            const meta = getMeta(ctx.table)
            const row = ctx.row.original
            const colId = 'bpm'
            return (
                <TextCell
                    value={
                        ctx.getValue() === undefined
                            ? ''
                            : String(ctx.getValue())
                    }
                    type="number"
                    isFocused={meta.isCellFocused(ctx.row.index, colId)}
                    onFocus={() => meta.handleCellFocus(ctx.row.index, colId)}
                    onMoveFocus={(d) => meta.moveFocus(d)}
                    onCellKeyDown={(e) =>
                        meta.handleCellKeyDown(e, ctx.row.index, colId)
                    }
                    placeholder="BPM"
                    ariaLabel="Track tempo (BPM)"
                    onCommit={(raw) => {
                        const trimmed = raw.trim()
                        if (trimmed === '') {
                            void meta.onCommitTrackPatch(row.id, {
                                bpm: undefined,
                            })
                            return
                        }
                        const next = Number(trimmed)
                        if (!Number.isFinite(next)) return
                        void meta.onCommitTrackPatch(row.id, { bpm: next })
                        maybePropagate(
                            row,
                            { bpm: next },
                            meta.setlistIdForPropagation,
                        )
                    }}
                />
            )
        },
    },
    {
        id: 'leadMusician',
        accessorKey: 'leadMusician',
        header: 'Lead',
        cell: (ctx: CellContext<LocalTrack, unknown>) => {
            const meta = getMeta(ctx.table)
            const row = ctx.row.original
            const colId = 'leadMusician'
            return (
                <LeadCell
                    value={(ctx.getValue() ?? undefined) as string | undefined}
                    setlistLeads={meta.setlistLeads}
                    isFocused={meta.isCellFocused(ctx.row.index, colId)}
                    onFocus={() => meta.handleCellFocus(ctx.row.index, colId)}
                    onMoveFocus={(d) => meta.moveFocus(d)}
                    onCellKeyDown={(e) =>
                        meta.handleCellKeyDown(e, ctx.row.index, colId)
                    }
                    onCommit={(next) => {
                        void meta.onCommitTrackPatch(row.id, {
                            leadMusician: next,
                        })
                        maybePropagate(
                            row,
                            { lead: next },
                            meta.setlistIdForPropagation,
                        )
                    }}
                />
            )
        },
    },
    {
        id: 'notes',
        accessorKey: 'notes',
        header: 'Notes',
        cell: (ctx: CellContext<LocalTrack, unknown>) => {
            const meta = getMeta(ctx.table)
            const row = ctx.row.original
            const colId = 'notes'
            return (
                <TextCell
                    value={(ctx.getValue() ?? '') as string}
                    isFocused={meta.isCellFocused(ctx.row.index, colId)}
                    onFocus={() => meta.handleCellFocus(ctx.row.index, colId)}
                    onMoveFocus={(d) => meta.moveFocus(d)}
                    onCellKeyDown={(e) =>
                        meta.handleCellKeyDown(e, ctx.row.index, colId)
                    }
                    placeholder="Notes"
                    ariaLabel="Track notes"
                    onCommit={(next) => {
                        void meta.onCommitTrackPatch(row.id, { notes: next })
                    }}
                />
            )
        },
    },
    {
        id: 'chart',
        header: () => <span className="sr-only">Chart</span>,
        size: 44,
        cell: (ctx: CellContext<LocalTrack, unknown>) => {
            const meta = getMeta(ctx.table)
            const row = ctx.row.original
            return (
                <ChartBindPopover
                    currentSongId={row.songId}
                    inputAriaLabel={`Bind a chart to ${row.title || 'track'}`}
                    onBind={(sel) => meta.onBindChart(row, sel)}
                    open={meta.chartBindOpenRowId === row.id}
                    onOpenChange={(next) =>
                        meta.onChartBindOpenChange(row.id, next)
                    }
                >
                    <ChartCell hasChart={Boolean(row.songId)} />
                </ChartBindPopover>
            )
        },
    },
]

interface SortableRowProps {
    row: Row<LocalTrack>
    onDeleteRow: (track: LocalTrack) => void
    isSelected: boolean
    onSelectionClick: (modifiers: { shift: boolean; meta: boolean }) => void
    /** Right-clicked row is in the multi-selection ≥ 2 → ContextMenu
     *  actions target the bulk set; Edit/Bind/Duplicate disable. */
    isInBulkSelection: boolean
    /** Total selection size — drives the "N rows selected" header. */
    bulkSelectionCount: number
    onContextEditRow: (rowIndex: number) => void
    onContextBindChart: (rowId: string) => void
    onContextDuplicate: (rowId: string) => void
    onContextDelete: (track: LocalTrack) => void
}

function SortableRow({
    row,
    onDeleteRow,
    isSelected,
    onSelectionClick,
    isInBulkSelection,
    bulkSelectionCount,
    onContextEditRow,
    onContextBindChart,
    onContextDuplicate,
    onContextDelete,
}: SortableRowProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: row.original.id })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
    } as React.CSSProperties

    // Long-press for touch: dispatch a synthetic contextmenu MouseEvent
    // after 500ms hold so iPads can open the row ContextMenu without a
    // mouse-button. Cancel on >10px movement (drag activation may be
    // starting) or quick release. Mouse pointer events skip this branch
    // entirely — desktop right-click is the natural path. Radix
    // ContextMenu does not expose a controlled `open` prop (per
    // @radix-ui/react-context-menu 2.2.16 typings), so we re-emit the
    // contextmenu event the Trigger already listens for.
    const longPressTimerRef = useRef<number | null>(null)
    const longPressStartRef = useRef<{ x: number; y: number } | null>(null)
    const trEl = useRef<HTMLTableRowElement | null>(null)

    const cancelLongPress = useCallback(() => {
        if (longPressTimerRef.current !== null) {
            window.clearTimeout(longPressTimerRef.current)
            longPressTimerRef.current = null
        }
    }, [])

    const handlePointerDown: React.PointerEventHandler<HTMLTableRowElement> = (
        e,
    ) => {
        if (e.pointerType !== 'touch') return
        cancelLongPress()
        const x = e.clientX
        const y = e.clientY
        longPressStartRef.current = { x, y }
        longPressTimerRef.current = window.setTimeout(() => {
            longPressTimerRef.current = null
            trEl.current?.dispatchEvent(
                new MouseEvent('contextmenu', {
                    bubbles: true,
                    cancelable: true,
                    clientX: x,
                    clientY: y,
                }),
            )
        }, 500)
    }

    const handlePointerMove: React.PointerEventHandler<HTMLTableRowElement> = (
        e,
    ) => {
        if (e.pointerType !== 'touch') return
        if (
            !longPressStartRef.current ||
            longPressTimerRef.current === null
        ) {
            return
        }
        const dx = e.clientX - longPressStartRef.current.x
        const dy = e.clientY - longPressStartRef.current.y
        // 10px squared = 100. Movement past this aborts the long-press
        // timer (the user is dragging, not holding).
        if (dx * dx + dy * dy > 100) {
            cancelLongPress()
        }
    }

    const handlePointerEnd: React.PointerEventHandler<HTMLTableRowElement> =
        () => {
            cancelLongPress()
        }

    useEffect(() => () => cancelLongPress(), [cancelLongPress])

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <tr
                    ref={(el) => {
                        setNodeRef(el)
                        trEl.current = el
                    }}
                    style={style}
                    role="row"
                    data-row-id={row.original.id}
                    data-dragging={isDragging || undefined}
                    data-selected={isSelected || undefined}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerEnd}
                    onPointerLeave={handlePointerEnd}
                    onPointerCancel={handlePointerEnd}
                    className={cn(
                        'border-b border-white/10 last:border-b-0 hover:bg-white/[0.02]',
                        isSelected && 'bg-indigo-500/5',
                        isDragging && 'shadow-lg ring-2 ring-indigo-400/40',
                    )}
                >
                    {row.getVisibleCells().map((cell, idx) => {
                        if (idx === 0) {
                            // Drag column: 44px desktop, 52px on touch
                            // breakpoints for tap accuracy
                            // (ARCHITECTURE.md §6.7).
                            return (
                                <td
                                    key={cell.id}
                                    role="gridcell"
                                    className="w-[44px] [@media(pointer:coarse)]:w-[52px] px-1 py-1 [@media(pointer:coarse)]:py-2 align-middle"
                                >
                                    <DragHandleCell
                                        attributes={attributes}
                                        listeners={listeners}
                                        title={String(
                                            row.original.title ?? '',
                                        )}
                                        onDelete={() =>
                                            onDeleteRow(row.original)
                                        }
                                        isSelected={isSelected}
                                        onSelectionClick={onSelectionClick}
                                    />
                                </td>
                            )
                        }
                        return (
                            <td
                                key={cell.id}
                                role="gridcell"
                                style={{ width: cell.column.getSize() }}
                                // Cell padding: 8px desktop, 12px on touch
                                // (py-3) for the 44px-min touch target.
                                className="px-2 py-1 [@media(pointer:coarse)]:py-3 align-middle"
                            >
                                {flexRender(
                                    cell.column.columnDef.cell,
                                    cell.getContext(),
                                )}
                            </td>
                        )
                    })}
                </tr>
            </ContextMenuTrigger>
            <ContextMenuContent
                data-testid={`row-context-menu-${row.original.id}`}
            >
                {isInBulkSelection ? (
                    <>
                        <ContextMenuLabel
                            data-testid="row-context-menu-bulk-label"
                            className="text-indigo-300"
                        >
                            {bulkSelectionCount} rows selected
                        </ContextMenuLabel>
                        <ContextMenuSeparator />
                    </>
                ) : null}
                <ContextMenuItem
                    onSelect={() => onContextEditRow(row.index)}
                    disabled={isInBulkSelection}
                    data-testid="row-context-menu-edit"
                    className="cursor-pointer"
                >
                    <Edit3 aria-hidden className="mr-2 h-4 w-4" />
                    Edit row
                </ContextMenuItem>
                <ContextMenuItem
                    onSelect={() => onContextBindChart(row.original.id)}
                    disabled={isInBulkSelection}
                    data-testid="row-context-menu-bind-chart"
                    className="cursor-pointer"
                >
                    <Music aria-hidden className="mr-2 h-4 w-4" />
                    Bind chart
                </ContextMenuItem>
                <ContextMenuItem
                    onSelect={() => onContextDuplicate(row.original.id)}
                    disabled={isInBulkSelection}
                    data-testid="row-context-menu-duplicate"
                    className="cursor-pointer"
                >
                    <Copy aria-hidden className="mr-2 h-4 w-4" />
                    Duplicate row
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                    onSelect={() => onContextDelete(row.original)}
                    data-testid="row-context-menu-delete"
                    className="cursor-pointer text-red-300 focus:text-red-200 focus:bg-red-500/15"
                >
                    <Trash2 aria-hidden className="mr-2 h-4 w-4" />
                    Delete row
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    )
}

export interface SetlistGridProps {
    setlistId: string
    name?: string
    eventDateLabel?: string
    onBack?: () => void
    /** Called by EmptyState's "Make next week's" CTA. */
    onMakeNextWeeks?: () => void | Promise<void>
    /** Called by EmptyState's "Use a template" CTA. */
    onUseTemplate?: () => void
    /** Caller hook: confirm a delete that has user-visible content. Defaults
     * to window.confirm. Allows tests to bypass the prompt. Legacy alias
     * — new callers should use `confirmDelete` (carries kind/count for
     * bulk vs single-row copy). */
    confirmDeleteWithTitle?: (title: string) => boolean | Promise<boolean>
    /** v50-05-03 destructive-action confirmation. Wins over the
     * back-compat `confirmDeleteWithTitle` and over the
     * `<DeleteConfirmProvider>` context fallback. */
    confirmDelete?: (info: ConfirmInfo) => Promise<boolean>
}

async function commitTrackPatchImpl(
    docId: string,
    patch: Record<string, unknown>,
): Promise<void> {
    // expectedUpdatedAt deferred to v50-06 (concurrent-edit safety phase).
    await applyEdit({
        op: 'update',
        collection: 'tracks',
        docId,
        patch,
    })
}

function makeId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID()
    }
    return `tr-${Math.random().toString(36).slice(2)}-${Date.now()}`
}

/**
 * Pure: given the current row list and a drag (active → over), compute
 * the set of `{ id, order }` updates that need to be applied. Extracted so
 * unit tests can verify reorder logic without simulating pointer/keyboard
 * drag in jsdom (which is genuinely fragile).
 */
export function computeReorderUpdates(
    currentRows: Pick<LocalTrack, 'id' | 'order'>[],
    activeId: string,
    overId: string,
): Array<{ id: string; order: number }> {
    if (activeId === overId) return []
    const oldIndex = currentRows.findIndex((r) => r.id === activeId)
    const newIndex = currentRows.findIndex((r) => r.id === overId)
    if (oldIndex < 0 || newIndex < 0) return []
    const reordered = currentRows.slice()
    const [moved] = reordered.splice(oldIndex, 1)
    reordered.splice(newIndex, 0, moved)
    const updates: Array<{ id: string; order: number }> = []
    for (let i = 0; i < reordered.length; i++) {
        if (reordered[i].order !== i) {
            updates.push({ id: reordered[i].id, order: i })
        }
    }
    return updates
}

export function SetlistGrid({
    setlistId,
    name,
    eventDateLabel,
    onBack,
    onMakeNextWeeks,
    onUseTemplate,
    confirmDeleteWithTitle,
    confirmDelete,
}: SetlistGridProps) {
    const router = useRouter()
    const dialogCtx = useDeleteConfirmOptional()

    // Resolves a confirmation request via the precedence:
    //   1. explicit `confirmDelete` prop (rich info shape; tests + power callers)
    //   2. legacy `confirmDeleteWithTitle` prop (back-compat for v50-05-01/02 tests)
    //   3. `<DeleteConfirmProvider>` context (production /setlists/[id] mount)
    //   4. window.confirm (final fallback when nothing else is wired)
    const confirmFn = useCallback(
        async (info: ConfirmInfo): Promise<boolean> => {
            if (confirmDelete) return confirmDelete(info)
            if (confirmDeleteWithTitle) {
                const title =
                    info.kind === 'row'
                        ? info.title
                        : `${info.count} rows`
                return confirmDeleteWithTitle(title)
            }
            if (dialogCtx) return dialogCtx.confirm(info)
            if (typeof window !== 'undefined') {
                const msg =
                    info.kind === 'row'
                        ? `Delete row "${info.title}"?`
                        : `Delete ${info.count} rows?`
                return window.confirm(msg)
            }
            return false
        },
        [confirmDelete, confirmDeleteWithTitle, dialogCtx],
    )

    const tracks = useLiveQuery(
        () =>
            getDb()
                .tracks.where('setlistId')
                .equals(setlistId)
                .sortBy('order'),
        [setlistId],
    ) as LocalTrack[] | undefined

    const isLoading = tracks === undefined
    const rows = tracks ?? []

    const selection = useGridSelection()
    const allRowIds = useMemo(() => rows.map((r) => r.id), [rows])

    // Stale-row prune: when a selected row disappears (remote delete or
    // hydration overwrite removes it from the live query), drop it from the
    // selection set. Survivors stay selected; anchor nulled if anchor itself
    // is stale.
    useEffect(() => {
        if (selection.selectedIds.size === 0) return
        selection.pruneTo(allRowIds)
    }, [allRowIds, selection])

    const handleDragHandleClick = useCallback(
        (rowId: string, modifiers: { shift: boolean; meta: boolean }) => {
            if (modifiers.shift) selection.extendRange(rowId, allRowIds)
            else if (modifiers.meta) selection.toggle(rowId)
        },
        [selection, allRowIds],
    )

    const handleRootKeyDown = useCallback<
        React.KeyboardEventHandler<HTMLDivElement>
    >(
        (e) => {
            if (e.key === 'Escape' && selection.selectedIds.size > 0) {
                e.preventDefault()
                selection.clear()
            }
        },
        [selection],
    )

    const setlistLeads = useMemo(
        () =>
            Array.from(
                new Set(
                    rows
                        .map((r) => r.leadMusician)
                        .filter((m): m is string => Boolean(m)),
                ),
            ),
        [rows],
    )

    // Imperative handle: when user clicks EmptyState's "Add a song", we
    // open the AddRowPlaceholder popover by toggling a key.
    const [addOpenSignal, setAddOpenSignal] = useState(0)
    const triggerAddOpen = useCallback(() => {
        setAddOpenSignal((s) => s + 1)
    }, [])

    // v50-05-04: ChartBindPopover open state hoisted to grid level so it
    // can be opened EITHER by ChartCell click (via the controllable open
    // prop) OR programmatically by the row ContextMenu's "Bind chart"
    // action (Task 2). At most one popover is open at a time, so a single
    // rowId-or-null is sufficient.
    const [chartBindOpenRowId, setChartBindOpenRowId] = useState<
        string | null
    >(null)
    const handleChartBindOpenChange = useCallback(
        (rowId: string, next: boolean) => {
            setChartBindOpenRowId(next ? rowId : null)
        },
        [],
    )

    const {
        isCellFocused,
        handleCellFocus,
        moveFocus,
        handleCellKeyDown,
    } = useGridKeyboard({
        rowCount: rows.length,
        editableColIds: EDITABLE_COL_IDS as unknown as string[],
        onTabPastLastCell: () => {
            triggerAddOpen()
        },
    })

    const handleDeleteRow = useCallback(
        async (track: LocalTrack) => {
            const title = track.title ?? ''
            if (title) {
                const ok = await confirmFn({ kind: 'row', title })
                if (!ok) return
            }
            await applyEdit({
                op: 'delete',
                collection: 'tracks',
                docId: track.id,
            })
        },
        [confirmFn],
    )

    const handleBindChart = useCallback(
        async (track: LocalTrack, sel: ChartBindSelection) => {
            const defaults = await seedTrackFromSong(sel.songId)
            const patch: Record<string, unknown> = {
                songId: sel.songId,
                title: sel.title,
            }
            if (defaults.key !== undefined) patch.key = defaults.key
            if (defaults.lead !== undefined) patch.leadMusician = defaults.lead
            if (defaults.bpm !== undefined) patch.bpm = defaults.bpm
            await applyEdit({
                op: 'update',
                collection: 'tracks',
                docId: track.id,
                patch,
            })
        },
        [],
    )

    const selectedTracks = useMemo(
        () => rows.filter((r) => selection.selectedIds.has(r.id)),
        [rows, selection.selectedIds],
    )

    const handleBulkSet = useCallback(
        async (patch: BulkSetPatch) => {
            if (selectedTracks.length === 0) return

            // Map the toolbar patch (which uses LocalTrack field names) into
            // the applyEdit shape; same fields, but cast to the writeable
            // record type the engine accepts.
            const writePatch: Record<string, unknown> = {}
            if (patch.type !== undefined) writePatch.type = patch.type
            if (patch.key !== undefined) writePatch.key = patch.key
            if (patch.leadMusician !== undefined)
                writePatch.leadMusician = patch.leadMusician
            if (Object.keys(writePatch).length === 0) return

            await Promise.all(
                selectedTracks.map((t) =>
                    applyEdit({
                        op: 'update',
                        collection: 'tracks',
                        docId: t.id,
                        patch: writePatch,
                    }),
                ),
            )

            // Sticky-memory propagation for fields that route through the
            // helper (key / lead / bpm). Toolbar only emits key + lead in V1;
            // bpm path is reserved for future toolbar growth.
            const helperPatch: TrackDefaults = {}
            if (patch.key !== undefined) helperPatch.key = patch.key
            if (patch.leadMusician !== undefined)
                helperPatch.lead = patch.leadMusician
            if (Object.keys(helperPatch).length > 0) {
                const uniqueSongIds = new Set(
                    selectedTracks
                        .map((t) => t.songId)
                        .filter((id): id is string => Boolean(id)),
                )
                for (const songId of uniqueSongIds) {
                    propagateTrackEditToSong(songId, helperPatch, setlistId)
                }
            }
            // Selection preserved across bulk-set per spec — user can keep
            // editing other fields on the same set.
        },
        [selectedTracks, setlistId],
    )

    const handleBulkDelete = useCallback(async () => {
        if (selectedTracks.length === 0) return
        const count = selectedTracks.length
        const ok = await confirmFn({ kind: 'bulk', count })
        if (!ok) return
        await Promise.all(
            selectedTracks.map((t) =>
                applyEdit({
                    op: 'delete',
                    collection: 'tracks',
                    docId: t.id,
                }),
            ),
        )
        selection.clear()
    }, [selectedTracks, selection, confirmFn])

    // v50-05-04 ContextMenu actions.
    const handleContextEditRow = useCallback(
        (rowIndex: number) => {
            handleCellFocus(rowIndex, 'title')
        },
        [handleCellFocus],
    )

    const handleContextBindChart = useCallback(
        (rowId: string) => {
            setChartBindOpenRowId(rowId)
        },
        [],
    )

    // Duplicate row: cascade-bump existing orders >= newOrder by 1, then
    // insert a clone of the source row at newOrder. Source's id and order
    // are replaced; all other fields (songId, title, key, bpm,
    // leadMusician, notes, type, setlistId) carry through. Per
    // ARCHITECTURE.md §4 the new row gets its own id; the songId stays
    // bound so the duplicate inherits the same chart and sticky-memory
    // defaults — that's what users want when duplicating a song row.
    const handleContextDuplicate = useCallback(
        async (rowId: string) => {
            const source = rows.find((r) => r.id === rowId)
            if (!source) return
            const newId = makeId()
            const newOrder = source.order + 1

            await Promise.all(
                rows
                    .filter((r) => r.order >= newOrder)
                    .map((r) =>
                        applyEdit({
                            op: 'update',
                            collection: 'tracks',
                            docId: r.id,
                            patch: { order: r.order + 1 },
                        }),
                    ),
            )

            await applyEdit({
                op: 'set',
                collection: 'tracks',
                doc: { ...source, id: newId, order: newOrder },
            })
        },
        [rows],
    )

    // Selection-aware delete: route to bulk path when the right-clicked
    // row is part of an active multi-selection (≥ 2). Otherwise target
    // just the one row, preserving the existing single-row Delete UX
    // (AlertDialog with quoted title).
    const handleContextDelete = useCallback(
        (track: LocalTrack) => {
            if (
                selection.selectedIds.has(track.id) &&
                selection.selectedIds.size >= 2
            ) {
                void handleBulkDelete()
                return
            }
            void handleDeleteRow(track)
        },
        [selection.selectedIds, handleBulkDelete, handleDeleteRow],
    )

    const meta = useMemo<GridMeta>(
        () => ({
            setlistId,
            isCellFocused,
            handleCellFocus,
            moveFocus,
            handleCellKeyDown,
            setlistLeads,
            onDeleteRow: (track) => void handleDeleteRow(track),
            onCommitTrackPatch: commitTrackPatchImpl,
            onBindChart: (track, sel) => void handleBindChart(track, sel),
            setlistIdForPropagation: setlistId,
            selectedIds: selection.selectedIds,
            onDragHandleClick: handleDragHandleClick,
            chartBindOpenRowId,
            onChartBindOpenChange: handleChartBindOpenChange,
        }),
        [
            setlistId,
            isCellFocused,
            handleCellFocus,
            moveFocus,
            handleCellKeyDown,
            setlistLeads,
            handleDeleteRow,
            handleBindChart,
            selection.selectedIds,
            handleDragHandleClick,
            chartBindOpenRowId,
            handleChartBindOpenChange,
        ],
    )

    const table = useReactTable({
        data: rows,
        columns: COLUMNS,
        getCoreRowModel: getCoreRowModel(),
        getRowId: (row) => row.id,
        meta,
    })

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { delay: 150, tolerance: 5 },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    )

    const handleDragEnd = useCallback(
        async (e: DragEndEvent) => {
            const { active, over } = e
            if (!over) return
            const updates = computeReorderUpdates(
                rows,
                String(active.id),
                String(over.id),
            )
            await Promise.all(
                updates.map(({ id, order }) =>
                    applyEdit({
                        op: 'update',
                        collection: 'tracks',
                        docId: id,
                        patch: { order },
                    }),
                ),
            )
        },
        [rows],
    )

    const handlePickSong = useCallback(
        async (song: { id: string; title: string }) => {
            const newId = makeId()
            const order = rows.length
            const defaults = await seedTrackFromSong(song.id)
            await applyEdit({
                op: 'set',
                collection: 'tracks',
                doc: {
                    id: newId,
                    setlistId,
                    songId: song.id,
                    order,
                    title: song.title,
                    type: 'song',
                },
            })
            if (Object.keys(defaults).length > 0) {
                const patch: Record<string, unknown> = {}
                if (defaults.key !== undefined) patch.key = defaults.key
                if (defaults.lead !== undefined)
                    patch.leadMusician = defaults.lead
                if (defaults.bpm !== undefined) patch.bpm = defaults.bpm
                await applyEdit({
                    op: 'update',
                    collection: 'tracks',
                    docId: newId,
                    patch,
                })
            }
        },
        [rows.length, setlistId],
    )

    const handleCreateFreeText = useCallback(
        async (title: string) => {
            const newId = makeId()
            const order = rows.length
            await applyEdit({
                op: 'set',
                collection: 'tracks',
                doc: {
                    id: newId,
                    setlistId,
                    order,
                    title,
                    type: 'song',
                },
            })
        },
        [rows.length, setlistId],
    )

    const [cloneBusy, setCloneBusy] = useState(false)
    const handleClone = useCallback(async () => {
        if (!onMakeNextWeeks) return
        setCloneBusy(true)
        try {
            await onMakeNextWeeks()
        } finally {
            setCloneBusy(false)
        }
    }, [onMakeNextWeeks])

    const showEmpty = !isLoading && rows.length === 0

    const sortableIds = useMemo(() => rows.map((r) => r.id), [rows])

    // Track signal increments to remount the placeholder so its `autoOpen`
    // effect re-fires.
    const lastSignalRef = useRef(addOpenSignal)
    const placeholderKey =
        addOpenSignal !== lastSignalRef.current
            ? (lastSignalRef.current = addOpenSignal)
            : addOpenSignal

    return (
        <div
            data-testid="setlist-grid"
            data-setlist-id={setlistId}
            className="flex w-full flex-col"
            onKeyDown={handleRootKeyDown}
        >
            <SetlistGridTopBar
                name={name ?? 'New Setlist'}
                eventDateLabel={eventDateLabel}
                onBack={onBack ?? (() => router.back())}
            />

            {selectedTracks.length >= 2 ? (
                <BatchActionBar
                    selectedTracks={selectedTracks}
                    onClear={selection.clear}
                    onBulkSet={handleBulkSet}
                    onBulkDelete={handleBulkDelete}
                />
            ) : null}

            {showEmpty ? (
                <EmptyState
                    onMakeNextWeeks={handleClone}
                    onAddSong={triggerAddOpen}
                    onUseTemplate={onUseTemplate ?? (() => {})}
                    busy={cloneBusy}
                />
            ) : (
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={(e) => void handleDragEnd(e)}
                >
                    <SortableContext
                        items={sortableIds}
                        strategy={verticalListSortingStrategy}
                    >
                        <div className="overflow-x-auto">
                            <table
                                role="grid"
                                aria-rowcount={rows.length + 1}
                                className="w-full border-collapse text-left"
                            >
                                <thead className="sticky top-[3.25rem] z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
                                    {table.getHeaderGroups().map((headerGroup) => (
                                        <tr
                                            key={headerGroup.id}
                                            role="row"
                                            className="border-b border-white/10"
                                        >
                                            {headerGroup.headers.map((header) => {
                                                const isDragCol =
                                                    header.id === 'drag'
                                                return (
                                                    <th
                                                        key={header.id}
                                                        role="columnheader"
                                                        scope="col"
                                                        style={
                                                            isDragCol
                                                                ? undefined
                                                                : {
                                                                      width: header.column.getSize(),
                                                                  }
                                                        }
                                                        className={cn(
                                                            'px-2 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground',
                                                            isDragCol &&
                                                                'w-[44px] [@media(pointer:coarse)]:w-[52px]',
                                                        )}
                                                    >
                                                        {header.isPlaceholder
                                                            ? null
                                                            : flexRender(
                                                                  header.column.columnDef.header,
                                                                  header.getContext(),
                                                              )}
                                                    </th>
                                                )
                                            })}
                                        </tr>
                                    ))}
                                </thead>
                                <tbody>
                                    {table.getRowModel().rows.map((row) => {
                                        const rowId = row.original.id
                                        const inSelection =
                                            meta.selectedIds.has(rowId)
                                        const isInBulkSelection =
                                            inSelection &&
                                            meta.selectedIds.size >= 2
                                        return (
                                            <SortableRow
                                                key={row.id}
                                                row={row}
                                                onDeleteRow={
                                                    meta.onDeleteRow
                                                }
                                                isSelected={inSelection}
                                                onSelectionClick={(mods) =>
                                                    meta.onDragHandleClick(
                                                        rowId,
                                                        mods,
                                                    )
                                                }
                                                isInBulkSelection={
                                                    isInBulkSelection
                                                }
                                                bulkSelectionCount={
                                                    meta.selectedIds.size
                                                }
                                                onContextEditRow={
                                                    handleContextEditRow
                                                }
                                                onContextBindChart={
                                                    handleContextBindChart
                                                }
                                                onContextDuplicate={(id) =>
                                                    void handleContextDuplicate(
                                                        id,
                                                    )
                                                }
                                                onContextDelete={
                                                    handleContextDelete
                                                }
                                            />
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </SortableContext>
                </DndContext>
            )}

            <AddRowPlaceholder
                key={placeholderKey}
                autoOpen={addOpenSignal > 0}
                onPickSong={(song) => void handlePickSong(song)}
                onCreateFreeText={(title) => void handleCreateFreeText(title)}
            />
        </div>
    )
}
