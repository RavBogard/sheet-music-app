/**
 * Offline blob store backed by IndexedDB.
 *
 * Ground truth for "is this file available offline." Replaces the Cache
 * Storage reads that were left behind when v2.5 removed the service worker.
 *
 * Schema: database `crc-offline`, version 1, object store `files` keyed by
 * fileId. Entries are `{ fileId, data, mime, size, savedAt, version? }`.
 *
 * PERF-18: `version` is the library row's content identity at save time
 * (`h:<contentHash>` or `u:<updatedAt ms>`, see `chart-version.ts`). A chart
 * is healed in place under the same fileId, so the fileId alone can't say
 * whether this device holds the current bytes. Entries saved before this
 * field existed carry no version and read as stale whenever the server knows
 * one. A refresh is always a single `put` over the old entry: nothing here
 * deletes a chart in order to replace it.
 *
 * SSR/old-browser safe: every export resolves to the "empty" answer when
 * `indexedDB` is undefined. `putFile` is a no-op in that case.
 */

const DB_NAME = 'crc-offline'
const DB_VERSION = 1
const STORE_NAME = 'files'

export interface OfflineFileEntry {
    fileId: string
    /**
     * Chart bytes as an ArrayBuffer. WebKit / iOS Safari — the band's iPad
     * hardware — FAILS the IndexedDB put transaction when the stored value
     * contains a Blob (verified on the ipad-webkit project: `put(blob)` errors
     * and nothing caches; `put(arrayBuffer)` succeeds). So bytes persist as an
     * ArrayBuffer and the Blob is reconstructed on read.
     */
    data?: ArrayBuffer
    /** @deprecated Legacy shape — Blob entries written on Chromium before the
     *  WebKit fix. Read-only fallback in getFile; never written anymore. */
    blob?: Blob
    mime: string
    size: number
    savedAt: number
    /** PERF-18: the library row's version when these bytes were saved. */
    version?: string
}

function hasIDB(): boolean {
    return typeof indexedDB !== 'undefined'
}

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION)
        req.onupgradeneeded = () => {
            const db = req.result
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'fileId' })
            }
        }
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
    })
}

async function withStore<T>(
    mode: IDBTransactionMode,
    fn: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
    const db = await openDB()
    try {
        return await new Promise<T>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, mode)
            const store = tx.objectStore(STORE_NAME)
            const result = fn(store)
            tx.oncomplete = async () => resolve(await result)
            tx.onerror = () => reject(tx.error)
            tx.onabort = () => reject(tx.error)
        })
    } finally {
        db.close()
    }
}

function reqPromise<T>(req: IDBRequest<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
    })
}

export async function putFile(fileId: string, blob: Blob, version?: string): Promise<void> {
    if (!hasIDB()) return
    // Persist as ArrayBuffer, NOT Blob. WebKit/iOS Safari (the band's iPads)
    // errors the put transaction when the value contains a Blob, so nothing
    // would cache; ArrayBuffer round-trips on every engine.
    const data = await blob.arrayBuffer()
    const entry: OfflineFileEntry = {
        fileId,
        data,
        mime: blob.type || 'application/octet-stream',
        size: blob.size,
        savedAt: Date.now(),
        ...(version ? { version } : {}),
    }
    // One `put` replaces the old entry atomically: the previous bytes stay
    // readable until this transaction commits, and stay put if it fails.
    await withStore('readwrite', async (store) => {
        await reqPromise(store.put(entry))
    })
}

export async function getFile(fileId: string): Promise<Blob | null> {
    if (!hasIDB()) return null
    try {
        return await withStore('readonly', async (store) => {
            const entry = await reqPromise<OfflineFileEntry | undefined>(store.get(fileId))
            if (!entry) return null
            // New shape: rebuild the Blob from the stored ArrayBuffer.
            if (entry.data) return new Blob([entry.data], { type: entry.mime || 'application/octet-stream' })
            // Legacy shape: a Blob persisted on Chromium before the WebKit fix.
            return entry.blob ?? null
        })
    } catch {
        return null
    }
}

/**
 * PERF-18: the saved version of a cached chart. `undefined` when the file is
 * not cached; `null` when it is cached without a version (saved before
 * versioning, or by a viewer that didn't know one).
 */
export async function getFileVersion(fileId: string): Promise<string | null | undefined> {
    if (!hasIDB()) return undefined
    try {
        return await withStore('readonly', async (store) => {
            const entry = await reqPromise<OfflineFileEntry | undefined>(store.get(fileId))
            if (!entry) return undefined
            return typeof entry.version === 'string' && entry.version ? entry.version : null
        })
    } catch {
        return undefined
    }
}

export async function hasFile(fileId: string): Promise<boolean> {
    if (!hasIDB()) return false
    try {
        return await withStore('readonly', async (store) => {
            const count = await reqPromise<number>(store.count(fileId))
            return count > 0
        })
    } catch {
        return false
    }
}

export async function deleteFile(fileId: string): Promise<void> {
    if (!hasIDB()) return
    await withStore('readwrite', async (store) => {
        await reqPromise(store.delete(fileId))
    })
}

export async function listFileIds(): Promise<string[]> {
    if (!hasIDB()) return []
    try {
        return await withStore('readonly', async (store) => {
            return await reqPromise<IDBValidKey[]>(store.getAllKeys()) as string[]
        })
    } catch {
        return []
    }
}

export async function clearAll(): Promise<void> {
    if (!hasIDB()) return
    await withStore('readwrite', async (store) => {
        await reqPromise(store.clear())
    })
}

export async function totalBytes(): Promise<number> {
    if (!hasIDB()) return 0
    try {
        return await withStore('readonly', async (store) => {
            const entries = await reqPromise<OfflineFileEntry[]>(store.getAll())
            return entries.reduce((sum, e) => sum + (e.size || 0), 0)
        })
    } catch {
        return 0
    }
}
