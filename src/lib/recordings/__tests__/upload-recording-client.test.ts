/**
 * uploadRecording: ask for a signed URL, PUT the bytes straight to Storage
 * with progress, then complete. Errors come back as plain messages by kind.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock("@/lib/api-client", () => api)
vi.mock("@/lib/firebase", () => ({ subscribeWithDb: vi.fn(), recoverFromFirestoreShutdown: vi.fn() }))

import { RecordingUploadError, uploadRecording } from "../recordings-client"

type Put = { url: string; headers: Record<string, string>; body: unknown }
let puts: Put[] = []
let putOutcome: "ok" | "error" | number = "ok"

class FakeXhr {
    upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null }
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    ontimeout: (() => void) | null = null
    onabort: (() => void) | null = null
    status = 0
    private url = ""
    private headers: Record<string, string> = {}
    open(_m: string, url: string) { this.url = url }
    setRequestHeader(k: string, v: string) { this.headers[k] = v }
    abort() { this.onabort?.() }
    send(body: unknown) {
        puts.push({ url: this.url, headers: this.headers, body })
        queueMicrotask(() => {
            if (putOutcome === "error") return this.onerror?.()
            this.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 })
            this.upload.onprogress?.({ lengthComputable: true, loaded: 100, total: 100 })
            this.status = putOutcome === "ok" ? 200 : putOutcome
            this.onload?.()
        })
    }
}

const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body })
const SIGNED = {
    recordingId: "rec-1",
    uploadUrl: "https://storage.example/recordings/rec-1.mp3?sig",
    headers: { "Content-Type": "audio/mpeg", "x-goog-content-length-range": "9,9" },
}
const mp3 = () => new File(["123456789"], "take.mp3", { type: "audio/mpeg" })

describe("uploadRecording", () => {
    beforeEach(() => {
        puts = []
        putOutcome = "ok"
        vi.stubGlobal("XMLHttpRequest", FakeXhr)
    })
    afterEach(() => {
        vi.unstubAllGlobals()
        vi.clearAllMocks()
    })

    it("signs, PUTs to Storage with the signed headers, then completes", async () => {
        api.apiFetch
            .mockResolvedValueOnce(json(200, SIGNED))
            .mockResolvedValueOnce(json(201, { recordingId: "rec-1", title: "take" }))
        const progress: number[] = []
        const out = await uploadRecording({ file: mp3(), songId: "s1", title: "take", onProgress: (f) => progress.push(f) })

        expect(out).toEqual({ recordingId: "rec-1", title: "take" })
        const [signCall, completeCall] = api.apiFetch.mock.calls
        expect(signCall[0]).toBe("/api/recordings/upload-url")
        expect(JSON.parse(signCall[1].body)).toMatchObject({ songId: "s1", fileName: "take.mp3", mimeType: "audio/mpeg", size: 9 })
        expect(puts).toHaveLength(1)
        expect(puts[0].url).toBe(SIGNED.uploadUrl)
        expect(puts[0].headers).toEqual(SIGNED.headers)
        expect(progress).toEqual([0.5, 1])
        expect(completeCall[0]).toBe("/api/recordings/upload/complete")
        expect(JSON.parse(completeCall[1].body)).toEqual({ recordingId: "rec-1" })
    })

    it("refuses a non-audio file before asking the server", async () => {
        const err = await uploadRecording({ file: new File(["x"], "chart.pdf", { type: "application/pdf" }), songId: "s1" }).catch((e) => e)
        expect(err).toBeInstanceOf(RecordingUploadError)
        expect(err.kind).toBe("wrong_type")
        expect(api.apiFetch).not.toHaveBeenCalled()
    })

    it("a too-big answer from the server is a too_big error", async () => {
        api.apiFetch.mockResolvedValueOnce(json(413, { error: "big", code: "file_too_large" }))
        const err = await uploadRecording({ file: mp3(), songId: "s1" }).catch((e) => e)
        expect(err.kind).toBe("too_big")
        expect(puts).toHaveLength(0)
    })

    it("a dropped connection during the PUT is a network error and never completes", async () => {
        api.apiFetch.mockResolvedValueOnce(json(200, SIGNED))
        putOutcome = "error"
        const err = await uploadRecording({ file: mp3(), songId: "s1" }).catch((e) => e)
        expect(err.kind).toBe("network")
        expect(api.apiFetch).toHaveBeenCalledTimes(1)
    })
})
