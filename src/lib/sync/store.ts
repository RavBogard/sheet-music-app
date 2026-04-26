// Zustand store exposing the sync engine's state to React consumers.
// v50-05 wires this into the new spreadsheet editor's sync indicator.

import { create } from 'zustand'

import type { SyncEngine } from './engine'
import type { SyncState } from './state-machine'

interface SyncStatusStore {
    state: SyncState
    queued: number
    lastError?: string
    lastSyncAt?: number
    _set: (next: Partial<Omit<SyncStatusStore, '_set'>>) => void
}

export const useSyncStatus = create<SyncStatusStore>((set) => ({
    state: 'idle',
    queued: 0,
    _set: (next) => set(next),
}))

export function wireSyncEngineToStore(engine: SyncEngine): () => void {
    let cancelled = false
    const handler = (state: SyncState, queued: number, lastError?: string) => {
        if (cancelled) return
        useSyncStatus.getState()._set({
            state,
            queued,
            lastError,
            lastSyncAt: state === 'idle' ? Date.now() : undefined,
        })
    }
    // Engine's onStateChange is set at construction; this helper exists for
    // callers that constructed the engine without one and want to attach later.
    // We mutate the field via a typed window into the engine; safer than
    // requiring re-construction.
    ;(engine as unknown as { onStateChange?: typeof handler }).onStateChange =
        handler

    return () => {
        cancelled = true
        ;(engine as unknown as { onStateChange?: undefined }).onStateChange =
            undefined
    }
}
