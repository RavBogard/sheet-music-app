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

/**
 * Overlays answers at most `MAX_HISTORY_PAGE` (500) rows and hands back
 * `nextAfter` when more exist. A Yom Kippur morning is four hours of cues and
 * goes past 500 easily, and a truncated log reads as "the second half of the
 * service was skipped" — the single most misleading thing this feature could
 * say. So the client follows the cursor.
 *
 * Bounded, like everything else here: eight pages is 4,000 rows, past the
 * relay's own 2,000-row window, so the cap can only ever be reached by a
 * server that is not advancing its cursor.
 */
const MAX_PAGES = 8

/**
 * The workspace these credentials are supposed to read.
 *
 * Overlays is multi-workspace and the response says which one answered.
 * Reconciling a rehearsal workspace's cues against a CRC setlist would produce
 * a confident, detailed, entirely fictional account of a service — so the
 * workspace is checked rather than assumed, and a mismatch is a refusal.
 *
 * Read per call, not at module load: this runs on serverless, where a module
 * outlives the environment it was first imported under.
 */
function expectedWorkspace(): string {
    return process.env.OVERLAYS_WORKSPACE || "crc"
}

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

/**
 * EPOCH MILLISECONDS, AND ISO TOO.
 *
 * `lib/service-history.ts` on the Overlays side types the row as `at:number`
 * and validates it with a safe-integer check; the captured response in
 * `work/handoffs/cue-log/history-rehearsal.json` shows `"at": 1789420709619`.
 * This function required a string, so it rejected every row Overlays has ever
 * sent, `rows` came back empty, and `reconcile_service` reported "no cues were
 * logged" — indistinguishable from a service nobody cued. The fixtures could
 * not have caught it: a fixture has no opinion about the wire.
 *
 * ISO is still accepted. It costs one clause and it means a future Overlays
 * that switches to instants does not silently empty this again.
 */
function isHistoryRow(v: unknown): v is HistoryRow {
    if (!v || typeof v !== "object") return false
    const r = v as Record<string, unknown>
    if (typeof r.seq !== "number") return false
    if (typeof r.at === "number") return Number.isFinite(r.at)
    return typeof r.at === "string" && Number.isFinite(Date.parse(r.at))
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

    let base_url: URL
    try {
        base_url = new URL("/api/history", base)
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

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
        const rows: HistoryRow[] = []
        let after: number | null = null
        let pages = 0

        for (;;) {
            const url = new URL(base_url)
            url.searchParams.set("since", since)
            url.searchParams.set("until", until)
            if (after !== null) url.searchParams.set("after", String(after))

            const res = await fetch(url, {
                method: "GET",
                headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
                // Following a redirect would hand the bearer to whatever host
                // the redirect names. There is no legitimate redirect here.
                redirect: "error",
                cache: "no-store",
                signal: controller.signal,
            })

            if (!res.ok) {
                // Status only — a body from a service we are authenticating to
                // can echo back headers, and this string reaches a tool result.
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

            const body = Array.isArray(parsed)
                ? null
                : ((parsed as Record<string, unknown> | null) ?? null)
            const raw = Array.isArray(parsed) ? parsed : (body?.rows ?? null)
            if (!Array.isArray(raw)) {
                return {
                    ok: false,
                    code: "history_bad_shape",
                    message: "Overlays /api/history returned neither an array nor {rows:[…]}.",
                }
            }

            // Whose cues these are. Checked on every page, because a cursor is
            // a fresh request and nothing guarantees the second one lands in
            // the same place as the first.
            const expected = expectedWorkspace()
            const workspace = typeof body?.workspace === "string" ? body.workspace : null
            if (workspace && workspace !== expected) {
                return {
                    ok: false,
                    code: "history_wrong_workspace",
                    message: `Overlays /api/history answered for workspace '${workspace}', not '${expected}'.`,
                }
            }

            for (const r of raw) if (isHistoryRow(r)) rows.push(r)

            pages += 1
            const next = body?.nextAfter
            if (typeof next !== "number" || !Number.isFinite(next)) break
            if (next === after) break
            if (pages >= MAX_PAGES) {
                // Say so rather than quietly returning a partial service: a
                // half-read cue log reads as "the rest was skipped".
                logger.warn("[performed] history paging cap reached", { pages })
                return {
                    ok: false,
                    code: "history_too_many_pages",
                    message: `Overlays /api/history did not finish within ${MAX_PAGES} pages.`,
                }
            }
            after = next
        }

        rows.sort((a, b) => a.seq - b.seq)
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
