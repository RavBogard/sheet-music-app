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
import { useRouter } from 'next/navigation'
import { useCallback, useMemo, useRef, useState } from 'react'

import { getDb } from '@/lib/local/schema'
import type { LocalTrack } from '@/lib/local/types'
import { applyEdit } from '@/lib/local/write'
import {
    propagateTrackEditToSong,
    seedTrackFromSong,
    type TrackDefaults,
} from '@/lib/songs/defaults'
import { useGridKeyboard } from '@/hooks/use-grid-keyboard'
import { cn } from '@/lib/utils'

import { AddRowPlaceholder } from './AddRowPlaceholder'
import { ChartBindPopover, type ChartBindSelection } from './ChartBindPopover'
import { ChartCell } from './cells/ChartCell'
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
}

function SortableRow({ row, onDeleteRow }: SortableRowProps) {
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

    return (
        <tr
            ref={setNodeRef}
            style={style}
            role="row"
            data-row-id={row.original.id}
            data-dragging={isDragging || undefined}
            className={cn(
                'border-b border-white/10 last:border-b-0 hover:bg-white/[0.02]',
                isDragging && 'shadow-lg ring-2 ring-indigo-400/40',
            )}
        >
            {row.getVisibleCells().map((cell, idx) => {
                if (idx === 0) {
                    return (
                        <td
                            key={cell.id}
                            role="gridcell"
                            style={{ width: cell.column.getSize() }}
                            className="px-1 py-1 align-middle"
                        >
                            <DragHandleCell
                                attributes={attributes}
                                listeners={listeners}
                                title={String(row.original.title ?? '')}
                                onDelete={() => onDeleteRow(row.original)}
                            />
                        </td>
                    )
                }
                return (
                    <td
                        key={cell.id}
                        role="gridcell"
                        style={{ width: cell.column.getSize() }}
                        className="px-2 py-1 align-middle"
                    >
                        {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                        )}
                    </td>
                )
            })}
        </tr>
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
     * to window.confirm. Allows tests to bypass the prompt. */
    confirmDeleteWithTitle?: (title: string) => boolean | Promise<boolean>
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
}: SetlistGridProps) {
    const router = useRouter()

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
                const confirmFn =
                    confirmDeleteWithTitle ??
                    ((t: string) =>
                        typeof window !== 'undefined' &&
                        window.confirm(`Delete row “${t}”?`))
                const ok = await confirmFn(title)
                if (!ok) return
            }
            await applyEdit({
                op: 'delete',
                collection: 'tracks',
                docId: track.id,
            })
        },
        [confirmDeleteWithTitle],
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
        >
            <SetlistGridTopBar
                name={name ?? 'New Setlist'}
                eventDateLabel={eventDateLabel}
                onBack={onBack ?? (() => router.back())}
            />

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
                                            {headerGroup.headers.map((header) => (
                                                <th
                                                    key={header.id}
                                                    role="columnheader"
                                                    scope="col"
                                                    style={{
                                                        width: header.column.getSize(),
                                                    }}
                                                    className={cn(
                                                        'px-2 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground',
                                                    )}
                                                >
                                                    {header.isPlaceholder
                                                        ? null
                                                        : flexRender(
                                                              header.column.columnDef.header,
                                                              header.getContext(),
                                                          )}
                                                </th>
                                            ))}
                                        </tr>
                                    ))}
                                </thead>
                                <tbody>
                                    {table.getRowModel().rows.map((row) => (
                                        <SortableRow
                                            key={row.id}
                                            row={row}
                                            onDeleteRow={meta.onDeleteRow}
                                        />
                                    ))}
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
