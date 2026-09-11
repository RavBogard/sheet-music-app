import { after, NextResponse, type NextRequest } from "next/server"
import { timingSafeEqual } from "crypto"

import { getFirestore, initAdmin } from "@/lib/firebase-admin"
import {
    RUN_TIME_BUDGET_MS,
    internalRunSecret,
    runBatchWithDeadline,
    triggerHttpRun,
} from "@/lib/intake/http-executor"
import { logger } from "@/lib/logger"

/**
 * POST /api/intake/run — internal batch executor.
 *
 * The HTTP executor's worker. It answers 202 the moment the request is
 * authenticated and then does the actual importing inside `after()`, which
 * keeps the Vercel function alive after the response has gone out. When the
 * time budget runs out with items left, the runner POSTs this same route again
 * and this invocation exits — state lives in Firestore item statuses, so the
 * next invocation resumes exactly where this one stopped.
 *
 * NOT a public endpoint: it is called by the MCP commit path, by the resume
 * cron, and by itself. Auth is the same bearer dance as the crons, on
 * `INTAKE_RUN_SECRET ?? CRON_SECRET`. With no secret configured the route
 * refuses outright rather than running unauthenticated work.
 *
 * `maxDuration = 300` is the Vercel Pro ceiling (already used by
 * `/api/cron/admin-consistency`); `RUN_TIME_BUDGET_MS` sits 60 s under it so a
 * hand-off always happens before the platform kills the function.
 */

export const dynamic = "force-dynamic"
export const maxDuration = 300

function safeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false
    return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

export async function POST(req: NextRequest) {
    const secret = internalRunSecret()
    if (!secret) {
        logger.error(
            "[intake-run] no INTAKE_RUN_SECRET or CRON_SECRET configured; refusing to run.",
        )
        return NextResponse.json(
            {
                error: "server_misconfigured",
                message:
                    "Intake run route needs INTAKE_RUN_SECRET (or CRON_SECRET) configured.",
            },
            { status: 500 },
        )
    }

    const authHeader = req.headers.get("authorization")
    if (!authHeader || !safeCompare(authHeader, `Bearer ${secret}`)) {
        return NextResponse.json(
            {
                error: "unauthenticated",
                message: "Intake run route requires internal bearer auth.",
            },
            { status: 401 },
        )
    }

    let batchId: unknown
    try {
        batchId = ((await req.json()) as { batchId?: unknown })?.batchId
    } catch {
        batchId = undefined
    }
    if (typeof batchId !== "string" || !batchId) {
        return NextResponse.json(
            { error: "invalid_request", message: "Body must be {batchId: string}." },
            { status: 400 },
        )
    }

    const id = batchId
    // Respond first, work second: the caller (commit path, cron, or a previous
    // invocation of this route) must not be held open for the import.
    after(async () => {
        try {
            initAdmin()
            const res = await runBatchWithDeadline(getFirestore(), id, {
                deadlineAt: Date.now() + RUN_TIME_BUDGET_MS,
                retrigger: triggerHttpRun,
            })
            logger.info(
                `[intake-run] ${id}: processed=${res.processed} remaining=${res.remaining} finalized=${res.finalized}`,
            )
        } catch (err) {
            // `runBatchWithDeadline` is written not to throw; this is the belt to
            // its braces, because an unhandled rejection inside `after()` kills
            // the invocation with no record of which batch it was.
            logger.error(`[intake-run] run threw for ${id}:`, err)
        }
    })

    return NextResponse.json({ accepted: true, batchId: id }, { status: 202 })
}
