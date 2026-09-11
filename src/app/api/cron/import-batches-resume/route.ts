import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"
import { getFirestore } from "firebase-admin/firestore"

import { initAdmin } from "@/lib/firebase-admin"
import { resumeStuckBatches } from "@/lib/intake/resume-stuck-batches"
import { logger } from "@/lib/logger"
import { captureException } from "@/lib/error-reporting"
import { env } from "@/env.mjs"
import { httpError } from "@/lib/http/error-envelope"

/**
 * Batch chart intake — stuck-batch resume sweep.
 *
 * Runs every 10 minutes (Vercel cron config in vercel.json). `commit_upload_batch`
 * seals the batch in Firestore before queueing it, so an Inngest outage can
 * leave a `committed` doc nothing will ever process. This drains those: any
 * batch still `committed` five minutes after commit is re-sent.
 *
 * Auth: same CRON_SECRET / Bearer dance as the other crons.
 */

function safeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false
    return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(req: NextRequest) {
    try {
        const authHeader = req.headers.get("authorization")
        const cronSecret = env.CRON_SECRET
        if (
            !cronSecret ||
            !authHeader ||
            !safeCompare(authHeader, `Bearer ${cronSecret}`)
        ) {
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

        const { resent } = await resumeStuckBatches(getFirestore())
        logger.info(
            `[Cron] import-batches-resume complete: resent=${resent.length}`,
        )
        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            resent,
        })
    } catch (error: unknown) {
        logger.error("[Cron] import-batches-resume failed:", error)
        captureException(error, {
            source: "cron",
            location: "import-batches-resume",
        })
        return httpError(
            500,
            "server_error",
            "Stuck-batch resume sweep failed.",
            {
                debug: error instanceof Error ? error.message : String(error),
            },
            "Check `[Cron]` logs in Vercel; a missing upload_batches composite index surfaces here as FAILED_PRECONDITION.",
        )
    }
}
