/**
 * Modal state-reset regression suite (v44-06).
 *
 * Locks the close/reopen invariants for the setlist-adjacent modals called
 * out in the v4.4 R2B client-UX audit:
 *   - AC-1 (UX-001): EditDetails re-seeds from props on every open
 *   - AC-2 (UX-002): NamePrompt input resets between opens
 *
 * The third locked invariant (AC-5: SwapPicker clears query + selection on
 * reopen) was retired in v50-02 along with the live-swap UI surface.
 *
 * Admin components (UserRow, CollapsibleSection) are intentionally NOT
 * tested here — per project memory "Admin panels left unstyled (out of
 * scope)", their bug fixes ship without test-locking.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import React from "react"

// ──────────────────────────────────────────────────────────────────────────
// Shared mocks
// ──────────────────────────────────────────────────────────────────────────
vi.mock("@/lib/congregation-store", () => ({
    useCongregation: () => ({ scheduling: { rabbiProfiles: [] } }),
}))

import { EditDetails } from "../EditDetails"
import { NamePrompt } from "../NamePrompt"

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
