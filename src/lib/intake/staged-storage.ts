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

/**
 * "Is this object gone?" — a 404 from the Storage client, whose shape varies
 * by client version (numeric `code`, or only the message).
 */
function isNotFound(err: unknown): boolean {
    if ((err as { code?: number })?.code === 404) return true
    return (
        err instanceof Error && /No such object|not exist|404/i.test(err.message)
    )
}

/**
 * Existence + byte size of a staged object. `sizeBytes` is 0 when absent.
 *
 * A `getMetadata` failure that is NOT a 404 is RETHROWN rather than reported as
 * `{ exists: true, sizeBytes: 0 }`. Swallowing it would hand the commit path a
 * confident "this object is zero bytes", which it would record as a permanent
 * `size_mismatch` failure on a chart whose bytes are in fact fine — a transient
 * Storage outage turned into data loss. The caller catches and asks the
 * operator to retry instead.
 */
export async function statStaged(
    path: string,
): Promise<{ exists: boolean; sizeBytes: number }> {
    const file = getIntakeBucket().file(path)
    const [exists] = await file.exists()
    if (!exists) return { exists: false, sizeBytes: 0 }
    try {
        const [meta] = await file.getMetadata()
        return { exists: true, sizeBytes: Number(meta.size ?? 0) || 0 }
    } catch (err) {
        // Swept between the exists() probe and the metadata read.
        if (isNotFound(err)) return { exists: false, sizeBytes: 0 }
        throw err
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
        // `delete({ ignoreNotFound })` isn't available on every client version,
        // so `isNotFound` sniffs both shapes — a swept object never fails cleanup.
        if (isNotFound(err)) return
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

/**
 * Strict RFC-4648 base64 decode.
 *
 * Copied from `library-upload-session.ts` (deliberate duplication: that module
 * keeps it private and drags the whole single-upload session surface with it)
 * so the batch chunk-append fallback validates bytes identically. `Buffer.from`
 * never throws on malformed base64 — it silently truncates — so the format has
 * to be checked before decoding, or a corrupted chunk lands as a short file.
 */
export function decodeBase64Strict(
    s: string,
): { ok: true; buffer: Buffer } | { ok: false; reason: string } {
    const stripped = s.replace(/\s/g, "")
    if (stripped.length === 0) return { ok: false, reason: "Decoded chunk is empty." }
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(stripped))
        return {
            ok: false,
            reason: "dataBase64 must be standard base64 (RFC 4648). Got non-base64 characters.",
        }
    if (stripped.length % 4 !== 0)
        return {
            ok: false,
            reason: "dataBase64 length must be a multiple of 4 (padded with '=').",
        }
    const buffer = Buffer.from(stripped, "base64")
    if (buffer.byteLength === 0)
        return { ok: false, reason: "Decoded chunk is empty." }
    return { ok: true, buffer }
}
