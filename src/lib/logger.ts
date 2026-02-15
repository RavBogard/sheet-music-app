/**
 * Simple logger that only outputs in development.
 * Replaces console.log throughout the codebase.
 */

const isDev = process.env.NODE_ENV === 'development'

export const logger = {
    log: (...args: any[]) => {
        if (isDev) console.log(...args)
    },
    warn: (...args: any[]) => {
        if (isDev) console.warn(...args)
    },
    error: (...args: any[]) => {
        // Always log errors
        console.error(...args)
    },
    info: (...args: any[]) => {
        if (isDev) console.info(...args)
    },
    debug: (...args: any[]) => {
        if (isDev) console.debug(...args)
    },
}
