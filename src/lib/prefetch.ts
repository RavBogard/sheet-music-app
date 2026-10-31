import { QueueItem } from "@/lib/store"
import { getFileVersion, hasFile, putFile } from "@/lib/offline-idb"
import { primeOfflineWorker } from "@/lib/pdf-worker-offline"
import { isCachedChartStale, type ChartVersions } from "@/lib/offline/chart-version"

/**
 * PERF-21: why a chart did not save to this device.
 * - `not-found`: the server answered 404.
 * - `http`: any other non-OK answer.
 * - `network`: the request itself failed (offline, dropped wifi, timeout),
 *   or the device refused to store the bytes.
 * - `corrupt`: bytes arrived but are empty, or a PDF without a PDF header.
 */
export type SaveFailureReason = "not-found" | "http" | "network" | "corrupt"

export interface SaveFailure {
    reason: SaveFailureReason
    status?: number
    at: number
}

/** Event fired on `window` whenever the failure record changes. */
export const SAVE_FAILURES_CHANGED_EVENT = "crc-offline-save-failures-changed"

// In-memory for this page session. Every Perform entry online runs the save
// pass again, so the record rebuilds itself; a reload while offline shows the
// plain "Not saved offline" line without a reason.
const saveFailures = new Map<string, SaveFailure>()

function notifyFailuresChanged(): void {
    if (typeof window === "undefined") return
    try {
        window.dispatchEvent(new Event(SAVE_FAILURES_CHANGED_EVENT))
    } catch {
        /* noop */
    }
}

function recordFailure(fileId: string, reason: SaveFailureReason, status?: number): void {
    saveFailures.set(fileId, { reason, ...(status !== undefined ? { status } : {}), at: Date.now() })
    notifyFailuresChanged()
}

function clearFailure(fileId: string): void {
    if (saveFailures.delete(fileId)) notifyFailuresChanged()
}

/** Failed fileIds from this session's save passes, with their reasons. */
export function getSaveFailures(): ReadonlyMap<string, SaveFailure> {
    return saveFailures
}

/** Test seam. */
export function __resetSaveFailuresForTests(): void {
    saveFailures.clear()
}

/** How far into the file a PDF header may start (pdf.js tolerates leading junk within 1 KB). */
const PDF_HEADER_WINDOW = 1024

function looksLikePdfType(mime: string | null | undefined): boolean {
    return !!mime && /\bpdf\b/i.test(mime)
}

/**
 * PERF-21: a cheap check that PDF bytes are a PDF: `%PDF` within the first
 * kilobyte. Non-PDF types pass untouched. An HTML error page served as a
 * PDF, or a Drive interstitial, fails here instead of being cached and found
 * broken mid-service.
 */
export async function pdfHeaderLooksValid(blob: Blob, mime?: string | null): Promise<boolean> {
    if (!looksLikePdfType(mime ?? blob.type)) return true
    const head = new Uint8Array(await blob.slice(0, PDF_HEADER_WINDOW).arrayBuffer())
    // "%PDF" = 0x25 0x50 0x44 0x46
    for (let i = 0; i + 3 < head.length; i++) {
        if (head[i] === 0x25 && head[i + 1] === 0x50 && head[i + 2] === 0x44 && head[i + 3] === 0x46) return true
    }
    return false
}

/**
 * Fetch one chart and store it. Returns true when stored. On any failure the
 * reason is recorded and NOTHING already in the store is touched: an older
 * copy of the chart stays readable (PERF-18 never-delete-before-replace).
 */
async function fetchAndStore(fileId: string, version?: string): Promise<boolean> {
    let res: Response
    try {
        res = await fetch(`/api/drive/file/${fileId}`)
    } catch {
        recordFailure(fileId, "network")
        return false
    }
    if (!res.ok) {
        recordFailure(fileId, res.status === 404 ? "not-found" : "http", res.status)
        return false
    }
    let blob: Blob
    try {
        blob = await res.blob()
    } catch {
        recordFailure(fileId, "network")
        return false
    }
    if (!blob || blob.size === 0) {
        recordFailure(fileId, "corrupt")
        return false
    }
    const mime = res.headers?.get?.("content-type") || blob.type
    try {
        if (!(await pdfHeaderLooksValid(blob, mime))) {
            recordFailure(fileId, "corrupt")
            return false
        }
    } catch {
        // A check that can't run is not evidence of damage; store the bytes.
    }
    try {
        await putFile(fileId, blob, version)
    } catch {
        // IndexedDB refused the write (quota, private mode). The bytes were
        // fine, so the band sees this as a download problem.
        recordFailure(fileId, "network")
        return false
    }
    clearFailure(fileId)
    return true
}

/**
 * Prefetch upcoming files in the setlist queue into the IDB blob store
 * for instant page turns AND real offline availability.
 *
 * Called when entering performance mode or advancing to a new song.
 */
export async function prefetchUpcoming(
    queue: QueueItem[],
    currentIndex: number,
    lookahead = 3
): Promise<void> {
    if (!queue.length) return

    const upcoming = queue.slice(currentIndex + 1, currentIndex + 1 + lookahead)
    if (!upcoming.length) return

    for (const item of upcoming) {
        if (!item.fileId || item.fileId.startsWith('flow-')) continue
        if (await hasFile(item.fileId)) continue

        try {
            const res = await fetch(`/api/drive/file/${item.fileId}`)
            if (!res.ok) continue
            const blob = await res.blob()
            if (blob && blob.size > 0) await putFile(item.fileId, blob)
        } catch {
            // Silent fail — prefetch is best-effort
        }
    }
}

/** Check if a specific file is already available offline. */
export async function isFilePrefetched(fileId: string): Promise<boolean> {
    try {
        return await hasFile(fileId)
    } catch {
        return false
    }
}

export interface PrefetchSetlistOptions {
    /**
     * PERF-18: the server's current version per fileId. A cached chart whose
     * saved version differs (or has none) is re-fetched and replaced in
     * place; a chart without a server version is never re-fetched.
     */
    versions?: ChartVersions | null
}

/**
 * Pre-cache ALL files in a setlist for offline use during services.
 * Fetches sequentially with small delays to avoid hammering the server.
 *
 * Returns the count of newly cached (or refreshed) files. Failures are
 * recorded per fileId with a reason; read them with `getSaveFailures`.
 */
export async function prefetchSetlistPDFs(
    fileIds: string[],
    onProgress?: (cached: number, total: number) => void,
    options: PrefetchSetlistOptions = {},
): Promise<number> {
    if (!fileIds.length) return 0

    // offline-perform-fix: a "saved" setlist must include the pdf.js worker, or a
    // not-yet-opened chart can't render offline. Cache the worker bytes FIRST (and
    // await it) so it's guaranteed present by the time the save reports complete.
    await primeOfflineWorker()

    const unique = [...new Set(fileIds.filter(Boolean))]
    const versions = options.versions ?? null
    let newlyCached = 0

    for (let i = 0; i < unique.length; i++) {
        const fileId = unique[i]

        if (fileId.startsWith('flow-')) {
            onProgress?.(i + 1, unique.length)
            continue
        }

        const serverVersion = versions?.[fileId] || undefined
        const cached = serverVersion
            ? await getFileVersion(fileId)
            : (await hasFile(fileId)) ? null : undefined
        // Cached and current (or nothing to compare against): skip.
        if (cached !== undefined && !isCachedChartStale(cached, serverVersion)) {
            clearFailure(fileId)
            onProgress?.(i + 1, unique.length)
            continue
        }

        // Not cached, or cached and stale: fetch, then replace in place.
        if (await fetchAndStore(fileId, serverVersion)) newlyCached++

        onProgress?.(i + 1, unique.length)

        if (i < unique.length - 1) {
            await new Promise(r => setTimeout(r, 100))
        }
    }

    return newlyCached
}
