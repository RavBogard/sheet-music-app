/**
 * Simple logger that only outputs in development (log/info/debug) or always (warn/error).
 *
 * Automatically annotates every emission with the current request ID when called
 * from inside an API handler (via AsyncLocalStorage — see src/lib/request-id.ts).
 *   - If the first arg is a string, a `[req=<id>]` prefix is added.
 *   - If the first arg is a plain object, a `requestId` field is merged in.
 * No request ID present (client-side, outside a request) → behaviour unchanged.
 */

// Intentionally NO static import of request-id — it pulls `node:async_hooks`
// which breaks the client bundle. We read a resolver off globalThis that the
// server-only request-id module registers at its own import time. When this
// logger runs in the browser, `__requestIdGetter__` is simply undefined and
// annotation is a no-op.
interface WithRequestIdGetter {
    __requestIdGetter__?: () => string | undefined
}
function getCurrentRequestId(): string | undefined {
    const getter = (globalThis as unknown as WithRequestIdGetter).__requestIdGetter__
    return typeof getter === "function" ? getter() : undefined
}

const isDev = process.env.NODE_ENV === 'development'

function isPlainObject(v: unknown): v is Record<string, unknown> {
    if (v === null || typeof v !== "object") return false
    if (Array.isArray(v)) return false
    if (v instanceof Error) return false
    const proto = Object.getPrototypeOf(v)
    return proto === null || proto === Object.prototype
}

function annotate(args: unknown[]): unknown[] {
    const requestId = getCurrentRequestId()
    if (!requestId || args.length === 0) return args
    const [first, ...rest] = args
    if (typeof first === "string") {
        return [`[req=${requestId}] ${first}`, ...rest]
    }
    if (isPlainObject(first)) {
        return [{ ...first, requestId }, ...rest]
    }
    // Unknown first-arg shape — prepend a standalone tag so the ID still appears.
    return [`[req=${requestId}]`, first, ...rest]
}

export const logger = {
    log: (...args: unknown[]) => {
        if (isDev) console.log(...annotate(args))
    },
    warn: (...args: unknown[]) => {
        // Always log warnings (production visibility for rate limit fallbacks, notification failures, etc.)
        console.warn(...annotate(args))
    },
    error: (...args: unknown[]) => {
        // Always log errors
        console.error(...annotate(args))
    },
    info: (...args: unknown[]) => {
        if (isDev) console.info(...annotate(args))
    },
    debug: (...args: unknown[]) => {
        if (isDev) console.debug(...annotate(args))
    },
}
