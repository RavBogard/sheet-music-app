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
})
