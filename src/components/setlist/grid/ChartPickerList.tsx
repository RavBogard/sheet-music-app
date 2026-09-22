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
import { useAuth } from '@/lib/auth-context'
import { auth } from '@/lib/firebase'
import { useLibraryStore } from '@/lib/library-store'
import { isJunkLibraryRow } from '@/lib/library/junk-filter'
import { getDb } from '@/lib/local/schema'
import type { LocalSong } from '@/lib/local/types'
import { useOrg } from '@/lib/org/org-context'
import { getOrg } from '@/lib/org/registry'
import type { OrgId } from '@/lib/org/types'
import {
    chipsFor,
    collectionLabel,
    defaultPickerCollection,
    inCollection,
    isHiddenStatus,
    isPickableFor,
    normalizeCollection,
    type PickerCollection,
} from '@/lib/songs/picker-scope'
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
 *
 * David's ask 2 (2026-09-22): rows are this SITE's (host org), never another
 * tenant's, and never archived/duplicate/orphaned (picker-scope.ts). CRC opens
 * on the core collection; an admin can add other sites' charts for one open.
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

/**
 * Probe-harness only (NEXT_PUBLIC_PROBE_HARNESS_AUTH, the flag that already
 * gates the Web-SDK sign-in bridge in src/lib/firebase.ts): a short ring of
 * what the list's query did, so the iPad e2e spec can say why a list is
 * empty. No-op everywhere else.
 */
function probeNote(entry: Record<string, unknown>) {
    if (process.env.NEXT_PUBLIC_PROBE_HARNESS_AUTH !== '1' || typeof window === 'undefined') return
    const w = window as unknown as { __chartPickerProbe__?: unknown[] }
    const ring = (w.__chartPickerProbe__ ??= [])
    ring.push({ at: Date.now(), ...entry })
    if (ring.length > 60) ring.splice(0, ring.length - 60)
}

/** A row from another site, offered only when an admin asks for it. */
interface OtherSiteRow {
    id: string
    title: string
    orgId: OrgId
    mimeType?: string
}

interface OtherSitesState {
    rows: OtherSiteRow[]
    loading: boolean
    failed: boolean
}

/**
 * The admin "include other sites" rows. A deliberate, authorised path: the
 * library route honours `allSites=true` only for an admin (server-checked),
 * and nothing here widens the local songs table. Fetched only while the
 * control is on; the control starts off every time a picker opens.
 */
function useOtherSites(enabled: boolean, hostOrg: OrgId): OtherSitesState {
    const [state, setState] = useState<OtherSitesState>({ rows: [], loading: false, failed: false })
    useEffect(() => {
        if (!enabled) {
            setState({ rows: [], loading: false, failed: false })
            return
        }
        const controller = new AbortController()
        setState((prev) => ({ ...prev, loading: true, failed: false }))
        void (async () => {
            try {
                const token = await auth?.currentUser?.getIdToken()
                const res = await fetch('/api/library/list?all=true&collection=all&allSites=true', {
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                    signal: controller.signal,
                    cache: 'no-store',
                })
                if (!res.ok) throw new Error(`HTTP ${res.status}`)
                const body = (await res.json()) as {
                    files?: Array<{
                        id: string
                        name?: string
                        displayName?: string
                        mimeType?: string
                        status?: string
                        orgId?: string
                    }>
                }
                const rows = (body.files ?? [])
                    .filter((f) => f.orgId && f.orgId !== hostOrg && !isHiddenStatus(f.status))
                    .map((f) => ({
                        id: f.id,
                        title: f.displayName ?? f.name ?? f.id,
                        orgId: f.orgId as OrgId,
                        mimeType: f.mimeType,
                    }))
                    .filter((f) => !isJunkLibraryRow({ name: f.title, mimeType: f.mimeType }))
                    .sort((a, b) => a.title.localeCompare(b.title))
                if (!controller.signal.aborted) setState({ rows, loading: false, failed: false })
            } catch (err) {
                if ((err as Error).name === 'AbortError') return
                setState({ rows: [], loading: false, failed: true })
            }
        })()
        return () => controller.abort()
    }, [enabled, hostOrg])
    return state
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
    const hostOrg = useOrg()
    const { isAdmin } = useAuth()

    // A picker opened on a cold device (first visit, the songs listener still
    // filling Dexie) could read the table empty and then never hear about the
    // rows that landed after — seen on the band's iPad surface in WebKit,
    // 2026-09-22: 990 rows in Dexie, "No matches." on screen until reopened.
    // So while the list is empty, re-run the query once a second; once rows
    // arrive the live query carries on as before.
    const [emptyRetry, setEmptyRetry] = useState(0)
    const songs = useLiveQuery(
        async () => {
            const t0 = Date.now()
            try {
                const rows = await getDb().songs.filter((row) => isPickableFor(row, hostOrg)).toArray()
                probeNote({ ok: rows.length, ms: Date.now() - t0 })
                return rows
            } catch (err) {
                probeNote({ err: String(err), ms: Date.now() - t0 })
                throw err
            }
        },
        [emptyRetry, hostOrg],
        [] as LocalSong[],
    )
    probeNote({ render: (songs ?? []).length, retry: emptyRetry })
    const isEmpty = (songs ?? []).length === 0
    useEffect(() => {
        if (!isEmpty) return
        const t = setTimeout(() => setEmptyRetry((n) => n + 1), EMPTY_RETRY_MS)
        return () => clearTimeout(t)
    }, [isEmpty, emptyRetry])

    const libraryFiles = useLibraryStore((s) => s.allFiles)
    const { mimeById, collectionById } = useMemo(() => {
        const mimes = new Map<string, string>()
        const collections = new Map<string, PickerCollection>()
        for (const f of libraryFiles) {
            if (f.mimeType) mimes.set(f.id, f.mimeType)
            collections.set(f.id, normalizeCollection(f.collection))
        }
        return { mimeById: mimes, collectionById: collections }
    }, [libraryFiles])

    // Collection chips. The list mounts per open, so these reset every open:
    // CRC starts on core, and "include other sites" always starts off.
    const [collection, setCollection] = useState<PickerCollection | null>(() =>
        defaultPickerCollection(hostOrg),
    )
    const [otherSitesOn, setOtherSitesOn] = useState(false)
    const chips = useMemo(() => chipsFor(songs ?? [], collectionById), [songs, collectionById])
    const activeCollection = chips.length > 0 ? collection : null
    const otherSites = useOtherSites(isAdmin && otherSitesOn, hostOrg)

    const { recentSongs, librarySongs } = useMemo(
        () =>
            splitRecentAndLibrary(
                (songs ?? []).filter((s) => inCollection(s, activeCollection, collectionById)),
            ),
        [songs, activeCollection, collectionById],
    )

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
            {(chips.length > 0 || isAdmin) && (
                <div
                    role="group"
                    aria-label="Library collection"
                    data-testid="picker-scope-bar"
                    className="flex flex-wrap items-center gap-1 border-b border-white/10 px-2 py-1.5"
                >
                    {chips.map((c) => {
                        const active = activeCollection === c
                        return (
                            <button
                                key={c}
                                type="button"
                                aria-pressed={active}
                                data-collection={c}
                                // Tapping the active chip lifts the filter.
                                onClick={() => setCollection(active ? null : c)}
                                className="rounded-full border border-white/10 px-2.5 py-0.5 text-xs text-muted-foreground hover:text-foreground aria-pressed:border-indigo-400/50 aria-pressed:bg-indigo-500/15 aria-pressed:text-foreground [@media(pointer:coarse)]:py-1.5"
                            >
                                {collectionLabel(hostOrg, c)}
                            </button>
                        )
                    })}
                    {isAdmin && (
                        <button
                            type="button"
                            role="switch"
                            aria-checked={otherSitesOn}
                            data-testid="picker-other-sites"
                            onClick={() => setOtherSitesOn((v) => !v)}
                            className="ml-auto rounded-full border border-white/10 px-2.5 py-0.5 text-xs text-muted-foreground hover:text-foreground aria-checked:border-indigo-400/50 aria-checked:text-foreground [@media(pointer:coarse)]:py-1.5"
                        >
                            {otherSitesOn ? 'Include other sites · on' : 'Include other sites'}
                        </button>
                    )}
                </div>
            )}
            <CommandList className={cn(listClassName)}>
                <CommandEmpty className="px-4 py-3 text-sm text-muted-foreground">No matches.</CommandEmpty>
                {recentSongs.length > 0 && (
                    <CommandGroup heading="Recent">{recentSongs.map((s) => renderItem(s, 'recent-'))}</CommandGroup>
                )}
                {librarySongs.length > 0 && (
                    <CommandGroup heading="Library">{librarySongs.map((s) => renderItem(s, ''))}</CommandGroup>
                )}
                {otherSitesOn && otherSites.rows.length > 0 && (
                    <CommandGroup heading="Other sites">
                        {otherSites.rows.map((row) => (
                            <CommandItem
                                key={`other-${row.id}`}
                                value={`${row.title} ${getOrg(row.orgId)?.name ?? row.orgId}`}
                                onSelect={() => onPick({ id: row.id, title: row.title })}
                                data-current={row.id === currentSongId ? 'true' : undefined}
                                data-other-site={row.orgId}
                                className={itemClassName}
                            >
                                <ChartPickerItemContent
                                    song={{ id: row.id, title: row.title, normalizedTitle: row.title.toLowerCase() }}
                                    mimeType={row.mimeType}
                                />
                                <span className="shrink-0 text-[10px] text-muted-foreground">
                                    {getOrg(row.orgId)?.name ?? row.orgId}
                                </span>
                            </CommandItem>
                        ))}
                    </CommandGroup>
                )}
                {otherSitesOn && otherSites.failed && (
                    <p className="px-4 py-2 text-xs text-muted-foreground">Could not load other sites' charts.</p>
                )}
                {children}
            </CommandList>
        </Command>
    )
}
