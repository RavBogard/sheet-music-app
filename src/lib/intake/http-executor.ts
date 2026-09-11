import "server-only"

/**
 * Batch chart intake — the DEFAULT executor: plain Vercel functions chaining
 * to themselves over HTTP.
 *
 * Why not Inngest: production has no `INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY`
 * and the one registered Inngest function has never been sent an event from
 * anywhere in `src/`. An Inngest-only `enqueueImportBatch` would therefore
 * always come back `queue_unavailable` and every committed batch would sit
 * unprocessed forever. What prod does have is Vercel functions (Pro, so
 * `maxDuration` up to 300 s), Firestore as the state of record, and
 * `after()` from `next/server` to keep a function alive past its response.
 *
 * So: `POST /api/intake/run` answers 202 straight away and then works the
 * batch inside `after()` until `RUN_TIME_BUDGET_MS` is up. If items are left
 * it POSTs itself again and exits; the next invocation picks up where it
 * stopped, because "where it stopped" lives in Firestore item statuses, not in
 * memory. If nothing is left it finalizes the batch.
 *
 * Two invariants hold this together:
 *  1. `runBatchWithDeadline` never throws. It either finalizes or re-triggers,
 *     and a re-trigger that fails is logged, not raised — `/api/cron/import-
 *     batches-resume` sweeps up anything that fell through.
 *  2. Every unit of work is idempotent. `processBatchItem` no-ops on an
 *     already-terminal item, so a duplicate trigger costs one wasted read.
 */

import { logger } from "@/lib/logger"
import { getBatch, setBatchStatus, updateItem } from "./batch-store"
import { finalizeBatch, processBatchItem } from "./import-batch-job"

/** Where a function calls itself back. */
export function intakeRunUrl(env: NodeJS.ProcessEnv = process.env): string {
    const base =
        env.INTAKE_INTERNAL_BASE_URL ??
        (env.VERCEL_PROJECT_PRODUCTION_URL
            ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`
            : env.VERCEL_URL
              ? `https://${env.VERCEL_URL}`
              : "http://localhost:3000")
    return `${base}/api/intake/run`
}

/**
 * The shared secret the run route demands. `INTAKE_RUN_SECRET` lets the
 * executor be rotated independently of cron; absent that it rides on
 * `CRON_SECRET`, which is already configured in prod — so the feature works on
 * deploy without a new env var, and can be separated later without a code
 * change.
 */
export function internalRunSecret(
    env: NodeJS.ProcessEnv = process.env,
): string | undefined {
    return env.INTAKE_RUN_SECRET ?? env.CRON_SECRET
}

/** How long an invocation may work before handing off. 60 s under maxDuration 300. */
export const RUN_TIME_BUDGET_MS = 240_000

/** How long the self-POST waits for the 202 before giving up on it. */
const TRIGGER_TIMEOUT_MS = 10_000

/**
 * Ask a fresh invocation to run (or keep running) a batch.
 *
 * Returns a value rather than throwing for the same reason `enqueueImportBatch`
 * does: every caller has already written the batch to Firestore and needs to
 * report "committed but not queued", not lose the id to an exception.
 */
export async function triggerHttpRun(
    batchId: string,
    deps: { fetch?: typeof fetch; env?: NodeJS.ProcessEnv } = {},
): Promise<{ ok: true } | { ok: false; message: string }> {
    const env = deps.env ?? process.env
    const doFetch = deps.fetch ?? globalThis.fetch
    const secret = internalRunSecret(env)
    if (!secret) {
        return {
            ok: false,
            message:
                "No INTAKE_RUN_SECRET or CRON_SECRET configured; refusing to trigger the intake run route.",
        }
    }

    const url = intakeRunUrl(env)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TRIGGER_TIMEOUT_MS)
    try {
        const res = await doFetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${secret}`,
            },
            body: JSON.stringify({ batchId }),
            signal: controller.signal,
        })
        if (res.status !== 202) {
            return {
                ok: false,
                message: `Intake run route at ${url} responded ${res.status}.`,
            }
        }
        return { ok: true }
    } catch (err) {
        return {
            ok: false,
            message: err instanceof Error ? err.message : String(err),
        }
    } finally {
        clearTimeout(timer)
    }
}

export interface RunBatchWithDeadlineResult {
    /** Items this invocation attempted (terminal or not). */
    processed: number
    /** Items still `staged`/`pending` when the invocation stopped. */
    remaining: number
    /** True when this invocation closed the batch out. */
    finalized: boolean
}

/**
 * Work a batch until the deadline, then either finalize it or hand the rest to
 * a fresh invocation.
 *
 * NEVER THROWS. Every exit path leaves the batch either `done` or `processing`
 * with a re-trigger attempted, and a failed re-trigger is logged so the resume
 * cron (which now also sweeps stale `processing` batches) can take over.
 *
 * Items are visited in `itemId` order for the same reason the Inngest runner
 * does it: a resumed invocation walks the same sequence, so "where we got to"
 * is reconstructible from item statuses alone.
 */
export async function runBatchWithDeadline(
    db: FirebaseFirestore.Firestore,
    batchId: string,
    opts: { deadlineAt: number; retrigger: (batchId: string) => Promise<unknown> },
): Promise<RunBatchWithDeadlineResult> {
    const idle: RunBatchWithDeadlineResult = {
        processed: 0,
        remaining: 0,
        finalized: false,
    }

    let queued: string[]
    try {
        const batch = await getBatch(db, batchId)
        if (!batch) {
            logger.warn(`[intake-run] batch ${batchId} not found; nothing to run.`)
            return idle
        }
        if (batch.status !== "committed" && batch.status !== "processing") {
            // `open` is not sealed yet, `done`/`expired` are over. A trigger for
            // any of them is a duplicate, not work.
            return idle
        }
        queued = Object.values(batch.items)
            .filter((i) => i.status === "staged" || i.status === "pending")
            .map((i) => i.itemId)
            .sort()
        if (batch.status !== "processing") {
            await setBatchStatus(db, batchId, "processing")
        }
    } catch (err) {
        logger.error(`[intake-run] could not start batch ${batchId}:`, err)
        return idle
    }

    let processed = 0
    for (const itemId of queued) {
        if (Date.now() > opts.deadlineAt) break
        processed += 1
        try {
            await processBatchItem(db, batchId, itemId)
        } catch (err) {
            // processBatchItem records its own failures; getting here means it
            // could not even write that down (Firestore blip, item vanished).
            // One bad item must never cost the rest of the batch.
            const message = err instanceof Error ? err.message : String(err)
            logger.error(
                `[intake-run] item ${batchId}/${itemId} escaped its own guard:`,
                message,
            )
            await updateItem(db, batchId, itemId, {
                status: "failed",
                error: { code: "internal", message },
            }).catch((writeErr) =>
                logger.error(
                    `[intake-run] could not record ${batchId}/${itemId} as failed:`,
                    writeErr,
                ),
            )
        }
    }

    let remaining = 0
    try {
        const after = await getBatch(db, batchId)
        remaining = Object.values(after?.items ?? {}).filter(
            (i) => i.status === "staged" || i.status === "pending",
        ).length
    } catch (err) {
        // Can't tell — assume there is more to do and let the re-trigger (or the
        // resume cron) find out. Better a wasted invocation than a stranded batch.
        logger.error(`[intake-run] could not re-read batch ${batchId}:`, err)
        remaining = Math.max(queued.length - processed, 1)
    }

    if (remaining === 0) {
        try {
            await finalizeBatch(db, batchId)
            return { processed, remaining: 0, finalized: true }
        } catch (err) {
            logger.error(`[intake-run] finalize failed for ${batchId}:`, err)
            return { processed, remaining: 0, finalized: false }
        }
    }

    try {
        await opts.retrigger(batchId)
    } catch (err) {
        logger.error(
            `[intake-run] re-trigger failed for ${batchId} (${remaining} item(s) left); the resume cron will pick it up:`,
            err,
        )
    }
    return { processed, remaining, finalized: false }
}
