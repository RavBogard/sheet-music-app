/**
 * Tests for apiFetch — default timeout + abort-signal merging + auth preservation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

type MockUser = { getIdToken: ReturnType<typeof vi.fn> }
const mockCurrentUser: { value: MockUser | null } = { value: null }

vi.mock("@/lib/firebase", () => ({
    auth: {
        get currentUser() { return mockCurrentUser.value },
    },
}))

import { apiFetch } from "@/lib/api-client"

const realFetch = globalThis.fetch

describe("apiFetch", () => {
    let fetchMock: ReturnType<typeof vi.fn>

    beforeEach(() => {
        mockCurrentUser.value = null
        fetchMock = vi.fn()
        globalThis.fetch = fetchMock as unknown as typeof fetch
        vi.useFakeTimers()
    })

    afterEach(() => {
        globalThis.fetch = realFetch
        vi.useRealTimers()
    })

    it("happy path: resolves with fetch response and arms no lingering timer", async () => {
        const resp = new Response("ok", { status: 200 })
        fetchMock.mockResolvedValueOnce(resp)

        const result = await apiFetch("/api/x")

        expect(result).toBe(resp)
        expect(fetchMock).toHaveBeenCalledTimes(1)
        // Advance past default timeout — no abort should fire post-resolution.
        const [, init] = fetchMock.mock.calls[0]
        await vi.advanceTimersByTimeAsync(60_000)
        expect((init.signal as AbortSignal).aborted).toBe(false)
    })

    it("default timeout aborts the underlying fetch after 30s", async () => {
        let capturedSignal: AbortSignal | undefined
        // Realistic mock: reject on abort, mirroring the native fetch contract.
        fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => {
            capturedSignal = init.signal ?? undefined
            return new Promise((_resolve, reject) => {
                capturedSignal!.addEventListener('abort', () => {
                    reject(new DOMException('aborted', 'AbortError'))
                })
            })
        })

        const promise = apiFetch("/api/slow").catch(e => e)

        await vi.advanceTimersByTimeAsync(30_001)
        const result = await promise

        expect(capturedSignal).toBeDefined()
        expect(capturedSignal!.aborted).toBe(true)
        expect((result as Error).name).toBe('AbortError')
    })

    it("timeout: 0 disables the timer", async () => {
        let capturedSignal: AbortSignal | undefined
        fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => {
            capturedSignal = init.signal ?? undefined
            return new Promise(() => { /* pending */ })
        })

        apiFetch("/api/x", { timeout: 0 }).catch(() => { /* ignore */ })
        await vi.advanceTimersByTimeAsync(60_000)

        expect(capturedSignal).toBeDefined()
        expect(capturedSignal!.aborted).toBe(false)
    })

    it("caller-supplied signal triggers the internal abort", async () => {
        const controller = new AbortController()
        let capturedSignal: AbortSignal | undefined
        fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => {
            capturedSignal = init.signal ?? undefined
            return new Promise(() => { /* pending */ })
        })

        apiFetch("/api/x", { signal: controller.signal }).catch(() => { /* ignore */ })

        // Let the async body run up to the fetch call.
        await Promise.resolve()
        expect(capturedSignal).toBeDefined()
        expect(capturedSignal!.aborted).toBe(false)

        controller.abort()
        expect(capturedSignal!.aborted).toBe(true)
    })

    it("preserves Authorization + Content-Type headers for signed-in users", async () => {
        mockCurrentUser.value = { getIdToken: vi.fn().mockResolvedValue("token-xyz") }
        fetchMock.mockResolvedValueOnce(new Response("ok"))

        await apiFetch("/api/x", { method: "POST", body: JSON.stringify({ a: 1 }) })

        const [, init] = fetchMock.mock.calls[0]
        const headers = init.headers as Headers
        expect(headers.get("Authorization")).toBe("Bearer token-xyz")
        expect(headers.get("Content-Type")).toBe("application/json")
    })
})
