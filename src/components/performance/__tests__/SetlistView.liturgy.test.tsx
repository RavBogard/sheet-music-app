import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { SetlistView } from "../SetlistView"
import type { SetlistTrack } from "@/types/models"

vi.mock("../LiveDirectorGesture", () => ({
    LiveDirectorGesture: ({
        children,
    }: {
        children: (bag: { handlers: Record<string, unknown> }) => React.ReactNode
    }) => <>{children({ handlers: {} })}</>,
}))

const row = (t: Partial<SetlistTrack>): SetlistTrack =>
    ({ id: t.title, title: "x", ...t }) as SetlistTrack

const TRACKS: SetlistTrack[] = [
    row({ title: "Fiddley Tune", type: "song", fileId: "a" }),
    row({ title: "Hareini", type: "prayer", fixed: true, liturgyRef: { book: "crc-friday", folio: 3 } }),
    row({ title: "Candle Blessing", type: "prayer", fixed: true, liturgyRef: { book: "crc-friday", folio: 5 } }),
    row({ title: "L'cha Dodi", type: "song", fileId: "b" }),
]

const props = {
    tracks: TRACKS,
    currentTrackIndex: -1,
    defaultTransposition: 0,
    isPublicView: false,
    isLeader: false,
    onSongTap: () => {},
    onLeaderSetPosition: () => {},
}

describe("Perform mode — folding the fixed liturgy", () => {
    it("draws every row when folding is off", () => {
        render(<SetlistView {...props} />)
        expect(screen.getByText("Hareini")).toBeDefined()
        expect(screen.getByText("Candle Blessing")).toBeDefined()
        expect(screen.queryByRole("button", { name: /liturgy rows/i })).toBeNull()
    })

    it("folds a stretch into one bar that says what is behind it", () => {
        render(<SetlistView {...props} collapseLiturgy />)
        // The songs are untouched — that is the whole point.
        expect(screen.getByText("Fiddley Tune")).toBeDefined()
        expect(screen.getByText("L'cha Dodi")).toBeDefined()
        expect(screen.queryByText("Hareini")).toBeNull()
        expect(screen.queryByText("Candle Blessing")).toBeNull()
        // Nothing is hidden silently: the count and the pages stay on screen.
        expect(screen.getByText("2 liturgy rows")).toBeDefined()
        expect(screen.getByText(/pp\.\s*3–5/)).toBeDefined()
    })

    it("names a single folded row rather than counting to one", () => {
        render(
            <SetlistView
                {...props}
                tracks={[TRACKS[0], TRACKS[1], TRACKS[3]]}
                collapseLiturgy
            />,
        )
        const bar = screen.getByRole("button", { name: /Hareini/ })
        expect(bar).toBeDefined()
        expect(screen.getByText(/p\.\s*3/)).toBeDefined()
    })

    it("opens on tap and closes again", () => {
        render(<SetlistView {...props} collapseLiturgy />)
        const bar = screen.getByRole("button", { name: /2 liturgy rows/ })
        expect(bar.getAttribute("aria-expanded")).toBe("false")

        fireEvent.click(bar)
        expect(screen.getByText("Hareini")).toBeDefined()
        expect(screen.getByText("Candle Blessing")).toBeDefined()
        const opened = screen.getByRole("button", { name: /liturgy rows/ })
        expect(opened.getAttribute("aria-expanded")).toBe("true")
        // `aria-controls` points at a region that exists.
        const controls = opened.getAttribute("aria-controls") as string
        expect(document.getElementById(controls)).not.toBeNull()

        fireEvent.click(opened)
        expect(screen.queryByText("Hareini")).toBeNull()
    })

    it("never folds a fixed row that carries a chart", () => {
        render(
            <SetlistView
                {...props}
                tracks={[row({ title: "Bar'chu", type: "song", fixed: true, fileId: "c" })]}
                collapseLiturgy
            />,
        )
        expect(screen.getByText("Bar'chu")).toBeDefined()
        expect(screen.queryByRole("button", { name: /liturgy row/i })).toBeNull()
    })

    it("gives the bar a full-width tap target", () => {
        render(<SetlistView {...props} collapseLiturgy />)
        const bar = screen.getByRole("button", { name: /2 liturgy rows/ })
        // 44px on an iPad held at arm's length; `w-full` so the target is the
        // whole line, not the chevron.
        expect(bar.className).toContain("min-h-11")
        expect(bar.className).toContain("w-full")
        expect(bar.className).toContain("cursor-pointer")
    })
})
