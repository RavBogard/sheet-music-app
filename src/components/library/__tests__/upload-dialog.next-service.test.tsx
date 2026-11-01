import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

/**
 * Polish 1, job 3 ("add a new chart"): the upload dialog lists upcoming
 * services first, and when no setlist was picked its success screen offers
 * "Add to <next service>" instead of closing on its own.
 */

vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { uid: "u1" } }) }))
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }))
vi.mock("@/lib/library-cache", () => ({ broadcastCacheInvalidation: vi.fn() }))
const api = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock("@/lib/api-client", () => api)
vi.mock("@/lib/setlist-firebase", () => ({}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import type { Setlist } from "@/lib/setlist-firebase"
import { UploadDialog } from "../UploadDialog"

const day = (offset: number) => {
    const d = new Date()
    d.setHours(12, 0, 0, 0)
    d.setDate(d.getDate() + offset)
    return d
}

// Caller order is "recently edited first"; the soonest service is last here.
const SETLISTS = [
    { id: "past", name: "Past Service", eventDate: day(-7) },
    { id: "later", name: "Later Service", eventDate: day(14) },
    { id: "soon", name: "Soonest Service", eventDate: day(2) },
] as unknown as Setlist[]

async function uploadOne(onAddToSetlist: ReturnType<typeof vi.fn>, pickSetlist?: string) {
    api.apiFetch.mockResolvedValue({ ok: true, json: async () => ({ fileId: "f-new", title: "New Song" }) })
    render(<UploadDialog setlists={SETLISTS} onAddToSetlist={onAddToSetlist} />)
    fireEvent.click(screen.getByRole("button"))
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(["x"], "new-song.pdf", { type: "application/pdf" })] } })
    if (pickSetlist) fireEvent.change(document.getElementById("upload-setlist")!, { target: { value: pickSetlist } })
    const submit = screen.getAllByRole("button").find((b) => b.textContent?.includes("Upload to Library"))!
    await act(async () => { fireEvent.click(submit) })
    await waitFor(() => expect(screen.getByTestId("upload-success")).toBeDefined())
}

describe("UploadDialog: next service", () => {
    afterEach(() => {
        cleanup()
        vi.clearAllMocks()
    })

    it("lists upcoming services first, soonest first", () => {
        render(<UploadDialog setlists={SETLISTS} onAddToSetlist={vi.fn()} />)
        fireEvent.click(screen.getByRole("button"))
        const input = document.querySelector('input[type="file"]') as HTMLInputElement
        fireEvent.change(input, { target: { files: [new File(["x"], "a.pdf", { type: "application/pdf" })] } })
        const values = Array.from((document.getElementById("upload-setlist") as HTMLSelectElement).options).map((o) => o.value)
        expect(values).toEqual(["", "soon", "later", "past"])
    })

    it("offers the soonest service after upload and adds the new chart to it", async () => {
        const onAdd = vi.fn()
        await uploadOne(onAdd)
        expect(onAdd).not.toHaveBeenCalled()
        fireEvent.click(screen.getByTestId("upload-add-to-next"))
        expect(onAdd).toHaveBeenCalledWith("soon", [expect.objectContaining({ id: "f-new", mimeType: "application/pdf" })])
    })

    it("Done closes without adding", async () => {
        const onAdd = vi.fn()
        await uploadOne(onAdd)
        fireEvent.click(screen.getByTestId("upload-done"))
        expect(onAdd).not.toHaveBeenCalled()
        expect(screen.queryByTestId("upload-success")).toBeNull()
    })

    it("a setlist picked in the form is used, with no second offer", async () => {
        const onAdd = vi.fn()
        await uploadOne(onAdd, "later")
        expect(onAdd).toHaveBeenCalledWith("later", [expect.objectContaining({ id: "f-new" })])
        expect(screen.queryByTestId("upload-add-to-next")).toBeNull()
    })
})
