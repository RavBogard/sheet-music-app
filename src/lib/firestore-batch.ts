import type { Firestore, DocumentReference, WriteBatch } from "firebase-admin/firestore"
import { logger } from "@/lib/logger"

const DEFAULT_CHUNK_SIZE = 400 // leaves headroom under Firestore's 500-op batch cap
const DEFAULT_MAX_CONCURRENT = 5

type UpdatePayload = Record<string, unknown>

export type ChunkBatchResult = {
    updated: number
    errors: Error[]
}

/**
 * Applies the same update payload to many doc refs using chunked batched writes.
 *
 * Used for denormalization fan-out (DL-010): when a source field (user displayName,
 * setlist name) changes, every copy in scheduling_assignments must be refreshed.
 * Firestore's WriteBatch caps at 500 operations, so large updates need chunking.
 *
 * Failures inside a chunk do NOT abort the whole fan-out — partial denorm drift is
 * preferable to rolling back a source-doc write that already committed.
 */
export async function chunkBatchUpdate(
    db: Firestore,
    refs: DocumentReference[],
    data: UpdatePayload,
    opts: { chunkSize?: number; maxConcurrent?: number } = {},
): Promise<ChunkBatchResult> {
    const chunkSize = opts.chunkSize ?? DEFAULT_CHUNK_SIZE
    const maxConcurrent = opts.maxConcurrent ?? DEFAULT_MAX_CONCURRENT

    if (refs.length === 0) return { updated: 0, errors: [] }
    if (Object.keys(data).length === 0) return { updated: 0, errors: [] }

    const chunks: DocumentReference[][] = []
    for (let i = 0; i < refs.length; i += chunkSize) {
        chunks.push(refs.slice(i, i + chunkSize))
    }

    const results: ChunkBatchResult = { updated: 0, errors: [] }

    for (let i = 0; i < chunks.length; i += maxConcurrent) {
        const slice = chunks.slice(i, i + maxConcurrent)
        const outcomes = await Promise.allSettled(slice.map(async (chunk) => {
            const batch: WriteBatch = db.batch()
            for (const ref of chunk) batch.update(ref, data)
            await batch.commit()
            return chunk.length
        }))

        for (const outcome of outcomes) {
            if (outcome.status === 'fulfilled') {
                results.updated += outcome.value
            } else {
                const err = outcome.reason instanceof Error ? outcome.reason : new Error(String(outcome.reason))
                results.errors.push(err)
                logger.warn('[chunkBatchUpdate] batch failed:', err.message)
            }
        }
    }

    return results
}
