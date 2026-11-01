/**
 * Sentry client-side configuration.
 * Activate by setting NEXT_PUBLIC_SENTRY_DSN in your environment.
 *
 * Perf audit P2-6: the SDK is no longer fetched during first load. The old
 * config imported the whole `@sentry/nextjs` namespace (a 378-392 KB chunk,
 * not "~40KB") straight away on every page, inside the Perform warm-up
 * window. Now:
 *
 * - The client is the trimmed `@sentry/browser` build (`src/lib/sentry-browser.ts`).
 * - It starts once the page has loaded and the browser is idle (or after a
 *   few seconds where `requestIdleCallback` is missing, as on iPad Safari).
 * - Errors are not lost meanwhile. Uncaught errors and unhandled rejections
 *   from this point on are kept (up to 20) and sent when the client starts,
 *   and any `reportError`-style capture starts the client at once.
 *   Trade-off: errors before this file runs were never captured, and
 *   handled captures from the sync engine in the first seconds can still be
 *   missed, as they were while the old import was in flight.
 */
import { loadSentryBrowser } from "@/lib/sentry-lazy"

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN
const MAX_EARLY = 20
const FALLBACK_MS = 4000

if (dsn && typeof window !== "undefined") {
    const early: unknown[] = []
    const onError = (e: ErrorEvent) => {
        if (early.length < MAX_EARLY) early.push(e.error ?? e.message)
    }
    const onRejection = (e: PromiseRejectionEvent) => {
        if (early.length < MAX_EARLY) early.push(e.reason)
    }
    window.addEventListener("error", onError)
    window.addEventListener("unhandledrejection", onRejection)

    const start = () => {
        const p = loadSentryBrowser()
        if (!p) return
        void p.then((m) => {
            // The SDK's own global handlers take over from here.
            window.removeEventListener("error", onError)
            window.removeEventListener("unhandledrejection", onRejection)
            for (const err of early.splice(0)) m.captureException(err)
        }).catch(() => {
            // Chunk failed to load (offline): leave the buffer listening.
        })
    }

    const whenIdle = () => {
        if (typeof window.requestIdleCallback === "function") {
            window.requestIdleCallback(start, { timeout: FALLBACK_MS })
        } else {
            setTimeout(start, FALLBACK_MS)
        }
    }

    if (document.readyState === "complete") whenIdle()
    else window.addEventListener("load", whenIdle, { once: true })
}
