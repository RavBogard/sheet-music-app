import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"

// Mock cn utility
vi.mock("@/lib/utils", () => ({
    cn: (...args: (string | boolean | undefined | null)[]) =>
        args.filter(Boolean).join(" "),
}))

// Mock the music store
const mockSetZoom = vi.fn()
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

    it("exit button calls onHome", () => {
        render(<PerformanceToolbar onHome={mockOnHome} />)

        const exitButtons = screen.getAllByText("Exit")
        fireEvent.click(exitButtons[0])
        expect(mockOnHome).toHaveBeenCalled()
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
})
