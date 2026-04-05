"use client"

import { useEffect, useRef, type MutableRefObject } from "react"
import { toast } from "sonner"
import type { SetlistTrack } from "@/types/models"

interface SwapChangeToastProps {
    tracks: SetlistTrack[]
    lastOwnSwapRef?: MutableRefObject<number | null>
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

        const len = Math.min(oldTracks.length, tracks.length)
        for (let i = 0; i < len; i++) {
            if (oldTracks[i].title !== tracks[i].title) {
                // Skip toast for our own swap
                if (lastOwnSwapRef?.current === i) {
                    lastOwnSwapRef.current = null
                    continue
                }
                toast.info(`${oldTracks[i].title} \u2192 ${tracks[i].title}`, { duration: 4000 })
            }
        }
    }, [tracks, lastOwnSwapRef])

    return null
}
