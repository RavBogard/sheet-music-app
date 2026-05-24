/**
 * F1 (offline-precache) — SaveOfflineButton unit coverage.
 *
 * Acceptance the prompt names directly:
 *   - "Opening a setlist in Perform triggers idle precache of all bonded PDFs
 *      ... a test asserts the call fires with the setlist's fileIds."
 *   - "Save offline CTA force-caches with progress/done."
 *
 * Both `@/lib/prefetch` and `@/lib/offline-idb` are mocked so the test asserts
 * the wiring (which fileIds flow into prefetchSetlistPDFs, and how the button
 * state machine reacts) without touching IndexedDB or the network.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react'

const mockPrefetch = vi.fn<(ids: string[], onProgress?: (n: number) => void) => Promise<number>>()
const mockListFileIds = vi.fn<() => Promise<string[]>>()

vi.mock('@/lib/prefetch', () => ({
    prefetchSetlistPDFs: (ids: string[], onProgress?: (n: number) => void) => mockPrefetch(ids, onProgress),
}))
vi.mock('@/lib/offline-idb', () => ({
    listFileIds: () => mockListFileIds(),
}))

import { SaveOfflineButton } from '@/components/performance/SaveOfflineButton'

/** requestIdleCallback that runs its callback synchronously (idle path = immediate). */
function stubSyncIdle() {
    vi.stubGlobal('requestIdleCallback', (cb: IdleRequestCallback) => {
        cb({ didTimeout: false, timeRemaining: () => 0 } as IdleDeadline)
        return 1
    })
    vi.stubGlobal('cancelIdleCallback', () => {})
}
/** requestIdleCallback that never fires — isolates the explicit-click path. */
function stubNoopIdle() {
    vi.stubGlobal('requestIdleCallback', () => 1)
    vi.stubGlobal('cancelIdleCallback', () => {})
}

function setOnline(value: boolean) {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value })
}

describe('SaveOfflineButton', () => {
    beforeEach(() => {
        mockPrefetch.mockReset().mockResolvedValue(0)
        mockListFileIds.mockReset().mockResolvedValue([])
        setOnline(true)
    })

    afterEach(() => {
        cleanup()
        vi.unstubAllGlobals()
    })

    it('idle auto-precache fires prefetchSetlistPDFs with the setlist fileIds', async () => {
        stubSyncIdle()
        render(<SaveOfflineButton fileIds={['upload-1', 'upload-2', 'upload-3']} />)
        await waitFor(() => expect(mockPrefetch).toHaveBeenCalled())
        expect(mockPrefetch.mock.calls[0][0]).toEqual(['upload-1', 'upload-2', 'upload-3'])
    })

    it('dedupes and drops flow-/empty ids before precaching', async () => {
        stubSyncIdle()
        render(<SaveOfflineButton fileIds={['upload-1', 'upload-1', 'flow-x', '', 'upload-2']} />)
        await waitFor(() => expect(mockPrefetch).toHaveBeenCalled())
        expect(mockPrefetch.mock.calls[0][0]).toEqual(['upload-1', 'upload-2'])
    })

    it('renders nothing and never precaches when there are no cacheable charts', async () => {
        stubSyncIdle()
        const { container } = render(<SaveOfflineButton fileIds={[]} />)
        expect(container.firstChild).toBeNull()
        await act(async () => {})
        expect(mockPrefetch).not.toHaveBeenCalled()
    })

    it('skips idle auto-precache while offline (cannot fetch)', async () => {
        stubSyncIdle()
        setOnline(false)
        render(<SaveOfflineButton fileIds={['upload-1']} />)
        await act(async () => {})
        expect(mockPrefetch).not.toHaveBeenCalled()
    })

    it('Save offline CTA: idle → saving (disabled, live N/M) → saved', async () => {
        stubNoopIdle() // idle precache scheduled but never fires; isolate the click
        let cached: string[] = []
        mockListFileIds.mockImplementation(async () => cached)

        let resolvePrefetch: (n: number) => void = () => {}
        let onProgressCb: ((n: number) => void) | undefined
        mockPrefetch.mockImplementation((ids, onProgress) => {
            onProgressCb = onProgress
            return new Promise<number>((resolve) => {
                resolvePrefetch = (n: number) => {
                    cached = [...ids]
                    resolve(n)
                }
            })
        })

        render(<SaveOfflineButton fileIds={['upload-1', 'upload-2']} />)
        const btn = () => screen.getByTestId('save-offline')
        await waitFor(() => expect(btn().getAttribute('data-state')).toBe('idle'))
        expect(btn().textContent).toContain('Save offline')

        fireEvent.click(btn())

        await waitFor(() => expect(btn().getAttribute('data-state')).toBe('saving'))
        expect((btn() as HTMLButtonElement).disabled).toBe(true)
        expect(mockPrefetch).toHaveBeenCalledWith(['upload-1', 'upload-2'], expect.any(Function))

        // Live progress tick surfaces N/M.
        act(() => onProgressCb?.(1))
        await waitFor(() => expect(btn().textContent).toContain('Saving 1/2'))

        // Completion flips to the persistent done state.
        await act(async () => {
            resolvePrefetch(2)
        })
        await waitFor(() => expect(btn().getAttribute('data-state')).toBe('saved'))
        expect(btn().textContent).toContain('Saved')
        expect((btn() as HTMLButtonElement).disabled).toBe(false)
    })

    it('shows the partial (amber) state when some but not all charts are cached', async () => {
        stubNoopIdle()
        mockListFileIds.mockResolvedValue(['upload-1']) // 1 of 2 already cached
        render(<SaveOfflineButton fileIds={['upload-1', 'upload-2']} />)
        const btn = () => screen.getByTestId('save-offline')
        await waitFor(() => expect(btn().getAttribute('data-state')).toBe('partial'))
        expect(btn().textContent).toContain('Save 1/2')
    })

    /**
     * ipad-idle-auto-precache-fix REGRESSION.
     *
     * Reproduces the iPad-WebKit F-4 symptom (FINDINGS: probe 1 stuck at
     * `data-state="idle"` for 23s; probe 2 manual-tap path works).
     *
     * Mechanism: in the previous implementation the auto-precache useEffect
     *   1. checked `idleKickedRef.current === sig` and returned early if matched
     *   2. set `idleKickedRef.current = sig`
     *   3. scheduled `requestIdleCallback(run, {timeout: 3000})` and stashed
     *      the handle into the cleanup closure
     *
     * The parent (SetlistPerformClient) re-renders the moment Dexie's live-
     * query delivers its first frame for the setlist's tracks. `cacheable`
     * is `useMemo(... [fileIds])`, and `fileIds` is a NEW array reference on
     * every parent render — so `cacheable` and `recount` (`useCallback`d on
     * `cacheable`) are both new identities → the effect re-runs.
     *
     * On the re-run:
     *   - cleanup of the prior effect fires `cancelIdleCallback(handle)`
     *   - the new effect sees `idleKickedRef.current === sig` and RETURNS
     *     EARLY without re-scheduling
     *   - result: the rIC was cancelled and never re-scheduled → `run()` (and
     *     therefore `prefetchSetlistPDFs`) is never invoked → `recount`'s
     *     post-prefetch path never updates `readyCount` → `data-state`
     *     remains `"idle"` until a manual tap.
     *
     * Reproduced here by stubbing rIC so the callback NEVER fires (mirrors
     * iOS WebKit / Playwright WebKit's real async-schedule behaviour), then
     * re-rendering with a NEW-reference-same-content fileIds array (the
     * Dexie live-query shape). After the fix, the latest rIC must still be
     * pending — i.e. the schedule must have been re-issued on the re-render.
     */
    it('re-render with new fileIds reference re-schedules the idle kick (F-4)', async () => {
        const scheduled: IdleRequestCallback[] = []
        const cancelled: number[] = []
        let nextHandle = 1
        vi.stubGlobal('requestIdleCallback', (cb: IdleRequestCallback) => {
            scheduled.push(cb)
            return nextHandle++
        })
        vi.stubGlobal('cancelIdleCallback', (h: number) => {
            cancelled.push(h)
        })

        const ids1 = ['upload-1', 'upload-2']
        const { rerender } = render(<SaveOfflineButton fileIds={ids1} />)
        await waitFor(() => expect(scheduled.length).toBe(1))

        // Parent re-renders with a NEW array reference but same content
        // (the Dexie liveQuery shape on first delivery of an SSR-seeded set).
        rerender(<SaveOfflineButton fileIds={[...ids1]} />)

        // The previous rIC handle was cancelled by cleanup — expected.
        expect(cancelled).toContain(1)

        // CRITICAL: after the re-render, the precache must still have a
        // PENDING rIC. Pre-fix this assertion fails: only `scheduled.length === 1`
        // (the original handle 1, now cancelled), so nothing will ever fire.
        expect(
            scheduled.length,
            'idle auto-precache must re-schedule after a same-content re-render (else iPad-WebKit F-4)',
        ).toBeGreaterThan(1)

        // Fire the latest still-pending rIC and confirm prefetch lands.
        await act(async () => {
            scheduled[scheduled.length - 1]({
                didTimeout: false,
                timeRemaining: () => 0,
            } as IdleDeadline)
        })
        await waitFor(() => expect(mockPrefetch).toHaveBeenCalled())
        expect(mockPrefetch.mock.calls[0][0]).toEqual(ids1)
    })

    /**
     * Sibling case — same root cause, setTimeout fallback path (rIC absent).
     * iOS Safari < 17.4 (and any WebKit build without requestIdleCallback)
     * runs the 2000ms setTimeout fallback; the same cancel-on-re-render race
     * applies. Asserts the fix re-schedules the fallback too.
     *
     * Implementation note: we intercept the native `setTimeout` directly
     * rather than `vi.useFakeTimers`, which interacts badly with @testing-
     * library's render / waitFor (those rely on real microtask + timer
     * scheduling). Recording calls lets us assert the cancel-then-re-schedule
     * shape deterministically without touching the global clock.
     */
    it('re-render re-schedules the setTimeout fallback when rIC is absent (F-4 fallback)', async () => {
        // Strip rIC entirely so the setTimeout fallback path is exercised.
        vi.stubGlobal('requestIdleCallback', undefined)
        vi.stubGlobal('cancelIdleCallback', undefined)

        const realSetTimeout = globalThis.setTimeout
        const realClearTimeout = globalThis.clearTimeout
        const scheduled2s: { id: number; cb: () => void }[] = []
        const cleared: number[] = []
        let nextTimerId = 1_000_000

        const fakeSetTimeout = ((cb: (...args: unknown[]) => void, ms?: number, ...args: unknown[]) => {
            // Only intercept the SaveOfflineButton's 2s schedule; let
            // React / @testing-library's own microtask + timer hops use the
            // real clock.
            if (ms === 2000) {
                const id = nextTimerId++
                scheduled2s.push({ id, cb: () => cb(...args) })
                return id as unknown as ReturnType<typeof setTimeout>
            }
            return realSetTimeout(cb, ms, ...args)
        }) as typeof setTimeout
        const fakeClearTimeout = ((id: number) => {
            if (id >= 1_000_000) {
                cleared.push(id)
                return
            }
            realClearTimeout(id as unknown as Parameters<typeof clearTimeout>[0])
        }) as typeof clearTimeout
        vi.stubGlobal('setTimeout', fakeSetTimeout)
        vi.stubGlobal('clearTimeout', fakeClearTimeout)

        try {
            const ids = ['upload-x']
            const { rerender } = render(<SaveOfflineButton fileIds={ids} />)
            // First effect scheduled a 2s setTimeout via the fallback branch.
            expect(scheduled2s.length).toBe(1)
            const firstId = scheduled2s[0].id

            // Parent re-renders with a new array reference, same content.
            rerender(<SaveOfflineButton fileIds={[...ids]} />)

            // Cleanup cleared the first fallback timer — expected.
            expect(cleared).toContain(firstId)

            // CRITICAL: a fresh 2s timer must be pending after the re-render.
            // Pre-fix this fails (scheduled2s.length stays 1, both cancelled
            // and unreplaced); post-fix it is 2 with the latest one still
            // alive (not in `cleared`).
            expect(
                scheduled2s.length,
                'setTimeout fallback must be re-scheduled after a same-content re-render',
            ).toBeGreaterThan(1)
            const latest = scheduled2s[scheduled2s.length - 1]
            expect(cleared).not.toContain(latest.id)

            // Fire the latest still-pending timer and confirm prefetch lands.
            await act(async () => {
                latest.cb()
            })
            await waitFor(() => expect(mockPrefetch).toHaveBeenCalled())
            expect(mockPrefetch.mock.calls[0][0]).toEqual(ids)
        } finally {
            // Globals restored by afterEach via vi.unstubAllGlobals().
        }
    })
})
