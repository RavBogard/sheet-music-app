/**
 * Next.js instrumentation hook.
 * Loads Sentry server config on server startup when DSN is configured.
 */
export async function register() {
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
        if (process.env.NEXT_RUNTIME === 'nodejs') {
            await import('./sentry.server.config')
        }
    }
}
