import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { FaderStrip } from "@/components/monitor/FaderStrip"

describe("FaderStrip stale cue (C-6)", () => {
    it("shows a non-color staleness cue + amber readout when stale", () => {
        render(<FaderStrip label="Kick" value={0.5} on={true} stale={true} onChange={vi.fn()} />)
        // Clock glyph carries an aria-label (not color alone)
        expect(screen.getByTestId("fader-stale-cue")).toBeTruthy()
        expect(screen.getByLabelText(/may be out of date/i)).toBeTruthy()
        // % readout tinted amber
        expect(screen.getByText("50%").className).toContain("text-yellow-500")
    })

    it("shows no cue and a normal readout when fresh", () => {
        render(<FaderStrip label="Kick" value={0.5} on={true} stale={false} onChange={vi.fn()} />)
        expect(screen.queryByTestId("fader-stale-cue")).toBeNull()
        expect(screen.getByText("50%").className).toContain("text-zinc-400")
    })

    it("stays interactive (non-blocking) when stale — the slider is not disabled", () => {
        const { container } = render(
            <FaderStrip label="Kick" value={0.5} on={true} stale={true} onChange={vi.fn()} />
        )
        // The DisconnectedOverlay disables interaction for HARD offline; a merely
        // stale value must NOT — the musician can still drag to send a command.
        // (The label/% overlay carries pointer-events-none by design so taps
        // pass THROUGH to the slider; assert the slider itself stays live.)
        const slider = container.querySelector(".cursor-pointer")
        expect(slider).toBeTruthy()
        expect(slider?.className).not.toContain("pointer-events-none")
    })

    it("defaults to no cue when the stale prop is omitted (back-compat)", () => {
        render(<FaderStrip label="Kick" value={0.5} on={true} onChange={vi.fn()} />)
        expect(screen.queryByTestId("fader-stale-cue")).toBeNull()
    })
})
