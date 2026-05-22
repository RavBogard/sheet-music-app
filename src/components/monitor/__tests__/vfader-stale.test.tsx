import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { VerticalFaderStrip } from "@/components/monitor/VerticalFaderStrip"

/**
 * C-6 remainder: the perform-toolbar's VerticalFaderStrip must carry the same
 * honest staleness cue the main /monitor FaderStrip got in P1-C — color-not-alone
 * (Clock glyph + aria-label + amber readout), non-blocking (slider stays usable).
 */
describe("VerticalFaderStrip stale cue (C-6 parity)", () => {
    const baseProps = { label: "Kick", value: 0.5, on: true, onChange: vi.fn(), onMuteToggle: vi.fn() }

    it("shows a non-color staleness cue + amber readout when stale", () => {
        render(<VerticalFaderStrip {...baseProps} stale={true} />)
        expect(screen.getByTestId("vfader-stale-cue")).toBeTruthy()
        expect(screen.getByLabelText(/may be out of date/i)).toBeTruthy()
        expect(screen.getByText("50%").className).toContain("text-yellow-500")
    })

    it("shows no cue and a normal readout when fresh", () => {
        render(<VerticalFaderStrip {...baseProps} stale={false} />)
        expect(screen.queryByTestId("vfader-stale-cue")).toBeNull()
        expect(screen.getByText("50%").className).not.toContain("text-yellow-500")
    })

    it("defaults to no cue when the stale prop is omitted (back-compat)", () => {
        render(<VerticalFaderStrip {...baseProps} />)
        expect(screen.queryByTestId("vfader-stale-cue")).toBeNull()
    })

    it("stays interactive when stale — the slider is not disabled", () => {
        const { container } = render(<VerticalFaderStrip {...baseProps} stale={true} />)
        const slider = container.querySelector('[role="slider"]')
        expect(slider).toBeTruthy()
        expect(slider?.className).not.toContain("pointer-events-none")
    })
})
