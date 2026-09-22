'use client'

import { QueryClientContext } from '@tanstack/react-query'
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from 'cmdk'
import { useLiveQuery } from 'dexie-react-hooks'
import { useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import { useLibrary } from '@/hooks/use-library'
import { useLibraryStore } from '@/lib/library-store'
import { isJunkLibraryRow } from '@/lib/library/junk-filter'
import { getDb } from '@/lib/local/schema'
import type { LocalSong } from '@/lib/local/types'
import { cn } from '@/lib/utils'

import { ChartPickerItemContent } from './ChartPickerItemContent'
import { openHighlightedChartPreview } from './ChartThumb'

/**
 * The one list body behind every chart picker in setlist edit — the in-cell
 * ChartBindPopover, the centred ChartBindDialog and the "+ Song" picker
 * (AddRowPlaceholder). They used to carry three copies of this; the copies
 * had already drifted (the dialog kept archived and junk rows the other two
 * hid). Mounted only while its picker is open, so a closed chart cell no
 * longer subscribes to the whole songs table.
 *
 * v53-02-01 Recent group: top five by recent[0].performedAt, then the full
 * alphabetical Library. Each row shows page 1 of its chart (ChartThumb).
 */

/** v53-02-01 cap on Recent group — top-5 most-recent picks. */
export const RECENT_LIMIT = 5

/** How often an empty list re-reads Dexie while its picker is open. */
export const EMPTY_RETRY_MS = 1000

export interface ChartPickerSong {
    id: string
    title: string
}

export interface ChartPickerListProps {
    filter: string
    onFilterChange: (next: string) => void
    onPick: (song: ChartPickerSong) => void
    onEscape: () => void
    currentSongId?: string
    inputAriaLabel: string
    placeholder: string
    inputClassName: string
    listClassName: string
    itemClassName: string
    autoFocus?: boolean
    /** Extra groups after Library (the "+ Song" picker's Custom row). */
    children?: ReactNode
}

/** Rows a picker may offer: not archived, not a non-chart artifact. */
export function isPickableSong(s: LocalSong): boolean {
    return s.status !== 'archived' && !isJunkLibraryRow({ name: s.title, status: s.status })
}

export function splitRecentAndLibrary(list: LocalSong[]) {
    const librarySongs = list.slice().sort((a, b) => a.title.localeCompare(b.title))
    const recentSongs = list
        .filter((s) => Array.isArray(s.recent) && s.recent.length > 0)
        .slice()
        .sort((a, b) => (b.recent?.[0]?.performedAt ?? 0) - (a.recent?.[0]?.performedAt ?? 0))
        .slice(0, RECENT_LIMIT)
    return { recentSongs, librarySongs }
}

/** Fills useLibraryStore (mimeType per row) when a QueryClient is present. */
function LibraryWarmup() {
    useLibrary()
    return null
}

export function ChartPickerList({
    filter,
    onFilterChange,
    onPick,
    onEscape,
    currentSongId,
    inputAriaLabel,
    placeholder,
    inputClassName,
    listClassName,
    itemClassName,
    autoFocus,
    children,
}: ChartPickerListProps) {
    const hasQueryClient = useContext(QueryClientContext) != null

    // A picker opened on a cold device (first visit, the songs listener still
    // filling Dexie) could read the table empty and then never hear about the
    // rows that landed after — seen on the band's iPad surface in WebKit,
    // 2026-09-22: 990 rows in Dexie, "No matches." on screen until reopened.
    // So while the list is empty, re-run the query once a second; once rows
    // arrive the live query carries on as before.
    const [emptyRetry, setEmptyRetry] = useState(0)
    const songs = useLiveQuery(
        () => getDb().songs.filter(isPickableSong).toArray(),
        [emptyRetry],
        [] as LocalSong[],
    )
    const isEmpty = (songs ?? []).length === 0
    useEffect(() => {
        if (!isEmpty) return
        const t = setTimeout(() => setEmptyRetry((n) => n + 1), EMPTY_RETRY_MS)
        return () => clearTimeout(t)
    }, [isEmpty, emptyRetry])

    const libraryFiles = useLibraryStore((s) => s.allFiles)
    const mimeById = useMemo(() => {
        const m = new Map<string, string>()
        for (const f of libraryFiles) if (f.mimeType) m.set(f.id, f.mimeType)
        return m
    }, [libraryFiles])

    const { recentSongs, librarySongs } = useMemo(() => splitRecentAndLibrary(songs ?? []), [songs])

    const renderItem = (song: LocalSong, keyPrefix: string) => (
        <CommandItem
            key={`${keyPrefix}${song.id}`}
            value={song.title}
            onSelect={() => onPick({ id: song.id, title: song.title })}
            data-current={song.id === currentSongId ? 'true' : undefined}
            className={itemClassName}
        >
            <ChartPickerItemContent song={song} mimeType={mimeById.get(song.id)} />
        </CommandItem>
    )

    return (
        <Command shouldFilter loop>
            {hasQueryClient && <LibraryWarmup />}
            <CommandInput
                value={filter}
                onValueChange={onFilterChange}
                placeholder={placeholder}
                aria-label={inputAriaLabel}
                className={inputClassName}
                autoFocus={autoFocus}
                onKeyDown={(e) => {
                    if (openHighlightedChartPreview(e)) return
                    if (e.key === 'Escape') {
                        e.preventDefault()
                        onEscape()
                    }
                }}
            />
            <CommandList className={cn(listClassName)}>
                <CommandEmpty className="px-4 py-3 text-sm text-muted-foreground">No matches.</CommandEmpty>
                {recentSongs.length > 0 && (
                    <CommandGroup heading="Recent">{recentSongs.map((s) => renderItem(s, 'recent-'))}</CommandGroup>
                )}
                {librarySongs.length > 0 && (
                    <CommandGroup heading="Library">{librarySongs.map((s) => renderItem(s, ''))}</CommandGroup>
                )}
                {children}
            </CommandList>
        </Command>
    )
}
