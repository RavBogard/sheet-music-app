/**
 * Next.js instrumentation hook.
 *
 * - Loads the appropriate Sentry config per runtime when DSN is configured
 *   (nodejs server / edge middleware + edge functions).
 * - Exports `onRequestError` so server-component, middleware, and proxy errors
 *   thrown outside the normal request pipeline land in Sentry.
 * - Registers the cycle-3 NEW-3 AI enrichment subscriber so every
 *   library.row.created event reaches Gemini (regardless of which API
 *   route or cron emitted it). Provider was swapped from Anthropic Sonnet
 *   4.7 → Gemini 3.1 Pro Preview by a3-gemini-swap (2026-05-18).
 */
import * as Sentry from "@sentry/nextjs"

export async function register() {
    if (process.env.NEXT_RUNTIME === "nodejs") {
        if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
            await import("./sentry.server.config")
        }
        // Cycle-3 NEW-3 (A3) — bind AI enrichment to the library event bus.
        // Idempotent inside the module; safe under HMR / multi-import.
        const { registerAiEnrichmentSubscriber } = await import(
            "./src/lib/library/ai-enrichment"
        )
        registerAiEnrichmentSubscriber()
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
