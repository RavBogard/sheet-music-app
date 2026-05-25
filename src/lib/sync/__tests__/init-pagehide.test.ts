import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { _resetPagehideHookForTests, installPagehideDrainHook } from '../init'
import { useSyncStatus } from '../store'

/**
 * v60-02 (2026-05-12) — exercises the pagehide → whenEngineIdle(2000)
 * drain coordinator. We test the standalone `installPagehideDrainHook`
 * helper (exported for testability) so the assertions don't require
 * mocking firebase/Dexie to boot the full engine.
 *
 * 2026-05-25 — restructured for parallel-load resilience
 * (`init-pagehide-listener-race-fix`, 5th instance of
 * `[[feedback_parallel_load_flake_baseline]]`):
 *
 *  - Static top-level import of `../init` + `../store` (was per-test
 *    `await import(...)` inside `vi.resetModules()`-rebooted module
 *    graphs). Removes the vite-transform pressure that the original
 *    flake-research lane (.paul/research/parallel-load-flakes/FINDINGS.md
 *    §3.5) named as the root cause.
 *  - Explicit `_resetPagehideHookForTests()` between tests replaces the
 *    `vi.resetModules()` reset path. Under suite-wide parallel load the
 *    resetModules timing slipped enough that the next test's import
 *    occasionally returned the cached module (flag stuck at `true` from
 *    a prior test), producing a delta of 0 instead of 1.
 *
 * The leaked listeners from prior tests stay attached to `window` for the
 * lifetime of this file (we don't remove them — production never has
 * cause to either), but each test's assertion is a DELTA on a freshly-
 * created spy so accumulation is invisible to the assertions.
 */
describe('installPagehideDrainHook', () => {
    let addSpy: ReturnType<typeof vi.spyOn> | null = null

    beforeEach(() => {
        _resetPagehideHookForTests()
        addSpy = vi.spyOn(window, 'addEventListener')
    })

    afterEach(() => {
        addSpy?.mockRestore()
        addSpy = null
        // Re-seed the sync store back to idle so other suites that read
        // it post-this-file aren't affected.
        useSyncStatus.setState({
            state: 'idle',
            queued: 0,
            lastError: undefined,
            lastSyncAt: undefined,
        })
    })

    it('registers exactly one pagehide listener on window', () => {
        // Snapshot pre-install pagehide calls (any module-level listeners
        // installed by other code) so we measure ONLY the delta produced
        // by installPagehideDrainHook itself.
        const preCount = addSpy!.mock.calls.filter(
            (c) => c[0] === 'pagehide',
        ).length

        installPagehideDrainHook()

        const postCount = addSpy!.mock.calls.filter(
            (c) => c[0] === 'pagehide',
        ).length

        expect(postCount - preCount).toBe(1)
        const last = addSpy!.mock.calls[addSpy!.mock.calls.length - 1]
        expect(last[0]).toBe('pagehide')
        expect(typeof last[1]).toBe('function')
    })

    it('is idempotent — repeated calls do NOT re-register', () => {
        const preCount = addSpy!.mock.calls.filter(
            (c) => c[0] === 'pagehide',
        ).length

        installPagehideDrainHook()
        installPagehideDrainHook()
        installPagehideDrainHook()

        const postCount = addSpy!.mock.calls.filter(
            (c) => c[0] === 'pagehide',
        ).length

        expect(postCount - preCount).toBe(1)
    })

    it('dispatching pagehide invokes the engine-idle subscription path', async () => {
        // Force engine to non-idle so whenEngineIdle takes the
        // subscribe-and-wait branch (instead of resolving synchronously).
        useSyncStatus.setState({ state: 'saving', queued: 2 })
        const subscribeSpy = vi.spyOn(useSyncStatus, 'subscribe')

        installPagehideDrainHook()

        window.dispatchEvent(new Event('pagehide'))

        // whenEngineIdle dynamically imports './store' inside a Promise —
        // give the import + subscribe chain a real macrotask to settle.
        await new Promise((r) => setTimeout(r, 50))

        expect(subscribeSpy).toHaveBeenCalled()
        subscribeSpy.mockRestore()
    })

    it('init.ts source pins the pagehide timeout at 2000ms', async () => {
        // Static assertion: the engine-drain budget is a load-bearing
        // contract (iOS Safari grants ~5s before suspension; 2s is the
        // designed headroom). Read the source to lock the literal so a
        // careless refactor can't silently widen or shrink the window.
        const fs = await import('node:fs/promises')
        const path = await import('node:path')
        const src = await fs.readFile(
            path.resolve(process.cwd(), 'src/lib/sync/init.ts'),
            'utf8',
        )
        expect(src).toMatch(/whenEngineIdle\(2000\)/)
    })

    it('dispatching pagehide does not throw when engine is already idle', () => {
        useSyncStatus.setState({ state: 'idle', queued: 0 })

        installPagehideDrainHook()

        expect(() => window.dispatchEvent(new Event('pagehide'))).not.toThrow()
    })
})
