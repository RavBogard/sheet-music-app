/**
 * Perform warm-up (perf audit P1-2): chart code is fetched into the caches,
 * never evaluated, and the warm-up waits while a chart is open.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
    chunkIdsFromSource,
    chunkUrlsFor,
    isChartOpenPath,
    warmViewerCode,
    __resetWarmForTests,
    type WarmLoader,
} from "@/lib/perform-warm"

// A stand-in with the shape of a compiled webpack thunk: its source names the
// chunk ids through `.e(...)`, and calling it would "evaluate" the module.
const r = { e: (_id: number) => Promise.resolve() }
const evaluated: string[] = []
function viewerA() { evaluated.push("A"); return Promise.all([r.e(12), r.e(34)]) }
function viewerB() { evaluated.push("B"); return r.e(56) }

const g = globalThis as Record<string, unknown>

beforeEach(() => {
    __resetWarmForTests()
    evaluated.length = 0
})
afterEach(() => {
    delete g.__webpack_require__
    vi.unstubAllGlobals()
})

describe("chunk discovery", () => {
    it("reads numeric and string chunk ids from compiled import() source", () => {
        expect(chunkIdsFromSource('()=>Promise.all([n.e(3610),n.e(6098)]).then(n.bind(n,123))')).toEqual([3610, 6098])
        expect(chunkIdsFromSource('()=>n.e("viewer").then(n.bind(n,9))')).toEqual(["viewer"])
        expect(chunkIdsFromSource('() => import("x")')).toEqual([])
    })

    it("returns null without a webpack runtime", () => {
        expect(chunkUrlsFor(viewerA as unknown as WarmLoader)).toBeNull()
    })

    it("maps ids to URLs with webpack's own filename function, CSS de-duplicated", () => {
        g.__webpack_require__ = { p: "/_next/", u: (id: number) => `static/chunks/${id}.js?dpl=x`, miniCssF: () => "static/css/a.css" }
        expect(chunkUrlsFor(viewerA as unknown as WarmLoader)).toEqual([
            "/_next/static/chunks/12.js?dpl=x",
            "/_next/static/chunks/34.js?dpl=x",
            "/_next/static/css/a.css",
        ])
    })
})

describe("isChartOpenPath", () => {
    it("is true on a track URL and the single-chart route, false on lists", () => {
        expect(isChartOpenPath("/perform/setlist/abc/track/t1")).toBe(true)
        expect(isChartOpenPath("/perform/file-123")).toBe(true)
        expect(isChartOpenPath("/perform/setlist/abc")).toBe(false)
        expect(isChartOpenPath("/perform")).toBe(false)
        expect(isChartOpenPath("/perform/setlist")).toBe(false)
    })
})

describe("warmViewerCode", () => {
    it("fetches chunk URLs and evaluates nothing when webpack is present", async () => {
        g.__webpack_require__ = { p: "/_next/", u: (id: number) => `c/${id}.js` }
        const fetchMock = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) }))
        vi.stubGlobal("fetch", fetchMock)
        const result = await warmViewerCode({
            signal: new AbortController().signal,
            isPaused: () => false,
            loaders: [viewerA, viewerB] as unknown as WarmLoader[],
        })
        expect(result).toBe("fetched")
        expect(evaluated).toEqual([])
        expect(fetchMock.mock.calls.map((c) => (c as unknown[])[0])).toEqual(["/_next/c/12.js", "/_next/c/34.js", "/_next/c/56.js"])
    })

    it("falls back to import() one module at a time without webpack", async () => {
        const result = await warmViewerCode({
            signal: new AbortController().signal,
            isPaused: () => false,
            loaders: [viewerA, viewerB] as unknown as WarmLoader[],
        })
        expect(result).toBe("imported")
        expect(evaluated).toEqual(["A", "B"])
    })

    it("waits while a chart is open, then resumes", async () => {
        g.__webpack_require__ = { p: "/", u: (id: number) => `${id}.js` }
        const fetchMock = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) }))
        vi.stubGlobal("fetch", fetchMock)
        let open = true
        const done = warmViewerCode({
            signal: new AbortController().signal,
            isPaused: () => open,
            loaders: [viewerB] as unknown as WarmLoader[],
            pollMs: 5,
        })
        await new Promise((res) => setTimeout(res, 30))
        expect(fetchMock).not.toHaveBeenCalled()
        open = false
        await done
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it("stops when aborted (unmount)", async () => {
        g.__webpack_require__ = { p: "/", u: (id: number) => `${id}.js` }
        const fetchMock = vi.fn()
        vi.stubGlobal("fetch", fetchMock)
        const ac = new AbortController()
        ac.abort()
        const result = await warmViewerCode({ signal: ac.signal, isPaused: () => false, loaders: [viewerB] as unknown as WarmLoader[] })
        expect(result).toBe("aborted")
        expect(fetchMock).not.toHaveBeenCalled()
    })
})

describe("createOpeningTracker (review S2)", () => {
    it("pauses only while a chart is opening, not while it stays open", async () => {
        const { createOpeningTracker, OPENING_MIN_MS, OPENING_MAX_MS } = await import("@/lib/perform-warm")
        let open = false
        let rendered = false
        let t = 0
        const opening = createOpeningTracker(() => open, () => rendered, () => t)
        expect(opening()).toBe(false)
        open = true
        expect(opening()).toBe(true) // just tapped
        t = OPENING_MIN_MS + 1
        expect(opening()).toBe(true) // not painted yet
        rendered = true
        expect(opening()).toBe(false) // painted: prefetch resumes while open
        // A chart that never reports painting stops pausing at the cap.
        open = false
        expect(opening()).toBe(false)
        open = true
        rendered = false
        t = 10_000
        expect(opening()).toBe(true)
        t = 10_000 + OPENING_MAX_MS
        expect(opening()).toBe(false)
    })
})
