import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, waitFor } from "@testing-library/react"

/** Phase 7 i18n: every ImporterModal string, on every step, comes through t(). */

const apiFetch = vi.fn()
vi.mock("@/lib/api-client", () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { renderPseudo, renderWithI18n, expectNoUntranslatedText } from "@/test-utils/i18n"
import { ImporterModal } from "../ImporterModal"

const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body })

const RESOLVED = {
    sections: [{ name: "Section One", order: 0 }],
    tracks: [
        { title: "Test Song A", order: 0, sectionName: "Section One", key: "C", vocalLead: "Singer X", libraryMatch: { fileId: "f1", name: "Test Chart A", confidence: 0.9 }, missingChart: false, recordingCandidates: [{ fileId: "r1", name: "Rec A", confidence: 0.9 }] },
        { title: "Test Song B", order: 1, missingChart: true, recordingCandidates: [] },
    ],
}

const PARSED = {
    items: [
        { type: "header", title: "Opening" },
        { type: "song", title: "Test Song A", key: "D", performer: "Singer X", chartUrl: "https://drive.example/a", libraryMatchId: "f1", libraryMatchName: "Test Chart A" },
        { type: "song", title: "Test Song B", chartError: "Private Link" },
        { type: "song", title: "Test Song C", chartError: "Invalid Link" },
        { type: "song", title: "Test Song D" },
    ],
}

// Data: file name, setlist name, song/chart titles, people, section names, keys,
// the "x.x KB" file size (unit, i18n-ignore), the Google Sheets example URL
// placeholder (i18n-ignore), numbers, and the shared ui/dialog "Close" button.
const ALLOW: Array<string | RegExp> = [
    "Close", "test-outline.docx", "test-outline", "Section One", "Opening",
    "Test Song A", "Test Song B", "Test Song C", "Test Song D", "Test Chart A", "Singer X",
    /^\d+(\.\d+)? KB$/, /^\d+%?$/, /^[A-G][#b]?$/, "https://docs.google.com/spreadsheets/d/...", "*",
    "https://drive.example/a",
    // A translated sentence with a bold {var} (withBold/countBold) is split into
    // text nodes around the <strong>: the pieces carry only one marker each.
    /^⟦[^⟧]*$/, /^[^⟦]*⟧$/,
]

function check() {
    expectNoUntranslatedText(document.body, { allow: ALLOW })
}

function primaryButton(): HTMLButtonElement {
    const btns = [...document.querySelectorAll("button.bg-brand")] as HTMLButtonElement[]
    return btns[btns.length - 1]
}

async function walkDocumentFlow(rtl: boolean) {
    apiFetch.mockImplementation(async (url: string) => {
        if (url.includes("extract-document")) return json({ text: "outline" })
        if (url.includes("extract-structure")) return json({ sections: RESOLVED.sections, tracks: RESOLVED.tracks })
        if (url.includes("resolve")) return json(RESOLVED)
        throw new Error("unexpected " + url)
    })
    const r = renderPseudo(<ImporterModal open onOpenChange={() => {}} />, { rtl })
    // Step 1: input.
    check()
    const doc = document.getElementById("doc-file-input") as HTMLInputElement
    fireEvent.change(doc, { target: { files: [new File(["x".repeat(2048)], "test-outline.docx")] } })
    check()
    await act(async () => { fireEvent.click(primaryButton()) })
    // Step: interview.
    await waitFor(() => expect(document.getElementById("interview-name")).not.toBeNull())
    check()
    fireEvent.change(document.getElementById("interview-date") as HTMLInputElement, { target: { value: "2026-03-07" } })
    fireEvent.click(primaryButton())
    // Step: preview (date via fmt.pattern, service type via catalogue).
    await waitFor(() => expect(document.body.textContent).toContain("Test Chart A"))
    check()
    return r
}

describe("ImporterModal i18n (pseudo-locale)", () => {
    beforeEach(() => { apiFetch.mockReset() })
    afterEach(() => cleanup())

    it("qps: document path (input → interview → preview) comes through t()", async () => {
        await walkDocumentFlow(false)
    })

    it("qps: spreadsheet review table comes through t()", async () => {
        apiFetch.mockImplementation(async () => json(PARSED))
        renderPseudo(<ImporterModal open onOpenChange={() => {}} />)
        const csv = document.getElementById("csv-file-input") as HTMLInputElement
        fireEvent.change(csv, { target: { files: [new File(["a,b"], "test-sheet.csv")] } })
        await act(async () => { fireEvent.click(primaryButton()) })
        await waitFor(() => expect(document.querySelector("table")).not.toBeNull())
        expectNoUntranslatedText(document.body, { allow: [...ALLOW, "test-sheet.csv"] })
    })

    it("en: bold count sentences keep today's English", async () => {
        apiFetch.mockImplementation(async () => json(PARSED))
        renderWithI18n(<ImporterModal open onOpenChange={() => {}} />)
        const csv = document.getElementById("csv-file-input") as HTMLInputElement
        fireEvent.change(csv, { target: { files: [new File(["a,b"], "test-sheet.csv")] } })
        await act(async () => { fireEvent.click(primaryButton()) })
        await waitFor(() => expect(document.querySelector("table")).not.toBeNull())
        const spans = [...document.querySelectorAll("span")].map((s) => s.innerHTML)
        expect(spans).toContain("<strong>4</strong> songs found")
        expect(spans).toContain("<strong>0</strong> new Drive PDFs will be downloaded")
        expect(document.body.innerHTML).toContain("Matches library: <strong>Test Chart A</strong>")
    })

    it("qps-rtl: renders rtl with no untranslated text", async () => {
        const r = await walkDocumentFlow(true)
        expect(r.container.querySelector('[dir="rtl"]')).not.toBeNull()
    })
})
