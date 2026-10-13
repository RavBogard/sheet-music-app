import { NextRequest, NextResponse } from "next/server"
import { coerceOrgId } from "@/lib/org/registry"
import { readStoredToday } from "@/lib/today/emit-today"
import { TODAY_CACHE_CONTROL } from "@/lib/today/types"
import { logger } from "@/lib/logger"
import { requireFeature } from "@/lib/org/features"

/**
 * `GET /api/today` — serve the emitted `today.json`.
 *
 * Also reachable at `/today.json` via the rewrite in `vercel.json`, which is
 * the path the reader and Overlays are documented against.
 *
 * Public and anonymous by design. The document is metadata only — service
 * name, day, book slug, start folio, stream URL, the rabbi's already-public
 * title — and both consumers are third-party origins (the siddur reader, the
 * Overlays operator page), so CORS is `*`. That is a deliberate widening of
 * nothing: there is no chart byte, no track, no liturgical text and no
 * unpublished setlist behind this route. See `src/lib/today/types.ts`.
 *
 * 404 with `{error:"not_found"}` before the first emit. Both consumers treat
 * an absent file as "fall back to the calendar", so a 404 is a normal state,
 * not an incident.
 *
 * Multi-tenant phase 6: a tenant with `todayFeed` off gets 404
 * `{error:"feature_off", feature:"todayFeed"}` (same CORS), which both
 * consumers treat like the not-yet-emitted 404.
 */

export const dynamic = "force-dynamic"

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
} as const

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: { ...CORS } })
}

export async function GET(req: NextRequest) {
    const org = coerceOrgId(req.headers.get("x-org-id"))
    const off = await requireFeature(org, "todayFeed")
    if (off) {
        for (const [k, v] of Object.entries(CORS)) off.headers.set(k, v)
        off.headers.set("Cache-Control", TODAY_CACHE_CONTROL)
        return off
    }
    try {
        const doc = await readStoredToday(org)
        if (!doc) {
            return NextResponse.json(
                { error: "not_found" },
                {
                    status: 404,
                    headers: { ...CORS, "Cache-Control": TODAY_CACHE_CONTROL },
                },
            )
        }
        return NextResponse.json(doc, {
            status: 200,
            headers: { ...CORS, "Cache-Control": TODAY_CACHE_CONTROL },
        })
    } catch (err) {
        logger.warn("[today] route read failed", {
            org,
            err: err instanceof Error ? err.message : String(err),
        })
        return NextResponse.json(
            { error: "not_found" },
            {
                status: 404,
                headers: { ...CORS, "Cache-Control": "no-store" },
            },
        )
    }
}
