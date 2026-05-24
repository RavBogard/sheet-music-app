import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'

// --- Mock OSMD ---
// vi.mock factories are hoisted, so we cannot reference outer variables.
// Instead, we use vi.hoisted to create shared refs.
const { mockOsmdInstance, MockOSMD, MockTC, mockKeyInstruction, mockFirstMeasure } = vi.hoisted(() => {
    // KeyInstruction stand-in. `Key` is the fifths count (-7..+7); `Mode`
    // is the OSMD `KeyEnum` (major=0, minor=1, modal=2..9).
    const mockKeyInstruction: { Key: number | null; Mode: number | null } = { Key: null, Mode: null }
    const mockFirstMeasure = {
        getKeyInstruction: vi.fn(() => mockKeyInstruction),
    }
    const mockOsmdInstance = {
        TransposeCalculator: null as unknown,
        Sheet: {
            Transpose: 0,
            getFirstSourceMeasure: vi.fn(() => mockFirstMeasure),
        },
        Zoom: 1,
        load: vi.fn().mockResolvedValue(undefined),
        render: vi.fn(),
        updateGraphic: vi.fn(),
    }
    const MockOSMD = vi.fn().mockImplementation(() => mockOsmdInstance)
    const MockTC = vi.fn()
    return { mockOsmdInstance, MockOSMD, MockTC, mockKeyInstruction, mockFirstMeasure }
})

vi.mock('opensheetmusicdisplay', () => ({
    OpenSheetMusicDisplay: MockOSMD,
    TransposeCalculator: MockTC,
}))

// --- Mock store ---
const { mockStoreValues, mockSetMusicXmlKey } = vi.hoisted(() => {
    const mockSetMusicXmlKey = vi.fn()
    const mockStoreValues = {
        transposition: 0,
        zoom: 1,
        aiXmlContent: null as string | null,
        setMusicXmlKey: mockSetMusicXmlKey,
    }
    return { mockStoreValues, mockSetMusicXmlKey }
})

vi.mock('@/lib/store', () => ({
    useMusicStore: vi.fn(() => ({ ...mockStoreValues })),
}))

// --- Mock auth (role-gate inputs for the silent heal) ---
const { mockAuthValues } = vi.hoisted(() => {
    const mockAuthValues = {
        isBandLeader: false as boolean,
        isAdmin: false as boolean,
    }
    return { mockAuthValues }
})

vi.mock('@/lib/auth-context', () => ({
    useAuth: vi.fn(() => ({ ...mockAuthValues })),
}))

// --- Mock live-director (heal write path) ---
const { mockChangeTrackKey } = vi.hoisted(() => {
    const mockChangeTrackKey = vi.fn().mockResolvedValue(undefined)
    return { mockChangeTrackKey }
})

vi.mock('@/lib/live-director', () => ({
    changeTrackKey: mockChangeTrackKey,
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
        // Reset Sheet but preserve the spy on getFirstSourceMeasure so each
        // test can swap the returned KeyInstruction independently.
        mockOsmdInstance.Sheet.Transpose = 0
        mockOsmdInstance.Sheet.getFirstSourceMeasure = vi.fn(() => mockFirstMeasure)
        mockFirstMeasure.getKeyInstruction = vi.fn(() => mockKeyInstruction)
        mockKeyInstruction.Key = null
        mockKeyInstruction.Mode = null
        mockOsmdInstance.Zoom = 1
        mockStoreValues.transposition = 0
        mockStoreValues.zoom = 1
        mockStoreValues.aiXmlContent = null
        mockAuthValues.isBandLeader = false
        mockAuthValues.isAdmin = false
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

    // ── MusicXML detected-key + silent heal (Build Lane A, Q-DETECT-1=C) ──

    it('writes the parsed key to musicXmlKey after load (C major)', async () => {
        // fifths=0, mode=major → "C"
        mockKeyInstruction.Key = 0
        mockKeyInstruction.Mode = 0
        mockStoreValues.aiXmlContent = XML

        await act(async () => {
            render(<SmartScoreViewer url="https://example.com/score.xml" />)
        })
        await advance(250)

        // setMusicXmlKey called with "C" (the canonicalised key string)
        expect(mockSetMusicXmlKey).toHaveBeenCalledWith('C')
    })

    it.each([
        ['A minor (fifths=0 / mode=minor)', 0, 1, 'Am'],
        ['F# major (fifths=6 / mode=major)', 6, 0, 'F#'],
        ['Bb minor (fifths=-5 / mode=minor)', -5, 1, 'Bbm'],
    ])('canonicalises %s', async (_label, fifths, mode, expected) => {
        mockKeyInstruction.Key = fifths
        mockKeyInstruction.Mode = mode
        mockStoreValues.aiXmlContent = XML

        await act(async () => {
            render(<SmartScoreViewer url="https://example.com/score.xml" />)
        })
        await advance(250)

        expect(mockSetMusicXmlKey).toHaveBeenCalledWith(expected)
    })

    it('clears musicXmlKey on unmount / sourceUrl change', async () => {
        mockKeyInstruction.Key = 2 // D major
        mockKeyInstruction.Mode = 0
        mockStoreValues.aiXmlContent = XML

        let unmount!: () => void
        await act(async () => {
            const result = render(<SmartScoreViewer url="https://example.com/score.xml" />)
            unmount = result.unmount
        })
        await advance(250)

        mockSetMusicXmlKey.mockClear()
        await act(async () => { unmount() })
        // The load effect's cleanup runs setMusicXmlKey(null) — exact arg matters.
        expect(mockSetMusicXmlKey).toHaveBeenCalledWith(null)
    })

    it('does NOT heal track.key when the viewer is not band_leader/admin', async () => {
        mockKeyInstruction.Key = 2 // D major
        mockKeyInstruction.Mode = 0
        mockStoreValues.aiXmlContent = XML
        // Default auth values: isBandLeader=false, isAdmin=false

        await act(async () => {
            render(<SmartScoreViewer url="https://example.com/score.xml" trackId="track-abc" trackKey="" />)
        })
        await advance(250)

        expect(mockSetMusicXmlKey).toHaveBeenCalledWith('D')
        expect(mockChangeTrackKey).not.toHaveBeenCalled()
    })

    it('does NOT heal track.key when track.key is already set', async () => {
        mockKeyInstruction.Key = 2
        mockKeyInstruction.Mode = 0
        mockStoreValues.aiXmlContent = XML
        mockAuthValues.isBandLeader = true

        await act(async () => {
            render(<SmartScoreViewer url="https://example.com/score.xml" trackId="track-abc" trackKey="A" />)
        })
        await advance(250)

        expect(mockSetMusicXmlKey).toHaveBeenCalledWith('D')
        expect(mockChangeTrackKey).not.toHaveBeenCalled()
    })

    it('does NOT heal track.key when the key cannot be canonicalised (e.g. dorian mode)', async () => {
        mockKeyInstruction.Key = 0
        mockKeyInstruction.Mode = 3 // dorian — KeyEnum value we treat as unknown
        mockStoreValues.aiXmlContent = XML
        mockAuthValues.isAdmin = true

        await act(async () => {
            render(<SmartScoreViewer url="https://example.com/score.xml" trackId="track-abc" trackKey="" />)
        })
        await advance(250)

        // setMusicXmlKey called with null (modal key not canonicalisable)
        expect(mockSetMusicXmlKey).toHaveBeenCalledWith(null)
        expect(mockChangeTrackKey).not.toHaveBeenCalled()
    })

    it('heals track.key for band_leader when track.key is empty and key is canonicalisable', async () => {
        mockKeyInstruction.Key = 2 // D major
        mockKeyInstruction.Mode = 0
        mockStoreValues.aiXmlContent = XML
        mockAuthValues.isBandLeader = true

        await act(async () => {
            render(<SmartScoreViewer url="https://example.com/score.xml" trackId="track-abc" trackKey="" />)
        })
        await advance(250)

        expect(mockSetMusicXmlKey).toHaveBeenCalledWith('D')
        expect(mockChangeTrackKey).toHaveBeenCalledWith('track-abc', 'D')
    })

    it('heals track.key for admin even when band_leader is false', async () => {
        mockKeyInstruction.Key = -2 // Bb major
        mockKeyInstruction.Mode = 0
        mockStoreValues.aiXmlContent = XML
        mockAuthValues.isAdmin = true

        await act(async () => {
            // trackKey undefined (== row never had a key set) also counts as
            // "empty" and is the common case for newly-imported MusicXML.
            render(<SmartScoreViewer url="https://example.com/score.xml" trackId="track-xyz" />)
        })
        await advance(250)

        expect(mockChangeTrackKey).toHaveBeenCalledWith('track-xyz', 'Bb')
    })

    it('does NOT heal when trackId is missing (caller did not opt in)', async () => {
        mockKeyInstruction.Key = 2
        mockKeyInstruction.Mode = 0
        mockStoreValues.aiXmlContent = XML
        mockAuthValues.isBandLeader = true

        await act(async () => {
            render(<SmartScoreViewer url="https://example.com/score.xml" />)
        })
        await advance(250)

        // Local fallback still fires (TransposerMenu label lights up locally)…
        expect(mockSetMusicXmlKey).toHaveBeenCalledWith('D')
        // …but nothing is written to Firestore.
        expect(mockChangeTrackKey).not.toHaveBeenCalled()
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
