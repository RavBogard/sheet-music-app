import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

/** Phase 7 i18n: dashboard toolbar, the delete/duplicate/transfer dialogs, the dashboard shell, the audio picker and the editor error page. */

const dash = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))
vi.mock("@/hooks/use-setlist-dashboard", () => ({ useSetlistDashboard: () => dash.value }))
vi.mock("@/lib/congregation-store", () => ({ useCongregation: () => ({ shortName: "CRC" }) }))
// The greeting comes from src/lib/greeting.ts (not this lane's file); stub it to a fixed data string.
vi.mock("@/lib/greeting", () => ({ getContextualGreeting: () => ({ text: "GREETING-STUB" }) }))
vi.mock("../wizard/CreationWizard", () => ({ CreationWizard: () => null }))
vi.mock("../importer/ImporterModal", () => ({ ImporterModal: () => null }))
vi.mock("../SetlistMatrixView", () => ({ SetlistMatrixView: () => null }))
vi.mock("@/components/calendar/UnifiedCalendar", () => ({ UnifiedCalendar: () => null }))
vi.mock("@/lib/cache-utils", () => ({ isFileCached: vi.fn(async () => false) }))
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }))
const lib = vi.hoisted(() => ({ value: { allFiles: [] as Array<{ id: string; name: string; mimeType: string }>, loading: false } }))
vi.mock("@/lib/library-store", () => ({ useLibraryStore: () => lib.value }))

import { renderPseudo, expectNoUntranslatedText } from "@/test-utils/i18n"
import { SetlistToolbar } from "../SetlistToolbar"
import { DeleteSetlistDialog, DuplicateSetlistDialog, TransferSetlistDialog } from "../SetlistDialogs"
import { SetlistDashboard } from "../SetlistDashboard"
import { AudioFilePicker } from "../AudioFilePicker"
import SetlistEditorError from "@/app/(main)/setlists/[id]/error"

const NAME = "Test Setlist A"
const RABBI = "Testrabbi"
const noop = () => {}

function toolbar() {
    return (
        <SetlistToolbar
            view="list"
            onViewChange={noop}
            searchQuery=""
            onSearchChange={noop}
            rabbiFilter=""
            onRabbiFilterChange={noop}
            availableRabbis={[RABBI]}
        />
    )
}

function dashboardValue(over: Record<string, unknown> = {}) {
    const upcomingSetlist = { id: "u1", name: "Test Setlist Upcoming", eventDate: new Date(2026, 9, 9).toISOString(), trackCount: 2 }
    const pastSetlist = { id: "p1", name: NAME, eventDate: new Date(2026, 8, 1).toISOString(), trackCount: 4 }
    return {
        router: { push: noop }, user: { uid: "u", displayName: "Test User" }, signIn: noop,
        isMember: true, isBandLeader: true, isAdmin: false, onBack: noop, onCreateNew: noop,
        loading: false, error: null, activeTab: "personal", setActiveTab: noop, view: "list", setView: noop,
        searchQuery: "", setSearchQuery: noop, rabbiFilter: "", setRabbiFilter: noop, navigatingTo: null,
        deleteConfirmOpen: false, setDeleteConfirmOpen: noop, setlistToDelete: null,
        duplicateConfirmOpen: false, setDuplicateConfirmOpen: noop, setlistToDuplicate: null,
        showTransferDialog: false, setShowTransferDialog: noop,
        showImporterModal: false, setShowImporterModal: noop,
        selectedSetlistForTransfer: null, transferEmail: "", setTransferEmail: noop,
        handleSelect: noop, handleDeleteClick: noop, confirmDelete: noop,
        handleDuplicateClick: noop, confirmDuplicate: noop, handleCloneNextWeekClick: noop,
        handleSaveAsTemplateClick: noop, handleSaveAsDefaultClick: noop, handleTransfer: noop, transferring: false,
        handleCreateFromCalendar: noop, handleCreateFromTemplate: noop, handleDownload: noop,
        availableRabbis: [], displayedSetlists: [upcomingSetlist, pastSetlist],
        upcoming: [upcomingSetlist], pastOrNoDate: [pastSetlist], placeholders: [{ date: new Date(2026, 9, 16) }],
        hasUpcoming: true, isDownloading: false,
        nextCursor: "c1", loadMore: noop, loadingMore: false,
        ...over,
    }
}

describe.each([false, true])("setlist toolbar + dialogs i18n (rtl=%s)", (rtl) => {
    afterEach(() => cleanup())

    it("SetlistToolbar: view switch, rabbi chips, open search", () => {
        const r = renderPseudo(toolbar(), { rtl })
        if (rtl) expect(r.container.querySelector('[dir="rtl"]')).not.toBeNull()
        expectNoUntranslatedText(document.body)
        fireEvent.click(document.querySelector("button") as HTMLElement) // search toggle
        expect(document.querySelector("input")).not.toBeNull()
        expectNoUntranslatedText(document.body, { attributes: ["title", "aria-label", "placeholder"] })
    })

    it("DeleteSetlistDialog", () => {
        renderPseudo(<DeleteSetlistDialog open onOpenChange={noop} setlistName={NAME} onConfirm={noop} />, { rtl })
        expect(document.querySelector('[role="alertdialog"]')).not.toBeNull()
        expectNoUntranslatedText(document.body)
    })

    it("DuplicateSetlistDialog", () => {
        renderPseudo(<DuplicateSetlistDialog open onOpenChange={noop} setlistName={NAME} onConfirm={noop} />, { rtl })
        expectNoUntranslatedText(document.body)
    })

    it("TransferSetlistDialog, idle and transferring", () => {
        renderPseudo(<TransferSetlistDialog open onClose={noop} setlistName={NAME} email="" onEmailChange={noop} onConfirm={noop} />, { rtl })
        expectNoUntranslatedText(document.body, { allow: [NAME] })
        cleanup()
        renderPseudo(<TransferSetlistDialog open onClose={noop} setlistName={NAME} email="x@example.com" onEmailChange={noop} onConfirm={noop} transferring />, { rtl })
        expectNoUntranslatedText(document.body, { allow: [NAME] })
    })

    it("SetlistDashboard: list view with upcoming, past, placeholder, load-older", () => {
        dash.value = dashboardValue()
        const r = renderPseudo(<SetlistDashboard />, { rtl })
        if (rtl) expect(r.container.querySelector('[dir="rtl"]')).not.toBeNull()
        expectNoUntranslatedText(document.body, { allow: ["GREETING-STUB", NAME, "Test Setlist Upcoming"] })
        cleanup()

        dash.value = dashboardValue({ error: "boom", pastOrNoDate: [], nextCursor: null, loadingMore: true })
        renderPseudo(<SetlistDashboard />, { rtl })
        // `error` text is the hook's (data here); the title and retry label are this file's.
        expectNoUntranslatedText(document.body, { allow: ["GREETING-STUB", "boom"] })
        cleanup()

        dash.value = dashboardValue({ pastOrNoDate: [], loadingMore: true })
        renderPseudo(<SetlistDashboard />, { rtl })
        expectNoUntranslatedText(document.body, { allow: ["GREETING-STUB", "Test Setlist Upcoming"] })
    })

    it("AudioFilePicker: empty state and file list", () => {
        renderPseudo(<AudioFilePicker onSelect={noop} />, { rtl })
        expectNoUntranslatedText(document.body)
        fireEvent.click(screen.getByRole("button"))
        // "Close" is the shared Dialog close button (src/components/ui/dialog.tsx, not this lane's file).
        expectNoUntranslatedText(document.body, {})
        cleanup()

        lib.value = { allFiles: [{ id: "a1", name: "Test Track A.mp3", mimeType: "audio/mpeg" }], loading: false }
        renderPseudo(<AudioFilePicker onSelect={noop} currentFileId="a1" />, { rtl })
        fireEvent.click(screen.getByRole("button"))
        expectNoUntranslatedText(document.body, { allow: ["Test Track A.mp3"] })
        lib.value = { allFiles: [], loading: true }
        cleanup()
        renderPseudo(<AudioFilePicker onSelect={noop} />, { rtl })
        fireEvent.click(screen.getByRole("button"))
        expectNoUntranslatedText(document.body, {})
        lib.value = { allFiles: [], loading: false }
    })

    it("setlist editor error page", () => {
        const r = renderPseudo(<SetlistEditorError _error={new Error("x")} reset={noop} />, { rtl })
        if (rtl) expect(r.container.querySelector('[dir="rtl"]')).not.toBeNull()
        expectNoUntranslatedText(document.body)
    })
})

describe("toolbar + dialogs English output is unchanged", () => {
    afterEach(() => cleanup())

    it("renders today's English", () => {
        render(toolbar())
        expect(screen.getByText("All Setlists")).toBeDefined()
        expect(screen.getByText(`Rabbi ${RABBI}`)).toBeDefined()
        expect(screen.getByLabelText("Search setlists").getAttribute("title")).toBe("Search")
        cleanup()

        render(<DeleteSetlistDialog open onOpenChange={noop} setlistName={NAME} onConfirm={noop} />)
        expect(screen.getByText(`Are you sure you want to delete "${NAME}"? This action cannot be undone.`)).toBeDefined()
        cleanup()

        render(<TransferSetlistDialog open onClose={noop} setlistName={NAME} email="" onEmailChange={noop} onConfirm={noop} />)
        // The setlist name is bold inside the sentence, as before phase 7, so match the paragraph's text.
        const transferBody = `Transferring ${NAME} to another user. You will lose access unless they share it back with you.`
        expect(screen.getByText((_, el) => el?.tagName === "P" && el.textContent === transferBody)).toBeDefined()
        expect(screen.getByText(NAME).tagName).toBe("STRONG")
        expect(screen.getByPlaceholderText("New Owner's Email")).toBeDefined()
        cleanup()

        dash.value = dashboardValue()
        render(<SetlistDashboard />)
        expect(screen.getByText("Your stage is ready. 1 upcoming setlists scheduled.")).toBeDefined()
        expect(screen.getByText("Create New Setlist")).toBeDefined()
        expect(screen.getByText("Upcoming Services")).toBeDefined()
        expect(screen.getByText("Library & Past Events")).toBeDefined()
        expect(screen.getByText("Load older setlists")).toBeDefined()
    })
})
