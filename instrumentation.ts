/**
 * Next.js instrumentation hook.
 *
 * - Loads the appropriate Sentry config per runtime when DSN is configured
 *   (nodejs server / edge middleware + edge functions).
 * - Exports `onRequestError` so server-component, middleware, and proxy errors
 *   thrown outside the normal request pipeline land in Sentry.
 */
import * as Sentry from "@sentry/nextjs"

export async function register() {
    if (process.env.NEXT_RUNTIME === "nodejs") {
        if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
            await import("./sentry.server.config")
        }
    }

    if (process.env.NEXT_RUNTIME === "edge") {
        if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
            await import("./sentry.edge.config")
        }
    }
}

// Capture errors from Server Components, middleware, route handlers, and proxies.
// Sentry's helper internally no-ops when its client isn't initialized, so it's
// safe to wire unconditionally — the DSN gate above keeps the SDK dormant.
export const onRequestError = Sentry.captureRequestError
