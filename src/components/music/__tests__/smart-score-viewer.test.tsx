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
        // Phase-2 MED: the key header reads `musicXmlKey` from the store to
        // display "Key: <X>" / "Written: X · Labeled: Y" + match-button.
        // Default null (header hidden) so legacy tests that pre-date the
        // header remain unaffected; the header-specific tests below set it
        // explicitly before render.
        musicXmlKey: null as string | null,
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

// --- Mock offline-idb (IDB-first source resolution) ---
// The load effect dynamically imports `@/lib/offline-idb` and reads
// `getFile(fileId)`. Default: IDB-miss (null) so the network fetch path runs
// — preserving the pre-fix behavior of the legacy tests. The IDB-first /
// .mxl arms override `mockGetFile` to return a Blob.
const { mockGetFile } = vi.hoisted(() => {
    const mockGetFile = vi.fn<(fileId: string) => Promise<Blob | null>>().mockResolvedValue(null)
    return { mockGetFile }
})

vi.mock('@/lib/offline-idb', () => ({
    getFile: mockGetFile,
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

vi.mock('@/components/ui/button', () => ({
    Button: ({
        children,
        onClick,
        disabled,
        type,
        'aria-label': ariaLabel,
        className,
    }: {
        children: React.ReactNode
        onClick?: () => void
        disabled?: boolean
        type?: 'button' | 'submit' | 'reset'
        'aria-label'?: string
        className?: string
    }) => (
        <button
            type={type ?? 'button'}
            onClick={onClick}
            disabled={disabled}
            aria-label={ariaLabel}
            className={className}
        >
            {children}
        </button>
    ),
}))

import { SmartScoreViewer } from '../SmartScoreViewer'
import { fireEvent, screen } from '@testing-library/react'

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
        mockStoreValues.musicXmlKey = null
        mockAuthValues.isBandLeader = false
        mockAuthValues.isAdmin = false

        // WS-10: source resolution is IDB-first by `fileId`. Default to an
        // IDB-miss (getFile → null) so the network fetch path runs — the same
        // bytes the legacy tests expected. The IDB-hit / .mxl arms override
        // `mockGetFile`. The fetch stub returns valid MusicXML so the
        // network-fallback load path succeeds without a real network.
        mockGetFile.mockResolvedValue(null)
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            arrayBuffer: async () => new TextEncoder().encode(XML).buffer,
        }))
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
    })

    it('assigns TransposeCalculator to OSMD instance after initialization', async () => {
        // URL path: fetch is stubbed to reject so the load fails gracefully after
        // init. Initialization (OSMD + TransposeCalculator) happens before the
        // fetch, so the assertions hold regardless of the load outcome.
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no network in test')))

        await act(async () => {
            render(<SmartScoreViewer fileId="file-score" />)
        })
        await advance(250)

        expect(MockOSMD).toHaveBeenCalled()
        expect(MockTC).toHaveBeenCalled()
        expect(mockOsmdInstance.TransposeCalculator).toBeInstanceOf(MockTC)

        vi.unstubAllGlobals()
    })

    it('sets TransposeCalculator before load() is called', async () => {
        // IDB miss (default) → the network stub returns XML → load() runs after
        // OSMD init, letting us assert TC-before-load ordering.

        const callOrder: string[] = []
        MockTC.mockImplementation(function (this: unknown) {
            callOrder.push('TransposeCalculator')
            return this
        })
        mockOsmdInstance.load.mockImplementation(async () => {
            callOrder.push('load')
        })

        await act(async () => {
            render(<SmartScoreViewer fileId="file-score" />)
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
            const result = render(<SmartScoreViewer fileId="file-score" />)
            rerender = result.rerender
        })
        await advance(250) // load + initial fit settle (readyRef true, applied {0,1})

        // Observe only the transpose update, not the initial load/render.
        mockOsmdInstance.updateGraphic.mockClear()
        mockOsmdInstance.render.mockClear()

        mockStoreValues.transposition = 2
        await act(async () => {
            rerender(<SmartScoreViewer fileId="file-score" />)
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
            const result = render(<SmartScoreViewer fileId="file-score" />)
            rerender = result.rerender
        })
        await advance(250)

        mockOsmdInstance.render.mockClear()
        mockOsmdInstance.updateGraphic.mockClear()

        // First change schedules a render; a second change within the debounce
        // window must cancel it, leaving exactly one render after settle.
        mockStoreValues.transposition = 2
        await act(async () => {
            rerender(<SmartScoreViewer fileId="file-score" />)
        })
        await advance(50) // < debounce: first timer still pending

        mockStoreValues.transposition = 3
        await act(async () => {
            rerender(<SmartScoreViewer fileId="file-score" />)
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
            render(<SmartScoreViewer fileId="file-score" />)
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
            render(<SmartScoreViewer fileId="file-score" />)
        })
        await advance(250)

        expect(mockSetMusicXmlKey).toHaveBeenCalledWith(expected)
    })

    it('clears musicXmlKey on unmount / fileId change', async () => {
        mockKeyInstruction.Key = 2 // D major
        mockKeyInstruction.Mode = 0

        let unmount!: () => void
        await act(async () => {
            const result = render(<SmartScoreViewer fileId="file-score" />)
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
            render(<SmartScoreViewer fileId="file-score" trackId="track-abc" trackKey="" />)
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
            render(<SmartScoreViewer fileId="file-score" trackId="track-abc" trackKey="A" />)
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
            render(<SmartScoreViewer fileId="file-score" trackId="track-abc" trackKey="" />)
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
            render(<SmartScoreViewer fileId="file-score" trackId="track-abc" trackKey="" />)
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
            render(<SmartScoreViewer fileId="file-score" trackId="track-xyz" />)
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
            render(<SmartScoreViewer fileId="file-score" />)
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
            const result = render(<SmartScoreViewer fileId="file-score" />)
            container = result.container
        })
        // Overlay visible immediately on mount.
        expect(container.textContent).toContain('Rendering Score')

        await advance(250)
        // After load settles, the overlay is gone (no error, no stuck spinner).
        expect(container.textContent).not.toContain('Rendering Score')
    })

    // ── Transpose-jank polish (Build Lane B, DISCUSSION.md §1.3) ──

    it('S1: preserves scrollable ancestor scrollTop across a transpose re-render', async () => {
        // Mount inside a wrapper that mimics PDFOverlay's `<div className=
        // "overflow-auto ...">` scroll surface. jsdom returns 0/0 for
        // scrollHeight/clientHeight so the helper would normally skip; force
        // realistic values so `findScrollableAncestor` walks through both the
        // overflow-style check AND the `scrollHeight > clientHeight` check.
        const Wrapper = ({ children }: { children: React.ReactNode }) => (
            <div data-testid="scroll-host" style={{ overflowY: 'auto', height: '800px' }}>
                {children}
            </div>
        )

        let container!: HTMLElement
        let rerender!: (ui: React.ReactElement) => void
        await act(async () => {
            const result = render(<Wrapper><SmartScoreViewer fileId="file-score" /></Wrapper>)
            container = result.container
            rerender = result.rerender
        })
        await advance(250)

        const scrollHost = container.querySelector('[data-testid="scroll-host"]') as HTMLDivElement
        // Force layout dimensions so the helper accepts this node.
        Object.defineProperty(scrollHost, 'scrollHeight', { configurable: true, get: () => 2000 })
        Object.defineProperty(scrollHost, 'clientHeight', { configurable: true, get: () => 800 })
        // Simulate the user having scrolled into the middle of a long score.
        scrollHost.scrollTop = 750

        // Simulate the WebKit layout reset that S1 is designed to undo: during
        // the OSMD `render()` SVG swap, the ancestor's scrollTop gets reset to 0.
        // The fix captures scrollTopBefore=750 and restores it after render.
        mockOsmdInstance.render.mockImplementationOnce(() => {
            scrollHost.scrollTop = 0
        })

        mockStoreValues.transposition = 2
        await act(async () => {
            rerender(<Wrapper><SmartScoreViewer fileId="file-score" /></Wrapper>)
        })
        await advance(250) // fire the debounced render + microtask flush

        expect(scrollHost.scrollTop).toBe(750)
    })

    it('S1: no-op when scrollTop was 0 (no jump to undo)', async () => {
        // Defensive: if the user hasn't scrolled, the post-render restore must
        // not touch scrollTop (avoids spurious style invalidation + the cheap
        // path when no scroll preservation is actually needed).
        const Wrapper = ({ children }: { children: React.ReactNode }) => (
            <div data-testid="scroll-host" style={{ overflowY: 'auto', height: '800px' }}>
                {children}
            </div>
        )

        let container!: HTMLElement
        let rerender!: (ui: React.ReactElement) => void
        await act(async () => {
            const result = render(<Wrapper><SmartScoreViewer fileId="file-score" /></Wrapper>)
            container = result.container
            rerender = result.rerender
        })
        await advance(250)

        const scrollHost = container.querySelector('[data-testid="scroll-host"]') as HTMLDivElement
        Object.defineProperty(scrollHost, 'scrollHeight', { configurable: true, get: () => 2000 })
        Object.defineProperty(scrollHost, 'clientHeight', { configurable: true, get: () => 800 })
        // scrollTop stays at 0 throughout — user never scrolled.

        // Track scrollTop writes via a setter spy so we can assert the
        // restore branch was skipped (no write attempt to bring it back to 0).
        let writeCount = 0
        let storedScrollTop = 0
        Object.defineProperty(scrollHost, 'scrollTop', {
            configurable: true,
            get: () => storedScrollTop,
            set: (v: number) => { writeCount++; storedScrollTop = v },
        })

        mockStoreValues.transposition = 1
        await act(async () => {
            rerender(<Wrapper><SmartScoreViewer fileId="file-score" /></Wrapper>)
        })
        await advance(250)

        // No write attempt because scrollTopBefore was 0 — restore branch is guarded.
        expect(writeCount).toBe(0)
    })

    it('S4: tap×3 within the debounce window fires exactly one render at the final value', async () => {
        // Adaptive-debounce burst gate per DISCUSSION.md §1.3 + dispatch.
        // Three rapid taps within 300ms must coalesce to a single render
        // that lands the LAST value (T=3), not T=1 or T=2.
        let rerender!: (ui: React.ReactElement) => void
        await act(async () => {
            const result = render(<SmartScoreViewer fileId="file-score" />)
            rerender = result.rerender
        })
        await advance(250) // initial load settle

        mockOsmdInstance.render.mockClear()
        mockOsmdInstance.updateGraphic.mockClear()

        // Tap 1 → schedule debounce
        mockStoreValues.transposition = 1
        await act(async () => { rerender(<SmartScoreViewer fileId="file-score" />) })
        await advance(50)

        // Tap 2 within window → reset debounce
        mockStoreValues.transposition = 2
        await act(async () => { rerender(<SmartScoreViewer fileId="file-score" />) })
        await advance(50)

        // Tap 3 within window → reset debounce again
        mockStoreValues.transposition = 3
        await act(async () => { rerender(<SmartScoreViewer fileId="file-score" />) })
        await advance(250) // fire the (single, rescheduled) render

        expect(mockOsmdInstance.render).toHaveBeenCalledTimes(1)
        expect(mockOsmdInstance.Sheet.Transpose).toBe(3)
    })

    it('S7: prefers the fileId-resolved MusicXML over stale aiXmlContent at mount', async () => {
        // If AI transcription for a prior PDF chart left `aiXmlContent` set in
        // the store, mounting SmartScoreViewer for a NEW MusicXML chart must
        // render the chart's actual MusicXML (resolved from its fileId), NOT
        // the stale AI XML. With a fileId present, aiXmlContent is ignored;
        // here the IDB miss resolves the bytes from the network route.
        const STALE_AI_XML = '<score-partwise data-source="stale-pdf-ai"><part-list/></score-partwise>'
        const MUSICXML_FROM_URL = '<score-partwise data-source="fresh-musicxml-url"><part-list/></score-partwise>'

        mockStoreValues.aiXmlContent = STALE_AI_XML
        // Override the suite-default fetch stub to return distinct MusicXML
        // bytes so we can assert which payload reached `load()`.
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            arrayBuffer: async () => new TextEncoder().encode(MUSICXML_FROM_URL).buffer,
        }))

        await act(async () => {
            render(<SmartScoreViewer fileId="file-fresh" />)
        })
        await advance(250)

        // The fileId-resolved content reached load(), aiXmlContent did NOT.
        expect(mockOsmdInstance.load).toHaveBeenCalledWith(MUSICXML_FROM_URL)
        expect(mockOsmdInstance.load).not.toHaveBeenCalledWith(STALE_AI_XML)
    })

    // ── WS-10: offline IDB-first source resolution ──

    it('IDB-first: renders the offline-idb cached MusicXML bytes WITHOUT a network fetch', async () => {
        // Cache HIT: getFile returns the cached bytes as a Blob. The viewer
        // reads them via the Blob API (no fetch(blob:) round-trip) and hands
        // the XML string to OSMD. fetch must NOT be called.
        const fetchSpy = vi.fn()
        vi.stubGlobal('fetch', fetchSpy)
        mockGetFile.mockResolvedValue(new Blob([XML], { type: 'application/xml' }))

        await act(async () => {
            render(<SmartScoreViewer fileId="file-cached" />)
        })
        await advance(250)

        expect(mockGetFile).toHaveBeenCalledWith('file-cached')
        expect(mockOsmdInstance.load).toHaveBeenCalledWith(XML)
        expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('Network-fallback: fetches /api/drive/file/<id> on an IDB miss', async () => {
        // Cache MISS (getFile → null, default). The viewer falls back to the
        // network route, which the suite stub answers with valid MusicXML.
        const fetchSpy = vi.fn().mockResolvedValue({
            ok: true,
            arrayBuffer: async () => new TextEncoder().encode(XML).buffer,
        })
        vi.stubGlobal('fetch', fetchSpy)

        await act(async () => {
            render(<SmartScoreViewer fileId="file-net" />)
        })
        await advance(250)

        expect(fetchSpy).toHaveBeenCalledWith('/api/drive/file/file-net')
        expect(mockOsmdInstance.load).toHaveBeenCalledWith(XML)
    })

    it('Compressed .mxl: hands OSMD a Blob when the cached bytes are not plain XML', async () => {
        // A compressed .mxl is a zip (PK\x03\x04 header) — not text-sniffable
        // as XML — so the viewer must pass the original Blob to osmd.load
        // (OSMD unzips .mxl itself), not a decoded string.
        const fetchSpy = vi.fn()
        vi.stubGlobal('fetch', fetchSpy)
        const mxlBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00])
        mockGetFile.mockResolvedValue(new Blob([mxlBytes], { type: 'application/vnd.recordare.musicxml' }))

        await act(async () => {
            render(<SmartScoreViewer fileId="file-mxl" />)
        })
        await advance(250)

        expect(mockOsmdInstance.load).toHaveBeenCalledWith(expect.any(Blob))
        expect(fetchSpy).not.toHaveBeenCalled()
    })

    // ── Phase-2 MED: detected-key header + "Match label to written key" ──
    // The header surfaces `musicXmlKey` above the score; when the bound
    // track has a non-equal labeled key, both are shown and a leader-only
    // "Match" button overwrites the labeled key via changeTrackKey. The
    // empty-`trackKey` case is silently healed by the load effect
    // (b3ef132b0); the Match button only ever offers to overwrite an
    // existing label — that's the user-facing fix path.

    it('Header: hides entirely when musicXmlKey is null (no parse, modal mode, pre-load)', () => {
        mockStoreValues.musicXmlKey = null
        // Use real timers + sync render so we can inspect the initial paint
        // without waiting for the load effect.
        vi.useRealTimers()
        const { container } = (() => {
            const r = render(<SmartScoreViewer fileId="file-x" />)
            return r
        })()
        expect(container.querySelector('[data-testid="musicxml-key-header"]')).toBeNull()
        vi.useFakeTimers()
    })

    it('Header: renders "Key: <X>" when musicXmlKey is set and no trackKey provided', () => {
        mockStoreValues.musicXmlKey = 'D'
        vi.useRealTimers()
        render(<SmartScoreViewer fileId="file-x" />)
        const header = screen.getByTestId('musicxml-key-header')
        expect(header).toBeTruthy()
        expect(header.textContent).toMatch(/Key/i)
        expect(header.textContent).toMatch(/D/)
        // Match button absent: no labeled key to overwrite.
        expect(screen.queryByLabelText(/Match label to written key/i)).toBeNull()
        vi.useFakeTimers()
    })

    it('Header: shows "Written: X · Labeled: Y" when both keys differ', () => {
        mockStoreValues.musicXmlKey = 'Eb'
        mockAuthValues.isBandLeader = true
        vi.useRealTimers()
        render(<SmartScoreViewer fileId="file-x" trackId="t-1" trackKey="D" />)
        const header = screen.getByTestId('musicxml-key-header')
        expect(header.textContent).toMatch(/Written/i)
        expect(header.textContent).toMatch(/Eb/)
        expect(header.textContent).toMatch(/Labeled/i)
        expect(header.textContent).toMatch(/D/)
        vi.useFakeTimers()
    })

    it('Match button: VISIBLE for band_leader when keys differ + trackId+trackKey supplied', () => {
        mockStoreValues.musicXmlKey = 'Eb'
        mockAuthValues.isBandLeader = true
        mockAuthValues.isAdmin = false
        vi.useRealTimers()
        render(<SmartScoreViewer fileId="file-x" trackId="t-1" trackKey="D" />)
        expect(screen.getByLabelText(/Match label to written key Eb/i)).toBeTruthy()
        vi.useFakeTimers()
    })

    it('Match button: VISIBLE for admin even when band_leader is false', () => {
        mockStoreValues.musicXmlKey = 'F#'
        mockAuthValues.isBandLeader = false
        mockAuthValues.isAdmin = true
        vi.useRealTimers()
        render(<SmartScoreViewer fileId="file-x" trackId="t-2" trackKey="G" />)
        expect(screen.getByLabelText(/Match label to written key/i)).toBeTruthy()
        vi.useFakeTimers()
    })

    it('Match button: HIDDEN for non-leader (musician / member) — gate fails closed', () => {
        mockStoreValues.musicXmlKey = 'Eb'
        mockAuthValues.isBandLeader = false
        mockAuthValues.isAdmin = false
        vi.useRealTimers()
        render(<SmartScoreViewer fileId="file-x" trackId="t-1" trackKey="D" />)
        // Header still renders (informational); button does NOT.
        expect(screen.getByTestId('musicxml-key-header')).toBeTruthy()
        expect(screen.queryByLabelText(/Match label to written key/i)).toBeNull()
        vi.useFakeTimers()
    })

    it('Match button: HIDDEN when keys are equal (nothing to do)', () => {
        mockStoreValues.musicXmlKey = 'C'
        mockAuthValues.isBandLeader = true
        vi.useRealTimers()
        render(<SmartScoreViewer fileId="file-x" trackId="t-1" trackKey="C" />)
        expect(screen.queryByLabelText(/Match label to written key/i)).toBeNull()
        // Header still shows informational "Key: C".
        expect(screen.getByTestId('musicxml-key-header').textContent).toMatch(/C/)
        vi.useFakeTimers()
    })

    it('Match button: HIDDEN when trackKey is empty (heal path handles that case silently)', () => {
        mockStoreValues.musicXmlKey = 'Eb'
        mockAuthValues.isBandLeader = true
        vi.useRealTimers()
        // No trackKey prop — the load effect's heal handles this case.
        render(<SmartScoreViewer fileId="file-x" trackId="t-1" />)
        expect(screen.queryByLabelText(/Match label to written key/i)).toBeNull()
        vi.useFakeTimers()
    })

    it('Match button click calls changeTrackKey(trackId, musicXmlKey)', async () => {
        mockStoreValues.musicXmlKey = 'Eb'
        mockAuthValues.isBandLeader = true
        vi.useRealTimers()
        render(<SmartScoreViewer fileId="file-x" trackId="t-9" trackKey="D" />)

        const btn = screen.getByLabelText(/Match label to written key Eb/i)
        await act(async () => {
            fireEvent.click(btn)
            // Let the pending state settle and the await on changeTrackKey resolve.
            await Promise.resolve()
        })
        expect(mockChangeTrackKey).toHaveBeenCalledWith('t-9', 'Eb')
        vi.useFakeTimers()
    })
})
