// @vitest-environment jsdom
//
// WAVE1 Bug 4 (2026-08-31) — the toolbar's zoom buttons must actually move a
// text chart.
//
// VERIFIED BEFORE FIXING (the brief asked me to check the claim, not assume it):
//   PDFViewer.tsx        reads `useMusicStore(s => s.zoom)` -> computeFitPageWidth  WIRED
//   ImageScoreViewer.tsx reads `useMusicStore(s => s.zoom)` -> CSS `zoom`           WIRED
//   SmartScoreViewer.tsx reads `zoom` from useMusicStore()  -> fitBase * zoom       WIRED
//   TextScoreViewer.tsx  destructured ONLY `{ transposition }`; zoom lived in
//                        component-local `useState(1.0)`                            DEAD
//
// So the dead-control claim is real but narrower than reported: it was text
// charts only — 66 of 762 rows (8.7%). `PerformanceToolbar` renders the zoom
// buttons for every viewer kind (only the fit toggle is gated on `isPdfChart`)
// and binds its "%" readout to store `zoom`, so on a text chart the musician
// tapped +, watched the percentage climb, and nothing moved. That is the worst
// possible failure shape mid-service: the control looks like it worked.
//
// It also bit hardest where it mattered most — the fit-mode font is clamped to
// 11-15px (~8.7-11.9pt at music-stand distance), so a text chart is precisely
// the chart a player most needs to enlarge.
//
// These tests drive the STORE (what the toolbar does) and assert the RENDERED
// font size changes. Against the pre-fix component they fail: the store zoom
// moves and the rendered `clamp(...)` does not.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { TextScoreViewer } from '../TextScoreViewer'
import { useMusicStore, type QueueItem } from '@/lib/store'

// Plain text-only lines (no chord line sitting above a lyric line), so each
// renders as one whole text node the queries can find. The font-size maths under
// test is identical for chunked chord/lyric rows — `maxRenderedLineLength`
// measures both shapes and feeds the same `fitFontSize` call.
const CHART = [
    'Oseh Shalom (Hirsch)',
    'Traditional Reform setting',
    'Verse one runs about this wide across the page',
    'Verse two is a little longer than the first one is',
].join('\n')

function mockFetchText(body: string) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(body),
    } as Response))
}

/**
 * The chart font size as the component actually wrote it. Read from the raw
 * `style` ATTRIBUTE, not the CSSOM: `fitFontSize` emits a
 * `clamp(calc(...), calc(100cqi / ...), calc(...))` and jsdom's CSS parser does
 * not round-trip container-query units, so `el.style.fontSize` comes back
 * mangled. The attribute is what ships to the browser.
 */
function fontSizeOf(container: HTMLElement): string {
    const el = container.querySelector('.font-mono') as HTMLElement
    expect(el, 'could not find the chart text block').toBeTruthy()
    const raw = el.getAttribute('style') ?? ''
    const m = raw.match(/font-size:\s*([^;]+)/)
    return (m ? m[1] : '').trim()
}

/**
 * The px floor and ceiling out of the emitted `clamp()`.
 *
 * `fitFontSize` emits `clamp(calc(11px * z), calc(100cqi / d * z), calc(15px * z))`;
 * jsdom's CSSOM folds the multiplications, so at zoom 1 the attribute reads
 * `clamp(11px, 3.44cqi, 15px)` and at zoom 1.5 `clamp(16.5px, 5.17cqi, 22.5px)`.
 * The folding is a jsdom serialisation detail — a real browser keeps the calc()
 * and computes the same value — and it makes the zoom factor directly assertable
 * as arithmetic on the 11px/15px clamp bounds.
 */
function clampPx(fontSize: string): { min: number; max: number } {
    const px = [...fontSize.matchAll(/([\d.]+)px/g)].map((m) => Number(m[1]))
    expect(px.length, `expected two px bounds in "${fontSize}"`).toBe(2)
    return { min: px[0], max: px[1] }
}

/** Base clamp bounds at zoom 1 — TextScoreViewer passes minPx 11, maxPx 15. */
const BASE_MIN_PX = 11
const BASE_MAX_PX = 15

beforeEach(() => {
    // Desktop width so wrap mode does not auto-engage (the < 768 branch).
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 1024 })
    vi.doMock('@/lib/offline-idb', () => ({ getFile: () => Promise.resolve(null) }))
    localStorage.clear()
    useMusicStore.getState().reset()
    mockFetchText(CHART)
})

afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.resetModules()
})

async function renderChart(fileId = 'upload-text-zoom') {
    const view = render(<TextScoreViewer fileId={fileId} />)
    await waitFor(() => expect(screen.queryByText('Oseh Shalom (Hirsch)')).toBeTruthy())
    return view
}

describe('TextScoreViewer honours the toolbar zoom (WAVE1 Bug 4)', () => {
    it('the rendered font size tracks store zoom — the toolbar control is live', async () => {
        const { container } = await renderChart()
        const at100 = fontSizeOf(container)

        // Exactly what the toolbar's "+" does.
        act(() => { useMusicStore.getState().setZoom(1.5) })
        const at150 = fontSizeOf(container)

        expect(
            at150,
            'store zoom moved but the rendered font size did not — the toolbar ' +
            'zoom buttons are decorative on text charts (Bug 4)',
        ).not.toBe(at100)

        // At 100% the chart sits on the documented 11-15px clamp...
        expect(clampPx(at100).min).toBeCloseTo(BASE_MIN_PX, 3)
        expect(clampPx(at100).max).toBeCloseTo(BASE_MAX_PX, 3)
        // ...and 150% genuinely scales both bounds, so the type really is bigger.
        expect(clampPx(at150).min).toBeCloseTo(BASE_MIN_PX * 1.5, 3)
        expect(clampPx(at150).max).toBeCloseTo(BASE_MAX_PX * 1.5, 3)
    })

    it('zooming out through the store shrinks the chart', async () => {
        const { container } = await renderChart()
        act(() => { useMusicStore.getState().setZoom(0.8) })
        const px = clampPx(fontSizeOf(container))
        expect(px.min).toBeCloseTo(BASE_MIN_PX * 0.8, 3)
        expect(px.max).toBeCloseTo(BASE_MAX_PX * 0.8, 3)
    })

    it('the viewer\'s own control bar writes the same store slot (no divergence)', async () => {
        const { container } = await renderChart()
        const zoomIn = screen.getByRole('button', { name: 'Zoom in' })

        act(() => { zoomIn.click() })

        // The store — which is what the toolbar's "%" readout reads — moved too.
        expect(useMusicStore.getState().zoom).toBeCloseTo(1.1, 5)
        expect(clampPx(fontSizeOf(container)).min).toBeCloseTo(BASE_MIN_PX * 1.1, 3)
    })

    it('the in-viewer readout and the store agree after a zoom-out', async () => {
        await renderChart()
        act(() => { screen.getByRole('button', { name: 'Zoom out' }).click() })
        expect(useMusicStore.getState().zoom).toBeCloseTo(0.9, 5)
        expect(screen.getByText('90%')).toBeTruthy()
    })

    it('text-chart zoom now persists per chart via chartZoom (was resetting to 100%)', async () => {
        const a: QueueItem = { name: 'Text A', fileId: 'upload-text-A', type: 'text' }
        const b: QueueItem = { name: 'Text B', fileId: 'upload-text-B', type: 'text' }
        useMusicStore.getState().setQueue([a, b], 0)

        await renderChart('upload-text-A')
        act(() => { useMusicStore.getState().setZoom(1.8) })
        expect(useMusicStore.getState().chartZoom['upload-text-A']).toBe(1.8)

        act(() => { useMusicStore.getState().nextSong() })
        expect(useMusicStore.getState().zoom).toBe(1)
        act(() => { useMusicStore.getState().prevSong() })
        expect(useMusicStore.getState().zoom).toBe(1.8)
    })

    it('wrap mode scales with store zoom too', async () => {
        const { container } = await renderChart()
        act(() => { screen.getByRole('button', { name: /Fit|Wrap/ }).click() })
        act(() => { useMusicStore.getState().setZoom(2) })
        // Wrap mode emits a plain `${14 * zoom}px`.
        expect(fontSizeOf(container)).toBe('28px')
    })
})
