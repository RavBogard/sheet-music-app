"use client"

/**
 * Composes `useLongPress` + `LiveDirectorMenu` into a render-prop wrapper.
 *
 * Each consumer (SetlistRow on the Perform setlist, PDFOverlay on the chart
 * surface) renders its own UI and applies the returned pointer handlers to
 * the target DOM node — the wrapper stays unopinionated about layout. The
 * action sheet is portaled by `<Sheet>`, so it appears above whatever
 * surface fired the long-press without DOM stacking concerns.
 *
 * Auth gate (`isBandLeader || isAdmin`) is the responsibility of the caller
 * — when `enabled === false` the hook short-circuits to a no-op pointer
 * handler bag (no timer, no synthetic-click suppression). That keeps the
 * existing tap-to-open-chart UX untouched on musician iPads (and on
 * incognito iPads where `useAuth()` reports no profile / `isBandLeader === false`).
 */

import { useCallback, useState } from "react"
import type { ReactNode, PointerEvent as ReactPointerEvent } from "react"
import { useLongPress, type UseLongPressBag } from "@/hooks/use-long-press"
import { LiveDirectorMenu } from "./LiveDirectorMenu"
import type { SetlistTrack } from "@/types/models"

export interface LiveDirectorGestureRenderArgs {
    /** Spread onto the gesture target. Stable identity across renders. */
    handlers: UseLongPressBag
    /** True when the action sheet is open; consumers can dim or skip nested
     *  interactions while the user is inside the menu. */
    menuOpen: boolean
}

export interface LiveDirectorGestureProps {
    enabled: boolean
    track: SetlistTrack
    trackIndex: number
    setlistTracks: SetlistTrack[]
    setlistId: string
    /** Render-prop child: receives the pointer handlers + menu-open flag and
     *  is responsible for spreading the handlers onto the gesture target. */
    children: (args: LiveDirectorGestureRenderArgs) => ReactNode
    /** Test seam: override the long-press hold threshold. */
    durationMs?: number
}

export function LiveDirectorGesture({
    enabled,
    track,
    trackIndex,
    setlistTracks,
    setlistId,
    children,
    durationMs,
}: LiveDirectorGestureProps) {
    const [open, setOpen] = useState(false)

    const onLongPress = useCallback(
        (_e: ReactPointerEvent) => {
            setOpen(true)
        },
        [],
    )

    const handlers = useLongPress({
        onLongPress,
        disabled: !enabled,
        ...(durationMs !== undefined ? { durationMs } : {}),
    })

    return (
        <>
            {children({ handlers, menuOpen: open })}
            {enabled && (
                <LiveDirectorMenu
                    open={open}
                    onOpenChange={setOpen}
                    track={track}
                    trackIndex={trackIndex}
                    setlistTracks={setlistTracks}
                    setlistId={setlistId}
                />
            )}
        </>
    )
}
