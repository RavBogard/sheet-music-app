import { NextRequest, NextResponse } from "next/server"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { createApiHandler } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import { fetchFileById } from "@/lib/file-fetcher"
import { hasBrowserFetchMetadata } from "@/lib/drive-file-auth"
import { httpError, redactInProduction } from "@/lib/http/error-envelope"
import { selectUnauthHint } from "@/lib/http/caller-context"
import { verifyBearer } from "@/lib/mcp/auth"
import { logger } from "@/lib/logger"

/**
 * Public chart-byte proxy keyed by library fileId — the sibling of
 * `/api/drive/file/[fileId]`. Both serve chart bytes for anon deep links per
 * the ACCESS-POLICY anon chart-deep-link cell (✅) and the err-public prime
 * directive: a texted deep link to a chart must render for a signed-out
 * visitor. Chart bytes are public, idempotent, and CDN-cached.
 *
 * v11.3-01 (BUG-5): this route previously used `createApiHandler` with the
 * DEFAULT auth gate, so anon callers got 401 `missing_bearer` (api-auth.ts)
 * BEFORE any id handling — even for legacy `db-*` MusicXML, which broke anon
 * "Open chart in new tab" (MobileRowCard → parseFileId → here). It also only
 * served `db-*` ids (returned 400 for anything else). Now it mirrors
 * `/api/drive/file`: `requireAuth:false`, an `isTrusted` browser-metadata /
 * bearer gate, the generous `chart` rate-limit tier, and it serves `upload-*`
 * / UUID / Drive ids via the shared `fetchFileById` resolver. `db-*` ids keep
 * the legacy `digitized_charts` xmlContent path, now anon-public behind the
 * same gate.
 */
export const dynamic = 'force-dynamic'

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://centralreform.live,https://www.centralreform.live').split(',').map(s => s.trim())

function getAllowedOrigin(request: NextRequest): string {
    const origin = request.headers.get('origin') || ''
    if (ALLOWED_ORIGINS.includes(origin)) return origin
    try {
        const url = new URL(origin)
        const host = url.hostname
        if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.vercel.app')) {
            return origin
        }
    } catch {
        // Invalid URL — fall through to default
    }
    return ALLOWED_ORIGINS[0]
}

export const GET = createApiHandler(
    async (ctx) => {
        // Chart bytes use the generous `chart` tier (600/min, IP-keyed) like the
        // sibling — CRC's ~6 iPads share one NAT IP and the shared `api` tier
        // (60/min) would 429 mid-service while pre-caching a setlist.
        const limited = await checkRateLimit(ctx.req, 'chart')
        if (limited) return limited

        const id = ctx.params?.id
        const origin = getAllowedOrigin(ctx.req)

        if (!id) {
            return httpError(
                400,
                "invalid_request",
                "Missing file id.",
                {},
                undefined,
                { "Access-Control-Allow-Origin": origin, "Cache-Control": "no-store" },
            )
        }

        // Auth (defense-in-depth, identical to /api/drive/file): a Firebase ID
        // token (ctx.auth), browser Sec-Fetch-* metadata (in-app embeds /
        // prefetch / <audio> — can't attach Bearer headers), OR a `crl_live_`
        // MCP bearer. A bare curl/script with none of these is still blocked.
        let isTrusted = !!ctx.auth || hasBrowserFetchMetadata(ctx.req)
        if (!isTrusted && ctx.req.headers.get("authorization")?.toLowerCase().startsWith("bearer ")) {
            const bearer = await verifyBearer(ctx.req)
            if ("uid" in bearer) isTrusted = true
        }

        try {
            // Resolve bytes by id shape — existence BEFORE the auth gate so a
            // bogus id 404s instead of surfacing a misleading 401 (sibling pattern).
            let body: BodyInit
            let contentType: string
            let servedFrom: string
            const extraHeaders: Record<string, string> = {}

            if (id.startsWith('db-')) {
                // Legacy MusicXML from the digitized_charts collection.
                if (!initAdmin()) {
                    return httpError(
                        500,
                        "server_error",
                        "Server not ready.",
                        { code: "FIREBASE_NOT_INITIALIZED" },
                        undefined,
                        { "Access-Control-Allow-Origin": origin, "Cache-Control": "no-store" },
                    )
                }
                const db = getFirestore()
                const docId = id.replace('db-', '')
                const docSnap = await db.collection("digitized_charts").doc(docId).get()
                const data = docSnap.exists ? docSnap.data() : null
                const xmlContent = data?.xmlContent

                if (!xmlContent) {
                    return notFound(ctx.req, id, origin)
                }

                body = xmlContent as string
                contentType = 'application/vnd.recordare.musicxml+xml'
                servedFrom = 'digitized-charts'
                if (data?.title) {
                    extraHeaders['Content-Disposition'] = `inline; filename="${data.title}.musicxml"`
                }
            } else {
                // upload-* / bare UUID / real Drive id → shared resolver (Storage → Drive fallback).
                const result = await fetchFileById(id)
                if (!result) {
                    return notFound(ctx.req, id, origin)
                }
                body = new Uint8Array(result.buffer)
                contentType = result.contentType
                servedFrom = result.source
            }

            if (!isTrusted) {
                const fwd = ctx.req.headers.get('x-forwarded-for') || ''
                const ip = fwd.split(',')[0]?.trim() || ctx.req.headers.get('x-real-ip') || 'unknown'
                logger.warn(`[LibraryFileProxy] Untrusted request blocked for ${id}`, {
                    secFetchSite: ctx.req.headers.get('sec-fetch-site'),
                    secFetchDest: ctx.req.headers.get('sec-fetch-dest'),
                    referer: ctx.req.headers.get('referer'),
                    ip,
                })
                return httpError(
                    401,
                    "unauthenticated",
                    "Bearer token (or in-app browser fetch metadata) required for chart bytes.",
                    { fileId: id },
                    selectUnauthHint(
                        ctx.req,
                        "Send `Authorization: Bearer <token>` — either a Firebase ID token (signed-in user) or a `crl_live_…` MCP bearer. Or call from the in-app fetch surface where Sec-Fetch-Site / Sec-Fetch-Dest headers identify the request.",
                    ),
                    { "Access-Control-Allow-Origin": origin },
                )
            }

            return new NextResponse(body, {
                status: 200,
                headers: {
                    'Access-Control-Allow-Origin': origin,
                    'Cache-Control': 'public, max-age=86400, s-maxage=604800',
                    'Content-Type': contentType,
                    'X-Served-From': servedFrom,
                    ...extraHeaders,
                },
            })
        } catch (error) {
            logger.error(`[LibraryFileProxy] Unexpected error for ${id}:`, error)
            return httpError(
                502,
                "upstream_unavailable",
                "Chart bytes are temporarily unavailable.",
                { fileId: id },
                "Retry shortly; if the failure persists the underlying Storage / Drive blob may need re-upload.",
                { "Access-Control-Allow-Origin": origin, "Cache-Control": "no-store" },
            )
        }
    },
    { requireAuth: false },
)

function notFound(req: NextRequest, fileId: string, origin: string): NextResponse {
    const context = redactInProduction(
        { fileId, debug: { receivedId: fileId } },
        ["debug"] as const,
    )
    return httpError(
        404,
        "file_not_found",
        "No chart found for the given fileId.",
        context,
        selectUnauthHint(
            req,
            "Verify the fileId via the MCP list_library / get_chart_status tools, or open the chart in-app to confirm it still exists.",
            "The requested chart could not be found.",
        ),
        { "Access-Control-Allow-Origin": origin, "Cache-Control": "no-store" },
    )
}
