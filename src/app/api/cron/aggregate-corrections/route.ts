import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"

import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import {
    aggregateCorrectionSignals,
    writeCorrectionStats,
} from "@/lib/library/correction-signals"
import { logger } from "@/lib/logger"
import { captureException } from "@/lib/error-reporting"
import { env } from "@/env.mjs"
import { httpError } from "@/lib/http/error-envelope"

/**
 * Cycle-3 c3 — Correction-signal aggregation cron.
 *
 * Runs every 6 hours (Vercel cron config in vercel.json). Re-aggregates
 * every `aiCorrectionSignals/*` document into a single
 * `aiCorrectionStats/latest` snapshot for `get_correction_stats` to read.
 *
 * Idempotent: a fresh aggregation pass overwrites the singleton doc in
 * place; if the signals collection is empty the snapshot still writes
 * (zero counters everywhere) so `get_correction_stats` always returns a
 * concrete shape, never `null`, post-first-run.
 *
 * Auth: same CRON_SECRET / Bearer dance as the other crons.
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
            // Cycle-3 REG-002: rich envelope on the wire.
            return httpError(
                401,
                "unauthenticated",
                "Cron route requires Vercel CRON_SECRET bearer auth.",
                {},
                "This endpoint is invoked by Vercel cron; manual probes will always 401.",
            )
        }

        if (!initAdmin()) {
            return httpError(
                503,
                "server_not_ready",
                "Firebase Admin SDK not initialized.",
                {},
                "Server is missing FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY.",
            )
        }

        logger.info("[Cron] Starting correction-signal aggregation...")
        const db = getFirestore()
        const stats = await aggregateCorrectionSignals(db)
        await writeCorrectionStats(db, stats)
        logger.info(
            `[Cron] Correction-signal aggregation complete: totalSignals=${stats.totalSignals} truncated=${stats.truncated}`,
        )
        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            totalSignals: stats.totalSignals,
            truncated: stats.truncated,
        })
    } catch (error: unknown) {
        logger.error("[Cron] Correction-signal aggregation failed:", error)
        captureException(error, {
            source: "cron",
            location: "aggregate-corrections",
        })
        return httpError(
            500,
            "server_error",
            "Correction-signal aggregation failed.",
            {
                debug:
                    error instanceof Error ? error.message : String(error),
            },
            "Check `[Cron]` logs in Vercel for the underlying error.",
        )
    }
}
