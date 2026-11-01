import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, screen, fireEvent } from '@testing-library/react'

// PERF-15: the Parts picker in the MusicXML viewer.
const NAMES = ['Vocals', 'Bass Guitar', 'Piano']
const { osmd, MockOSMD, store, fetchPresets, auth } = vi.hoisted(() => {
    const makeInstruments = (names: string[]) => names.map((Name) => ({ Name, Visible: true }))
    const osmd = {
        TransposeCalculator: null as unknown,
        Sheet: {
            Transpose: 0,
            Instruments: makeInstruments([]),
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
        chartParts: {} as Record<string, { names: string[]; visible: number[] }>,
        setChartParts: vi.fn(),
        partPresetCache: {} as Record<string, unknown[]>,
        setPartPresetCache: vi.fn(),
    }
    const fetchPresets = vi.fn()
    const auth = { isBandLeader: false, isAdmin: false, user: { uid: 'u1' } as { uid: string } | null, profile: null as unknown }
    return { osmd, MockOSMD, store, fetchPresets, auth }
})

vi.mock('opensheetmusicdisplay', () => ({ OpenSheetMusicDisplay: MockOSMD, TransposeCalculator: vi.fn() }))
vi.mock('@/lib/store', () => ({ useMusicStore: vi.fn(() => ({ ...store })) }))
vi.mock('@/lib/auth-context', () => ({ useAuth: vi.fn(() => ({ ...auth })) }))
vi.mock('@/lib/live-director', () => ({ changeTrackKey: vi.fn() }))
vi.mock('@/lib/offline-idb', () => ({ getFile: vi.fn().mockResolvedValue(null), putFile: vi.fn() }))
vi.mock('@/lib/music/part-presets-client', () => ({ fetchPartPresets: fetchPresets }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }))

import { SmartScoreViewer } from '../SmartScoreViewer'

const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
const visible = () => osmd.Sheet.Instruments.map((i: { Visible: boolean }) => i.Visible)
const bassPreset = { scope: { kind: 'user', uid: 'u1' }, patterns: ['bass'] }

async function open() {
    await act(async () => { render(<SmartScoreViewer fileId="file-multi" />) })
    await advance(300)
}

describe('SmartScoreViewer parts picker', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.useFakeTimers()
        osmd.Sheet.Instruments = osmd.makeInstruments(NAMES)
        osmd.Sheet.Transpose = 0
        osmd.render.mockReset()
        store.transposition = 2
        store.chartParts = {}
        store.partPresetCache = {}
        auth.user = { uid: 'u1' }
        fetchPresets.mockResolvedValue(null)
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            arrayBuffer: async () => new TextEncoder().encode('<score-partwise><part-list/></score-partwise>').buffer,
        }))
    })
    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
    })

    it('opens the full score with a Parts button, keeps transposition, and saves the pick with part names', async () => {
        await open()
        expect(screen.getByTestId('musicxml-parts-button')).toBeTruthy()
        expect(visible()).toEqual([true, true, true])

        fireEvent.click(screen.getByTestId('musicxml-parts-button'))
        await act(async () => { fireEvent.click(screen.getByTestId('musicxml-part-0')) })
        expect(visible()).toEqual([false, true, true])
        expect(store.setChartParts).toHaveBeenCalledWith('file-multi', NAMES, [1, 2])
        expect(osmd.Sheet.Transpose).toBe(2)
    })

    it('always keeps at least one part on', async () => {
        store.chartParts = { 'file-multi': { names: NAMES, visible: [1] } }
        await open()
        expect(visible()).toEqual([false, true, false])
        fireEvent.click(screen.getByTestId('musicxml-parts-button'))
        expect((screen.getByTestId('musicxml-part-1') as HTMLInputElement).disabled).toBe(true)
    })

    it('ignores a device pick made against different part names', async () => {
        store.chartParts = { 'file-multi': { names: ['Vocals', 'Bass', 'Keys'], visible: [1] } }
        await open()
        expect(visible()).toEqual([true, true, true])
    })

    it('renders at once from the cached preset without waiting for the network', async () => {
        store.partPresetCache = { crc: [bassPreset] }
        fetchPresets.mockReturnValue(new Promise(() => { /* never settles: slow wifi */ }))
        await open()
        expect(visible()).toEqual([false, true, false])
        expect(screen.queryByRole('status')).toBeNull()
    })

    it('applies a freshly loaded preset after the first render, unless the person already picked', async () => {
        let resolve!: (v: unknown) => void
        fetchPresets.mockReturnValue(new Promise((r) => { resolve = r }))
        await open()
        expect(visible()).toEqual([true, true, true])
        await act(async () => { resolve([bassPreset]) })
        expect(visible()).toEqual([false, true, false])
        expect(store.setPartPresetCache).toHaveBeenCalledWith('crc', [bassPreset])
    })

    it('a late preset never overrides a pick made in the meantime', async () => {
        let resolve!: (v: unknown) => void
        fetchPresets.mockReturnValue(new Promise((r) => { resolve = r }))
        await open()
        fireEvent.click(screen.getByTestId('musicxml-parts-button'))
        await act(async () => { fireEvent.click(screen.getByTestId('musicxml-part-2')) })
        expect(visible()).toEqual([true, true, false])
        await act(async () => { resolve([bassPreset]) })
        expect(visible()).toEqual([true, true, false])
    })

    it('falls back to the full score when a part render throws, and does not save the pick', async () => {
        await open()
        fireEvent.click(screen.getByTestId('musicxml-parts-button'))
        osmd.render.mockImplementationOnce(() => { throw new Error('render boom') })
        await act(async () => { fireEvent.click(screen.getByTestId('musicxml-part-0')) })
        expect(visible()).toEqual([true, true, true])
        expect(store.setChartParts).not.toHaveBeenCalled()
        expect(screen.queryByTestId('musicxml-retry')).toBeNull()
    })

    it('Reset loads presets when none were cached, then applies them', async () => {
        store.chartParts = { 'file-multi': { names: NAMES, visible: [0] } }
        await open()
        expect(visible()).toEqual([true, false, false])
        fetchPresets.mockResolvedValue([bassPreset])
        fireEvent.click(screen.getByTestId('musicxml-parts-button'))
        await act(async () => { fireEvent.click(screen.getByTestId('musicxml-parts-reset')) })
        expect(store.setChartParts).toHaveBeenCalledWith('file-multi', NAMES, null)
        expect(visible()).toEqual([false, true, false])
    })

    it('shows no Parts button for a one-part chart', async () => {
        osmd.Sheet.Instruments = osmd.makeInstruments(['Piano'])
        await open()
        expect(screen.queryByTestId('musicxml-parts-button')).toBeNull()
    })
})
