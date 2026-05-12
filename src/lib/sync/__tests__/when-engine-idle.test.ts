import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useSyncStatus } from '../store'
import { whenEngineIdle } from '../init'

/**
 * T2.4 (2026-05-12) — whenEngineIdle is used by firebase.ts's
 * controllerchange handler to coordinate SW-update reloads with the
 * sync engine's outbox drain. These tests lock the three behaviors:
 *   - synchronously-already-idle → resolves 'idle'
 *   - transition to idle before timeout → resolves 'idle'
 *   - timeout exceeded before idle → resolves 'timeout' (never rejects)
 */
describe('whenEngineIdle', () => {
    beforeEach(() => {
        useSyncStatus.setState({
            state: 'idle',
            queued: 0,
            lastError: undefined,
            lastSyncAt: undefined,
        })
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('resolves "idle" immediately when engine is already idle + drained', async () => {
        const result = await whenEngineIdle(1000)
        expect(result).toBe('idle')
    })

    it('resolves "idle" once state transitions to idle + queued === 0', async () => {
        useSyncStatus.setState({ state: 'saving', queued: 2 })

        const promise = whenEngineIdle(5000)

        // Drop to idle after a microtask — simulates engine drain.
        await Promise.resolve()
        useSyncStatus.setState({ state: 'idle', queued: 0 })

        const result = await promise
        expect(result).toBe('idle')
    })

    it('does NOT resolve "idle" if queued > 0 even when state === idle', async () => {
        // Edge case: state machine might report 'idle' before the queued
        // counter zeros (notify ordering). Wait for both.
        useSyncStatus.setState({ state: 'saving', queued: 2 })

        vi.useFakeTimers()
        const promise = whenEngineIdle(1000)

        // State flips to idle but queued is still > 0 — should NOT resolve.
        useSyncStatus.setState({ state: 'idle', queued: 2 })

        // Advance past timeout.
        await vi.advanceTimersByTimeAsync(1100)

        const result = await promise
        expect(result).toBe('timeout')
    })

    it('resolves "timeout" if the engine never drains', async () => {
        useSyncStatus.setState({ state: 'saving', queued: 3 })

        vi.useFakeTimers()
        const promise = whenEngineIdle(500)
        await vi.advanceTimersByTimeAsync(600)

        const result = await promise
        expect(result).toBe('timeout')
    })

    it('never rejects', async () => {
        // Even with absurd inputs, the function should resolve.
        useSyncStatus.setState({ state: 'failed', queued: 1 })
        vi.useFakeTimers()
        const promise = whenEngineIdle(100)
        await vi.advanceTimersByTimeAsync(200)

        await expect(promise).resolves.toBeDefined()
    })
})
