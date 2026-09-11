/**
 * Batch chart intake — the RESULT shapes the seven batch MCP tools return.
 *
 * PURE types (no runtime values, no server imports): the tool implementations
 * import these to type their returns, and the batch-intake browser bundle
 * imports them type-only to type what it receives. Keep it that way.
 */

import type { LibraryCollection } from "@/lib/library-upload"
import type {
    BatchCounts,
    BatchSource,
    BatchStatus,
    ParkedInfo,
    UploadBatchItem,
} from "./batch-types"

/** `open_chart_dropzone` — a new open batch plus the client-side caps. */
export interface OpenDropzoneResult {
    ok: true
    batchId: string
    expiresAt: string
    defaults: { collection?: LibraryCollection; tags?: string[] }
    maxFileBytes: number
    acceptedExtensions: string[]
    maxFilesPerRequest: number
}

/** One file the caller wants an upload URL for. */
export interface RequestUrlsFile {
    fileName: string
    mimeType?: string
    sizeBytes: number
}

export interface RequestUrlsResult {
    ok: true
    items: Array<{
        itemId: string
        fileName: string
        uploadUrl: string
        method: "PUT"
        requiredHeaders: Record<string, string>
        expiresAt: string
    }>
    rejected: Array<{ fileName: string; reason: "unsupported_type" | "too_large" }>
}

export interface CommitBatchResult {
    ok: true
    batchId: string
    status: BatchStatus
    counts: BatchCounts
    queued: boolean
}

export interface AppendChunkResult {
    ok: true
    itemId: string
    chunkIndex: number
    receivedChunks: number
    assembled?: boolean
    sizeBytes?: number
}

/** A row the operator needs to look at — parked or failed. */
export interface AttentionRow {
    itemId: string
    fileName: string
    title: string
    status: UploadBatchItem["status"]
    parked?: ParkedInfo
    error?: { code: string; message: string }
}

export interface GetBatchResult {
    ok: true
    batchId: string
    status: BatchStatus
    source: BatchSource
    counts: BatchCounts
    createdAt: string
    finishedAt?: string
    attention: AttentionRow[]
    imported: Array<{ itemId: string; title: string; resultFileId: string }>
    items?: UploadBatchItem[]
}

export interface ResolveItemResult {
    ok: true
    itemId: string
    status: UploadBatchItem["status"]
    resultFileId?: string
    decision: {
        action: "force" | "skip" | "bind"
        boundFileId?: string
        decidedBy: string
        decidedAt: string
    }
}

export interface ParkedListResult {
    ok: true
    parked: Array<{
        batchId: string
        itemId: string
        title: string
        fileName: string
        parked: ParkedInfo
        createdAt: string
    }>
    count: number
}

export interface ImportDriveFolderDryRunResult {
    ok: true
    dryRun: true
    wouldImport: Array<{
        driveFileId: string
        name: string
        mimeType: string
        sizeBytes: number
    }>
    skipped: Array<{ name: string; reason: string }>
}

export interface ImportDriveFolderResult {
    ok: true
    batchId: string
    counts: BatchCounts
    queued: boolean
    skipped: Array<{ name: string; reason: string }>
}
