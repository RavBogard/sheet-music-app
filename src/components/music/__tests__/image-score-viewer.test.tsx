import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"

// Mock the music store — drive `zoom` (the only slice ImageScoreViewer reads).
let mockZoom = 1
vi.mock("@/lib/store", () => ({
    useMusicStore: (selector?: (s: { zoom: number }) => unknown) => {
        const state = { zoom: mockZoom }
        return selector ? selector(state) : state
    },
}))

import { ImageScoreViewer } from "../ImageScoreViewer"

beforeEach(() => {
    mockZoom = 1
})

describe("ImageScoreViewer", () => {
    it("WS-06: applies the store zoom to the image via CSS zoom", () => {
        mockZoom = 1.5
        render(<ImageScoreViewer url="/api/drive/file/img1" />)
        const img = screen.getByAltText("Chart")
        expect(img.style.zoom).toBe("1.5")
    })

    it("WS-06: zoom 1 keeps the object-contain fit baseline", () => {
        mockZoom = 1
        render(<ImageScoreViewer url="/api/drive/file/img1" />)
        const img = screen.getByAltText("Chart")
        expect(img.style.zoom).toBe("1")
        expect(img.className).toMatch(/object-contain/)
    })

    it("WS-06: reflects a restored per-device zoom (>1) on open", () => {
        mockZoom = 2
        render(<ImageScoreViewer url="/api/drive/file/img1" />)
        expect(screen.getByAltText("Chart").style.zoom).toBe("2")
    })

    it("renders the empty state when no url", () => {
        render(<ImageScoreViewer url="" />)
        expect(screen.getByText(/No chart to display/)).toBeTruthy()
        expect(screen.queryByAltText("Chart")).toBeNull()
    })

    it("WS-15: a load error shows an alert + >=44px Retry that returns to loading and re-attempts", () => {
        render(<ImageScoreViewer url="/api/drive/file/broken" />)
        const img = screen.getByAltText("Chart")
        expect(img.className).toMatch(/opacity-0/)

        fireEvent.error(img)
        expect(screen.getByRole("alert")).toBeTruthy()
        const retry = screen.getByRole("button", { name: /retry/i })
        expect(retry.className).toMatch(/(^|\s)h-11(\s|$)/)

        fireEvent.click(retry)
        expect(screen.queryByRole("alert")).toBeNull()

        const img2 = screen.getByAltText("Chart")
        fireEvent.load(img2)
        expect(img2.className).toMatch(/opacity-100/)
    })

    it("WS-15: resets to loading when the url changes", () => {
        const { rerender } = render(<ImageScoreViewer url="/api/drive/file/a" />)
        const img = screen.getByAltText("Chart")
        fireEvent.load(img)
        expect(screen.getByAltText("Chart").className).toMatch(/opacity-100/)

        rerender(<ImageScoreViewer url="/api/drive/file/b" />)
        expect(screen.getByAltText("Chart").className).toMatch(/opacity-0/)
    })
})
