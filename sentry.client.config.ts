/**
 * Sentry client-side configuration.
 * Activate by setting NEXT_PUBLIC_SENTRY_DSN in your environment.
 *
 * Uses dynamic import so the ~40KB Sentry SDK only loads when actually needed.
 * Errors in the first ~500ms before Sentry boots won't be captured, but
 * that's an acceptable trade-off for faster initial page load.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
    import("@sentry/nextjs").then(async (Sentry) => {
        const { redactBearerTokens } = await import("@/lib/sentry-redact")
        Sentry.init({
            dsn,
            environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
            release:
                process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 8) || "dev",
            integrations: [Sentry.browserTracingIntegration()],
            tracesSampleRate: 0.1,
            // Session replays disabled — privacy + bandwidth for band iPads.
            // Re-enable per Daniel's call once we have a privacy story for the
            // band/setlist UI surfaces.
            replaysSessionSampleRate: 0,
            replaysOnErrorSampleRate: 0.1,
            ignoreErrors: [
                // React streaming hydration internals — fires when browser extensions
                // or rapid navigation remove DOM nodes before React can swap Suspense
                // fallbacks. Not actionable; does not affect functionality.
                "Cannot read properties of null (reading 'parentNode')",
            ],
            beforeSend: redactBearerTokens,
        })
    })
}
