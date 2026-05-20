import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'

// --- Mock OSMD ---
// vi.mock factories are hoisted, so we cannot reference outer variables.
// Instead, we use vi.hoisted to create shared refs.
const { mockOsmdInstance, MockOSMD, MockTC } = vi.hoisted(() => {
    const mockOsmdInstance = {
        TransposeCalculator: null as unknown,
        Sheet: { Transpose: 0 },
        Zoom: 1,
        load: vi.fn().mockResolvedValue(undefined),
        render: vi.fn(),
        updateGraphic: vi.fn(),
    }
    const MockOSMD = vi.fn().mockImplementation(() => mockOsmdInstance)
    const MockTC = vi.fn()
    return { mockOsmdInstance, MockOSMD, MockTC }
})

vi.mock('opensheetmusicdisplay', () => ({
    OpenSheetMusicDisplay: MockOSMD,
    TransposeCalculator: MockTC,
}))

// --- Mock store ---
const { mockStoreValues } = vi.hoisted(() => {
    const mockStoreValues = {
        transposition: 0,
        zoom: 1,
        aiXmlContent: null as string | null,
    }
    return { mockStoreValues }
})

vi.mock('@/lib/store', () => ({
    useMusicStore: vi.fn(() => ({ ...mockStoreValues })),
}))

// --- Mock logger ---
vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

// --- Mock UI components ---
vi.mock('@/components/ui/card', () => ({
    Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
        <div data-testid="card" className={className}>{children}</div>
    ),
}))

import { SmartScoreViewer } from '../SmartScoreViewer'

const XML = '<score-partwise><part-list/></score-partwise>'

// Time-dependent rendering (load yields + debounced transpose) is driven with
// fake timers for determinism — real-timer + multi-act flushing detaches the
// React root in jsdom. (Project convention: vi.useFakeTimers for time tests.)
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

describe('SmartScoreViewer', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.useFakeTimers()
        mockOsmdInstance.TransposeCalculator = null
        mockOsmdInstance.Sheet = { Transpose: 0 }
        mockOsmdInstance.Zoom = 1
        mockStoreValues.transposition = 0
        mockStoreValues.zoom = 1
        mockStoreValues.aiXmlContent = null
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('assigns TransposeCalculator to OSMD instance after initialization', async () => {
        // URL path: fetch is stubbed to reject so the load fails gracefully after
        // init. Initialization (OSMD + TransposeCalculator) happens before the
        // fetch, so the assertions hold regardless of the load outcome.
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no network in test')))

        await act(async () => {
            render(<SmartScoreViewer url="https://example.com/score.xml" />)
        })
        await advance(250)

        expect(MockOSMD).toHaveBeenCalled()
        expect(MockTC).toHaveBeenCalled()
        expect(mockOsmdInstance.TransposeCalculator).toBeInstanceOf(MockTC)

        vi.unstubAllGlobals()
    })

    it('sets TransposeCalculator before load() is called', async () => {
        // Drive the in-memory aiXmlContent path: a non-URL XML string skips the
        // component's fetch(sourceUrl) branch (which would otherwise hit the
        // network) and calls load() directly, letting us assert TC-before-load.
        mockStoreValues.aiXmlContent = XML

        const callOrder: string[] = []
        MockTC.mockImplementation(function (this: unknown) {
            callOrder.push('TransposeCalculator')
            return this
        })
        mockOsmdInstance.load.mockImplementation(async () => {
            callOrder.push('load')
        })

        await act(async () => {
            render(<SmartScoreViewer url="https://example.com/score.xml" />)
        })
        await advance(250)

        const tcIndex = callOrder.indexOf('TransposeCalculator')
        const loadIndex = callOrder.indexOf('load')
        expect(tcIndex).toBeGreaterThanOrEqual(0)
        expect(loadIndex).toBeGreaterThanOrEqual(0)
        expect(tcIndex).toBeLessThan(loadIndex)
    })

    it('sets Sheet.Transpose and calls updateGraphic+render when transposition changes', async () => {
        mockStoreValues.aiXmlContent = XML

        let rerender!: (ui: React.ReactElement) => void
        await act(async () => {
            const result = render(<SmartScoreViewer url="https://example.com/score.xml" />)
            rerender = result.rerender
        })
        await advance(250) // load + initial fit settle (readyRef true, applied {0,1})

        // Observe only the transpose update, not the initial load/render.
        mockOsmdInstance.updateGraphic.mockClear()
        mockOsmdInstance.render.mockClear()

        mockStoreValues.transposition = 2
        await act(async () => {
            rerender(<SmartScoreViewer url="https://example.com/score.xml" />)
        })
        await advance(250) // fire the debounced re-render

        expect(mockOsmdInstance.Sheet.Transpose).toBe(2)
        expect(mockOsmdInstance.updateGraphic).toHaveBeenCalled()
        expect(mockOsmdInstance.render).toHaveBeenCalled()
    })

    it('debounces rapid transposition changes into a single re-render', async () => {
        mockStoreValues.aiXmlContent = XML

        let rerender!: (ui: React.ReactElement) => void
        await act(async () => {
            const result = render(<SmartScoreViewer url="https://example.com/score.xml" />)
            rerender = result.rerender
        })
        await advance(250)

        mockOsmdInstance.render.mockClear()
        mockOsmdInstance.updateGraphic.mockClear()

        // First change schedules a render; a second change within the debounce
        // window must cancel it, leaving exactly one render after settle.
        mockStoreValues.transposition = 2
        await act(async () => {
            rerender(<SmartScoreViewer url="https://example.com/score.xml" />)
        })
        await advance(50) // < debounce: first timer still pending

        mockStoreValues.transposition = 3
        await act(async () => {
            rerender(<SmartScoreViewer url="https://example.com/score.xml" />)
        })
        await advance(250) // fire the (single, rescheduled) render

        expect(mockOsmdInstance.render).toHaveBeenCalledTimes(1)
        expect(mockOsmdInstance.Sheet.Transpose).toBe(3)
    })

    it('shows the loading overlay and recovers without a measurement API (jsdom)', async () => {
        // getBBox / ResizeObserver are absent in jsdom; the component must not
        // throw and must clear the loading state once the score loads.
        mockStoreValues.aiXmlContent = XML

        let container!: HTMLElement
        await act(async () => {
            const result = render(<SmartScoreViewer url="https://example.com/score.xml" />)
            container = result.container
        })
        // Overlay visible immediately on mount.
        expect(container.textContent).toContain('Rendering Score')

        await advance(250)
        // After load settles, the overlay is gone (no error, no stuck spinner).
        expect(container.textContent).not.toContain('Rendering Score')
    })
})
