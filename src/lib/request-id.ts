/**
 * Request ID propagation — server-only.
 *
 * Uses `node:async_hooks` AsyncLocalStorage to thread a per-request ID through
 * any logger call made during the handler's lifetime, without plumbing it
 * through every function signature.
 *
 * ⚠️  SERVER-ONLY. Do NOT import from client components / "use client" files.
 *     `node:async_hooks` is not available in the browser bundle.
 *
 * The logger (src/lib/logger.ts) deliberately does NOT statically import this
 * module — that would pull `node:async_hooks` into the client bundle via any
 * client file that imports logger. Instead, this module registers a resolver on
 * `globalThis.__requestIdGetter__` at import time, and logger reads from there
 * with no import-graph dependency. Browser bundles simply see `undefined`.
 *
 * Wiring points:
 *   - src/lib/api-wrapper.ts   — createApiHandler wraps every call in runWithRequestId
 *   - src/lib/api-auth.ts      — wrapWithRequestId helper for routes not using createApiHandler
 *   - src/lib/logger.ts        — reads globalThis.__requestIdGetter__() on every emission
 */
import { AsyncLocalStorage } from "node:async_hooks"

/** Generate a fresh UUIDv4 request ID. Uses crypto.randomUUID (Edge + Node 18+ compatible). */
export function generateRequestId(): string {
    return crypto.randomUUID()
}

/**
 * Validate an inbound x-request-id header.
 *
 * Returns the raw value iff it passes safety checks:
 *   - non-null, non-empty string
 *   - length 1..128
 *   - only [a-zA-Z0-9_-] (blocks control chars, header smuggling, log-injection attempts)
 *
 * Otherwise returns null (caller should fall back to generateRequestId()).
 */
export function validateInboundRequestId(raw: string | null | undefined): string | null {
    if (typeof raw !== "string") return null
    if (raw.length < 1 || raw.length > 128) return null
    if (!/^[a-zA-Z0-9_-]+$/.test(raw)) return null
    return raw
}

export const requestIdStorage = new AsyncLocalStorage<{ requestId: string }>()

/** Returns the current request's ID, or undefined when called outside a wrapped handler. */
export function getCurrentRequestId(): string | undefined {
    return requestIdStorage.getStore()?.requestId
}

/** Run `fn` with `requestId` bound as the current ALS context. */
export function runWithRequestId<T>(requestId: string, fn: () => T): T {
    return requestIdStorage.run({ requestId }, fn)
}

// Register a resolver on globalThis so logger.ts can surface the current
// request ID without a static import (which would drag node:async_hooks into
// the client bundle). Server imports this module from api-wrapper / api-auth,
// which runs at server route init time — always before a request.
interface WithRequestIdGetter {
    __requestIdGetter__?: () => string | undefined
}
;(globalThis as unknown as WithRequestIdGetter).__requestIdGetter__ = getCurrentRequestId
