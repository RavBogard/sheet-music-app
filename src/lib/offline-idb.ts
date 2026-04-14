/**
 * Offline blob store backed by IndexedDB.
 *
 * Ground truth for "is this file available offline." Replaces the Cache
 * Storage reads that were left behind when v2.5 removed the service worker.
 *
 * Schema: database `crc-offline`, version 1, object store `files` keyed by
 * fileId. Entries are `{ fileId, blob, mime, size, savedAt }`.
 *
 * SSR/old-browser safe: every export resolves to the "empty" answer when
 * `indexedDB` is undefined. `putFile` is a no-op in that case.
 */

const DB_NAME = 'crc-offline'
const DB_VERSION = 1
const STORE_NAME = 'files'

export interface OfflineFileEntry {
    fileId: string
    blob: Blob
    mime: string
    size: number
    savedAt: number
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

export async function putFile(fileId: string, blob: Blob): Promise<void> {
    if (!hasIDB()) return
    const entry: OfflineFileEntry = {
        fileId,
        blob,
        mime: blob.type || 'application/octet-stream',
        size: blob.size,
        savedAt: Date.now(),
    }
    await withStore('readwrite', async (store) => {
        await reqPromise(store.put(entry))
    })
}

export async function getFile(fileId: string): Promise<Blob | null> {
    if (!hasIDB()) return null
    try {
        return await withStore('readonly', async (store) => {
            const entry = await reqPromise<OfflineFileEntry | undefined>(store.get(fileId))
            return entry?.blob ?? null
        })
    } catch {
        return null
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
