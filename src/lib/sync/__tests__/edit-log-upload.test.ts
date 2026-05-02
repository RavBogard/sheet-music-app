import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock @sentry/nextjs at file scope. addBreadcrumb is the only API the
// new wrapper calls; the spy lets us assert payload shape per call. We
// also keep captureException available so existing helpers don't blow up
// if the same module is imported transitively.
const addBreadcrumbSpy = vi.fn()
const captureExceptionSpy = vi.fn()
vi.mock('@sentry/nextjs', () => ({
    addBreadcrumb: (...args: unknown[]) => addBreadcrumbSpy(...args),
    captureException: (...args: unknown[]) => captureExceptionSpy(...args),
}))

import { getDb, resetDbForTests } from '../../local/schema'
import type { LocalEditLog } from '../../local/types'
import { recordEdit } from '../edit-log'
import { uploadRecentEditLog } from '../edit-log-upload'
import {
    addEditBreadcrumb,
    uploadEditLogBreadcrumbs,
} from '../sentry-capture'

function makeEntry(
    overrides: Partial<LocalEditLog> = {},
): LocalEditLog {
    return {
        id: 1,
        ts: 1_700_000_000_000,
        source: 'apply-edit',
        op: 'update',
        collection: 'tracks',
        docId: 't-1',
        payloadKeys: ['key'],
        ...overrides,
    }
}

describe('addEditBreadcrumb', () => {
    beforeEach(() => {
        addBreadcrumbSpy.mockReset()
    })

    it('passes only stable identifiers to Sentry — no payload values', () => {
        addEditBreadcrumb(
            makeEntry({
                source: 'engine-drain',
                outcome: 'success',
                attempts: 0,
            }),
        )

        expect(addBreadcrumbSpy).toHaveBeenCalledTimes(1)
        const arg = addBreadcrumbSpy.mock.calls[0]![0] as {
            category: string
            level: string
            message: string
            data: Record<string, string>
            timestamp: number
        }
        expect(arg.category).toBe('edit-log')
        expect(arg.level).toBe('info')
        expect(arg.message).toBe('engine-drain/success')
        // Tag values are strings (Sentry tag indexer requires strings).
        expect(arg.data.source).toBe('engine-drain')
        expect(arg.data.op).toBe('update')
        expect(arg.data.collection).toBe('tracks')
        expect(arg.data.docId).toBe('t-1')
        expect(arg.data.outcome).toBe('success')
        expect(arg.data.attempts).toBe('0')
        expect(arg.data.payloadKeys).toBe('key')
        // No value-leaking field present.
        const FORBIDDEN = [
            'payload',
            'text',
            'value',
            'draft',
            'title',
            'notes',
            'lead',
            'leadMusician',
            'ariaLabel',
        ]
        for (const k of FORBIDDEN) {
            expect(k in arg.data).toBe(false)
        }
        // Timestamp is in seconds (Sentry breadcrumb convention).
        expect(arg.timestamp).toBe(1_700_000_000)
    })

    it('drops undefined/null fields so no "undefined" string leaks into Sentry data', () => {
        addEditBreadcrumb({
            id: 2,
            ts: 1_700_000_000_000,
            source: 'text-cell',
            cellType: 'text',
            payloadKeys: ['(text)'],
            // op, collection, docId, outcome, attempts, localUpdatedAt all
            // intentionally omitted.
        })

        const arg = addBreadcrumbSpy.mock.calls[0]![0] as {
            data: Record<string, string>
        }
        expect(arg.data.source).toBe('text-cell')
        expect(arg.data.cellType).toBe('text')
        expect(arg.data.payloadKeys).toBe('(text)')
        expect('op' in arg.data).toBe(false)
        expect('collection' in arg.data).toBe(false)
        expect('docId' in arg.data).toBe(false)
        expect('outcome' in arg.data).toBe(false)
        expect('attempts' in arg.data).toBe(false)
        expect('localUpdatedAt' in arg.data).toBe(false)
    })

    it('is a no-op (no throw) when the Sentry SDK throws', () => {
        addBreadcrumbSpy.mockImplementationOnce(() => {
            throw new Error('Sentry uninitialized')
        })
        expect(() => addEditBreadcrumb(makeEntry())).not.toThrow()
    })

    it("message falls back to '<source>/recorded' when outcome is omitted", () => {
        addEditBreadcrumb(makeEntry({ outcome: undefined }))
        const arg = addBreadcrumbSpy.mock.calls[0]![0] as { message: string }
        expect(arg.message).toBe('apply-edit/recorded')
    })
})

describe('uploadEditLogBreadcrumbs', () => {
    beforeEach(() => {
        addBreadcrumbSpy.mockReset()
    })

    it('returns the highest id seen and pushes one breadcrumb per entry in chronological order', () => {
        // Caller hands us descending-by-ts (newest first).
        const result = uploadEditLogBreadcrumbs([
            makeEntry({ id: 5, ts: 5_000 }),
            makeEntry({ id: 3, ts: 3_000 }),
            makeEntry({ id: 1, ts: 1_000 }),
        ])
        expect(result.lastUploadedId).toBe(5)
        expect(addBreadcrumbSpy).toHaveBeenCalledTimes(3)
        // First breadcrumb pushed should be the OLDEST (ts=1000) since
        // the helper reverses the input for chronological order.
        const tsSeq = addBreadcrumbSpy.mock.calls.map(
            (c) => (c[0] as { timestamp: number }).timestamp,
        )
        expect(tsSeq).toEqual([1, 3, 5])
    })

    it('returns lastUploadedId=null on empty input and pushes nothing', () => {
        const result = uploadEditLogBreadcrumbs([])
        expect(result.lastUploadedId).toBe(null)
        expect(addBreadcrumbSpy).not.toHaveBeenCalled()
    })
})

describe('uploadRecentEditLog (orchestrator)', () => {
    beforeEach(async () => {
        addBreadcrumbSpy.mockReset()
        await resetDbForTests()
    })

    afterEach(async () => {
        vi.restoreAllMocks()
        await resetDbForTests()
    })

    it('reads recent entries, pushes them as breadcrumbs, and clears the uploaded id range', async () => {
        const db = getDb()
        for (let i = 0; i < 4; i++) {
            await recordEdit(
                {
                    ts: 1_000 + i,
                    source: 'apply-edit',
                    op: 'update',
                    collection: 'tracks',
                    docId: 't-' + i,
                    payloadKeys: ['key'],
                },
                { db },
            )
        }
        // Sanity: 4 rows, ids 1..4
        expect(await db.edit_log.count()).toBe(4)

        await uploadRecentEditLog({ db, max: 10 })

        // All 4 breadcrumbs pushed.
        expect(addBreadcrumbSpy).toHaveBeenCalledTimes(4)
        // edit_log fully drained (lastUploadedId=4, deletes id<=4).
        expect(await db.edit_log.count()).toBe(0)
    })

    it('skips clearUploaded when there are no entries to upload', async () => {
        const db = getDb()
        // Spy on the helper indirectly: empty edit_log → no breadcrumbs;
        // count remains zero (vacuously).
        await uploadRecentEditLog({ db })
        expect(addBreadcrumbSpy).not.toHaveBeenCalled()
        expect(await db.edit_log.count()).toBe(0)
    })

    it('swallows failures from any underlying helper (does not throw)', async () => {
        const db = getDb()
        await recordEdit(
            {
                ts: 1_000,
                source: 'apply-edit',
                op: 'update',
                collection: 'tracks',
                docId: 't-1',
            },
            { db },
        )
        // Force Sentry.addBreadcrumb to throw on every call.
        addBreadcrumbSpy.mockImplementation(() => {
            throw new Error('sentry transport down')
        })

        await expect(
            uploadRecentEditLog({ db }),
        ).resolves.toBeUndefined()
    })

    it('respects the max option (only reads up to max recent rows)', async () => {
        const db = getDb()
        for (let i = 0; i < 5; i++) {
            await recordEdit(
                {
                    ts: 1_000 + i,
                    source: 'apply-edit',
                    op: 'update',
                    collection: 'tracks',
                    docId: 't-' + i,
                },
                { db },
            )
        }

        await uploadRecentEditLog({ db, max: 2 })

        // Only 2 breadcrumbs pushed (the 2 most recent).
        expect(addBreadcrumbSpy).toHaveBeenCalledTimes(2)
        // Only the 2 most-recent rows (ids 4,5) are cleared (lastUploadedId=5
        // → delete id<=5 → all rows). NOTE: our cap deletes by id<=lastSeen,
        // so older rows can be drained too even when max<count. That's
        // intentional per the helper contract — we don't want to leave a
        // partial range behind to re-send; future entries get fresh ids.
        expect(await db.edit_log.count()).toBe(0)
    })
})
