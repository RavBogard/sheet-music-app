import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock @sentry/nextjs at file scope. captureException is the only API the
// helper calls; the spy lets us assert tag/level/extra shape per call.
const captureExceptionSpy = vi.fn()
vi.mock('@sentry/nextjs', () => ({
    captureException: (...args: unknown[]) => captureExceptionSpy(...args),
}))

import { captureSyncFailure } from '../sentry-capture'

describe('captureSyncFailure', () => {
    beforeEach(() => {
        captureExceptionSpy.mockReset()
    })

    it('dead-letter context → level=error + tags include collection/docId/op/attempts as strings + extra has full context', () => {
        const err = new Error('drain budget exhausted')
        captureSyncFailure(err, {
            feature: 'dead-letter',
            collection: 'tracks',
            docId: 't-42',
            op: 'update',
            attempts: 5,
        })

        expect(captureExceptionSpy).toHaveBeenCalledTimes(1)
        const [capturedErr, opts] = captureExceptionSpy.mock.calls[0] as [
            unknown,
            {
                tags: Record<string, string>
                extra: Record<string, unknown>
                level: string
            },
        ]
        expect(capturedErr).toBe(err)
        expect(opts.level).toBe('error')
        expect(opts.tags).toEqual({
            feature: 'dead-letter',
            collection: 'tracks',
            docId: 't-42',
            op: 'update',
            attempts: '5', // numbers coerced to strings for Sentry tag indexer
        })
        // attempts in extra stays a number (extra is not indexed)
        expect(opts.extra).toEqual({
            feature: 'dead-letter',
            collection: 'tracks',
            docId: 't-42',
            op: 'update',
            attempts: 5,
        })
    })

    it('lazy-hydration context → level=warning', () => {
        captureSyncFailure(new Error('fan-out failed'), {
            feature: 'lazy-hydration',
            setlistId: 's-1',
            trackCount: 27,
        })

        expect(captureExceptionSpy).toHaveBeenCalledTimes(1)
        const opts = captureExceptionSpy.mock.calls[0]![1] as { level: string }
        expect(opts.level).toBe('warning')
    })

    it('snapshot-listener context → level=warning + site tag flows through', () => {
        captureSyncFailure(new Error('subscribe boom'), {
            feature: 'snapshot-listener',
            site: 'tracks-subscribe',
            setlistId: 's-1',
        })

        expect(captureExceptionSpy).toHaveBeenCalledTimes(1)
        const opts = captureExceptionSpy.mock.calls[0]![1] as {
            level: string
            tags: Record<string, string>
        }
        expect(opts.level).toBe('warning')
        expect(opts.tags.site).toBe('tracks-subscribe')
    })

    it('write-atomicity context → level=error', () => {
        captureSyncFailure(new Error('Dexie tx failed'), {
            feature: 'write-atomicity',
            collection: 'tracks',
            docId: 't-1',
            op: 'set',
        })

        expect(captureExceptionSpy).toHaveBeenCalledTimes(1)
        const opts = captureExceptionSpy.mock.calls[0]![1] as { level: string }
        expect(opts.level).toBe('error')
    })

    it('Sentry SDK throws → captureSyncFailure swallows (telemetry never crashes engine)', () => {
        captureExceptionSpy.mockImplementationOnce(() => {
            throw new Error('Sentry init failure or transport error')
        })
        // Must NOT throw — that's the whole contract.
        expect(() =>
            captureSyncFailure(new Error('original failure'), {
                feature: 'dead-letter',
                collection: 'tracks',
                docId: 't-1',
                op: 'update',
                attempts: 5,
            }),
        ).not.toThrow()
    })

    it('undefined / null context fields are dropped from tags (no "undefined" string leak)', () => {
        captureSyncFailure(new Error('test'), {
            feature: 'lazy-hydration',
            setlistId: undefined,
            trackCount: 0,
        })

        const opts = captureExceptionSpy.mock.calls[0]![1] as {
            tags: Record<string, string>
        }
        expect(opts.tags.feature).toBe('lazy-hydration')
        expect(opts.tags.trackCount).toBe('0')
        expect('setlistId' in opts.tags).toBe(false)
    })
})
