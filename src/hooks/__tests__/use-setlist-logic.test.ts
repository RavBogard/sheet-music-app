/**
 * Observability tests for use-setlist-logic (v45-01).
 *
 * Focus: every silent-return path in the save pipeline emits a tagged
 * logger.error call with structured context. These tests DO NOT cover
 * save-path correctness — only that the instrumentation fires.
 *
 * Scope limits (v45-01 SCOPE LIMITS):
 *  - No behavior assertions beyond the log emission itself
 *  - No IDB, sync engine, or UI surface assertions (v45-02..05)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { Timestamp } from 'firebase/firestore'

// vi.hoisted — everything referenced inside a vi.mock factory must live here
// (per vitest hoisting rules). Plain top-level const would be undefined at
// mock-evaluation time.
const mocks = vi.hoisted(() => {
    const mockToast = Object.assign(vi.fn(), { error: vi.fn() })
    return {
        mockToast,
        mockGetIdToken: vi.fn(() => Promise.resolve('tok')),
        mockUpdateSetlist: vi.fn(() => Promise.resolve()),
        mockCreateSetlist: vi.fn(() => Promise.resolve('new-id')),
        mockSubscribeToSetlist: vi.fn(() => () => {}),
        mockSendKeepaliveFlush: vi.fn(),
    }
})

vi.mock('sonner', () => ({ toast: mocks.mockToast }))

vi.mock('@/lib/firebase', () => ({
    auth: {
        get currentUser() { return { uid: 'user-1', getIdToken: mocks.mockGetIdToken } },
    },
    db: {},
}))

vi.mock('@/lib/setlist-firebase', () => {
    class StaleWriteError extends Error {
        remoteUpdatedAt: unknown
        constructor(remoteUpdatedAt: unknown) {
            super('STALE_WRITE')
            this.name = 'StaleWriteError'
            this.remoteUpdatedAt = remoteUpdatedAt
        }
    }
    return {
        StaleWriteError,
        createSetlistService: () => ({
            updateSetlist: mocks.mockUpdateSetlist,
            createSetlist: mocks.mockCreateSetlist,
            subscribeToSetlist: mocks.mockSubscribeToSetlist,
        }),
    }
})

vi.mock('@/lib/auth-context', () => ({
    useAuth: () => ({
        user: { uid: 'user-1', displayName: 'Rabbi' },
        isAdmin: false,
        isBandLeader: true,
        isMusician: false,
    }),
}))

vi.mock('@/hooks/use-offline', () => ({
    useOffline: () => ({
        checkOfflineStatus: vi.fn(),
        downloadSetlist: vi.fn(),
        downloading: {},
        offlineStatus: {},
    }),
}))

vi.mock('@/lib/chat-store', () => ({
    useChatStore: Object.assign(
        () => ({ setContextData: vi.fn(), registerOnApplyEdits: vi.fn() }),
        { getState: () => ({ toggle: vi.fn() }) },
    ),
}))

vi.mock('@/lib/library-store', () => ({
    useLibraryStore: () => ({ allFiles: [] }),
}))

vi.mock('@/lib/notification-store', () => ({
    notifySetlistUpdated: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/lib/api-client', () => ({
    apiFetch: vi.fn(() => Promise.resolve(new Response('{}', { status: 200 }))),
}))

vi.mock('@/lib/chord-cache', () => ({
    saveLastUsedKey: vi.fn(),
    loadLibraryMeta: vi.fn(() => Promise.resolve(null)),
}))

vi.mock('@/lib/setlist-flush', () => ({
    sendKeepaliveFlush: (...args: unknown[]) => mocks.mockSendKeepaliveFlush(...args),
}))

import { useSetlistLogic } from '@/hooks/use-setlist-logic'
import { logger } from '@/lib/logger'
import { StaleWriteError as MockedStaleWriteError } from '@/lib/setlist-firebase'

describe('use-setlist-logic — save-path observability (v45-01)', () => {
    let errorSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.clearAllMocks()
        mocks.mockGetIdToken.mockImplementation(() => Promise.resolve('tok'))
        mocks.mockUpdateSetlist.mockImplementation(() => Promise.resolve())
        errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {})
        vi.useFakeTimers({ shouldAdvanceTime: true })
    })

    afterEach(() => {
        vi.useRealTimers()
        errorSpy.mockRestore()
    })

    const findErrorCall = (event: string) =>
        errorSpy.mock.calls.find(
            args => args[0] === '[save]' && (args[1] as { event?: string })?.event === event,
        )

    it('AC-1: StaleWriteError catch emits stale_write_rejected with structured context', async () => {
        mocks.mockUpdateSetlist.mockRejectedValueOnce(
            new MockedStaleWriteError(Timestamp.fromMillis(1_700_000_000_000)),
        )

        const { result } = renderHook(() =>
            useSetlistLogic({
                initialSetlistId: 'seui',
                initialTracks: [{ id: 't1', title: 'Test', type: 'song' }],
                initialName: 'Test Setlist',
                initialOwnerId: 'user-1',
            }),
        )

        await act(async () => {
            result.current.updateTrack('t1', { key: 'D' })
        })
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1100)
        })

        const call = findErrorCall('stale_write_rejected')
        expect(call).toBeDefined()
        expect(call![1]).toMatchObject({
            event: 'stale_write_rejected',
            setlistId: 'seui',
            uid: 'user-1',
        })
    })

    it('AC-1: non-stale save failure emits save_failed with message + isPermissionError flag', async () => {
        mocks.mockUpdateSetlist.mockRejectedValueOnce(new Error('PERMISSION_DENIED'))

        const { result } = renderHook(() =>
            useSetlistLogic({
                initialSetlistId: 'seui',
                initialTracks: [{ id: 't1', title: 'Test', type: 'song' }],
                initialName: 'Test Setlist',
                initialOwnerId: 'user-1',
            }),
        )

        await act(async () => {
            result.current.updateTrack('t1', { key: 'E' })
        })
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1100)
        })

        const call = findErrorCall('save_failed')
        expect(call).toBeDefined()
        expect(call![1]).toMatchObject({
            event: 'save_failed',
            setlistId: 'seui',
            uid: 'user-1',
            isPermissionError: true,
        })
    })

    it('AC-4: flushViaKeepalive emits flush_skipped/no_token when idToken is empty', async () => {
        mocks.mockGetIdToken.mockImplementation(() => Promise.resolve(''))

        const { result } = renderHook(() =>
            useSetlistLogic({
                initialSetlistId: 'seui',
                initialTracks: [{ id: 't1', title: 'Test', type: 'song' }],
                initialName: 'Test Setlist',
                initialOwnerId: 'user-1',
            }),
        )

        await act(async () => {
            result.current.updateTrack('t1', { key: 'F' })
        })
        await act(async () => {
            await vi.advanceTimersByTimeAsync(0)
        })
        await act(async () => {
            window.dispatchEvent(new Event('pagehide'))
        })

        const call = findErrorCall('flush_skipped')
        expect(call).toBeDefined()
        expect(call![1]).toMatchObject({
            event: 'flush_skipped',
            reason: 'no_token',
            setlistId: 'seui',
        })
    })

    it('AC-4: flushViaKeepalive emits flush_skipped/missing_fields when no setlistId', async () => {
        const { result } = renderHook(() =>
            useSetlistLogic({
                initialTracks: [{ id: 't1', title: 'Test', type: 'song' }],
                initialName: 'Test Setlist',
            }),
        )

        await act(async () => {
            result.current.updateTrack('t1', { key: 'G' })
        })
        await act(async () => {
            await vi.advanceTimersByTimeAsync(0)
        })
        await act(async () => {
            window.dispatchEvent(new Event('pagehide'))
        })

        const call = findErrorCall('flush_skipped')
        expect(call).toBeDefined()
        expect(call![1]).toMatchObject({
            event: 'flush_skipped',
            reason: 'missing_fields',
        })
    })
})
