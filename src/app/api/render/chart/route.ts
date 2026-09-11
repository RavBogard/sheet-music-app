import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { env } from "@/env.mjs"
import { logger } from "@/lib/logger"
import { httpError } from "@/lib/http/error-envelope"
import {
    renderChartHtml,
    renderSecret,
    SELFTEST_HTML,
    type RenderFormat,
} from "@/lib/chart-render/html-to-pdf"

/**
 * POST /api/render/chart — headless-Chromium render of authored chart HTML.
 *
 * Internal surface: the MCP `create_chart` tool calls it over
 * `INTAKE_INTERNAL_BASE_URL` with the shared secret (`RENDER_SECRET`, falling
 * back to `CRON_SECRET` like the intake executor). Kept as its own route so the
 * Chromium binary is a separate serverless function.
 *
 *   body: { html: string, format: "pdf" | "png", widthPx?, scale? }
 *   200:  bytes, Content-Type per format, X-Page-Count, X-Render-Ms
 *
 * GET /api/render/chart?selftest=1 (same bearer) renders a fixed sample as PNG —
 * the deploy-time proof that Chromium + fonts work on this host.
 */

export const runtime = "nodejs"
export const maxDuration = 60
export const dynamic = "force-dynamic"

const MAX_HTML_BYTES = 512 * 1024

function safeCompare(a: string, b: string): boolean {
    const ab = Buffer.from(a)
    const bb = Buffer.from(b)
    return ab.length === bb.length && timingSafeEqual(ab, bb)
}

function authorized(req: NextRequest): boolean {
    const secret = renderSecret({ ...process.env, CRON_SECRET: env.CRON_SECRET })
    const header = req.headers.get("authorization") ?? ""
    return Boolean(secret) && safeCompare(header, `Bearer ${secret}`)
}

function refuse() {
    return httpError(
        401,
        "unauthenticated",
        "Render route requires the internal RENDER_SECRET bearer.",
        {},
        "This endpoint is called by the MCP create_chart tool; it is not a user surface.",
    )
}

async function respond(html: string, format: RenderFormat, widthPx?: number, scale?: number) {
    const result = await renderChartHtml({ html, format, widthPx, scale })
    return new NextResponse(new Uint8Array(result.bytes), {
        status: 200,
        headers: {
            "Content-Type": result.mimeType,
            "Cache-Control": "no-store",
            "X-Page-Count": String(result.pageCount),
            "X-Render-Ms": String(result.renderMs),
        },
    })
}

export async function GET(req: NextRequest) {
    if (!authorized(req)) return refuse()
    if (req.nextUrl.searchParams.get("selftest") !== "1") {
        return httpError(400, "invalid_argument", "GET supports only ?selftest=1.", {})
    }
    try {
        const format: RenderFormat =
            req.nextUrl.searchParams.get("format") === "pdf" ? "pdf" : "png"
        return await respond(SELFTEST_HTML, format)
    } catch (err) {
        logger.error("[render/chart] selftest failed", err)
        return httpError(
            500,
            "server_error",
            "Chart render self-test failed.",
            { debug: err instanceof Error ? err.message : String(err) },
            "Check `[render/chart]` logs; Chromium may have failed to launch on this host.",
        )
    }
}

export async function POST(req: NextRequest) {
    if (!authorized(req)) return refuse()
    let body: { html?: unknown; format?: unknown; widthPx?: unknown; scale?: unknown }
    try {
        body = (await req.json()) as typeof body
    } catch {
        return httpError(400, "invalid_argument", "Body must be JSON.", {})
    }
    const html = typeof body.html === "string" ? body.html : ""
    if (!html.trim()) return httpError(400, "invalid_argument", "`html` is required.", { field: "html" })
    if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) {
        return httpError(413, "payload_too_large", `html exceeds ${MAX_HTML_BYTES} bytes.`, {})
    }
    const format: RenderFormat = body.format === "png" ? "png" : "pdf"
    const widthPx = typeof body.widthPx === "number" ? body.widthPx : undefined
    const scale = typeof body.scale === "number" ? body.scale : undefined
    try {
        return await respond(html, format, widthPx, scale)
    } catch (err) {
        logger.error("[render/chart] render failed", err)
        return httpError(
            500,
            "server_error",
            "Chart render failed.",
            { debug: err instanceof Error ? err.message : String(err) },
            "Check `[render/chart]` logs in Vercel.",
        )
    }
}
