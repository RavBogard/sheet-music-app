import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import {
    classifyTap,
    directionForZone,
    isDoubleTap,
    isZoomedPastFit,
    planTurn,
    zoneFor,
    DOUBLE_TAP_MS,
    SCROLL_QUIET_MS,
    type TapContext,
} from "../edge-tap-zones"
import { useEdgeTapZones, type EdgeTapZoneOptions } from "../use-edge-tap-zones"

// PERF-05: edge tap zones. The pure classification is tested directly; the
// hook test checks the wiring (timing, double-tap, suppression, scroll/next).

const AREA = { left: 0, width: 900 }
const ctx = (over: Partial<TapContext> = {}): TapContext => ({
    multiTouch: false,
    maxMovePx: 0,
    zoomedIn: false,
    suppressed: false,
    isRtl: false,
    msSinceScroll: Infinity,
    ...over,
})
const tap = (x: number, ms = 80, dx = 0) =>
    [{ x, y: 400, t: 1000 }, { x: x + dx, y: 400, t: 1000 + ms }] as const

describe("zoneFor / directionForZone", () => {
    it("splits the area into thirds", () => {
        expect(zoneFor(10, 0, 900)).toBe("left")
        expect(zoneFor(299, 0, 900)).toBe("left")
        expect(zoneFor(450, 0, 900)).toBe("middle")
        expect(zoneFor(600, 0, 900)).toBe("right")
        expect(zoneFor(890, 0, 900)).toBe("right")
        expect(zoneFor(150, 100, 900)).toBe("left")
        expect(zoneFor(10, 0, 0)).toBe("middle")
    })

    it("LTR: right is forward, left is back; middle does nothing", () => {
        expect(directionForZone("right", false)).toBe("forward")
        expect(directionForZone("left", false)).toBe("back")
        expect(directionForZone("middle", false)).toBeNull()
    })

    it("RTL: left is forward, right is back", () => {
        expect(directionForZone("left", true)).toBe("forward")
        expect(directionForZone("right", true)).toBe("back")
        expect(directionForZone("middle", true)).toBeNull()
    })
})

describe("classifyTap", () => {
    it("a short still tap in an edge third turns", () => {
        expect(classifyTap(...tap(850), AREA, ctx())).toBe("forward")
        expect(classifyTap(...tap(50), AREA, ctx())).toBe("back")
        expect(classifyTap(...tap(450), AREA, ctx())).toBeNull()
    })

    it("RTL flips the edges", () => {
        expect(classifyTap(...tap(50), AREA, ctx({ isRtl: true }))).toBe("forward")
        expect(classifyTap(...tap(850), AREA, ctx({ isRtl: true }))).toBe("back")
    })

    it("ignores drags and scrolls (over 10px of movement)", () => {
        expect(classifyTap(...tap(850, 80, 11), AREA, ctx())).toBeNull()
        expect(classifyTap(...tap(850, 80, 10), AREA, ctx())).toBe("forward")
        // moved away and came back: the furthest point counts
        expect(classifyTap(...tap(850), AREA, ctx({ maxMovePx: 30 }))).toBeNull()
    })

    it("ignores presses over 300ms (so a leader long-press never turns a page)", () => {
        expect(classifyTap(...tap(850, 301), AREA, ctx())).toBeNull()
        expect(classifyTap(...tap(850, 300), AREA, ctx())).toBe("forward")
        expect(classifyTap(...tap(850, 600), AREA, ctx())).toBeNull()
    })

    it("ignores pinch-zoom, zoomed-in charts and suppressed states", () => {
        expect(classifyTap(...tap(850), AREA, ctx({ multiTouch: true }))).toBeNull()
        expect(classifyTap(...tap(850), AREA, ctx({ zoomedIn: true }))).toBeNull()
        expect(classifyTap(...tap(850), AREA, ctx({ suppressed: true }))).toBeNull()
    })
})

describe("scroll quiet window (S3)", () => {
    it("ignores a tap that stops a scroll (within 150ms of the last scroll event)", () => {
        expect(classifyTap(...tap(850), AREA, ctx({ msSinceScroll: 20 }))).toBeNull()
        expect(classifyTap(...tap(850), AREA, ctx({ msSinceScroll: SCROLL_QUIET_MS - 1 }))).toBeNull()
        expect(classifyTap(...tap(850), AREA, ctx({ msSinceScroll: SCROLL_QUIET_MS }))).toBe("forward")
    })
})

describe("isZoomedPastFit (S3)", () => {
    it("is zoomed only when content is wider than the viewport or pinch-zoomed", () => {
        expect(isZoomedPastFit({ scrollWidth: 900, clientWidth: 900 }, 1)).toBe(false)
        expect(isZoomedPastFit({ scrollWidth: 901, clientWidth: 900 }, 1)).toBe(false)
        expect(isZoomedPastFit({ scrollWidth: 1400, clientWidth: 900 }, 1)).toBe(true)
        expect(isZoomedPastFit({ scrollWidth: 900, clientWidth: 900 }, 1.5)).toBe(true)
        expect(isZoomedPastFit({ scrollWidth: 0, clientWidth: 0 }, undefined)).toBe(false)
    })
})

describe("isDoubleTap", () => {
    it("is true only within the double-tap window", () => {
        expect(isDoubleTap(null, 1000)).toBe(false)
        expect(isDoubleTap(1000, 1000 + DOUBLE_TAP_MS)).toBe(true)
        expect(isDoubleTap(1000, 1001 + DOUBLE_TAP_MS)).toBe(false)
    })
})

describe("planTurn", () => {
    const READY = { ready: true }
    const m = (scrollTop: number) => ({ scrollTop, clientHeight: 1000, scrollHeight: 3000 })

    it("does nothing until the viewer has rendered and its scroller is measured (S2)", () => {
        // a loading or failed chart reads as "at the bottom"; it must not skip ahead
        expect(planTurn("forward", { scrollTop: 0, clientHeight: 1000, scrollHeight: 1000 }, { ready: false })).toEqual({ kind: "none" })
        expect(planTurn("back", m(0), { ready: false })).toEqual({ kind: "none" })
        expect(planTurn("forward", { scrollTop: 0, clientHeight: 0, scrollHeight: 0 }, READY)).toEqual({ kind: "none" })
        expect(planTurn("forward", { scrollTop: 0, clientHeight: 1000, scrollHeight: 0 }, READY)).toEqual({ kind: "none" })
    })

    it("forward scrolls about 85% of the viewport, clamped to the bottom", () => {
        expect(planTurn("forward", m(0), READY)).toEqual({ kind: "scroll", top: 850 })
        expect(planTurn("forward", m(1500), READY)).toEqual({ kind: "scroll", top: 2000 })
    })

    it("forward at the bottom goes to the next chart", () => {
        expect(planTurn("forward", m(2000), READY)).toEqual({ kind: "next-chart" })
        expect(planTurn("forward", m(1999), READY)).toEqual({ kind: "next-chart" })
        // a chart that fits on screen
        expect(planTurn("forward", { scrollTop: 0, clientHeight: 1000, scrollHeight: 1000 }, READY)).toEqual({ kind: "next-chart" })
    })

    it("back scrolls up, and at the top goes to the previous chart", () => {
        expect(planTurn("back", m(2000), READY)).toEqual({ kind: "scroll", top: 1150 })
        expect(planTurn("back", m(400), READY)).toEqual({ kind: "scroll", top: 0 })
        expect(planTurn("back", m(0), READY)).toEqual({ kind: "previous-chart" })
    })
})

// ── Hook wiring ─────────────────────────────────────────────────────────────

function pointer(type: string, x: number, opts: { id?: number; time?: number } = {}) {
    const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: 400, button: 0 })
    Object.defineProperty(e, "pointerId", { value: opts.id ?? 1 })
    Object.defineProperty(e, "pointerType", { value: "touch" })
    Object.defineProperty(e, "timeStamp", { value: opts.time ?? 0 })
    return e
}

interface Metrics { scrollTop: number; clientHeight: number; scrollHeight: number; scrollWidth?: number; clientWidth?: number }
const TOP: Metrics = { scrollTop: 0, clientHeight: 1000, scrollHeight: 3000 }
const BOTTOM: Metrics = { scrollTop: 2000, clientHeight: 1000, scrollHeight: 3000 }

function measure(el: HTMLElement, m: Metrics) {
    Object.defineProperty(el, "clientHeight", { value: m.clientHeight, configurable: true })
    Object.defineProperty(el, "scrollHeight", { value: m.scrollHeight, configurable: true })
    Object.defineProperty(el, "clientWidth", { value: m.clientWidth ?? 900, configurable: true })
    Object.defineProperty(el, "scrollWidth", { value: m.scrollWidth ?? 900, configurable: true })
    el.scrollTop = m.scrollTop
}

/** A PDF viewer's scroller (`[data-pdf-scroll]`) with `pages` pages, each painted unless `painted` is false. */
function pdfScroller(m: Metrics, pages = 2, painted = true) {
    const scroller = document.createElement("div")
    scroller.setAttribute("data-pdf-scroll", "")
    for (let i = 1; i <= pages; i++) {
        const page = document.createElement("div")
        page.setAttribute("data-pdf-page", String(i))
        if (painted) page.appendChild(document.createElement("canvas"))
        scroller.appendChild(page)
    }
    measure(scroller, m)
    const scrollTo = vi.fn()
    scroller.scrollTo = scrollTo as unknown as typeof scroller.scrollTo
    return { scroller, scrollTo }
}

function setup(over: Partial<EdgeTapZoneOptions> = {}, inner: HTMLElement | null = pdfScroller(TOP).scroller) {
    const container = document.createElement("div")
    document.body.appendChild(container)
    container.getBoundingClientRect = () => ({ left: 0, width: 900, top: 0, height: 1000, right: 900, bottom: 1000, x: 0, y: 0, toJSON: () => ({}) })
    // The outer container reads as "at the bottom": it must never decide a turn for a PDF.
    measure(container, { scrollTop: 0, clientHeight: 1000, scrollHeight: 1000 })
    const containerScrollTo = vi.fn()
    container.scrollTo = containerScrollTo as unknown as typeof container.scrollTo
    if (inner) container.appendChild(inner)
    const opts: EdgeTapZoneOptions = {
        enabled: true,
        isRtl: false,
        viewerKind: "pdf",
        isSuppressed: () => false,
        onNextChart: vi.fn(),
        onPreviousChart: vi.fn(),
        ...over,
    }
    const { result } = renderHook(() => useEdgeTapZones(opts))
    act(() => result.current(container))
    return { container, containerScrollTo, opts }
}

const tapAt = (el: Element, x: number, start: number, id = 1) => {
    el.dispatchEvent(pointer("pointerdown", x, { id, time: start }))
    el.dispatchEvent(pointer("pointerup", x, { id, time: start + 60 }))
}

describe("useEdgeTapZones", () => {
    beforeEach(() => { vi.useFakeTimers() })
    afterEach(() => {
        vi.useRealTimers()
        document.body.replaceChildren()
    })

    // The callback ref's setState needs a flush before listeners attach.
    const flush = async () => { await vi.advanceTimersByTimeAsync(0) }
    const settle = () => vi.advanceTimersByTimeAsync(DOUBLE_TAP_MS)

    it("a right-edge tap scrolls the PDF's own scroller after the double-tap window", async () => {
        const { scroller, scrollTo } = pdfScroller(TOP)
        const { container, containerScrollTo } = setup({}, scroller)
        await flush()
        tapAt(container, 850, 1000)
        expect(scrollTo).not.toHaveBeenCalled()
        await settle()
        expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 850 }))
        expect(containerScrollTo).not.toHaveBeenCalled()
    })

    it("at the bottom a forward tap opens the next chart; at the top a back tap opens the previous", async () => {
        const bottom = setup({}, pdfScroller(BOTTOM).scroller)
        await flush()
        tapAt(bottom.container, 850, 1000)
        await settle()
        expect(bottom.opts.onNextChart).toHaveBeenCalledTimes(1)

        const top = setup({}, pdfScroller(TOP).scroller)
        await flush()
        tapAt(top.container, 50, 1000)
        await settle()
        expect(top.opts.onPreviousChart).toHaveBeenCalledTimes(1)
    })

    it("RTL: a left-edge tap goes forward", async () => {
        const { scroller, scrollTo } = pdfScroller(TOP)
        const { container } = setup({ isRtl: true }, scroller)
        await flush()
        tapAt(container, 50, 1000)
        await settle()
        expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 850 }))
    })

    // S2: never change chart unless the viewer has rendered and is measured.
    it("never skips a chart that is still loading, failed, or unmeasured", async () => {
        const loading = setup({}, pdfScroller(BOTTOM, 0).scroller) // loading or failed: no pages
        const painting = setup({}, pdfScroller(BOTTOM, 2, false).scroller) // pages not painted yet
        const unmeasured = setup({}, pdfScroller({ scrollTop: 0, clientHeight: 0, scrollHeight: 0 }).scroller)
        await flush()
        for (const c of [loading, painting, unmeasured]) tapAt(c.container, 850, 1000)
        await settle()
        for (const c of [loading, painting, unmeasured]) {
            expect(c.opts.onNextChart).not.toHaveBeenCalled()
            expect(c.containerScrollTo).not.toHaveBeenCalled()
        }
    })

    it("a MusicXML chart turns only once its score SVG is rendered", async () => {
        const score = document.createElement("div")
        score.setAttribute("data-print-target", "musicxml-score")
        const { container, opts } = setup({ viewerKind: "musicxml" }, score)
        await flush()
        tapAt(container, 850, 1000)
        await settle()
        expect(opts.onNextChart).not.toHaveBeenCalled()

        score.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "svg"))
        tapAt(container, 850, 2000)
        await settle()
        expect(opts.onNextChart).toHaveBeenCalledTimes(1)
    })

    // S2: the scroll target is re-resolved when the timer fires, with no outer-container fallback.
    it("re-resolves the viewer's scroller when the turn fires", async () => {
        const first = pdfScroller(TOP)
        const { container, opts } = setup({}, first.scroller)
        await flush()
        tapAt(container, 850, 1000)
        // the viewer re-mounted during the wait: a new scroller, at its bottom
        const second = pdfScroller(BOTTOM)
        container.replaceChildren(second.scroller)
        await settle()
        expect(first.scrollTo).not.toHaveBeenCalled()
        expect(opts.onNextChart).toHaveBeenCalledTimes(1)
    })

    it("does nothing when the PDF scroller is gone: the outer container never decides 'at the bottom'", async () => {
        const { container, containerScrollTo, opts } = setup({}, pdfScroller(TOP).scroller)
        await flush()
        tapAt(container, 850, 1000)
        container.replaceChildren()
        await settle()
        expect(opts.onNextChart).not.toHaveBeenCalled()
        expect(containerScrollTo).not.toHaveBeenCalled()
    })

    // S3: a tap that stops a momentum scroll is not a page turn.
    it("ignores a tap within 150ms of the chart scrolling", async () => {
        const { scroller, scrollTo } = pdfScroller(TOP)
        const { container } = setup({}, scroller)
        await flush()
        const scroll = new Event("scroll")
        Object.defineProperty(scroll, "timeStamp", { value: 900 })
        scroller.dispatchEvent(scroll) // inner scroller: seen by the container's capture listener
        tapAt(container, 850, 1000)
        await settle()
        expect(scrollTo).not.toHaveBeenCalled()

        tapAt(container, 850, 1000 + SCROLL_QUIET_MS + 200)
        await settle()
        expect(scrollTo).toHaveBeenCalledTimes(1)
    })

    // S3: zoom disables tap zones only when the content is really wider than the viewport.
    it("is off when the content is wider than its viewport, on when it fits", async () => {
        const wide = pdfScroller({ ...TOP, scrollWidth: 1600, clientWidth: 900 })
        const w = setup({}, wide.scroller)
        const fits = pdfScroller({ ...TOP, scrollWidth: 900, clientWidth: 900 })
        const f = setup({}, fits.scroller)
        await flush()
        tapAt(w.container, 850, 1000)
        tapAt(f.container, 850, 1000)
        await settle()
        expect(wide.scrollTo).not.toHaveBeenCalled()
        expect(fits.scrollTo).toHaveBeenCalledTimes(1)
    })

    it("a double-tap does nothing", async () => {
        const { scroller, scrollTo } = pdfScroller(TOP)
        const { container } = setup({}, scroller)
        await flush()
        tapAt(container, 850, 1000)
        tapAt(container, 850, 1150)
        await vi.advanceTimersByTimeAsync(DOUBLE_TAP_MS * 2)
        expect(scrollTo).not.toHaveBeenCalled()
    })

    it("is suppressed while a popover/sheet/long-press owns the screen", async () => {
        const { scroller, scrollTo } = pdfScroller(TOP)
        const { container } = setup({ isSuppressed: () => true }, scroller)
        await flush()
        tapAt(container, 850, 1000)
        await settle()
        expect(scrollTo).not.toHaveBeenCalled()
    })

    it("ignores pinch (two pointers) and taps on buttons inside the chart", async () => {
        const { scroller, scrollTo } = pdfScroller(TOP)
        const { container } = setup({}, scroller)
        await flush()
        container.dispatchEvent(pointer("pointerdown", 850, { id: 1, time: 1000 }))
        container.dispatchEvent(pointer("pointerdown", 860, { id: 2, time: 1010 }))
        container.dispatchEvent(pointer("pointerup", 850, { id: 1, time: 1060 }))
        container.dispatchEvent(pointer("pointerup", 860, { id: 2, time: 1070 }))

        const button = document.createElement("button")
        scroller.appendChild(button)
        button.dispatchEvent(pointer("pointerdown", 850, { time: 2000 }))
        button.dispatchEvent(pointer("pointerup", 850, { time: 2060 }))

        await vi.advanceTimersByTimeAsync(DOUBLE_TAP_MS * 2)
        expect(scrollTo).not.toHaveBeenCalled()
    })

    it("does nothing when switched off", async () => {
        const { scroller, scrollTo } = pdfScroller(TOP)
        const { container } = setup({ enabled: false }, scroller)
        await flush()
        tapAt(container, 850, 1000)
        await settle()
        expect(scrollTo).not.toHaveBeenCalled()
    })
})
