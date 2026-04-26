// Pure-functional FSM for the local-first sync engine.
// Bound by ARCHITECTURE.md §3 (state machine, retry policy, multi-state precedence).

import type { OutboxRow } from '../local/types'

export type SyncState =
    | 'idle'
    | 'dirty'
    | 'saving'
    | 'conflict'
    | 'failed'
    | 'offline'

export type SyncEvent =
    | { type: 'EDIT_COMMITTED' }
    | { type: 'DRAIN_STARTED' }
    | { type: 'DRAIN_OK' }
    | { type: 'DRAIN_VERSION_MISMATCH' }
    | { type: 'DRAIN_RETRY_PENDING' }
    | { type: 'DRAIN_BUDGET_EXHAUSTED' }
    | { type: 'DRAIN_AUTH_FAILED' }
    | { type: 'NETWORK_OFFLINE' }
    | { type: 'NETWORK_ONLINE' }
    | { type: 'CONFLICT_RESOLVED' }

// Pure transition. Side effects live in the engine.
export function transition(state: SyncState, event: SyncEvent): SyncState {
    // Network offline is sticky regardless of current state.
    if (event.type === 'NETWORK_OFFLINE') return 'offline'

    if (state === 'offline') {
        if (event.type === 'NETWORK_ONLINE') return 'dirty'
        return 'offline'
    }

    switch (event.type) {
        case 'EDIT_COMMITTED':
            // Failed/Conflict take precedence — outstanding errors must be
            // visible until the user resolves them.
            if (state === 'failed' || state === 'conflict') return state
            return 'dirty'

        case 'DRAIN_STARTED':
            return 'saving'

        case 'DRAIN_OK':
            return 'idle'

        case 'DRAIN_VERSION_MISMATCH':
            return 'conflict'

        case 'DRAIN_RETRY_PENDING':
            // Mid-flight retry: stay in saving so the indicator stays loud.
            return 'saving'

        case 'DRAIN_BUDGET_EXHAUSTED':
        case 'DRAIN_AUTH_FAILED':
            return 'failed'

        case 'CONFLICT_RESOLVED':
            return 'dirty'

        case 'NETWORK_ONLINE':
            // Already online — recompute on next pump from outbox shape.
            return state

        default:
            return state
    }
}

// Recover state after a process restart by inspecting the outbox.
// Multi-state precedence per ARCHITECTURE.md §3.1: failed > conflict > pending > idle.
export function deriveStateFromOutbox(rows: OutboxRow[]): SyncState {
    if (rows.length === 0) return 'idle'

    let hasFailed = false
    let hasPending = false
    let hasSending = false
    for (const r of rows) {
        if (r.status === 'failed') hasFailed = true
        else if (r.status === 'sending') hasSending = true
        else if (r.status === 'pending') hasPending = true
    }

    if (hasFailed) return 'failed'
    if (hasSending) return 'saving'
    if (hasPending) return 'dirty'
    return 'idle'
}
