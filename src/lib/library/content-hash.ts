import { createHash } from "node:crypto"

/**
 * W4 of the content-hash order (R-0903-live-cw-2 §3) — the library's
 * content-identity column.
 *
 * ─── why sha256 of the stored bytes, and not the free metadata md5 ──────────
 * Four hash values already existed in this codebase before this file, and
 * they are NOT interchangeable [measured on the mount by `live-cw`,
 * 2026-09-03]:
 *
 *   - `library-upload.ts` computes sha256 of every uploaded buffer — and
 *     spends it on an `aiEnrichmentCache` doc id and an event payload.
 *   - `chart-heal.ts` computes sha256 of canonical bytes for the same cache.
 *   - Drive rows persist `driveMd5` (Drive's `md5Checksum`, HEX).
 *   - Storage exposes `md5Hash` (BASE64), already read by
 *     `firebase-storage.ts`.
 *
 * The authoritative value is **sha256 of the stored bytes**. The free
 * metadata md5 is refused as the KEY for one decisive reason: it is not
 * uniform. Google-Apps rows carry no `md5Checksum` at all, so a column
 * holding "whichever hash was cheapest for this row" would silently split a
 * true pair whose two rows were hashed by different routes — producing a
 * confident non-match, which is worse than an absence.
 *
 * And the sha256 that already exists cannot be recovered without re-reading
 * the bytes: the cache doc stores `contentHash`, `output`, `model`,
 * `cachedAt` and **no row reference**. So the backfill reads bytes once per
 * row, and pays that price exactly once — which is the reason new uploads
 * set the column on the write path, where the buffer is already in hand and
 * the hash is free.
 *
 * ─── why the md5 is still worth computing ───────────────────────────────────
 * Not as the key — as a CROSS-CHECK. Where a row already claims a
 * `driveMd5` or a Storage `md5Hash`, the md5 recomputed from the bytes we
 * just downloaded must equal it. A mismatch does not mean the hash is
 * stale; it means we did not fetch the bytes this row claims, and writing a
 * sha256 for those bytes would make a FALSE PAIR confidently. So a mismatch
 * writes no hash at all and records the row as `hashFailed` with a reason.
 */

/** The persisted shape of `library_index.contentHash`. */
export interface ContentHash {
    /** Always `"sha256"` today. Named so a future migration is legible. */
    alg: "sha256"
    /** Lowercase hex digest of the stored bytes. */
    value: string
    /**
     * Byte length of what was hashed. Doubles as the resumability key: a row
     * whose recorded `sizeBytes` still matches its `fileSize` needs no
     * re-read, so a re-run costs nothing and an interrupted run resumes.
     */
    sizeBytes: number
    /** ISO timestamp of the hashing. */
    at: string
    /** Where the bytes came from, so a later reader can judge the value. */
    source: "upload" | "firebase-storage" | "google-drive-fallback"
}

/** Why a row has no `contentHash`. Recorded, never silently skipped. */
export type HashFailureReason =
    /** Bytes could not be fetched at all (dead-byte rows, gapps rows). */
    | "bytes_unreachable"
    /** A metadata md5 exists and disagrees with the bytes we downloaded. */
    | "md5_mismatch"
    /** The fetch returned an empty buffer. */
    | "empty_buffer"

export interface HashFailure {
    reason: HashFailureReason
    /** Human-readable detail — the mismatching values, the fetch error. */
    detail: string
    at: string
}

/** sha256 hex of a buffer. The one place the algorithm is named. */
export function sha256Hex(buffer: Buffer): string {
    return createHash("sha256").update(buffer).digest("hex")
}

/** md5 of a buffer in BOTH encodings the codebase stores it in. */
export function md5Both(buffer: Buffer): { hex: string; base64: string } {
    // Two digests, not one converted — `createHash` is consumed by `digest`,
    // so the buffer is hashed twice rather than the digest re-encoded. Cheap
    // at these sizes and impossible to get wrong.
    return {
        hex: createHash("md5").update(buffer).digest("hex"),
        base64: createHash("md5").update(buffer).digest("base64"),
    }
}

/** Build the persisted column from bytes in hand. */
export function contentHashFor(
    buffer: Buffer,
    source: ContentHash["source"],
    now: string = new Date().toISOString(),
): ContentHash {
    return {
        alg: "sha256",
        value: sha256Hex(buffer),
        sizeBytes: buffer.byteLength,
        at: now,
        source,
    }
}

/**
 * The md5 cross-check. Returns `null` when the row makes no md5 claim (which
 * is not a failure — most rows make none), the matching encoding when it
 * agrees, and a mismatch description when it does not.
 *
 * `driveMd5` is Drive's `md5Checksum` and is HEX; Storage's `md5Hash` is
 * BASE64. Comparing the wrong pair would report every Drive row as a
 * mismatch, so both encodings are computed and each claim is compared
 * against its own.
 */
export function crossCheckMd5(
    buffer: Buffer,
    claims: { driveMd5?: unknown; storageMd5Hash?: unknown },
): { checked: false } | { checked: true; ok: true } | { checked: true; ok: false; detail: string } {
    const { hex, base64 } = md5Both(buffer)
    const drive =
        typeof claims.driveMd5 === "string" && claims.driveMd5.length > 0
            ? claims.driveMd5.toLowerCase()
            : null
    const storage =
        typeof claims.storageMd5Hash === "string" &&
        claims.storageMd5Hash.length > 0
            ? claims.storageMd5Hash
            : null

    if (!drive && !storage) return { checked: false }

    const problems: string[] = []
    if (drive && drive !== hex) {
        problems.push(`driveMd5 claims ${drive}, bytes hash to ${hex} (hex)`)
    }
    if (storage && storage !== base64) {
        problems.push(
            `Storage md5Hash claims ${storage}, bytes hash to ${base64} (base64)`,
        )
    }
    if (problems.length > 0) {
        return { checked: true, ok: false, detail: problems.join("; ") }
    }
    return { checked: true, ok: true }
}

/**
 * Resumability: does this row already carry a usable hash?
 *
 * The test is deliberately `sizeBytes` against the row's own `fileSize`
 * rather than mere presence. A row whose bytes were replaced under it (a
 * re-upload to the same id, a heal) has a stale hash, and its size is the
 * cheapest available signal that something moved — no byte read required to
 * decide whether a byte read is needed.
 */
export function hashIsCurrent(
    existing: unknown,
    rowFileSize: unknown,
): boolean {
    if (!existing || typeof existing !== "object") return false
    const h = existing as Partial<ContentHash>
    if (h.alg !== "sha256") return false
    if (typeof h.value !== "string" || h.value.length !== 64) return false
    if (typeof h.sizeBytes !== "number") return false
    // No recorded fileSize on the row: presence of a well-formed hash is all
    // we can ask, so accept it rather than re-reading every such row forever.
    if (typeof rowFileSize !== "number") return true
    return h.sizeBytes === rowFileSize
}
