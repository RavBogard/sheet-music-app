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
 * seals the batch in Firestore before queueing it, so an executor outage (HTTP
 * self-trigger or Inngest) can leave a `committed` doc nothing will ever process. This drains those: any
 * batch still `committed` five minutes after commit is re-sent.
 *
 * Auth: same CRON_SECRET / Bearer dance as the other crons.
 */

function safeCompare(a: string, b: string): boolean {
    // Compare BYTE lengths, not string lengths: `timingSafeEqual` throws on
    // unequal-length buffers, and two equal-length strings can encode to
    // different byte counts once either holds a non-ASCII character. A throw
    // here would surface as a 500 on what is simply a wrong secret.
    const left = Buffer.from(a)
    const right = Buffer.from(b)
    if (left.byteLength !== right.byteLength) return false
    return timingSafeEqual(left, right)
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
