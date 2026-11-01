/**
 * Load-on-demand access to the browser Sentry client (perf audit P2-6).
 *
 * Tiny on purpose: anything may import it statically. The SDK chunk is fetched
 * the first time something calls `loadSentryBrowser()`: the idle start in
 * `sentry.client.config.ts`, or an error being reported before that.
 */
type SentryBrowser = typeof import("@/lib/sentry-browser")

let loading: Promise<SentryBrowser> | null = null

/** The started client module, or null when there's no DSN or no window. */
export function loadSentryBrowser(): Promise<SentryBrowser> | null {
    if (typeof window === "undefined" || !process.env.NEXT_PUBLIC_SENTRY_DSN) return null
    if (!loading) {
        loading = import("@/lib/sentry-browser").then((m) => {
            m.startSentryBrowser()
            return m
        })
        loading.catch(() => {
            // A failed chunk load (offline) may be retried by the next caller.
            loading = null
        })
    }
    return loading
}
