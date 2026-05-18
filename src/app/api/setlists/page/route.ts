import { NextRequest, NextResponse } from "next/server"

import { getSetlistsPage } from "@/lib/server-setlists"
import { httpError } from "@/lib/http/error-envelope"
import { checkRateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"

/**
 * Cycle-3.5 P2-004 — cursor-paginated `setlists` page endpoint.
 *
 * The /setlists dashboard SSR ships page-1 via the server component;
 * pages 2+ are loaded on demand via this endpoint when the user clicks
 * "Load more". Firestore reads here are mirrored by the public
 * subscription that already powers the dashboard for realtime updates;
 * this endpoint exists ONLY for the paginated catalog browse path.
 *
 * Auth posture: `setlists` are publicly readable (firestore.rules:86),
 * so the endpoint is open. Rate-limited via the `api` tier to cap abuse.
 *
 * Cursor: ISO date string of the last item on the previous page. Empty
 * / missing cursor → page-1.
 */

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(req: NextRequest) {
    try {
        const limited = await checkRateLimit(req, "api")
        if (limited) return limited

        const { searchParams } = new URL(req.url)
        const cursor = searchParams.get("cursor") || null
        const pageSizeRaw = searchParams.get("pageSize")
        const pageSize = pageSizeRaw ? Number(pageSizeRaw) : 50
        if (!Number.isFinite(pageSize) || pageSize <= 0 || pageSize > 200) {
            return httpError(
                400,
                "invalid_argument",
                "pageSize must be a positive integer between 1 and 200.",
            )
        }

        const page = await getSetlistsPage({ cursor, pageSize })
        return NextResponse.json(page)
    } catch (error: unknown) {
        logger.warn("[setlists/page] fetch failed:", error)
        return httpError(
            500,
            "server_error",
            "Failed to fetch setlists page.",
            {
                debug:
                    error instanceof Error ? error.message : String(error),
            },
        )
    }
}
