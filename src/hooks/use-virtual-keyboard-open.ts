"use client"

import { useEffect, useState } from "react"

/**
 * v60-10-01: detect when the on-screen virtual keyboard is open via the
 * VisualViewport API. Returns false on SSR and when visualViewport is
 * unavailable (e.g. older browsers, JSDOM). Threshold of 150px tolerates
 * browser-chrome reveal/hide (~80px) while catching real keyboards
 * (iOS Safari ≥250-320px).
 *
 * Composed by callers as `useMediaQuery('(pointer: coarse)') && useVirtualKeyboardOpen()`
 * — this hook is intentionally pointer-agnostic.
 */
const KEYBOARD_DELTA_THRESHOLD_PX = 150

export function useVirtualKeyboardOpen(): boolean {
    const [open, setOpen] = useState(false)

    useEffect(() => {
        if (typeof window === "undefined") return
        const vv = window.visualViewport
        if (!vv) return

        const compute = () => {
            const delta = window.innerHeight - vv.height
            setOpen(delta > KEYBOARD_DELTA_THRESHOLD_PX)
        }

        compute()
        vv.addEventListener("resize", compute)
        return () => vv.removeEventListener("resize", compute)
    }, [])

    return open
}
