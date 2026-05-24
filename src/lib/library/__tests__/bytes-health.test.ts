import { describe, expect, it } from 'vitest'
import {
    DEFAULT_LIBRARY_BYTES_MAX_REPORTED,
    LIBRARY_BYTES_ERROR_FRACTION,
    checkLibraryBytesHealth,
    deriveLibraryBytesVerdict,
    type LibraryBytesBucket,
    type LibraryBytesRow,
} from '../bytes-health'

const HOUR = 60 * 60 * 1000
const NOW = new Date('2026-05-24T02:00:00Z').getTime()

/**
 * Bucket fake. `present` is the set of fileIds the bucket "has bytes for"
 * (under any of the four known variants: exact, `.pdf`, `.xml`, `.mp3`).
 * Anything not in `present` returns an empty listing. `throwOn` simulates a
 * Storage outage on selected fileIds so the per-row try/catch is testable.
 */
function makeBucket(
    present: Iterable<string>,
    opts: { variant?: 'pdf' | 'xml' | 'mp3' | 'noext'; throwOn?: Iterable<string> } = {},
): LibraryBytesBucket {
    const set = new Set(present)
    const throwSet = new Set(opts.throwOn ?? [])
    const variant = opts.variant ?? 'pdf'
    const suffix =
        variant === 'pdf' ? '.pdf'
            : variant === 'xml' ? '.xml'
                : variant === 'mp3' ? '.mp3'
                    : ''
    return {
        async getFiles({ prefix }) {
            const id = prefix.replace(/^library\//, '')
            if (throwSet.has(id)) throw new Error('storage transient')
            if (!set.has(id)) return [[]]
            return [[{ name: `library/${id}${suffix}` }]]
        },
    }
}

const row = (fileId: string, ts?: unknown): LibraryBytesRow => ({
    fileId,
    lastSyncedAt: ts,
})

describe('deriveLibraryBytesVerdict (pure threshold helper)', () => {
    it('healthy when nothing missing', () => {
        expect(deriveLibraryBytesVerdict(0, 200)).toBe('healthy')
    })

    it('healthy on empty sample regardless of missingCount (no data → no alarm)', () => {
        // Guards the ceil(0*0.05)==0 degenerate case that would otherwise
        // alarm `missingCount>=0` as error.
        expect(deriveLibraryBytesVerdict(0, 0)).toBe('healthy')
        expect(deriveLibraryBytesVerdict(5, 0)).toBe('healthy')
    })

    it('warning for 1 missing below the 5% threshold at sample 200', () => {
        // ceil(200 * 0.05) = 10 → 1..9 missing is warning
        expect(deriveLibraryBytesVerdict(1, 200)).toBe('warning')
        expect(deriveLibraryBytesVerdict(9, 200)).toBe('warning')
    })

    it('error at the 5% boundary and above', () => {
        expect(deriveLibraryBytesVerdict(10, 200)).toBe('error')
        expect(deriveLibraryBytesVerdict(50, 200)).toBe('error')
        expect(deriveLibraryBytesVerdict(200, 200)).toBe('error')
    })

    it('honors the LIBRARY_BYTES_ERROR_FRACTION constant', () => {
        // 5% — change here breaks the threshold contract; this assertion makes
        // the contract explicit so a future tune doesn't silently move it.
        expect(LIBRARY_BYTES_ERROR_FRACTION).toBe(0.05)
    })
})

describe('checkLibraryBytesHealth — sampling', () => {
    it('reports healthy with zero missing when every row has bytes', async () => {
        const rows = ['a', 'b', 'c'].map((id) => row(id, NOW - HOUR))
        const bucket = makeBucket(['a', 'b', 'c'])
        const result = await checkLibraryBytesHealth(rows, bucket, NOW)
        expect(result.scanned).toBe(3)
        expect(result.sampleSize).toBe(3)
        expect(result.missingCount).toBe(0)
        expect(result.missing).toEqual([])
        expect(result.oldestMissing).toBe(null)
        expect(result.oldestMissingAgeHours).toBe(null)
        expect(result.verdict).toBe('healthy')
    })

    it('reports a single missing row as warning', async () => {
        const rows = ['a', 'b', 'c'].map((id) => row(id, NOW - HOUR))
        const bucket = makeBucket(['a', 'c']) // b missing
        const result = await checkLibraryBytesHealth(rows, bucket, NOW)
        expect(result.missingCount).toBe(1)
        expect(result.missing).toHaveLength(1)
        expect(result.missing[0].fileId).toBe('b')
        // 1 missing of 3 sampled = 33% > ceil(3 * 0.05) = 1 → error
        // (small-sample collapse — documented at the verdict helper). Verify:
        expect(result.verdict).toBe('error')
    })

    it('crosses into error when >= ceil(sampleSize * 0.05) rows missing', async () => {
        // Sample 20 rows; ceil(20 * 0.05) = 1. Need 1+ missing for error.
        // Use sample 100 to give the threshold room: ceil(100 * 0.05) = 5.
        const rows: LibraryBytesRow[] = []
        for (let i = 0; i < 100; i++) {
            rows.push(row(`f${i}`, NOW - HOUR))
        }
        // 4 missing → warning
        const presentFor4 = Array.from({ length: 96 }, (_, i) => `f${i + 4}`)
        const r4 = await checkLibraryBytesHealth(rows, makeBucket(presentFor4), NOW)
        expect(r4.missingCount).toBe(4)
        expect(r4.verdict).toBe('warning')

        // 5 missing → error
        const presentFor5 = Array.from({ length: 95 }, (_, i) => `f${i + 5}`)
        const r5 = await checkLibraryBytesHealth(rows, makeBucket(presentFor5), NOW)
        expect(r5.missingCount).toBe(5)
        expect(r5.verdict).toBe('error')
    })

    it('reports an empty snapshot as healthy with sampleSize 0', async () => {
        const result = await checkLibraryBytesHealth([], makeBucket([]), NOW)
        expect(result.scanned).toBe(0)
        expect(result.sampleSize).toBe(0)
        expect(result.missingCount).toBe(0)
        expect(result.verdict).toBe('healthy')
    })

    it('caps reported missing entries at maxReported (default 20)', async () => {
        const rows: LibraryBytesRow[] = []
        for (let i = 0; i < 50; i++) rows.push(row(`f${i}`, NOW - HOUR))
        const bucket = makeBucket([]) // all missing
        const result = await checkLibraryBytesHealth(rows, bucket, NOW)
        expect(result.missingCount).toBe(50)
        expect(result.missing).toHaveLength(DEFAULT_LIBRARY_BYTES_MAX_REPORTED)
    })

    it('honors a custom maxReported', async () => {
        const rows: LibraryBytesRow[] = []
        for (let i = 0; i < 10; i++) rows.push(row(`f${i}`, NOW - HOUR))
        const bucket = makeBucket([])
        const result = await checkLibraryBytesHealth(rows, bucket, NOW, {
            maxReported: 3,
        })
        expect(result.missingCount).toBe(10)
        expect(result.missing).toHaveLength(3)
    })

    it('honors a custom maxScanned (for cron-budget bounding)', async () => {
        const rows: LibraryBytesRow[] = []
        for (let i = 0; i < 50; i++) rows.push(row(`f${i}`, NOW - HOUR))
        const bucket = makeBucket([])
        const result = await checkLibraryBytesHealth(rows, bucket, NOW, {
            maxScanned: 10,
        })
        expect(result.scanned).toBe(10)
        // sampleSize reflects what was offered, not what was probed — caller
        // can detect partial coverage via scanned < sampleSize.
        expect(result.sampleSize).toBe(50)
        expect(result.missingCount).toBe(10)
    })

    it('skips rows whose fileId is missing or blank without counting them', async () => {
        const rows: LibraryBytesRow[] = [
            row('a'),
            { fileId: '' },
            { fileId: undefined as unknown as string },
            row('b'),
        ]
        const bucket = makeBucket(['a', 'b'])
        const result = await checkLibraryBytesHealth(rows, bucket, NOW)
        // scanned counts only valid-fileId rows.
        expect(result.scanned).toBe(2)
        expect(result.missingCount).toBe(0)
    })
})

describe('checkLibraryBytesHealth — variant detection', () => {
    it('treats a .pdf listing match as present', async () => {
        const result = await checkLibraryBytesHealth(
            [row('a')],
            makeBucket(['a'], { variant: 'pdf' }),
            NOW,
        )
        expect(result.missingCount).toBe(0)
    })

    it('treats a .xml listing match as present', async () => {
        const result = await checkLibraryBytesHealth(
            [row('a')],
            makeBucket(['a'], { variant: 'xml' }),
            NOW,
        )
        expect(result.missingCount).toBe(0)
    })

    it('treats a .mp3 listing match as present', async () => {
        const result = await checkLibraryBytesHealth(
            [row('a')],
            makeBucket(['a'], { variant: 'mp3' }),
            NOW,
        )
        expect(result.missingCount).toBe(0)
    })

    it('treats a no-extension listing match as present', async () => {
        const result = await checkLibraryBytesHealth(
            [row('a')],
            makeBucket(['a'], { variant: 'noext' }),
            NOW,
        )
        expect(result.missingCount).toBe(0)
    })

    it('rejects a sibling fileId-prefix collision', async () => {
        // `library/foo` listing returns `library/foobar.pdf` — the longer
        // sibling. Without an exact-or-dotted anchor, that would false-match
        // foo. Bucket fake here simulates exactly that.
        const bucket: LibraryBytesBucket = {
            async getFiles({ prefix }) {
                if (prefix === 'library/foo') {
                    return [[{ name: 'library/foobar.pdf' }]]
                }
                return [[]]
            },
        }
        const result = await checkLibraryBytesHealth([row('foo')], bucket, NOW)
        expect(result.missingCount).toBe(1)
        expect(result.missing[0].fileId).toBe('foo')
    })
})

describe('checkLibraryBytesHealth — timestamp variants on missing rows', () => {
    it('parses Firestore Timestamp-shaped lastSyncedAt', async () => {
        const ts = {
            toMillis: () => NOW - 12 * HOUR,
            seconds: Math.floor((NOW - 12 * HOUR) / 1000),
        }
        const result = await checkLibraryBytesHealth(
            [row('a', ts)],
            makeBucket([]),
            NOW,
        )
        expect(result.missing[0].lastSyncedAt).toBe(NOW - 12 * HOUR)
        expect(result.oldestMissing).toBe(NOW - 12 * HOUR)
        expect(result.oldestMissingAgeHours).toBeCloseTo(12, 1)
    })

    it('parses JS Date lastSyncedAt', async () => {
        const result = await checkLibraryBytesHealth(
            [row('a', new Date(NOW - 5 * HOUR))],
            makeBucket([]),
            NOW,
        )
        expect(result.missing[0].lastSyncedAt).toBe(NOW - 5 * HOUR)
    })

    it('parses ISO-string lastSyncedAt', async () => {
        const result = await checkLibraryBytesHealth(
            [row('a', new Date(NOW - 3 * HOUR).toISOString())],
            makeBucket([]),
            NOW,
        )
        expect(result.missing[0].lastSyncedAt).toBe(NOW - 3 * HOUR)
    })

    it('falls back to updatedAt when lastSyncedAt is missing/unparseable', async () => {
        const rows: LibraryBytesRow[] = [
            { fileId: 'a', updatedAt: NOW - 7 * HOUR },
            { fileId: 'b', lastSyncedAt: '', updatedAt: NOW - 9 * HOUR },
        ]
        const result = await checkLibraryBytesHealth(rows, makeBucket([]), NOW)
        expect(result.missing[0].lastSyncedAt).toBe(NOW - 7 * HOUR)
        expect(result.missing[1].lastSyncedAt).toBe(NOW - 9 * HOUR)
        // oldest of the two = 9h ago
        expect(result.oldestMissing).toBe(NOW - 9 * HOUR)
    })

    it('records null lastSyncedAt when neither timestamp parses', async () => {
        const result = await checkLibraryBytesHealth(
            [{ fileId: 'a', lastSyncedAt: 'not-a-date', updatedAt: null }],
            makeBucket([]),
            NOW,
        )
        expect(result.missing[0].lastSyncedAt).toBe(null)
        expect(result.oldestMissing).toBe(null)
        expect(result.oldestMissingAgeHours).toBe(null)
    })

    it('reports the oldest across MANY missing rows (not just reported subset)', async () => {
        // Push 30 missing rows with varied timestamps. Force maxReported=5 so
        // the report set excludes most of them — but oldestMissing must still
        // reflect the global min.
        const rows: LibraryBytesRow[] = []
        for (let i = 0; i < 30; i++) {
            rows.push(row(`f${i}`, NOW - i * HOUR))
        }
        const result = await checkLibraryBytesHealth(rows, makeBucket([]), NOW, {
            maxReported: 5,
        })
        expect(result.missing).toHaveLength(5)
        // oldest is f29 @ NOW - 29h
        expect(result.oldestMissing).toBe(NOW - 29 * HOUR)
        expect(result.oldestMissingAgeHours).toBeCloseTo(29, 1)
    })
})

describe('checkLibraryBytesHealth — Storage outage tolerance', () => {
    it('skips rows whose probe throws (no false-alarm during outages)', async () => {
        const rows = ['a', 'b', 'c'].map((id) => row(id, NOW - HOUR))
        const bucket = makeBucket(['a', 'c'], { throwOn: ['b'] })
        const result = await checkLibraryBytesHealth(rows, bucket, NOW)
        // a + c probed clean; b threw and is skipped, NOT counted missing.
        expect(result.scanned).toBe(2)
        expect(result.missingCount).toBe(0)
        expect(result.verdict).toBe('healthy')
    })
})
