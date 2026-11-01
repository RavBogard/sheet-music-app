import "@testing-library/jest-dom"
import { describe, it, expect, afterEach } from "vitest"
import { useRef } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { useModalSurface } from "../use-modal-surface"
import { useChartKeyScroll, planKeyScroll, LINE_SCROLL_PX } from "../use-chart-key-scroll"

/**
 * Audit 2026-10-31 (a11y P1/P2): the chart viewer is a modal for keyboard and
 * screen-reader users, and the keyboard scrolls the open chart.
 */

function Surface({ withKeys = false, suppressed = false }: { withKeys?: boolean; suppressed?: boolean }) {
    const rootRef = useRef<HTMLDivElement>(null)
    const scrollRef = useRef<HTMLDivElement>(null)
    useModalSurface(rootRef, { initialFocusRef: scrollRef })
    useChartKeyScroll({
        getContainer: () => (withKeys ? scrollRef.current : null),
        getSurface: () => rootRef.current,
        viewerKind: "text",
        isSuppressed: () => suppressed,
    })
    return (
        <div ref={rootRef} role="dialog" aria-modal="true" aria-label="Chart" tabIndex={-1}>
            <div ref={scrollRef} tabIndex={0} data-testid="scroller" aria-label="Chart pages">
                <div data-text-score="">chart</div>
            </div>
            <button type="button">First</button>
            <button type="button">Last</button>
        </div>
    )
}

function Page({ open, withKeys, suppressed }: { open: boolean; withKeys?: boolean; suppressed?: boolean }) {
    return (
        <>
            <div data-testid="shell">
                <button type="button" data-testid="opener">Open row</button>
            </div>
            <div aria-live="polite" data-testid="live" />
            {open && <Surface withKeys={withKeys} suppressed={suppressed} />}
        </>
    )
}

function setScroll(el: HTMLElement, m: { clientHeight: number; scrollHeight: number }) {
    Object.defineProperty(el, "clientHeight", { configurable: true, value: m.clientHeight })
    Object.defineProperty(el, "scrollHeight", { configurable: true, value: m.scrollHeight })
}

afterEach(cleanup)

describe("useModalSurface", () => {
    it("makes the page behind inert, leaves live regions alone, and moves focus in", () => {
        const { rerender } = render(<Page open={false} />)
        screen.getByTestId("opener").focus()
        rerender(<Page open />)
        expect(screen.getByTestId("shell")).toHaveAttribute("inert")
        expect(screen.getByTestId("live")).not.toHaveAttribute("inert")
        expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true")
        expect(document.activeElement).toBe(screen.getByTestId("scroller"))
    })

    it("restores focus to the opener and removes inert on close", () => {
        const { rerender } = render(<Page open={false} />)
        const opener = screen.getByTestId("opener")
        opener.focus()
        rerender(<Page open />)
        rerender(<Page open={false} />)
        expect(screen.getByTestId("shell")).not.toHaveAttribute("inert")
        expect(document.activeElement).toBe(opener)
    })

    it("wraps Tab and Shift+Tab inside the surface", () => {
        render(<Page open />)
        const last = screen.getByRole("button", { name: "Last" })
        last.focus()
        fireEvent.keyDown(document, { key: "Tab" })
        expect(document.activeElement).toBe(screen.getByTestId("scroller"))
        fireEvent.keyDown(document, { key: "Tab", shiftKey: true })
        expect(document.activeElement).toBe(last)
    })
})

describe("chart keyboard scrolling", () => {
    it("plans line, page, Space, Home and End moves, clamped to the chart", () => {
        const m = { scrollTop: 100, clientHeight: 1000, scrollHeight: 3000 }
        expect(planKeyScroll("ArrowDown", false, m)).toBe(100 + LINE_SCROLL_PX)
        expect(planKeyScroll("ArrowUp", false, m)).toBe(100 - LINE_SCROLL_PX)
        expect(planKeyScroll("PageDown", false, m)).toBe(950)
        expect(planKeyScroll(" ", false, m)).toBe(950)
        expect(planKeyScroll(" ", true, m)).toBe(0)
        expect(planKeyScroll("PageUp", false, m)).toBe(0)
        expect(planKeyScroll("End", false, m)).toBe(2000)
        expect(planKeyScroll("Home", false, m)).toBe(0)
        expect(planKeyScroll("PageDown", false, { ...m, scrollTop: 1900 })).toBe(2000)
        // Not scroll keys: left to the page (no chart-to-chart turns here).
        expect(planKeyScroll("ArrowRight", false, m)).toBeNull()
        expect(planKeyScroll("Enter", false, m)).toBeNull()
    })

    it("PageDown on the chart scrolls the chart's scroller and is consumed", () => {
        render(<Page open withKeys />)
        const scroller = screen.getByTestId("scroller")
        setScroll(scroller, { clientHeight: 1000, scrollHeight: 3000 })
        const ev = fireEvent.keyDown(scroller, { key: "PageDown" })
        expect(ev).toBe(false) // preventDefault called
        expect(scroller.scrollTop).toBe(850)
    })

    it("leaves keys on buttons alone (Space still presses the button)", () => {
        render(<Page open withKeys />)
        const scroller = screen.getByTestId("scroller")
        setScroll(scroller, { clientHeight: 1000, scrollHeight: 3000 })
        fireEvent.keyDown(screen.getByRole("button", { name: "First" }), { key: " " })
        expect(scroller.scrollTop).toBe(0)
    })

    it("does nothing while a menu or sheet owns the screen", () => {
        render(<Page open withKeys suppressed />)
        const scroller = screen.getByTestId("scroller")
        setScroll(scroller, { clientHeight: 1000, scrollHeight: 3000 })
        fireEvent.keyDown(scroller, { key: "ArrowDown" })
        expect(scroller.scrollTop).toBe(0)
    })
})
