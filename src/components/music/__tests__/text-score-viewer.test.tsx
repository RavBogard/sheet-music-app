import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { TextScoreViewer } from '../TextScoreViewer'

// C5D-001 regression: malicious .txt content must NOT be parsed as HTML.
// Prior implementation passed the fetched body through React's unsafe-HTML
// prop, which executed any embedded <script>, <img onerror=>, etc.
//
// ipad-text-viewer-fetch-fix (F-1, 2026-05-24): the viewer now takes a
// fileId and resolves IDB-first → blob.text() (no `fetch(blob:)`); falls
// back to `/api/drive/file/<id>` on IDB-miss. The XSS regression tests
// are preserved by stubbing `@/lib/offline-idb.getFile` to null (forcing
// the network path) and mocking `fetch` as before.

const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0))

function mockFetchText(body: string, opts: { ok?: boolean } = {}) {
    const fetchMock = vi.fn().mockResolvedValue({
        ok: opts.ok ?? true,
        text: () => Promise.resolve(body),
    } as Response)
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
}

/**
 * Stub the dynamic `@/lib/offline-idb` import the viewer does inside its
 * load effect. `vi.doMock` is hoist-safe and applies to subsequent
 * `import()` resolutions. `getFile` returns null in the default IDB-miss
 * shape; callers override per-test for the IDB-hit / throw arms.
 */
function stubOfflineIdb(getFile: () => Promise<Blob | null>) {
    vi.doMock('@/lib/offline-idb', () => ({ getFile }))
}

describe('TextScoreViewer (C5D-001 XSS regression — network path)', () => {
    beforeEach(() => {
        // jsdom doesn't set innerWidth by default — force desktop so wrap mode
        // doesn't auto-engage and re-render the tree.
        Object.defineProperty(window, 'innerWidth', { writable: true, value: 1024 })
        // Default to IDB-miss so the test exercises the network fetch path
        // (where the C5D-001 XSS regression originally lived).
        stubOfflineIdb(() => Promise.resolve(null))
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
        vi.resetModules()
    })

    it('renders <script> payloads as literal text, not as a DOM script node', async () => {
        const malicious = 'Opening verse line\n<script>window.__xss__ = true</script>\nClosing line'
        mockFetchText(malicious)

        const { container } = render(<TextScoreViewer fileId="upload-c5d-001-a" />)
        await waitFor(() => expect(screen.queryByText('Opening verse line')).toBeTruthy())
        await flushPromises()

        // No real <script> nodes should have been injected.
        expect(container.querySelectorAll('script').length).toBe(0)
        // The payload appears as visible text (the angle brackets are escaped
        // by React when rendering children).
        expect(container.textContent).toContain('<script>')
        // And the side effect never fires.
        expect((window as unknown as { __xss__?: boolean }).__xss__).toBeUndefined()
    })

    it('renders <img onerror> payloads as literal text, not as a real image element', async () => {
        const malicious = 'Verse 1\n<img src=x onerror="window.__xss__=true" />\nChorus'
        mockFetchText(malicious)

        const { container } = render(<TextScoreViewer fileId="upload-c5d-001-b" />)
        await waitFor(() => expect(screen.queryByText(/Verse 1/)).toBeTruthy())
        await flushPromises()

        // No <img> node from the chart body.
        expect(container.querySelectorAll('img').length).toBe(0)
        expect(container.textContent).toContain('<img')
        expect((window as unknown as { __xss__?: boolean }).__xss__).toBeUndefined()
    })

    it('preserves benign plain-text content with monospace whitespace', async () => {
        const benign = 'C       G       Am      F\nHello   world   how     are'
        mockFetchText(benign)

        const { container } = render(<TextScoreViewer fileId="upload-c5d-001-c" />)
        await waitFor(() => expect(screen.queryByText(/Hello/)).toBeTruthy())

        expect(container.textContent).toContain('Hello')
        expect(container.textContent).toContain('world')
    })
})

describe('TextScoreViewer (ipad-text-viewer-fetch-fix — IDB-first source resolution)', () => {
    beforeEach(() => {
        Object.defineProperty(window, 'innerWidth', { writable: true, value: 1024 })
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
        vi.resetModules()
    })

    it('IDB-hit: reads bytes via blob.text() and does NOT fire fetch()', async () => {
        // The cached blob's mime is application/pdf in the F-1 case (PDF
        // bytes bonded to a text-typed track via asymmetric mime-stamping).
        // The viewer just calls `blob.text()` — the mime is irrelevant; we
        // get whatever the bytes decode to as UTF-8.
        //
        // Use a text-only line (no chord line above it) so the parser hits
        // the `text-only` branch and renders the line as a single text node
        // — `queryByText` matches the whole string, not chord-chunked parts.
        const cachedText = 'IDB hit cached chart marker line'
        const blob = new Blob([cachedText], { type: 'text/plain' })
        stubOfflineIdb(() => Promise.resolve(blob))
        const fetchMock = vi.fn()
        vi.stubGlobal('fetch', fetchMock)

        const { container } = render(<TextScoreViewer fileId="upload-idb-hit" />)
        await waitFor(() => expect(screen.queryByText(/IDB hit cached chart marker line/)).toBeTruthy())

        // The smoking gun for F-1: we must NOT have called fetch() on the
        // IDB-hit path. That's the WebKit blob:-fetch race the fix dodges.
        expect(fetchMock).not.toHaveBeenCalled()
        expect(container.textContent).toContain('IDB hit cached chart marker line')
    })

    it('IDB-miss: falls back to /api/drive/file/<fileId> network path', async () => {
        stubOfflineIdb(() => Promise.resolve(null))
        const fetchMock = mockFetchText('Network-path verse\nNetwork-path chorus')

        const { container } = render(<TextScoreViewer fileId="upload-network" />)
        await waitFor(() => expect(screen.queryByText(/Network-path verse/)).toBeTruthy())

        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(fetchMock.mock.calls[0][0]).toBe('/api/drive/file/upload-network')
        expect(container.textContent).toContain('Network-path chorus')
    })

    it('IDB-throw: catches the IDB error and falls back to network', async () => {
        // Mirror AudioViewer's defensive shape — Private-mode Safari etc.
        // `getFile` itself swallows internal errors and returns null, but
        // if the dynamic import itself throws (or any future getFile rev
        // throws) the viewer must still recover.
        stubOfflineIdb(() => { throw new Error('IDB unavailable in private mode') })
        const fetchMock = mockFetchText('Network after IDB throw')

        const { container } = render(<TextScoreViewer fileId="upload-idb-throw" />)
        await waitFor(() => expect(screen.queryByText(/Network after IDB throw/)).toBeTruthy())

        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(fetchMock.mock.calls[0][0]).toBe('/api/drive/file/upload-idb-throw')
        expect(container.textContent).toContain('Network after IDB throw')
    })

    it('network !ok: surfaces a clean "Failed to load text file" error', async () => {
        stubOfflineIdb(() => Promise.resolve(null))
        mockFetchText('upstream error body', { ok: false })

        const { container } = render(<TextScoreViewer fileId="upload-404" />)
        await waitFor(() => expect(container.textContent).toContain('Failed to load text file'))

        // The error string surfaces verbatim — no script nodes from the
        // upstream body even if it happened to contain markup.
        expect(container.querySelectorAll('script').length).toBe(0)
    })

    it('wrap mode: a lyric word with chords above it stays within ONE non-breaking group (BUG-7)', async () => {
        // innerWidth < 768 auto-enables wrap mode — the context where the prior
        // splitter let flex-wrap break a single word across lines
        // ("Hallelujah" → "Halleluja"/"h  amen"). Two chords sit mid-word.
        Object.defineProperty(window, 'innerWidth', { writable: true, value: 375 })
        stubOfflineIdb(() => Promise.resolve(null))
        mockFetchText('G        D\nHallelujah  amen')

        const { container } = render(<TextScoreViewer fileId="upload-bug7" />)
        await waitFor(() => expect(container.querySelector('.flex-wrap')).toBeTruthy())
        await flushPromises()

        // Word-grouping is active in wrap mode: scope to the chart body so the
        // fixed control-bar buttons (also inline-flex) don't pollute the query.
        const chart = container.querySelector('.font-mono')
        expect(chart).toBeTruthy()
        const groups = Array.from(chart!.querySelectorAll('.inline-flex'))
        expect(groups.length).toBeGreaterThan(0)

        // Reconstruct each group's lyric row (2nd child of each .flex-col column).
        const groupLyric = (g: Element) =>
            Array.from(g.querySelectorAll(':scope > .flex-col'))
                .map(col => col.children[1]?.textContent ?? '')
                .join('')

        // The whole word lives inside a SINGLE non-breaking group — never split
        // across two wrappable groups (the regression). Concatenating only the
        // lyric rows of one group yields the intact "Hallelujah".
        const someGroupHasWholeWord = groups.some(g => groupLyric(g).includes('Hallelujah'))
        expect(someGroupHasWholeWord).toBe(true)
    })

    it('empty fileId: surfaces a clean error without firing fetch or IDB', async () => {
        // Defensive — PDFOverlay guards `track.fileId &&` so we should not
        // normally mount with "" but if we do, don't go fetching
        // `/api/drive/file/` (which would 404 confusingly).
        const getFile = vi.fn(() => Promise.resolve(null))
        stubOfflineIdb(getFile)
        const fetchMock = vi.fn()
        vi.stubGlobal('fetch', fetchMock)

        const { container } = render(<TextScoreViewer fileId="" />)
        await waitFor(() => expect(container.textContent).toContain('Failed to load chart'))

        expect(getFile).not.toHaveBeenCalled()
        expect(fetchMock).not.toHaveBeenCalled()
    })
})

describe('TextScoreViewer (v11.6-02-02 — Fit-mode reading airtight WS-03/04/20)', () => {
    beforeEach(() => {
        // Desktop width keeps Fit mode engaged (wrap auto-enables < 768).
        Object.defineProperty(window, 'innerWidth', { writable: true, value: 1024 })
        stubOfflineIdb(() => Promise.resolve(null))
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
        vi.resetModules()
    })

    it('WS-03: the Fit-mode chart container is horizontally scrollable (overflow-x-auto), not clipped', async () => {
        mockFetchText('C\nHi')
        const { container } = render(<TextScoreViewer fileId="upload-ws03" />)
        await waitFor(() => expect(container.querySelector('.font-mono')).toBeTruthy())

        const chart = container.querySelector('.font-mono')!
        expect(chart.className).toContain('overflow-x-auto')
        expect(chart.className).not.toContain('overflow-x-hidden')
    })

    it('WS-04: in Fit mode the chord cell is width-neutral (w-0) so a wide transposed chord cannot drift the line', async () => {
        // "C" over "Hi" — a chord-lyric pair. The chord row must carry w-0 so
        // the lyric slice governs the column width.
        mockFetchText('C\nHi')
        const { container } = render(<TextScoreViewer fileId="upload-ws04" />)
        await waitFor(() => expect(screen.queryByText('Hi')).toBeTruthy())

        const chart = container.querySelector('.font-mono')!
        const widthNeutral = chart.querySelector('.w-0')
        expect(widthNeutral).toBeTruthy()
        expect(widthNeutral!.textContent).toBe('C')
    })

    it('WS-20: control buttons meet the 44px touch floor (h-11) and zoom buttons are labelled', async () => {
        mockFetchText('C\nHi')
        render(<TextScoreViewer fileId="upload-ws20" />)
        await waitFor(() => expect(screen.queryByText('Hi')).toBeTruthy())

        const fitToggle = screen.getByRole('button', { name: /Fit/ })
        const zoomOut = screen.getByRole('button', { name: 'Zoom out' })
        const zoomIn = screen.getByRole('button', { name: 'Zoom in' })

        expect(fitToggle.className).toContain('h-11')
        expect(zoomOut.className).toContain('h-11')
        expect(zoomOut.className).toContain('w-11')
        expect(zoomIn.className).toContain('h-11')
        expect(zoomIn.className).toContain('w-11')
    })
})
