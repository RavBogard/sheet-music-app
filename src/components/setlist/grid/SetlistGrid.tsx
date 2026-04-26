'use client'

import {
    type ColumnDef,
    flexRender,
    getCoreRowModel,
    useReactTable,
} from '@tanstack/react-table'
import { useLiveQuery } from 'dexie-react-hooks'
import { FileText, GripVertical } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'

import { getDb } from '@/lib/local/schema'
import type { LocalTrack } from '@/lib/local/types'
import { cn } from '@/lib/utils'

import { EmptyState } from './EmptyState'
import { SetlistGridTopBar } from './SetlistGridTopBar'

// Column defs render plain text in v50-05-01 — Task 2 (cell-edit
// interactions) swaps each accessor cell for an interactive one.
const COLUMNS: ColumnDef<LocalTrack>[] = [
    {
        id: 'drag',
        header: () => <span className="sr-only">Drag handle</span>,
        size: 44,
        cell: () => (
            <div className="flex h-11 w-11 items-center justify-center text-muted-foreground/50">
                <GripVertical aria-hidden className="h-4 w-4" />
            </div>
        ),
    },
    {
        id: 'type',
        accessorKey: 'type',
        header: 'Type',
        cell: ({ getValue }) => (
            <span className="text-sm capitalize text-muted-foreground">
                {String(getValue() ?? 'song')}
            </span>
        ),
    },
    {
        id: 'title',
        accessorKey: 'title',
        header: 'Title',
        cell: ({ getValue }) => (
            <span className="truncate text-sm font-medium">
                {String(getValue() ?? '')}
            </span>
        ),
    },
    {
        id: 'key',
        accessorKey: 'key',
        header: 'Key',
        size: 64,
        cell: ({ getValue }) => (
            <span className="text-sm tabular-nums">
                {String(getValue() ?? '')}
            </span>
        ),
    },
    {
        id: 'bpm',
        accessorKey: 'bpm',
        header: 'BPM',
        size: 64,
        cell: ({ getValue }) => (
            <span className="text-sm tabular-nums">
                {getValue() === undefined ? '' : String(getValue())}
            </span>
        ),
    },
    {
        id: 'leadMusician',
        accessorKey: 'leadMusician',
        header: 'Lead',
        cell: ({ getValue }) => (
            <span className="truncate text-sm">
                {String(getValue() ?? '')}
            </span>
        ),
    },
    {
        id: 'notes',
        accessorKey: 'notes',
        header: 'Notes',
        cell: ({ getValue }) => (
            <span className="truncate text-sm text-muted-foreground">
                {String(getValue() ?? '')}
            </span>
        ),
    },
    {
        id: 'chart',
        header: () => <span className="sr-only">Chart</span>,
        size: 44,
        cell: ({ row }) => {
            const hasChart = Boolean(row.original.songId)
            return (
                <div className="flex h-11 w-11 items-center justify-center">
                    <FileText
                        aria-label={hasChart ? 'Chart bound' : 'No chart'}
                        className={cn(
                            'h-4 w-4',
                            hasChart
                                ? 'text-indigo-400'
                                : 'text-muted-foreground/40',
                        )}
                    />
                </div>
            )
        },
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
    /** Called by EmptyState's "Add a song" CTA. Will be wired to
     * AddRowPlaceholder edit-focus in Task 3 of v50-05-01. */
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

    const table = useReactTable({
        data: rows,
        columns: COLUMNS,
        getCoreRowModel: getCoreRowModel(),
        getRowId: (row) => row.id,
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
                                            className="px-2 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground"
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
                                            className="min-h-[44px] px-2 py-2 align-middle"
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
