"use client"

import { useCallback, useEffect, useState } from "react"

/**
 * Whether Perform mode folds the fixed-liturgy rows away, per device.
 *
 * WHY IT IS PER DEVICE AND NOT PER SETLIST. The same service is open on six
 * iPads and one lectern. The band wants the songs; the rabbi wants every row.
 * That is a property of who is holding the tablet, not of the service, so it
 * cannot live on the setlist — one person's preference would change what
 * everyone else sees, mid-service, with no way to tell why.
 *
 * DEFAULT COLLAPSED. The four templates now carry 45 fixed liturgy rows
 * between them. A band iPad that opens to those has to be scrolled past before
 * the first chart is reachable, which is the opposite of what Perform mode is
 * for. The rabbi's printed sheet is unaffected — the print path reads the
 * tracks, not this.
 *
 * `localStorage` can throw (private window, blocked site data) and can be
 * absent during SSR, so every access is guarded and the failure mode is the
 * default rather than a crash. The initial state is the default on both server
 * and client, and a stored preference is applied after mount — no hydration
 * mismatch, and no flash for the common case, which is the default.
 */

export const LITURGY_COLLAPSE_KEY = "crc.perform.liturgy-collapsed"

function read(): boolean | null {
    if (typeof window === "undefined") return null
    try {
        const raw = window.localStorage.getItem(LITURGY_COLLAPSE_KEY)
        if (raw === "0") return false
        if (raw === "1") return true
        return null
    } catch {
        return null
    }
}

export function useLiturgyCollapse(): {
    collapsed: boolean
    setCollapsed: (next: boolean) => void
    /** False until the stored preference has been consulted. */
    ready: boolean
} {
    const [collapsed, setState] = useState(true)
    const [ready, setReady] = useState(false)

    useEffect(() => {
        const stored = read()
        if (stored !== null) setState(stored)
        setReady(true)
    }, [])

    const setCollapsed = useCallback((next: boolean) => {
        setState(next)
        if (typeof window === "undefined") return
        try {
            window.localStorage.setItem(LITURGY_COLLAPSE_KEY, next ? "1" : "0")
        } catch {
            // A preference that cannot be remembered still works for this
            // session. Nothing here is worth failing an edit over.
        }
    }, [])

    return { collapsed, setCollapsed, ready }
}
