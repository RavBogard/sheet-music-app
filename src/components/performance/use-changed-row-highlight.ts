"use client"

import { useEffect, useRef, useState } from "react"

import { recentlyWrittenByOps } from "@/lib/setlist-ops-client/server-cache"

const NONE: ReadonlySet<string> = new Set()

/** How long a changed row stays highlighted. */
export const CHANGED_HIGHLIGHT_MS = 2000
/** Rows settling right after mount (server frame giving way to live rows) are not changes. */
export const CHANGED_HIGHLIGHT_QUIET_MS = 1500

interface RowVersion {
    id?: string
    version?: unknown
}

const versionOf = (r: RowVersion): number => (typeof r.version === "number" && Number.isFinite(r.version) ? r.version : 0)

/**
 * Rows whose server `version` rose since `prev`. A row that is new, or has no
 * version, is not a change; a row this tab itself just wrote is the author's
 * own edit, not a remote one (`isLocal`).
 */
export function changedRowIds(
    prev: ReadonlyMap<string, number>,
    rows: readonly RowVersion[],
    isLocal: (id: string) => boolean = recentlyWrittenByOps,
): string[] {
    const out: string[] = []
    for (const r of rows) {
        if (!r.id) continue
        const before = prev.get(r.id)
        if (before === undefined) continue
        const now = versionOf(r)
        if (now > before && !isLocal(r.id)) out.push(r.id)
    }
    return out
}

/**
 * Remote-change highlight: a row another device just changed is outlined for
 * about two seconds. Off (returns an empty set) unless `enabled`, which Perform
 * sets for leaders only. The outline is static, so it needs no motion.
 */
export function useChangedRowHighlight(rows: readonly RowVersion[], enabled: boolean): ReadonlySet<string> {
    const prevRef = useRef<Map<string, number> | null>(null)
    const mountedAtRef = useRef(0)
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
        const next = new Map<string, number>()
        for (const r of rows) if (r.id) next.set(r.id, versionOf(r))
        prevRef.current = next
        if (!enabled || !prev) return
        if (Date.now() - mountedAtRef.current < CHANGED_HIGHLIGHT_QUIET_MS) return
        const changed = changedRowIds(prev, rows)
        if (changed.length === 0) return
        setHighlighted(new Set(changed))
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => {
            timerRef.current = null
            setHighlighted(NONE)
        }, CHANGED_HIGHLIGHT_MS)
    }, [rows, enabled])

    return enabled ? highlighted : NONE
}
