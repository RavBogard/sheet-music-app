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
import { FileText, Plus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { getDb } from '@/lib/local/schema'
import type { LocalSong } from '@/lib/local/types'
import { cn } from '@/lib/utils'

import { TouchOrPopover } from './TouchOrPopover'

/**
 * v53-03-01: cap on the Recent CommandGroup. Mirrors v53-02 ChartBindPopover
 * (Daniel weekly-cycle workflow — "90% same week to week" — top-5 most-recent
 * picks dominate the signal; full alphabetical Library remains one keystroke
 * away). Reads existing v50-04 SongRecentEntry.performedAt; NO Dexie schema
 * bump. AddRowPlaceholder is the picker rendered by AddBar's primary "+ Song"
 * CTA (v53-03-01); it is no longer mounted standalone by SetlistGrid.
 */
const RECENT_LIMIT = 5

export interface AddRowPlaceholderProps {
    /** Insert a new row populated from a known library song. */
    onPickSong: (song: { id: string; title: string }) => void
    /** Insert a new row with a free-text title only. */
    onCreateFreeText: (title: string) => void
    /** Imperative open trigger from the EmptyState "Add a song" CTA. */
    autoOpen?: boolean
}

export function AddRowPlaceholder({
    onPickSong,
    onCreateFreeText,
    autoOpen = false,
}: AddRowPlaceholderProps) {
    const [open, setOpen] = useState(false)
    const [filter, setFilter] = useState('')
    const triggerRef = useRef<HTMLButtonElement>(null)

    useEffect(() => {
        if (autoOpen) setOpen(true)
    }, [autoOpen])

    // v60-09-01: archive filter mirrors ChartBindPopover — archived songs
    // disappear from both Recent and Library cmdk groups; missing-status
    // bootstrap docs pass through as active.
    const songs = useLiveQuery(
        () =>
            getDb()
                .songs.filter((s) => s.status !== 'archived')
                .toArray(),
        [],
        [] as LocalSong[],
    )

    // v53-03-01: derive Recent + Library arrays — same shape as v53-02
    // ChartBindPopover. Recent: filter recent[] non-empty, sort by
    // recent[0].performedAt desc, slice 5. Library: full alphabetical.
    // cmdk's filter narrows BOTH groups against the typed input via
    // shouldFilter loop.
    const { recentSongs, librarySongs } = useMemo(() => {
        const list = songs ?? []
        const librarySongs = list
            .slice()
            .sort((a, b) => a.title.localeCompare(b.title))
        const recentSongs = list
            .filter((s) => Array.isArray(s.recent) && s.recent.length > 0)
            .slice()
            .sort(
                (a, b) =>
                    (b.recent?.[0]?.performedAt ?? 0) -
                    (a.recent?.[0]?.performedAt ?? 0),
            )
            .slice(0, RECENT_LIMIT)
        return { recentSongs, librarySongs }
    }, [songs])

    const close = () => {
        setOpen(false)
        setFilter('')
    }

    const handlePick = (song: { id: string; title: string }) => {
        onPickSong(song)
        close()
    }

    const handleFreeText = () => {
        const t = filter.trim()
        if (!t) {
            close()
            return
        }
        onCreateFreeText(t)
        close()
    }

    return (
        <div
            data-testid="add-row-placeholder"
            className={cn(
                'flex w-full items-center border-t border-white/10',
                'hover:bg-white/[0.03]',
            )}
        >
            <TouchOrPopover
                open={open}
                onOpenChange={(next) => {
                    if (!next) close()
                    else setOpen(true)
                }}
                align="start"
                sideOffset={2}
                onCloseAutoFocus={(e) => {
                    e.preventDefault()
                    triggerRef.current?.focus()
                }}
                contentClassName="w-[24rem]"
                trigger={
                    <button
                        ref={triggerRef}
                        type="button"
                        data-testid="add-row-trigger"
                        // v53-03-01: long-press disambiguation — neutralize
                        // synthetic contextmenu MouseEvent dispatched by
                        // v50-05-04 row long-press machinery. AddRowPlaceholder
                        // (and its parent AddBar) live outside the row scope,
                        // so a long-press here must NOT open the row
                        // ContextMenu. preventDefault is defense-in-depth.
                        onContextMenu={(e) => e.preventDefault()}
                        className={cn(
                            // Baseline 44px (h-11) — already satisfies touch
                            // target requirement; bumped to h-12 on coarse
                            // for extra breathing room.
                            'flex h-11 w-full items-center gap-2 px-3 text-left text-sm',
                            '[@media(pointer:coarse)]:h-12',
                            'font-medium text-foreground hover:text-foreground',
                            'cursor-pointer',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
                        )}
                    >
                        <Plus
                            aria-hidden
                            className="h-4 w-4 text-indigo-300"
                        />
                        <span>Song</span>
                    </button>
                }
            >
                <Command shouldFilter loop>
                    <CommandInput
                        value={filter}
                        onValueChange={setFilter}
                        placeholder="Type a song title…"
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
                        {recentSongs.length > 0 && (
                            <CommandGroup heading="Recent">
                                {recentSongs.map((song) => (
                                    <CommandItem
                                        key={`recent-${song.id}`}
                                        value={song.title}
                                        onSelect={() =>
                                            handlePick({
                                                id: song.id,
                                                title: song.title,
                                            })
                                        }
                                        className="flex cursor-pointer items-center gap-2 px-2 py-1 text-sm aria-selected:bg-indigo-500/15"
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
                        {librarySongs.length > 0 && (
                            <CommandGroup heading="Library">
                                {librarySongs.map((song) => (
                                    <CommandItem
                                        key={song.id}
                                        value={song.title}
                                        onSelect={() =>
                                            handlePick({
                                                id: song.id,
                                                title: song.title,
                                            })
                                        }
                                        className="flex cursor-pointer items-center gap-2 px-2 py-1 text-sm aria-selected:bg-indigo-500/15"
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
                        {filter.trim().length > 0 && (
                            <CommandGroup heading="Custom">
                                <CommandItem
                                    value={`__create__${filter}`}
                                    onSelect={handleFreeText}
                                    className="flex cursor-pointer items-center gap-2 px-2 py-1 text-sm aria-selected:bg-indigo-500/15"
                                >
                                    <Plus
                                        aria-hidden
                                        className="h-3.5 w-3.5 text-muted-foreground/70"
                                    />
                                    <span>
                                        Create new track called “
                                        {filter.trim()}”
                                    </span>
                                </CommandItem>
                            </CommandGroup>
                        )}
                    </CommandList>
                </Command>
            </TouchOrPopover>
        </div>
    )
}
