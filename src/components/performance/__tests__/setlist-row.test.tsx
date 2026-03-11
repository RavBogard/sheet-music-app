import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { SetlistRow } from "../SetlistRow"
import { SetlistTrack } from "@/types/models"

vi.mock("@/lib/music-math", () => ({
    getTransposedKeyName: (key: string, semitones: number) => {
        if (semitones === 0) return key
        const mockMap: Record<string, Record<number, string>> = {
            C: { [-2]: "Bb (-2)", [2]: "D (+2)" },
            G: { [-2]: "F (-2)" },
        }
        return mockMap[key]?.[semitones] || `${key}t (${semitones})`
    },
}))

const baseSong: SetlistTrack = {
    id: "song-1",
    title: "Amazing Grace",
    key: "C",
    bpm: 120,
    leadMusician: "Randy",
    type: "song",
    fileId: "file-abc",
}

const defaultProps = {
    index: 0,
    isCurrentPosition: false,
    defaultTransposition: 0,
    isPublicView: false,
    isLeader: false,
    onSongTap: vi.fn(),
    onLeaderSetPosition: vi.fn(),
}

describe("SetlistRow", () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it("renders song title and key badge", () => {
        render(<SetlistRow track={baseSong} {...defaultProps} />)
        expect(screen.getByText("Amazing Grace")).toBeDefined()
        expect(screen.getByText("C")).toBeDefined()
    })

    it("key badge appears after title (has data-testid)", () => {
        render(<SetlistRow track={baseSong} {...defaultProps} />)
        const keyBadge = screen.getByTestId("key-badge")
        expect(keyBadge).toBeDefined()
        expect(keyBadge.textContent).toBe("C")
    })

    it("shows transposed key in leader view", () => {
        render(
            <SetlistRow
                track={baseSong}
                {...defaultProps}
                defaultTransposition={-2}
            />
        )
        expect(screen.getByText("Bb")).toBeDefined()
    })

    it("shows original key in public view even with transposition", () => {
        render(
            <SetlistRow
                track={baseSong}
                {...defaultProps}
                isPublicView={true}
                defaultTransposition={-2}
            />
        )
        expect(screen.getByText("C")).toBeDefined()
        expect(screen.queryByText("Bb")).toBeNull()
    })

    it("renders header rows as dividers", () => {
        const header: SetlistTrack = { id: "h1", title: "Morning Service", type: "header" }
        render(<SetlistRow track={header} {...defaultProps} />)
        expect(screen.getByText("Morning Service")).toBeDefined()
        expect(screen.getByText("Morning Service").className).toContain("uppercase")
    })

    it("renders non-song items dimmed", () => {
        const prayer: SetlistTrack = { id: "p1", title: "Opening Prayer", type: "prayer" }
        render(<SetlistRow track={prayer} {...defaultProps} />)
        const row = screen.getByText("Opening Prayer").closest("div[class]")
        expect(row?.className).toContain("opacity-60")
    })

    it("highlights current position with brand background", () => {
        render(
            <SetlistRow track={baseSong} {...defaultProps} isCurrentPosition={true} />
        )
        const row = screen.getByText("Amazing Grace").closest("[role='button']")
        expect(row?.className).toContain("bg-brand/20")
        expect(row?.className).toContain("border-l-4")
    })

    it("interactive rows have button role and cursor-pointer", () => {
        render(<SetlistRow track={baseSong} {...defaultProps} />)
        const row = screen.getByRole("button")
        expect(row).toBeDefined()
        expect(row.className).toContain("cursor-pointer")
    })

    it("displays BPM when present", () => {
        render(<SetlistRow track={baseSong} {...defaultProps} />)
        expect(screen.getByText("120 BPM")).toBeDefined()
    })

    it("displays lead musician on second line", () => {
        render(<SetlistRow track={baseSong} {...defaultProps} />)
        expect(screen.getByText("Randy")).toBeDefined()
    })

    it("toggles notes on click", () => {
        const trackWithNotes: SetlistTrack = {
            ...baseSong,
            notes: "Play softly during verse 2",
        }
        render(<SetlistRow track={trackWithNotes} {...defaultProps} />)

        expect(screen.queryByText("Play softly during verse 2")).toBeNull()

        fireEvent.click(screen.getByRole("button"))

        expect(screen.getByText("Play softly during verse 2")).toBeDefined()
    })

    it("songs without keys render title without key badge", () => {
        const noKey: SetlistTrack = { ...baseSong, key: undefined }
        render(<SetlistRow track={noKey} {...defaultProps} />)
        expect(screen.queryByTestId("key-badge")).toBeNull()
        expect(screen.getByText("Amazing Grace")).toBeDefined()
    })
})
