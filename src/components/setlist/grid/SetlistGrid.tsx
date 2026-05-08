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
import type { EditDescriptor, LocalTrack } from '@/lib/local/types'
import {
    flushAllBursts,
    useUndoStore,
    type SimpleUndoEntry,
    type UndoEntry,
    type UndoableDoc,
} from '@/lib/local/undo-store'
import { applyEdit } from '@/lib/local/write'
import {
    propagateTrackEditToSong,
    seedTrackFromSong,
    type TrackDefaults,
} from '@/lib/songs/defaults'
import { useGridKeyboard } from '@/hooks/use-grid-keyboard'
import { useGridSelection } from '@/hooks/use-grid-selection'
import { useMediaQuery } from '@/hooks/use-media-query'
import { cn } from '@/lib/utils'

import { AddBar, type NonSongTrackType } from './AddBar'
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
import { MobileCardList } from './MobileCardList'
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
    /** v50-06-01: cells pass `expectedUpdatedAt` (the row's last-known
     *  server `updatedAt`) so the production adapter's runTransaction
     *  precondition can detect remote-edit races and surface them as
     *  VersionMismatchError. Undefined is permitted for freshly-created
     *  rows whose first server commit hasn't landed yet. */
    onCommitTrackPatch: (
        docId: string,
        patch: Record<string, unknown>,
        expectedUpdatedAt?: number,
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

// v51-02-01: visual hierarchy tier classes (Option B "Comfortable Dense"
// locked at .paul/phases/v51-02-editor-readability/v51-02-01-DESIGN-CONTRACT.md).
// Tier 1 = title (primary). Tier 2 = key (secondary-prominent, brand-tinted).
// Tier 3 = lead / type / bpm (tertiary). Tier 4 = notes (quaternary).
// HEADER_TITLE = smallcaps banner used inside type='header' / 'section' rows.
const TIER1_TITLE = 'text-sm font-semibold text-foreground'
const TIER2_KEY = 'text-sm font-medium tabular-nums text-indigo-200'
const TIER3 = 'text-[13px] font-normal text-muted-foreground'
const TIER3_NUM = 'text-[13px] font-normal tabular-nums text-muted-foreground'
const TIER4_NOTES = 'text-xs font-normal text-muted-foreground/75'
const HEADER_TITLE =
    'text-xs font-bold uppercase tracking-[0.1em] text-indigo-100'

// TrackType union (src/types/models.ts) defines 'header'; the TypeCell
// picker writes 'section' for the user-facing "Section header" option.
// Treat both as section rows for visual framing.
function isSectionRow(t: unknown): boolean {
    return t === 'header' || t === 'section'
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
        size: 104,
        cell: (ctx: CellContext<LocalTrack, unknown>) => {
            const meta = getMeta(ctx.table)
            const row = ctx.row.original
            const colId = 'type'
            return (
                <TypeCell
                    value={String(ctx.getValue() ?? 'song')}
                    className={TIER3}
                    isFocused={meta.isCellFocused(ctx.row.index, colId)}
                    onFocus={() => meta.handleCellFocus(ctx.row.index, colId)}
                    onMoveFocus={(d) => meta.moveFocus(d)}
                    onCellKeyDown={(e) =>
                        meta.handleCellKeyDown(e, ctx.row.index, colId)
                    }
                    onCommit={(next) => {
                        if (!next || next === (row.type as string)) return
                        void meta.onCommitTrackPatch(
                            row.id,
                            { type: next },
                            row.updatedAt,
                        )
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
            // Section rows render the title as a smallcaps banner; content
            // rows use the primary tier (text-sm 600 foreground).
            const titleCls = isSectionRow(row.type) ? HEADER_TITLE : TIER1_TITLE
            return (
                <TextCell
                    value={(ctx.getValue() ?? '') as string}
                    className={titleCls}
                    isFocused={meta.isCellFocused(ctx.row.index, colId)}
                    onFocus={() => meta.handleCellFocus(ctx.row.index, colId)}
                    onMoveFocus={(d) => meta.moveFocus(d)}
                    onCellKeyDown={(e) =>
                        meta.handleCellKeyDown(e, ctx.row.index, colId)
                    }
                    placeholder="Title"
                    ariaLabel="Track title"
                    onCommit={(next) => {
                        void meta.onCommitTrackPatch(
                            row.id,
                            { title: next },
                            row.updatedAt,
                        )
                    }}
                />
            )
        },
    },
    {
        id: 'key',
        accessorKey: 'key',
        header: 'Key',
        size: 72,
        cell: (ctx: CellContext<LocalTrack, unknown>) => {
            const meta = getMeta(ctx.table)
            const row = ctx.row.original
            const colId = 'key'
            return (
                <KeyCell
                    value={(ctx.getValue() ?? undefined) as string | undefined}
                    className={TIER2_KEY}
                    isFocused={meta.isCellFocused(ctx.row.index, colId)}
                    onFocus={() => meta.handleCellFocus(ctx.row.index, colId)}
                    onMoveFocus={(d) => meta.moveFocus(d)}
                    onCellKeyDown={(e) =>
                        meta.handleCellKeyDown(e, ctx.row.index, colId)
                    }
                    onCommit={(next) => {
                        void meta.onCommitTrackPatch(
                            row.id,
                            { key: next },
                            row.updatedAt,
                        )
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
        size: 64,
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
                    className={TIER3_NUM}
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
                            void meta.onCommitTrackPatch(
                                row.id,
                                { bpm: undefined },
                                row.updatedAt,
                            )
                            return
                        }
                        const next = Number(trimmed)
                        if (!Number.isFinite(next)) return
                        void meta.onCommitTrackPatch(
                            row.id,
                            { bpm: next },
                            row.updatedAt,
                        )
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
        header: 'Vocal Lead',
        size: 156,
        cell: (ctx: CellContext<LocalTrack, unknown>) => {
            const meta = getMeta(ctx.table)
            const row = ctx.row.original
            const colId = 'leadMusician'
            return (
                <LeadCell
                    value={(ctx.getValue() ?? undefined) as string | undefined}
                    className={TIER3}
                    setlistLeads={meta.setlistLeads}
                    isFocused={meta.isCellFocused(ctx.row.index, colId)}
                    onFocus={() => meta.handleCellFocus(ctx.row.index, colId)}
                    onMoveFocus={(d) => meta.moveFocus(d)}
                    onCellKeyDown={(e) =>
                        meta.handleCellKeyDown(e, ctx.row.index, colId)
                    }
                    onCommit={(next) => {
                        void meta.onCommitTrackPatch(
                            row.id,
                            { leadMusician: next },
                            row.updatedAt,
                        )
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
        size: 220,
        cell: (ctx: CellContext<LocalTrack, unknown>) => {
            const meta = getMeta(ctx.table)
            const row = ctx.row.original
            const colId = 'notes'
            return (
                <TextCell
                    value={(ctx.getValue() ?? '') as string}
                    className={TIER4_NOTES}
                    isFocused={meta.isCellFocused(ctx.row.index, colId)}
                    onFocus={() => meta.handleCellFocus(ctx.row.index, colId)}
                    onMoveFocus={(d) => meta.moveFocus(d)}
                    onCellKeyDown={(e) =>
                        meta.handleCellKeyDown(e, ctx.row.index, colId)
                    }
                    placeholder="Notes"
                    ariaLabel="Track notes"
                    onCommit={(next) => {
                        void meta.onCommitTrackPatch(
                            row.id,
                            { notes: next },
                            row.updatedAt,
                        )
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

    // v51-02-01 Option B: section rows (type='header'|'section') get a
    // background tint + left accent + top border so they visibly frame the
    // content rows below them. Per DESIGN-CONTRACT.md.
    const isHeaderRow = isSectionRow(row.original.type)
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
                    data-row-type={isHeaderRow ? 'section' : 'content'}
                    data-dragging={isDragging || undefined}
                    data-selected={isSelected || undefined}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerEnd}
                    onPointerLeave={handlePointerEnd}
                    onPointerCancel={handlePointerEnd}
                    className={cn(
                        'border-b border-white/10 last:border-b-0 hover:bg-white/[0.02]',
                        isHeaderRow &&
                            'bg-indigo-500/[0.08] border-l-2 border-l-indigo-400/50 border-t border-t-indigo-500/25',
                        isSelected && 'bg-indigo-500/[0.08]',
                        isSelected &&
                            'hover:bg-indigo-500/[0.10]',
                        isDragging && 'shadow-lg ring-2 ring-indigo-400/40',
                    )}
                >
                    {row.getVisibleCells().map((cell, idx) => {
                        if (idx === 0) {
                            // Drag column: 44px desktop, 52px on touch
                            // breakpoints for tap accuracy
                            // (ARCHITECTURE.md §6.7). v51-02-01: tightened
                            // vertical padding so the outer row hits the
                            // 44px (desktop) / 48px (tablet) target from
                            // DESIGN-CONTRACT.md Option B.
                            return (
                                <td
                                    key={cell.id}
                                    role="gridcell"
                                    className="w-[44px] [@media(pointer:coarse)]:w-[52px] px-1 py-0.5 align-middle"
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
                        const isChartCell = cell.column.id === 'chart'
                        return (
                            <td
                                key={cell.id}
                                role="gridcell"
                                style={{ width: cell.column.getSize() }}
                                // v51-02-01 Option B density: tightened
                                // padding so outer row hits 44px desktop
                                // / 48px tablet (44px tap floor preserved
                                // by the inner h-10/h-11 cell triggers).
                                // Per DESIGN-CONTRACT.md.
                                // v53-02-01: sticky-right Chart column body
                                // cell. Pins against overflow-x-auto wrapper
                                // so chart affordance stays in view on iPad
                                // landscape/portrait without horizontal
                                // scroll past Notes. bg-card is opaque so
                                // sibling td cells scroll behind cleanly;
                                // z-[5] keeps chart-td above sibling tds
                                // (z-auto) but BELOW thead's z-10 so the
                                // header still wins on vertical scroll.
                                // Trade-off (accepted per plan): the
                                // sticky bg hides row hover/selection tint
                                // on the chart cell specifically; other
                                // cells still tint correctly.
                                className={cn(
                                    'px-2.5 py-0.5 [@media(pointer:coarse)]:py-0.5 align-middle',
                                    isChartCell &&
                                        'sticky right-0 z-[5] bg-card border-l border-white/10',
                                )}
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
    expectedUpdatedAt?: number,
): Promise<void> {
    // v50-06-01: `expectedUpdatedAt` flows in from the cell's `row.original
    // .updatedAt`, surfacing real two-writer races to the engine via
    // VersionMismatchError (instead of silently last-write-winning).
    // v50-05-05: undoKey scopes burst coalescing per-(docId, field-set)
    // so different fields on the same row each get their own undo unit.
    // Multi-field patches (e.g. ChartCell binding setting songId+title+
    // defaults) coalesce as a single key — that's the right granularity.
    const fields = Object.keys(patch).sort().join(',')
    await applyEdit(
        {
            op: 'update',
            collection: 'tracks',
            docId,
            patch,
            expectedUpdatedAt,
        },
        { undoKey: `tracks:${docId}:${fields}` },
    )
}

/**
 * v50-05-05 undo helpers — produce the EditDescriptor that reverses a
 * SimpleUndoEntry (for Cmd-Z) or replays it (for Cmd-Shift-Z). Composite
 * entries fan out to N parallel descriptors.
 *
 * v50-06-01: builders accept the live `expectedUpdatedAt` (read at
 * undo/redo time, NOT snapshot-time) so an inverse that races a remote
 * write surfaces as VersionMismatchError rather than silently overwriting.
 */
function buildInverse(
    entry: SimpleUndoEntry,
    expectedUpdatedAt: number | undefined,
): EditDescriptor | null {
    if (entry.op === 'set') {
        return {
            op: 'delete',
            collection: entry.collection,
            docId: entry.docId,
            expectedUpdatedAt,
        }
    }
    if (entry.op === 'update') {
        if (!entry.prevDoc) return null
        return {
            op: 'update',
            collection: entry.collection,
            docId: entry.docId,
            patch: { ...entry.prevDoc },
            expectedUpdatedAt,
        }
    }
    if (entry.op === 'delete') {
        if (!entry.prevDoc) return null
        return {
            op: 'set',
            collection: entry.collection,
            doc: { ...entry.prevDoc, id: entry.docId },
        }
    }
    return null
}

function buildRedo(
    entry: SimpleUndoEntry,
    expectedUpdatedAt: number | undefined,
): EditDescriptor | null {
    if (entry.op === 'set') {
        if (!entry.newDoc) return null
        return {
            op: 'set',
            collection: entry.collection,
            doc: { ...entry.newDoc, id: entry.docId },
        }
    }
    if (entry.op === 'update') {
        if (!entry.newDoc) return null
        return {
            op: 'update',
            collection: entry.collection,
            docId: entry.docId,
            patch: { ...entry.newDoc },
            expectedUpdatedAt,
        }
    }
    if (entry.op === 'delete') {
        return {
            op: 'delete',
            collection: entry.collection,
            docId: entry.docId,
            expectedUpdatedAt,
        }
    }
    return null
}

async function readLiveUpdatedAt(
    collection: SimpleUndoEntry['collection'],
    docId: string,
): Promise<number | undefined> {
    try {
        const live = (await getDb()[collection].get(docId)) as
            | { updatedAt?: number }
            | undefined
        return live?.updatedAt
    } catch {
        return undefined
    }
}

async function executeEntry(
    entry: UndoEntry,
    mode: 'undo' | 'redo',
): Promise<void> {
    const builder = mode === 'undo' ? buildInverse : buildRedo
    if (entry.kind === 'simple') {
        const live = await readLiveUpdatedAt(entry.collection, entry.docId)
        const desc = builder(entry, live)
        if (desc) await applyEdit(desc, { withoutUndo: true })
        return
    }
    // composite: fan out N inverses in parallel. Each leg's inverse is
    // independent at the docId level (per-doc drain ordering invariant
    // from v50-03 keeps each doc's outbox serialized).
    const descriptors = await Promise.all(
        entry.entries.map(async (e) => {
            const live = await readLiveUpdatedAt(e.collection, e.docId)
            return builder(
                {
                    kind: 'simple',
                    ts: entry.ts,
                    ...e,
                } as SimpleUndoEntry,
                live,
            )
        }),
    )
    const filtered = descriptors.filter(
        (d): d is EditDescriptor => d !== null,
    )
    await Promise.all(
        filtered.map((d) => applyEdit(d, { withoutUndo: true })),
    )
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
    // v50-05-05: parallel mobile render path below 768px. The existing
    // TanStack Table layout breaks ~640px — phones become unusable.
    // Match max-width:767px so anything <768px (mobile) gets cards;
    // anything ≥ 768px (tablet portrait + iPad + desktop) gets the
    // table. Touch detection (pointer:coarse) is independent — iPad
    // landscape gets the table + Sheet-on-coarse cell dropdowns from
    // v50-05-04.
    const isMobile = useMediaQuery('(max-width: 767px)')

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
                return
            }

            // v50-05-05 Undo / Redo. Skip on input-like targets so native
            // field undo wins (per v4.2 P2-04 precedent — same skip set
            // we use for global Cmd/Ctrl-Z elsewhere).
            const target = e.target as HTMLElement | null
            if (target) {
                const tag = target.tagName
                if (
                    tag === 'INPUT' ||
                    tag === 'TEXTAREA' ||
                    tag === 'SELECT' ||
                    target.isContentEditable
                ) {
                    return
                }
            }

            const cmdOrCtrl = e.metaKey || e.ctrlKey
            if (!cmdOrCtrl) return
            const key = e.key.toLowerCase()
            const isUndo = !e.shiftKey && key === 'z'
            const isRedo =
                (e.shiftKey && key === 'z') || (!e.shiftKey && key === 'y')

            if (isUndo) {
                e.preventDefault()
                // Settle in-flight cell-blur bursts first so the most
                // recent edit is captured before we pop.
                flushAllBursts()
                const entry = useUndoStore.getState().popUndo()
                if (entry) void executeEntry(entry, 'undo')
                return
            }
            if (isRedo) {
                e.preventDefault()
                const entry = useUndoStore.getState().popRedo()
                if (entry) void executeEntry(entry, 'redo')
                return
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
                expectedUpdatedAt: track.updatedAt,
            })
        },
        [confirmFn],
    )

    const handleBindChart = useCallback(
        async (track: LocalTrack, sel: ChartBindSelection) => {
            const defaults = await seedTrackFromSong(sel.songId)
            const patch: Record<string, unknown> = {
                songId: sel.songId,
                // v54-01-02: same reason as handlePickSong above —
                // perform-view's SetlistRow.hasFile gate requires fileId.
                // ChartBindPopover writes songId; we mirror it as fileId
                // so re-binding a free-text track makes it clickable in
                // perform mode.
                fileId: sel.songId,
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
                expectedUpdatedAt: track.updatedAt,
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

            // Snapshot prevDocs BEFORE the writes so we can push a
            // composite undo entry post-write. selectedTracks holds the
            // current state from the live query at this point.
            const prevDocs = selectedTracks.map((t) => ({ ...t }))

            await Promise.all(
                selectedTracks.map((t) =>
                    applyEdit(
                        {
                            op: 'update',
                            collection: 'tracks',
                            docId: t.id,
                            patch: writePatch,
                            expectedUpdatedAt: t.updatedAt,
                        },
                        { withoutUndo: true },
                    ),
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

            // Push ONE composite undo entry (not N — bulk-set is one
            // user-perceived action). Read the post-write state for newDoc
            // snapshots.
            const db = getDb()
            const newDocs = await Promise.all(
                selectedTracks.map(
                    async (t) =>
                        (await db.tracks.get(t.id)) as
                            | UndoableDoc
                            | undefined,
                ),
            )
            useUndoStore.getState().pushEntry({
                kind: 'composite',
                label: `Bulk-set ${Object.keys(writePatch).join(', ')} on ${selectedTracks.length} rows`,
                entries: selectedTracks.map((t, i) => ({
                    op: 'update' as const,
                    collection: 'tracks' as const,
                    docId: t.id,
                    prevDoc: prevDocs[i] as UndoableDoc,
                    newDoc: newDocs[i],
                })),
                ts: Date.now(),
            })
        },
        [selectedTracks, setlistId],
    )

    const handleBulkDelete = useCallback(async () => {
        if (selectedTracks.length === 0) return
        const count = selectedTracks.length
        const ok = await confirmFn({ kind: 'bulk', count })
        if (!ok) return
        // Snapshot prevDocs before deletes — needed for the composite
        // undo entry's inverse (which re-inserts each row).
        const prevDocs = selectedTracks.map((t) => ({ ...t }))
        await Promise.all(
            selectedTracks.map((t) =>
                applyEdit(
                    {
                        op: 'delete',
                        collection: 'tracks',
                        docId: t.id,
                        expectedUpdatedAt: t.updatedAt,
                    },
                    { withoutUndo: true },
                ),
            ),
        )
        selection.clear()
        useUndoStore.getState().pushEntry({
            kind: 'composite',
            label: `Bulk-delete ${selectedTracks.length} rows`,
            entries: selectedTracks.map((t, i) => ({
                op: 'delete' as const,
                collection: 'tracks' as const,
                docId: t.id,
                prevDoc: prevDocs[i] as UndoableDoc,
                newDoc: undefined,
            })),
            ts: Date.now(),
        })
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

            // Cascade prevDocs (rows whose order will bump by 1).
            const cascadeRows = rows.filter((r) => r.order >= newOrder)
            const cascadePrev = cascadeRows.map((r) => ({ ...r }))

            await Promise.all(
                cascadeRows.map((r) =>
                    applyEdit(
                        {
                            op: 'update',
                            collection: 'tracks',
                            docId: r.id,
                            patch: { order: r.order + 1 },
                            expectedUpdatedAt: r.updatedAt,
                        },
                        { withoutUndo: true },
                    ),
                ),
            )

            const cloneDoc = { ...source, id: newId, order: newOrder }
            await applyEdit(
                {
                    op: 'set',
                    collection: 'tracks',
                    doc: cloneDoc,
                },
                { withoutUndo: true },
            )

            // Composite undo: cascade-bump rows revert to their old order
            // + the clone is deleted.
            const db = getDb()
            const cascadeNew = await Promise.all(
                cascadeRows.map(
                    async (r) =>
                        (await db.tracks.get(r.id)) as
                            | UndoableDoc
                            | undefined,
                ),
            )
            useUndoStore.getState().pushEntry({
                kind: 'composite',
                label: `Duplicate row ${source.title || source.id}`,
                entries: [
                    ...cascadeRows.map((r, i) => ({
                        op: 'update' as const,
                        collection: 'tracks' as const,
                        docId: r.id,
                        prevDoc: cascadePrev[i] as UndoableDoc,
                        newDoc: cascadeNew[i],
                    })),
                    {
                        op: 'set' as const,
                        collection: 'tracks' as const,
                        docId: newId,
                        prevDoc: undefined,
                        newDoc: cloneDoc as UndoableDoc,
                    },
                ],
                ts: Date.now(),
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
            if (updates.length === 0) return

            // Snapshot prevDocs for the composite undo entry. Drag-end
            // fires N parallel order updates that should revert as ONE
            // user-perceived action.
            const prevDocs = updates
                .map(({ id }) => rows.find((r) => r.id === id))
                .filter((r): r is LocalTrack => Boolean(r))
                .map((r) => ({ ...r }))

            await Promise.all(
                updates.map(({ id, order }) => {
                    const r = rows.find((row) => row.id === id)
                    return applyEdit(
                        {
                            op: 'update',
                            collection: 'tracks',
                            docId: id,
                            patch: { order },
                            expectedUpdatedAt: r?.updatedAt,
                        },
                        { withoutUndo: true },
                    )
                }),
            )

            const db = getDb()
            const newDocs = await Promise.all(
                updates.map(
                    async ({ id }) =>
                        (await db.tracks.get(id)) as
                            | UndoableDoc
                            | undefined,
                ),
            )
            useUndoStore.getState().pushEntry({
                kind: 'composite',
                label: `Reorder ${updates.length} rows`,
                entries: updates.map((u, i) => ({
                    op: 'update' as const,
                    collection: 'tracks' as const,
                    docId: u.id,
                    prevDoc: prevDocs[i] as UndoableDoc,
                    newDoc: newDocs[i],
                })),
                ts: Date.now(),
            })
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
                    // v54-01-02: SetlistRow.tsx:47 gates clickability in
                    // perform-view on `track.fileId`. Per v54-01-01 locked
                    // decision, songs/{libId} uses the library_index doc
                    // id as both songs/{id}.id AND songs/{id}.fileId, so
                    // song.id IS the fileId. Without this, newly-picked
                    // tracks would be unclickable in perform mode (UAT
                    // regression 2026-05-08).
                    fileId: song.id,
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
                // expectedUpdatedAt: undefined OK — row was just created
                // locally via the set above; first server commit hasn't
                // landed yet so there's no server `updatedAt` to assert.
                // The engine writeback (v50-06-01) will populate it after
                // the set drains.
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

    // v53-03-01: insert a new non-Song row from AddBar's chevron tile click.
    // Mirrors handleCreateFreeText but writes the chosen TrackType with an
    // empty title so the user fills inline. Single applyEdit write path —
    // NO direct Dexie writes; NO embedded-array side effects (v5h-01 anti-
    // pattern audit lock).
    const handleAddTrackOfType = useCallback(
        async (type: NonSongTrackType) => {
            const newId = makeId()
            const order = rows.length
            await applyEdit({
                op: 'set',
                collection: 'tracks',
                doc: {
                    id: newId,
                    setlistId,
                    order,
                    title: '',
                    type,
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
            ) : isMobile ? (
                // v50-05-05: parallel mobile render path. BatchActionBar
                // mounts above (selection ≥ 2) for both render paths;
                // AddRowPlaceholder mounts below for both.
                <MobileCardList
                    setlistId={setlistId}
                    tracks={rows}
                    selectedIds={selection.selectedIds}
                    onSelectionClick={handleDragHandleClick}
                    onContextEditRow={handleContextEditRow}
                    onContextBindChart={handleContextBindChart}
                    onContextDuplicate={(id) =>
                        void handleContextDuplicate(id)
                    }
                    onContextDelete={handleContextDelete}
                    onCommitTrackPatch={commitTrackPatchImpl}
                    onDeleteRow={(track) => void handleDeleteRow(track)}
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
                        {/* v54-01-01 fix: removed `<div className="overflow-x-auto">`
                            wrapper that v53-02-01 added for sticky-right ChartCell.
                            Per CSS spec, an `overflow-x-auto` ancestor establishes
                            a scroll container, which made `<thead>`'s `position:
                            sticky` pin against the wrapper's scrollport instead of
                            the viewport — body rows then visually slid under the
                            still-pinned header at every scroll depth. Sticky-right
                            ChartCell still works fine without the wrapper because
                            the chart `<th>` (`sticky right-0 z-20`) and `<td>`
                            (`sticky right-0 z-[5]`) pin against the page's natural
                            horizontal scrollport. SetlistGrid is tablet+desktop
                            only (mobile flow uses MobileCardList), so column-sum
                            ~704-784px fits iPad portrait (768) and landscape (1024)
                            without horizontal page scroll. */}
                        <table
                            role="grid"
                            aria-rowcount={rows.length + 1}
                            className="w-full border-collapse text-left"
                        >
                            {/* v54-01-01 fix: thead `top-[3.75rem]` MUST stay in
                                lockstep with SetlistGridTopBar's real height
                                (back button h-11 = 44px + container py-2 = 16px →
                                60px = 3.75rem). v51-02-01-DESIGN-CONTRACT.md:18
                                codifies this rule; v52-03 violated it by growing
                                SyncIndicator content without updating offsets, and
                                v53-02-01's overflow-x-auto wrapper masked the
                                misalignment. If you grow the topbar (event date
                                line, multi-line SyncIndicator, etc.) bump this
                                value too. Bg is fully opaque (no `/95`) so any
                                browser without `backdrop-filter` support still
                                masks body row text fully. */}
                            <thead className="sticky top-[3.75rem] z-10 bg-background backdrop-blur supports-[backdrop-filter]:bg-background/90">
                                    {table.getHeaderGroups().map((headerGroup) => (
                                        <tr
                                            key={headerGroup.id}
                                            role="row"
                                            className="border-b border-white/10"
                                        >
                                            {headerGroup.headers.map((header) => {
                                                const isDragCol =
                                                    header.id === 'drag'
                                                const isChartCol =
                                                    header.id === 'chart'
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
                                                            // v53-02-01: sticky-right Chart column. Pins
                                                            // the chart header against the overflow-x-auto
                                                            // wrapper so the affordance stays visible on
                                                            // iPad without scrolling past Notes. Own
                                                            // opaque bg matches the thead chrome so
                                                            // sibling th cells scroll cleanly behind.
                                                            // z-20 > thead's z-10 so the chart-th wins
                                                            // any horizontal stacking against siblings.
                                                            isChartCol &&
                                                                'sticky right-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-l border-white/10',
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
                    </SortableContext>
                </DndContext>
            )}

            <AddBar
                key={placeholderKey}
                autoOpen={addOpenSignal > 0}
                onPickSong={(song) => void handlePickSong(song)}
                onCreateFreeText={(title) => void handleCreateFreeText(title)}
                onAddTrackOfType={(type) => void handleAddTrackOfType(type)}
            />

            {/* v50-05-05: mobile-flow ChartBindPopover. The desktop table
                path renders one inside the chart column cell; the mobile
                path needs one at SetlistGrid level since cards don't
                expose a chart-icon trigger. The hidden span is asChild
                fodder — the popover is opened programmatically via the
                controllable open prop, so trigger visibility is moot. */}
            {isMobile && chartBindOpenRowId
                ? (() => {
                      const targetRow = rows.find(
                          (r) => r.id === chartBindOpenRowId,
                      )
                      if (!targetRow) return null
                      return (
                          <ChartBindPopover
                              currentSongId={targetRow.songId}
                              inputAriaLabel={`Bind a chart to ${
                                  targetRow.title || 'track'
                              }`}
                              onBind={(sel) =>
                                  void handleBindChart(targetRow, sel)
                              }
                              open={true}
                              onOpenChange={(next) => {
                                  if (!next) setChartBindOpenRowId(null)
                              }}
                          >
                              {/* Visually-hidden but layout-present trigger
                                  so Radix Popover can anchor (display:none
                                  breaks anchoring). For Sheet variant on
                                  touch this is irrelevant — Sheet positions
                                  to viewport bottom regardless. */}
                              <span
                                  aria-hidden
                                  data-testid="mobile-chart-bind-anchor"
                                  className="sr-only"
                              />
                          </ChartBindPopover>
                      )
                  })()
                : null}
        </div>
    )
}
