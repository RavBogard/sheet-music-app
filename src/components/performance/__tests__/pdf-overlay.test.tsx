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
    zoom: 1,
    setZoom: vi.fn(),
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
    QueueItem: {},
}))

// Mock hooks used by PerformanceToolbar
vi.mock("@/hooks/use-monitor-access", () => ({ useMonitorAccess: () => ({ hasAccess: false }) }))
vi.mock("@/hooks/use-monitor-connection", () => ({ useMonitorConnection: () => {} }))
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null, isAdmin: false, isBandLeader: false }) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), useParams: () => ({ id: 'test-setlist' }) }))
vi.mock("@/lib/live-session-firebase", () => ({ subscribeToLiveSessions: () => () => {} }))

// Mock sub-components of PerformanceToolbar
vi.mock("@/components/music/TransposerMenu", () => ({
    TransposerMenu: () => <div>Transposer</div>,
}))
vi.mock("@/components/music/ChordEditBar", () => ({
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

// Mock PrintModal which is rendered conditionally
vi.mock("@/components/setlist/PrintModal", () => ({
    PrintModal: () => <div data-testid="print-modal">Print Modal</div>,
}))

import { PDFOverlay } from "../PDFOverlay"

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
        // PerformanceToolbar renders mobile + desktop layouts (both visible in jsdom)
        expect(screen.getAllByTestId("song-nav").length).toBeGreaterThanOrEqual(1)
    })

    it("renders Exit button from PerformanceToolbar", () => {
        render(<PDFOverlay {...defaultProps} />)
        // Mobile + desktop layouts each render an Exit button
        expect(screen.getAllByText("Exit").length).toBeGreaterThanOrEqual(1)
    })
})
