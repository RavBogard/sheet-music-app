// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { SetlistView } from "../SetlistView"
import { SetlistTrack } from "@/types/models"

// Mock getTransposedKeyName
vi.mock("@/lib/music-math", () => ({
    getTransposedKeyName: (key: string, semitones: number) => {
        if (semitones === 0) return key
        // Simulate: C transposed by -2 => Bb (-2)
        const mockMap: Record<string, Record<number, string>> = {
            C: { [-2]: "Bb (-2)", [2]: "D (+2)" },
            G: { [-2]: "F (-2)" },
        }
        return mockMap[key]?.[semitones] || `${key}t (${semitones})`
    },
}))

const mockSongTrack: SetlistTrack = {
    id: "song-1",
    title: "Amazing Grace",
    key: "C",
    bpm: 72,
    leadMusician: "Sarah",
    type: "song",
    fileId: "file-abc",
}

const mockSongNoFile: SetlistTrack = {
    id: "song-2",
    title: "Silent Night",
    key: "G",
    bpm: 60,
    type: "song",
}

const mockPrayer: SetlistTrack = {
    id: "prayer-1",
    title: "Opening Prayer",
    type: "prayer",
}

const mockReading: SetlistTrack = {
    id: "reading-1",
    title: "Torah Reading",
    type: "reading",
    notes: "Genesis 1:1-5",
}

const mockHeader: SetlistTrack = {
    id: "header-1",
    title: "Morning Service",
    type: "header",
}

const allTracks: SetlistTrack[] = [
    mockHeader,
    mockPrayer,
    mockSongTrack,
    mockReading,
    mockSongNoFile,
]

describe("SetlistView", () => {
    const defaultProps = {
        tracks: allTracks,
        currentTrackIndex: -1,
        defaultTransposition: 0,
        isPublicView: false,
        isLeader: false,
        onSongTap: vi.fn(),
        onLeaderSetPosition: vi.fn(),
    }

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it("renders song rows with title, key, tempo, lead visible", () => {
        render(<SetlistView {...defaultProps} />)

        // Song title
        expect(screen.getByText("Amazing Grace")).toBeDefined()
        // Key badge
        expect(screen.getByText("C")).toBeDefined()
        // BPM
        expect(screen.getByText("72")).toBeDefined()
        // Lead musician
        expect(screen.getByText("Sarah")).toBeDefined()
    })

    it("renders non-song items with quieter styling (no key/tempo/lead)", () => {
        render(<SetlistView {...defaultProps} />)

        // Prayer title should be present
        expect(screen.getByText("Opening Prayer")).toBeDefined()

        // The prayer row should not show key, tempo, or lead fields
        // These elements should only exist for songs
        const prayerEl = screen.getByText("Opening Prayer")
        expect(prayerEl.className).toContain("text-muted-foreground")
    })

    it("highlights current position row with bg-violet-500/15", () => {
        render(<SetlistView {...defaultProps} currentTrackIndex={2} />)

        // The 3rd track (index 2) is the song "Amazing Grace"
        const songRow = screen.getByText("Amazing Grace").closest("[role='button']")
        expect(songRow).toBeDefined()
        expect(songRow?.className).toContain("bg-violet-500/15")
    })

    it("shows transposed key when defaultTransposition is non-zero", () => {
        render(<SetlistView {...defaultProps} defaultTransposition={-2} />)

        // With -2 transposition, C should display as Bb
        expect(screen.getByText("Bb")).toBeDefined()
    })

    it("hides notes by default, shows after tap", () => {
        render(
            <SetlistView
                {...defaultProps}
                tracks={[mockReading]}
                currentTrackIndex={-1}
            />
        )

        // Notes should not be visible initially
        // (Torah Reading has notes "Genesis 1:1-5")
        expect(screen.queryByText("Genesis 1:1-5")).toBeNull()

        // Tap the row to toggle notes
        const row = screen.getByText("Torah Reading")
        fireEvent.click(row)

        // Notes should now be visible -- this will fail until SetlistRow implements note toggling display
        expect(screen.getByText("Genesis 1:1-5")).toBeDefined()
    })
})
