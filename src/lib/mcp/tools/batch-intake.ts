import "server-only"

/**
 * Batch chart intake — the seven MCP tool implementations.
 *
 * THE INVARIANT THIS MODULE EXISTS TO PROTECT: **Claude never carries chart
 * bytes.** Every function here is metadata-only. Bytes move browser→Storage
 * over a signed PUT the server minted, or Drive→server inside the Inngest
 * processor. The one exception is `appendBatchItemChunk`, the CSP fallback the
 * drop-zone iframe uses when a direct PUT is blocked — and even that is
 * host→server, never model→server.
 *
 * Every result is small by construction (ids, counts, ≤ 20 imported rows
 * unless the caller explicitly asks for all of them), because a tool result is
 * conversation context.
 *
 * Shape contract: every export is
 * `(uid: string, org: OrgId, args) => Promise<Result | RichErrorEnvelope>`.
 * Nothing throws — a store-level `Error("batch_not_found")` is translated by
 * `mapStoreError` into the matching rich envelope, so the MCP wrapper never
 * has to catch.
 *
 * Tenancy: `orgId` comes from the verified bearer via `orgFrom(extra)` at the
 * registration layer and is never read off the arguments. A batch is
 * addressable only by its owner (admins may additionally read and resolve),
 * and cross-tenant access is refused even for a correct batch id.
 */

import { getFirestore, initAdmin } from "@/lib/firebase-admin"
import { checkUserRateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"
import {
    isRichError,
    richError,
    type RichErrorEnvelope,
} from "@/lib/mcp/error-envelopes"
import type { LibraryCollection } from "@/lib/library-upload"
import type { OrgId } from "@/lib/org/types"
import { DriveClient } from "@/lib/google-drive"
import {
    ACCEPTED_CHART_EXTENSIONS,
    resolveChartMime,
} from "@/lib/library/chart-file-types"

import {
    curatedCatalogGate,
    isTrustedLeader,
    isUploadAllowed,
    loadUploader,
    rateLimitEnvelope,
    uploadForbidden,
    type UploaderRoles,
} from "./uploader-roles"

import {
    MAX_FILES_PER_URL_REQUEST,
    MAX_ITEM_BYTES,
    MAX_ITEMS_PER_BATCH,
    SIGNED_PUT_TTL_MS,
    newItemId,
    titleFromFileName,
    type UploadBatchDoc,
    type UploadBatchItem,
} from "@/lib/intake/batch-types"
import {
    addItems,
    createBatch,
    getBatch,
    listParkedForOrg,
    setBatchStatus,
    updateItem,
} from "@/lib/intake/batch-store"
import {
    assembleChunks,
    decodeBase64Strict,
    deleteStaged,
    saveChunk,
    signPut,
    stagedObjectPath,
    statStaged,
} from "@/lib/intake/staged-storage"
import {
    classifyDriveFailure,
    listDriveFolderCharts,
} from "@/lib/intake/drive-folder"
import { processBatchItem } from "@/lib/intake/import-batch-job"
import { enqueueImportBatch } from "@/lib/intake/enqueue"
import type {
    AppendChunkResult,
    AttentionRow,
    CommitBatchResult,
    GetBatchResult,
    ImportDriveFolderDryRunResult,
    ImportDriveFolderResult,
    OpenDropzoneResult,
    ParkedListResult,
    RequestUrlsFile,
    RequestUrlsResult,
    ResolveItemResult,
} from "@/lib/intake/wire-types"

// ─── caps ────────────────────────────────────────────────────────────────────

/** Per-call ceiling for the chunk fallback — one Vercel request body. */
export const MAX_CHUNK_BYTES = 3 * 1024 * 1024
/** How many imported rows a `get_upload_batch` result carries by default. */
export const MAX_IMPORTED_ROWS = 20
/** Default / ceiling for `list_parked_uploads`. */
export const DEFAULT_PARKED_LIMIT = 50

// ─── shared plumbing ─────────────────────────────────────────────────────────

function db(): FirebaseFirestore.Firestore {
    initAdmin()
    return getFirestore()
}

/** Firestore Timestamp | Date | ISO string → ISO string. */
function toIso(value: unknown): string {
    if (!value) return ""
    if (value instanceof Date) return value.toISOString()
    if (typeof value === "string") return value
    const maybe = value as { toDate?: () => Date }
    if (typeof maybe.toDate === "function") return maybe.toDate().toISOString()
    return ""
}

/**
 * Translate the four sentinel errors `batch-store.ts` throws into rich
 * envelopes carrying the same machine code. `errorCode` is passed explicitly
 * because these codes are not in `ERROR_CODE_MAP` and would otherwise default
 * to 500 — which an LLM caller reads as "transient, retry" rather than "this
 * batch is gone / already sealed".
 */
function mapStoreError(err: unknown, batchId: string): RichErrorEnvelope {
    const message = err instanceof Error ? err.message : String(err)
    switch (message) {
        case "batch_not_found":
            return richError(
                "batch_not_found",
                `Upload batch ${batchId} does not exist (it may have expired — batches live 24 hours).`,
                { batchId, errorCode: 404 },
                "Open a new batch with open_chart_dropzone.",
            )
        case "item_not_found":
            return richError(
                "item_not_found",
                `Batch ${batchId} has no such item.`,
                { batchId, errorCode: 404 },
                "Call get_upload_batch to see the current item ids.",
            )
        case "batch_not_open":
            return richError(
                "batch_not_open",
                `Upload batch ${batchId} is no longer accepting new files.`,
                { batchId, errorCode: 409 },
                "Open a new batch with open_chart_dropzone.",
            )
        case "batch_full":
            return richError(
                "batch_full",
                `Upload batch ${batchId} already holds the maximum of ${MAX_ITEMS_PER_BATCH} files.`,
                { batchId, errorCode: 409 },
                "Commit this batch and open another for the remaining files.",
            )
        default:
            logger.error(
                `[batch-intake] unexpected store error on ${batchId}:`,
                message,
            )
            return richError(
                "batch_write_failed",
                `Could not update upload batch ${batchId}: ${message}`,
                { batchId },
                "Retry; if it persists, surface the batchId to an admin.",
            )
    }
}

function notFoundEnvelope(batchId: string): RichErrorEnvelope {
    return mapStoreError(new Error("batch_not_found"), batchId)
}

function forbiddenBatch(batchId: string): RichErrorEnvelope {
    return richError(
        "forbidden",
        `Upload batch ${batchId} belongs to another user.`,
        { batchId, errorCode: 403 },
        "Only the person who opened a batch (or an admin) can act on it.",
    )
}

type LoadedBatch = UploadBatchDoc & { batchId: string }

/**
 * Load a batch and enforce access. `allowAdmin` widens the check to any admin
 * (read + resolve paths); the write paths stay owner-only.
 *
 * Cross-tenant access is refused with the SAME envelope as a wrong owner, so a
 * caller can't use the error shape to probe whether a batch id exists in
 * another org.
 */
async function loadOwned(
    store: FirebaseFirestore.Firestore,
    batchId: string,
    uid: string,
    org: OrgId,
    roles: UploaderRoles,
    opts?: { allowAdmin?: boolean },
): Promise<LoadedBatch | RichErrorEnvelope> {
    // Callers narrow the union with `isRichError`, never with an `in` check:
    // the refusal envelopes below carry `batchId` as an extra, so `"batchId" in
    // result` is true for BOTH branches.
    if (!batchId?.trim())
        return richError("invalid_argument", "batchId is required.", {
            field: "batchId",
        })

    const batch = await getBatch(store, batchId)
    if (!batch) return notFoundEnvelope(batchId)

    if (batch.orgId !== org) return forbiddenBatch(batchId)

    const isOwner = batch.ownerUid === uid
    const isAdmin = opts?.allowAdmin === true && roles.role === "admin"
    if (!isOwner && !isAdmin) return forbiddenBatch(batchId)

    return batch
}

/** Drop undefined-valued keys so the wire result has no `"x": undefined`. */
function defaultsOf(
    collection: LibraryCollection | undefined,
    tags: string[] | undefined,
): { collection?: LibraryCollection; tags?: string[] } {
    return {
        ...(collection ? { collection } : {}),
        ...(tags && tags.length > 0 ? { tags } : {}),
    }
}

// ─── open_chart_dropzone ─────────────────────────────────────────────────────

export interface OpenDropzoneArgs {
    collection?: LibraryCollection
    tags?: string[]
    /** `"cli"` marks a batch driven by scripts/upload-batch.mjs, not the iframe. */
    source?: "dropzone" | "cli"
}

/**
 * Create an empty, open batch and hand back the caps the client needs to filter
 * files BEFORE uploading anything. Consumes one `upload` rate-limit token
 * (trusted leaders bypass), because it is the entry point a runaway agent would
 * hammer.
 */
export async function openChartDropzone(
    uid: string,
    org: OrgId,
    args: OpenDropzoneArgs,
): Promise<OpenDropzoneResult | RichErrorEnvelope> {
    const store = db()

    const roles = await loadUploader(store, uid)
    if (!isUploadAllowed(roles)) return uploadForbidden(roles)

    const curated = curatedCatalogGate(roles, args.collection)
    if (curated) return curated

    const limited = await checkUserRateLimit(uid, "upload", {
        bypass: isTrustedLeader(roles),
    })
    if (limited) return rateLimitEnvelope(limited.error)

    const defaults = defaultsOf(args.collection, args.tags)
    const { batchId, expiresAt } = await createBatch(store, {
        ownerUid: uid,
        orgId: org,
        source: args.source === "cli" ? "cli" : "dropzone",
        defaults,
    })

    return {
        ok: true,
        batchId,
        expiresAt: expiresAt.toISOString(),
        defaults,
        maxFileBytes: MAX_ITEM_BYTES,
        acceptedExtensions: ACCEPTED_CHART_EXTENSIONS,
        maxFilesPerRequest: MAX_FILES_PER_URL_REQUEST,
    }
}

// ─── request_batch_upload_urls ───────────────────────────────────────────────

export interface RequestBatchUploadUrlsArgs {
    batchId: string
    files: RequestUrlsFile[]
}

/**
 * Mint one signed PUT URL per acceptable file and record the items as
 * `awaiting-bytes`.
 *
 * Files that fail the type or size check are REPORTED, not refused: a drop of
 * twelve files where one is a .docx should upload eleven charts and tell the
 * operator about the twelfth, not fail the whole gesture.
 *
 * ONE rate-limit token per call, not per file — the cost being limited is the
 * round trip, and the 50-file ceiling already bounds the work.
 */
export async function requestBatchUploadUrls(
    uid: string,
    org: OrgId,
    args: RequestBatchUploadUrlsArgs,
): Promise<RequestUrlsResult | RichErrorEnvelope> {
    const files = args.files
    if (!Array.isArray(files) || files.length === 0)
        return richError("invalid_argument", "files must be a non-empty array.", {
            field: "files",
        })
    if (files.length > MAX_FILES_PER_URL_REQUEST)
        return richError(
            "invalid_argument",
            `files holds ${files.length} entries; at most ${MAX_FILES_PER_URL_REQUEST} URLs may be minted per call.`,
            { field: "files", maxFilesPerRequest: MAX_FILES_PER_URL_REQUEST },
            "Split the drop into batches of 50 and call again with the same batchId.",
        )

    const store = db()
    const roles = await loadUploader(store, uid)

    const batch = await loadOwned(store, args.batchId, uid, org, roles)
    if (isRichError(batch)) return batch
    if (batch.status !== "open")
        return mapStoreError(new Error("batch_not_open"), args.batchId)
    if (Object.keys(batch.items ?? {}).length + files.length > MAX_ITEMS_PER_BATCH)
        return mapStoreError(new Error("batch_full"), args.batchId)

    const limited = await checkUserRateLimit(uid, "upload", {
        bypass: isTrustedLeader(roles),
    })
    if (limited) return rateLimitEnvelope(limited.error)

    const expiresAtMs = Date.now() + SIGNED_PUT_TTL_MS
    const expiresAt = new Date(expiresAtMs).toISOString()

    const items: UploadBatchItem[] = []
    const minted: RequestUrlsResult["items"] = []
    const rejected: RequestUrlsResult["rejected"] = []

    for (const file of files) {
        const fileName = (file?.fileName ?? "").trim()
        if (!fileName) {
            rejected.push({
                fileName: String(file?.fileName ?? ""),
                reason: "unsupported_type",
            })
            continue
        }
        const sizeBytes = Number(file.sizeBytes)
        const mime = resolveChartMime(fileName, file.mimeType)
        if (!mime) {
            rejected.push({ fileName, reason: "unsupported_type" })
            continue
        }
        if (!Number.isFinite(sizeBytes) || sizeBytes > MAX_ITEM_BYTES) {
            rejected.push({ fileName, reason: "too_large" })
            continue
        }

        const itemId = newItemId()
        const stagedPath = stagedObjectPath(args.batchId, itemId)

        let uploadUrl: string
        try {
            uploadUrl = await signPut(stagedPath, mime, expiresAtMs)
        } catch (err) {
            logger.warn("[batch-intake] signed PUT minting failed", {
                batchId: args.batchId,
                fileName,
                err: err instanceof Error ? err.message : String(err),
            })
            return richError(
                "storage_signing_failed",
                `Could not mint a signed upload URL: ${
                    err instanceof Error ? err.message : String(err)
                }`,
                { batchId: args.batchId },
                "Retry; if the failure persists the Storage bucket may be misconfigured — surface to an admin.",
            )
        }

        items.push({
            itemId,
            fileName,
            mimeType: mime,
            sizeBytes,
            title: titleFromFileName(fileName),
            stagedPath,
            status: "awaiting-bytes",
            updatedAt: new Date().toISOString(),
        })
        minted.push({
            itemId,
            fileName,
            uploadUrl,
            method: "PUT",
            requiredHeaders: { "Content-Type": mime },
            expiresAt,
        })
    }

    if (items.length > 0) {
        try {
            await addItems(store, args.batchId, items)
        } catch (err) {
            return mapStoreError(err, args.batchId)
        }
    }

    return { ok: true, items: minted, rejected }
}

// ─── commit_upload_batch ─────────────────────────────────────────────────────

/**
 * Seal a batch and queue it for the Inngest processor.
 *
 * The staged-bytes reconciliation is the point of this call: an item is only
 * promoted to `staged` when the object really exists AND its size matches what
 * the client declared. A half-finished PUT therefore lands as
 * `failed(size_mismatch)` rather than as a truncated chart in the library.
 *
 * Idempotent — calling it again on a sealed batch reports the current counts
 * with `queued:false`, which is exactly what a client retrying after a
 * `queue_unavailable` needs.
 */
export async function commitUploadBatch(
    uid: string,
    org: OrgId,
    args: { batchId: string },
): Promise<CommitBatchResult | RichErrorEnvelope> {
    const store = db()
    const roles = await loadUploader(store, uid)

    const batch = await loadOwned(store, args.batchId, uid, org, roles, {
        allowAdmin: true,
    })
    if (isRichError(batch)) return batch

    if (
        batch.status === "committed" ||
        batch.status === "processing" ||
        batch.status === "done"
    ) {
        return {
            ok: true,
            batchId: batch.batchId,
            status: batch.status,
            counts: batch.counts,
            queued: false,
        }
    }
    if (batch.status !== "open")
        return mapStoreError(new Error("batch_not_open"), args.batchId)

    // ─── reconcile staged bytes ──────────────────────────────────────────
    for (const item of Object.values(batch.items ?? {})) {
        if (item.status !== "awaiting-bytes") continue
        if (!item.stagedPath) {
            await updateItem(store, batch.batchId, item.itemId, {
                status: "failed",
                error: {
                    code: "bytes_missing",
                    message: "Item was never given a staged object path.",
                },
            })
            continue
        }

        const stat = await statStaged(item.stagedPath)
        if (!stat.exists) {
            await updateItem(store, batch.batchId, item.itemId, {
                status: "failed",
                error: {
                    code: "bytes_missing",
                    message: `No bytes were uploaded for ${item.fileName}.`,
                },
            })
            continue
        }
        if (stat.sizeBytes !== item.sizeBytes) {
            await updateItem(store, batch.batchId, item.itemId, {
                status: "failed",
                error: {
                    code: "size_mismatch",
                    message: `Uploaded ${stat.sizeBytes} bytes for ${item.fileName}, expected ${item.sizeBytes}.`,
                },
            })
            continue
        }
        await updateItem(store, batch.batchId, item.itemId, { status: "staged" })
    }

    await setBatchStatus(store, batch.batchId, "committed", {
        committedAt: new Date(),
    })

    const queued = await enqueueImportBatch(batch.batchId)
    if (queued.ok && queued.eventId) {
        await setBatchStatus(store, batch.batchId, "committed", {
            inngestEventId: queued.eventId,
        })
    }

    const after = await getBatch(store, batch.batchId)
    const counts = after?.counts ?? batch.counts

    if (!queued.ok) {
        return richError(
            "queue_unavailable",
            `Batch ${batch.batchId} is committed but could not be queued: ${queued.message}`,
            { batchId: batch.batchId, counts },
            "Batch is saved; a cron retries the queue every 10 minutes, or call commit_upload_batch again.",
        )
    }

    return {
        ok: true,
        batchId: batch.batchId,
        status: after?.status ?? "committed",
        counts,
        queued: true,
    }
}

// ─── append_batch_item_chunk ─────────────────────────────────────────────────

/**
 * Bookkeeping the chunk fallback keeps ON the item. Not part of
 * `UploadBatchItem` because it is transient: once the chunks assemble, the item
 * is an ordinary staged item and these fields stop mattering.
 */
interface ChunkProgress {
    receivedChunks?: number
    chunkBytes?: number
}

export interface AppendChunkArgs {
    batchId: string
    itemId: string
    chunkIndex: number
    totalChunks: number
    dataBase64: string
}

/**
 * CSP fallback: accept one slice of an item's bytes through the MCP transport
 * when the iframe's direct PUT to Storage is blocked.
 *
 * This is a HOST→server call made by the drop-zone app, never a model→server
 * call, so it deliberately consumes NO rate-limit token — a 25 MB file is ~9
 * chunks and throttling them would just stall the upload the user is watching.
 * The size caps (3 MB per chunk, 25 MB cumulative) are the real guard.
 *
 * On the last chunk the parts are concatenated into the item's staged object
 * and the item's declared `sizeBytes` is rewritten to the assembled length, so
 * `commitUploadBatch`'s size reconciliation stays the single source of truth
 * for "did all the bytes arrive".
 */
export async function appendBatchItemChunk(
    uid: string,
    org: OrgId,
    args: AppendChunkArgs,
): Promise<AppendChunkResult | RichErrorEnvelope> {
    const { batchId, itemId, chunkIndex, totalChunks } = args

    if (!Number.isInteger(chunkIndex) || chunkIndex < 0)
        return richError(
            "invalid_argument",
            "chunkIndex must be a non-negative integer.",
            { field: "chunkIndex" },
        )
    if (!Number.isInteger(totalChunks) || totalChunks < 1)
        return richError(
            "invalid_argument",
            "totalChunks must be a positive integer.",
            { field: "totalChunks" },
        )
    if (chunkIndex >= totalChunks)
        return richError(
            "invalid_argument",
            `chunkIndex ${chunkIndex} is out of range for totalChunks ${totalChunks}.`,
            { field: "chunkIndex" },
        )

    const decoded = decodeBase64Strict(args.dataBase64 ?? "")
    if (!decoded.ok)
        return richError("invalid_argument", decoded.reason, {
            field: "dataBase64",
        })
    if (decoded.buffer.byteLength > MAX_CHUNK_BYTES)
        return richError(
            "payload_too_large",
            `Chunk is ${decoded.buffer.byteLength} bytes; the per-chunk cap is ${MAX_CHUNK_BYTES}.`,
            { maxChunkBytes: MAX_CHUNK_BYTES },
            "Send smaller slices.",
        )

    const store = db()
    const roles = await loadUploader(store, uid)

    const batch = await loadOwned(store, batchId, uid, org, roles)
    if (isRichError(batch)) return batch

    const item = batch.items?.[itemId]
    if (!item) return mapStoreError(new Error("item_not_found"), batchId)
    if (item.status !== "awaiting-bytes")
        return richError(
            "invalid_state",
            `Item ${itemId} is '${item.status}', not awaiting bytes.`,
            { batchId, itemId, status: item.status },
            "Chunks can only be appended before the batch is committed.",
        )

    const progress = item as UploadBatchItem & ChunkProgress
    const priorBytes = progress.chunkBytes ?? 0
    const cumulative = priorBytes + decoded.buffer.byteLength
    if (cumulative > MAX_ITEM_BYTES)
        return richError(
            "size_exceeds_cap",
            `Item ${itemId} would reach ${cumulative} bytes; the per-file cap is ${MAX_ITEM_BYTES}.`,
            { batchId, itemId, maxFileBytes: MAX_ITEM_BYTES },
            "Split or compress the file before uploading.",
        )

    await saveChunk(batchId, itemId, chunkIndex, decoded.buffer)

    const receivedChunks = (progress.receivedChunks ?? 0) + 1
    // `receivedChunks` / `chunkBytes` are not part of `UploadBatchItem` (see
    // `ChunkProgress`) — the store merges whatever patch it is handed, so cast
    // once here rather than widening the shared item type with transient fields.
    const patch = { receivedChunks, chunkBytes: cumulative } as ChunkProgress &
        Partial<UploadBatchItem>

    if (receivedChunks < totalChunks) {
        try {
            await updateItem(store, batchId, itemId, patch)
        } catch (err) {
            return mapStoreError(err, batchId)
        }
        return { ok: true, itemId, chunkIndex, receivedChunks }
    }

    // Last chunk — try to assemble.
    const assembled = await assembleChunks(batchId, itemId, totalChunks)
    if (!assembled.ok) {
        try {
            await updateItem(store, batchId, itemId, patch)
        } catch (err) {
            return mapStoreError(err, batchId)
        }
        return richError(
            "chunk_missing",
            `Chunk ${assembled.missingIndex} of ${totalChunks} never arrived for item ${itemId}.`,
            { batchId, itemId, missingIndex: assembled.missingIndex },
            "Re-send the missing chunk with the same chunkIndex, then call again with the last chunk.",
        )
    }

    try {
        await updateItem(store, batchId, itemId, {
            ...patch,
            sizeBytes: assembled.sizeBytes,
        })
    } catch (err) {
        return mapStoreError(err, batchId)
    }

    return {
        ok: true,
        itemId,
        chunkIndex,
        receivedChunks,
        assembled: true,
        sizeBytes: assembled.sizeBytes,
    }
}

// ─── get_upload_batch ────────────────────────────────────────────────────────

export interface GetUploadBatchArgs {
    batchId: string
    includeItems?: "attention" | "all"
}

/**
 * Read a batch's state, shaped for a conversation rather than for a dump.
 *
 * `attention` — parked and failed rows — is ALWAYS complete: those are the rows
 * a human has to decide about, and truncating them would hide work. Imported
 * rows are capped at 20 because they need no decision; `includeItems:"all"`
 * lifts both caps and adds the raw item map for the drop-zone UI.
 */
export async function getUploadBatch(
    uid: string,
    org: OrgId,
    args: GetUploadBatchArgs,
): Promise<GetBatchResult | RichErrorEnvelope> {
    const store = db()
    const roles = await loadUploader(store, uid)

    const batch = await loadOwned(store, args.batchId, uid, org, roles, {
        allowAdmin: true,
    })
    if (isRichError(batch)) return batch

    const all = args.includeItems === "all"
    const items = Object.values(batch.items ?? {})

    const attention: AttentionRow[] = items
        .filter((i) => i.status === "parked" || i.status === "failed")
        .map((i) => ({
            itemId: i.itemId,
            fileName: i.fileName,
            title: i.title,
            status: i.status,
            ...(i.parked ? { parked: i.parked } : {}),
            ...(i.error ? { error: i.error } : {}),
        }))

    const importedAll = items
        .filter((i) => i.status === "imported" && i.resultFileId)
        .map((i) => ({
            itemId: i.itemId,
            title: i.title,
            resultFileId: i.resultFileId as string,
        }))

    const finishedAt = toIso(batch.finishedAt)

    return {
        ok: true,
        batchId: batch.batchId,
        status: batch.status,
        source: batch.source,
        counts: batch.counts,
        createdAt: toIso(batch.createdAt),
        ...(finishedAt ? { finishedAt } : {}),
        attention,
        imported: all ? importedAll : importedAll.slice(0, MAX_IMPORTED_ROWS),
        ...(all ? { items } : {}),
    }
}

// ─── resolve_upload_item ─────────────────────────────────────────────────────

export interface ResolveUploadItemArgs {
    batchId: string
    itemId: string
    action: "force" | "skip" | "bind"
    boundFileId?: string
}

/**
 * Execute a human's decision about a parked (or failed) item.
 *
 * - `force` re-runs the canonical pipeline with duplicate detection off. This
 *   is why a parked item KEEPS its staged bytes.
 * - `skip` drops the item and releases its bytes.
 * - `bind` records that the chart already exists in the library as
 *   `boundFileId` — the item is skipped, and Claude bonds that existing row
 *   onto whatever setlist prompted the upload. The id is verified against
 *   `library_index` first, so a typo can't be recorded as a decision.
 */
export async function resolveUploadItem(
    uid: string,
    org: OrgId,
    args: ResolveUploadItemArgs,
): Promise<ResolveItemResult | RichErrorEnvelope> {
    const { batchId, itemId, action } = args
    if (action !== "force" && action !== "skip" && action !== "bind")
        return richError(
            "invalid_argument",
            `action must be one of 'force', 'skip', 'bind'. Got '${String(action)}'.`,
            { field: "action" },
        )

    const store = db()
    const roles = await loadUploader(store, uid)

    const batch = await loadOwned(store, batchId, uid, org, roles, {
        allowAdmin: true,
    })
    if (isRichError(batch)) return batch

    const item = batch.items?.[itemId]
    if (!item) return mapStoreError(new Error("item_not_found"), batchId)

    const resolvable =
        item.status === "parked" || (item.status === "failed" && action === "skip")
    if (!resolvable)
        return richError(
            "invalid_state",
            `Item ${itemId} is '${item.status}'; only parked items can be forced or bound, and only parked or failed items can be skipped.`,
            { batchId, itemId, status: item.status },
            "Call get_upload_batch to see which items need a decision.",
        )

    const decision: ResolveItemResult["decision"] = {
        action,
        ...(action === "bind" && args.boundFileId
            ? { boundFileId: args.boundFileId }
            : {}),
        decidedBy: uid,
        decidedAt: new Date().toISOString(),
    }

    if (action === "force") {
        let processed: UploadBatchItem
        try {
            processed = await processBatchItem(store, batchId, itemId, {
                force: true,
            })
        } catch (err) {
            return mapStoreError(err, batchId)
        }
        try {
            await updateItem(store, batchId, itemId, { decision })
        } catch (err) {
            return mapStoreError(err, batchId)
        }
        return {
            ok: true,
            itemId,
            status: processed.status,
            ...(processed.resultFileId
                ? { resultFileId: processed.resultFileId }
                : {}),
            decision,
        }
    }

    if (action === "bind") {
        const boundFileId = args.boundFileId?.trim()
        if (!boundFileId)
            return richError(
                "invalid_argument",
                "boundFileId is required when action is 'bind'.",
                { field: "boundFileId" },
            )
        const row = await store.collection("library_index").doc(boundFileId).get()
        if (!row.exists)
            return richError(
                "not_found",
                `No library chart with id ${boundFileId}.`,
                { boundFileId },
                "Use search_library to find the existing chart's fileId, then bind to that.",
            )
    }

    // Both `skip` and `bind` retire the item and release its staged bytes.
    try {
        await updateItem(store, batchId, itemId, { status: "skipped", decision })
    } catch (err) {
        return mapStoreError(err, batchId)
    }
    if (item.stagedPath) {
        await deleteStaged(item.stagedPath).catch((err) =>
            logger.warn(
                `[batch-intake] staged cleanup failed for ${item.stagedPath}:`,
                err,
            ),
        )
    }

    return { ok: true, itemId, status: "skipped", decision }
}

// ─── list_parked_uploads ─────────────────────────────────────────────────────

/**
 * Standing cross-batch list of everything waiting on a human decision, for the
 * caller's tenant. No rate-limit token: this is the "what's outstanding?"
 * question an agent should be free to ask at the top of any conversation.
 */
export async function listParkedUploads(
    uid: string,
    org: OrgId,
    args: { limit?: number },
): Promise<ParkedListResult | RichErrorEnvelope> {
    const store = db()
    const roles = await loadUploader(store, uid)
    if (!isUploadAllowed(roles)) return uploadForbidden(roles)

    const requested = Number(args?.limit)
    const limit =
        Number.isFinite(requested) && requested > 0
            ? Math.min(Math.floor(requested), DEFAULT_PARKED_LIMIT)
            : DEFAULT_PARKED_LIMIT

    const parked = await listParkedForOrg(store, org, limit)
    return { ok: true, parked, count: parked.length }
}

// ─── import_drive_folder ─────────────────────────────────────────────────────

export interface ImportDriveFolderArgs {
    folderId: string
    collection?: LibraryCollection
    tags?: string[]
    recursive?: boolean
    dryRun?: boolean
}

/**
 * Import every chart-typed file in a Drive folder.
 *
 * No bytes cross the model here either: only the Drive ids are recorded, and
 * the Inngest processor pulls each file server-side. `dryRun` runs every gate
 * and the Drive listing but writes nothing — per the standing rule that dryRun
 * is observability, it needs no `force` and creates no batch document.
 */
export async function importDriveFolder(
    uid: string,
    org: OrgId,
    args: ImportDriveFolderArgs,
): Promise<
    ImportDriveFolderResult | ImportDriveFolderDryRunResult | RichErrorEnvelope
> {
    const folderId = args.folderId?.trim()
    if (!folderId)
        return richError("invalid_argument", "folderId is required.", {
            field: "folderId",
        })

    const store = db()

    const roles = await loadUploader(store, uid)
    if (!isUploadAllowed(roles)) return uploadForbidden(roles)

    const curated = curatedCatalogGate(roles, args.collection)
    if (curated) return curated

    const limited = await checkUserRateLimit(uid, "upload", {
        bypass: isTrustedLeader(roles),
    })
    if (limited) return rateLimitEnvelope(limited.error)

    let listing: Awaited<ReturnType<typeof listDriveFolderCharts>>
    try {
        listing = await listDriveFolderCharts(new DriveClient(), folderId, {
            recursive: !!args.recursive,
            max: MAX_ITEMS_PER_BATCH,
        })
    } catch (err) {
        const failure = classifyDriveFailure(err)
        return richError(
            failure.code,
            `Could not list Drive folder ${folderId}: ${failure.message}`,
            {
                folderId,
                errorCode: failure.code === "drive_forbidden" ? 403 : 404,
            },
            "Check the folder id and that the service account has at least viewer access.",
        )
    }

    const { candidates, skipped } = listing

    if (args.dryRun) {
        return {
            ok: true,
            dryRun: true,
            wouldImport: candidates.map((c) => ({
                driveFileId: c.driveFileId,
                name: c.name,
                mimeType: c.mimeType,
                sizeBytes: c.sizeBytes,
            })),
            skipped,
        }
    }

    const defaults = defaultsOf(args.collection, args.tags)
    const { batchId } = await createBatch(store, {
        ownerUid: uid,
        orgId: org,
        source: "drive-folder",
        defaults,
    })

    const now = new Date().toISOString()
    const items: UploadBatchItem[] = candidates.map((c) => ({
        itemId: newItemId(),
        fileName: c.name,
        mimeType: resolveChartMime(c.name, c.mimeType) ?? c.mimeType,
        sizeBytes: c.sizeBytes,
        title: titleFromFileName(c.name),
        driveFileId: c.driveFileId,
        status: "pending",
        updatedAt: now,
        // Drive provenance the processor forwards into library_index.
        ...(c.md5Checksum ? { md5Checksum: c.md5Checksum } : {}),
        ...(c.modifiedTime ? { modifiedTime: c.modifiedTime } : {}),
    }))

    if (items.length > 0) {
        try {
            await addItems(store, batchId, items)
        } catch (err) {
            return mapStoreError(err, batchId)
        }
    }

    await setBatchStatus(store, batchId, "committed", { committedAt: new Date() })

    const queued = await enqueueImportBatch(batchId)
    if (queued.ok && queued.eventId) {
        await setBatchStatus(store, batchId, "committed", {
            inngestEventId: queued.eventId,
        })
    }

    const after = await getBatch(store, batchId)
    const counts = after?.counts ?? {
        total: items.length,
        pending: items.length,
        imported: 0,
        parked: 0,
        failed: 0,
        skipped: 0,
    }

    if (!queued.ok) {
        return richError(
            "queue_unavailable",
            `Drive folder batch ${batchId} is committed but could not be queued: ${queued.message}`,
            { batchId, counts, skipped },
            "Batch is saved; a cron retries the queue every 10 minutes, or call commit_upload_batch again.",
        )
    }

    return { ok: true, batchId, counts, queued: true, skipped }
}
