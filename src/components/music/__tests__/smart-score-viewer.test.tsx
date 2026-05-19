import { describe, it, expect, vi, beforeEach } from 'vitest'
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
import { useMusicStore } from '@/lib/store'

describe('SmartScoreViewer', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockOsmdInstance.TransposeCalculator = null
        mockOsmdInstance.Sheet = { Transpose: 0 }
        mockOsmdInstance.Zoom = 1
        mockStoreValues.transposition = 0
        mockStoreValues.zoom = 1
        mockStoreValues.aiXmlContent = null
    })

    it('assigns TransposeCalculator to OSMD instance after initialization', async () => {
        await act(async () => {
            render(<SmartScoreViewer url="https://example.com/score.xml" />)
        })

        // Allow all effects and async operations to settle
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 200))
        })

        expect(MockOSMD).toHaveBeenCalled()
        expect(MockTC).toHaveBeenCalled()
        expect(mockOsmdInstance.TransposeCalculator).toBeInstanceOf(MockTC)
    })

    it('sets TransposeCalculator before load() is called', async () => {
        // Drive the in-memory aiXmlContent path: a non-URL XML string skips the
        // component's fetch(sourceUrl) branch (which would otherwise hit the
        // network — unmocked here — and abort before load() runs). load() is
        // then called directly, letting us assert TC-before-load ordering.
        mockStoreValues.aiXmlContent = '<score-partwise><part-list/></score-partwise>'

        // Track the order of operations
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

        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 200))
        })

        const tcIndex = callOrder.indexOf('TransposeCalculator')
        const loadIndex = callOrder.indexOf('load')
        expect(tcIndex).toBeGreaterThanOrEqual(0)
        expect(loadIndex).toBeGreaterThanOrEqual(0)
        expect(tcIndex).toBeLessThan(loadIndex)
    })

    it('sets Sheet.Transpose and calls updateGraphic+render when transposition changes', async () => {
        // First render with transposition=0
        const { unmount } = await act(async () => {
            return render(<SmartScoreViewer url="https://example.com/score.xml" />)
        })

        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 200))
        })

        // Clear mocks from initial render
        mockOsmdInstance.updateGraphic.mockClear()
        mockOsmdInstance.render.mockClear()

        // Change transposition via mock store
        mockStoreValues.transposition = 2
        vi.mocked(useMusicStore).mockReturnValue({
            transposition: 2,
            zoom: 1,
            aiXmlContent: null,
        })

        // Re-render to trigger the transposition effect
        unmount()
        await act(async () => {
            render(<SmartScoreViewer url="https://example.com/score.xml" />)
        })

        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 200))
        })

        expect(mockOsmdInstance.Sheet.Transpose).toBe(2)
        expect(mockOsmdInstance.updateGraphic).toHaveBeenCalled()
        expect(mockOsmdInstance.render).toHaveBeenCalled()
    })
})
