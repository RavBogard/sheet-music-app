import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { FieldValue, Timestamp } from "firebase-admin/firestore"
import { httpError } from "@/lib/http/error-envelope"
import { checkRateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"
import { captureException } from "@/lib/error-reporting"

/**
 * Cycle-3.5 P2-017 — Core Web Vitals observation sink.
 *
 * Client browsers POST one metric report per CWV measurement via
 * `navigator.sendBeacon` (see `src/lib/web-vitals.ts`). We persist each
 * observation into `webVitalsObservations/{auto}` so admins can query
 * field-CWV trends without standing up a third-party RUM service.
 *
 * Posture:
 *   - Public POST. The endpoint is hit by every visitor's browser on
 *     every page-load; we cannot gate on auth without losing unauth
 *     coverage (which is the slowest cohort and the one that matters
 *     most for the marketing surface). Rate-limited via the `api` tier
 *     to cap abuse.
 *   - Validation via Zod — discards anything that doesn't look like a
 *     real web-vitals payload. Bounded fields prevent unbounded writes.
 *   - Rich-error envelope per `[[feedback_mcp_validation_shape]]`
 *     standing rule + cycle-3 REG-002 sweep.
 *   - sendBeacon transport is fire-and-forget: 204 on success, JSON
 *     error envelope on failure (caller never reads the body anyway,
 *     but keep the shape canonical so curl probes behave).
 */

const REPORT_SCHEMA = z.object({
    metric: z.enum(["LCP", "CLS", "INP", "FCP", "TTFB"]),
    value: z.number().finite().min(0).max(1_000_000),
    rating: z.enum(["good", "needs-improvement", "poor"]),
    id: z.string().min(1).max(120),
    navigationType: z.string().max(40).optional(),
    surface: z.string().min(1).max(200),
    deviceType: z.enum(["mobile", "tablet", "desktop", "unknown"]),
})

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(req: NextRequest) {
    try {
        const limited = await checkRateLimit(req, "api")
        if (limited) return limited

        let payload: unknown
        try {
            payload = await req.json()
        } catch {
            return httpError(
                400,
                "invalid_json",
                "Request body must be valid JSON.",
            )
        }

        const parsed = REPORT_SCHEMA.safeParse(payload)
        if (!parsed.success) {
            return httpError(
                400,
                "validation_error",
                "Web-vitals report payload failed validation.",
                { issues: parsed.error.issues },
                "See /api/web-vitals expected shape: {metric, value, rating, id, surface, deviceType, navigationType?}.",
            )
        }

        if (!initAdmin()) {
            return httpError(
                503,
                "server_not_ready",
                "Firebase Admin SDK not initialized.",
            )
        }

        const userAgent = req.headers.get("user-agent")?.slice(0, 300) ?? null
        const ip =
            req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
            req.headers.get("x-real-ip") ||
            null

        const db = getFirestore()
        // ttlAt drives Firestore's per-collection TTL policy (90 days from
        // write time). The field-override on `webVitalsObservations.ttlAt`
        // in `firestore.indexes.json` marks it `ttl:true`; Firestore deletes
        // documents within ~72h after `ttlAt` passes. Keeps the field-data
        // sink unbounded-growth-proof without a sweep cron. C5D-013.
        const WEB_VITALS_TTL_DAYS = 90
        const ttlAt = Timestamp.fromMillis(
            Date.now() + WEB_VITALS_TTL_DAYS * 24 * 60 * 60 * 1000,
        )
        await db.collection("webVitalsObservations").add({
            ...parsed.data,
            userAgent,
            ip,
            timestamp: FieldValue.serverTimestamp(),
            ttlAt,
        })

        return new NextResponse(null, { status: 204 })
    } catch (error: unknown) {
        logger.warn("[web-vitals] write failed:", error)
        captureException(error, {
            source: "api",
            location: "web-vitals",
        })
        return httpError(
            500,
            "server_error",
            "Failed to persist web-vitals observation.",
            {
                debug:
                    error instanceof Error ? error.message : String(error),
            },
        )
    }
}
