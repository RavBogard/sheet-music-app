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
import { useEffect, useMemo, useRef, useState } from 'react'

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { getDb } from '@/lib/local/schema'
import type { LocalSong } from '@/lib/local/types'
import { ChartPickerItemContent } from './ChartPickerItemContent'

/**
 * v54-02-01 (Bug 3 fix, 2026-05-12): centered command dialog for binding a
 * chart to a track. Replaces the context-menu → anchored Popover handoff
 * that was failing silently on desktop (and required a `setTimeout(0)`
 * workaround on iPad). Two Radix overlays handing off focus + outside-
 * click detectors across a state-tick boundary is inherently fragile; a
 * single centered Dialog has no anchor dependency, opens on a single
 * `open` prop, and works identically across mouse + touch.
 *
 * This is the canonical pattern (Linear/Notion/Raycast/Arc) for typeable
 * secondary actions triggered from a context menu: never chain anchored
 * overlays — open a centered command dialog.
 *
 * The cmdk body (Recent + Library groups, fuzzy filter, currentSongId
 * highlight) is preserved verbatim from ChartBindPopover so the
 * keyboarding / a11y story is unchanged.
 */

/** v53-02-01 cap on Recent group — top-5 most-recent picks. */
const RECENT_LIMIT = 5

export interface ChartBindSelection {
    songId: string
    title: string
}

export interface ChartBindDialogProps {
    /** True when the dialog should be visible. */
    open: boolean
    /** Called when the dialog requests close (Esc, outside click, or pick). */
    onOpenChange: (next: boolean) => void
    /** Currently bound songId (preselects/highlights it in the list). */
    currentSongId?: string
    /** aria-label for the cmdk input (test/a11y hook). */
    inputAriaLabel?: string
    /** Fired when the user picks a library entry. Dialog auto-closes after. */
    onBind: (selection: ChartBindSelection) => void
}

export function ChartBindDialog({
    open,
    onOpenChange,
    currentSongId,
    inputAriaLabel = 'Bind a chart',
    onBind,
}: ChartBindDialogProps) {
    const [filter, setFilter] = useState('')

    const songs = useLiveQuery(
        () => getDb().songs.toArray(),
        [],
        [] as LocalSong[],
    )

    // v60-09-01: per-open re-prime deleted. The continuous subscribeSongsLibrary
    // listener installed by SetlistGridHydrator keeps Dexie live with all
    // songs/* mutations across devices, making the on-open refresh redundant.

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
        onOpenChange(false)
        setFilter('')
    }

    const handlePick = (song: { id: string; title: string }) => {
        onBind({ songId: song.id, title: song.title })
        close()
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!next) close()
                else onOpenChange(true)
            }}
        >
            <DialogContent
                className="max-w-md p-0 overflow-hidden"
                data-testid="chart-bind-dialog"
            >
                <DialogHeader className="px-4 pt-4 pb-2">
                    <DialogTitle>Bind a chart</DialogTitle>
                    <DialogDescription>
                        Pick a song from your library to attach to this track.
                    </DialogDescription>
                </DialogHeader>
                <Command shouldFilter loop>
                    <CommandInput
                        value={filter}
                        onValueChange={setFilter}
                        placeholder="Search the library…"
                        aria-label={inputAriaLabel}
                        className="w-full bg-transparent px-4 py-2 text-sm outline-none border-t border-b border-white/10"
                        autoFocus
                        onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                                e.preventDefault()
                                close()
                            }
                        }}
                    />
                    <CommandList className="max-h-80 overflow-y-auto py-1">
                        <CommandEmpty className="px-4 py-3 text-sm text-muted-foreground">
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
                                        className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm aria-selected:bg-indigo-500/15 data-[current=true]:text-indigo-300"
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
                                        className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm aria-selected:bg-indigo-500/15 data-[current=true]:text-indigo-300"
                                    >
                                        <ChartPickerItemContent song={song} />
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        )}
                    </CommandList>
                </Command>
            </DialogContent>
        </Dialog>
    )
}
