import "server-only"

import { logger } from "@/lib/logger"
import type { HistoryRow } from "./types"

/**
 * Read Overlays' bounded cue history.
 *
 * `GET ${OVERLAYS_BASE_URL}/api/history?since=<ms>&until=<ms>`, bearer
 * `OVERLAYS_HISTORY_TOKEN`. The token is a SENSITIVE env var and is never
 * logged, never echoed into an error, and never returned to a caller — the
 * same discipline Overlays applies to `CRC_LIVE_READ_TOKEN` on its side.
 *
 * The limits below are the point of having a client at all rather than a bare
 * `fetch`. This runs inside a publish-adjacent server action against another
 * service that may be mid-incident, so it is bounded on every axis: a 5-second
 * timeout, a 256 KiB ceiling read incrementally (a `Content-Length` header is
 * not trusted — an unbounded chunked response would otherwise fill the
 * function's memory), and redirects refused outright, because following one
 * would send the bearer to whatever host the redirect names.
 *
 * Every failure is a returned envelope, never a throw. A reconcile is an
 * after-the-fact convenience; it must never be the thing that breaks.
 */

const TIMEOUT_MS = 5_000
const MAX_BYTES = 256 * 1024

export type HistoryResult =
    | { ok: true; rows: HistoryRow[]; truncated: false }
    | { ok: false; code: string; message: string }

export interface FetchHistoryArgs {
    /** ISO instant, inclusive. Sent as epoch milliseconds — see below. */
    since: string
    /** ISO instant, exclusive. */
    until: string
}

/**
 * EPOCH MILLISECONDS ON THE WIRE.
 *
 * The cue-log contract is `?since=<ms>&until=<ms>` — `PLAN-CODE-LIVE-
 * INTEGRATION-2026-09-14.md` Part D, verbatim, describing the endpoint as
 * built. This client was sending ISO strings, which Overlays answers 400.
 * Measured on production 2026-09-15, the first time both env vars were set
 * and a real call could be made: the credential was accepted and the request
 * shape refused. The fixture-driven tests could not have caught it — a
 * fixture has no opinion about a query string.
 *
 * ISO stays the interface, because every caller here holds instants, not
 * numbers, and a number in an argument called `since` is the kind of thing
 * that gets a time zone wrong later.
 */
function epochMs(iso: string): string | null {
    const ms = Date.parse(iso)
    return Number.isFinite(ms) ? String(ms) : null
}

/** Present only when both the base URL and the token are configured. */
export function historyConfigured(): boolean {
    return !!(process.env.OVERLAYS_BASE_URL && process.env.OVERLAYS_HISTORY_TOKEN)
}

function isHistoryRow(v: unknown): v is HistoryRow {
    if (!v || typeof v !== "object") return false
    const r = v as Record<string, unknown>
    return typeof r.seq === "number" && typeof r.at === "string"
}

export async function fetchHistory(args: FetchHistoryArgs): Promise<HistoryResult> {
    const base = process.env.OVERLAYS_BASE_URL
    const token = process.env.OVERLAYS_HISTORY_TOKEN
    if (!base || !token) {
        return {
            ok: false,
            code: "history_not_configured",
            message:
                "OVERLAYS_BASE_URL / OVERLAYS_HISTORY_TOKEN are not set, so the cue history cannot be read.",
        }
    }

    let url: URL
    try {
        url = new URL("/api/history", base)
    } catch {
        return {
            ok: false,
            code: "history_not_configured",
            message: "OVERLAYS_BASE_URL is not a URL.",
        }
    }
    const since = epochMs(args.since)
    const until = epochMs(args.until)
    if (!since || !until) {
        return {
            ok: false,
            code: "history_bad_window",
            message: "since/until must be parseable instants.",
        }
    }
    url.searchParams.set("since", since)
    url.searchParams.set("until", until)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
        const res = await fetch(url, {
            method: "GET",
            headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
            // Following a redirect would hand the bearer to whatever host the
            // redirect names. There is no legitimate redirect on this endpoint.
            redirect: "error",
            cache: "no-store",
            signal: controller.signal,
        })

        if (!res.ok) {
            // Status only — a body from a service we are authenticating to can
            // echo back headers, and this string reaches a tool result.
            return {
                ok: false,
                code: "history_http_error",
                message: `Overlays /api/history returned ${res.status}.`,
            }
        }

        const text = await readCapped(res)
        if (text === null) {
            return {
                ok: false,
                code: "history_too_large",
                message: `Overlays /api/history returned more than ${MAX_BYTES} bytes.`,
            }
        }

        let parsed: unknown
        try {
            parsed = JSON.parse(text)
        } catch {
            return {
                ok: false,
                code: "history_bad_json",
                message: "Overlays /api/history did not return JSON.",
            }
        }

        const raw = Array.isArray(parsed)
            ? parsed
            : ((parsed as Record<string, unknown> | null)?.rows ?? null)
        if (!Array.isArray(raw)) {
            return {
                ok: false,
                code: "history_bad_shape",
                message: "Overlays /api/history returned neither an array nor {rows:[…]}.",
            }
        }

        const rows = raw.filter(isHistoryRow).sort((a, b) => a.seq - b.seq)
        return { ok: true, rows, truncated: false }
    } catch (err) {
        const aborted = err instanceof Error && err.name === "AbortError"
        // The URL carries no secret, but the thrown error can name the host.
        // Log the shape, return the shape; never the token.
        logger.warn("[performed] history fetch failed", {
            aborted,
            err: err instanceof Error ? err.name : "unknown",
        })
        return {
            ok: false,
            code: aborted ? "history_timeout" : "history_unreachable",
            message: aborted
                ? `Overlays /api/history did not answer within ${TIMEOUT_MS / 1000}s.`
                : "Overlays /api/history could not be reached.",
        }
    } finally {
        clearTimeout(timer)
    }
}

/**
 * Read at most MAX_BYTES, returning null if the body is longer.
 *
 * `res.text()` would buffer whatever arrives; `Content-Length` is absent on a
 * chunked response and is attacker-controlled anyway. Reading the stream and
 * counting is the only cap that actually caps.
 */
async function readCapped(res: Response): Promise<string | null> {
    const body = res.body
    if (!body) return await res.text()
    const reader = body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    try {
        for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            if (!value) continue
            total += value.byteLength
            if (total > MAX_BYTES) {
                await reader.cancel()
                return null
            }
            chunks.push(value)
        }
    } finally {
        reader.releaseLock?.()
    }
    const joined = new Uint8Array(total)
    let at = 0
    for (const c of chunks) {
        joined.set(c, at)
        at += c.byteLength
    }
    return new TextDecoder().decode(joined)
}
