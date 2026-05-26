import { describe, expect, it, vi } from 'vitest'

import { subscribeSongsLibrary, type DocChange, type SubscribeAdapter } from '@/lib/songs/subscribe'

/**
 * v60-11-01 Task 1 — subscribe.ts onError self-heal coverage.
 *
 * Pattern-matches the 5 sibling listeners (alert-store, firestore-monitor-client,
 * use-monitor-connection, use-safe-firestore-sync, notification-store) that all
 * call `recoverFromFirestoreShutdown(err)` in their snapshot error handlers.
 * v60-09 omitted this, leaving subscribeSongsLibrary silent-dead after a
 * service-worker deploy that triggers "Firestore shutting down".
 *
 * Unit-level test (NOT emulator) because the contract under test is purely the
 * onError → recoverFromFirestoreShutdown invocation. Happy-path snapshot
 * delivery is already covered by subscribe.emulator.test.ts.
 */

vi.mock('@/lib/firebase', () => ({
    db: {},
    getDb: vi.fn(async () => ({})),
    subscribeWithDb: vi.fn((setup: (db: unknown) => (() => void) | void) => {
        const u = setup({})
        return typeof u === 'function' ? u : () => {}
    }),
    recoverFromFirestoreShutdown: vi.fn(),
}))

vi.mock('@/lib/local/schema', () => ({
    getDb: () => ({ songs: { put: vi.fn(), delete: vi.fn() } }),
}))

describe('v60-11-01 subscribeSongsLibrary onError self-heal', () => {
    it('invokes recoverFromFirestoreShutdown when adapter signals an error', async () => {
        const { recoverFromFirestoreShutdown } = await import('@/lib/firebase')
        const recoverSpy = recoverFromFirestoreShutdown as ReturnType<typeof vi.fn>
        recoverSpy.mockClear()

        let capturedOnError: ((err: unknown) => void) | null = null

        const adapter: SubscribeAdapter = {
            subscribe(_handler: (changes: DocChange[]) => void, onError) {
                capturedOnError = onError
                return () => {}
            },
        }

        const unsubscribe = subscribeSongsLibrary({ firestore: adapter })

        expect(capturedOnError).not.toBeNull()

        const syntheticError = Object.assign(new Error('Firestore shutting down'), {
            code: 'failed-precondition',
        })
        capturedOnError!(syntheticError)

        expect(recoverSpy).toHaveBeenCalledTimes(1)
        expect(recoverSpy).toHaveBeenCalledWith(syntheticError)

        expect(typeof unsubscribe).toBe('function')
        unsubscribe()
    })

    it('passes the error object through unchanged (matches sibling-listener call shape)', async () => {
        const { recoverFromFirestoreShutdown } = await import('@/lib/firebase')
        const recoverSpy = recoverFromFirestoreShutdown as ReturnType<typeof vi.fn>
        recoverSpy.mockClear()

        let capturedOnError: ((err: unknown) => void) | null = null
        const adapter: SubscribeAdapter = {
            subscribe(_handler, onError) {
                capturedOnError = onError
                return () => {}
            },
        }

        subscribeSongsLibrary({ firestore: adapter })

        const cases = [
            new Error('boom'),
            { code: 'unavailable', message: 'transient' },
            'string-error',
            null,
        ]

        for (const c of cases) {
            recoverSpy.mockClear()
            capturedOnError!(c)
            expect(recoverSpy).toHaveBeenCalledTimes(1)
            expect(recoverSpy).toHaveBeenCalledWith(c)
        }
    })
})
