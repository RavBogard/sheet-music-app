import { NextResponse, type NextRequest } from "next/server"
import { richError } from "@/lib/mcp/error-envelopes"

/**
 * Catch-all route handler for unmatched `/api/*` paths.
 *
 * Cycle-3 cowork found that `/api/admin/library-review` (bare prefix,
 * no segment) returned Next's default 24 KB HTML 404. The same is true
 * for any typo or path the routing table doesn't claim — MCP callers,
 * Daniel + David's Claude Desktop sessions, and cycle-N regression
 * probes can't parse HTML.
 *
 * In the App Router, dynamic `[...catchall]` segments have the LOWEST
 * routing specificity — Next picks any more-specific static or single-
 * dynamic-segment route first, so a real /api/health, /api/version,
 * /api/auth/test-session, /api/admin/library-review/queue, etc. still
 * hit their dedicated handlers. This file activates only when nothing
 * else matched.
 *
 * Browser-typed /api/* URLs that fall here will also get JSON — that's
 * fine, those were always API URLs and JSON is at least informative.
 * Non-/api paths fall through to the root `app/not-found.tsx` HTML.
 *
 * Shape mirrors the standing rich-error envelope (cycle-2 REG-001 +
 * cycle-3 REG-002). machine_code `route_not_found`. Cache-Control:
 * no-store so a bad path doesn't pollute CDN caches.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function envelope(req: NextRequest): NextResponse {
    const pathname = req.nextUrl.pathname
    const method = req.method
    const res = NextResponse.json(
        richError(
            "route_not_found",
            `No handler at ${method} ${pathname}.`,
            { path: pathname, method },
            "Check the path against your MCP/HTTP route table. /api/* paths must hit a registered handler — see /api/health, /api/version, /api/auth/test-session, /api/admin/library-review/{queue,accept,reject,edit,retry,dismiss}, /api/drive/file/[fileId], /api/cron/{drive-sync,ai-enrich-retry,aggregate-corrections,sync}, /api/mcp/oauth/*. Brand-new API routes need a route.ts under src/app/api/<path>/.",
        ),
        { status: 404 },
    )
    res.headers.set("Cache-Control", "no-store")
    return res
}

export async function GET(req: NextRequest): Promise<NextResponse> {
    return envelope(req)
}

export async function POST(req: NextRequest): Promise<NextResponse> {
    return envelope(req)
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
    return envelope(req)
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
    return envelope(req)
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
    return envelope(req)
}

export async function HEAD(req: NextRequest): Promise<NextResponse> {
    return envelope(req)
}

export async function OPTIONS(req: NextRequest): Promise<NextResponse> {
    return envelope(req)
}
