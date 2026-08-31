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

        // Highest-stakes field on the surface — assert the literal rendered
        // string, not a substring/regex pair that would still pass if a
        // regression split "p." from the digits or emitted "p. 1" + "2".
        // RTL's text normalizer collapses the &nbsp; to a plain space.
        expect(screen.getByText("p. 12")).toBeDefined()
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
        expect(screen.queryByText(/^p\.\s/)).toBeNull()
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

    // P4-5 ruling: sung liturgy is still liturgy — Mi Chamocha, Shalom Rav,
    // Oseh Shalom, Adonai S'fatai are all songs AND printed in the book.
    // A song row keeps everything it does today AND gains a folioBadge +
    // honors — but NOT description (track.notes already covers that role
    // on song rows).
    it("song row keeps its key badge and leadMusician/performer line, AND gains folio + honors, AND never renders description", () => {
        const track: SetlistTrack = {
            id: "s1",
            title: "Mi Chamocha",
            key: "C",
            type: "song",
            leadMusician: "Randy",
            fileId: "file-abc",
            liturgyRef: { book: "crc-friday", folio: 18 },
            honors: [{ name: "Rachel Cohen", note: "aliyah" }],
            description: "Should not appear on a song row",
        }
        render(<SetlistRow track={track} {...defaultProps} />)
        expect(screen.getByTestId("key-badge")).toBeDefined()
        expect(screen.getByText("Randy")).toBeDefined()
        expect(screen.getByText("p. 18")).toBeDefined()
        expect(screen.getByText("Rachel Cohen")).toBeDefined()
        expect(screen.getByText(/aliyah/)).toBeDefined()
        expect(screen.queryByText("Should not appear on a song row")).toBeNull()
    })

    it("song row falls back to performer when leadMusician is absent", () => {
        const track: SetlistTrack = {
            id: "s2",
            title: "Shalom Rav",
            type: "song",
            performer: "Cantor",
            fileId: "file-def",
        }
        render(<SetlistRow track={track} {...defaultProps} />)
        expect(screen.getByText("Cantor")).toBeDefined()
    })
})
