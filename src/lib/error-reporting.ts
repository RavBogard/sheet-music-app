/**
 * Error reporting utility.
 * 
 * Currently logs to console. To enable Sentry:
 *   1. npm install @sentry/nextjs
 *   2. Run npx @sentry/wizard@latest -i nextjs
 *   3. Replace captureException/captureMessage below with Sentry calls
 * 
 * All error reporting in the app flows through this module,
 * so switching providers requires changes only here.
 */

import { logger } from '@/lib/logger'

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
 * Report an error. In production, this would send to Sentry/Datadog/etc.
 */
export function captureException(error: unknown, context?: ErrorContext): void {
    const message = error instanceof Error ? error.message : String(error)
    const stack = error instanceof Error ? error.stack : undefined

    logger.error(`[ErrorReport] ${context?.source || 'unknown'}${context?.location ? `:${context.location}` : ''}: ${message}`)
    if (stack) {
        logger.error(stack)
    }

    // TODO: Replace with Sentry.captureException(error, { tags: context })
}

/**
 * Report a warning or notable event (not an error).
 */
export function captureMessage(message: string, context?: ErrorContext): void {
    logger.warn(`[ErrorReport] ${context?.source || 'unknown'}${context?.location ? `:${context.location}` : ''}: ${message}`)

    // TODO: Replace with Sentry.captureMessage(message, { tags: context })
}
