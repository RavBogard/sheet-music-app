'use client'

import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from 'cmdk'
import { useLiveQuery } from 'dexie-react-hooks'
import { FileText } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'

import { getDb } from '@/lib/local/schema'
import type { LocalSong } from '@/lib/local/types'

import { TouchOrPopover } from './TouchOrPopover'

export interface ChartBindSelection {
    songId: string
    title: string
}

export interface ChartBindPopoverProps {
    /** Click target. Wrapped in TouchOrPopover trigger via asChild. */
    children: ReactNode
    /** Currently bound songId (preselects in the list when re-binding). */
    currentSongId?: string
    /** aria-label for the cmdk input (test/a11y hook). */
    inputAriaLabel?: string
    /** Fired when the user picks a library entry. */
    onBind: (selection: ChartBindSelection) => void
    /**
     * v50-05-04: Controlled open state. When `open` and `onOpenChange` are
     * provided, the popover is fully controlled by the parent (e.g. opened
     * imperatively by the row ContextMenu "Bind chart" action). When
     * undefined, falls back to internal state — preserves the v50-05-02
     * click-to-bind-from-ChartCell flow.
     */
    open?: boolean
    onOpenChange?: (next: boolean) => void
}

export function ChartBindPopover({
    children,
    currentSongId,
    inputAriaLabel = 'Bind a chart',
    onBind,
    open: controlledOpen,
    onOpenChange,
}: ChartBindPopoverProps) {
    const [internalOpen, setInternalOpen] = useState(false)
    const [filter, setFilter] = useState('')

    const isControlled = controlledOpen !== undefined
    const open = isControlled ? controlledOpen : internalOpen
    const setOpen = (next: boolean) => {
        if (!isControlled) setInternalOpen(next)
        onOpenChange?.(next)
    }

    const songs = useLiveQuery(
        () => getDb().songs.toArray(),
        [],
        [] as LocalSong[],
    )

    const options = useMemo(() => {
        const list = songs ?? []
        return list.slice().sort((a, b) => a.title.localeCompare(b.title))
    }, [songs])

    const close = () => {
        setOpen(false)
        setFilter('')
    }

    const handlePick = (song: { id: string; title: string }) => {
        onBind({ songId: song.id, title: song.title })
        close()
    }

    return (
        <TouchOrPopover
            open={open}
            onOpenChange={(next) => {
                if (!next) close()
                else setOpen(true)
            }}
            sheetTitle="Bind chart"
            sheetDescription="Pick a song from your library to bind a chart to this row."
            align="start"
            sideOffset={4}
            // Defer to Radix default onCloseAutoFocus — restores focus to
            // the trigger (the forwardRef ChartCell button), which is the
            // desired behavior. No manual focus return needed.
            contentClassName="w-[24rem]"
            contentTestId="chart-bind-popover"
            trigger={children}
        >
            <Command shouldFilter loop>
                <CommandInput
                    value={filter}
                    onValueChange={setFilter}
                    placeholder="Search the library…"
                    aria-label={inputAriaLabel}
                    className="w-full bg-transparent px-3 py-2 text-sm outline-none border-b border-white/10"
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                            e.preventDefault()
                            close()
                        }
                    }}
                />
                <CommandList className="max-h-72 overflow-y-auto py-1">
                    <CommandEmpty className="px-3 py-2 text-sm text-muted-foreground">
                        No matches.
                    </CommandEmpty>
                    {options.length > 0 && (
                        <CommandGroup heading="Library">
                            {options.map((song) => (
                                <CommandItem
                                    key={song.id}
                                    value={`${song.title} ${song.id}`}
                                    onSelect={() =>
                                        handlePick({
                                            id: song.id,
                                            title: song.title,
                                        })
                                    }
                                    data-current={
                                        song.id === currentSongId
                                            ? 'true'
                                            : undefined
                                    }
                                    className="flex cursor-pointer items-center gap-2 px-2 py-1 text-sm aria-selected:bg-indigo-500/15 data-[current=true]:text-indigo-300"
                                >
                                    <FileText
                                        aria-hidden
                                        className="h-3.5 w-3.5 text-muted-foreground/70"
                                    />
                                    <span className="truncate">
                                        {song.title}
                                    </span>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    )}
                </CommandList>
            </Command>
        </TouchOrPopover>
    )
}
