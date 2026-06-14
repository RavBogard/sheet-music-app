/**
 * v11.5-02-01 (H3) — unit coverage for the pure byteRangeResponse helper.
 *
 * Proves AC-1 (206 slice), AC-2 (no-Range full 200 + Accept-Ranges + open-ended 206),
 * and AC-3 (beyond-EOF → 416, malformed/multi-range → full 200) at the helper level,
 * plus that caller-supplied headers (CORS / Cache-Control / X-Served-From) survive.
 */

import { describe, it, expect } from "vitest"
import { byteRangeResponse } from "@/lib/http/byte-range"

// 10-byte body: bytes 0..9
const BODY = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])

async function bytesOf(res: Response): Promise<number[]> {
    return Array.from(new Uint8Array(await res.arrayBuffer()))
}

describe("byteRangeResponse", () => {
    it("no Range → 200 full body, Accept-Ranges + Content-Length, custom headers survive", async () => {
        const res = byteRangeResponse(BODY, {
            contentType: "audio/mpeg",
            rangeHeader: null,
            headers: { "X-Served-From": "firebase-storage", "Cache-Control": "public" },
        })
        expect(res.status).toBe(200)
        expect(res.headers.get("accept-ranges")).toBe("bytes")
        expect(res.headers.get("content-length")).toBe("10")
        expect(res.headers.get("content-type")).toBe("audio/mpeg")
        expect(res.headers.get("x-served-from")).toBe("firebase-storage")
        expect(res.headers.get("cache-control")).toBe("public")
        expect(res.headers.get("content-range")).toBeNull()
        expect(await bytesOf(res)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    })

    it("closed range bytes=0-3 → 206 with correct slice + Content-Range/Length (AC-1)", async () => {
        const res = byteRangeResponse(BODY, { contentType: "audio/mpeg", rangeHeader: "bytes=0-3" })
        expect(res.status).toBe(206)
        expect(res.headers.get("content-range")).toBe("bytes 0-3/10")
        expect(res.headers.get("content-length")).toBe("4")
        expect(res.headers.get("accept-ranges")).toBe("bytes")
        expect(await bytesOf(res)).toEqual([0, 1, 2, 3])
    })

    it("open-ended range bytes=4- → 206 from offset to EOF (AC-2)", async () => {
        const res = byteRangeResponse(BODY, { contentType: "audio/mpeg", rangeHeader: "bytes=4-" })
        expect(res.status).toBe(206)
        expect(res.headers.get("content-range")).toBe("bytes 4-9/10")
        expect(res.headers.get("content-length")).toBe("6")
        expect(await bytesOf(res)).toEqual([4, 5, 6, 7, 8, 9])
    })

    it("suffix range bytes=-3 → 206 last N bytes", async () => {
        const res = byteRangeResponse(BODY, { contentType: "audio/mpeg", rangeHeader: "bytes=-3" })
        expect(res.status).toBe(206)
        expect(res.headers.get("content-range")).toBe("bytes 7-9/10")
        expect(await bytesOf(res)).toEqual([7, 8, 9])
    })

    it("end past EOF is clamped: bytes=5-100 → 206 bytes 5-9/10", async () => {
        const res = byteRangeResponse(BODY, { contentType: "audio/mpeg", rangeHeader: "bytes=5-100" })
        expect(res.status).toBe(206)
        expect(res.headers.get("content-range")).toBe("bytes 5-9/10")
        expect(await bytesOf(res)).toEqual([5, 6, 7, 8, 9])
    })

    it("beyond-EOF start bytes=100- → 416 with Content-Range bytes */10 (AC-3)", async () => {
        const res = byteRangeResponse(BODY, { contentType: "audio/mpeg", rangeHeader: "bytes=100-" })
        expect(res.status).toBe(416)
        expect(res.headers.get("content-range")).toBe("bytes */10")
    })

    it("malformed range bytes=abc → falls back to full 200 (AC-3)", async () => {
        const res = byteRangeResponse(BODY, { contentType: "audio/mpeg", rangeHeader: "bytes=abc" })
        expect(res.status).toBe(200)
        expect(res.headers.get("accept-ranges")).toBe("bytes")
        expect((await bytesOf(res)).length).toBe(10)
    })

    it("multi-range bytes=0-1,2-3 → falls back to full 200 (AC-3)", async () => {
        const res = byteRangeResponse(BODY, { contentType: "audio/mpeg", rangeHeader: "bytes=0-1,2-3" })
        expect(res.status).toBe(200)
        expect((await bytesOf(res)).length).toBe(10)
    })

    it("non-bytes unit → ignored, full 200", async () => {
        const res = byteRangeResponse(BODY, { contentType: "audio/mpeg", rangeHeader: "items=0-1" })
        expect(res.status).toBe(200)
        expect((await bytesOf(res)).length).toBe(10)
    })

    it("206 preserves caller headers too", async () => {
        const res = byteRangeResponse(BODY, {
            contentType: "audio/mpeg",
            rangeHeader: "bytes=0-1",
            headers: { "Access-Control-Allow-Origin": "https://centralreform.live" },
        })
        expect(res.status).toBe(206)
        expect(res.headers.get("access-control-allow-origin")).toBe("https://centralreform.live")
    })
})
