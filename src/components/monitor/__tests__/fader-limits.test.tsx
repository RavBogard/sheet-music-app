import { describe, it, expect, vi, afterEach, beforeAll } from "vitest"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { FaderStrip } from "@/components/monitor/FaderStrip"
import { VerticalFaderStrip } from "@/components/monitor/VerticalFaderStrip"
import { CLAMP_NOTICE_MS } from "@/components/monitor/FaderLimit"

/**
 * BET-4 on the faders: the limit tick, the clamped-ack notice (3 s), and the
 * double-tap reset to the saved level (or 0.6), never above the limit.
 */

function doubleTap(el: Element) {
    fireEvent.pointerDown(el, { clientX: 10, clientY: 10, pointerId: 1 })
    fireEvent.pointerUp(el, { pointerId: 1 })
    fireEvent.pointerDown(el, { clientX: 10, clientY: 10, pointerId: 1 })
}

beforeAll(() => {
    // jsdom has no pointer capture.
    Element.prototype.setPointerCapture ??= () => {}
    Element.prototype.releasePointerCapture ??= () => {}
})

afterEach(() => vi.useRealTimers())

describe("fader limit tick", () => {
    it("draws a labelled tick at the cap on both faders, and none without a cap", () => {
        const { unmount } = render(<FaderStrip label="Vox" value={0.5} on onChange={vi.fn()} cap={0.7} />)
        expect(screen.getByTestId("fader-cap-tick")).toBeTruthy()
        expect(screen.getByRole("img", { name: /−2 dB/ })).toBeTruthy()
        unmount()
        render(<VerticalFaderStrip label="Vox" value={0.5} on onChange={vi.fn()} onMuteToggle={vi.fn()} cap={0.7} />)
        expect(screen.getByTestId("fader-cap-tick")).toBeTruthy()
    })

    it("no cap, no tick", () => {
        render(<FaderStrip label="Vox" value={0.5} on onChange={vi.fn()} />)
        expect(screen.queryByTestId("fader-cap-tick")).toBeNull()
    })
})

describe("clamped ack notice", () => {
    it("shows the limit in dB for 3 seconds after a clamp, and again on the next clamp", () => {
        vi.useFakeTimers()
        const { rerender } = render(<FaderStrip label="Vox" value={0.7} on onChange={vi.fn()} cap={0.7} clamp={null} />)
        expect(screen.queryByTestId("fader-clamp-note")).toBeNull()
        rerender(<FaderStrip label="Vox" value={0.7} on onChange={vi.fn()} cap={0.7} clamp={{ applied: 0.7, cap: 0.7, seq: 1 }} />)
        expect(screen.getByTestId("fader-clamp-note").textContent).toContain("−2 dB")
        act(() => {
            vi.advanceTimersByTime(CLAMP_NOTICE_MS + 10)
        })
        expect(screen.queryByTestId("fader-clamp-note")).toBeNull()
        rerender(<FaderStrip label="Vox" value={0.7} on onChange={vi.fn()} cap={0.7} clamp={{ applied: 0.7, cap: 0.7, seq: 2 }} />)
        expect(screen.getByTestId("fader-clamp-note")).toBeTruthy()
    })
})

describe("double-tap reset", () => {
    const track = (container: HTMLElement) => container.querySelector(".touch-none") as HTMLElement

    it("goes to the saved level", () => {
        const onChange = vi.fn()
        const { container } = render(<FaderStrip label="Vox" value={0.2} on onChange={onChange} homeLevel={0.66} cap={0.7} />)
        doubleTap(track(container))
        expect(onChange).toHaveBeenLastCalledWith(0.66)
    })

    it("goes to 0.6 when nothing is saved, never 0.75", () => {
        const onChange = vi.fn()
        const { container } = render(<VerticalFaderStrip label="Vox" value={0} on onChange={onChange} onMuteToggle={vi.fn()} />)
        doubleTap(track(container))
        expect(onChange).toHaveBeenLastCalledWith(0.6)
    })

    it("never goes above the limit", () => {
        const onChange = vi.fn()
        const { container } = render(<FaderStrip label="Vox" value={0.2} on onChange={onChange} homeLevel={0.9} cap={0.7} />)
        doubleTap(track(container))
        expect(onChange).toHaveBeenLastCalledWith(0.7)
    })
})
