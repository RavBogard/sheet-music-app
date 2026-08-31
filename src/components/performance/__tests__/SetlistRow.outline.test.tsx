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

    // The folioBadge comment calls the fixed `w-16 text-right` column out as the
    // reason folios line up down the list. A bonded prayer/reading row rendered
    // {folioBadge} BEFORE its trailing ChevronRight, which pushed that row's
    // folio ~30px (h-5 icon + gap-2.5) left of every other row type's — the one
    // column the eye hunts for mid-service, out of alignment on exactly the
    // rows that carry a page number.
    describe("folio column alignment — the badge is the last element on its line", () => {
        const lastOnItsLine = (testId = "folio") => {
            const badge = screen.getByTestId(testId)
            return {
                badge,
                next: badge.nextElementSibling,
                prev: badge.previousElementSibling,
            }
        }

        it("bonded prayer/reading row draws the chevron BEFORE the folio", () => {
            const track: SetlistTrack = {
                id: "b1",
                title: "Adonai S'fatai",
                type: "prayer",
                fileId: "file-bonded",
                liturgyRef: { book: "crc-friday", folio: 42 },
            }
            render(<SetlistRow track={track} {...defaultProps} />)

            const { next, prev } = lastOnItsLine()
            // Nothing after the badge → it owns the right edge of the line.
            expect(next).toBeNull()
            // …and the affordance chevron is what precedes it.
            expect(prev).not.toBeNull()
            expect(prev!.tagName.toLowerCase()).toBe("svg")
        })

        it.each([
            [
                "song",
                {
                    id: "a1",
                    title: "Mi Chamocha",
                    key: "C",
                    type: "song",
                    fileId: "file-song",
                    bpm: 92,
                    liturgyRef: { book: "crc-friday", folio: 42 },
                } as SetlistTrack,
            ],
            [
                "passive prayer (no bonded chart)",
                {
                    id: "a2",
                    title: "Silent Prayer",
                    type: "prayer",
                    liturgyRef: { book: "crc-friday", folio: 42 },
                } as SetlistTrack,
            ],
            [
                "bonded prayer (chart + chevron)",
                {
                    id: "a3",
                    title: "Bar'chu",
                    type: "prayer",
                    fileId: "file-bonded",
                    liturgyRef: { book: "crc-friday", folio: 42 },
                } as SetlistTrack,
            ],
        ])("%s row ends its line with the folio badge", (_label, track) => {
            render(<SetlistRow track={track} {...defaultProps} />)
            const { badge, next } = lastOnItsLine()
            expect(next).toBeNull()
            // Same fixed-width right-aligned column on every row type — this is
            // what makes the right edge identical without measuring layout.
            expect(badge.className).toContain("w-16")
            expect(badge.className).toContain("text-right")
        })

        it("header row's folio is also last on its line", () => {
            const track: SetlistTrack = {
                id: "a4",
                title: "Torah Service",
                type: "header",
                liturgyRef: { book: "crc-friday", folio: 42 },
            }
            render(<SetlistRow track={track} {...defaultProps} />)
            expect(lastOnItsLine().next).toBeNull()
        })
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
