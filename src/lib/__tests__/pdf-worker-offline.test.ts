/**
 * offline-perform-fix — pdf.js worker offline availability.
 *
 * Locks the contract that makes a NOT-yet-opened chart render offline:
 *   - ONLINE behavior is unchanged (static `/pdf.worker.min.<v>.mjs` URL).
 *   - Online, the worker bytes get copied into IndexedDB (primeOfflineWorker).
 *   - Offline + cached, ensureOfflineWorkerReady builds a same-origin blob: URL
 *     and desiredWorkerSrc hands it to pdf.js (so `new Worker(blob:…)` needs no
 *     network — the cold-open "fake worker failed" + offline-nav "Rendering…"
 *     hang both go away).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const STATIC = "/pdf.worker.min.5.4.296.mjs"
const KEY = "__pdfjs_worker__:5.4.296"

function setOnline(value: boolean) {
    Object.defineProperty(navigator, "onLine", { configurable: true, value })
}

describe("pdf-worker-offline", () => {
    const origOnLine = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(navigator),
        "onLine",
    ) ?? Object.getOwnPropertyDescriptor(navigator, "onLine")
    const origCreateObjectURL = URL.createObjectURL

    beforeEach(() => {
        vi.resetModules()
    })

    afterEach(() => {
        if (origOnLine) Object.defineProperty(navigator, "onLine", origOnLine)
        ;(URL as unknown as { createObjectURL: unknown }).createObjectURL = origCreateObjectURL
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it("desiredWorkerSrc returns the static asset URL when ONLINE (online path unchanged)", async () => {
        vi.doMock("@/lib/offline-idb", () => ({ getFile: vi.fn(), hasFile: vi.fn(), putFile: vi.fn() }))
        const mod = await import("@/lib/pdf-worker-offline")
        mod.__resetOfflineWorkerForTests()
        setOnline(true)
        expect(mod.desiredWorkerSrc("5.4.296")).toBe(STATIC)
    })

    it("desiredWorkerSrc returns the static URL when offline but no blob built yet", async () => {
        vi.doMock("@/lib/offline-idb", () => ({ getFile: vi.fn(async () => null), hasFile: vi.fn(), putFile: vi.fn() }))
        const mod = await import("@/lib/pdf-worker-offline")
        mod.__resetOfflineWorkerForTests()
        setOnline(false)
        expect(mod.desiredWorkerSrc("5.4.296")).toBe(STATIC)
    })

    it("primeOfflineWorker copies worker bytes into IDB when ONLINE", async () => {
        const putFile = vi.fn(async () => {})
        vi.doMock("@/lib/offline-idb", () => ({
            getFile: vi.fn(),
            hasFile: vi.fn(async () => false),
            putFile,
        }))
        vi.doMock("react-pdf", () => ({ pdfjs: { version: "5.4.296" } }))
        const blob = new Blob([new Uint8Array(1024)], { type: "text/javascript" })
        const fetchMock = vi.fn(async () => ({ ok: true, blob: async () => blob }))
        vi.stubGlobal("fetch", fetchMock)
        setOnline(true)

        const mod = await import("@/lib/pdf-worker-offline")
        await mod.primeOfflineWorker()

        expect(fetchMock).toHaveBeenCalledWith(STATIC, { cache: "force-cache" })
        expect(putFile).toHaveBeenCalledWith(KEY, blob)
    })

    it("primeOfflineWorker is a no-op OFFLINE (can't fetch, must not write)", async () => {
        const putFile = vi.fn(async () => {})
        vi.doMock("@/lib/offline-idb", () => ({ getFile: vi.fn(), hasFile: vi.fn(async () => false), putFile }))
        vi.doMock("react-pdf", () => ({ pdfjs: { version: "5.4.296" } }))
        const fetchMock = vi.fn()
        vi.stubGlobal("fetch", fetchMock)
        setOnline(false)

        const mod = await import("@/lib/pdf-worker-offline")
        await mod.primeOfflineWorker()

        expect(fetchMock).not.toHaveBeenCalled()
        expect(putFile).not.toHaveBeenCalled()
    })

    it("primeOfflineWorker skips the fetch when bytes are already cached", async () => {
        const putFile = vi.fn(async () => {})
        vi.doMock("@/lib/offline-idb", () => ({ getFile: vi.fn(), hasFile: vi.fn(async () => true), putFile }))
        vi.doMock("react-pdf", () => ({ pdfjs: { version: "5.4.296" } }))
        const fetchMock = vi.fn()
        vi.stubGlobal("fetch", fetchMock)
        setOnline(true)

        const mod = await import("@/lib/pdf-worker-offline")
        await mod.primeOfflineWorker()

        expect(fetchMock).not.toHaveBeenCalled()
        expect(putFile).not.toHaveBeenCalled()
    })

    it("OFFLINE + cached bytes → ensureOfflineWorkerReady builds a blob: URL that desiredWorkerSrc returns", async () => {
        const workerBytes = new Uint8Array([1, 2, 3, 4]).buffer
        const cachedBlob = { arrayBuffer: async () => workerBytes }
        const getFile = vi.fn(async (k: string) => (k === KEY ? cachedBlob : null))
        vi.doMock("@/lib/offline-idb", () => ({ getFile, hasFile: vi.fn(), putFile: vi.fn() }))
        const createObjectURL = vi.fn(() => "blob:https://test/worker-xyz")
        ;(URL as unknown as { createObjectURL: unknown }).createObjectURL = createObjectURL
        setOnline(false)

        const mod = await import("@/lib/pdf-worker-offline")
        mod.__resetOfflineWorkerForTests()

        // Before ensure: still the static URL.
        expect(mod.desiredWorkerSrc("5.4.296")).toBe(STATIC)

        await mod.ensureOfflineWorkerReady("5.4.296")

        expect(getFile).toHaveBeenCalledWith(KEY)
        expect(createObjectURL).toHaveBeenCalledTimes(1)
        // After ensure: pdf.js gets the offline blob: worker.
        expect(mod.desiredWorkerSrc("5.4.296")).toBe("blob:https://test/worker-xyz")
    })

    it("ensureOfflineWorkerReady is a no-op ONLINE (never swaps the static worker)", async () => {
        const getFile = vi.fn(async () => ({ arrayBuffer: async () => new Uint8Array([1]).buffer }))
        vi.doMock("@/lib/offline-idb", () => ({ getFile, hasFile: vi.fn(), putFile: vi.fn() }))
        const createObjectURL = vi.fn(() => "blob:should-not-happen")
        ;(URL as unknown as { createObjectURL: unknown }).createObjectURL = createObjectURL
        setOnline(true)

        const mod = await import("@/lib/pdf-worker-offline")
        mod.__resetOfflineWorkerForTests()
        await mod.ensureOfflineWorkerReady("5.4.296")

        expect(getFile).not.toHaveBeenCalled()
        expect(createObjectURL).not.toHaveBeenCalled()
        expect(mod.desiredWorkerSrc("5.4.296")).toBe(STATIC)
    })
})
