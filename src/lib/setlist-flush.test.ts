import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sendKeepaliveFlush, type FlushSavePayload } from './setlist-flush'
import { logger } from './logger'

describe('sendKeepaliveFlush', () => {
    let fetchSpy: ReturnType<typeof vi.fn>

    beforeEach(() => {
        fetchSpy = vi.fn(() => Promise.resolve(new Response('{}', { status: 200 })))
        global.fetch = fetchSpy as unknown as typeof fetch
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    const makePayload = (overrides: Partial<FlushSavePayload> = {}): FlushSavePayload => ({
        setlistId: 'setlist-1',
        expectedUpdatedAtMs: 1_700_000_000_000,
        data: {
            name: 'Shabbat Morning',
            tracks: [],
            trackCount: 0,
        },
        ...overrides,
    })

    it('POSTs to /api/setlist/flush with keepalive + Bearer token', () => {
        sendKeepaliveFlush(makePayload(), 'token-abc')

        expect(fetchSpy).toHaveBeenCalledTimes(1)
        const [url, init] = fetchSpy.mock.calls[0]
        expect(url).toBe('/api/setlist/flush')
        expect(init.method).toBe('POST')
        expect(init.keepalive).toBe(true)
        expect(init.headers['Authorization']).toBe('Bearer token-abc')
        expect(init.headers['Content-Type']).toBe('application/json')
    })

    it('serializes payload as JSON body', () => {
        sendKeepaliveFlush(makePayload({ setlistId: 's-42' }), 'tok')

        const [, init] = fetchSpy.mock.calls[0]
        const body = JSON.parse(init.body as string)
        expect(body.setlistId).toBe('s-42')
        expect(body.expectedUpdatedAtMs).toBe(1_700_000_000_000)
        expect(body.data.name).toBe('Shabbat Morning')
    })

    it('passes expectedUpdatedAtMs=null through unchanged for legacy docs', () => {
        sendKeepaliveFlush(makePayload({ expectedUpdatedAtMs: null }), 'tok')

        const [, init] = fetchSpy.mock.calls[0]
        const body = JSON.parse(init.body as string)
        expect(body.expectedUpdatedAtMs).toBeNull()
    })

    it('is a no-op when bearer token is empty', () => {
        sendKeepaliveFlush(makePayload(), '')
        expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('swallows synchronous fetch throws (oversized keepalive body)', () => {
        fetchSpy.mockImplementation(() => { throw new Error('body too large') })
        expect(() => sendKeepaliveFlush(makePayload(), 'tok')).not.toThrow()
    })

    it('does not await the fetch promise (returns void synchronously)', () => {
        let resolved = false
        fetchSpy.mockImplementation(() => new Promise(resolve => {
            setTimeout(() => { resolved = true; resolve(new Response('{}')) }, 100)
        }))
        const returnValue = sendKeepaliveFlush(makePayload(), 'tok')
        expect(returnValue).toBeUndefined()
        expect(resolved).toBe(false)
    })

    describe('observability (v45-01 AC-5)', () => {
        let errorSpy: ReturnType<typeof vi.spyOn>

        beforeEach(() => {
            errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {})
        })

        afterEach(() => {
            errorSpy.mockRestore()
        })

        it('emits flush_http_error when server responds non-2xx (409 stale)', async () => {
            fetchSpy.mockImplementation(() => Promise.resolve(new Response('{}', { status: 409 })))
            sendKeepaliveFlush(makePayload({ setlistId: 'seui' }), 'tok')
            await vi.waitFor(() => expect(errorSpy).toHaveBeenCalled())
            expect(errorSpy).toHaveBeenCalledWith(
                '[save]',
                expect.objectContaining({
                    event: 'flush_http_error',
                    status: 409,
                    setlistId: 'seui',
                }),
            )
        })

        it('does not emit flush_http_error on 2xx responses', async () => {
            fetchSpy.mockImplementation(() => Promise.resolve(new Response('{}', { status: 200 })))
            sendKeepaliveFlush(makePayload(), 'tok')
            await new Promise(resolve => setTimeout(resolve, 0))
            expect(errorSpy).not.toHaveBeenCalled()
        })

        it('emits flush_network_error when fetch rejects', async () => {
            fetchSpy.mockImplementation(() => Promise.reject(new Error('network down')))
            sendKeepaliveFlush(makePayload({ setlistId: 'seui' }), 'tok')
            await vi.waitFor(() => expect(errorSpy).toHaveBeenCalled())
            expect(errorSpy).toHaveBeenCalledWith(
                '[save]',
                expect.objectContaining({
                    event: 'flush_network_error',
                    setlistId: 'seui',
                    error: 'network down',
                }),
            )
        })

        it('emits flush_sync_throw when fetch throws synchronously (oversized body)', () => {
            fetchSpy.mockImplementation(() => { throw new Error('body too large') })
            sendKeepaliveFlush(makePayload({ setlistId: 'seui' }), 'tok')
            expect(errorSpy).toHaveBeenCalledWith(
                '[save]',
                expect.objectContaining({
                    event: 'flush_sync_throw',
                    setlistId: 'seui',
                    error: 'body too large',
                }),
            )
        })
    })
})
