import { NextResponse } from "next/server"
import type { RichErrorEnvelope } from "@/lib/mcp/error-envelopes"

/**
 * Cycle-2 SEC-002 — extend the MCP rich-error envelope to HTTP routes
 * so an agent / client sees the same recovery contract regardless of
 * whether it's calling an MCP tool or a Next route handler.
 *
 * Envelope shape on the wire (mirrors `src/lib/mcp/error-envelopes.ts`):
 *
 *   {
 *     ok: false,
 *     error: <machine_code>,  // snake_case, /^[a-z][a-z0-9_]*$/
 *     message: <human prose>,
 *     ...context,             // route-specific fields (fileId, etc)
 *     hint?: <next-step recovery prose>
 *   }
 *
 * Status code goes on the HTTP response itself; the envelope body
 * carries the machine code so a client doing `await res.json()` sees
 * structured failure data immediately without parsing the status text.
 *
 * Sweep policy (decisions.md 2026-05-17T22:55Z): start with
 * `/api/drive/file/[fileId]/route.ts`'s 401 + 404 (the cycle-2 SEC-002
 * scope). Other HTTP routes that currently return MCP-style errors
 * should be migrated as encountered — don't sweep them all in one PR,
 * but use this helper so the wire shape stays uniform.
 */

/**
 * Build a Next.js JSON response whose body is the canonical rich-error
 * envelope, with the supplied HTTP status code. `headers` lets callers
 * preserve CORS / cache-control headers without losing the envelope.
 *
 * Signature mirrors `richError(code, message, context?, hint?)` from
 * the MCP side, with the HTTP-specific `status` as the first argument
 * and an optional headers slot at the end.
 */
export function httpError(
    status: number,
    code: string,
    message: string,
    context?: Record<string, unknown>,
    hint?: string,
    headers?: HeadersInit,
): NextResponse {
    const envelope: RichErrorEnvelope = {
        ok: false,
        error: code,
        message,
        ...(context ?? {}),
        ...(hint ? { hint } : {}),
    }
    return NextResponse.json(envelope, { status, headers })
}

/**
 * Production-only context redaction. Use when an error envelope's
 * context fields would leak internal diagnostics (debug ids, internal
 * paths, raw error messages) to an untrusted client. In dev / test the
 * full context is kept so the operator can debug; in prod the keys
 * named in `secretKeys` are stripped before the envelope ships.
 *
 * SEC-001 (cycle-2): /api/drive/file/[fileId] 404 path used to leak
 * `debug: {receivedId, stringified}` unconditionally. The fix gates
 * the debug field on `NODE_ENV !== 'production'` via this helper.
 */
export function redactInProduction<T extends Record<string, unknown>>(
    context: T,
    secretKeys: ReadonlyArray<keyof T>,
): T {
    if (process.env.NODE_ENV !== "production") return context
    const copy: Record<string, unknown> = { ...context }
    for (const key of secretKeys) {
        delete copy[key as string]
    }
    return copy as T
}
