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
import { useMemo, useState, type ReactNode } from 'react'

import { getDb } from '@/lib/local/schema'
import type { LocalSong } from '@/lib/local/types'
import { isJunkLibraryRow } from '@/lib/library/junk-filter'

import { TouchOrPopover } from './TouchOrPopover'
import { ChartPickerItemContent } from './ChartPickerItemContent'

/**
 * v53-02-01: cap on the Recent CommandGroup. Daniel's stated workflow
 * ("90% same week to week") makes the top-5 recent picks the dominant
 * signal; deeper history lives in the alphabetical Library group.
 */
const RECENT_LIMIT = 5

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

    // v60-09-01: archive filter — `status !== 'archived'` keeps the predicate
    // inside the Dexie worker and excludes archived rows from cmdk filter
    // surface, Recent group, and Library group uniformly. Missing-status docs
    // (v54-01-01 bootstrap) pass through as active.
    // v11.5-04-02: also drop test/junk rows via the shared pure predicate. The
    // Dexie songs mirror only carries title + status, so this catches .DS_Store
    // and audio/office-by-name; test-uid rows (no uploadedBy here) are cleared
    // by deletion, not this filter — browse is the primary, fully-fielded gate.
    const songs = useLiveQuery(
        () =>
            getDb()
                .songs.filter(
                    (s) =>
                        s.status !== 'archived' &&
                        !isJunkLibraryRow({ name: s.title, status: s.status }),
                )
                .toArray(),
        [],
        [] as LocalSong[],
    )

    // v53-02-01: derive TWO arrays from the source list — `recentSongs`
    // (capped, sorted by `recent[0].performedAt` desc) and `librarySongs`
    // (full alphabetical). Both render as separate CommandGroups so
    // Daniel's most-recently-used picks float to the top while the full
    // library remains one cmdk filter-keystroke away. No dedup penalty:
    // a song appearing in BOTH groups is the Apple-Music / Spotify
    // "Recently Played + Library" pattern (acceptable; cmdk's filter
    // narrows both groups in lockstep).
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
                                    data-current={
                                        song.id === currentSongId
                                            ? 'true'
                                            : undefined
                                    }
                                    className="flex cursor-pointer items-center gap-2 px-2 py-1 text-sm aria-selected:bg-indigo-500/15 data-[current=true]:text-indigo-300"
                                >
                                    <ChartPickerItemContent song={song} />
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
                                    data-current={
                                        song.id === currentSongId
                                            ? 'true'
                                            : undefined
                                    }
                                    className="flex cursor-pointer items-center gap-2 px-2 py-1 text-sm aria-selected:bg-indigo-500/15 data-[current=true]:text-indigo-300"
                                >
                                    <ChartPickerItemContent song={song} />
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    )}
                </CommandList>
            </Command>
        </TouchOrPopover>
    )
}
