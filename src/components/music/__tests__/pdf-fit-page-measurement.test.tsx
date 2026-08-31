// @vitest-environment jsdom
//
// WAVE1 Bug 2 (2026-08-31) — fit-page must use the height that is actually
// available, not the height left over after the container's own padding.
//
// `PDFViewer` sizes every page from a `ResizeObserver` on its scroll container.
// `ResizeObserver.contentRect` reports the CONTENT box, which EXCLUDES padding
// — proven against real Chromium and real iPad WebKit in
// `e2e/resize-observer-padding.spec.ts` (755px box + 128px padding-bottom ->
// contentRect.height 627). The container carried `pb-32`, so fit-page's height
// budget was short by 128px and every chart rendered ~21% smaller than the
// screen allowed, with 128px of dead grey underneath.
//
// jsdom never delivers a real ResizeObserver entry, so this harness SYNTHESISES
// one the way a browser would: it reads the padding off the component's own
// rendered class list and subtracts it, exactly as `contentRect` does. That
// makes the test sensitive to the real defect — re-add `pb-32` to the observed
// element and the fit-page assertions below fail with the 481-vs-583 numbers.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, waitFor, act } from '@testing-library/react'

const h = vi.hoisted(() => ({ numPages: 1 }))

vi.mock('react-pdf', () => ({
    pdfjs: { GlobalWorkerOptions: { workerSrc: '' }, version: '4.0.0' },
    Document: ({ onLoadSuccess, children }: {
        onLoadSuccess?: (d: { numPages: number }) => void
        children?: React.ReactNode
    }) => {
        React.useEffect(() => { onLoadSuccess?.({ numPages: h.numPages }) }, [])
        return <div data-testid="pdf-document">{children}</div>
    },
    Page: () => null,
}))
vi.mock('react-pdf/dist/Page/AnnotationLayer.css', () => ({}))
vi.mock('react-pdf/dist/Page/TextLayer.css', () => ({}))

/** US Letter portrait, the 67.6% majority of the library. */
const LETTER_ASPECT = 11 / 8.5

// The stub reports the page aspect (as the real wrapper does from pdfjs) and
// records the width it was asked to render at — that width IS the thing Bug 2
// was getting wrong.
vi.mock('../PDFPageWrapper', () => ({
    PDFPageWrapper: ({ pageNumber, width, onPageAspect }: {
        pageNumber: number
        width: number
        onPageAspect?: (a: number) => void
    }) => {
        React.useEffect(() => { onPageAspect?.(11 / 8.5) }, [onPageAspect])
        return <div data-testid={`page-${pageNumber}`} data-render-width={String(width)} />
    },
}))
vi.mock('../ChartSuggestions', () => ({ ChartSuggestions: () => <div /> }))
vi.mock('@/lib/pdf-worker-offline', () => ({
    desiredWorkerSrc: () => '/pdf.worker.min.mjs',
    ensureOfflineWorkerReady: () => Promise.resolve(),
}))
vi.mock('@/lib/offline-idb', () => ({ getFile: () => Promise.resolve(null) }))

const storeState = { zoom: 1, transposition: 0, fitMode: 'width' as 'width' | 'page' }
vi.mock('@/lib/store', () => ({
    useMusicStore: (selector?: (s: typeof storeState) => unknown) =>
        selector ? selector(storeState) : storeState,
}))

import { PDFViewer } from '../PDFViewer'

// ── Tailwind padding -> px, so the synthetic contentRect matches the browser ──

/** Tailwind spacing scale: `pb-32` = 32 * 4px = 128px. */
function paddingPx(className: string, edge: 'top' | 'bottom'): number {
    const axis = edge === 'top' ? 't' : 'b'
    const patterns = [
        new RegExp(`(?:^|\\s)p${axis}-(\\d+)(?:\\s|$)`),
        /(?:^|\s)py-(\d+)(?:\s|$)/,
        /(?:^|\s)p-(\d+)(?:\s|$)/,
    ]
    for (const re of patterns) {
        const m = className.match(re)
        if (m) return Number(m[1]) * 4
    }
    return 0
}

let resizeCb: ((entries: Array<{ contentRect: { width: number; height: number } }>) => void) | null = null

/**
 * Deliver the ResizeObserver entry a real browser would deliver for a box of
 * `clientW x clientH` whose own padding comes from its rendered classes.
 */
function fireBrowserAccurateResize(clientW: number, clientH: number) {
    const el = document.querySelector('[data-pdf-scroll]') as HTMLElement | null
    const cls = el?.className ?? ''
    const contentH = clientH - paddingPx(cls, 'top') - paddingPx(cls, 'bottom')
    act(() => { resizeCb?.([{ contentRect: { width: clientW, height: contentH } }]) })
    return contentH
}

beforeEach(() => {
    h.numPages = 1
    storeState.zoom = 1
    storeState.fitMode = 'width'
    resizeCb = null
    vi.stubGlobal('ResizeObserver', class {
        constructor(cb: (e: Array<{ contentRect: { width: number; height: number } }>) => void) { resizeCb = cb }
        observe() {}
        disconnect() {}
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/pdf' },
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(2048)),
    } as unknown as Response))
})

afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

/** iPad landscape 1180x820 minus the 112px two-row perform toolbar. */
const LANDSCAPE_W = 1161
const VISIBLE_H = 755

async function renderAndMeasure() {
    render(<PDFViewer url="/api/drive/file/fit" />)
    await waitFor(() => expect(screen.getByTestId('pdf-document')).toBeTruthy())
    fireBrowserAccurateResize(LANDSCAPE_W, VISIBLE_H)
    await waitFor(() => expect(screen.getByTestId('page-1')).toBeTruthy())
    // Second pass: pageAspect is reported by the first render, so re-deliver the
    // measurement to let the fit math settle (mirrors the real resize stream).
    fireBrowserAccurateResize(LANDSCAPE_W, VISIBLE_H)
    return () => Number(screen.getByTestId('page-1').getAttribute('data-render-width'))
}

describe('PDFViewer fit-page measurement (WAVE1 Bug 2)', () => {
    it('the observed element carries NO vertical padding (contentRect excludes it)', async () => {
        await renderAndMeasure()
        const el = document.querySelector('[data-pdf-scroll]') as HTMLElement
        expect(el).toBeTruthy()
        expect(
            paddingPx(el.className, 'bottom'),
            `the ResizeObserver target has bottom padding, which contentRect subtracts ` +
            `from the fit-page height budget — that is Bug 2. classes: "${el.className}"`,
        ).toBe(0)
        expect(paddingPx(el.className, 'top')).toBe(0)
    })

    it('fit-page uses the FULL visible height, not height-minus-padding', async () => {
        storeState.fitMode = 'page'
        const width = await renderAndMeasure()
        // Available: (755 - 4) / 1.2941 = 580.3px.
        // With the old pb-32 this came out at (755 - 128 - 4) / 1.2941 = 481.4px.
        const expected = (VISIBLE_H - 4) / LETTER_ASPECT
        expect(width()).toBeCloseTo(expected, 0)
        expect(width()).toBeGreaterThan(570)
    })

    it('fit-page still fits the page inside the viewport height', async () => {
        storeState.fitMode = 'page'
        const width = await renderAndMeasure()
        expect(width() * LETTER_ASPECT).toBeLessThanOrEqual(VISIBLE_H)
    })

    it("keeps computeFitPageWidth's guards: never 0 or NaN, capped at container width", async () => {
        storeState.fitMode = 'page'
        // Tall narrow viewport: width is the tighter constraint.
        render(<PDFViewer url="/api/drive/file/narrow" />)
        await waitFor(() => expect(screen.getByTestId('pdf-document')).toBeTruthy())
        fireBrowserAccurateResize(400, 2000)
        await waitFor(() => expect(screen.getByTestId('page-1')).toBeTruthy())
        fireBrowserAccurateResize(400, 2000)
        const w = Number(screen.getByTestId('page-1').getAttribute('data-render-width'))
        expect(Number.isFinite(w)).toBe(true)
        expect(w).toBeGreaterThan(0)
        expect(w).toBeLessThanOrEqual(400)
    })

    it('the bottom clearance is inside the scrolled content, not on the observed box', async () => {
        h.numPages = 3
        await renderAndMeasure()
        const spacer = document.querySelector('[data-pdf-bottom-spacer]')
        const scroller = document.querySelector('[data-pdf-scroll]') as HTMLElement
        const content = document.querySelector('[data-pdf-scroll-content]') as HTMLElement
        expect(spacer, 'multi-page charts need clearance under the fixed page pill').toBeTruthy()
        expect(content.contains(spacer!)).toBe(true)
        expect(paddingPx(scroller.className, 'bottom')).toBe(0)
    })

    it('a single-page chart gets NO spacer (fit-page must reach zero vertical scroll)', async () => {
        h.numPages = 1
        await renderAndMeasure()
        expect(document.querySelector('[data-pdf-bottom-spacer]')).toBeNull()
    })
})
