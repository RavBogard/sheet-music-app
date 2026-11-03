"use client"

import { useEffect, useRef, useState } from "react"

import { isQuiet } from "@/lib/performance/quiet"
import { useLiveFlags } from "@/lib/setlist-ops-client/freshness"
import { ROW_FIELDS } from "@/lib/setlist-ops-client/fields"
import { isOwnRow, recentlyWrittenByOps } from "@/lib/setlist-ops-client/server-cache"

const NONE: ReadonlySet<string> = new Set()

/** How long a changed row stays highlighted. */
export const CHANGED_HIGHLIGHT_MS = 2000
/** After the first live snapshot lands the cache is still catching up for a moment. */
export const CHANGED_HIGHLIGHT_ARM_DELAY_MS = 1000

type Row = { id?: string } & Record<string, unknown>

/** What a person can see change on a row: its content fields, not `version` or `order`. */
export function contentSignature(r: Row): string {
    return JSON.stringify(ROW_FIELDS.map((f) => r[f] ?? null))
}

const ownOrJustWritten = (id: string) => isOwnRow(id) || recentlyWrittenByOps(id)

/**
 * Rows whose visible content differs from `prev`. A row that is new, only
 * moved or only had its version bumped is not a content change; a row this
 * device changed itself (`isLocal`) is the author's own edit.
 */
export function changedRowIds(
    prev: ReadonlyMap<string, string>,
    rows: readonly Row[],
    isLocal: (id: string) => boolean = ownOrJustWritten,
): string[] {
    const out: string[] = []
    for (const r of rows) {
        if (!r.id) continue
        const before = prev.get(r.id)
        if (before === undefined) continue
        if (before !== contentSignature(r) && !isLocal(r.id)) out.push(r.id)
    }
    return out
}

/**
 * Remote-change highlight: a row another device just changed is outlined for
 * about two seconds. Off unless `enabled` (Perform: leaders only). Armed only
 * after the first LIVE (non-cache) rows snapshot of this setlist has been
 * applied, and never during the quiet window after an SSR seed or a heal
 * refetch: those are the cache catching up, not news. The outline is static.
 */
export function useChangedRowHighlight(
    setlistId: string,
    rows: readonly Row[],
    enabled: boolean,
): ReadonlySet<string> {
    const live = useLiveFlags((s) => Boolean(s.rows[setlistId]))
    const prevRef = useRef<Map<string, string> | null>(null)
    const armedAtRef = useRef<number | null>(null)
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const [highlighted, setHighlighted] = useState<ReadonlySet<string>>(NONE)

    useEffect(
        () => () => {
            if (timerRef.current) clearTimeout(timerRef.current)
        },
        [],
    )

    useEffect(() => {
        const prev = prevRef.current
        const next = new Map<string, string>()
        for (const r of rows) if (r.id) next.set(r.id, contentSignature(r))
        prevRef.current = next
        if (!live) return
        if (armedAtRef.current === null) armedAtRef.current = Date.now()
        if (!enabled || !prev) return
        if (Date.now() - armedAtRef.current < CHANGED_HIGHLIGHT_ARM_DELAY_MS) return
        if (isQuiet(setlistId)) return
        const changed = changedRowIds(prev, rows)
        if (changed.length === 0) return
        setHighlighted(new Set(changed))
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => {
            timerRef.current = null
            setHighlighted(NONE)
        }, CHANGED_HIGHLIGHT_MS)
    }, [rows, enabled, live, setlistId])

    return enabled ? highlighted : NONE
}
