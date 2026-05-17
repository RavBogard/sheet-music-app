/**
 * Cycle-3 NEW-3 (A3) — Library lifecycle event bus.
 *
 * In-process typed event emitter for `library.row.created` (and any future
 * library-lifecycle events). The single subscriber pattern means AI
 * enrichment, future UI cache invalidation hooks, and other post-import
 * concerns all attach here instead of branching every ingest path
 * (HTTP upload, MCP upload_chart, MCP import_chart_from_drive, Drive
 * cron, MCP reconcile_library). That's the architectural rule from
 * ADDENDUM-1 §3 rule #3: "Path-agnostic. AI runs on rows created by
 * every ingest path. Implement via a library.row.created event emitted
 * by processChartUpload — not by adding AI calls to each ingest path.
 * Otherwise paths drift."
 *
 * Atomic-guard contract (msg-001, feedback_upload_atomicity): the event
 * fires AFTER all Storage + Firestore mutations succeed AND after the
 * `library_signals` broadcast. If the row write fails, no event. If a
 * subscriber throws, the failure NEVER propagates back into the import
 * flow — `processChartUpload` returns success regardless.
 */

import { logger } from "@/lib/logger"

export type LibraryRowSource = "upload" | "drive-sync"

export interface LibraryRowCreatedEvent {
    /** library_index doc id (same as fileId). */
    rowId: string
    /** Canonical chart id (e.g. `upload-<uuid>`). */
    fileId: string
    /** Ingest path tag stamped onto the row. */
    source: LibraryRowSource
    /** Drive provenance, only present when `source === 'drive-sync'`. */
    driveMetadata?: {
        driveFileId: string
        modifiedTime?: string
        md5Checksum?: string
        parents?: string[]
    }
    /** Lowercased title — what dedup keys against. */
    nameLower: string
    /** Title as written to library_index. */
    title: string
    /** Detected/effective content type post-conversion. */
    mimeType: string
    /** Buffer size in bytes (post-conversion). */
    sizeBytes: number
    /** Library collection (`'core' | 'supplemental' | 'uploads'`). */
    collection: string
    /** First parent folder id from Drive metadata, when present — maps to subfolder routing. */
    subfolder?: string
    /** Actual Storage object path. AI subscriber refetches bytes from here. */
    storagePath: string
    /** SHA-256 of the canonical bytes (post-conversion). Cache key for AI enrichment. */
    contentHash: string
    /** Uploader uid — used to honor "never overwrite human-set fields". */
    uploaderUid: string
}

type LibraryRowCreatedHandler = (
    event: LibraryRowCreatedEvent,
) => void | Promise<void>

const handlers = new Set<LibraryRowCreatedHandler>()

export function onLibraryRowCreated(
    handler: LibraryRowCreatedHandler,
): () => void {
    handlers.add(handler)
    return () => {
        handlers.delete(handler)
    }
}

/**
 * Fire-and-forget emission. Each subscriber's promise is intentionally
 * NOT awaited together with the caller — the import flow has already
 * succeeded and we don't want a slow Sonnet call (~2–5s) to block the
 * uploader's HTTP response. Promise rejections are caught + logged but
 * never re-thrown.
 *
 * For tests that need to assert subscriber completion, use
 * `emitLibraryRowCreatedSync` which awaits each handler in order.
 */
export function emitLibraryRowCreated(event: LibraryRowCreatedEvent): void {
    for (const handler of handlers) {
        try {
            const result = handler(event)
            if (
                result &&
                typeof (result as Promise<unknown>).catch === "function"
            ) {
                ;(result as Promise<unknown>).catch((err) => {
                    logger.error(
                        `[library-events] subscriber threw on library.row.created for ${event.fileId}: ${err instanceof Error ? err.message : String(err)}`,
                    )
                })
            }
        } catch (err) {
            logger.error(
                `[library-events] subscriber threw (sync) on library.row.created for ${event.fileId}: ${err instanceof Error ? err.message : String(err)}`,
            )
        }
    }
}

/**
 * Awaiting variant used by tests. Production code paths MUST NOT use
 * this — they should fire-and-forget via {@link emitLibraryRowCreated}
 * so AI latency never blocks an upload response.
 */
export async function emitLibraryRowCreatedAndWait(
    event: LibraryRowCreatedEvent,
): Promise<void> {
    for (const handler of handlers) {
        try {
            await handler(event)
        } catch (err) {
            logger.error(
                `[library-events] subscriber threw on library.row.created for ${event.fileId}: ${err instanceof Error ? err.message : String(err)}`,
            )
        }
    }
}

/**
 * Test-only — clear every subscription so tests can isolate handlers.
 * Production code never calls this.
 */
export function __resetLibraryEventHandlersForTesting(): void {
    handlers.clear()
}

/**
 * Test-only — count of active subscribers, for assertion-side checks.
 */
export function __getLibraryEventHandlerCountForTesting(): number {
    return handlers.size
}
