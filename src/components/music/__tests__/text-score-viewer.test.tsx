import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { TextScoreViewer } from '../TextScoreViewer'

// C5D-001 regression: malicious .txt content must NOT be parsed as HTML.
// Prior implementation passed the fetched body through React's unsafe-HTML
// prop, which executed any embedded <script>, <img onerror=>, etc.

const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0))

function mockFetchText(body: string) {
    const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(body),
    } as Response)
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
}

describe('TextScoreViewer (C5D-001 XSS regression)', () => {
    beforeEach(() => {
        // jsdom doesn't set innerWidth by default — force desktop so wrap mode
        // doesn't auto-engage and re-render the tree.
        Object.defineProperty(window, 'innerWidth', { writable: true, value: 1024 })
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it('renders <script> payloads as literal text, not as a DOM script node', async () => {
        const malicious = 'Opening verse line\n<script>window.__xss__ = true</script>\nClosing line'
        mockFetchText(malicious)

        const { container } = render(<TextScoreViewer url="https://example.com/chart.txt" />)
        await waitFor(() => expect(screen.queryByText('Opening verse line')).toBeTruthy())
        await flushPromises()

        // No real <script> nodes should have been injected.
        expect(container.querySelectorAll('script').length).toBe(0)
        // The payload appears as visible text (the angle brackets are escaped
        // by React when rendering children).
        expect(container.textContent).toContain('<script>')
        // And the side effect never fires.
        expect((window as any).__xss__).toBeUndefined()
    })

    it('renders <img onerror> payloads as literal text, not as a real image element', async () => {
        const malicious = 'Verse 1\n<img src=x onerror="window.__xss__=true" />\nChorus'
        mockFetchText(malicious)

        const { container } = render(<TextScoreViewer url="https://example.com/chart.txt" />)
        await waitFor(() => expect(screen.queryByText(/Verse 1/)).toBeTruthy())
        await flushPromises()

        // No <img> node from the chart body.
        expect(container.querySelectorAll('img').length).toBe(0)
        expect(container.textContent).toContain('<img')
        expect((window as any).__xss__).toBeUndefined()
    })

    it('preserves benign plain-text content with monospace whitespace', async () => {
        const benign = 'C       G       Am      F\nHello   world   how     are'
        mockFetchText(benign)

        const { container } = render(<TextScoreViewer url="https://example.com/chart.txt" />)
        await waitFor(() => expect(screen.queryByText(/Hello/)).toBeTruthy())

        expect(container.textContent).toContain('Hello')
        expect(container.textContent).toContain('world')
    })
})
