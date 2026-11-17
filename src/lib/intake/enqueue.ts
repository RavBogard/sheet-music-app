import "server-only"

/**
 * Batch chart intake — handing a committed batch to the processor.
 *
 * POSTs the batch id to `/api/intake/run`, which works the batch inside
 * `after()` and chains to itself until it is done: Vercel functions plus
 * Firestore, no extra service, no extra keys.
 *
 * Never throws. The commit path has already sealed the batch in Firestore by
 * the time it calls this, so a transport failure must come back as a value the
 * caller can report ("committed but not queued — a cron retries"), not an
 * exception that loses the batch id.
 */

import { logger } from "@/lib/logger"
import { triggerHttpRun } from "./http-executor"

export async function enqueueImportBatch(
    batchId: string,
): Promise<
    | { ok: true; eventId: string; executor: "http" }
    | { ok: false; message: string }
> {
    const triggered = await triggerHttpRun(batchId)
    if (!triggered.ok) {
        logger.error(
            `[import-batch] http trigger failed for ${batchId}:`,
            triggered.message,
        )
        return { ok: false, message: triggered.message }
    }
    // There is no upstream id; the stamp is a local trace marker that says
    // which executor ran and when it was handed off.
    return { ok: true, eventId: `http:${batchId}:${Date.now()}`, executor: "http" }
}
