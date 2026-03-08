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
        // Song A is at index 0, Song B is at index 2 (prayer at 1 is skipped)
        render(<PerformanceBottomBar {...defaultProps} currentIndex={0} />)

        // Prev should be disabled (first song)
        const prevBtn = screen.getByLabelText("Previous song")
        expect(prevBtn).toHaveProperty("disabled", true)

        // Next should navigate to index 2 (Song B, skipping prayer at 1)
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

    it("calls onClose when close button is clicked", () => {
        render(<PDFOverlay {...defaultProps} />)
        const closeBtn = screen.getByLabelText("Close PDF")
        fireEvent.click(closeBtn)
        expect(defaultProps.onClose).toHaveBeenCalled()
    })

    it("opens setlist drawer on drawer toggle click", () => {
        render(<PDFOverlay {...defaultProps} />)
        const drawerBtn = screen.getByLabelText("Open setlist")
        fireEvent.click(drawerBtn)
        // Drawer should now be visible with "Setlist" heading
        expect(screen.getByText("Setlist")).toBeDefined()
    })
})
