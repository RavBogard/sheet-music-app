import { NextResponse } from "next/server"

/**
 * v11.5-02-01 (H3) — HTTP Range support for in-memory byte serving.
 *
 * Pure, firebase-free helper that turns a fully-downloaded buffer into the
 * correct `200` / `206` / `416` response based on the request's `Range`
 * header. iPad WebKit disables the `<audio>` scrubber unless the server
 * advertises `Accept-Ranges` and honours `Range` with a `206` — so the two
 * audio-serving routes (`/api/drive/file/[fileId]`, `/api/recordings/file/[id]`)
 * route their success response through here.
 *
 * Scope (per PLAN boundaries): single-range `bytes=` only (RFC 7233 subset).
 * Bytes are already fully in memory in both callers, so we slice in-process —
 * NO partial/streamed origin fetch. Multi-range and non-`bytes` units fall
 * back to a normal full `200` (backward-compatible). No new dependencies.
 */

type ParsedRange =
    | { kind: "full" }
    | { kind: "partial"; start: number; end: number }
    | { kind: "unsatisfiable" }

/**
 * Parse a single `bytes=` range against a known total size. Anything we don't
 * support (multi-range, non-`bytes` unit, malformed numbers) returns `full` so
 * the caller serves a normal 200 — never an error — preserving back-compat.
 */
function parseRange(rangeHeader: string | null, total: number): ParsedRange {
    if (!rangeHeader) return { kind: "full" }

    const m = /^bytes=(.+)$/.exec(rangeHeader.trim())
    if (!m) return { kind: "full" } // not a bytes range → ignore

    const spec = m[1].trim()
    if (spec.includes(",")) return { kind: "full" } // multi-range unsupported → full body

    const dash = spec.indexOf("-")
    if (dash === -1) return { kind: "full" } // malformed (no hyphen)

    const startStr = spec.slice(0, dash).trim()
    const endStr = spec.slice(dash + 1).trim()

    // Suffix form: `-N` → last N bytes.
    if (startStr === "") {
        if (!/^\d+$/.test(endStr)) return { kind: "full" } // malformed
        const suffix = parseInt(endStr, 10)
        if (suffix <= 0) return { kind: "unsatisfiable" } // `-0` requests zero bytes
        const start = Math.max(0, total - suffix)
        return { kind: "partial", start, end: total - 1 }
    }

    if (!/^\d+$/.test(startStr)) return { kind: "full" } // malformed
    const start = parseInt(startStr, 10)

    let end: number
    if (endStr === "") {
        end = total - 1 // open-ended `start-` → to EOF
    } else {
        if (!/^\d+$/.test(endStr)) return { kind: "full" } // malformed
        end = parseInt(endStr, 10)
    }

    if (end > total - 1) end = total - 1 // clamp to last byte

    if (start >= total || start > end) return { kind: "unsatisfiable" }
    return { kind: "partial", start, end }
}

/**
 * Build the serving response for an in-memory buffer, honouring `Range`.
 *
 * - No / unsupported `Range`  → `200` with the full body, plus `Accept-Ranges: bytes`
 *   and `Content-Length`. Backward-compatible: a client that sends no Range is byte-identical.
 * - Satisfiable single range  → `206` with the sliced body, `Content-Range: bytes start-end/total`,
 *   `Content-Length: <chunk>`, `Accept-Ranges: bytes`.
 * - Unsatisfiable range       → `416` with `Content-Range: bytes *\/total`.
 *
 * Caller-supplied `headers` (CORS / Cache-Control / X-Served-From / Content-Disposition)
 * are always preserved; `Content-Type` comes from `opts.contentType`.
 */
export function byteRangeResponse(
    body: Uint8Array,
    opts: {
        contentType: string
        rangeHeader: string | null
        /** Status for the full-body (non-Range) response. Defaults to 200. */
        status?: number
        /** Extra headers to preserve (CORS, Cache-Control, X-Served-From, …). */
        headers?: Record<string, string>
    },
): NextResponse {
    const full = body instanceof Uint8Array ? body : new Uint8Array(body)
    const total = full.byteLength

    const baseHeaders: Record<string, string> = {
        ...(opts.headers ?? {}),
        "Content-Type": opts.contentType,
        "Accept-Ranges": "bytes",
    }

    const parsed = parseRange(opts.rangeHeader, total)

    // CRITICAL (2026-06-14 chart-outage postmortem): partial responses MUST NOT be
    // shared-cached. A public CDN (Vercel edge) that caches a 206 by URL — ignoring
    // the Range header — will replay a truncated slice as a `200` to later clients,
    // corrupting the payload. Force `no-store` on every 206/416 so partials always
    // hit origin and stay correct; only the full 200 keeps the caller's cache policy.
    if (parsed.kind === "unsatisfiable") {
        return new NextResponse(null, {
            status: 416,
            headers: {
                ...baseHeaders,
                "Content-Range": `bytes */${total}`,
                "Cache-Control": "no-store",
            },
        })
    }

    if (parsed.kind === "partial") {
        const { start, end } = parsed
        const chunk = full.slice(start, end + 1)
        return new NextResponse(new Uint8Array(chunk), {
            status: 206,
            headers: {
                ...baseHeaders,
                "Content-Range": `bytes ${start}-${end}/${total}`,
                "Content-Length": String(chunk.byteLength),
                "Cache-Control": "no-store",
            },
        })
    }

    return new NextResponse(new Uint8Array(full), {
        status: opts.status ?? 200,
        headers: {
            ...baseHeaders,
            "Content-Length": String(total),
        },
    })
}
