import { QueueItem } from "@/lib/store"
import {
    getFile,
    getFileMeta,
    hasFile,
    putFile,
    stampFileVersion,
    type OfflineFileMeta,
} from "@/lib/offline-idb"
import { primeOfflineWorker } from "@/lib/pdf-worker-offline"
import { planForCachedChart, type ChartVersions } from "@/lib/offline/chart-version"

/**
 * PERF-21: why a chart did not save to this device.
 * - `not-found`: the server answered 404.
 * - `http`: any other non-OK answer.
 * - `network`: the request failed, was redirected (a captive portal), came
 *   back as a web page, was cut short, or the device refused to store it.
 * - `corrupt`: bytes arrived but are too small, a PDF without a PDF header,
 *   or (on a refresh) don't match the library's content hash.
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

// ─── byte checks ────────────────────────────────────────────────────────────

/** How far into the file a PDF header may start (pdf.js tolerates leading junk within 1 KB). */
const PDF_HEADER_WINDOW = 1024
/** Smallest body accepted as a chart. A real PDF is far larger than this. */
const MIN_PDF_BYTES = 64
const MIN_CHART_BYTES = 16

function isPdfType(mime: string | null | undefined): boolean {
    return !!mime && /\bpdf\b/i.test(mime)
}

function isTextType(mime: string | null | undefined): boolean {
    return !!mime && /^\s*text\//i.test(mime)
}

function isHtmlType(mime: string | null | undefined): boolean {
    return !!mime && /^\s*(text\/html|application\/xhtml\+xml)/i.test(mime)
}

/** Broad family of a mime type: `pdf`, or its top-level type. */
function broadType(mime: string | null | undefined): string {
    if (!mime) return "application"
    if (isPdfType(mime)) return "pdf"
    return mime.split("/")[0].trim().toLowerCase() || "application"
}

/**
 * PERF-21: a cheap check that PDF bytes are a PDF: `%PDF` within the first
 * kilobyte. Non-PDF types pass untouched.
 */
export async function pdfHeaderLooksValid(blob: Blob, mime?: string | null): Promise<boolean> {
    if (!isPdfType(mime ?? blob.type)) return true
    const head = new Uint8Array(await blob.slice(0, PDF_HEADER_WINDOW).arrayBuffer())
    // "%PDF" = 0x25 0x50 0x44 0x46
    for (let i = 0; i + 3 < head.length; i++) {
        if (head[i] === 0x25 && head[i + 1] === 0x50 && head[i + 2] === 0x44 && head[i + 3] === 0x46) return true
    }
    return false
}

/**
 * sha256 hex (lowercase) of the bytes, exactly as `sha256Hex` in
 * `src/lib/library/content-hash.ts` computes `library_index.contentHash.value`
 * from the stored bytes. Null when SubtleCrypto is unavailable.
 */
export async function sha256HexOf(blob: Blob): Promise<string | null> {
    const subtle = typeof crypto !== "undefined" ? crypto.subtle : undefined
    if (!subtle) return null
    const digest = await subtle.digest("SHA-256", await blob.arrayBuffer())
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")
}

function hashOfVersion(version: string | undefined | null): string | null {
    return version && version.startsWith("h:") ? version.slice(2) : null
}

// ─── fetch + store ──────────────────────────────────────────────────────────

/**
 * Fetch one chart and store it. Returns true when stored. On any failure the
 * reason is recorded and NOTHING already in the store is touched: an older
 * copy stays readable (PERF-18 never-delete-before-replace).
 *
 * `existing` set means a REFRESH: the new bytes replace the old copy only if
 * they verify (hash match for an `h:` version; same broad type for `u:`).
 */
async function fetchAndStore(fileId: string, version: string | undefined, existing?: OfflineFileMeta): Promise<boolean> {
    const refresh = !!existing
    const url = refresh && version
        ? `/api/drive/file/${fileId}?v=${encodeURIComponent(version)}`
        : `/api/drive/file/${fileId}`
    let res: Response
    try {
        // A refresh must bypass the browser cache, and the `?v=` gives the CDN
        // a new URL (the route reads only the path's fileId).
        res = refresh ? await fetch(url, { cache: "no-store" }) : await fetch(url)
    } catch {
        recordFailure(fileId, "network")
        return false
    }
    if (!res.ok) {
        recordFailure(fileId, res.status === 404 ? "not-found" : "http", res.status)
        return false
    }
    // A captive portal answers with a redirect to its own page.
    if (res.redirected) {
        recordFailure(fileId, "network")
        return false
    }
    const mime = res.headers?.get?.("content-type") || ""
    if (isHtmlType(mime) || (refresh && isTextType(mime) && !isTextType(existing!.mime))) {
        recordFailure(fileId, "network")
        return false
    }
    let blob: Blob
    try {
        blob = await res.blob()
    } catch {
        recordFailure(fileId, "network")
        return false
    }
    const type = mime || blob?.type || ""
    if (!blob || blob.size < (isPdfType(type) ? MIN_PDF_BYTES : MIN_CHART_BYTES)) {
        recordFailure(fileId, "corrupt")
        return false
    }
    // Cut-off download: only comparable when the body wasn't re-encoded.
    const declared = Number(res.headers?.get?.("content-length") ?? NaN)
    const encoding = (res.headers?.get?.("content-encoding") || "identity").toLowerCase()
    if (Number.isFinite(declared) && declared > 0 && encoding === "identity" && blob.size !== declared) {
        recordFailure(fileId, "network")
        return false
    }
    try {
        if (!(await pdfHeaderLooksValid(blob, type))) {
            recordFailure(fileId, "corrupt")
            return false
        }
    } catch {
        // A check that can't run is not evidence of damage.
    }

    let storeVersion = version
    const expectedHash = hashOfVersion(version)
    if (expectedHash) {
        let actual: string | null = null
        try {
            actual = await sha256HexOf(blob)
        } catch {
            actual = null
        }
        if (actual !== expectedHash) {
            if (refresh) {
                // Unverified bytes never replace a good copy.
                recordFailure(fileId, "corrupt")
                return false
            }
            // A first save keeps the bytes (better than nothing) but does not
            // claim the version; the idle hash check revisits it.
            storeVersion = undefined
        }
    } else if (refresh && broadType(type) !== broadType(existing!.mime)) {
        recordFailure(fileId, "network")
        return false
    }

    try {
        await putFile(fileId, new Blob([blob], { type: type || "application/octet-stream" }), storeVersion)
    } catch {
        recordFailure(fileId, "network")
        return false
    }
    clearFailure(fileId)
    return true
}

// ─── the one shared queue ───────────────────────────────────────────────────

type JobKind = "save" | "refresh"
interface Job {
    fileId: string
    kind: JobKind
    version?: string
    existing?: OfflineFileMeta
}

/** At most this many chart downloads at once, across every caller. */
export const MAX_CONCURRENT_DOWNLOADS = 2

const queued = new Map<string, Promise<boolean>>()
const pending: Array<{ job: Job; resolve: (ok: boolean) => void }> = []
let active = 0
let chartOpen = false
/** Refreshes (and hash checks) run at most once per fileId per page session. */
const refreshTried = new Set<string>()

/**
 * PERF-18: Perform calls this while a chart is open. Background refreshes and
 * hash checks wait until it closes, so they never compete with the chart the
 * musician is reading. Saves of charts missing from the device still run:
 * those are what keep the setlist usable offline.
 */
export function setChartOpen(open: boolean): void {
    chartOpen = open
    if (!open) {
        pump()
        pumpHashes()
    }
}

function enqueue(job: Job): Promise<boolean> {
    const existing = queued.get(job.fileId)
    if (existing) return existing
    const p = new Promise<boolean>((resolve) => pending.push({ job, resolve }))
    queued.set(job.fileId, p)
    pump()
    return p
}

function pump(): void {
    while (active < MAX_CONCURRENT_DOWNLOADS) {
        const idx = pending.findIndex((p) => !(chartOpen && p.job.kind === "refresh"))
        if (idx < 0) return
        const [item] = pending.splice(idx, 1)
        active++
        fetchAndStore(item.job.fileId, item.job.version, item.job.existing)
            .catch(() => false)
            .then((ok) => {
                active--
                queued.delete(item.job.fileId)
                item.resolve(ok)
                pump()
            })
    }
}

// Idle-time hash checks of cached entries whose version isn't the server's:
// one at a time. A match stamps the version with no download; a mismatch
// queues one verified refresh.
const hashQueue: Array<{ fileId: string; version: string }> = []
const hashQueued = new Set<string>()
let hashing = false

function whenIdle(fn: () => void): void {
    const ric = typeof window !== "undefined" ? window.requestIdleCallback : undefined
    if (typeof ric === "function") ric(() => fn(), { timeout: 5000 })
    else setTimeout(fn, 50)
}

function pumpHashes(): void {
    if (hashing || chartOpen || hashQueue.length === 0) return
    hashing = true
    const { fileId, version } = hashQueue.shift()!
    whenIdle(() => {
        void checkCachedHash(fileId, version).finally(() => {
            hashQueued.delete(fileId)
            hashing = false
            pumpHashes()
        })
    })
}

async function checkCachedHash(fileId: string, version: string): Promise<void> {
    try {
        const meta = await getFileMeta(fileId)
        if (!meta || meta.version === version) return
        const blob = await getFile(fileId)
        const actual = blob ? await sha256HexOf(blob) : null
        if (actual !== null && actual === hashOfVersion(version)) {
            await stampFileVersion(fileId, version, meta.savedAt)
            return
        }
        if (actual === null) return // can't verify on this device; leave it
        void enqueue({ fileId, kind: "refresh", version, existing: meta })
    } catch {
        /* best-effort */
    }
}

function scheduleHashCheck(fileId: string, version: string): void {
    if (hashQueued.has(fileId)) return
    hashQueued.add(fileId)
    hashQueue.push({ fileId, version })
    pumpHashes()
}

/** Test seam: reset all module state. */
export function __resetSaveFailuresForTests(): void {
    saveFailures.clear()
    queued.clear()
    pending.length = 0
    active = 0
    chartOpen = false
    refreshTried.clear()
    hashQueue.length = 0
    hashQueued.clear()
    hashing = false
}

// ─── public passes ──────────────────────────────────────────────────────────

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
     * PERF-18: the server's current version per fileId. Cached charts whose
     * version differs are checked and refreshed in the background; a chart
     * without a server version is never re-fetched.
     */
    versions?: ChartVersions | null
}

/**
 * Pre-cache ALL files in a setlist for offline use during services.
 *
 * Charts missing from the device go through the one shared download queue
 * (deduped by fileId, at most two at once) and are awaited. Refreshes of
 * charts already on the device run in the background and are not awaited:
 * the chart is saved either way.
 *
 * Returns the count of newly cached files. Failures are recorded per fileId
 * with a reason; read them with `getSaveFailures`.
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
    let processed = 0
    let newlyCached = 0
    const tick = () => onProgress?.(++processed, unique.length)
    const saves: Promise<void>[] = []

    for (const fileId of unique) {
        if (fileId.startsWith('flow-')) {
            tick()
            continue
        }
        const serverVersion = versions?.[fileId] || undefined
        const meta = await getFileMeta(fileId)

        if (!meta) {
            saves.push(
                enqueue({ fileId, kind: "save", version: serverVersion }).then((ok) => {
                    if (ok) newlyCached++
                    tick()
                }),
            )
            continue
        }

        // Cached. Saved either way; any refresh happens in the background.
        clearFailure(fileId)
        tick()
        const plan = planForCachedChart(meta.version, serverVersion)
        if (plan === "none" || !serverVersion || refreshTried.has(fileId)) continue
        refreshTried.add(fileId)
        if (plan === "hash-check") scheduleHashCheck(fileId, serverVersion)
        else void enqueue({ fileId, kind: "refresh", version: serverVersion, existing: meta })
    }

    await Promise.all(saves)
    return newlyCached
}
