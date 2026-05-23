/**
 * Defense-in-depth scrubber for Sentry events.
 *
 * Sentry's defaults already remove `Authorization` / `Cookie` headers, but
 * `crl_live_…` MCP bearers can appear in URL query strings, request bodies,
 * breadcrumb messages, and arbitrary `extra` payloads. This processor walks
 * the event and rewrites any literal `crl_live_<hex>` occurrence to
 * `crl_live_<redacted>` regardless of where it surfaces.
 *
 * Kept narrow and string-only so it cannot break event shape — if a value
 * isn't a string (or array/object containing strings), it's passed through.
 */

import type { ErrorEvent } from "@sentry/nextjs"

const TOKEN_PATTERN = /crl_live_[a-f0-9]+/gi
const REPLACEMENT = "crl_live_<redacted>"

function scrubString(value: string): string {
    return value.replace(TOKEN_PATTERN, REPLACEMENT)
}

function scrubValue(value: unknown, depth = 0): unknown {
    if (depth > 6) return value // cap recursion; Sentry events aren't that deep
    if (typeof value === "string") return scrubString(value)
    if (Array.isArray(value)) return value.map((v) => scrubValue(v, depth + 1))
    if (value && typeof value === "object") {
        const out: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            out[k] = scrubValue(v, depth + 1)
        }
        return out
    }
    return value
}

/** Sentry `beforeSend` hook — returns the event with `crl_live_*` redacted. */
export function redactBearerTokens(event: ErrorEvent): ErrorEvent {
    return scrubValue(event) as ErrorEvent
}
