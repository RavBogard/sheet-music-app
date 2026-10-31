// @vitest-environment node
/**
 * PERF-18 / PERF-21: the save pass against a real (fake) IndexedDB.
 * - stale entries are replaced in place, never deleted first;
 * - failures are recorded with a reason, and leave any older copy readable;
 * - PDF bytes must carry a PDF header.
 */
import { IDBFactory, IDBObjectStore } from "fake-indexeddb"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/pdf-worker-offline", () => ({ primeOfflineWorker: vi.fn(async () => {}) }))

import { getFile, getFileVersion, putFile } from "@/lib/offline-idb"
import {
    __resetSaveFailuresForTests,
    getSaveFailures,
    pdfHeaderLooksValid,
    prefetchSetlistPDFs,
} from "@/lib/prefetch"

const PDF_V1 = "%PDF-1.4 old bytes"
const PDF_V2 = "%PDF-1.7 new bytes"

function pdf(body: string, status = 200): Response {
    return new Response(body, { status, headers: { "content-type": "application/pdf" } })
}

async function text(fileId: string): Promise<string | null> {
    const b = await getFile(fileId)
    return b ? await b.text() : null
}

const fetchMock = vi.fn<(url: string) => Promise<Response>>()

beforeEach(() => {
    vi.stubGlobal("indexedDB", new IDBFactory())
    vi.stubGlobal("fetch", fetchMock)
    fetchMock.mockReset()
    __resetSaveFailuresForTests()
})

afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

describe("versioned cache (PERF-18)", () => {
    it("stores the server version with a fresh save", async () => {
        fetchMock.mockResolvedValue(pdf(PDF_V2))
        const n = await prefetchSetlistPDFs(["a"], undefined, { versions: { a: "h:2" } })
        expect(n).toBe(1)
        expect(await getFileVersion("a")).toBe("h:2")
        expect(await text("a")).toBe(PDF_V2)
    })

    it("does not re-fetch a cached chart whose version is current", async () => {
        await putFile("a", new Blob([PDF_V1], { type: "application/pdf" }), "h:1")
        const n = await prefetchSetlistPDFs(["a"], undefined, { versions: { a: "h:1" } })
        expect(n).toBe(0)
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it("does not re-fetch a cached chart when the server has no version", async () => {
        await putFile("a", new Blob([PDF_V1], { type: "application/pdf" }))
        await prefetchSetlistPDFs(["a"], undefined, { versions: {} })
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it("replaces a stale chart in place, never deleting it first", async () => {
        await putFile("a", new Blob([PDF_V1], { type: "application/pdf" }), "h:1")
        const del = vi.spyOn(IDBObjectStore.prototype, "delete")
        const clear = vi.spyOn(IDBObjectStore.prototype, "clear")
        let readDuringFetch: string | null = "unset"
        fetchMock.mockImplementation(async () => {
            // While the replacement is downloading, the old copy is still there.
            readDuringFetch = await text("a")
            return pdf(PDF_V2)
        })
        const n = await prefetchSetlistPDFs(["a"], undefined, { versions: { a: "h:2" } })
        expect(n).toBe(1)
        expect(readDuringFetch).toBe(PDF_V1)
        expect(await text("a")).toBe(PDF_V2)
        expect(await getFileVersion("a")).toBe("h:2")
        expect(del).not.toHaveBeenCalled()
        expect(clear).not.toHaveBeenCalled()
    })

    it("re-fetches an entry saved before versioning existed", async () => {
        await putFile("a", new Blob([PDF_V1], { type: "application/pdf" }))
        expect(await getFileVersion("a")).toBeNull()
        fetchMock.mockResolvedValue(pdf(PDF_V2))
        await prefetchSetlistPDFs(["a"], undefined, { versions: { a: "h:2" } })
        expect(await text("a")).toBe(PDF_V2)
    })

    it.each([
        ["server error", () => Promise.resolve(pdf("oops", 500))],
        ["network drop", () => Promise.reject(new TypeError("Failed to fetch"))],
        ["damaged bytes", () => Promise.resolve(pdf("<html>not a pdf</html>"))],
    ])("keeps the old copy when the refresh fails (%s)", async (_label, impl) => {
        await putFile("a", new Blob([PDF_V1], { type: "application/pdf" }), "h:1")
        fetchMock.mockImplementation(impl)
        const n = await prefetchSetlistPDFs(["a"], undefined, { versions: { a: "h:2" } })
        expect(n).toBe(0)
        expect(await text("a")).toBe(PDF_V1)
        expect(await getFileVersion("a")).toBe("h:1")
    })
})

describe("failure reasons (PERF-21)", () => {
    it("records 404, other HTTP errors, network and corrupt bytes per fileId", async () => {
        fetchMock.mockImplementation(async (url: string) => {
            if (url.endsWith("/gone")) return pdf("", 404)
            if (url.endsWith("/boom")) return pdf("x", 503)
            if (url.endsWith("/offline")) throw new TypeError("Failed to fetch")
            if (url.endsWith("/broken")) return pdf("<!doctype html>")
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
        // Nothing damaged was stored.
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
            new Response("<score-partwise/>", { headers: { "content-type": "application/vnd.recordare.musicxml+xml" } }),
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
