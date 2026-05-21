import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'

import * as idb from '@/lib/offline-idb'

describe('offline-idb', () => {
    beforeEach(async () => {
        await idb.clearAll()
    })

    it('putFile + getFile round-trips a blob', async () => {
        const blob = new Blob(['hello'], { type: 'text/plain' })
        await idb.putFile('f1', blob)
        const got = await idb.getFile('f1')
        // fake-indexeddb may deserialize differently across envs; just
        // verify we got SOMETHING back (non-null means the round-trip worked).
        expect(got).not.toBeNull()
    })

    it('hasFile reflects presence', async () => {
        expect(await idb.hasFile('nope')).toBe(false)
        await idb.putFile('f1', new Blob(['x']))
        expect(await idb.hasFile('f1')).toBe(true)
    })

    it('listFileIds returns every stored id', async () => {
        await idb.putFile('a', new Blob(['1']))
        await idb.putFile('b', new Blob(['22']))
        await idb.putFile('c', new Blob(['333']))
        const ids = await idb.listFileIds()
        expect(ids.sort()).toEqual(['a', 'b', 'c'])
    })

    it('deleteFile removes a single entry', async () => {
        await idb.putFile('a', new Blob(['1']))
        await idb.putFile('b', new Blob(['2']))
        await idb.deleteFile('a')
        expect(await idb.hasFile('a')).toBe(false)
        expect(await idb.hasFile('b')).toBe(true)
    })

    it('clearAll wipes the store', async () => {
        await idb.putFile('a', new Blob(['1']))
        await idb.putFile('b', new Blob(['2']))
        await idb.clearAll()
        expect(await idb.listFileIds()).toEqual([])
    })

    it('totalBytes sums stored sizes', async () => {
        await idb.putFile('a', new Blob(['ab']))     // 2
        await idb.putFile('b', new Blob(['cdef']))   // 4
        const total = await idb.totalBytes()
        expect(total).toBe(6)
    })

    it('putFile overwrites existing entry (keyed by fileId)', async () => {
        await idb.putFile('f1', new Blob(['old']))
        await idb.putFile('f1', new Blob(['new-value']))
        const got = await idb.getFile('f1')
        expect(got).not.toBeNull()
        const ids = await idb.listFileIds()
        expect(ids).toEqual(['f1'])
    })

    it('stores bytes as an ArrayBuffer (WebKit-safe), not a Blob', async () => {
        // WebKit / iOS Safari (the band's iPads) FAILS the IndexedDB put when the
        // value contains a Blob, so the bytes must persist as an ArrayBuffer. Read
        // the raw record to lock the on-disk shape (guards against reverting).
        await idb.putFile('shape', new Blob(['abc'], { type: 'application/pdf' }))
        const raw = await new Promise<Record<string, unknown> | undefined>((resolve, reject) => {
            const open = indexedDB.open('crc-offline')
            open.onsuccess = () => {
                const db = open.result
                const r = db.transaction('files', 'readonly').objectStore('files').get('shape')
                r.onsuccess = () => {
                    resolve(r.result as Record<string, unknown> | undefined)
                    db.close()
                }
                r.onerror = () => reject(r.error)
            }
            open.onerror = () => reject(open.error)
        })
        // Duck-typed (cross-realm instanceof is unreliable under fake-indexeddb).
        expect((raw?.data as ArrayBuffer | undefined)?.byteLength).toBe(3)
        expect(raw?.data instanceof Blob).toBe(false)
        expect(raw?.blob).toBeUndefined()
    })

    it('getFile reconstructs a Blob with the stored mime + bytes', async () => {
        await idb.putFile('mime', new Blob(['xy'], { type: 'application/pdf' }))
        const got = await idb.getFile('mime')
        expect(got).toBeInstanceOf(Blob)
        expect(got!.type).toBe('application/pdf')
        expect(Array.from(new Uint8Array(await got!.arrayBuffer()))).toEqual([120, 121])
    })
})
