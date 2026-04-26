'use client'

import * as Popover from '@radix-ui/react-popover'
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
import { useMemo, useRef, useState, type ReactNode } from 'react'

import { getDb } from '@/lib/local/schema'
import type { LocalSong } from '@/lib/local/types'

export interface ChartBindSelection {
    songId: string
    title: string
}

export interface ChartBindPopoverProps {
    /** Click target. Wrapped in Popover.Trigger via asChild. */
    children: ReactNode
    /** Currently bound songId (preselects in the list when re-binding). */
    currentSongId?: string
    /** aria-label for the cmdk input (test/a11y hook). */
    inputAriaLabel?: string
    /** Fired when the user picks a library entry. */
    onBind: (selection: ChartBindSelection) => void
}

export function ChartBindPopover({
    children,
    currentSongId,
    inputAriaLabel = 'Bind a chart',
    onBind,
}: ChartBindPopoverProps) {
    const [open, setOpen] = useState(false)
    const [filter, setFilter] = useState('')
    const triggerRef = useRef<HTMLElement>(null)

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
        <Popover.Root
            open={open}
            onOpenChange={(next) => {
                if (!next) close()
                else setOpen(true)
            }}
        >
            <Popover.Trigger asChild ref={triggerRef as never}>
                {children}
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Content
                    align="start"
                    sideOffset={4}
                    onCloseAutoFocus={(e) => {
                        e.preventDefault()
                        triggerRef.current?.focus()
                    }}
                    className="z-50 w-[24rem] overflow-hidden rounded-md border border-white/10 bg-background shadow-lg"
                    data-testid="chart-bind-popover"
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
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    )
}
