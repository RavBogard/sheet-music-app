/**
 * Freshness of ONE setlist, for the editor's save indicator: current,
 * saving(n), refused(list) or offline-since. It is computed from that
 * setlist's intents only, so a refused row in another setlist, or a stuck
 * write in another collection, can never pin this setlist on "saving".
 */
import { create } from 'zustand'

import type { SetlistIntent } from '@/lib/local/types'

export type FreshnessState = 'current' | 'saving' | 'refused' | 'offline'

export interface RefusedItem {
    localId: number
    kind: string
    label?: string
    reason: string
    field?: string
    message?: string
    /** "Try again" makes sense (a field conflict, or a whole-batch refusal that may pass now). */
    canRetry: boolean
}

export interface Freshness {
    state: FreshnessState
    /** Intents not yet answered (pending or in flight). */
    saving: number
    refused: RefusedItem[]
    /** ms the device went offline; null when online. */
    offlineSince: number | null
    /** Structural edits (add, move, remove) are allowed. D2(a). */
    canEditStructure: boolean
}

export function computeFreshness(
    intents: readonly SetlistIntent[],
    conn: { online: boolean; offlineSince: number | null; browserOnline?: boolean },
): Freshness {
    const saving = intents.filter((i) => i.status === 'pending' || i.status === 'sending').length
    const refused: RefusedItem[] = intents
        .filter((i) => i.status === 'refused' && i.localId !== undefined)
        .sort((a, b) => (a.localId ?? 0) - (b.localId ?? 0))
        .map((i) => {
            const reason = i.refusal?.reason ?? 'conflict'
            return {
                localId: i.localId!,
                kind: i.op.kind,
                ...(i.label ? { label: i.label } : {}),
                reason,
                ...(i.refusal?.field ? { field: i.refusal.field } : {}),
                ...(i.refusal?.message ? { message: i.refusal.message } : {}),
                // A row that is gone, or a request the server judged malformed,
                // will not pass by sending it again.
                canRetry: reason !== 'row-gone' && reason !== 'invalid' && reason !== 'too-large',
            }
        })
    const state: FreshnessState =
        refused.length > 0 ? 'refused' : !conn.online ? 'offline' : saving > 0 ? 'saving' : 'current'
    return {
        state,
        saving,
        refused,
        offlineSince: conn.online ? null : conn.offlineSince,
        canEditStructure: conn.browserOnline ?? conn.online,
    }
}

/** Setlists whose rows / doc arrived from a live (non-cache) snapshot this session. */
interface LiveFlags {
    rows: Record<string, true>
    setlist: Record<string, true>
    mark: (kind: 'rows' | 'setlist', setlistId: string) => void
}

export const useLiveFlags = create<LiveFlags>((set) => ({
    rows: {},
    setlist: {},
    mark: (kind, setlistId) =>
        set((s) => (s[kind][setlistId] ? s : { ...s, [kind]: { ...s[kind], [setlistId]: true } })),
}))

/** When each setlist's rows last arrived from a live (non-cache) snapshot, ms. */
const liveRowsAt = new Map<string, number>()
export const lastLiveRowsAt = (setlistId: string): number => liveRowsAt.get(setlistId) ?? 0
export const _resetLiveRowsAt = (): void => liveRowsAt.clear()

export function markLive(kind: 'rows' | 'setlist', setlistId: string): void {
    if (kind === 'rows') liveRowsAt.set(setlistId, Date.now())
    useLiveFlags.getState().mark(kind, setlistId)
}
