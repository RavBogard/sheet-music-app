import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import React from 'react'

/**
 * `/perform/[fileId]` — the single-chart perform route — used to render
 * `<PDFOverlay>` with NO `wakeLock` prop (page.tsx ~line 133). Consequences on
 * the bimah iPad: the toolbar's "Keep screen on" control never mounted on this
 * route at all, nothing held a sentinel, and there was no affordance anywhere
 * on the screen to notice or fix it. Open one chart straight from the library
 * and the iPad slept on the OS idle timer, mid-service.
 *
 * This pins the wiring: the route arms the shared lock on mount and threads
 * the same five controls the setlist route passes.
 */

const requestSpy = vi.fn(() => Promise.resolve({
    release: vi.fn(() => Promise.resolve()),
    addEventListener: vi.fn(),
    released: false,
    type: 'screen',
}))

vi.mock('@/lib/logger', () => ({
    logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() },
}))

vi.mock('next/navigation', () => ({
    useParams: () => ({ fileId: 'file-1' }),
    useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}))

vi.mock('@/lib/auth-context', () => ({
    useAuth: () => ({ user: { uid: 'u1' }, loading: false }),
}))

vi.mock('@/hooks/use-library', () => ({
    useLibrary: () => ({ isError: false, error: null, refetch: vi.fn(), isFetching: false }),
}))

vi.mock('@/lib/library-store', () => ({
    useLibraryStore: () => ({
        initialized: true,
        allFiles: [
            { id: 'file-1', name: 'Hashkivenu.pdf', mimeType: 'application/pdf', metadata: { key: 'Am' } },
        ],
    }),
}))

vi.mock('@/lib/error-reporting', () => ({ captureMessage: vi.fn() }))

// Capture what the route hands the overlay.
const overlayProps: Record<string, unknown>[] = []
vi.mock('@/components/performance/PDFOverlay', () => ({
    PDFOverlay: (props: Record<string, unknown>) => {
        overlayProps.push(props)
        return <div data-testid="pdf-overlay" />
    },
}))

import StandalonePerformPage from '@/app/perform/[fileId]/page'
import { KeepAwakeProvider } from '@/components/performance/keep-awake-context'

describe('/perform/[fileId] — keep-awake wiring', () => {
    beforeEach(() => {
        overlayProps.length = 0
        requestSpy.mockClear()
        try {
            window.localStorage.clear()
        } catch {
            /* noop */
        }
        Object.defineProperty(navigator, 'wakeLock', {
            writable: true,
            configurable: true,
            value: { request: requestSpy },
        })
    })

    it('passes a wakeLock prop to PDFOverlay (was omitted entirely — no keep-alive on this route)', async () => {
        render(
            <KeepAwakeProvider>
                <StandalonePerformPage />
            </KeepAwakeProvider>,
        )

        await waitFor(() => expect(overlayProps.length).toBeGreaterThan(0))
        const wakeLock = overlayProps[overlayProps.length - 1].wakeLock as Record<string, unknown>

        expect(wakeLock, 'the overlay must receive wake-lock controls').toBeTruthy()
        expect(typeof wakeLock.onRequest).toBe('function')
        expect(typeof wakeLock.onRelease).toBe('function')
        expect(wakeLock).toHaveProperty('isSupported')
        expect(wakeLock).toHaveProperty('isActive')
        expect(wakeLock).toHaveProperty('lastError')
    })

    it('auto-arms the shared lock on mount — no per-service toggle ritual', async () => {
        render(
            <KeepAwakeProvider>
                <StandalonePerformPage />
            </KeepAwakeProvider>,
        )

        await waitFor(() => expect(requestSpy).toHaveBeenCalledWith('screen'))
    })

    it('honours a stored explicit disarm instead of re-arming behind the musician', async () => {
        window.localStorage.setItem('crc.keepAwakeIntent', '0')

        render(
            <KeepAwakeProvider>
                <StandalonePerformPage />
            </KeepAwakeProvider>,
        )

        await waitFor(() => expect(overlayProps.length).toBeGreaterThan(0))
        expect(requestSpy).not.toHaveBeenCalled()
    })
})
