import { NextResponse } from "next/server"
import { richError, stripDebugInProduction } from "@/lib/mcp/errors"

/**
 * Cycle-3 REG-002 extension of cycle-2 SEC-002 — HTTP routes share the
 * MCP rich-error envelope shape so an agent / client sees the same
 * recovery contract regardless of whether it's calling an MCP tool or a
 * Next route handler.
 *
 * Envelope shape on the wire (single source: `src/lib/mcp/errors.ts`):
 *
 *   {
 *     ok: false,
 *     error: {
 *       code: number,         // HTTP-like
 *       machine_code: string, // snake_case, /^[a-z][a-z0-9_]*$/
 *       message: string,
 *       debug?: unknown       // stripped in production via `stripDebugInProduction`
 *     },
 *     ...context,             // route-specific fields (fileId, etc)
 *     hint?: string           // next-step recovery prose
 *   }
 *
 * Status code goes on the HTTP response itself; the body still carries
 * `error.code` so a client doing `await res.json()` sees structured
 * failure data immediately without parsing the status text.
 *
 * Sweep policy (decisions.md 2026-05-18T18:45Z): every HTTP route that
 * emits an error envelope flows through `httpError()` so the wire shape
 * stays uniform with the MCP surface (cycle-3 REG-002 / cycle-2 SEC-002).
 */

/**
 * Build a Next.js JSON response whose body is the canonical rich-error
 * envelope, with the supplied HTTP status code. `headers` lets callers
 * preserve CORS / cache-control headers without losing the envelope.
 *
 * Signature mirrors `richError(machine_code, message, context?, hint?)`
 * from the MCP side, with the HTTP-specific `status` as the first
 * argument and an optional headers slot at the end. `error.debug` is
 * automatically stripped in production (per `stripDebugInProduction`);
 * callers that don't want the field at all pass it inside `context`
 * pre-redacted via `redactInProduction(context, ["debug"])`.
 */
export function httpError(
    status: number,
    code: string,
    message: string,
    context?: Record<string, unknown>,
    hint?: string,
    headers?: HeadersInit,
): NextResponse {
    const envelope = stripDebugInProduction(
        richError(code, message, context ?? {}, hint),
    )
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
 *
 * NB: `httpError()` already strips `error.debug` in production via
 * `stripDebugInProduction`. Use this helper for OTHER context keys
 * (e.g. internal uids, raw paths) you want gated on environment.
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
