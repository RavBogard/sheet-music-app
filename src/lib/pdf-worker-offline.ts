/**
 * Offline availability for the pdf.js worker module.
 *
 * The chart BYTES are cached in IndexedDB (offline-idb) and the lazy react-pdf
 * viewer chunk is `import()`-warmed into memory on Perform entry — but pdf.js
 * still loads its WORKER as a separate `new Worker('/pdf.worker.min.<v>.mjs',
 * {type:'module'})` at render time. With no service worker (the app SW is a
 * tombstone — re-adding one caused a refresh-loop bug, see public/sw.js), that
 * worker fetch 404s offline → "Setting up fake worker failed: Importing a module
 * script failed" on a cold offline open, and a stuck "Rendering…" on offline nav.
 *
 * Fix: while ONLINE, copy the worker `.mjs` bytes into IndexedDB. When OFFLINE,
 * point `GlobalWorkerOptions.workerSrc` at a same-origin `blob:` URL built from
 * those bytes. pdfjs 5.x (`build/pdf.mjs` PDFWorker#initialize) creates the worker
 * via `new Worker(workerSrc, {type:'module'})` and uses a same-origin blob: URL
 * directly (no CDN wrapper) — and `new Worker(blob:…)` makes no network request,
 * so it works offline. See [[feedback_react_pdf_worker]]: workerSrc must resolve
 * to a PRECACHED asset, not a runtime network import.
 *
 * ★ ONLINE behavior is intentionally UNCHANGED: `desiredWorkerSrc` returns the
 * static `/pdf.worker.min.<v>.mjs` URL whenever `navigator.onLine` is not false,
 * so the proven online render path keeps using the static asset. The blob: worker
 * is engaged only offline, where the alternative is total failure.
 */

import { getFile, hasFile, putFile } from "@/lib/offline-idb"

/** Reserved IDB key for the worker bytes — namespaced so it can't collide with a
 *  chart fileId (`upload-<uuid>` / Drive id) and is ignored by the chart counters
 *  (SaveOfflineButton only counts ids that are in its cacheable chart set). */
function workerKey(version: string): string {
    return `__pdfjs_worker__:${version}`
}

/** The static, build-emitted worker asset (copied to /public by copy-pdf-worker.js). */
export function staticWorkerSrc(version: string): string {
    return `/pdf.worker.min.${version}.mjs`
}

// Memoized object URL for the offline worker (one per version per session).
let offlineBlobUrl: string | null = null
let offlineBlobVersion: string | null = null

function isOffline(): boolean {
    return typeof navigator !== "undefined" && navigator.onLine === false
}

/**
 * The workerSrc to use right now. Offline + bytes-cached → the blob: URL;
 * otherwise the static asset URL (online path unchanged).
 */
export function desiredWorkerSrc(version: string): string {
    if (isOffline() && offlineBlobUrl && offlineBlobVersion === version) {
        return offlineBlobUrl
    }
    return staticWorkerSrc(version)
}

/**
 * Copy the worker bytes into IndexedDB while online so they survive a wifi drop.
 * Idempotent + best-effort; a no-op when offline (can't fetch) or already cached.
 * Call on Perform entry (online idle) and on Save-offline.
 */
export async function primeOfflineWorker(): Promise<void> {
    try {
        if (typeof window === "undefined" || isOffline()) return
        const { pdfjs } = await import("react-pdf")
        const version = pdfjs.version
        const key = workerKey(version)
        if (await hasFile(key)) return
        const res = await fetch(staticWorkerSrc(version), { cache: "force-cache" })
        if (!res.ok) return
        const blob = await res.blob()
        if (blob && blob.size > 0) await putFile(key, blob)
    } catch {
        // Best-effort — a render-time failure still surfaces via PDFViewer's normal
        // error/retry path; we just couldn't pre-arm the offline worker.
    }
}

/**
 * Ensure the offline worker blob: URL exists (building it from cached bytes on
 * first offline use). Awaited by PDFViewer before the <Document> mounts so the
 * worker is resolvable offline. No-op online, or when already built / no bytes.
 */
export async function ensureOfflineWorkerReady(version: string): Promise<void> {
    if (!isOffline()) return
    if (offlineBlobUrl && offlineBlobVersion === version) return
    if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return
    try {
        const blob = await getFile(workerKey(version))
        if (!blob) return
        const bytes = await blob.arrayBuffer()
        // Force a JS MIME so `new Worker(blob:…, {type:'module'})` is accepted
        // regardless of how the host served the original .mjs content-type.
        const url = URL.createObjectURL(new Blob([bytes], { type: "text/javascript" }))
        offlineBlobUrl = url
        offlineBlobVersion = version
    } catch {
        // Leave workerSrc on the static URL; offline open will fail the same as
        // before this fix (no regression), online is unaffected.
    }
}

/** Test-only: reset the module-level memo between cases. */
export function __resetOfflineWorkerForTests(): void {
    offlineBlobUrl = null
    offlineBlobVersion = null
}
