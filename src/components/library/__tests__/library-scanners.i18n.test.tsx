import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, screen } from "@testing-library/react"
import type { DriveFile } from "@/types/models"

/** Phase 7 i18n: PDFHealthScanner and DuplicateScanner strings come through t(). */

const scan = vi.hoisted(() => ({ results: [] as Array<{ fileId: string; fileName: string; status: string; error?: string }> }))
vi.mock("@/lib/pdf-health-scanner", () => ({
    scanLibraryHealth: vi.fn(async () => scan.results),
}))
vi.mock("@/lib/api-client", () => ({ apiFetch: vi.fn() }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { renderPseudo, renderWithI18n, expectNoUntranslatedText } from "@/test-utils/i18n"
import { PDFHealthScanner } from "../PDFHealthScanner"
import { DuplicateScanner } from "../DuplicateScanner"

const FILES: DriveFile[] = [
    { id: "a", name: "Test Song A.pdf", mimeType: "application/pdf" },
    { id: "b", name: "Test Song A (1).pdf", mimeType: "application/pdf" },
    { id: "c", name: "Test Song B.pdf", mimeType: "application/pdf" },
]
// "Close" is the shared Dialog close button (src/components/ui/dialog.tsx, not this lane's file).
const DATA = ["Test Song A.pdf", "Test Song A (1).pdf", "Test Song B.pdf", "PDF", "Close"]

async function clickLastButton() {
    const buttons = Array.from(document.querySelectorAll('[role="dialog"] button')).filter((b) => !b.querySelector(".sr-only") && b.textContent)
    await act(async () => {
        fireEvent.click(buttons[buttons.length - 1])
    })
}

describe.each([false, true])("library scanners i18n (rtl=%s)", (rtl) => {
    afterEach(() => cleanup())

    it("PDFHealthScanner: intro, flagged list, and all-healthy states", async () => {
        scan.results = [
            { fileId: "a", fileName: "Test Song A.pdf", status: "corrupt", error: "bad xref" },
            { fileId: "b", fileName: "Test Song A (1).pdf", status: "fetch-error" },
            { fileId: "c", fileName: "Test Song B.pdf", status: "healthy" },
        ]
        const r = renderPseudo(<PDFHealthScanner files={FILES} onArchiveComplete={() => {}} />, { rtl })
        if (rtl) expect(r.container.querySelector('[dir="rtl"]')).not.toBeNull()
        expectNoUntranslatedText(document.body, { allow: DATA })
        fireEvent.click(screen.getByRole("button"))
        expectNoUntranslatedText(document.body, { allow: DATA })
        await clickLastButton() // Scan PDFs
        // The technical error text is data from the scanner; it is interpolated inside the translated line.
        expectNoUntranslatedText(document.body, { allow: DATA })
        expect(document.body.textContent).toContain("bad xref")
        cleanup()

        scan.results = [{ fileId: "c", fileName: "Test Song B.pdf", status: "healthy" }]
        renderPseudo(<PDFHealthScanner files={FILES} onArchiveComplete={() => {}} />, { rtl })
        fireEvent.click(screen.getByRole("button"))
        await clickLastButton()
        expectNoUntranslatedText(document.body, { allow: DATA })
    })

    it("DuplicateScanner: intro, groups, and none-found states", async () => {
        const r = renderPseudo(<DuplicateScanner files={FILES} onArchiveComplete={() => {}} />, { rtl })
        if (rtl) expect(r.container.querySelector('[dir="rtl"]')).not.toBeNull()
        expectNoUntranslatedText(document.body, { allow: DATA })
        fireEvent.click(screen.getByRole("button"))
        expectNoUntranslatedText(document.body, { allow: DATA })
        await clickLastButton() // Scan Library
        expect(document.querySelectorAll('[role="dialog"] input[type="checkbox"]').length).toBeGreaterThan(0)
        expectNoUntranslatedText(document.body, { allow: DATA })
        cleanup()

        renderPseudo(<DuplicateScanner files={[FILES[2]]} onArchiveComplete={() => {}} />, { rtl })
        fireEvent.click(screen.getByRole("button"))
        await clickLastButton()
        expectNoUntranslatedText(document.body, { allow: DATA })
    })
})

describe("library scanners English output is unchanged", () => {
    afterEach(() => cleanup())

    it("plural and interpolated lines read as before", async () => {
        scan.results = [
            { fileId: "a", fileName: "Test Song A.pdf", status: "corrupt", error: "bad xref" },
            { fileId: "c", fileName: "Test Song B.pdf", status: "healthy" },
        ]
        renderWithI18n(<PDFHealthScanner files={FILES} onArchiveComplete={() => {}} />)
        fireEvent.click(screen.getByRole("button"))
        expect(screen.getByText("Scan 3 PDFs to detect corrupt or unloadable files.")).toBeTruthy()
        await clickLastButton()
        expect(screen.getByText("Corrupt: bad xref")).toBeTruthy()
        expect(screen.getByText("1 issue found, 1 healthy")).toBeTruthy()
        expect(screen.getByText("1 selected for archival")).toBeTruthy()
        cleanup()

        renderWithI18n(<DuplicateScanner files={FILES} onArchiveComplete={() => {}} />)
        fireEvent.click(screen.getByRole("button"))
        expect(screen.getByText("Scan 3 charts for potential duplicates using name similarity.")).toBeTruthy()
        await clickLastButton()
        expect(screen.getByText(/^Group 1 — \d+% similar$/)).toBeTruthy()
        expect(screen.getByText(/^\d+ charts$/)).toBeTruthy()
    })
})
