/**
 * Batch chart intake — shared types and constants.
 *
 * PURE module: no `server-only`, no firebase-admin, no Node built-ins. The
 * batch-intake browser bundle imports these (type-only for the interfaces,
 * value-wise for the caps and `titleFromFileName`), so this file must stay
 * safe to ship to the client. Everything that touches Firestore or Storage
 * lives in `batch-store.ts` / `staged-storage.ts`.
 *
 * A batch is one Firestore document at `upload_batches/{batchId}` holding a
 * map of items keyed by itemId. The map (rather than a subcollection) keeps
 * the whole batch readable in a single get and lets item mutations recompute
 * `counts` transactionally — see `batch-store.updateItem`.
 */

import type { OrgId } from "@/lib/org/types"
import type { LibraryCollection } from "@/lib/library-upload"
import { extOf } from "@/lib/library/chart-file-types"

/** How the batch's files arrived. */
export type BatchSource = "dropzone" | "drive-folder" | "cli"

/**
 * Batch lifecycle.
 * - `open`       — accepting items / bytes.
 * - `committed`  — sealed by the caller, queued for the Inngest processor.
 * - `processing` — the processor is running items.
 * - `done`       — every item reached a terminal status.
 * - `expired`    — TTL elapsed before commit.
 */
export type BatchStatus = "open" | "committed" | "processing" | "done" | "expired"

/**
 * Item lifecycle. `awaiting-bytes` -> `staged` (bytes landed in Storage) ->
 * `pending` (queued for processChartUpload) -> one of the four terminals
 * (`imported` / `parked` / `failed` / `skipped`).
 */
export type ItemStatus =
    | "awaiting-bytes"
    | "staged"
    | "pending"
    | "imported"
    | "parked"
    | "failed"
    | "skipped"

/** Why an item was parked instead of imported, and which library row it hit. */
export interface ParkedInfo {
    reason: "duplicate_exact" | "duplicate_similar"
    matchedFileId: string
    matchedTitle: string
    /** 1 for an exact name match; fuzzy similarity (0..1) for `duplicate_similar`. */
    score?: number
}

/** A human's resolution of a parked item. */
export interface ItemDecision {
    action: "force" | "skip" | "bind"
    /** Set when `action === "bind"` — the existing library row this item resolves to. */
    boundFileId?: string
    decidedBy: string
    /** ISO-8601. */
    decidedAt: string
}

export interface UploadBatchItem {
    itemId: string
    fileName: string
    mimeType: string
    sizeBytes: number
    title: string
    /** Storage object path holding the staged bytes (dropzone / chunked paths). */
    stagedPath?: string
    /** Drive file id when the batch source is `drive-folder`. */
    driveFileId?: string
    /**
     * Drive provenance captured by the folder listing, passed straight through
     * to `processChartUpload`'s `driveMetadata` so an imported row carries the
     * same `driveMd5` / `driveModifiedTime` the cron drive-sync importer
     * writes. Only ever set alongside `driveFileId`.
     */
    driveMd5Checksum?: string
    driveModifiedTime?: string
    /** Drive parent folder ids reported by the folder listing. */
    driveParents?: string[]
    status: ItemStatus
    /** `library_index` id created on a successful import. */
    resultFileId?: string
    parked?: ParkedInfo
    error?: { code: string; message: string }
    decision?: ItemDecision
    /** ISO-8601, bumped on every mutation. */
    updatedAt: string
}

export interface BatchCounts {
    total: number
    /** awaiting-bytes + staged + pending. */
    pending: number
    imported: number
    parked: number
    failed: number
    skipped: number
}

export interface UploadBatchDoc {
    ownerUid: string
    orgId: OrgId
    source: BatchSource
    status: BatchStatus
    defaults: { collection?: LibraryCollection; tags?: string[] }
    counts: BatchCounts
    items: Record<string, UploadBatchItem>
    createdAt: FirebaseFirestore.Timestamp | Date
    expiresAt: FirebaseFirestore.Timestamp | Date
    committedAt?: FirebaseFirestore.Timestamp | Date
    finishedAt?: FirebaseFirestore.Timestamp | Date
    inngestEventId?: string
}

/** An uncommitted batch is swept 24h after creation. */
export const BATCH_TTL_MS = 24 * 60 * 60 * 1000
/** Signed PUT URLs handed to the dropzone live 15 minutes. */
export const SIGNED_PUT_TTL_MS = 15 * 60 * 1000
export const MAX_ITEMS_PER_BATCH = 200
/** Cap on how many upload URLs one request may mint. */
export const MAX_FILES_PER_URL_REQUEST = 50
export const MAX_ITEM_BYTES = 25 * 1024 * 1024
/** Storage path prefix for staged batch bytes. */
export const STAGED_PREFIX = "upload-batches"
export const BATCH_COLLECTION = "upload_batches"

/**
 * Lowercase hex string of `bytes` random bytes. Uses Web Crypto, which is
 * global in Node 18+ and in every browser — keeps this module Node-import-free.
 */
function randomHex(bytes: number): string {
    const buf = new Uint8Array(bytes)
    globalThis.crypto.getRandomValues(buf)
    let out = ""
    for (const b of buf) out += b.toString(16).padStart(2, "0")
    return out
}

/** `"ub-" + 12 hex`. */
export function newBatchId(): string {
    return `ub-${randomHex(6)}`
}

/** `"it-" + 8 hex`. */
export function newItemId(): string {
    return `it-${randomHex(4)}`
}

/**
 * Default chart title derived from a filename: drop the extension, turn runs
 * of `_` / `-` into a single space, collapse remaining whitespace, trim.
 *
 * `"Mi_Chamocha-Friedman (2).pdf"` becomes `"Mi Chamocha Friedman (2)"`.
 */
export function titleFromFileName(fileName: string): string {
    const trimmed = fileName.trim()
    const ext = extOf(trimmed)
    const stem = ext ? trimmed.slice(0, trimmed.length - ext.length) : trimmed
    return stem
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
}
