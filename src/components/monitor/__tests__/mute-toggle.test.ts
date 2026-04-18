import { describe, it, expect, vi, beforeEach } from "vitest"
import { createElement } from "react"

/**
 * Tests for VerticalFaderStrip mute toggle behavior.
 * Covers: mute button click fires onMuteToggle, visual mute state.
 */

describe("VerticalFaderStrip mute toggle", () => {
    let render: typeof import("@testing-library/react").render
    let fireEvent: typeof import("@testing-library/react").fireEvent
    let VerticalFaderStrip: typeof import("../VerticalFaderStrip").VerticalFaderStrip

    beforeEach(async () => {
        const rtl = await import("@testing-library/react")
        render = rtl.render
        fireEvent = rtl.fireEvent
        const mod = await import("../VerticalFaderStrip")
        VerticalFaderStrip = mod.VerticalFaderStrip
    })

    it("calls onMuteToggle when mute button is clicked", () => {
        const onMuteToggle = vi.fn()
        const { container } = render(createElement(VerticalFaderStrip, {
            label: "Vocals",
            value: 0.5,
            on: true,
            onChange: vi.fn(),
            onMuteToggle,
        }))
        const muteBtn = container.querySelector("[data-testid='mute-toggle']")
        expect(muteBtn).toBeTruthy()
        fireEvent.click(muteBtn!)
        expect(onMuteToggle).toHaveBeenCalledTimes(1)
    })

    it("shows muted visual state when on=false", () => {
        const { container } = render(createElement(VerticalFaderStrip, {
            label: "Bass",
            value: 0.5,
            on: false,
            onChange: vi.fn(),
            onMuteToggle: vi.fn(),
        }))
        const muteBtn = container.querySelector("[data-testid='mute-toggle']")
        expect(muteBtn).toBeTruthy()
        expect(muteBtn!.className).toContain("red")
    })

    it("shows unmuted visual state when on=true", () => {
        const { container } = render(createElement(VerticalFaderStrip, {
            label: "Guitar",
            value: 0.5,
            on: true,
            onChange: vi.fn(),
            onMuteToggle: vi.fn(),
        }))
        const muteBtn = container.querySelector("[data-testid='mute-toggle']")
        expect(muteBtn).toBeTruthy()
        expect(muteBtn!.className).toContain("green")
    })
})
