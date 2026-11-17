import { NextRequest, NextResponse } from "next/server"
import { coerceOrgId } from "@/lib/org/registry"
import { buildToday, readStoredToday, storeToday } from "@/lib/today/emit-today"
import { TODAY_CACHE_CONTROL, type TodayDoc } from "@/lib/today/types"
import { logger } from "@/lib/logger"
import { requireFeature } from "@/lib/org/features"

/**
 * `GET /api/today` — build and serve `today.json` for the request's tenant.
 *
 * Also reachable at `/today.json` via the rewrite in `vercel.json`, which is
 * the path the reader, Overlays and the mixer bridge fetch.
 *
 * Public and anonymous by design. The document is metadata only — service
 * name, day, book slug, start folio, stream URL, the rabbi's already-public
 * title — and both consumers are third-party origins (the siddur reader, the
 * Overlays operator page), so CORS is `*`. That is a deliberate widening of
 * nothing: there is no chart byte, no track, no liturgical text behind this
 * route. See `src/lib/today/types.ts`.
 *
 * BUILT ON REQUEST. The document used to be written to Storage by a 15-minute
 * cron and only read here. It is now built here, from the tenant's own setlists
 * (`x-org-id`, set by the proxy from the host), and the CDN keeps each answer
 * for a minute (`TODAY_CACHE_CONTROL`), so an edit reaches the reader within a
 * minute and Firestore sees at most about one build per tenant per minute.
 *
 * LAST GOOD COPY. Each successful build is also stored at
 * `public/today/<org>.json`. When a build throws or takes longer than
 * `BUILD_TIMEOUT_MS`, that copy is served instead (200, same headers), so a slow
 * or unavailable Firestore costs the consumers freshness, not the file. Only
 * when there is no stored copy either does the route answer 404
 * `{error:"not_found"}` with `no-store`, which both consumers treat as "fall
 * back to the calendar".
 *
 * Multi-tenant phase 6: a tenant with `todayFeed` off gets 404
 * `{error:"feature_off", feature:"todayFeed"}` (same CORS), which both
 * consumers treat like the not-found 404.
 */

export const dynamic = "force-dynamic"

/** A build is a few small reads; past this, answer from the stored copy. */
const BUILD_TIMEOUT_MS = 8_000

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
} as const

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: { ...CORS } })
}

function serve(doc: TodayDoc) {
    return NextResponse.json(doc, {
        status: 200,
        headers: { ...CORS, "Cache-Control": TODAY_CACHE_CONTROL },
    })
}

function buildWithin(org: Parameters<typeof buildToday>[0], ms: number): Promise<TodayDoc> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`build took longer than ${ms}ms`)), ms)
    })
    return Promise.race([buildToday(org), timeout]).finally(() => clearTimeout(timer))
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
        const doc = await buildWithin(org, BUILD_TIMEOUT_MS)
        await storeToday(org, doc)
        return serve(doc)
    } catch (err) {
        logger.warn("[today] build failed — serving the last good copy", {
            org,
            err: err instanceof Error ? err.message : String(err),
        })
    }

    try {
        const stored = await readStoredToday(org)
        if (stored) return serve(stored)
    } catch (err) {
        logger.warn("[today] last good copy unreadable", {
            org,
            err: err instanceof Error ? err.message : String(err),
        })
    }
    return NextResponse.json(
        { error: "not_found" },
        {
            status: 404,
            headers: { ...CORS, "Cache-Control": "no-store" },
        },
    )
}
