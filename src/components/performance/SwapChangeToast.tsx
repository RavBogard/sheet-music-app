"use client"

import { useEffect, useRef, type MutableRefObject } from "react"
import { toast } from "sonner"
import type { SetlistTrack } from "@/types/models"

interface SwapChangeToastProps {
    tracks: SetlistTrack[]
    lastOwnSwapRef?: MutableRefObject<number | null>
}

const TOAST_ID = "setlist-swap-update"

function isSong(track: SetlistTrack | undefined): boolean {
    if (!track) return false
    return !track.type || track.type === "song"
}

function countTitles(tracks: SetlistTrack[]): Map<string, number> {
    const counts = new Map<string, number>()
    for (const t of tracks) {
        if (!isSong(t)) continue
        counts.set(t.title, (counts.get(t.title) ?? 0) + 1)
    }
    return counts
}

export function SwapChangeToast({ tracks, lastOwnSwapRef }: SwapChangeToastProps) {
    const prevTracksRef = useRef<SetlistTrack[]>(tracks)
    const mountedRef = useRef(false)

    useEffect(() => {
        if (!mountedRef.current) {
            mountedRef.current = true
            prevTracksRef.current = tracks
            return
        }

        const oldTracks = prevTracksRef.current
        prevTracksRef.current = tracks

        // Multiset diff on song-titles. A pure reorder has identical multisets
        // in both directions, so nothing fires. Only genuine swaps (title
        // removed + title added) surface a toast.
        const oldCounts = countTitles(oldTracks)
        const newCounts = countTitles(tracks)

        const added: string[] = []
        const removed: string[] = []
        const titles = new Set([...oldCounts.keys(), ...newCounts.keys()])
        for (const title of titles) {
            const delta = (newCounts.get(title) ?? 0) - (oldCounts.get(title) ?? 0)
            for (let i = 0; i < delta; i++) added.push(title)
            for (let i = 0; i < -delta; i++) removed.push(title)
        }

        if (added.length === 0 && removed.length === 0) return

        // Find the index of the first genuinely-swapped song (a position where
        // the title changed AND the old title is actually gone from the set).
        // This lets us honour the own-swap suppression that lives on
        // lastOwnSwapRef (set by the editor right before it writes the swap).
        let swapIndex = -1
        const len = Math.min(oldTracks.length, tracks.length)
        for (let i = 0; i < len; i++) {
            if (!isSong(oldTracks[i]) || !isSong(tracks[i])) continue
            if (oldTracks[i].title === tracks[i].title) continue
            const oldDropped = (newCounts.get(oldTracks[i].title) ?? 0) < (oldCounts.get(oldTracks[i].title) ?? 0)
            const newAppeared = (newCounts.get(tracks[i].title) ?? 0) > (oldCounts.get(tracks[i].title) ?? 0)
            if (oldDropped && newAppeared) {
                swapIndex = i
                break
            }
        }

        if (swapIndex === -1) return

        if (lastOwnSwapRef?.current === swapIndex) {
            lastOwnSwapRef.current = null
            return
        }

        const fromTitle = oldTracks[swapIndex].title
        const toTitle = tracks[swapIndex].title

        // Single toast id — rapid successive swaps replace the visible toast
        // rather than stacking on top of each other.
        toast.info(`Setlist updated — \u201C${fromTitle}\u201D \u2192 \u201C${toTitle}\u201D`, {
            id: TOAST_ID,
            duration: 4000,
        })
    }, [tracks, lastOwnSwapRef])

    return null
}
