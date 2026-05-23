import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { QueueRow } from "../SetlistDrawer"
import type { QueueItem } from "@/lib/store"

// cowork #6 (option b): the perform-nav drawer must render a bonded prayer/reading
// queue item as a full, tappable chart-bearing row (FileMusic glyph + full opacity
// + "Open chart:" label) — not the passive dimmed label it used to get. Songs are
// unchanged; an unbonded flow item stays passive. QueueRow is the extracted unit.

function makeItem(overrides?: Partial<QueueItem>): QueueItem {
    return {
        name: "Untitled",
        fileId: "file-1",
        type: "pdf",
        ...overrides,
    } as QueueItem
}

const baseProps = {
    globalIndex: 0,
    isCurrent: false,
    onOpen: vi.fn(),
}

describe("SetlistDrawer/QueueRow — bonded non-song chart affordance", () => {
    beforeEach(() => vi.clearAllMocks())

    it("a bonded prayer item shows the chart glyph and an 'Open chart:' label", () => {
        render(
            <QueueRow
                {...baseProps}
                track={makeItem({ name: "Maariv Arevim", trackType: "prayer", fileId: "file-maariv" })}
            />,
        )
        const btn = screen.getByRole("button", { name: /Open chart: Maariv Arevim/ })
        expect(btn).toBeDefined()
        expect(screen.getByTestId("queue-row-chart-glyph")).toBeDefined()
        // Openable flow item is NOT dimmed — it reads as tappable.
        expect(btn.className).not.toContain("opacity-60")
    })

    it("a bonded prayer item opens on tap", () => {
        const onOpen = vi.fn()
        render(
            <QueueRow
                {...baseProps}
                onOpen={onOpen}
                track={makeItem({ name: "Maariv Arevim", trackType: "prayer", fileId: "file-maariv" })}
            />,
        )
        fireEvent.click(screen.getByRole("button", { name: /Open chart: Maariv Arevim/ }))
        expect(onOpen).toHaveBeenCalledTimes(1)
    })

    it("a reading item also gets the full affordance", () => {
        render(
            <QueueRow
                {...baseProps}
                track={makeItem({ name: "Torah Reading", trackType: "reading", fileId: "file-torah" })}
            />,
        )
        expect(screen.getByRole("button", { name: /Open chart: Torah Reading/ })).toBeDefined()
        expect(screen.getByTestId("queue-row-chart-glyph")).toBeDefined()
    })

    it("a song item is unchanged — no chart glyph, no 'Open chart' label", () => {
        render(
            <QueueRow
                {...baseProps}
                track={makeItem({ name: "Amazing Grace", trackType: "song", fileId: "file-grace" })}
            />,
        )
        expect(screen.queryByTestId("queue-row-chart-glyph")).toBeNull()
        expect(screen.queryByRole("button", { name: /Open chart/ })).toBeNull()
        expect(screen.getByText("Amazing Grace")).toBeDefined()
    })

    it("an UNBONDED flow item stays passive (dimmed, no glyph, no label)", () => {
        render(
            <QueueRow
                {...baseProps}
                track={makeItem({ name: "Silent Meditation", trackType: "prayer", fileId: "" })}
            />,
        )
        expect(screen.queryByTestId("queue-row-chart-glyph")).toBeNull()
        expect(screen.queryByRole("button", { name: /Open chart/ })).toBeNull()
        const btn = screen.getByRole("button")
        expect(btn.className).toContain("opacity-60")
    })

    it("the current openable flow item is highlighted, not dimmed", () => {
        render(
            <QueueRow
                {...baseProps}
                isCurrent={true}
                track={makeItem({ name: "Maariv Arevim", trackType: "prayer", fileId: "file-maariv" })}
            />,
        )
        const btn = screen.getByRole("button", { name: /Open chart: Maariv Arevim/ })
        expect(btn.className).not.toContain("opacity-60")
        expect(btn.className).toContain("bg-blue-600")
    })
})
