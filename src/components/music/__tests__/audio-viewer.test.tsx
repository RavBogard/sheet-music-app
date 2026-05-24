import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import { AudioViewer } from "../AudioViewer"

// Mock offline-idb so we can drive the offline branches deterministically.
// In the online branch (new default post audio-viewer-blob-url-fix) the
// import is never reached, so getFile is left untouched in those tests.
vi.mock("@/lib/offline-idb", () => ({
    getFile: vi.fn(),
}))

import { getFile } from "@/lib/offline-idb"

// navigator.onLine helpers. jsdom defaults it to `true`; we redefine
// per test for offline-branch coverage and restore after each.
function setNavigatorOnline(value: boolean) {
    Object.defineProperty(navigator, "onLine", {
        configurable: true,
        get: () => value,
    })
}

beforeEach(() => {
    vi.clearAllMocks()
    URL.createObjectURL = vi.fn(() => "blob:mock-audio-url")
    URL.revokeObjectURL = vi.fn()
    // jsdom's default; restated for explicitness.
    setNavigatorOnline(true)
})

afterEach(() => {
    // Reset to jsdom default after any test that flipped it.
    setNavigatorOnline(true)
})

describe("AudioViewer", () => {
    it("renders an <audio> element with controls + aria-label", async () => {
        render(<AudioViewer fileId="file-mp3-123" title="Adon Olam" />)

        const audio = await waitFor(() =>
            screen.getByLabelText(/Audio: Adon Olam/)
        ) as HTMLAudioElement
        expect(audio.tagName).toBe("AUDIO")
        expect(audio.hasAttribute("controls")).toBe(true)
        expect(audio.getAttribute("preload")).toBe("metadata")
    })

    it("uses /api/drive/file/<id> by default when online (skips IDB lookup — mirrors webkit-pdf-reload-fix)", async () => {
        // Default online state set in beforeEach.
        render(<AudioViewer fileId="file-mp3-online" title="Online Track" />)

        const audio = await waitFor(() => screen.getByLabelText(/Audio: Online Track/)) as HTMLAudioElement
        expect(audio.getAttribute("src")).toBe("/api/drive/file/file-mp3-online")
        // The online branch must NOT touch offline-idb — that's the
        // whole point of the fix.
        expect(getFile).not.toHaveBeenCalled()
        expect(URL.createObjectURL).not.toHaveBeenCalled()
    })

    it("falls back to /api/drive/file/<id> when offline + IDB has no cached blob", async () => {
        setNavigatorOnline(false)
        ;(getFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null)
        render(<AudioViewer fileId="file-mp3-net" title="Net Track" />)

        const audio = await waitFor(() => screen.getByLabelText(/Audio: Net Track/)) as HTMLAudioElement
        expect(audio.getAttribute("src")).toBe("/api/drive/file/file-mp3-net")
        expect(getFile).toHaveBeenCalledWith("file-mp3-net")
        expect(URL.createObjectURL).not.toHaveBeenCalled()
    })

    it("uses a blob: object URL when offline + IDB returns a cached blob (best-effort offline path)", async () => {
        setNavigatorOnline(false)
        const fakeBlob = new Blob(["fake-audio-bytes"], { type: "audio/mpeg" })
        ;(getFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(fakeBlob)
        render(<AudioViewer fileId="file-mp3-cached" title="Cached" />)

        const audio = await waitFor(() => screen.getByLabelText(/Audio: Cached/)) as HTMLAudioElement
        expect(audio.getAttribute("src")).toBe("blob:mock-audio-url")
        expect(URL.createObjectURL).toHaveBeenCalledWith(fakeBlob)
    })

    it("surfaces a clean error message when the audio element fires onError", async () => {
        render(<AudioViewer fileId="file-mp3-404" title="Missing" />)

        const audio = await waitFor(() => screen.getByLabelText(/Audio: Missing/))
        fireEvent.error(audio)
        expect(screen.getByText(/Audio file not found/i)).toBeTruthy()
    })

    it("shows empty-state when fileId is blank", () => {
        render(<AudioViewer fileId="" />)
        expect(screen.getByText(/No audio to play/i)).toBeTruthy()
    })

    it("falls back to network URL when offline + IDB throws (e.g. Private-mode Safari)", async () => {
        setNavigatorOnline(false)
        ;(getFile as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
            new Error("IDB unavailable"),
        )
        render(<AudioViewer fileId="file-mp3-private" title="Private" />)

        const audio = await waitFor(() => screen.getByLabelText(/Audio: Private/)) as HTMLAudioElement
        expect(audio.getAttribute("src")).toBe("/api/drive/file/file-mp3-private")
    })

    it("revokes the blob: object URL on unmount (offline-cached path)", async () => {
        setNavigatorOnline(false)
        const fakeBlob = new Blob(["x"], { type: "audio/mpeg" })
        ;(getFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(fakeBlob)
        const { unmount } = render(<AudioViewer fileId="file-mp3-leak" />)
        await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled())
        unmount()
        await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-audio-url"))
    })

    it("does NOT mint a blob: URL on the online (default) path — nothing to revoke on unmount", async () => {
        // Default online; if the online branch accidentally calls
        // createObjectURL we'd regress webkit-pdf-reload-fix's lesson.
        const { unmount } = render(<AudioViewer fileId="file-mp3-online-leak" title="OnlineLeak" />)
        await waitFor(() => screen.getByLabelText(/Audio: OnlineLeak/))
        unmount()
        expect(URL.createObjectURL).not.toHaveBeenCalled()
        expect(URL.revokeObjectURL).not.toHaveBeenCalled()
    })
})
