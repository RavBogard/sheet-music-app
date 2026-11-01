"use client"

import { useEffect, useRef, useState } from "react"
import { movedRowIds } from "@/lib/performance/live-reorder"

const NONE: ReadonlySet<string> = new Set()

/** How long a moved row stays highlighted. */
export const MOVED_HIGHLIGHT_MS = 2000
/**
 * Order changes in the first moments after mount are the page settling (the
 * server frame giving way to this device's live rows), not a leader's move.
 */
export const MOVED_HIGHLIGHT_QUIET_MS = 1500

/**
 * Live reorder: which rows were just moved, for a 2-second highlight. Fires
 * only when the same rows come back in a different order; a row arriving or
 * leaving is not a move. One state update when a move lands and one when the
 * highlight ends, so a remote reorder settles in a bounded number of renders.
 */
export function useMovedRowHighlight(ids: readonly (string | undefined)[]): ReadonlySet<string> {
    const key = ids.map((id) => id ?? "").join("\n")
    const prevRef = useRef<string | null>(null)
    const mountedAtRef = useRef<number>(0)
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const [highlighted, setHighlighted] = useState<ReadonlySet<string>>(NONE)

    useEffect(() => {
        mountedAtRef.current = Date.now()
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current)
        }
    }, [])

    useEffect(() => {
        const prev = prevRef.current
        prevRef.current = key
        if (prev === null || prev === key) return
        if (Date.now() - mountedAtRef.current < MOVED_HIGHLIGHT_QUIET_MS) return
        const before = prev.split("\n")
        const after = key.split("\n")
        if (before.length !== after.length) return
        const beforeSet = new Set(before)
        if (after.some((id) => !beforeSet.has(id))) return
        const moved = movedRowIds(before, after).filter(Boolean)
        if (moved.length === 0) return
        setHighlighted(new Set(moved))
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => {
            timerRef.current = null
            setHighlighted(NONE)
        }, MOVED_HIGHLIGHT_MS)
    }, [key])

    return highlighted
}
