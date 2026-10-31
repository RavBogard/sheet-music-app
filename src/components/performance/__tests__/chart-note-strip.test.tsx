import { describe, it, expect, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { ChartNoteStrip } from "../ChartNoteStrip"
import { SongNavigation } from "../SongNavigation"
import { useMusicStore, type QueueItem } from "@/lib/store"

// PERF-11: the note line on the open chart and "Next" in SongNavigation.

describe("ChartNoteStrip", () => {
    it("renders nothing when the row has no note and no Vocal Lead", () => {
        const { container } = render(<ChartNoteStrip notes="  " />)
        expect(container.innerHTML).toBe("")
    })

    it("shows the note and the Vocal Lead on one line, and expands on tap", () => {
        render(<ChartNoteStrip notes="Repeat the bridge twice" vocalLead="Randy" />)
        const strip = screen.getByTestId("chart-note-strip")
        expect(screen.getByTestId("chart-note-strip-note").textContent).toContain("Repeat the bridge twice")
        expect(screen.getByTestId("chart-note-strip-lead").textContent).toContain("Randy")
        expect(strip.getAttribute("aria-expanded")).toBe("false")
        expect(screen.getByTestId("chart-note-strip-text").className).toContain("truncate")

        fireEvent.click(strip)
        expect(strip.getAttribute("aria-expanded")).toBe("true")
        expect(screen.getByTestId("chart-note-strip-text").className).not.toContain("truncate")

        fireEvent.click(strip)
        expect(strip.getAttribute("aria-expanded")).toBe("false")
    })

    it("a note that appears mid-read shows as a pill (no layout shift); the musician opens it", () => {
        const { rerender } = render(<ChartNoteStrip />)
        expect(screen.queryByTestId("chart-note-strip")).toBeNull()
        rerender(<ChartNoteStrip notes="Key change to D" />)
        expect(screen.queryByTestId("chart-note-strip")).toBeNull()
        fireEvent.click(screen.getByTestId("chart-note-pill"))
        expect(screen.getByTestId("chart-note-strip-note").textContent).toContain("Key change to D")
    })

    it("keeps its height reserved when the note is removed mid-read", () => {
        const { rerender } = render(<ChartNoteStrip notes="Soft start" />)
        rerender(<ChartNoteStrip />)
        expect(screen.getByTestId("chart-note-strip-reserved")).not.toBeNull()
    })

    it("shows only what exists", () => {
        const { rerender } = render(<ChartNoteStrip vocalLead="David" />)
        expect(screen.getByTestId("chart-note-strip-lead")).not.toBeNull()
        expect(screen.queryByTestId("chart-note-strip-note")).toBeNull()
        rerender(<ChartNoteStrip notes="Soft start" />)
        expect(screen.queryByTestId("chart-note-strip-lead")).toBeNull()
        expect(screen.getByTestId("chart-note-strip-note")).not.toBeNull()
    })
})

describe("SongNavigation: Next", () => {
    const item = (name: string, fileId: string, key?: string): QueueItem => ({ name, fileId, type: "pdf", key })

    beforeEach(() => {
        useMusicStore.setState({
            playbackQueue: [item("Song A", "a", "G"), item("Song B", "b", "Dm"), item("Song C", "c")],
            queueIndex: 0,
        })
    })

    it("shows the next song with its key", () => {
        render(<SongNavigation />)
        const next = screen.getByTestId("song-nav-next")
        expect(next.textContent).toContain("Song B")
        expect(next.textContent).toContain("Dm")
    })

    it("shows the PLAYED key: the leader's per-track transposition applied", () => {
        useMusicStore.setState({
            playbackQueue: [item("Song A", "a", "G"), { ...item("Song B", "b", "D"), transposition: 2 }],
            queueIndex: 0,
        })
        render(<SongNavigation />)
        expect(screen.getByTestId("song-nav-next").textContent).toContain("(E)")
    })

    it("shows the title alone when the next song has no key, and nothing on the last song", () => {
        useMusicStore.setState({ queueIndex: 1 })
        const { unmount } = render(<SongNavigation />)
        expect(screen.getByTestId("song-nav-next").textContent).toContain("Song C")
        expect(screen.getByTestId("song-nav-next").textContent).not.toContain("(")
        unmount()

        useMusicStore.setState({ queueIndex: 2 })
        render(<SongNavigation />)
        expect(screen.queryByTestId("song-nav-next")).toBeNull()
    })
})
