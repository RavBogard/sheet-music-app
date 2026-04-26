'use client'

import {
    type CellContext,
    type ColumnDef,
    flexRender,
    getCoreRowModel,
    type Table as TanstackTable,
    useReactTable,
} from '@tanstack/react-table'
import { useLiveQuery } from 'dexie-react-hooks'
import { GripVertical } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useMemo, useState } from 'react'

import { getDb } from '@/lib/local/schema'
import type { LocalTrack } from '@/lib/local/types'
import { applyEdit } from '@/lib/local/write'
import {
    propagateTrackEditToSong,
    type TrackDefaults,
} from '@/lib/songs/defaults'
import { useGridKeyboard } from '@/hooks/use-grid-keyboard'
import { cn } from '@/lib/utils'

import { ChartCell } from './cells/ChartCell'
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
}

declare module '@tanstack/react-table' {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    interface TableMeta<TData extends unknown> extends GridMeta {}
}

function getMeta(table: TanstackTable<LocalTrack>): GridMeta {
    return table.options.meta as GridMeta
}

async function commitTrackPatch(
    docId: string,
    patch: Record<string, unknown>,
): Promise<void> {
    // expectedUpdatedAt is left undefined here: enforcing the LWW precondition
    // requires the editor to track the last server-confirmed updatedAt per row,
    // which is a v50-06 concern (concurrent-edit safety phase). Without it the
    // engine still drains writes; conflict surfacing arrives in v50-06 along
    // with the reconciliation modal (§6.9 of ARCHITECTURE.md).
    await applyEdit({
        op: 'update',
        collection: 'tracks',
        docId,
        patch,
    })
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
        cell: () => (
            <div
                aria-hidden
                className="flex h-11 w-11 items-center justify-center text-muted-foreground/40"
            >
                <GripVertical className="h-4 w-4" />
            </div>
        ),
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
                        void commitTrackPatch(row.id, { type: next })
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
                        void commitTrackPatch(row.id, { title: next })
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
                        void commitTrackPatch(row.id, { key: next })
                        maybePropagate(row, { key: next }, meta.setlistId)
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
                            void commitTrackPatch(row.id, { bpm: undefined })
                            return
                        }
                        const next = Number(trimmed)
                        if (!Number.isFinite(next)) return
                        void commitTrackPatch(row.id, { bpm: next })
                        maybePropagate(row, { bpm: next }, meta.setlistId)
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
                        void commitTrackPatch(row.id, { leadMusician: next })
                        // Helper expects `lead` field-name; track field is `leadMusician`.
                        maybePropagate(row, { lead: next }, meta.setlistId)
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
                        void commitTrackPatch(row.id, { notes: next })
                    }}
                />
            )
        },
    },
    {
        id: 'chart',
        header: () => <span className="sr-only">Chart</span>,
        size: 44,
        cell: (ctx: CellContext<LocalTrack, unknown>) => (
            <ChartCell hasChart={Boolean(ctx.row.original.songId)} />
        ),
    },
]

export interface SetlistGridProps {
    setlistId: string
    name?: string
    eventDateLabel?: string
    onBack?: () => void
    /** Called by EmptyState's "Make next week's" CTA. */
    onMakeNextWeeks?: () => void | Promise<void>
    /** Called by EmptyState's "Use a template" CTA. */
    onUseTemplate?: () => void
    /** Called by EmptyState's "Add a song" CTA — wired in Task 3 to focus
     * the AddRowPlaceholder. */
    onAddSong?: () => void
}

export function SetlistGrid({
    setlistId,
    name,
    eventDateLabel,
    onBack,
    onMakeNextWeeks,
    onUseTemplate,
    onAddSong,
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

    const {
        isCellFocused,
        handleCellFocus,
        moveFocus,
        handleCellKeyDown,
    } = useGridKeyboard({
        rowCount: rows.length,
        editableColIds: EDITABLE_COL_IDS as unknown as string[],
    })

    const meta = useMemo<GridMeta>(
        () => ({
            setlistId,
            isCellFocused,
            handleCellFocus,
            moveFocus,
            handleCellKeyDown,
            setlistLeads,
        }),
        [
            setlistId,
            isCellFocused,
            handleCellFocus,
            moveFocus,
            handleCellKeyDown,
            setlistLeads,
        ],
    )

    const table = useReactTable({
        data: rows,
        columns: COLUMNS,
        getCoreRowModel: getCoreRowModel(),
        getRowId: (row) => row.id,
        meta,
    })

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
                    onAddSong={onAddSong ?? (() => {})}
                    onUseTemplate={onUseTemplate ?? (() => {})}
                    busy={cloneBusy}
                />
            ) : (
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
                                                      header.column.columnDef
                                                          .header,
                                                      header.getContext(),
                                                  )}
                                        </th>
                                    ))}
                                </tr>
                            ))}
                        </thead>
                        <tbody>
                            {table.getRowModel().rows.map((row) => (
                                <tr
                                    key={row.id}
                                    role="row"
                                    data-row-id={row.original.id}
                                    className="border-b border-white/10 last:border-b-0 hover:bg-white/[0.02]"
                                >
                                    {row.getVisibleCells().map((cell) => (
                                        <td
                                            key={cell.id}
                                            role="gridcell"
                                            style={{
                                                width: cell.column.getSize(),
                                            }}
                                            className="px-2 py-1 align-middle"
                                        >
                                            {flexRender(
                                                cell.column.columnDef.cell,
                                                cell.getContext(),
                                            )}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
