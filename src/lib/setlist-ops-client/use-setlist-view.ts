'use client'

/**
 * useSetlistView(setlistId): what the author sees. Server cache (Dexie) plus
 * this device's pending intents, with pending rows and fields flagged, and
 * the setlist's freshness. The editor reads only this; PR 4 (Perform) can use
 * the same hook.
 *
 * `initial` is the server frame the page was rendered with (SSR). It is shown
 * until this tab's listener has delivered a live server set, so the first
 * paint is the server's rows and never an older cached copy.
 */
import { useEffect, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'

import { getDb } from '@/lib/local/schema'
import type { LocalSetlist, LocalTrack, SetlistIntent } from '@/lib/local/types'

import { isOnline, useConnectivity } from './connectivity'
import { computeFreshness, useLiveFlags, type Freshness } from './freshness'
import { bootSetlistOps } from './runtime'
import { recentlyRemovedByOps, recentlyWrittenByOps } from './server-cache'
import { computeView, type SetlistView } from './view'

export interface UseSetlistViewResult extends SetlistView {
    loading: boolean
    freshness: Freshness
}

const NO_INTENTS: SetlistIntent[] = []

const versionOf = (r: unknown): number => { const v = (r as { version?: unknown } | undefined)?.version; return typeof v === 'number' ? v : 0 }

/**
 * Before the first live set: the SSR frame, except where an /ops answer
 * this tab applied is newer (a higher row version, or a row it inserted or
 * removed). Older cached rows, ghosts included, never show.
 */
function mergeInitial(initial: readonly LocalTrack[], cached: readonly LocalTrack[] | undefined): LocalTrack[] {
    if (!cached) return [...initial]
    const cachedById = new Map(cached.map((r) => [r.id, r]))
    const out: LocalTrack[] = []
    for (const r of initial) {
        if (recentlyRemovedByOps(r.id)) continue
        const c = cachedById.get(r.id)
        out.push(c && versionOf(c) > versionOf(r) ? c : r)
    }
    const known = new Set(initial.map((r) => r.id))
    for (const c of cached) if (!known.has(c.id) && recentlyWrittenByOps(c.id)) out.push(c)
    return out
}

export function useSetlistView(
    setlistId: string,
    initial?: { setlist?: LocalSetlist; rows?: LocalTrack[] },
): UseSetlistViewResult {
    useEffect(() => {
        void bootSetlistOps()
    }, [])

    const cachedRows = useLiveQuery(
        () => getDb().tracks.where('setlistId').equals(setlistId).toArray(),
        [setlistId],
    ) as LocalTrack[] | undefined
    const cachedSetlist = useLiveQuery(() => getDb().setlists.get(setlistId), [setlistId]) as
        | LocalSetlist
        | undefined
    const intents = useLiveQuery(
        () => getDb().intents.where('setlistId').equals(setlistId).toArray(),
        [setlistId],
    ) as SetlistIntent[] | undefined
    const liveRows = useLiveFlags((s) => Boolean(s.rows[setlistId]))
    const liveSetlist = useLiveFlags((s) => Boolean(s.setlist[setlistId]))
    const browserOnline = useConnectivity((s) => s.browserOnline)
    const unreachableSince = useConnectivity((s) => s.unreachableSince)
    const offlineSince = useConnectivity((s) => s.offlineSince)

    const initialRows = initial?.rows
    const rowsSource = useMemo(
        () => (!liveRows && initialRows ? mergeInitial(initialRows, cachedRows) : cachedRows),
        [liveRows, initialRows, cachedRows],
    )
    const setlistSource = !liveSetlist && initial?.setlist ? initial.setlist : (cachedSetlist ?? initial?.setlist)

    const view = useMemo(
        () => computeView(rowsSource ?? [], setlistSource, intents ?? NO_INTENTS),
        [rowsSource, setlistSource, intents],
    )
    const online = isOnline({ browserOnline, unreachableSince })
    const freshness = useMemo(
        () => computeFreshness(intents ?? NO_INTENTS, { online, offlineSince, browserOnline }),
        [intents, online, offlineSince, browserOnline],
    )
    return { ...view, loading: rowsSource === undefined || intents === undefined, freshness }
}
