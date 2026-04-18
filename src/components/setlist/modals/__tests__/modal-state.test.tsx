/**
 * Modal state-reset regression suite (v44-06).
 *
 * Locks the close/reopen invariants for the three setlist-adjacent modals
 * called out in the v4.4 R2B client-UX audit:
 *   - AC-1 (UX-001): EditDetails re-seeds from props on every open
 *   - AC-2 (UX-002): NamePrompt input resets between opens
 *   - AC-5 (UX-015): SwapPicker clears query + selection on reopen
 *
 * Admin components (UserRow, CollapsibleSection) are intentionally NOT
 * tested here — per project memory "Admin panels left unstyled (out of
 * scope)", their bug fixes ship without test-locking.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest"
import { render, screen, act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import React from "react"

// jsdom doesn't implement scrollIntoView — SwapPicker uses it for keyboard-nav.
beforeAll(() => {
    if (!(HTMLElement.prototype as unknown as { scrollIntoView?: unknown }).scrollIntoView) {
        (HTMLElement.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => { }
    }
})

// ──────────────────────────────────────────────────────────────────────────
// Shared mocks
// ──────────────────────────────────────────────────────────────────────────
vi.mock("@/lib/congregation-store", () => ({
    useCongregation: () => ({ scheduling: { rabbiProfiles: [] } }),
}))

// SwapPicker reads allFiles through a zustand selector.
const mockAllFiles = [
    { id: "a", name: "Alpha.pdf", mimeType: "application/pdf" },
    { id: "b", name: "Bravo.pdf", mimeType: "application/pdf" },
    { id: "c", name: "Charlie.pdf", mimeType: "application/pdf" },
]
vi.mock("@/lib/library-store", () => ({
    useLibraryStore: (selector: (s: { allFiles: typeof mockAllFiles }) => unknown) =>
        selector({ allFiles: mockAllFiles }),
}))

import { EditDetails } from "../EditDetails"
import { NamePrompt } from "../NamePrompt"
import { SwapPicker } from "@/components/performance/SwapPicker"

// ──────────────────────────────────────────────────────────────────────────
// AC-1 — EditDetails
// ──────────────────────────────────────────────────────────────────────────
describe("EditDetails modal-state reset", () => {
    beforeEach(() => vi.clearAllMocks())

    it("re-seeds all fields from props on consecutive opens with different setlist data", async () => {
        const user = userEvent.setup()
        const onClose = vi.fn()
        const onConfirm = vi.fn()

        const { rerender } = render(
            <EditDetails
                isOpen={true}
                onClose={onClose}
                initialName="Setlist A"
                initialDate={null}
                initialRabbi=""
                initialServiceNotes="Notes A"
                onConfirm={onConfirm}
            />
        )

        const nameInput = screen.getByPlaceholderText("Setlist name") as HTMLInputElement
        expect(nameInput.value).toBe("Setlist A")

        // User types a draft edit but doesn't save.
        await user.clear(nameInput)
        await user.type(nameInput, "Modified draft")
        expect(nameInput.value).toBe("Modified draft")

        // Close the modal.
        rerender(
            <EditDetails
                isOpen={false}
                onClose={onClose}
                initialName="Setlist A"
                initialDate={null}
                initialRabbi=""
                initialServiceNotes="Notes A"
                onConfirm={onConfirm}
            />
        )

        // Reopen with a DIFFERENT setlist's props.
        rerender(
            <EditDetails
                isOpen={true}
                onClose={onClose}
                initialName="Setlist B"
                initialDate={null}
                initialRabbi=""
                initialServiceNotes="Notes B"
                onConfirm={onConfirm}
            />
        )

        const rerenderedName = screen.getByPlaceholderText("Setlist name") as HTMLInputElement
        expect(rerenderedName.value).toBe("Setlist B")
        const notesArea = screen.getByPlaceholderText(/Bar Mitzvah/i) as HTMLTextAreaElement
        expect(notesArea.value).toBe("Notes B")
    })
})

// ──────────────────────────────────────────────────────────────────────────
// AC-2 — NamePrompt
// ──────────────────────────────────────────────────────────────────────────
describe("NamePrompt modal-state reset", () => {
    it("resets the input to the new defaultValue after close/reopen", async () => {
        const user = userEvent.setup()
        const onClose = vi.fn()
        const onConfirm = vi.fn()

        const { rerender } = render(
            <NamePrompt
                isOpen={true}
                onClose={onClose}
                initialName="A"
                onConfirm={onConfirm}
            />
        )

        const input = screen.getByPlaceholderText(/Shabbat Morning/i) as HTMLInputElement
        expect(input.value).toBe("A")

        await user.clear(input)
        await user.type(input, "Annual")
        expect(input.value).toBe("Annual")

        // Close.
        rerender(
            <NamePrompt
                isOpen={false}
                onClose={onClose}
                initialName="A"
                onConfirm={onConfirm}
            />
        )

        // Reopen with a new initialName.
        rerender(
            <NamePrompt
                isOpen={true}
                onClose={onClose}
                initialName="B"
                onConfirm={onConfirm}
            />
        )

        const reopened = screen.getByPlaceholderText(/Shabbat Morning/i) as HTMLInputElement
        expect(reopened.value).toBe("B")
    })
})

// ──────────────────────────────────────────────────────────────────────────
// AC-5 — SwapPicker
// ──────────────────────────────────────────────────────────────────────────
describe("SwapPicker modal-state reset", () => {
    it("clears query and selection index when reopened", async () => {
        const user = userEvent.setup()
        const onClose = vi.fn()
        const onSelect = vi.fn()
        const currentTrack = {
            id: "t1",
            fileId: "z",
            title: "Current",
            isSong: true,
        } as unknown as import("@/types/models").SetlistTrack

        const { rerender } = render(
            <SwapPicker
                open={true}
                onClose={onClose}
                currentTrack={currentTrack}
                onSelectReplacement={onSelect}
            />
        )

        const searchInput = screen.getByLabelText(/Search replacement song/i) as HTMLInputElement
        await user.type(searchInput, "abc")
        expect(searchInput.value).toBe("abc")

        // Arrow-down twice to move highlight away from index 0.
        // (Even if the filtered result set is empty, this should be a no-op
        // and not throw.)
        await user.keyboard("{ArrowDown}{ArrowDown}")

        // Close.
        rerender(
            <SwapPicker
                open={false}
                onClose={onClose}
                currentTrack={currentTrack}
                onSelectReplacement={onSelect}
            />
        )

        // Reopen.
        await act(async () => {
            rerender(
                <SwapPicker
                    open={true}
                    onClose={onClose}
                    currentTrack={currentTrack}
                    onSelectReplacement={onSelect}
                />
            )
        })

        const reopenedInput = screen.getByLabelText(/Search replacement song/i) as HTMLInputElement
        expect(reopenedInput.value).toBe("")

        // First row should be the highlighted one (data-selected="true").
        const rows = document.querySelectorAll<HTMLElement>("[data-swap-row]")
        expect(rows.length).toBeGreaterThan(0)
        expect(rows[0].getAttribute("data-selected")).toBe("true")
    })
})
