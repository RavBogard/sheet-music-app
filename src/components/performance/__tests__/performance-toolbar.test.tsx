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
    playbackQueue: [],
    aiState: { isEnabled: false, pageData: {}, scanningPages: [], error: null },
    setAiEnabled: vi.fn(),
    capoFret: null,
    transposition: 0,
    currentVisiblePage: 1,
    zoom: 1,
    setZoom: mockSetZoom,
    currentSetlistId: null,
    syncedBroadcasterId: null,
    setSyncedBroadcasterId: vi.fn(),
    jumpToSong: vi.fn(),
    setCurrentVisiblePage: vi.fn(),
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
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/lib/live-session-firebase", () => ({ subscribeToLiveSessions: () => () => {} }))

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
vi.mock("@/components/performance/SetlistDrawerLegacy", () => ({
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
})
