"use client"

import { useEffect, useRef } from "react"
import { createFaderThrottle, type FaderThrottle } from "@/lib/monitor/fader-throttle"

/**
 * React binding for the R4 fader throttle.
 *
 * Owns the three moments where a fader's last value used to be lost:
 *
 *  1. **Release** — handled by `commit()` in the component (synchronous send).
 *  2. **iOS backgrounding** — Safari suspends timers and animation frames when
 *     the tab hides, so a scheduled trailing value can sit unfired for minutes
 *     (or forever, if the tab is reaped). We flush on `visibilitychange → hidden`
 *     and on `pagehide`; iOS Safari is unreliable about firing the former, and
 *     `beforeunload` (used by `use-monitor-connection`) is worse on iOS still.
 *  3. **Unmount** — the perform-toolbar popover unmounts its faders the instant
 *     it closes, which is exactly the frame a just-released value would be
 *     waiting in. The cleanup flushes rather than cancels: the value the
 *     musician left the fader at is the value they meant.
 *
 * The throttle instance is created once and reads `onChange` through a ref, so a
 * parent re-render that hands down a new callback identity cannot orphan a
 * pending value mid-drag.
 */
export function useFaderThrottle(onChange: (value: number) => void): FaderThrottle {
    const onChangeRef = useRef(onChange)
    useEffect(() => {
        onChangeRef.current = onChange
    }, [onChange])

    const throttleRef = useRef<FaderThrottle | null>(null)
    if (throttleRef.current === null) {
        throttleRef.current = createFaderThrottle({
            onChange: (value) => onChangeRef.current(value),
        })
    }
    const throttle = throttleRef.current

    useEffect(() => {
        const onVisibility = () => {
            if (document.visibilityState === "hidden") throttle.flush()
        }
        const onPageHide = () => throttle.flush()

        document.addEventListener("visibilitychange", onVisibility)
        window.addEventListener("pagehide", onPageHide)
        return () => {
            document.removeEventListener("visibilitychange", onVisibility)
            window.removeEventListener("pagehide", onPageHide)
            // Unmount (e.g. the popover closing over a just-released fader).
            throttle.flush()
        }
    }, [throttle])

    return throttle
}
