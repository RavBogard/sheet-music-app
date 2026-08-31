import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { SetlistRow } from "../SetlistRow"
import { SetlistTrack } from "@/types/models"

vi.mock("@/lib/music-math", () => ({
    getTransposedKeyName: (key: string, semitones: number) => {
        if (semitones === 0) return key
        return `${key}t (${semitones})`
    },
}))

const defaultProps = {
    index: 0,
    isCurrentPosition: false,
    defaultTransposition: 0,
    isPublicView: false,
    isLeader: false,
    onSongTap: vi.fn(),
    onLeaderSetPosition: vi.fn(),
}

const longDescription =
    "The congregation rises for this moment and remains standing through the " +
    "conclusion of the reading, at which point the ark is closed."

describe("SetlistRow — liturgy outline rendering", () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it("renders the page number, performer, honoree, and description on a prayer row", () => {
        const track: SetlistTrack = {
            id: "p1",
            title: "Opening Prayer",
            type: "prayer",
            liturgyRef: { book: "crc-friday", folio: 12 },
            performer: "Congregation",
            honors: [{ name: "Rachel Cohen", note: "birthday — candle lighting" }],
            description: longDescription,
        }
        render(<SetlistRow track={track} {...defaultProps} />)

        expect(screen.getByTestId("folio").textContent).toContain("12")
        expect(screen.getByText(/^p\./)).toBeDefined()
        expect(screen.getByText("Congregation")).toBeDefined()
        expect(screen.getByText("Rachel Cohen")).toBeDefined()
        expect(screen.getByText(/birthday — candle lighting/)).toBeDefined()
        expect(screen.getByText(longDescription)).toBeDefined()
    })

    it("renders no page number and does not throw when liturgyRef is absent", () => {
        const track: SetlistTrack = {
            id: "p2",
            title: "Silent Meditation",
            type: "prayer",
        }
        expect(() => render(<SetlistRow track={track} {...defaultProps} />)).not.toThrow()
        expect(screen.queryByTestId("folio")).toBeNull()
        expect(screen.queryByText(/^p\./)).toBeNull()
    })

    it("renders the honoree's name on a header row with honors (not swallowed by the divider)", () => {
        const track: SetlistTrack = {
            id: "h1",
            title: "Torah Service",
            type: "header",
            honors: [{ name: "David Lazaroff", note: "aliyah" }],
        }
        render(<SetlistRow track={track} {...defaultProps} />)
        // Header-row honors render as a single joined string (name + note),
        // not separate elements per honoree — distinct from the per-row
        // outlineDetail treatment, which lists each honoree as its own <li>.
        expect(screen.getByText(/David Lazaroff/)).toBeDefined()
    })

    it("renders the page number on a header row with a liturgyRef", () => {
        const track: SetlistTrack = {
            id: "h2",
            title: "Torah Service",
            type: "header",
            liturgyRef: { book: "crc-friday", folio: 30 },
        }
        render(<SetlistRow track={track} {...defaultProps} />)
        expect(screen.getByTestId("folio").textContent).toContain("30")
    })

    it("leaves a song row unchanged — key badge and leadMusician/performer second line, no outline block", () => {
        const track: SetlistTrack = {
            id: "s1",
            title: "Amazing Grace",
            key: "C",
            type: "song",
            leadMusician: "Randy",
            fileId: "file-abc",
            liturgyRef: { book: "crc-friday", folio: 5 },
            honors: [{ name: "Should Not Appear" }],
            description: "Should not appear either",
        }
        render(<SetlistRow track={track} {...defaultProps} />)
        expect(screen.getByTestId("key-badge")).toBeDefined()
        expect(screen.getByText("Randy")).toBeDefined()
        expect(screen.queryByTestId("folio")).toBeNull()
        expect(screen.queryByText("Should Not Appear")).toBeNull()
        expect(screen.queryByText("Should not appear either")).toBeNull()
    })
})
