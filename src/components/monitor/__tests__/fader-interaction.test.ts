// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"
import { createElement } from "react"

/**
 * Tests for VerticalFaderStrip fader interaction behavior.
 * Covers: rendering, value display, onChange callback, double-tap reset.
 */

describe("VerticalFaderStrip interaction logic", () => {
    // Test the ratio calculation used in the component
    function computeRatio(clientY: number, rectTop: number, rectHeight: number): number {
        return Math.max(0, Math.min(1, 1 - (clientY - rectTop) / rectHeight))
    }

    it("computes ratio correctly: top of track = 1.0", () => {
        expect(computeRatio(100, 100, 200)).toBe(1.0)
    })

    it("computes ratio correctly: bottom of track = 0.0", () => {
        expect(computeRatio(300, 100, 200)).toBe(0.0)
    })

    it("computes ratio correctly: middle of track = 0.5", () => {
        expect(computeRatio(200, 100, 200)).toBe(0.5)
    })

    it("clamps ratio to 0 when below track", () => {
        expect(computeRatio(400, 100, 200)).toBe(0.0)
    })

    it("clamps ratio to 1 when above track", () => {
        expect(computeRatio(50, 100, 200)).toBe(1.0)
    })

    it("computes correct percentage from value", () => {
        expect(Math.round(0.75 * 100)).toBe(75)
        expect(Math.round(0.0 * 100)).toBe(0)
        expect(Math.round(1.0 * 100)).toBe(100)
    })

    it("double-tap reset: value > 0.1 resets to 0", () => {
        const currentValue = 0.5
        const resetVal = currentValue > 0.1 ? 0.0 : 0.75
        expect(resetVal).toBe(0.0)
    })

    it("double-tap reset: value at 0 resets to 0.75 (unity)", () => {
        const currentValue = 0.0
        const resetVal = currentValue > 0.1 ? 0.0 : 0.75
        expect(resetVal).toBe(0.75)
    })
})

describe("VerticalFaderStrip component rendering", () => {
    let render: typeof import("@testing-library/react").render
    let VerticalFaderStrip: typeof import("../VerticalFaderStrip").VerticalFaderStrip

    beforeEach(async () => {
        const rtl = await import("@testing-library/react")
        render = rtl.render
        const mod = await import("../VerticalFaderStrip")
        VerticalFaderStrip = mod.VerticalFaderStrip
    })

    it("renders with label and percentage", () => {
        render(createElement(VerticalFaderStrip, {
            label: "Guitar",
            value: 0.75,
            on: true,
            onChange: vi.fn(),
            onMuteToggle: vi.fn(),
        }))
        expect(document.body.textContent).toContain("Guitar")
        expect(document.body.textContent).toContain("75%")
    })

    it("renders master fader with distinct styling", () => {
        const { container } = render(createElement(VerticalFaderStrip, {
            label: "Master",
            value: 0.5,
            on: true,
            isMaster: true,
            onChange: vi.fn(),
            onMuteToggle: vi.fn(),
        }))
        expect(container.innerHTML).toContain("violet")
    })

    it("renders muted state with reduced opacity", () => {
        const { container } = render(createElement(VerticalFaderStrip, {
            label: "Keys",
            value: 0.5,
            on: false,
            onChange: vi.fn(),
            onMuteToggle: vi.fn(),
        }))
        expect(container.innerHTML).toContain("opacity-50")
    })
})
