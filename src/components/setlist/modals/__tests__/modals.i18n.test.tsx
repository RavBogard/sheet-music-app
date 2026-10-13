import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, screen } from "@testing-library/react"

/** Phase 7 i18n: the setlist modals (Add Songs, Link chart, Edit Details, Name prompt) come through t(). */

const FILES = [
    { id: "f1", name: "Test Song A.pdf", mimeType: "application/pdf" },
    { id: "f2", name: "Test Song B.musicxml", mimeType: "application/vnd.recordare.musicxml+xml" },
]

vi.mock("@/lib/congregation-store", () => ({
    useCongregation: () => ({ scheduling: { rabbiProfiles: [{ name: "Rabbi Test" }] } }),
}))
vi.mock("@/lib/library-store", () => ({
    useLibraryStore: () => ({ allFiles: FILES, displayedFiles: FILES, initialized: true, setFilter: vi.fn() }),
}))
vi.mock("@/hooks/use-library", () => ({ useLibrary: () => undefined }))
vi.mock("@/lib/song-suggestions", () => ({
    fetchUsageData: vi.fn(async () => new Map([["f1", { lastUsedDate: "2026-01-01", totalUses: 4, lastUsedSetlistName: "Test Setlist A" }]])),
    // `reason` is built in English by src/lib/song-suggestions.ts (not this lane's file).
    getSuggestions: () => [{ file: FILES[0], reason: "Used 4× — Test Setlist A", category: "staple" }],
}))

import { renderPseudo, renderWithI18n, expectNoUntranslatedText } from "@/test-utils/i18n"
import { AddSongsModal } from "../AddSongsModal"
import { MatchFileModal } from "../MatchFileModal"
import { EditDetails } from "../EditDetails"
import { NamePrompt } from "../NamePrompt"

// Data: file names (and their mime subtype shown under the name), setlist name,
// rabbi name, typed values; the suggestion reason (lib-built, see above);
// "Close" is the shared ui/dialog + ui/sheet close button (not this lane's file).
const ALLOW: Array<string | RegExp> = [
    "Close", "Test Song A.pdf", "Test Song B.musicxml", "Test Song A", "Test Song B",
    "pdf", "vnd.recordare.musicxml+xml", "Setlist A", "Rabbi Test", "Notes A",
    "Used 4× — Test Setlist A", "Test Song",
]
const check = () => expectNoUntranslatedText(document.body, { allow: ALLOW })

async function renderAll(rtl: boolean) {
    const r1 = renderPseudo(<AddSongsModal isOpen onClose={() => {}} onAdd={() => {}} />, { rtl })
    await act(async () => {})
    fireEvent.click(screen.getAllByText("Test Song A.pdf").at(-1)!)
    check()
    cleanup()

    renderPseudo(<MatchFileModal isOpen onClose={() => {}} onMatch={() => {}} />, { rtl })
    check()
    cleanup()
    renderPseudo(<MatchFileModal isOpen onClose={() => {}} onMatch={() => {}} trackTitle="Test Song" />, { rtl })
    check()
    cleanup()

    renderPseudo(
        <EditDetails isOpen onClose={() => {}} initialName="Setlist A" initialDate={null} initialRabbi="" initialServiceNotes="Notes A" onConfirm={() => {}} />,
        { rtl },
    )
    check()
    cleanup()
    renderPseudo(
        <EditDetails isOpen onClose={() => {}} initialName="Setlist A" initialDate={new Date(2026, 2, 7)} initialRabbi="Rabbi Test" initialServiceNotes="" onConfirm={() => {}} />,
        { rtl },
    )
    check()
    cleanup()

    const r = renderPseudo(<NamePrompt isOpen onClose={() => {}} initialName="Setlist A" onConfirm={() => {}} />, { rtl })
    check()
    void r1
    return r
}

describe("setlist modals i18n (pseudo-locale)", () => {
    afterEach(() => cleanup())

    it("qps: every modal comes through t()", async () => {
        await renderAll(false)
    })

    it("qps-rtl: renders rtl with no untranslated text", async () => {
        const r = await renderAll(true)
        expect(r.container.querySelector('[dir="rtl"]')).not.toBeNull()
    })

    it("en: plural + date text stay as today", async () => {
        renderWithI18n(<AddSongsModal isOpen onClose={() => {}} onAdd={() => {}} />)
        await act(async () => {})
        expect(screen.getByText("Add Songs (0 selected)")).toBeTruthy()
        expect(screen.getByText("Add 0 Songs")).toBeTruthy()
        fireEvent.click(screen.getAllByText("Test Song A.pdf").at(-1)!)
        expect(screen.getByText("Add 1 Song")).toBeTruthy()
        cleanup()
        renderWithI18n(
            <EditDetails isOpen onClose={() => {}} initialName="Setlist A" initialDate={new Date(2026, 2, 7)} initialRabbi="" initialServiceNotes="" onConfirm={() => {}} />,
        )
        expect(screen.getByText("March 7th, 2026")).toBeTruthy()
        cleanup()
        renderWithI18n(<MatchFileModal isOpen onClose={() => {}} onMatch={() => {}} trackTitle="Test Song" />)
        expect(screen.getByText('Link chart for "Test Song"')).toBeTruthy()
    })
})
