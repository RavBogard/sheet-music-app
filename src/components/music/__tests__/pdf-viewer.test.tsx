import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, waitFor, act } from '@testing-library/react'

// react-pdf does NOT render in jsdom (it needs a pdfjs worker), so we mock it
// to exercise PDFViewer's WRAPPER-level states only: the render-stage watchdog,
// the multi-page indicator, the width guard, and the rotate retry-reset.
// Actual pdfjs rendering is verified on a real iPad (UAT).
const h = vi.hoisted(() => ({ numPages: 1, hang: false }))

vi.mock('react-pdf', () => ({
    pdfjs: { GlobalWorkerOptions: { workerSrc: '' }, version: '4.0.0' },
    Document: ({ onLoadSuccess, children, loading }: {
        onLoadSuccess?: (d: { numPages: number }) => void
        children?: React.ReactNode
        loading?: React.ReactNode
    }) => {
        React.useEffect(() => {
            // `hang` = pdfjs never reports load success (the WS-05 render hang).
            if (!h.hang) onLoadSuccess?.({ numPages: h.numPages })
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [])
        return <div data-testid="pdf-document">{h.hang ? loading : children}</div>
    },
    Page: ({ pageNumber }: { pageNumber: number }) => <div data-testid={`rpdf-page-${pageNumber}`} />,
}))

// CSS side-effect imports in PDFViewer — neutralize.
vi.mock('react-pdf/dist/Page/AnnotationLayer.css', () => ({}))
vi.mock('react-pdf/dist/Page/TextLayer.css', () => ({}))

// PDFPageWrapper pulls in real react-pdf Page internals — stub it.
vi.mock('../PDFPageWrapper', () => ({
    PDFPageWrapper: ({ pageNumber }: { pageNumber: number }) => (
        <div data-testid={`page-${pageNumber}`}>page {pageNumber}</div>
    ),
}))

// ChartSuggestions renders in the error block; stub to avoid its data deps.
vi.mock('../ChartSuggestions', () => ({
    ChartSuggestions: () => <div data-testid="chart-suggestions" />,
}))

vi.mock('@/lib/pdf-worker-offline', () => ({
    desiredWorkerSrc: () => '/pdf.worker.min.mjs',
    ensureOfflineWorkerReady: () => Promise.resolve(),
}))

vi.mock('@/lib/offline-idb', () => ({
    getFile: () => Promise.resolve(null), // IDB miss → network path
}))

import { PDFViewer } from '../PDFViewer'
import { shouldStartRenderWatchdog, isRotateScaleResize, computeFitPageWidth } from '../pdf-viewer-state'

// Controllable ResizeObserver: capture the callback so tests can drive width
// (jsdom's RO never delivers contentRect on its own).
let resizeCb: ((entries: Array<{ contentRect: { width: number } }>) => void) | null = null
function fireResize(width: number) {
    act(() => {
        resizeCb?.([{ contentRect: { width } }])
    })
}

function mockFetchPdf() {
    const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/pdf' },
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(2048)),
    } as unknown as Response)
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
}

beforeEach(() => {
    h.numPages = 1
    h.hang = false
    resizeCb = null
    vi.stubGlobal('ResizeObserver', class {
        constructor(cb: (e: Array<{ contentRect: { width: number } }>) => void) { resizeCb = cb }
        observe() { /* tests drive width via fireResize */ }
        disconnect() {}
    })
    mockFetchPdf()
})

afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.useRealTimers()
})

describe('PDFViewer — multi-page indicator (WS-07) + width guard (WS-05)', () => {
    it('shows "Page X of N" for a multi-page PDF once the container has width', async () => {
        h.numPages = 3
        render(<PDFViewer url="/api/drive/file/multi" />)
        await waitFor(() => expect(screen.getByTestId('pdf-document')).toBeTruthy())
        fireResize(800)
        await waitFor(() => expect(screen.getByText(/Page 1 of 3/)).toBeTruthy())
        // pages render once width > 0
        expect(screen.getByTestId('page-1')).toBeTruthy()
        expect(screen.getByTestId('page-3')).toBeTruthy()
    })

    it('shows NO page indicator for a single-page PDF', async () => {
        h.numPages = 1
        render(<PDFViewer url="/api/drive/file/single" />)
        await waitFor(() => expect(screen.getByTestId('pdf-document')).toBeTruthy())
        fireResize(800)
        await waitFor(() => expect(screen.getByTestId('page-1')).toBeTruthy())
        expect(screen.queryByText(/Page .* of/)).toBeNull()
    })

    it('does NOT render pages at width 0 (no blank zero-width pages)', async () => {
        h.numPages = 2
        render(<PDFViewer url="/api/drive/file/zero" />)
        // Wait on the STATE the negative depends on, not on an element that lands one
        // flush earlier: `Measuring…` is reachable ONLY when numPages > 0 and width === 0,
        // so once it is on screen the pages WOULD render but for the width guard — which is
        // what makes page-1's absence mean the guard, and not a pre-load window (WS-05).
        await waitFor(() => expect(screen.getByText(/Measuring…/)).toBeTruthy())
        expect(screen.queryByTestId('page-1')).toBeNull()
    })
})

// The render-watchdog timer firing and the rotate-reset are driven by pure
// decision helpers (extracted because react-pdf + fake timers + React effects
// don't compose reliably in jsdom). The DECISIONS are unit-tested here; the
// actual timer/observer wiring + pixel behavior are confirmed on a real iPad
// (UAT), per the plan's stated react-pdf/jsdom caveat.
describe('shouldStartRenderWatchdog (WS-05 decision)', () => {
    const base = { hasSource: true, loading: false, hasError: false, numPages: 0, renderTimedOut: false }
    it('arms once bytes are in hand but pdfjs has not reported page count', () => {
        expect(shouldStartRenderWatchdog(base)).toBe(true)
    })
    it('does NOT arm while still loading the bytes', () => {
        expect(shouldStartRenderWatchdog({ ...base, loading: true })).toBe(false)
    })
    it('does NOT arm before bytes are available', () => {
        expect(shouldStartRenderWatchdog({ ...base, hasSource: false })).toBe(false)
    })
    it('does NOT arm once the document has rendered (numPages > 0)', () => {
        expect(shouldStartRenderWatchdog({ ...base, numPages: 2 })).toBe(false)
    })
    it('does NOT arm when a fetch error already surfaced', () => {
        expect(shouldStartRenderWatchdog({ ...base, hasError: true })).toBe(false)
    })
    it('does NOT re-arm once it has already timed out', () => {
        expect(shouldStartRenderWatchdog({ ...base, renderTimedOut: true })).toBe(false)
    })
})

describe('isRotateScaleResize (WS-16 decision)', () => {
    it('true for an orientation-scale change (820 portrait -> 1180 landscape)', () => {
        expect(isRotateScaleResize(820, 1180)).toBe(true)
    })
    it('false for scrollbar/layout jitter below the threshold', () => {
        expect(isRotateScaleResize(800, 815)).toBe(false)
    })
    it('false for the initial 0 -> N measure (no prior width)', () => {
        expect(isRotateScaleResize(0, 800)).toBe(false)
    })
})

describe('computeFitPageWidth (WS-14 / WS-26 fit-mode math)', () => {
    // ~US Letter portrait page: 11/8.5 ≈ 1.294
    const PORTRAIT = 11 / 8.5

    it("'width' mode returns containerWidth * zoom (unchanged contract)", () => {
        expect(computeFitPageWidth({ containerWidth: 1000, containerHeight: 800, pageAspect: PORTRAIT, mode: 'width', zoom: 1 })).toBe(1000)
        expect(computeFitPageWidth({ containerWidth: 1000, containerHeight: 800, pageAspect: PORTRAIT, mode: 'width', zoom: 1.5 })).toBe(1500)
    })

    it("'page' mode height-constrains a portrait page in a landscape viewport", () => {
        // landscape iPad ~1180x800; portrait page would overflow at full width
        const w = computeFitPageWidth({ containerWidth: 1180, containerHeight: 800, pageAspect: PORTRAIT, mode: 'page', zoom: 1 })
        // height-fit width = 800 / 1.294 ≈ 618, well under the 1180 container width
        expect(w).toBeCloseTo(800 / PORTRAIT, 1)
        expect(w).toBeLessThan(1180)
        // and the resulting page height fits the viewport
        expect(w * PORTRAIT).toBeCloseTo(800, 0)
    })

    it("'page' mode caps at container width when width is the tighter constraint", () => {
        // tall, narrow viewport: height isn't the limit, so it never exceeds width
        const w = computeFitPageWidth({ containerWidth: 400, containerHeight: 2000, pageAspect: PORTRAIT, mode: 'page', zoom: 1 })
        expect(w).toBe(400)
    })

    it("'page' mode applies zoom on top of the fit baseline", () => {
        const base = computeFitPageWidth({ containerWidth: 1180, containerHeight: 800, pageAspect: PORTRAIT, mode: 'page', zoom: 1 })
        const zoomed = computeFitPageWidth({ containerWidth: 1180, containerHeight: 800, pageAspect: PORTRAIT, mode: 'page', zoom: 2 })
        expect(zoomed).toBeCloseTo(base * 2, 5)
    })

    it('falls back to the width contract when page dims are not yet measured', () => {
        expect(computeFitPageWidth({ containerWidth: 1180, containerHeight: 0, pageAspect: PORTRAIT, mode: 'page', zoom: 1 })).toBe(1180)
        expect(computeFitPageWidth({ containerWidth: 1180, containerHeight: 800, pageAspect: 0, mode: 'page', zoom: 1 })).toBe(1180)
    })

    it('never returns NaN/0 from a non-positive zoom (clamped to 1)', () => {
        expect(computeFitPageWidth({ containerWidth: 1000, containerHeight: 800, pageAspect: PORTRAIT, mode: 'width', zoom: 0 })).toBe(1000)
        expect(computeFitPageWidth({ containerWidth: 1000, containerHeight: 800, pageAspect: PORTRAIT, mode: 'width', zoom: -5 })).toBe(1000)
    })
})
