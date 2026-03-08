// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { SetlistTrack } from "@/types/models"

// Mock PDFViewer as simple div (avoid worker initialization in tests)
vi.mock("next/dynamic", () => ({
    __esModule: true,
    default: () => {
        const MockPDFViewer = ({ url, trackName }: { url: string; trackName?: string }) => (
            <div data-testid="pdf-viewer" data-url={url}>
                {trackName}
            </div>
        )
        MockPDFViewer.displayName = "MockPDFViewer"
        return MockPDFViewer
    },
}))

// Mock QuickMonitorPanel as stub
vi.mock("@/components/monitor/QuickMonitorPanel", () => ({
    QuickMonitorPanel: () => <div data-testid="monitor-panel">Monitor</div>,
}))

// Mock cn utility
vi.mock("@/lib/utils", () => ({
    cn: (...args: (string | boolean | undefined | null)[]) =>
        args.filter(Boolean).join(" "),
}))

// Mock the music store used by PDFOverlay and PerformanceToolbar
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
    setZoom: vi.fn(),
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
    QueueItem: {},
}))

// Mock hooks used by PerformanceToolbar
vi.mock("@/hooks/use-monitor-access", () => ({ useMonitorAccess: () => ({ hasAccess: false }) }))
vi.mock("@/hooks/use-monitor-connection", () => ({ useMonitorConnection: () => {} }))
vi.mock("@/lib/annotation-store", () => ({ useAnnotationStore: () => ({ isAnnotating: false, setAnnotating: vi.fn() }) }))
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null, isAdmin: false, isBandLeader: false }) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/lib/live-session-firebase", () => ({ subscribeToLiveSessions: () => () => {} }))

// Mock sub-components of PerformanceToolbar
vi.mock("@/components/music/TransposerMenu", () => ({
    TransposerMenu: () => <div>Transposer</div>,
    ChordEditBar: () => null,
}))
vi.mock("@/components/performance/MetronomeControl", () => ({
    MetronomeControl: () => <div>Metronome</div>,
}))
vi.mock("@/components/performance/SongNavigation", () => ({
    SongNavigation: () => <div data-testid="song-nav">Nav</div>,
}))
vi.mock("@/components/performance/SetlistDrawerLegacy", () => ({
    SetlistDrawer: () => <div>Drawer</div>,
}))
vi.mock("@/components/music/AnnotationToolbar", () => ({
    AnnotationToolbar: () => null,
}))

import { PDFOverlay } from "../PDFOverlay"
import { PerformanceBottomBar } from "../PerformanceBottomBar"

const songA: SetlistTrack = {
    id: "song-a",
    title: "Ma Tovu",
    key: "D",
    bpm: 120,
    type: "song",
    fileId: "file-a",
}

const prayer: SetlistTrack = {
    id: "prayer-1",
    title: "Opening Prayer",
    type: "prayer",
}

const songB: SetlistTrack = {
    id: "song-b",
    title: "Shalom Aleichem",
    key: "Am",
    bpm: 100,
    type: "song",
    fileId: "file-b",
}

const header: SetlistTrack = {
    id: "header-1",
    title: "Kabbalat Shabbat",
    type: "header",
}

const songNoFile: SetlistTrack = {
    id: "song-c",
    title: "Untitled Song",
    type: "song",
    // No fileId -- should be skipped by prev/next
}

const allTracks = [songA, prayer, songB, header, songNoFile]

describe("PerformanceBottomBar", () => {
    const defaultProps = {
        track: songA,
        tracks: allTracks,
        currentIndex: 0,
        isPublicView: false,
        onDrawerToggle: vi.fn(),
        onMonitorToggle: vi.fn(),
        onNavigate: vi.fn(),
        onClose: vi.fn(),
    }

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it("shows current song title", () => {
        render(<PerformanceBottomBar {...defaultProps} />)
        expect(screen.getByText("Ma Tovu")).toBeDefined()
    })

    it("prev/next navigation skips non-song items", () => {
        render(<PerformanceBottomBar {...defaultProps} currentIndex={0} />)
        const prevBtn = screen.getByLabelText("Previous song")
        expect(prevBtn).toHaveProperty("disabled", true)
        const nextBtn = screen.getByLabelText("Next song")
        expect(nextBtn).toHaveProperty("disabled", false)
        fireEvent.click(nextBtn)
        expect(defaultProps.onNavigate).toHaveBeenCalledWith(2)
    })

    it("hides monitor button when isPublicView is true", () => {
        render(<PerformanceBottomBar {...defaultProps} isPublicView={true} />)
        expect(screen.queryByLabelText("Open monitor mixer")).toBeNull()
    })

    it("shows monitor button when isPublicView is false", () => {
        render(<PerformanceBottomBar {...defaultProps} isPublicView={false} />)
        expect(screen.getByLabelText("Open monitor mixer")).toBeDefined()
    })
})

describe("PDFOverlay", () => {
    const defaultProps = {
        track: songA,
        tracks: allTracks,
        currentIndex: 0,
        onClose: vi.fn(),
        onNavigate: vi.fn(),
        isPublicView: false,
    }

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it("renders PDFViewer with correct URL", () => {
        render(<PDFOverlay {...defaultProps} />)
        const viewer = screen.getByTestId("pdf-viewer")
        expect(viewer.getAttribute("data-url")).toBe("/api/drive/file/file-a")
    })

    it("renders the full PerformanceToolbar", () => {
        render(<PDFOverlay {...defaultProps} />)
        // PerformanceToolbar includes song navigation
        expect(screen.getByTestId("song-nav")).toBeDefined()
    })

    it("renders Exit button from PerformanceToolbar", () => {
        render(<PDFOverlay {...defaultProps} />)
        expect(screen.getByText("Exit")).toBeDefined()
    })
})
