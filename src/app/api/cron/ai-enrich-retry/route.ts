import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"

import { initAdmin } from "@/lib/firebase-admin"
import {
    buildDefaultDeps,
    processAiEnrichmentRetryQueue,
} from "@/lib/library/ai-enrichment"
import { logger } from "@/lib/logger"
import { captureException } from "@/lib/error-reporting"
import { env } from "@/env.mjs"

/**
 * Cycle-3 NEW-3 (A3) — AI enrichment retry drain.
 *
 * Runs every 30 minutes (Vercel cron config in vercel.json). Replays
 * library_index rows whose Gemini call failed previously — exponential
 * backoff schedule (5min, 30min, 2h, 6h) before a row gives up and
 * lands on `enrichmentStatus: 'failed'`.
 *
 * Auth: same CRON_SECRET / Bearer dance as the other crons.
 *
 * Distinct from `/api/cron/enrich` (the legacy Gemini enrichment that
 * back-fills `metadata.enrichedAt` via a separate code path). The two
 * systems coexist and don't share state; eventually we may consolidate,
 * but cycle-3 ships them in parallel. (a3-gemini-swap 2026-05-18: both
 * paths now hit Gemini, but via independent modules — see
 * src/lib/library/ai-enrichment.ts vs src/lib/enrichment-engine.ts.)
 */

function safeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false
    return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(req: NextRequest) {
    try {
        const authHeader = req.headers.get("authorization")
        const cronSecret = env.CRON_SECRET
        if (
            !cronSecret ||
            !authHeader ||
            !safeCompare(authHeader, `Bearer ${cronSecret}`)
        ) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        if (!initAdmin()) {
            return NextResponse.json(
                { error: "Server not ready", code: "FIREBASE_NOT_INITIALIZED" },
                { status: 500 },
            )
        }

        logger.info("[Cron] Starting AI enrichment retry drain...")
        const stats = await processAiEnrichmentRetryQueue(buildDefaultDeps())
        logger.info(
            `[Cron] AI enrichment retry drain complete: scanned=${stats.scanned} retried=${stats.retried} skipped=${stats.skipped} failed=${stats.failed}`,
        )
        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            stats,
        })
    } catch (error: unknown) {
        logger.error("[Cron] AI enrichment retry drain failed:", error)
        captureException(error, {
            source: "cron",
            location: "ai-enrich-retry",
        })
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "AI enrichment retry drain failed",
            },
            { status: 500 },
        )
    }
}
