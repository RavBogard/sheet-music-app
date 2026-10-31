// @vitest-environment node
/**
 * PERF-18 / PERF-21: the save pass against a real (fake) IndexedDB.
 * - refreshes replace in place only with verified bytes, never deleting first;
 * - portal pages, redirects, cut-off and mismatched downloads are never stored;
 * - legacy entries are hash-checked on the device before any download;
 * - one shared queue, deduped by fileId, at most two downloads at once.
 */
import { createHash } from "node:crypto"
import { IDBFactory, IDBObjectStore } from "fake-indexeddb"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/pdf-worker-offline", () => ({ primeOfflineWorker: vi.fn(async () => {}) }))

import { getFile, getFileVersion, putFile } from "@/lib/offline-idb"
import {
    __resetSaveFailuresForTests,
    getSaveFailures,
    pdfHeaderLooksValid,
    prefetchSetlistPDFs,
    setChartOpen,
    sha256HexOf,
} from "@/lib/prefetch"

const PAD = " ".repeat(100)
const PDF_V1 = `%PDF-1.4 old bytes${PAD}`
const PDF_V2 = `%PDF-1.7 new bytes${PAD}`
const h = (s: string) => `h:${createHash("sha256").update(s).digest("hex")}`

function pdf(body: string, status = 200, headers: Record<string, string> = {}): Response {
    return new Response(body, { status, headers: { "content-type": "application/pdf", ...headers } })
}
function redirected(res: Response): Response {
    Object.defineProperty(res, "redirected", { value: true })
    return res
}

async function text(fileId: string): Promise<string | null> {
    const b = await getFile(fileId)
    return b ? await b.text() : null
}
async function seed(fileId: string, body: string, version?: string) {
    await putFile(fileId, new Blob([body], { type: "application/pdf" }), version)
}

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()

beforeEach(() => {
    __resetSaveFailuresForTests()
    vi.stubGlobal("indexedDB", new IDBFactory())
    vi.stubGlobal("fetch", fetchMock)
    fetchMock.mockReset()
})

afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

describe("sha256HexOf", () => {
    it("matches the server's content hash (lowercase sha256 hex of the bytes)", async () => {
        expect(`h:${await sha256HexOf(new Blob([PDF_V2]))}`).toBe(h(PDF_V2))
    })
})

describe("first saves", () => {
    it("stores the server version when the bytes match its hash", async () => {
        fetchMock.mockResolvedValue(pdf(PDF_V2))
        expect(await prefetchSetlistPDFs(["a"], undefined, { versions: { a: h(PDF_V2) } })).toBe(1)
        expect(await getFileVersion("a")).toBe(h(PDF_V2))
        expect(await text("a")).toBe(PDF_V2)
    })

    it("keeps mismatched bytes on a first save (better than nothing) but doesn't claim the version", async () => {
        fetchMock.mockResolvedValue(pdf(PDF_V1))
        await prefetchSetlistPDFs(["a"], undefined, { versions: { a: h(PDF_V2) } })
        expect(await text("a")).toBe(PDF_V1)
        expect(await getFileVersion("a")).toBeNull()
    })

    it.each([
        ["a redirect (captive portal)", () => redirected(pdf(PDF_V2))],
        ["an HTML page", () => new Response(`<html>${PAD}</html>`, { headers: { "content-type": "text/html" } })],
        ["a cut-off body", () => pdf(PDF_V2, 200, { "content-length": String(PDF_V2.length + 500) })],
        ["a tiny body", () => pdf("%PDF")],
    ])("never stores %s", async (_label, make) => {
        fetchMock.mockImplementation(async () => make())
        expect(await prefetchSetlistPDFs(["a"])).toBe(0)
        expect(await getFile("a")).toBeNull()
        expect(getSaveFailures().has("a")).toBe(true)
    })
})

describe("cached charts (PERF-18)", () => {
    it("does nothing when the version is current or the server has none", async () => {
        await seed("a", PDF_V1, h(PDF_V1))
        await seed("b", PDF_V1)
        await prefetchSetlistPDFs(["a", "b"], undefined, { versions: { a: h(PDF_V1) } })
        await new Promise((r) => setTimeout(r, 120))
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it("stamps a legacy entry whose bytes match the hash, with no download", async () => {
        await seed("a", PDF_V2)
        await prefetchSetlistPDFs(["a"], undefined, { versions: { a: h(PDF_V2) } })
        await vi.waitFor(async () => expect(await getFileVersion("a")).toBe(h(PDF_V2)))
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it("leaves a legacy entry alone against an updatedAt version", async () => {
        await seed("a", PDF_V1)
        await prefetchSetlistPDFs(["a"], undefined, { versions: { a: "u:5" } })
        await new Promise((r) => setTimeout(r, 120))
        expect(fetchMock).not.toHaveBeenCalled()
        expect(await getFileVersion("a")).toBeNull()
    })

    it("replaces a stale chart in place with verified bytes, never deleting first", async () => {
        await seed("a", PDF_V1, h(PDF_V1))
        const del = vi.spyOn(IDBObjectStore.prototype, "delete")
        const clear = vi.spyOn(IDBObjectStore.prototype, "clear")
        let readDuringFetch: string | null = "unset"
        fetchMock.mockImplementation(async () => {
            readDuringFetch = await text("a")
            return pdf(PDF_V2)
        })
        await prefetchSetlistPDFs(["a"], undefined, { versions: { a: h(PDF_V2) } })
        await vi.waitFor(async () => expect(await text("a")).toBe(PDF_V2))
        expect(readDuringFetch).toBe(PDF_V1)
        expect(await getFileVersion("a")).toBe(h(PDF_V2))
        // Bypasses the browser cache and gives the CDN a new URL.
        const [url, init] = fetchMock.mock.calls[0]
        expect(url).toBe(`/api/drive/file/a?v=${encodeURIComponent(h(PDF_V2))}`)
        expect(init).toMatchObject({ cache: "no-store" })
        expect(del).not.toHaveBeenCalled()
        expect(clear).not.toHaveBeenCalled()
    })

    it.each([
        ["server error", () => Promise.resolve(pdf("oops", 500))],
        ["network drop", () => Promise.reject(new TypeError("Failed to fetch"))],
        ["captive portal redirect", () => Promise.resolve(redirected(pdf(PDF_V2)))],
        ["portal HTML", () => Promise.resolve(new Response(`<html>${PAD}`, { headers: { "content-type": "text/html" } }))],
        ["text for a binary chart", () => Promise.resolve(new Response(`chords${PAD}`, { headers: { "content-type": "text/plain" } }))],
        ["hash mismatch", () => Promise.resolve(pdf(`%PDF-1.7 something else${PAD}`))],
        ["cut-off download", () => Promise.resolve(pdf(PDF_V2, 200, { "content-length": "99999" }))],
    ])("keeps the old copy when the refresh fails (%s)", async (_label, impl) => {
        await seed("a", PDF_V1, h(PDF_V1))
        fetchMock.mockImplementation(impl)
        await prefetchSetlistPDFs(["a"], undefined, { versions: { a: h(PDF_V2) } })
        await vi.waitFor(() => expect(getSaveFailures().has("a")).toBe(true))
        expect(await text("a")).toBe(PDF_V1)
        expect(await getFileVersion("a")).toBe(h(PDF_V1))
    })

    it("refreshes an updatedAt version only with the same broad type", async () => {
        await seed("a", PDF_V1, "u:1")
        fetchMock.mockResolvedValue(new Response(`not a pdf${PAD}`, { headers: { "content-type": "image/png" } }))
        await prefetchSetlistPDFs(["a"], undefined, { versions: { a: "u:2" } })
        await vi.waitFor(() => expect(getSaveFailures().has("a")).toBe(true))
        expect(await text("a")).toBe(PDF_V1)

        __resetSaveFailuresForTests()
        fetchMock.mockResolvedValue(pdf(PDF_V2))
        await prefetchSetlistPDFs(["a"], undefined, { versions: { a: "u:2" } })
        await vi.waitFor(async () => expect(await getFileVersion("a")).toBe("u:2"))
        expect(await text("a")).toBe(PDF_V2)
    })

    it("waits while a chart is open, and resumes when it closes", async () => {
        await seed("a", PDF_V1, h(PDF_V1))
        fetchMock.mockResolvedValue(pdf(PDF_V2))
        setChartOpen(true)
        await prefetchSetlistPDFs(["a"], undefined, { versions: { a: h(PDF_V2) } })
        await new Promise((r) => setTimeout(r, 150))
        expect(fetchMock).not.toHaveBeenCalled()
        setChartOpen(false)
        await vi.waitFor(async () => expect(await text("a")).toBe(PDF_V2))
    })
})

describe("the shared queue", () => {
    it("dedupes by fileId across callers and runs at most two downloads at once", async () => {
        let inFlight = 0
        let maxInFlight = 0
        fetchMock.mockImplementation(async () => {
            inFlight++
            maxInFlight = Math.max(maxInFlight, inFlight)
            await new Promise((r) => setTimeout(r, 20))
            inFlight--
            return pdf(PDF_V2)
        })
        const [n1, n2] = await Promise.all([
            prefetchSetlistPDFs(["a", "b", "c", "d", "e"]),
            prefetchSetlistPDFs(["a", "b", "f"]),
        ])
        const urls = fetchMock.mock.calls.map((c) => c[0])
        expect(new Set(urls).size).toBe(urls.length) // each fileId fetched once
        expect(urls).toHaveLength(6)
        expect(maxInFlight).toBe(2)
        expect(n1).toBe(5)
        expect(n2).toBe(3) // shared jobs report success to both callers
    })
})

describe("failure reasons (PERF-21)", () => {
    it("records 404, other HTTP errors, network and corrupt bytes per fileId", async () => {
        fetchMock.mockImplementation(async (url: string) => {
            if (url.endsWith("/gone")) return pdf("", 404)
            if (url.endsWith("/boom")) return pdf("x", 503)
            if (url.endsWith("/offline")) throw new TypeError("Failed to fetch")
            if (url.endsWith("/broken")) return pdf(`<!doctype html>${PAD}`)
            if (url.endsWith("/empty")) return pdf("")
            return pdf(PDF_V2)
        })
        await prefetchSetlistPDFs(["gone", "boom", "offline", "broken", "empty", "fine"])
        const f = getSaveFailures()
        expect(f.get("gone")).toMatchObject({ reason: "not-found", status: 404 })
        expect(f.get("boom")).toMatchObject({ reason: "http", status: 503 })
        expect(f.get("offline")?.reason).toBe("network")
        expect(f.get("broken")?.reason).toBe("corrupt")
        expect(f.get("empty")?.reason).toBe("corrupt")
        expect(f.has("fine")).toBe(false)
        expect(await getFile("broken")).toBeNull()
        expect(await text("fine")).toBe(PDF_V2)
    })

    it("clears a recorded failure once the chart saves", async () => {
        fetchMock.mockResolvedValueOnce(pdf("", 404))
        await prefetchSetlistPDFs(["a"])
        expect(getSaveFailures().get("a")?.reason).toBe("not-found")
        fetchMock.mockResolvedValueOnce(pdf(PDF_V2))
        await prefetchSetlistPDFs(["a"])
        expect(getSaveFailures().has("a")).toBe(false)
    })

    it("does not header-check non-PDF charts", async () => {
        fetchMock.mockResolvedValue(
            new Response(`<score-partwise/>${PAD}`, { headers: { "content-type": "application/vnd.recordare.musicxml+xml" } }),
        )
        expect(await prefetchSetlistPDFs(["x"])).toBe(1)
        expect(getSaveFailures().has("x")).toBe(false)
    })
})

describe("pdfHeaderLooksValid", () => {
    it("accepts %PDF at the start or within the first kilobyte", async () => {
        expect(await pdfHeaderLooksValid(new Blob(["%PDF-1.4"]), "application/pdf")).toBe(true)
        expect(await pdfHeaderLooksValid(new Blob(["﻿  \n%PDF-1.4"]), "application/pdf")).toBe(true)
    })
    it("rejects PDF-typed bytes without a header", async () => {
        expect(await pdfHeaderLooksValid(new Blob(["<html>"]), "application/pdf")).toBe(false)
        expect(await pdfHeaderLooksValid(new Blob(["x".repeat(2000) + "%PDF"]), "application/pdf")).toBe(false)
    })
    it("passes anything that isn't typed as a PDF", async () => {
        expect(await pdfHeaderLooksValid(new Blob(["<html>"]), "text/plain")).toBe(true)
        expect(await pdfHeaderLooksValid(new Blob(["<html>"]), "application/octet-stream")).toBe(true)
    })
})
