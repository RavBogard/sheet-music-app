import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

/**
 * On brotherslazaroff.live the recording song picker lists Brothers Lazaroff
 * songs straight from the SSR library rows (which now carry orgId), not only
 * after the client library fetch lands.
 */
const org = vi.hoisted(() => ({ id: "brotherslazaroff" }))
vi.mock("@/lib/org/org-context", () => ({ useOrg: () => org.id }))

import { useLibraryStore } from "@/lib/library-store"
import type { LibraryFile } from "@/lib/server-library"
import { RecordingSongPicker } from "../RecordingSongPicker"

// The SSR shape (LibraryFileSchema output) for one row of each tenant.
const SSR_ROWS: LibraryFile[] = [
    { id: "bl-1", name: "Gig Opener.pdf", mimeType: "application/pdf", parents: [], orgId: "brotherslazaroff", status: "active" },
    { id: "crc-1", name: "Hashkiveinu.pdf", mimeType: "application/pdf", parents: [], orgId: "crc" },
    { id: "legacy", name: "Old Chart.pdf", mimeType: "application/pdf", parents: [] },
]

describe("RecordingSongPicker tenant scope", () => {
    afterEach(() => cleanup())

    it("a Brothers Lazaroff row from the SSR list shows in the BL picker, CRC rows don't", () => {
        useLibraryStore.getState().hydrate(SSR_ROWS as never)
        render(<RecordingSongPicker onPick={vi.fn()} />)
        const ids = Array.from(screen.getByTestId("recording-song-picker").querySelectorAll("button[data-song-id]")).map((b) => b.getAttribute("data-song-id"))
        expect(ids).toEqual(["bl-1"])
    })
})
