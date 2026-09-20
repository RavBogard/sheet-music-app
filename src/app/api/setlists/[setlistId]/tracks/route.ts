import { NextRequest, NextResponse } from "next/server"

import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { getTracksForSetlist } from "@/lib/server-tracks"
import { httpError } from "@/lib/http/error-envelope"
import { checkRateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"

/**
 * GET /api/setlists/{setlistId}/tracks — a setlist's rows, for a signed-out
 * reader.
 *
 * WHY THIS EXISTS. R-0919-audit-2 closed collection-wide `list` on `/tracks`:
 * `allow read: if true` at collection level permitted a whole-collection
 * query, for both tenants, to anyone. Single-document `get` stays public so
 * old anonymous links keep working, but a query does not — and
 * `fetchTracksForSetlistClient` is a query
 * (`where("setlistId","==",…)`), run by signed-out `/perform`.
 *
 * So the query moves here, behind the Admin SDK, where the rule that matters
 * ("you may read the rows of ONE setlist you already know the id of") can
 * actually be expressed. Same posture as `/api/setlists/page`: public,
 * rate-limited on the `api` tier, no auth.
 *
 * WHAT THIS IS NOT. It is not a way to enumerate. You need a setlist id to
 * get anything, and a setlist id is what an anonymous /perform link already
 * carries. Nothing here widens what an anonymous visitor could reach before;
 * it narrows it, because the old rule let them read every track of every
 * setlist of every tenant in one request.
 *
 * ORDER IS THE AUTHOR'S (R11-b, 2026-09-16). Rows come back sorted by
 * `order`, ties broken by document id — the same canonical sequence every
 * other reader and writer of this collection uses. This endpoint never
 * re-sorts by anything else and never renumbers.
 *
 * ERRING PUBLIC. A missing setlist returns an empty `tracks` array with
 * `found: false`, not a 404 body the caller has to special-case. A musician
 * seeing an empty Perform view knows something is wrong; a musician seeing a
 * hard error mid-service has one more thing to work out. Same instinct as
 * `PublicSetlistListing`: a service-block is worse than mild confusion.
 */

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(
    req: NextRequest,
    ctx: { params: Promise<{ setlistId: string }> },
) {
    try {
        const limited = await checkRateLimit(req, "api")
        if (limited) return limited

        const { setlistId } = await ctx.params
        if (!setlistId || typeof setlistId !== "string") {
            return httpError(
                400,
                "invalid_argument",
                "A setlist id is required.",
            )
        }

        if (!initAdmin()) {
            return httpError(
                500,
                "server_error",
                "Server not ready.",
                {},
                "Firebase Admin failed to initialise; check the service-account credentials.",
            )
        }
        const db = getFirestore()

        const setlistSnap = await db.collection("setlists").doc(setlistId).get()
        if (!setlistSnap.exists) {
            return NextResponse.json({ found: false, tracks: [] })
        }

        const tracks = await getTracksForSetlist(
            db,
            setlistId,
            setlistSnap.data() as Record<string, unknown>,
        )

        // R11-b: `order`, then id. `getTracksForSetlist` does not sort.
        tracks.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))

        return NextResponse.json({ found: true, tracks })
    } catch (error: unknown) {
        logger.warn("[setlists/tracks] fetch failed:", error)
        return httpError(
            500,
            "server_error",
            "Failed to fetch the setlist's tracks.",
            {
                debug: error instanceof Error ? error.message : String(error),
            },
        )
    }
}
