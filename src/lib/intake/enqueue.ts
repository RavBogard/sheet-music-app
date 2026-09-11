import "server-only"

/**
 * Batch chart intake — sending the batch to the Inngest processor.
 *
 * A thin wrapper around `inngest.send` that never throws: the commit path has
 * already sealed the batch in Firestore by the time it calls this, so a
 * transport failure must come back as a value the caller can report ("batch is
 * committed but not queued — retry"), not an exception that loses the batch id.
 */

import { inngest } from "@/inngest/client"
import { logger } from "@/lib/logger"
import { IMPORT_BATCH_EVENT } from "./import-batch-job"

export async function enqueueImportBatch(
    batchId: string,
): Promise<{ ok: true; eventId: string } | { ok: false; message: string }> {
    try {
        const res = await inngest.send({
            name: IMPORT_BATCH_EVENT,
            data: { batchId },
        })
        return { ok: true, eventId: res.ids?.[0] ?? "" }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logger.error(`[import-batch] enqueue failed for ${batchId}:`, message)
        return { ok: false, message }
    }
}
