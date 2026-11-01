/**
 * Error reporting utility.
 *
 * Uses Sentry when NEXT_PUBLIC_SENTRY_DSN is configured.
 * Falls back to console logging otherwise.
 *
 * All error reporting in the app flows through this module,
 * so switching providers requires changes only here.
 */

import { logger } from '@/lib/logger'
import { loadSentryBrowser } from '@/lib/sentry-lazy'

type SentryApi = Pick<typeof import('@sentry/nextjs'), 'captureException' | 'captureMessage'>

let Sentry: SentryApi | null = null

// Server: import Sentry when a DSN is configured. The browser does NOT import
// it here (perf audit P2-6): this module sits in the Perform error boundary,
// and an eager import pulled the full 378 KB SDK into every first load. In the
// browser the trimmed client is loaded on the first report instead.
if (process.env.NEXT_PUBLIC_SENTRY_DSN && typeof window === 'undefined') {
    import('@sentry/nextjs').then(mod => { Sentry = mod }).catch(err => {
        logger.warn('[ErrorReport] Sentry import failed — error reporting will use console only:', err)
    })
}

/** Run `send` against the server SDK now, or the browser client once loaded. */
function withSentry(send: (s: SentryApi) => void): void {
    if (Sentry) {
        send(Sentry)
        return
    }
    const browser = loadSentryBrowser()
    if (browser) void browser.then(send).catch(() => {})
}

interface ErrorContext {
    /** Where the error occurred */
    source: 'api' | 'client' | 'bridge' | 'cron'
    /** The specific route or component */
    location?: string
    /** The authenticated user's UID */
    userId?: string
    /** Additional metadata */
    extra?: Record<string, unknown>
}

/**
 * Report an error. Sends to Sentry if configured, otherwise logs to console.
 */
export function captureException(error: unknown, context?: ErrorContext): void {
    const message = error instanceof Error ? error.message : String(error)
    const stack = error instanceof Error ? error.stack : undefined

    logger.error(`[ErrorReport] ${context?.source || 'unknown'}${context?.location ? `:${context.location}` : ''}: ${message}`)
    if (stack) {
        logger.error(stack)
    }

    withSentry((sentry) => {
        sentry.captureException(error, {
            tags: {
                source: context?.source,
                location: context?.location,
            },
            user: context?.userId ? { id: context.userId } : undefined,
            extra: context?.extra,
        })
    })
}

/** Sentry severity levels we use for non-exception captures. */
export type CaptureLevel = 'info' | 'warning' | 'error'

/**
 * Report a warning or notable event (not an error).
 *
 * `level` selects the Sentry severity (default `'warning'` to preserve the
 * pre-PGR-03 behavior — every existing caller wrote `logger.warn` locally
 * and emitted at Sentry's default level) and also chooses which `logger`
 * method emits the structured log line locally.
 */
export function captureMessage(
    message: string,
    context?: ErrorContext,
    level: CaptureLevel = 'warning',
): void {
    const tag = `[ErrorReport] ${context?.source || 'unknown'}${context?.location ? `:${context.location}` : ''}: ${message}`
    if (level === 'error') {
        logger.error(tag)
    } else if (level === 'info') {
        logger.info(tag)
    } else {
        logger.warn(tag)
    }

    withSentry((sentry) => {
        sentry.captureMessage(message, {
            level,
            tags: {
                source: context?.source,
                location: context?.location,
            },
            extra: context?.extra,
        })
    })
}
