import "server-only"

/**
 * Batch chart intake — Firebase Storage staging for batch bytes.
 *
 * Mirrors the single-upload staging helpers in
 * `src/lib/mcp/tools/library-upload-session.ts` (same bucket env resolution,
 * same v4 signed-PUT ceremony, same zero-padded chunk naming) but keyed by
 * `{batchId}/{itemId}` instead of a session id, so one batch's staged objects
 * live under a single deletable prefix.
 *
 * Layout:
 *   upload-batches/{batchId}/{itemId}                  — assembled bytes
 *   upload-batches/{batchId}/{itemId}.chunk-000000     — inline chunk parts
 */

import { getStorage } from "firebase-admin/storage"
import { STAGED_PREFIX } from "./batch-types"

/** Assembled-bytes object path for one item. */
export function stagedObjectPath(batchId: string, itemId: string): string {
    return `${STAGED_PREFIX}/${batchId}/${itemId}`
}

/**
 * Chunk object path. The index is zero-padded to 6 digits so a prefix listing
 * comes back in ascending index order lexicographically.
 */
export function chunkObjectPath(
    batchId: string,
    itemId: string,
    index: number,
): string {
    return `${STAGED_PREFIX}/${batchId}/${itemId}.chunk-${String(index).padStart(6, "0")}`
}

/** Same env resolution as `library-upload-session.ts` `getBucket()`. */
export function getIntakeBucket() {
    const bucketName =
        process.env.FIREBASE_STORAGE_BUCKET ||
        process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
        `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebasestorage.app`
    return getStorage().bucket(bucketName)
}

/** Mint a v4 signed PUT URL for `path`, valid until `expiresAtMs`. */
export async function signPut(
    path: string,
    contentType: string,
    expiresAtMs: number,
): Promise<string> {
    const [url] = await getIntakeBucket().file(path).getSignedUrl({
        action: "write",
        version: "v4",
        expires: expiresAtMs,
        contentType,
    })
    return url
}

/** Existence + byte size of a staged object. `sizeBytes` is 0 when absent. */
export async function statStaged(
    path: string,
): Promise<{ exists: boolean; sizeBytes: number }> {
    const file = getIntakeBucket().file(path)
    const [exists] = await file.exists()
    if (!exists) return { exists: false, sizeBytes: 0 }
    try {
        const [meta] = await file.getMetadata()
        return { exists: true, sizeBytes: Number(meta.size ?? 0) || 0 }
    } catch {
        return { exists: true, sizeBytes: 0 }
    }
}

export async function downloadStaged(path: string): Promise<Buffer> {
    const [bytes] = await getIntakeBucket().file(path).download()
    return Buffer.from(bytes)
}

/** Delete a staged object; a missing object is not an error. */
export async function deleteStaged(path: string): Promise<void> {
    try {
        await getIntakeBucket().file(path).delete()
    } catch (err) {
        const code = (err as { code?: number })?.code
        if (code === 404) return
        // `delete({ ignoreNotFound })` isn't available on every client version;
        // fall back to a message sniff so a swept object never fails cleanup.
        if (err instanceof Error && /No such object|not exist|404/i.test(err.message))
            return
        throw err
    }
}

/** Write one chunk of an item's bytes. */
export async function saveChunk(
    batchId: string,
    itemId: string,
    index: number,
    bytes: Buffer,
): Promise<void> {
    await getIntakeBucket()
        .file(chunkObjectPath(batchId, itemId, index))
        .save(bytes, {
            contentType: "application/octet-stream",
            resumable: false,
        })
}

/**
 * Concatenate an item's chunks into its assembled object.
 *
 * Requires a contiguous 0..n-1 run whose length equals `expectedTotal`;
 * otherwise returns the first index that is missing so the caller can ask for
 * a re-send. Chunk objects are deleted best-effort after a successful
 * assembly — a leftover chunk is a swept blob, never a correctness problem.
 */
export async function assembleChunks(
    batchId: string,
    itemId: string,
    expectedTotal: number,
): Promise<{ ok: true; sizeBytes: number } | { ok: false; missingIndex: number }> {
    const bucket = getIntakeBucket()
    const prefix = `${STAGED_PREFIX}/${batchId}/${itemId}.chunk-`
    const [files] = await bucket.getFiles({ prefix })

    const present = new Set<number>()
    for (const f of files) {
        const suffix = f.name.slice(prefix.length)
        if (!/^\d{6}$/.test(suffix)) continue
        present.add(Number(suffix))
    }

    for (let i = 0; i < expectedTotal; i++) {
        if (!present.has(i)) return { ok: false, missingIndex: i }
    }
    if (present.size !== expectedTotal) {
        // Extra chunks beyond the declared total — treat the first index past
        // the declared run as the mismatch point rather than silently dropping.
        return { ok: false, missingIndex: expectedTotal }
    }

    const parts: Buffer[] = []
    for (let i = 0; i < expectedTotal; i++) {
        const [bytes] = await bucket
            .file(chunkObjectPath(batchId, itemId, i))
            .download()
        parts.push(Buffer.from(bytes))
    }
    const assembled = Buffer.concat(parts)

    await bucket.file(stagedObjectPath(batchId, itemId)).save(assembled, {
        contentType: "application/octet-stream",
        resumable: false,
    })

    await Promise.all(
        Array.from({ length: expectedTotal }, (_, i) =>
            deleteStaged(chunkObjectPath(batchId, itemId, i)).catch(() => undefined),
        ),
    )

    return { ok: true, sizeBytes: assembled.byteLength }
}
