import "server-only"

/**
 * Batch chart intake — handing a committed batch to the processor.
 *
 * Two executors, one of which is real in production:
 *
 * - `"http"` (DEFAULT) — POST the batch id to `/api/intake/run`, which works
 *   the batch inside `after()` and chains to itself until it is done. This is
 *   what prod actually runs on: Vercel functions plus Firestore, no extra
 *   service, no extra keys.
 * - `"inngest"` — the original durable-step path. Opt-in, and only when it is
 *   genuinely configured: prod has never had `INNGEST_EVENT_KEY`, and
 *   selecting Inngest without it would make every batch fail to queue.
 *
 * Never throws. The commit path has already sealed the batch in Firestore by
 * the time it calls this, so a transport failure must come back as a value the
 * caller can report ("committed but not queued — a cron retries"), not an
 * exception that loses the batch id.
 */

import { inngest } from "@/inngest/client"
import { logger } from "@/lib/logger"
import { IMPORT_BATCH_EVENT } from "./import-batch-job"
import { triggerHttpRun } from "./http-executor"

export type IntakeExecutor = "http" | "inngest"

/**
 * Which executor this deployment uses. Inngest requires BOTH the opt-in and a
 * usable event key — an opt-in on its own silently degrades to HTTP rather
 * than queueing into a service that isn't there.
 */
export function selectExecutor(
    env: NodeJS.ProcessEnv = process.env,
): IntakeExecutor {
    return env.INTAKE_EXECUTOR === "inngest" && env.INNGEST_EVENT_KEY
        ? "inngest"
        : "http"
}

export async function enqueueImportBatch(
    batchId: string,
): Promise<
    | { ok: true; eventId: string; executor: IntakeExecutor }
    | { ok: false; message: string }
> {
    const executor = selectExecutor()

    if (executor === "http") {
        const triggered = await triggerHttpRun(batchId)
        if (!triggered.ok) {
            logger.error(
                `[import-batch] http trigger failed for ${batchId}:`,
                triggered.message,
            )
            return { ok: false, message: triggered.message }
        }
        // There is no upstream id on this path; the stamp is a local trace
        // marker that says which executor ran and when it was handed off.
        return { ok: true, eventId: `http:${batchId}:${Date.now()}`, executor }
    }

    try {
        const res = await inngest.send({
            name: IMPORT_BATCH_EVENT,
            data: { batchId },
        })
        return { ok: true, eventId: res.ids?.[0] ?? "", executor }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logger.error(`[import-batch] enqueue failed for ${batchId}:`, message)
        return { ok: false, message }
    }
}
