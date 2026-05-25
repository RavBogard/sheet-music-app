/**
 * F1 (perform-entry-precache) — unit coverage for `usePerformEntryPrecache`.
 *
 * Acceptance the dispatch names directly:
 *   - mount-time pre-cache fires + calls with right fileIds
 *   - idempotency with rIC (same-sig re-render doesn't double-fetch)
 *   - failure swallowing (thrown error inside entry-precache doesn't propagate)
 *   - `data-state` reflection: the hook dispatches `PERFORM_PRECACHE_DONE_EVENT`
 *     on settle so `SaveOfflineButton` can recount
 *
 * `@/lib/prefetch` is mocked so we assert the wiring without IDB / network.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, act, waitFor } from "@testing-library/react"

const mockPrefetch = vi.fn<(ids: string[]) => Promise<number>>()

vi.mock("@/lib/prefetch", () => ({
    prefetchSetlistPDFs: (ids: string[]) => mockPrefetch(ids),
}))

import {
    usePerformEntryPrecache,
    PERFORM_PRECACHE_DONE_EVENT,
} from "@/hooks/use-perform-entry-precache"

function setOnline(value: boolean) {
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value })
}

describe("usePerformEntryPrecache", () => {
    beforeEach(() => {
        mockPrefetch.mockReset().mockResolvedValue(0)
        setOnline(true)
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it("fires prefetchSetlistPDFs on mount with the bonded fileIds", async () => {
        renderHook(() => usePerformEntryPrecache(["upload-1", "upload-2", "upload-3"]))
        await waitFor(() => expect(mockPrefetch).toHaveBeenCalledTimes(1))
        expect(mockPrefetch.mock.calls[0][0]).toEqual(["upload-1", "upload-2", "upload-3"])
    })

    it("drops flow-/empty ids before precaching (mirrors SaveOfflineButton's cacheable guard)", async () => {
        renderHook(() =>
            usePerformEntryPrecache(["upload-1", "flow-x", "", "upload-2"]),
        )
        await waitFor(() => expect(mockPrefetch).toHaveBeenCalledTimes(1))
        expect(mockPrefetch.mock.calls[0][0]).toEqual(["upload-1", "upload-2"])
    })

    it("never precaches when there are no cacheable charts", async () => {
        renderHook(() => usePerformEntryPrecache([]))
        // Allow any pending microtask to drain.
        await act(async () => {})
        expect(mockPrefetch).not.toHaveBeenCalled()
    })

    it("skips when offline (cannot fetch — rIC path also short-circuits here)", async () => {
        setOnline(false)
        renderHook(() => usePerformEntryPrecache(["upload-1"]))
        await act(async () => {})
        expect(mockPrefetch).not.toHaveBeenCalled()
    })

    it("idempotent with rIC: same-content re-render does NOT re-fire the precache", async () => {
        const ids = ["upload-1", "upload-2"]
        const { rerender } = renderHook(({ v }: { v: string[] }) => usePerformEntryPrecache(v), {
            initialProps: { v: ids },
        })
        await waitFor(() => expect(mockPrefetch).toHaveBeenCalledTimes(1))

        // Parent re-renders with a NEW reference, same content (Dexie liveQuery shape).
        rerender({ v: [...ids] })
        await act(async () => {})
        // Still ONE call — the sig guard short-circuits on identical content.
        expect(mockPrefetch).toHaveBeenCalledTimes(1)
    })

    it("re-fires when fileIds CONTENT changes (e.g. setlist mutation adds a track)", async () => {
        const { rerender } = renderHook(({ v }: { v: string[] }) => usePerformEntryPrecache(v), {
            initialProps: { v: ["upload-1"] },
        })
        await waitFor(() => expect(mockPrefetch).toHaveBeenCalledTimes(1))
        expect(mockPrefetch.mock.calls[0][0]).toEqual(["upload-1"])

        rerender({ v: ["upload-1", "upload-2"] })
        await waitFor(() => expect(mockPrefetch).toHaveBeenCalledTimes(2))
        expect(mockPrefetch.mock.calls[1][0]).toEqual(["upload-1", "upload-2"])
    })

    it("swallows prefetch failures (best-effort — no error to React boundary)", async () => {
        mockPrefetch.mockRejectedValueOnce(new Error("offline / 404 / IDB write"))
        // If the hook re-throws, renderHook will surface it via console.error +
        // the test will fail. We assert by verifying we got here without throw
        // AND the done-event still fired on the catch tail.
        const seen: Event[] = []
        const onDone = (e: Event) => seen.push(e)
        window.addEventListener(PERFORM_PRECACHE_DONE_EVENT, onDone)
        try {
            renderHook(() => usePerformEntryPrecache(["upload-bad"]))
            await waitFor(() => expect(mockPrefetch).toHaveBeenCalled())
            // .finally still fires even on rejection.
            await waitFor(() => expect(seen.length).toBe(1))
        } finally {
            window.removeEventListener(PERFORM_PRECACHE_DONE_EVENT, onDone)
        }
    })

    it("dispatches PERFORM_PRECACHE_DONE_EVENT on settle so SaveOfflineButton can recount", async () => {
        const seen: Event[] = []
        const onDone = (e: Event) => seen.push(e)
        window.addEventListener(PERFORM_PRECACHE_DONE_EVENT, onDone)
        try {
            renderHook(() => usePerformEntryPrecache(["upload-1"]))
            await waitFor(() => expect(mockPrefetch).toHaveBeenCalledTimes(1))
            await waitFor(() => expect(seen.length).toBe(1))
            expect(seen[0].type).toBe(PERFORM_PRECACHE_DONE_EVENT)
        } finally {
            window.removeEventListener(PERFORM_PRECACHE_DONE_EVENT, onDone)
        }
    })

    it("falls back to setTimeout when queueMicrotask is absent (older env)", async () => {
        vi.stubGlobal("queueMicrotask", undefined)
        renderHook(() => usePerformEntryPrecache(["upload-1"]))
        await waitFor(() => expect(mockPrefetch).toHaveBeenCalledTimes(1))
        expect(mockPrefetch.mock.calls[0][0]).toEqual(["upload-1"])
    })
})
