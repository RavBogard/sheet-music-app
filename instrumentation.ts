/**
 * Next.js instrumentation hook.
 * Loads Sentry server config on server startup when DSN is configured,
 * and registers the cycle-3 NEW-3 AI enrichment subscriber so every
 * library.row.created event reaches Gemini (regardless of which API
 * route or cron emitted it). Provider was swapped from Anthropic Sonnet
 * 4.7 → Gemini 3.1 Pro Preview by a3-gemini-swap (2026-05-18).
 */
export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
            await import('./sentry.server.config')
        }
        // Cycle-3 NEW-3 (A3) — bind AI enrichment to the library event bus.
        // Idempotent inside the module; safe under HMR / multi-import.
        const { registerAiEnrichmentSubscriber } = await import(
            './src/lib/library/ai-enrichment'
        )
        registerAiEnrichmentSubscriber()
    }
}
