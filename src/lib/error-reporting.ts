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

let Sentry: typeof import('@sentry/nextjs') | null = null

// Dynamically import Sentry only if DSN is configured
if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_SENTRY_DSN) {
    import('@sentry/nextjs').then(mod => { Sentry = mod }).catch(() => {})
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

    if (Sentry) {
        Sentry.captureException(error, {
            tags: {
                source: context?.source,
                location: context?.location,
            },
            user: context?.userId ? { id: context.userId } : undefined,
            extra: context?.extra,
        })
    }
}

/**
 * Report a warning or notable event (not an error).
 */
export function captureMessage(message: string, context?: ErrorContext): void {
    logger.warn(`[ErrorReport] ${context?.source || 'unknown'}${context?.location ? `:${context.location}` : ''}: ${message}`)

    if (Sentry) {
        Sentry.captureMessage(message, {
            tags: {
                source: context?.source,
                location: context?.location,
            },
            extra: context?.extra,
        })
    }
}
