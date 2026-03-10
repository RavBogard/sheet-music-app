/**
 * Simple logger that only outputs in development.
 * Replaces console.log throughout the codebase.
 */

const isDev = process.env.NODE_ENV === 'development'

export const logger = {
    log: (...args: unknown[]) => {
        if (isDev) console.log(...args)
    },
    warn: (...args: unknown[]) => {
        // Always log warnings (production visibility for rate limit fallbacks, notification failures, etc.)
        console.warn(...args)
    },
    error: (...args: unknown[]) => {
        // Always log errors
        console.error(...args)
    },
    info: (...args: unknown[]) => {
        if (isDev) console.info(...args)
    },
    debug: (...args: unknown[]) => {
        if (isDev) console.debug(...args)
    },
}
