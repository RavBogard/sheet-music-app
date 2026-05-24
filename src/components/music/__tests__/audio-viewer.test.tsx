import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import { AudioViewer } from "../AudioViewer"

// Mock offline-idb so we can drive the IDB-first / network-fallback
// branches deterministically. Each test resets the mock.
vi.mock("@/lib/offline-idb", () => ({
    getFile: vi.fn(),
}))

import { getFile } from "@/lib/offline-idb"

// Spy on URL.createObjectURL so we can assert the IDB-first path mints
// a blob: URL and revokes it on unmount. jsdom does not implement
// these by default. Re-stubbed per test; vitest restores between files.
beforeEach(() => {
    vi.clearAllMocks()
    URL.createObjectURL = vi.fn(() => "blob:mock-audio-url")
    URL.revokeObjectURL = vi.fn()
})

describe("AudioViewer", () => {
    it("renders an <audio> element with controls + aria-label", async () => {
        ;(getFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null)
        render(<AudioViewer fileId="file-mp3-123" title="Adon Olam" />)

        const audio = await waitFor(() =>
            screen.getByLabelText(/Audio: Adon Olam/)
        ) as HTMLAudioElement
        expect(audio.tagName).toBe("AUDIO")
        expect(audio.hasAttribute("controls")).toBe(true)
        expect(audio.getAttribute("preload")).toBe("metadata")
    })

    it("falls back to /api/drive/file/<id> when IDB has no blob", async () => {
        ;(getFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null)
        render(<AudioViewer fileId="file-mp3-net" title="Net Track" />)

        const audio = await waitFor(() => screen.getByLabelText(/Audio: Net Track/)) as HTMLAudioElement
        expect(audio.getAttribute("src")).toBe("/api/drive/file/file-mp3-net")
        expect(URL.createObjectURL).not.toHaveBeenCalled()
    })

    it("uses a blob: object URL when IDB returns a cached blob (offline path)", async () => {
        const fakeBlob = new Blob(["fake-audio-bytes"], { type: "audio/mpeg" })
        ;(getFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(fakeBlob)
        render(<AudioViewer fileId="file-mp3-cached" title="Cached" />)

        const audio = await waitFor(() => screen.getByLabelText(/Audio: Cached/)) as HTMLAudioElement
        expect(audio.getAttribute("src")).toBe("blob:mock-audio-url")
        expect(URL.createObjectURL).toHaveBeenCalledWith(fakeBlob)
    })

    it("surfaces a clean error message when the audio element fires onError", async () => {
        ;(getFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null)
        render(<AudioViewer fileId="file-mp3-404" title="Missing" />)

        const audio = await waitFor(() => screen.getByLabelText(/Audio: Missing/))
        fireEvent.error(audio)
        expect(screen.getByText(/Audio file not found/i)).toBeTruthy()
    })

    it("shows empty-state when fileId is blank", () => {
        render(<AudioViewer fileId="" />)
        expect(screen.getByText(/No audio to play/i)).toBeTruthy()
    })

    it("falls back to network URL when IDB throws (e.g. Private-mode Safari)", async () => {
        ;(getFile as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
            new Error("IDB unavailable"),
        )
        render(<AudioViewer fileId="file-mp3-private" title="Private" />)

        const audio = await waitFor(() => screen.getByLabelText(/Audio: Private/)) as HTMLAudioElement
        expect(audio.getAttribute("src")).toBe("/api/drive/file/file-mp3-private")
    })

    it("revokes the blob: object URL on unmount", async () => {
        const fakeBlob = new Blob(["x"], { type: "audio/mpeg" })
        ;(getFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(fakeBlob)
        const { unmount } = render(<AudioViewer fileId="file-mp3-leak" />)
        await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled())
        unmount()
        await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-audio-url"))
    })
})
