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
 * Wiring points:
 *   - src/lib/api-wrapper.ts   — createApiHandler wraps every call in runWithRequestId
 *   - src/lib/api-auth.ts      — wrapWithRequestId helper for routes not using createApiHandler
 *   - src/lib/logger.ts        — reads getCurrentRequestId() on every emission
 *   - src/app/api/chat/route.ts — emits { requestId } in SSE meta/done frames
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
