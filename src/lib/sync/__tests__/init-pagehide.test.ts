import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * v60-02 (2026-05-12) — exercises the pagehide → whenEngineIdle(2000)
 * drain coordinator. We test the standalone `installPagehideDrainHook`
 * helper (exported for testability) so the assertions don't require
 * mocking firebase/Dexie to boot the full engine.
 *
 * Reset module state between tests via `vi.resetModules()` so the
 * `pagehideHookInstalled` module-level flag resets — otherwise the
 * idempotency test would only assert state inherited from a prior test.
 */
describe('installPagehideDrainHook', () => {
    let addSpy: ReturnType<typeof vi.spyOn> | null = null

    beforeEach(() => {
        vi.resetModules()
        addSpy = vi.spyOn(window, 'addEventListener')
    })

    afterEach(() => {
        addSpy?.mockRestore()
        addSpy = null
        // Re-seed the sync store back to idle so other suites that read
        // it post-this-file aren't affected.
        return import('../store').then(({ useSyncStatus }) => {
            useSyncStatus.setState({
                state: 'idle',
                queued: 0,
                lastError: undefined,
                lastSyncAt: undefined,
            })
        })
    })

    it('registers exactly one pagehide listener on window', async () => {
        const { installPagehideDrainHook } = await import('../init')

        // Snapshot pre-install pagehide calls (any module-level listeners
        // installed during the dynamic import) so we measure ONLY the
        // delta produced by installPagehideDrainHook itself.
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

    it('is idempotent — repeated calls do NOT re-register', async () => {
        const { installPagehideDrainHook } = await import('../init')

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
        const storeMod = await import('../store')
        // Force engine to non-idle so whenEngineIdle takes the
        // subscribe-and-wait branch (instead of resolving synchronously).
        storeMod.useSyncStatus.setState({ state: 'saving', queued: 2 })
        const subscribeSpy = vi.spyOn(storeMod.useSyncStatus, 'subscribe')

        const { installPagehideDrainHook } = await import('../init')
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

    it('dispatching pagehide does not throw when engine is already idle', async () => {
        const { useSyncStatus } = await import('../store')
        useSyncStatus.setState({ state: 'idle', queued: 0 })

        const { installPagehideDrainHook } = await import('../init')
        installPagehideDrainHook()

        expect(() => window.dispatchEvent(new Event('pagehide'))).not.toThrow()
    })
})
