import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getDb, resetDbForTests } from '../../local/schema'
import type { LocalEditLog } from '../../local/types'
import {
    EDIT_LOG_MAX_ROWS,
    clearUploaded,
    getRecentEntries,
    recordEdit,
} from '../edit-log'

// Build an entry with sane defaults; tests override what they care about.
function makeEntry(
    overrides: Partial<Omit<LocalEditLog, 'id'>> = {},
): Omit<LocalEditLog, 'id'> {
    return {
        ts: Date.now(),
        source: 'apply-edit',
        op: 'update',
        collection: 'tracks',
        docId: 't-' + Math.random().toString(36).slice(2, 8),
        payloadKeys: ['key'],
        ...overrides,
    }
}

describe('edit-log helper (v5h3-01-02)', () => {
    beforeEach(async () => {
        await resetDbForTests()
    })

    afterEach(async () => {
        vi.restoreAllMocks()
        await resetDbForTests()
    })

    it('recordEdit writes one row with autoincrement id and uses the provided ts', async () => {
        const db = getDb()
        await recordEdit(makeEntry({ ts: 1700000000000 }), { db })
        await recordEdit(makeEntry({ ts: 1700000001000 }), { db })

        const rows = await db.edit_log.orderBy('id').toArray()
        expect(rows).toHaveLength(2)
        expect(rows[0]!.id).toBe(1)
        expect(rows[1]!.id).toBe(2)
        expect(rows[0]!.ts).toBe(1700000000000)
        expect(rows[1]!.ts).toBe(1700000001000)
    })

    it('recordEdit fills ts when omitted', async () => {
        const db = getDb()
        const before = Date.now()
        await recordEdit(
            { source: 'engine-drain', outcome: 'success' } as Omit<
                LocalEditLog,
                'id'
            > & { ts?: number },
            { db },
        )
        const after = Date.now()
        const row = (await db.edit_log.toArray())[0]!
        expect(row.ts).toBeGreaterThanOrEqual(before)
        expect(row.ts).toBeLessThanOrEqual(after)
    })

    it('recordEdit applies FIFO cap at EDIT_LOG_MAX_ROWS — oldest evicted, newest retained', async () => {
        const db = getDb()
        // Insert MAX + 10 rows with strictly increasing `ts` so eviction
        // picks the lowest-ts rows deterministically.
        const total = EDIT_LOG_MAX_ROWS + 10
        for (let i = 0; i < total; i++) {
            await recordEdit(makeEntry({ ts: 1_700_000_000_000 + i }), { db })
        }

        const count = await db.edit_log.count()
        expect(count).toBe(EDIT_LOG_MAX_ROWS)

        const allTs = (await db.edit_log.orderBy('ts').toArray()).map((r) => r.ts)
        // Smallest retained ts should be the 11th inserted (index 10) since
        // the first 10 were evicted. Largest retained ts should be the last.
        expect(allTs[0]).toBe(1_700_000_000_000 + 10)
        expect(allTs[allTs.length - 1]).toBe(1_700_000_000_000 + total - 1)
    })

    it('recordEdit swallows Dexie failures (does not throw)', async () => {
        const db = getDb()
        const addSpy = vi
            .spyOn(db.edit_log, 'add')
            .mockImplementation(() => {
                throw new Error('injected dexie failure')
            })

        await expect(
            recordEdit(makeEntry(), { db }),
        ).resolves.toBeUndefined()

        addSpy.mockRestore()
    })

    it('getRecentEntries returns the K most-recent rows sorted by ts descending', async () => {
        const db = getDb()
        await recordEdit(makeEntry({ ts: 100 }), { db })
        await recordEdit(makeEntry({ ts: 300 }), { db })
        await recordEdit(makeEntry({ ts: 200 }), { db })
        await recordEdit(makeEntry({ ts: 400 }), { db })

        const rows = await getRecentEntries(3, { db })
        expect(rows.map((r) => r.ts)).toEqual([400, 300, 200])
    })

    it('getRecentEntries default K is 50', async () => {
        const db = getDb()
        for (let i = 0; i < 60; i++) {
            await recordEdit(makeEntry({ ts: 1_000 + i }), { db })
        }
        const rows = await getRecentEntries(undefined, { db })
        expect(rows).toHaveLength(50)
    })

    it('getRecentEntries returns [] when the underlying read throws', async () => {
        const db = getDb()
        const orderBySpy = vi
            .spyOn(db.edit_log, 'orderBy')
            .mockImplementation(() => {
                throw new Error('injected read failure')
            })

        const rows = await getRecentEntries(5, { db })
        expect(rows).toEqual([])

        orderBySpy.mockRestore()
    })

    it('clearUploaded deletes only rows with id <= maxId', async () => {
        const db = getDb()
        for (let i = 0; i < 5; i++) {
            await recordEdit(makeEntry({ ts: 1_000 + i }), { db })
        }
        // Ids: 1..5
        await clearUploaded(3, { db })

        const remaining = await db.edit_log.orderBy('id').toArray()
        expect(remaining.map((r) => r.id)).toEqual([4, 5])
    })

    it('clearUploaded swallows failures (does not throw)', async () => {
        const db = getDb()
        const whereSpy = vi
            .spyOn(db.edit_log, 'where')
            .mockImplementation(() => {
                throw new Error('injected delete failure')
            })

        await expect(clearUploaded(1, { db })).resolves.toBeUndefined()

        whereSpy.mockRestore()
    })

    // ─── Call-site contract: every recorded row across the 5 hot sites
    //     must carry only stable identifiers. The type system already
    //     enforces this at compile time (LocalEditLog has no value field);
    //     this is the runtime trip-wire.

    it('site-contract: applyEdit records a stable-identifier-only row on success', async () => {
        const db = getDb()
        // applyEdit calls recordEdit() WITHOUT an injected db — it uses the
        // singleton from getDb(). resetDbForTests() above resets _db so the
        // singleton lookup yields the same fresh instance the test holds.
        const { applyEdit } = await import('../../local/write')
        await applyEdit({
            op: 'set',
            collection: 'tracks',
            doc: { id: 't-site-1', setlistId: 's1', order: 0, title: 'Adon Olam' },
        })
        // recordEdit fires fire-and-forget — yield microtasks for it to land.
        await new Promise<void>((r) => setTimeout(r, 0))

        const rows = await db.edit_log
            .filter((r) => r.source === 'apply-edit')
            .toArray()
        expect(rows.length).toBeGreaterThanOrEqual(1)
        const row = rows[rows.length - 1] as unknown as Record<string, unknown>
        expect(row.source).toBe('apply-edit')
        expect(row.op).toBe('set')
        expect(row.collection).toBe('tracks')
        expect(row.docId).toBe('t-site-1')
        // payloadKeys is the LIST OF KEY NAMES from the doc, not values.
        const keys = row.payloadKeys as string[]
        expect(keys).toContain('id')
        expect(keys).toContain('title')
        // CRITICAL: 'Adon Olam' (the value of `title`) MUST NOT appear
        // anywhere in the row.
        const json = JSON.stringify(row)
        expect(json.includes('Adon Olam')).toBe(false)
    })

    it('LocalEditLog shape — no payload-value field exists at the type or runtime level', async () => {
        // Compile-time guard: writing a `payload`/`text`/`value`/`draft` field
        // would be a type error. Runtime guard: payloadKeys is string[] —
        // if a future change accepts arbitrary entry shapes, this test is
        // the trip wire. We assert by enumerating all fields a recorded row
        // can contain and rejecting any that look like value-carriers.
        const db = getDb()
        await recordEdit(makeEntry({ payloadKeys: ['key', 'notes'] }), { db })
        const row = (await db.edit_log.toArray())[0]! as unknown as Record<string, unknown>

        const FORBIDDEN_KEYS = [
            'payload',
            'text',
            'value',
            'draft',
            'title',
            'notes',
            'lead',
            'leadMusician',
            'ariaLabel',
            'data',
        ]
        for (const k of FORBIDDEN_KEYS) {
            expect(k in row).toBe(false)
        }

        // payloadKeys, when present, is an array of strings — never a single
        // string that could be a value.
        expect(Array.isArray(row.payloadKeys)).toBe(true)
        for (const k of row.payloadKeys as unknown[]) {
            expect(typeof k).toBe('string')
        }
    })
})
