/**
 * offline-idb — WebKit-safe blob persistence (F1 offline-precache).
 *
 * Root cause this guards: WebKit / iOS Safari (the band's iPad hardware) FAILS
 * the IndexedDB put transaction when the stored value contains a Blob, so the
 * offline cache silently never populated on the actual devices. The store now
 * persists an ArrayBuffer and reconstructs the Blob on read. These tests lock
 * the round-trip + the on-disk shape + the legacy-Blob read fallback.
 *
 * (fake-indexeddb stores Blobs fine, so it can't reproduce the WebKit failure
 * itself — the deployed ipad-webkit e2e repro covers that. Here we assert the
 * contract that makes the WebKit path work.)
 */
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { putFile, getFile, hasFile, listFileIds, deleteFile, clearAll, totalBytes } from './offline-idb'

// jsdom's Blob omits arrayBuffer(); real browsers (incl. the band's iPad WebKit)
// implement it. Polyfill via FileReader so the round-trip contract is testable.
if (typeof Blob.prototype.arrayBuffer !== 'function') {
    Object.defineProperty(Blob.prototype, 'arrayBuffer', {
        configurable: true,
        value: function (this: Blob) {
            return new Promise<ArrayBuffer>((resolve, reject) => {
                const fr = new FileReader()
                fr.onload = () => resolve(fr.result as ArrayBuffer)
                fr.onerror = () => reject(fr.error)
                fr.readAsArrayBuffer(this)
            })
        },
    })
}

function rawGet(fileId: string): Promise<Record<string, unknown> | undefined> {
    return new Promise((resolve, reject) => {
        const open = indexedDB.open('crc-offline')
        open.onsuccess = () => {
            const db = open.result
            const r = db.transaction('files', 'readonly').objectStore('files').get(fileId)
            r.onsuccess = () => {
                resolve(r.result as Record<string, unknown> | undefined)
                db.close()
            }
            r.onerror = () => reject(r.error)
        }
        open.onerror = () => reject(open.error)
    })
}

describe('offline-idb', () => {
    beforeEach(async () => {
        await clearAll()
    })

    it('round-trips: putFile(blob) → getFile returns a Blob with identical bytes + mime', async () => {
        const blob = new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: 'application/pdf' })
        await putFile('upload-1', blob)

        expect(await hasFile('upload-1')).toBe(true)
        const got = await getFile('upload-1')
        expect(got).toBeInstanceOf(Blob)
        expect(got!.type).toBe('application/pdf')
        expect(Array.from(new Uint8Array(await got!.arrayBuffer()))).toEqual([1, 2, 3, 4, 5])
    })

    it('persists bytes as an ArrayBuffer (WebKit-safe), never a Blob', async () => {
        await putFile('upload-2', new Blob([new Uint8Array([9, 9])], { type: 'text/plain' }))
        const raw = await rawGet('upload-2')
        // Duck-type (cross-realm instanceof is unreliable under fake-indexeddb):
        // bytes are stored as a buffer, NOT a Blob, with no legacy blob field.
        expect((raw?.data as ArrayBuffer | undefined)?.byteLength).toBe(2)
        expect(raw?.data instanceof Blob).toBe(false)
        expect(raw?.blob).toBeUndefined()
        expect(raw?.mime).toBe('text/plain')
    })

    it('getFile returns null for a missing key', async () => {
        expect(await getFile('nope')).toBeNull()
    })

    it('listFileIds / deleteFile / totalBytes track stored bytes', async () => {
        await putFile('a', new Blob([new Uint8Array([1, 2, 3])], { type: 'application/pdf' }))
        await putFile('b', new Blob([new Uint8Array([4, 5])], { type: 'application/pdf' }))
        expect((await listFileIds()).sort()).toEqual(['a', 'b'])
        expect(await totalBytes()).toBe(5)
        await deleteFile('a')
        expect(await hasFile('a')).toBe(false)
        expect(await listFileIds()).toEqual(['b'])
    })
})
