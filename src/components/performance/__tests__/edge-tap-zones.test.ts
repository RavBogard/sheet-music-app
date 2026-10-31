import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import {
    classifyTap,
    directionForZone,
    isDoubleTap,
    planTurn,
    zoneFor,
    DOUBLE_TAP_MS,
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

describe("isDoubleTap", () => {
    it("is true only within the double-tap window", () => {
        expect(isDoubleTap(null, 1000)).toBe(false)
        expect(isDoubleTap(1000, 1000 + DOUBLE_TAP_MS)).toBe(true)
        expect(isDoubleTap(1000, 1001 + DOUBLE_TAP_MS)).toBe(false)
    })
})

describe("planTurn", () => {
    const m = (scrollTop: number) => ({ scrollTop, clientHeight: 1000, scrollHeight: 3000 })

    it("forward scrolls about 85% of the viewport, clamped to the bottom", () => {
        expect(planTurn("forward", m(0))).toEqual({ kind: "scroll", top: 850 })
        expect(planTurn("forward", m(1500))).toEqual({ kind: "scroll", top: 2000 })
    })

    it("forward at the bottom goes to the next chart", () => {
        expect(planTurn("forward", m(2000))).toEqual({ kind: "next-chart" })
        expect(planTurn("forward", m(1999))).toEqual({ kind: "next-chart" })
        // a chart that fits on screen
        expect(planTurn("forward", { scrollTop: 0, clientHeight: 1000, scrollHeight: 1000 })).toEqual({ kind: "next-chart" })
    })

    it("back scrolls up, and at the top goes to the previous chart", () => {
        expect(planTurn("back", m(2000))).toEqual({ kind: "scroll", top: 1150 })
        expect(planTurn("back", m(400))).toEqual({ kind: "scroll", top: 0 })
        expect(planTurn("back", m(0))).toEqual({ kind: "previous-chart" })
    })
})

// ── Hook wiring ─────────────────────────────────────────────────────────────

function pointer(type: string, x: number, opts: { id?: number; time?: number; target?: Element } = {}) {
    const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: 400, button: 0 })
    Object.defineProperty(e, "pointerId", { value: opts.id ?? 1 })
    Object.defineProperty(e, "pointerType", { value: "touch" })
    Object.defineProperty(e, "timeStamp", { value: opts.time ?? 0 })
    return e
}

function setup(over: Partial<EdgeTapZoneOptions> = {}, metrics = { scrollTop: 0, clientHeight: 1000, scrollHeight: 3000 }) {
    const container = document.createElement("div")
    container.style.overflowY = "auto"
    document.body.appendChild(container)
    container.getBoundingClientRect = () => ({ left: 0, width: 900, top: 0, height: 1000, right: 900, bottom: 1000, x: 0, y: 0, toJSON: () => ({}) })
    Object.defineProperty(container, "clientHeight", { value: metrics.clientHeight, configurable: true })
    Object.defineProperty(container, "scrollHeight", { value: metrics.scrollHeight, configurable: true })
    container.scrollTop = metrics.scrollTop
    const scrollTo = vi.fn()
    container.scrollTo = scrollTo as unknown as typeof container.scrollTo
    const opts: EdgeTapZoneOptions = {
        enabled: true,
        isRtl: false,
        isZoomedIn: () => false,
        isSuppressed: () => false,
        onNextChart: vi.fn(),
        onPreviousChart: vi.fn(),
        ...over,
    }
    const { result } = renderHook(() => useEdgeTapZones(opts))
    act(() => result.current(container))
    return { container, scrollTo, opts }
}

const tapAt = (el: Element, x: number, start: number, id = 1) => {
    el.dispatchEvent(pointer("pointerdown", x, { id, time: start }))
    el.dispatchEvent(pointer("pointerup", x, { id, time: start + 60 }))
}

describe("useEdgeTapZones", () => {
    beforeEach(() => { vi.useFakeTimers() })
    afterEach(() => {
        vi.useRealTimers()
        document.body.innerHTML = ""
    })

    // renderHook's setState from the callback ref needs a flush before listeners attach.
    const flush = async () => { await vi.advanceTimersByTimeAsync(0) }

    it("a right-edge tap scrolls forward after the double-tap window", async () => {
        const { container, scrollTo } = setup()
        await flush()
        tapAt(container, 850, 1000)
        expect(scrollTo).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(DOUBLE_TAP_MS)
        expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 850 }))
    })

    it("at the bottom a forward tap opens the next chart; at the top a back tap opens the previous", async () => {
        const bottom = setup({}, { scrollTop: 2000, clientHeight: 1000, scrollHeight: 3000 })
        await flush()
        tapAt(bottom.container, 850, 1000)
        await vi.advanceTimersByTimeAsync(DOUBLE_TAP_MS)
        expect(bottom.opts.onNextChart).toHaveBeenCalledTimes(1)

        const top = setup()
        await flush()
        tapAt(top.container, 50, 1000)
        await vi.advanceTimersByTimeAsync(DOUBLE_TAP_MS)
        expect(top.opts.onPreviousChart).toHaveBeenCalledTimes(1)
    })

    it("RTL: a left-edge tap goes forward", async () => {
        const { container, scrollTo } = setup({ isRtl: true })
        await flush()
        tapAt(container, 50, 1000)
        await vi.advanceTimersByTimeAsync(DOUBLE_TAP_MS)
        expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 850 }))
    })

    it("a double-tap does nothing", async () => {
        const { container, scrollTo } = setup()
        await flush()
        tapAt(container, 850, 1000)
        tapAt(container, 850, 1150)
        await vi.advanceTimersByTimeAsync(DOUBLE_TAP_MS * 2)
        expect(scrollTo).not.toHaveBeenCalled()
    })

    it("is suppressed while a popover/sheet/long-press owns the screen, and when zoomed in", async () => {
        const suppressed = setup({ isSuppressed: () => true })
        await flush()
        tapAt(suppressed.container, 850, 1000)
        const zoomed = setup({ isZoomedIn: () => true })
        await flush()
        tapAt(zoomed.container, 850, 1000)
        await vi.advanceTimersByTimeAsync(DOUBLE_TAP_MS)
        expect(suppressed.scrollTo).not.toHaveBeenCalled()
        expect(zoomed.scrollTo).not.toHaveBeenCalled()
    })

    it("ignores pinch (two pointers) and taps on buttons inside the chart", async () => {
        const { container, scrollTo } = setup()
        await flush()
        container.dispatchEvent(pointer("pointerdown", 850, { id: 1, time: 1000 }))
        container.dispatchEvent(pointer("pointerdown", 860, { id: 2, time: 1010 }))
        container.dispatchEvent(pointer("pointerup", 850, { id: 1, time: 1060 }))
        container.dispatchEvent(pointer("pointerup", 860, { id: 2, time: 1070 }))

        const button = document.createElement("button")
        container.appendChild(button)
        button.dispatchEvent(pointer("pointerdown", 850, { time: 2000 }))
        button.dispatchEvent(pointer("pointerup", 850, { time: 2060 }))

        await vi.advanceTimersByTimeAsync(DOUBLE_TAP_MS * 2)
        expect(scrollTo).not.toHaveBeenCalled()
    })

    it("does nothing when switched off", async () => {
        const { container, scrollTo } = setup({ enabled: false })
        await flush()
        tapAt(container, 850, 1000)
        await vi.advanceTimersByTimeAsync(DOUBLE_TAP_MS)
        expect(scrollTo).not.toHaveBeenCalled()
    })
})
