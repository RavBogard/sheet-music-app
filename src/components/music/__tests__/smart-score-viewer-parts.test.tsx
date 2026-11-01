import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, screen, fireEvent } from '@testing-library/react'

// PERF-15: the Parts picker in the MusicXML viewer.
const { osmd, MockOSMD, store, loadPresets } = vi.hoisted(() => {
    const makeInstruments = (names: string[]) => names.map((Name) => ({ Name, Visible: true }))
    const osmd = {
        TransposeCalculator: null as unknown,
        Sheet: {
            Transpose: 0,
            Instruments: makeInstruments(['Vocals', 'Bass Guitar', 'Piano']),
            getFirstSourceMeasure: vi.fn(() => null),
        },
        Zoom: 1,
        load: vi.fn().mockResolvedValue(undefined),
        render: vi.fn(),
        updateGraphic: vi.fn(),
        makeInstruments,
    }
    const MockOSMD = vi.fn().mockImplementation(() => osmd)
    const store = {
        transposition: 0,
        zoom: 1,
        aiXmlContent: null as string | null,
        setMusicXmlKey: vi.fn(),
        musicXmlKey: null as string | null,
        chartParts: {} as Record<string, number[]>,
        setChartParts: vi.fn(),
        deviceInstrument: null as string | null,
    }
    const loadPresets = vi.fn()
    return { osmd, MockOSMD, store, loadPresets }
})

vi.mock('opensheetmusicdisplay', () => ({ OpenSheetMusicDisplay: MockOSMD, TransposeCalculator: vi.fn() }))
vi.mock('@/lib/store', () => ({ useMusicStore: vi.fn(() => ({ ...store })) }))
vi.mock('@/lib/auth-context', () => ({ useAuth: vi.fn(() => ({ isBandLeader: false, isAdmin: false, user: { uid: 'u1' } })) }))
vi.mock('@/lib/live-director', () => ({ changeTrackKey: vi.fn() }))
vi.mock('@/lib/offline-idb', () => ({ getFile: vi.fn().mockResolvedValue(null), putFile: vi.fn() }))
vi.mock('@/lib/music/part-presets-client', () => ({ loadPartPresets: loadPresets }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }))

import { SmartScoreViewer } from '../SmartScoreViewer'

const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
const visible = () => osmd.Sheet.Instruments.map((i: { Visible: boolean }) => i.Visible)

async function open() {
    await act(async () => { render(<SmartScoreViewer fileId="file-multi" />) })
    await advance(300)
}

describe('SmartScoreViewer parts picker', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.useFakeTimers()
        osmd.Sheet.Instruments = osmd.makeInstruments(['Vocals', 'Bass Guitar', 'Piano'])
        osmd.Sheet.Transpose = 0
        store.transposition = 2
        store.chartParts = {}
        loadPresets.mockResolvedValue({ userPreset: null, instrumentPreset: null })
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            arrayBuffer: async () => new TextEncoder().encode('<score-partwise><part-list/></score-partwise>').buffer,
        }))
    })
    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
    })

    it('opens the full score with a Parts button, and keeps transposition on re-render', async () => {
        await open()
        expect(screen.getByTestId('musicxml-parts-button')).toBeTruthy()
        expect(visible()).toEqual([true, true, true])

        fireEvent.click(screen.getByTestId('musicxml-parts-button'))
        await act(async () => { fireEvent.click(screen.getByTestId('musicxml-part-0')) })
        expect(visible()).toEqual([false, true, true])
        expect(store.setChartParts).toHaveBeenCalledWith('file-multi', [1, 2])
        expect(osmd.Sheet.Transpose).toBe(2)
    })

    it('always keeps at least one part on', async () => {
        store.chartParts = { 'file-multi': [1] }
        await open()
        expect(visible()).toEqual([false, true, false])
        fireEvent.click(screen.getByTestId('musicxml-parts-button'))
        expect((screen.getByTestId('musicxml-part-1') as HTMLInputElement).disabled).toBe(true)
    })

    it('applies a leader preset when the device has no pick', async () => {
        loadPresets.mockResolvedValue({
            userPreset: { scope: { kind: 'user', uid: 'u1' }, patterns: ['bass'] },
            instrumentPreset: null,
        })
        await open()
        expect(visible()).toEqual([false, true, false])
    })

    it('falls back to the full score when a part render throws', async () => {
        store.chartParts = { 'file-multi': [0] }
        let first = true
        osmd.render.mockImplementation(() => {
            if (first) { first = false; throw new Error('render boom') }
        })
        await open()
        expect(visible()).toEqual([true, true, true])
        expect(screen.queryByTestId('musicxml-retry')).toBeNull()
    })

    it('shows no Parts button for a one-part chart', async () => {
        osmd.Sheet.Instruments = osmd.makeInstruments(['Piano'])
        await open()
        expect(screen.queryByTestId('musicxml-parts-button')).toBeNull()
    })
})
