import { NextRequest, NextResponse } from "next/server"
import { checkRateLimit } from "@/lib/rate-limit"
import { createApiHandler } from "@/lib/api-wrapper"
import { fetchFileById } from "@/lib/file-fetcher"
import { logger } from "@/lib/logger"
import { hasBrowserFetchMetadata } from "@/lib/drive-file-auth"
import { httpError, redactInProduction } from "@/lib/http/error-envelope"
import { byteRangeResponse } from "@/lib/http/byte-range"
import { selectUnauthHint } from "@/lib/http/caller-context"
import { verifyBearer } from "@/lib/mcp/auth"

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://centralreform.live,https://www.centralreform.live').split(',').map(s => s.trim())
const ALLOWED_HOSTNAMES = ALLOWED_ORIGINS.map(o => { try { return new URL(o).hostname } catch { return '' } }).filter(Boolean)

function getAllowedOrigin(request: NextRequest): string {
    const origin = request.headers.get('origin') || ''
    // Direct match against configured origins
    if (ALLOWED_ORIGINS.includes(origin)) return origin
    // Parse origin to check hostname safely
    try {
        const url = new URL(origin)
        const host = url.hostname
        if (
            host === 'localhost' ||
            host === '127.0.0.1' ||
            host.endsWith('.vercel.app')
        ) {
            return origin
        }
    } catch {
        // Invalid URL — fall through to default
    }
    return ALLOWED_ORIGINS[0]
}

// hasBrowserFetchMetadata lives in @/lib/drive-file-auth

export const GET = createApiHandler(async (ctx) => {
    // Chart-byte GETs use their own generous `chart` tier (600/min) instead of
    // the shared `api` tier (60/min). The limiter keys by client IP and CRC's
    // ~6 band iPads sit behind ONE synagogue NAT → on the `api` tier they'd
    // share a single 60/min budget and 429 mid-service while pre-caching a
    // setlist. Safe to be generous: these GETs are public, idempotent, and
    // CDN-cached (s-maxage 7d below) so most repeats never reach origin — the
    // tier only guards the cold first-fetch burst. See `chart` in @/lib/rate-limit.
    const limited = await checkRateLimit(ctx.req, 'chart')
    if (limited) return limited

    const fileId = ctx.params?.fileId
    // Auth: Firebase ID token (ctx.auth), in-app fetch metadata, OR MCP
    // `crl_live_` bearer. The MCP path was added 2026-05-28 per the
    // err-public-not-gated invariant — a musician's bandmate sharing a
    // chart link via Claude can curl it with their MCP bearer.
    let isTrusted = !!ctx.auth || hasBrowserFetchMetadata(ctx.req)
    if (!isTrusted && ctx.req.headers.get("authorization")?.toLowerCase().startsWith("bearer ")) {
        const bearer = await verifyBearer(ctx.req)
        if ("uid" in bearer) isTrusted = true
    }
    const origin = getAllowedOrigin(ctx.req)

    try {
        // Cycle-1 F-021: existence check fires BEFORE the auth gate so a
        // bogus fileId returns 404 instead of the misleading "Authentication
        // required" 401 — agents kept treating the 401 as a credentials
        // problem when it was really a wrong-id problem. Chart-access
        // policy ([[feedback_chart_access_policy]]): chart bytes are
        // intentionally public for real fileIds, so revealing existence
        // to unauthed probes is acceptable. The auth gate still fires
        // below for existing files when the request carries neither a
        // Bearer token nor browser fetch metadata.
        const result = await fetchFileById(fileId)

        if (!result) {
            // Cycle-2 SEC-001 + SEC-002: rich envelope on the wire; the
            // `debug` field used to leak the raw receivedId + stringified
            // params unconditionally. Production now strips it via
            // `redactInProduction`; dev / test keep it for triage.
            const context = redactInProduction(
                {
                    fileId,
                    debug: {
                        receivedId: fileId,
                        stringified: String(ctx.params?.fileId),
                    },
                },
                ["debug"] as const,
            )
            return httpError(
                404,
                "file_not_found",
                "No chart found for the given fileId.",
                context,
                // Cycle-5 C5B-006 — bearer / in-app callers see the MCP-savvy
                // hint; bare HTTP probes get a generic "chart not found".
                selectUnauthHint(
                    ctx.req,
                    "Verify the fileId via the MCP list_library / get_chart_status tools, or open the chart in-app to confirm it still exists.",
                    "The requested chart could not be found.",
                ),
                {
                    "Access-Control-Allow-Origin": origin,
                    "Cache-Control": "no-store",
                },
            )
        }

        // Auth: Accept Bearer token (API calls) OR requests that carry
        // browser-set Sec-Fetch-* metadata (chart embeds, prefetches, audio
        // elements — can't attach Bearer headers). Defense-in-depth only —
        // see hasBrowserFetchMetadata JSDoc. Direct curl/script access
        // without either is blocked.
        if (!isTrusted) {
            const fwd = ctx.req.headers.get('x-forwarded-for') || ''
            const ip = fwd.split(',')[0]?.trim() || ctx.req.headers.get('x-real-ip') || 'unknown'
            logger.warn(`[FileProxy] Untrusted request blocked for ${fileId}`, {
                secFetchSite: ctx.req.headers.get('sec-fetch-site'),
                secFetchDest: ctx.req.headers.get('sec-fetch-dest'),
                referer: ctx.req.headers.get('referer'),
                userAgent: ctx.req.headers.get('user-agent'),
                ip,
            })
            return httpError(
                401,
                "unauthenticated",
                "Bearer token (or in-app browser fetch metadata) required for chart bytes.",
                { fileId },
                // Cycle-5 C5B-006 — bearer-savvy hint only for bearer / in-app
                // callers; a bare HTTP probe sees a generic prompt without
                // the Bearer-header how-to. Cycle-11 c11-fix-relax-gates:
                // both Firebase ID tokens AND MCP `crl_live_` bearers are
                // accepted, surface both in the hint so a Claude/MCP caller
                // doesn't think they need to mint a Firebase ID token.
                selectUnauthHint(
                    ctx.req,
                    "Send `Authorization: Bearer <token>` — either a Firebase ID token (signed-in user) or a `crl_live_…` MCP bearer. Or call from the in-app fetch surface where Sec-Fetch-Site / Sec-Fetch-Dest headers identify the request.",
                ),
                { "Access-Control-Allow-Origin": origin },
            )
        }

        const baseHeaders = {
            'Access-Control-Allow-Origin': origin,
            'Cache-Control': 'public, max-age=86400, s-maxage=604800',
            'Content-Type': result.contentType,
            'X-Served-From': result.source,
        }

        // H3 (v11.5-02-01) — Range support ONLY for audio (iPad <audio> seeking).
        // v11.5-02 hotfix (2026-06-14): originally H3 advertised Accept-Ranges on
        // EVERY response from this route, including CHARTS (PDF/image/text). pdf.js,
        // seeing Accept-Ranges, switched to range-request mode; this route is
        // public + CDN-cached (s-maxage 7d), so Vercel's edge cached the 206
        // partials and replayed them as truncated `200`s (a 100-byte body served
        // as a complete 200) → pdf.js got a truncated "full" PDF → charts failed
        // to load en masse. Fix: only audio bytes flow through the Range helper;
        // charts return the original plain 200 with NO Accept-Ranges (exactly
        // pre-H3), so pdf.js does one clean full GET and the CDN caches the whole
        // file. (byte-range.ts additionally marks 206/416 no-store so audio
        // partials can't be CDN-cached either.)
        const isAudio = (result.contentType || '').toLowerCase().startsWith('audio/')
        if (isAudio) {
            return byteRangeResponse(new Uint8Array(result.buffer), {
                contentType: result.contentType,
                rangeHeader: ctx.req.headers.get('range'),
                headers: {
                    'Access-Control-Allow-Origin': origin,
                    'Cache-Control': 'public, max-age=86400, s-maxage=604800',
                    'X-Served-From': result.source,
                },
            })
        }

        return new NextResponse(new Uint8Array(result.buffer), {
            status: 200,
            headers: baseHeaders,
        })
    } catch (error) {
        logger.error(`[FileProxy] Unexpected error for ${fileId}:`, error)
        return httpError(
            502,
            "upstream_unavailable",
            "Chart bytes are temporarily unavailable.",
            { fileId },
            "Retry shortly; if the failure persists the underlying Storage / Drive blob may need re-upload.",
            {
                "Access-Control-Allow-Origin": origin,
                "Cache-Control": "no-store",
            },
        )
    }
}, { requireAuth: false })
