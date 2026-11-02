import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

/**
 * The Library upload takes audio: an audio file asks which song it's a
 * recording of (this site's songs only) and uploads as that song's recording.
 */

vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { uid: "u1" } }) }))
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }))
vi.mock("@/lib/library-cache", () => ({ broadcastCacheInvalidation: vi.fn() }))
const api = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock("@/lib/api-client", () => api)
vi.mock("@/lib/setlist-firebase", () => ({}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
const rec = vi.hoisted(() => ({ uploadRecording: vi.fn() }))
vi.mock("@/lib/recordings/recordings-client", () => rec)

import { useLibraryStore } from "@/lib/library-store"
import { UploadDialog } from "../UploadDialog"

function openWith(file: File) {
    render(<UploadDialog />)
    fireEvent.click(screen.getByRole("button"))
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(input.accept).toContain(".mp3")
    expect(input.accept).toContain(".m4a")
    fireEvent.change(input, { target: { files: [file] } })
}

describe("UploadDialog: audio becomes a recording", () => {
    afterEach(() => {
        cleanup()
        vi.clearAllMocks()
    })

    it("asks which song, then uploads the file as that song's recording", async () => {
        useLibraryStore.getState().hydrate([
            { id: "song-a", name: "Hashkiveinu.pdf", mimeType: "application/pdf", orgId: "crc" },
            { id: "song-b", name: "Oseh Shalom.pdf", mimeType: "application/pdf", orgId: "crc" },
            { id: "song-x", name: "Hashkiveinu gig.pdf", mimeType: "application/pdf", orgId: "brotherslazaroff" },
        ])
        rec.uploadRecording.mockResolvedValue({ recordingId: "rec-1", title: "take" })
        openWith(new File(["x"], "take.mp3", { type: "" }))

        expect(screen.getByTestId("recording-upload-branch")).toBeDefined()
        expect(document.getElementById("upload-key")).toBeNull()
        const submit = screen.getByTestId("recording-upload-submit") as HTMLButtonElement
        expect(submit.disabled).toBe(true)

        fireEvent.change(document.getElementById("recording-song-search")!, { target: { value: "hashk" } })
        const options = screen.getByTestId("recording-song-picker").querySelectorAll("button[data-song-id]")
        expect(Array.from(options).map((b) => b.getAttribute("data-song-id"))).toEqual(["song-a"])
        fireEvent.click(options[0])

        await act(async () => { fireEvent.click(screen.getByTestId("recording-upload-submit")) })
        expect(rec.uploadRecording).toHaveBeenCalledWith(expect.objectContaining({ songId: "song-a", title: "take" }))
        expect(api.apiFetch).not.toHaveBeenCalled()
        await waitFor(() => expect(screen.getByTestId("upload-success")).toBeDefined())
    })

    it("shows the upload's error message", async () => {
        useLibraryStore.getState().hydrate([{ id: "song-a", name: "Hashkiveinu.pdf", mimeType: "application/pdf", orgId: "crc" }])
        rec.uploadRecording.mockRejectedValue(new Error("The upload stopped."))
        openWith(new File(["x"], "take.m4a", { type: "audio/mp4" }))
        fireEvent.click(screen.getByTestId("recording-song-picker").querySelector("button[data-song-id]")!)
        await act(async () => { fireEvent.click(screen.getByTestId("recording-upload-submit")) })
        expect(screen.getByRole("alert").textContent).toBe("The upload stopped.")
    })

    it("a chart still takes the chart form", () => {
        openWith(new File(["x"], "chart.pdf", { type: "application/pdf" }))
        expect(screen.queryByTestId("recording-upload-branch")).toBeNull()
        expect(document.getElementById("upload-key")).not.toBeNull()
    })
})
