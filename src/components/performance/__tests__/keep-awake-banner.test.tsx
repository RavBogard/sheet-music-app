import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

vi.mock('@/lib/logger', () => ({
    logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() },
}))

import { KeepAwakeBanner, isLegacyStandaloneIpad } from '@/components/performance/KeepAwakeBanner'
import { KeepAwakeProvider } from '@/components/performance/keep-awake-context'
import { KEEP_AWAKE_INTENT_KEY } from '@/hooks/use-wake-lock'

/**
 * The banner exists to close the gap between "the musician asked for the
 * screen to stay on" and "a sentinel is actually held". It must be silent in
 * every other state — this is rendered over a chart, mid-service, and a
 * banner that cries wolf gets ignored exactly when it matters.
 */
describe('KeepAwakeBanner', () => {
    let requestSpy: ReturnType<typeof vi.fn>

    function mockSentinel() {
        return {
            release: vi.fn(() => Promise.resolve()),
            addEventListener: vi.fn(),
            released: false,
            type: 'screen',
        }
    }

    function setUserAgent(ua: string) {
        Object.defineProperty(navigator, 'userAgent', {
            writable: true,
            configurable: true,
            value: ua,
        })
    }

    function setStandalone(matches: boolean) {
        Object.defineProperty(window, 'matchMedia', {
            writable: true,
            configurable: true,
            value: (query: string) => ({
                matches: query.includes('display-mode: standalone') ? matches : false,
                media: query,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                addListener: vi.fn(),
                removeListener: vi.fn(),
                onchange: null,
                dispatchEvent: vi.fn(),
            }),
        })
    }

    beforeEach(() => {
        try {
            window.localStorage.clear()
        } catch {
            /* noop */
        }
        requestSpy = vi.fn(() => Promise.resolve(mockSentinel()))
        Object.defineProperty(navigator, 'wakeLock', {
            writable: true,
            configurable: true,
            value: { request: requestSpy },
        })
        setStandalone(false)
        Object.defineProperty(navigator, 'maxTouchPoints', {
            writable: true,
            configurable: true,
            value: 0,
        })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('renders nothing outside a KeepAwakeProvider', () => {
        const { container } = render(<KeepAwakeBanner />)
        expect(container.innerHTML).toBe('')
    })

    it('renders nothing while the intent is disarmed', () => {
        render(
            <KeepAwakeProvider>
                <KeepAwakeBanner />
            </KeepAwakeProvider>,
        )
        expect(screen.queryByTestId('keep-awake-banner')).toBeNull()
    })

    it('detects a Home-Screen iPadOS 17 install as affected by WebKit 254545', () => {
        setStandalone(true)
        setUserAgent(
            'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
        )
        expect(isLegacyStandaloneIpad()).toBe(true)
    })

    it('does NOT flag iPadOS 18.4+ (the build where WebKit 254545 is fixed)', () => {
        setStandalone(true)
        setUserAgent(
            'Mozilla/5.0 (iPad; CPU OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
        )
        expect(isLegacyStandaloneIpad()).toBe(false)
    })

    it('does NOT flag the same old iPad in a normal Safari tab (the bug is standalone-only)', () => {
        setStandalone(false)
        setUserAgent(
            'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
        )
        expect(isLegacyStandaloneIpad()).toBe(false)
    })

    it('stays silent when the OS version cannot be proven (desktop-UA iPadOS)', () => {
        setStandalone(true)
        Object.defineProperty(navigator, 'maxTouchPoints', {
            writable: true,
            configurable: true,
            value: 5,
        })
        setUserAgent(
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Safari/605.1.15',
        )
        // We know it's an iPad, but not which iPadOS — a false warning
        // mid-service is worse than a missing one.
        expect(isLegacyStandaloneIpad()).toBe(false)
    })

    it('shows the OS warning (not the tap-to-retry copy) on an affected standalone iPad', async () => {
        setStandalone(true)
        setUserAgent(
            'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
        )
        window.localStorage.setItem(KEEP_AWAKE_INTENT_KEY, '1')

        const { KeepAwakeAutoArm } = await import('@/components/performance/keep-awake-context')
        render(
            <KeepAwakeProvider>
                <KeepAwakeAutoArm />
                <KeepAwakeBanner />
            </KeepAwakeProvider>,
        )

        const warning = await screen.findByTestId('keep-awake-os-warning')
        expect(warning.textContent).toContain('Auto-Lock')
        // Even though the lock WAS acquired — on this build that means nothing.
        expect(screen.queryByTestId('keep-awake-banner')).toBeNull()

        fireEvent.click(warning.querySelector('button')!)
        expect(screen.queryByTestId('keep-awake-os-warning')).toBeNull()
    })

    it('shows "Screen may sleep" when armed on a healthy device whose lock was refused', async () => {
        requestSpy.mockRejectedValue(new DOMException('Not allowed', 'NotAllowedError'))
        window.localStorage.setItem(KEEP_AWAKE_INTENT_KEY, '1')

        const { KeepAwakeAutoArm } = await import('@/components/performance/keep-awake-context')
        render(
            <KeepAwakeProvider>
                <KeepAwakeAutoArm />
                <KeepAwakeBanner />
            </KeepAwakeProvider>,
        )

        const banner = await screen.findByTestId('keep-awake-banner')
        expect(banner.textContent).toContain('Screen may sleep')

        // Tapping re-arms inside a real gesture — the most likely thing to work.
        const callsBefore = requestSpy.mock.calls.length
        fireEvent.click(screen.getByRole('button', { name: /tap to keep awake/i }))
        expect(requestSpy.mock.calls.length).toBeGreaterThan(callsBefore)
    })

    it('is silent once the lock is actually held', async () => {
        window.localStorage.setItem(KEEP_AWAKE_INTENT_KEY, '1')

        const { KeepAwakeAutoArm } = await import('@/components/performance/keep-awake-context')
        render(
            <KeepAwakeProvider>
                <KeepAwakeAutoArm />
                <KeepAwakeBanner />
            </KeepAwakeProvider>,
        )

        // Let the mount-time arm settle, then assert the banner never appears.
        await waitFor(() => expect(requestSpy).toHaveBeenCalledTimes(1))
        expect(screen.queryByTestId('keep-awake-banner')).toBeNull()
        expect(screen.queryByTestId('keep-awake-os-warning')).toBeNull()
    })
})
