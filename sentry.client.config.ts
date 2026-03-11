/**
 * Sentry client-side configuration.
 * Activate by setting NEXT_PUBLIC_SENTRY_DSN in your environment.
 *
 * Uses dynamic import so the ~40KB Sentry SDK only loads when actually needed.
 * Errors in the first ~500ms before Sentry boots won't be captured,
 * but that's an acceptable tradeoff for faster initial page load.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
    import("@sentry/nextjs").then((Sentry) => {
        Sentry.init({
            dsn,
            environment: process.env.NODE_ENV,
            integrations: [Sentry.browserTracingIntegration()],
            tracesSampleRate: 0.1,
            replaysSessionSampleRate: 0,
            replaysOnErrorSampleRate: 1.0,
        })
    })
}
