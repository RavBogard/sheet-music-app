import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"

// Mock cn utility
vi.mock("@/lib/utils", () => ({
    cn: (...args: (string | boolean | undefined | null)[]) =>
        args.filter(Boolean).join(" "),
}))

// Mock the music store
const mockSetZoom = vi.fn()
const mockSetFitMode = vi.fn()
const mockStoreState = {
    setQueue: vi.fn(),
    queueIndex: 0,
    playbackQueue: [] as unknown[],
    aiState: { isEnabled: false, pageData: {}, scanningPages: [], error: null },
    setAiEnabled: vi.fn(),
    capoFret: null,
    transposition: 0,
    zoom: 1,
    setZoom: mockSetZoom,
    fitMode: 'width' as 'width' | 'page',
    setFitMode: mockSetFitMode,
    currentSetlistId: null,
    jumpToSong: vi.fn(),
}
vi.mock("@/lib/store", () => ({
    useMusicStore: Object.assign(
        (selectorOrUndefined?: (s: Record<string, unknown>) => unknown) => {
            if (typeof selectorOrUndefined === "function") return selectorOrUndefined(mockStoreState)
            return mockStoreState
        },
        { getState: () => mockStoreState }
    ),
}))

// Mock hooks
vi.mock("@/hooks/use-monitor-access", () => ({ useMonitorAccess: () => ({ hasAccess: false }) }))
vi.mock("@/hooks/use-monitor-connection", () => ({ useMonitorConnection: () => {} }))
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null, isAdmin: false, isBandLeader: false }) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), useParams: () => ({ id: 'test-setlist' }) }))

// Mock sub-components
vi.mock("@/components/music/TransposerMenu", () => ({
    TransposerMenu: () => <div data-testid="transposer-menu">Transposer</div>,
}))
vi.mock("@/components/music/ChordEditBar", () => ({
    ChordEditBar: () => null,
}))
vi.mock("@/components/performance/MetronomeControl", () => ({
    MetronomeControl: () => <div data-testid="metronome">Metronome</div>,
}))
vi.mock("@/components/performance/SongNavigation", () => ({
    SongNavigation: () => <div data-testid="song-nav">Nav</div>,
}))
vi.mock("@/components/performance/SetlistDrawer", () => ({
    SetlistDrawer: () => <div data-testid="setlist-drawer">Drawer</div>,
}))
vi.mock("@/components/monitor/QuickMonitorPanel", () => ({
    QuickMonitorPanel: () => <div data-testid="monitor-panel">Monitor</div>,
}))

import { PerformanceToolbar } from "../PerformanceToolbar"

describe("PerformanceToolbar", () => {
    const mockOnHome = vi.fn()

    beforeEach(() => {
        vi.clearAllMocks()
        mockStoreState.zoom = 1
        // Reset shared mutable store state so test order can't leak (tests below
        // set playbackQueue/fitMode for image/PDF cases).
        mockStoreState.playbackQueue = []
        mockStoreState.queueIndex = 0
        mockStoreState.fitMode = 'width'
    })

    it("renders mobile layout with zoom controls, metronome, and exit", () => {
        render(<PerformanceToolbar onHome={mockOnHome} />)

        expect(screen.getAllByLabelText("Zoom in").length).toBeGreaterThanOrEqual(1)
        expect(screen.getAllByLabelText("Zoom out").length).toBeGreaterThanOrEqual(1)
        expect(screen.getAllByTestId("metronome").length).toBeGreaterThanOrEqual(1)
        expect(screen.getAllByText("Exit").length).toBeGreaterThanOrEqual(1)
    })

    it("renders desktop layout with song navigation", () => {
        render(<PerformanceToolbar onHome={mockOnHome} />)

        // Both mobile and desktop render SongNavigation
        expect(screen.getAllByTestId("song-nav").length).toBeGreaterThanOrEqual(2)
    })

    it("renders bottom layout with exit, nav, and setlist drawer", () => {
        render(<PerformanceToolbar onHome={mockOnHome} />)

        expect(screen.getAllByTestId("song-nav").length).toBeGreaterThanOrEqual(1)
        expect(screen.getAllByTestId("setlist-drawer").length).toBeGreaterThanOrEqual(1)
    })

    it("zoom out button calls setZoom with decreased value", () => {
        render(<PerformanceToolbar onHome={mockOnHome} />)

        const zoomOutButtons = screen.getAllByLabelText("Zoom out")
        fireEvent.click(zoomOutButtons[0])
        expect(mockSetZoom).toHaveBeenCalledWith(expect.closeTo(0.9, 1))
    })

    it("zoom in button calls setZoom with increased value", () => {
        render(<PerformanceToolbar onHome={mockOnHome} />)

        const zoomInButtons = screen.getAllByLabelText("Zoom in")
        fireEvent.click(zoomInButtons[0])
        expect(mockSetZoom).toHaveBeenCalledWith(expect.closeTo(1.1, 1))
    })

    it("zoom in caps at 2.0 (unchanged)", () => {
        mockStoreState.zoom = 1.95
        render(<PerformanceToolbar onHome={mockOnHome} />)
        fireEvent.click(screen.getAllByLabelText("Zoom in")[0])
        expect(mockSetZoom).toHaveBeenCalledWith(2.0)
    })

    // WAVE1 Bug 4 (2026-08-31): TextScoreViewer's own control bar reaches 3.0 —
    // its 11-15px font clamp needs the headroom — and now writes the SAME store
    // slot this toolbar reads. A bare `Math.min(2.0, zoom + 0.1)` would therefore
    // snap a 2.5 down to 2.0: a "+" button that shrinks the chart, mid-service,
    // on the charts with the smallest type in the library.
    it("WAVE1 Bug 4: zoom in never DECREASES a value already above the 2.0 cap", () => {
        mockStoreState.zoom = 2.5
        render(<PerformanceToolbar onHome={mockOnHome} />)
        fireEvent.click(screen.getAllByLabelText("Zoom in")[0])
        expect(mockSetZoom).toHaveBeenCalledWith(2.5)
        expect(mockSetZoom).not.toHaveBeenCalledWith(2.0)
    })

    it("WAVE1 Bug 4: zoom out still steps down normally from above the cap", () => {
        mockStoreState.zoom = 2.5
        render(<PerformanceToolbar onHome={mockOnHome} />)
        fireEvent.click(screen.getAllByLabelText("Zoom out")[0])
        expect(mockSetZoom).toHaveBeenCalledWith(expect.closeTo(2.4, 1))
    })

    it("exit button calls onHome", () => {
        render(<PerformanceToolbar onHome={mockOnHome} />)

        const exitButtons = screen.getAllByText("Exit")
        fireEvent.click(exitButtons[0])
        expect(mockOnHome).toHaveBeenCalled()
    })

    // v11.5-02-04 (H1) + v11.6-02-05 (WS-18/WS-26): the zoom-% readout shows the
    // current zoom and resets to 100% on tap. WS-26 made the label HONEST — it no
    // longer claims "fit to width" (which silently meant reset-to-100%); the
    // width↔page FIT choice is the separate toggle. WS-18: the % is always shown.
    it("v11.6-02-05: zoom readout is a labelled ≥44px button that resets zoom to 1 and shows the %", () => {
        mockStoreState.zoom = 1.4
        render(<PerformanceToolbar onHome={mockOnHome} />)

        const resetButtons = screen.getAllByRole("button", {
            name: /reset zoom to 100%/i,
        })
        // Rendered in both breakpoint trees (mobile + desktop).
        expect(resetButtons.length).toBeGreaterThanOrEqual(1)
        // iOS HIG 44px floor (C10I1-001 contract): h-11.
        expect(resetButtons[0].className).toMatch(/(^|\s)h-11(\s|$)/)
        // WS-18: the percentage is visible (no bare "/" placeholder).
        expect(screen.getAllByText("140%").length).toBeGreaterThanOrEqual(1)

        fireEvent.click(resetButtons[0])
        expect(mockSetZoom).toHaveBeenCalledWith(1)
    })

    // v11.6-02-05 (WS-14/WS-26): PDF charts expose a fit-mode toggle (fit-width
    // ↔ fit-page) so a portrait page can be read fully in landscape. The toggle
    // is PDF-only and flips the store's fitMode.
    it("v11.6-02-05: PDF charts show a fit-mode toggle that flips fitMode width↔page", () => {
        mockStoreState.playbackQueue = [
            { fileId: 'upload-pdf', type: 'pdf', title: 'Strange Fruit' } as unknown,
        ]
        mockStoreState.queueIndex = 0
        mockStoreState.fitMode = 'width'
        render(<PerformanceToolbar onHome={mockOnHome} />)

        // In 'width' mode the action is "fit whole page" (mobile + desktop trees).
        const toFitPage = screen.getAllByRole("button", { name: /fit whole page to screen/i })
        expect(toFitPage.length).toBeGreaterThanOrEqual(1)
        expect(toFitPage[0].className).toMatch(/(^|\s)h-11(\s|$)/)
        fireEvent.click(toFitPage[0])
        expect(mockSetFitMode).toHaveBeenCalledWith('page')
    })

    it("v11.6-02-05: non-PDF charts do NOT show the fit-mode toggle", () => {
        mockStoreState.playbackQueue = [
            { fileId: 'upload-txt', type: 'text', title: 'Wagon Wheel' } as unknown,
        ]
        mockStoreState.queueIndex = 0
        render(<PerformanceToolbar onHome={mockOnHome} />)

        expect(screen.queryByRole("button", { name: /fit whole page to screen/i })).toBeNull()
        expect(screen.queryByRole("button", { name: /fit chart to full width/i })).toBeNull()
    })

    // v70-01-01 Task 3: image-typed charts disable the transposer trigger
    // (which gates both transpose UI + AI-chord editing inside TransposerMenu).
    // The disabled trigger replaces the Popover wrapper entirely, carries a
    // tooltip via native title=, and is aria-disabled.
    it("v70-01-01 Task 3: disables transposer trigger when current chart is an image", () => {
        mockStoreState.playbackQueue = [
            { fileId: 'upload-abc', type: 'image', title: 'Dodi Li' } as any,
        ]
        mockStoreState.queueIndex = 0

        render(<PerformanceToolbar onHome={mockOnHome} />)

        // Both mobile + desktop render the disabled Transpose button.
        const disabledTriggers = screen.getAllByRole('button', {
            name: /transposing isn't available for image charts/i,
        })
        expect(disabledTriggers.length).toBeGreaterThanOrEqual(2)

        for (const trigger of disabledTriggers) {
            expect(trigger.getAttribute('aria-disabled')).toBe('true')
            expect(trigger.getAttribute('title')).toMatch(
                /re-upload as a pdf or musicxml/i,
            )
            expect(trigger.className).toMatch(/cursor-not-allowed/)
            expect(trigger.className).toMatch(/opacity-50/)
        }

        // Clicking the disabled trigger does NOT mount TransposerMenu.
        fireEvent.click(disabledTriggers[0])
        expect(screen.queryByTestId('transposer-menu')).toBeNull()

        // Restore default mock state for subsequent tests.
        mockStoreState.playbackQueue = []
        mockStoreState.queueIndex = 0
    })

    it("v70-01-01 Task 3: renders the normal transposer Popover when current chart is NOT an image", () => {
        mockStoreState.playbackQueue = [
            { fileId: 'pdf-xyz', type: 'pdf', title: 'Adon Olam' } as any,
        ]
        mockStoreState.queueIndex = 0

        render(<PerformanceToolbar onHome={mockOnHome} />)

        // Should NOT find the disabled image-chart aria-label anywhere.
        expect(
            screen.queryByRole('button', {
                name: /transposing isn't available for image charts/i,
            }),
        ).toBeNull()

        // Restore.
        mockStoreState.playbackQueue = []
        mockStoreState.queueIndex = 0
    })

    // C10I1-001: every mid-service toolbar control must meet the iOS HIG 44px
    // touch-target floor. jsdom can't measure layout, so we guard the class
    // contract instead: the non-compact (desktop / iPad-landscape) branch used
    // to render zoom/monitor/transpose at h-10 (40px). After the fix nothing in
    // the toolbar should carry an `h-10` token, and the zoom buttons are h-11.
    it("C10I1-001: no toolbar control renders at the 40px (h-10) size", () => {
        const { container } = render(<PerformanceToolbar onHome={mockOnHome} />)
        const buttons = Array.from(container.querySelectorAll("button"))
        expect(buttons.length).toBeGreaterThan(0)
        for (const b of buttons) {
            expect(b.className).not.toMatch(/(^|\s)h-10(\s|$)/)
        }
        for (const z of screen.getAllByLabelText(/zoom (in|out)/i)) {
            expect(z.className).toMatch(/(^|\s)h-11(\s|$)/)
        }
    })

    // C10I1-003: a deep-linked chart entry lands the band in the fullscreen
    // overlay where the header KeepAwakeToggle is z-stacked behind the chart.
    // The toolbar must surface its own wake-lock toggle when the parent threads
    // the controls in — reachable on BOTH the mobile (two-row) and desktop trees.
    it("C10I1-003: surfaces an in-chart Keep-screen-on toggle when wakeLock is provided + arms on tap", () => {
        const onRequest = vi.fn()
        const onRelease = vi.fn()
        render(
            <PerformanceToolbar
                onHome={mockOnHome}
                wakeLock={{ isActive: false, isSupported: true, onRequest, onRelease }}
            />,
        )
        const toggles = screen.getAllByRole("button", { name: /keep screen on/i })
        // One per breakpoint tree (mobile two-row + desktop single-row).
        expect(toggles.length).toBeGreaterThanOrEqual(2)
        fireEvent.click(toggles[0])
        expect(onRequest).toHaveBeenCalled()
    })

    it("C10I1-003: renders NO wake-lock toggle when wakeLock prop is absent (standalone /perform/[fileId])", () => {
        render(<PerformanceToolbar onHome={mockOnHome} />)
        expect(
            screen.queryByRole("button", { name: /keep screen on/i }),
        ).toBeNull()
    })

    // ── M3-001 (cycle-11): wake-lock failure feedback ───────────────────
    // When the parent threads a `lastError` verdict, the in-chart toggle
    // MUST surface an inline alert and keep aria-pressed=false even if
    // the optimistic isActive flag slipped through. The alert is spatially
    // anchored to the toggle (role="alert"), not a modal/toast.
    it("M3-001: in-chart wake-lock toggle surfaces inline alert when lastError='hidden'", () => {
        render(
            <PerformanceToolbar
                onHome={mockOnHome}
                wakeLock={{
                    isActive: false,
                    isSupported: true,
                    onRequest: vi.fn(),
                    onRelease: vi.fn(),
                    lastError: "hidden",
                }}
            />,
        )

        // Both breakpoints render their own toggle → both should also render
        // the failure alert pill.
        const alerts = screen.getAllByRole("alert")
        // SongNavigation/ChordEditBar etc may contain other role="alert"; we
        // only need ≥2 (one per breakpoint tree) of the wake-lock variety.
        const wakeLockAlerts = alerts.filter(el =>
            /tab not focused/i.test(el.textContent || ""),
        )
        expect(wakeLockAlerts.length).toBeGreaterThanOrEqual(2)
        for (const a of wakeLockAlerts) {
            expect(a.textContent).toMatch(/tap chart to retry/i)
        }
    })

    it("M3-001: in-chart wake-lock toggle suppresses 'engaged' state when lastError is set", () => {
        render(
            <PerformanceToolbar
                onHome={mockOnHome}
                wakeLock={{
                    // The hook keeps isLocked=false on rejection, but the
                    // toggle must remain non-engaged even if a future caller
                    // races isActive=true and lastError≠null in the same
                    // render (belt+braces — see KeepAwakeToggle.engaged).
                    isActive: true,
                    isSupported: true,
                    onRequest: vi.fn(),
                    onRelease: vi.fn(),
                    lastError: "denied",
                }}
            />,
        )

        const toggles = screen.getAllByRole("button", { name: /keep screen on/i })
        expect(toggles.length).toBeGreaterThanOrEqual(2)
        for (const t of toggles) {
            expect(t.getAttribute("aria-pressed")).toBe("false")
        }
    })

    // ── M3-004 (cycle-11): TRANSPOSE button current-state display ───────
    // AC3: transpose=0 → label contains "+0"; transpose=+2 from G#m →
    // label contains "+2" AND the transposed delta.
    it("M3-004: TRANSPOSE button label includes '+0' when transposition is 0", () => {
        mockStoreState.transposition = 0
        mockStoreState.playbackQueue = [
            { fileId: 'pdf-xyz', type: 'pdf', title: 'Adon Olam' } as any,
        ]
        mockStoreState.queueIndex = 0

        render(<PerformanceToolbar onHome={mockOnHome} />)
        const triggers = screen.getAllByTestId(/transpose-trigger/)
        expect(triggers.length).toBeGreaterThanOrEqual(2)
        for (const t of triggers) {
            // Either "+0" (no key estimated yet) or "<KEY> +0" — both
            // satisfy the contract that idle state shows "+0".
            expect(t.textContent).toMatch(/\+0/)
            expect(t.getAttribute("data-transposed")).toBe("false")
        }

        mockStoreState.transposition = 0
        mockStoreState.playbackQueue = []
        mockStoreState.queueIndex = 0
    })

    it("M3-004: TRANSPOSE button label includes signed offset and key delta when transposition !== 0", () => {
        // Seed aiState with chords that estimateKey will resolve to a major
        // mode so the buttonLabel takes the `transposition !== 0 && detectedKey`
        // branch. estimateKey treats large bias toward C/G/D as C major; a
        // minor mode requires lowercase or 'm' suffix.
        mockStoreState.aiState = {
            isEnabled: true,
            pageData: {
                "1": {
                    chords: [
                        { text: "C" }, { text: "G" }, { text: "Am" }, { text: "F" },
                    ],
                    error: null,
                },
            },
            scanningPages: [],
            error: null,
        } as any
        mockStoreState.transposition = 2
        mockStoreState.playbackQueue = [
            { fileId: 'pdf-xyz', type: 'pdf', title: 'Adon Olam' } as any,
        ]
        mockStoreState.queueIndex = 0

        render(<PerformanceToolbar onHome={mockOnHome} />)
        const triggers = screen.getAllByTestId(/transpose-trigger/)
        expect(triggers.length).toBeGreaterThanOrEqual(2)
        for (const t of triggers) {
            const text = t.textContent || ""
            // Signed offset present.
            expect(text).toMatch(/\+2/)
            // Delta arrow + transposed key present (estimateKey of C/G/Am/F
            // is "C"; transposeChord("C", 2) = "D" — text contains "→" and
            // the transposed pitch).
            expect(text).toMatch(/→/)
            expect(t.getAttribute("data-transposed")).toBe("true")
        }

        // Peripheral cue: when transposed, the trigger carries the primary-
        // tinted accent (bg-primary), separate from the prior brand tint
        // that lit up just because aiState was enabled.
        const accentTriggers = triggers.filter(t =>
            /\bbg-primary\b/.test(t.className),
        )
        expect(accentTriggers.length).toBeGreaterThanOrEqual(2)

        // Restore.
        mockStoreState.aiState = { isEnabled: false, pageData: {}, scanningPages: [], error: null }
        mockStoreState.transposition = 0
        mockStoreState.playbackQueue = []
        mockStoreState.queueIndex = 0
    })

    it("M3-004: TRANSPOSE button is NOT primary-accented when transposition is 0", () => {
        mockStoreState.transposition = 0
        mockStoreState.aiState = { isEnabled: false, pageData: {}, scanningPages: [], error: null }
        mockStoreState.playbackQueue = [
            { fileId: 'pdf-xyz', type: 'pdf', title: 'Adon Olam' } as any,
        ]
        mockStoreState.queueIndex = 0

        render(<PerformanceToolbar onHome={mockOnHome} />)
        const triggers = screen.getAllByTestId(/transpose-trigger/)
        for (const t of triggers) {
            expect(t.className).not.toMatch(/\bbg-primary\b/)
        }

        mockStoreState.playbackQueue = []
        mockStoreState.queueIndex = 0
    })
})
