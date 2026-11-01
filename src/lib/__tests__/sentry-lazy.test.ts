/**
 * Perf audit P2-6: the browser Sentry client loads on demand and starts once.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const startSentryBrowser = vi.fn(() => true)
const captureException = vi.fn()
vi.mock("@/lib/sentry-browser", () => ({ startSentryBrowser, captureException, captureMessage: vi.fn() }))

beforeEach(() => {
    vi.resetModules()
    startSentryBrowser.mockClear()
})
afterEach(() => {
    vi.unstubAllEnvs()
})

describe("loadSentryBrowser", () => {
    it("is null without a DSN (nothing is fetched)", async () => {
        vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "")
        const { loadSentryBrowser } = await import("@/lib/sentry-lazy")
        expect(loadSentryBrowser()).toBeNull()
        expect(startSentryBrowser).not.toHaveBeenCalled()
    })

    it("loads and starts the client once, however many callers", async () => {
        vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://k@o0.ingest.sentry.io/1")
        const { loadSentryBrowser } = await import("@/lib/sentry-lazy")
        const [a, b] = await Promise.all([loadSentryBrowser(), loadSentryBrowser()])
        expect(a).toBe(b)
        expect(startSentryBrowser).toHaveBeenCalledTimes(1)
        a!.captureException(new Error("x"))
        expect(captureException).toHaveBeenCalled()
    })
})
