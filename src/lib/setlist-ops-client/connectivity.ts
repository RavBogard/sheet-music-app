/**
 * Can this device reach the ops endpoint? Offline when the browser says so,
 * or when the last send failed on the network (a captive portal, a dead
 * venue Wi-Fi) until a send succeeds again. D2(a): structural edits (add,
 * move, remove) need a connection; field edits queue and rebase.
 */
import { create } from 'zustand'

interface ConnectivityState {
    browserOnline: boolean
    /** ms of the first failed send in the current run of failures. */
    unreachableSince: number | null
    /** ms the device went offline (browser or unreachable). */
    offlineSince: number | null
    _set: (next: Partial<Omit<ConnectivityState, '_set'>>) => void
}

const initialOnline = typeof navigator === 'undefined' ? true : navigator.onLine !== false

export const useConnectivity = create<ConnectivityState>((set) => ({
    browserOnline: initialOnline,
    unreachableSince: null,
    offlineSince: initialOnline ? null : Date.now(),
    _set: (next) => set(next),
}))

export function isOnline(s: Pick<ConnectivityState, 'browserOnline' | 'unreachableSince'> = useConnectivity.getState()): boolean {
    return s.browserOnline && s.unreachableSince === null
}

function recompute(next: Partial<ConnectivityState>): void {
    const cur = useConnectivity.getState()
    const merged = { ...cur, ...next }
    const online = isOnline(merged)
    useConnectivity.getState()._set({
        ...next,
        offlineSince: online ? null : (cur.offlineSince ?? Date.now()),
    })
}

/**
 * D2(a): may the author add, move or remove rows now? Only the browser's own
 * offline signal blocks them. A server that is briefly unreachable while the
 * browser is online does not: those batches wait in the queue and rebase on
 * their anchors when they land, and blocking on one failed send would lock
 * the editor until the next backoff probe.
 */
export function canEditStructure(s: Pick<ConnectivityState, 'browserOnline'> = useConnectivity.getState()): boolean {
    return s.browserOnline
}

export function noteSendFailedOnNetwork(now = Date.now()): void {
    if (useConnectivity.getState().unreachableSince !== null) return
    recompute({ unreachableSince: now })
}

export function noteSendReachedServer(): void {
    if (useConnectivity.getState().unreachableSince === null) return
    recompute({ unreachableSince: null })
}

let installed = false
/** Listen to the browser's online/offline events. Idempotent. */
export function installConnectivityListeners(onOnline: () => void): void {
    if (installed || typeof window === 'undefined') return
    installed = true
    window.addEventListener('online', () => {
        recompute({ browserOnline: true, unreachableSince: null })
        onOnline()
    })
    window.addEventListener('offline', () => recompute({ browserOnline: false }))
}

/** Test helper. */
export function _setConnectivityForTests(online: boolean): void {
    useConnectivity.getState()._set({
        browserOnline: online,
        unreachableSince: null,
        offlineSince: online ? null : Date.now(),
    })
}
