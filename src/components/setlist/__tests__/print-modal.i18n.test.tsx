import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react"
import type { SetlistTrack } from "@/types/models"

/** Phase 7 i18n: the print dialog with its real sub-components (mode selector, stats, track options). */

const mockApiFetch = vi.hoisted(() => vi.fn())
const mockToast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }))
// Stable objects: the modal's just-me effect depends on the profile's identity.
const auth = vi.hoisted(() => ({
    user: { uid: "user-1", displayName: "Testname User", email: "t@example.com" },
    profile: { musicianProfile: { instrument: "guitar", defaultTransposition: 2, preferFlats: false, preferredCapoFret: 3 } },
}))
vi.mock("@/lib/auth-context", () => ({ useAuth: () => auth }))
vi.mock("@/lib/api-client", () => ({ apiFetch: mockApiFetch }))
vi.mock("sonner", () => ({ toast: mockToast }))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))
vi.mock("@/lib/org/use-feature", () => ({ useFeature: () => true }))
vi.mock("@/lib/musician-profile", () => ({
    fetchTenantMusicianProfiles: vi.fn(async () => [
        { uid: "m-1", displayName: "Test Player A", profile: { instrument: "guitar", defaultTransposition: 0, preferFlats: false, preferredCapoFret: 0 } },
        { uid: "m-2", displayName: "Test Player B", profile: { instrument: "keyboard", defaultTransposition: 0, preferFlats: true, preferredCapoFret: 0 } },
    ]),
    INSTRUMENT_PRESETS: {
        guitar: { label: "Guitar", defaultTransposition: 0 },
        keyboard: { label: "Keyboard", defaultTransposition: 0 },
    },
}))

import { renderPseudo, expectNoUntranslatedText, renderWithI18n } from "@/test-utils/i18n"
import { isPseudoWrapped } from "@/i18n/pseudo"
import { PrintModal } from "../PrintModal"

const TRACKS: SetlistTrack[] = [
    { id: "t1", title: "Test Song A", type: "song", fileId: "file-1", key: "D" },
    { id: "t2", title: "Test Song B", type: "song", fileId: "file-2", key: "Am" },
    { id: "t3", title: "Test Header", type: "header" },
]
const MISSING: SetlistTrack[] = [...TRACKS, { id: "t4", title: "Test Song C", type: "song" }]

// Data: song titles, key names, musician names and instrument labels (src/lib/musician-profile),
// and the "<first name> — <instrument> — Capo n" line whose name/instrument parts are data.
const DATA: Array<string | RegExp> = [
    "Test Song A", "Test Song B", "Test Song C", "D", "Am", /^[A-G][#b]?m? \([+-]?\d+\)$/,
    "Test Player A", "Test Player B", "Guitar", "Keyboard", "(Guitar)", "(Keyboard)",
    /^Testname — Guitar — ⟦[^⟧]*⟧$/,
]

const props = { setlistName: "Test Setlist A", tracks: TRACKS, onClose: vi.fn(), setlistId: "s1", eventDate: "2026-10-09" }

function clickText(re: RegExp) {
    const el = Array.from(document.querySelectorAll("button, label")).find((b) => re.test(b.textContent ?? "")) as HTMLElement
    expect(el).toBeDefined()
    fireEvent.click(el)
}

describe.each([false, true])("PrintModal i18n (rtl=%s)", (rtl) => {
    beforeEach(() => {
        vi.clearAllMocks()
        localStorage.clear()
    })
    afterEach(() => cleanup())

    it("main view, full packet with transposition, per-musician mode", async () => {
        const r = renderPseudo(<PrintModal {...props} />, { rtl })
        await waitFor(() => expect(document.querySelector('input[value="select-musicians"]')).not.toBeNull())
        if (rtl) expect(document.querySelector('[dir="rtl"]')).not.toBeNull()
        expect(r).toBeDefined()
        expectNoUntranslatedText(document.body, { allow: DATA })

        // Full packet: track options list + transposition note (just-me mode, +2)
        const buttons = document.querySelectorAll(".flex.rounded-lg.border:not(.flex-col) button")
        fireEvent.click(buttons[1])
        expect(document.querySelector('[data-testid="transpose-track-list"]')).not.toBeNull()
        expectNoUntranslatedText(document.body, { allow: DATA })

        // Per-musician mode, both selected → "n selected → ZIP" + Download ZIP
        const radio = document.querySelector('input[value="select-musicians"]') as HTMLInputElement
        fireEvent.click(radio)
        const boxes = document.querySelectorAll('input[type="checkbox"].accent-brand')
        boxes.forEach((b) => { if (!(b as HTMLInputElement).checked) fireEvent.click(b) })
        expectNoUntranslatedText(document.body, { allow: DATA })
    })

    it("missing-chart warning (download and email) and the email step", async () => {
        renderPseudo(<PrintModal {...props} tracks={MISSING} />, { rtl })
        await waitFor(() => expect(document.querySelector('input[value="select-musicians"]')).not.toBeNull())
        fireEvent.click(document.querySelectorAll(".flex.rounded-lg.border:not(.flex-col) button")[1]) // full packet
        expectNoUntranslatedText(document.body, { allow: DATA }) // stats: songs without PDFs
        const footer = () => Array.from(document.querySelectorAll(".border-t button")) as HTMLElement[]
        fireEvent.click(footer()[0]) // Download
        expect(document.querySelector('[role="alert"]')).not.toBeNull()
        expectNoUntranslatedText(document.body, { allow: DATA })
        fireEvent.click(footer()[0]) // Cancel

        fireEvent.click(footer()[1]) // Email packet links
        expect(document.querySelector('[role="alert"]')).not.toBeNull()
        expectNoUntranslatedText(document.body, { allow: DATA })
        fireEvent.click(footer()[1]) // Continue without → email step
        expectNoUntranslatedText(document.body, { allow: DATA })

        // Pick recipients and send: toasts come through t()
        document.querySelectorAll('input[type="checkbox"].h-4').forEach((b) => fireEvent.click(b))
        mockApiFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ sent: 2, failed: 1 }) })
        await act(async () => { fireEvent.click(footer()[1]) })
        await waitFor(() => expect(mockToast.success).toHaveBeenCalled())
        expect(isPseudoWrapped(mockToast.success.mock.calls[0][0])).toBe(true)
        expect(isPseudoWrapped(mockToast.warning.mock.calls[0][0])).toBe(true)
    })

    it("generating state shows a translated progress message", async () => {
        mockApiFetch.mockImplementation(() => new Promise(() => {}))
        renderPseudo(<PrintModal {...props} />, { rtl })
        await waitFor(() => expect(document.querySelector('input[value="select-musicians"]')).not.toBeNull())
        const footer = Array.from(document.querySelectorAll(".border-t button")) as HTMLElement[]
        await act(async () => { fireEvent.click(footer[0]) })
        expect(document.querySelector(".animate-spin")).not.toBeNull()
        expectNoUntranslatedText(document.body, { allow: DATA })
    })
})

describe("PrintModal English output is unchanged", () => {
    afterEach(() => cleanup())

    it("renders today's English in the sub-components", async () => {
        localStorage.clear()
        renderWithI18n(<PrintModal {...props} tracks={MISSING} />)
        await waitFor(() => expect(document.querySelector('input[value="select-musicians"]')).not.toBeNull())
        expect(screen.getByText("Testname — Guitar — Capo 3")).toBeDefined()
        expect(screen.getByText("1 page (song list only)")).toBeDefined()
        clickText(/^Full Packet \(PDFs\)$/)
        expect(screen.getByText("2 song(s) without PDFs won't be included.")).toBeDefined()
        expect(screen.getByText("4 songs will be transposed. Chords are detected from the PDF text layer and replaced in the printed output.")).toBeDefined()
        expect(screen.getByLabelText("Transpose Test Song A")).toBeDefined()
        clickText(/^Download PDF$/)
        expect(screen.getByText("The full packet will leave this chart out. You can cancel and repair the chart, or continue with the available charts and an omission notice.")).toBeDefined()
        expect(screen.getByText("No chart is attached to this song.")).toBeDefined()
        expect(screen.getByText("Continue without 1 chart")).toBeDefined()
        cleanup()

        renderWithI18n(<PrintModal {...props} />)
        await waitFor(() => expect(document.querySelector('input[value="select-musicians"]')).not.toBeNull())
        fireEvent.click(document.querySelector('input[value="select-musicians"]') as HTMLInputElement)
        fireEvent.click(screen.getByText("Select all"))
        expect(screen.getByText("2 selected → ZIP")).toBeDefined()
        expect(screen.getByText("Download ZIP")).toBeDefined()
    })
})
