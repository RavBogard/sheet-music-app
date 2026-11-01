import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

/** Phase 7 i18n: version history panel + restore dialog, and the matrix view. */

const hist = vi.hoisted(() => ({ entries: [] as unknown[] }))
vi.mock("@/lib/setlist-audit", () => ({ getSetlistHistory: vi.fn(async () => hist.entries) }))
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { uid: "u1" } }) }))

import { renderPseudo, expectNoUntranslatedText } from "@/test-utils/i18n"
import { SetlistHistoryPanel } from "../SetlistHistoryPanel"
import { SetlistMatrixView } from "../SetlistMatrixView"

const OLD = [{ title: "Test Song A", fileId: "a" }, { title: "Test Song B", fileId: "b" }]
const NEW = [{ title: "Test Song A", fileId: "a" }, { title: "Test Song C", fileId: "c" }]
const REORDERED = [{ title: "Test Song C", fileId: "c" }, { title: "Test Song A", fileId: "a" }]
const WHEN = new Date(2026, 9, 4, 15, 15)

const ENTRIES = [
    { action: "tracks_reordered", userName: "Test User", userId: "u1", timestamp: WHEN, trackSnapshot: REORDERED },
    { action: "renamed", userName: "Test User", userId: "u1", timestamp: WHEN, trackSnapshot: NEW, details: { newName: "Test Setlist B" } },
    { action: "published", userName: "Test User", userId: "u1", timestamp: WHEN, trackSnapshot: OLD },
]
const DATA = ["Test Song A", "Test Song B", "Test Song C"]
// The rename detail and "by …" interpolate data inside a translated line, so they stay wrapped.

async function renderPanel(rtl: boolean) {
    const r = renderPseudo(<SetlistHistoryPanel setlistId="s1" onRestore={() => {}} onClose={() => {}} />, { rtl })
    await waitFor(() => expect(document.body.textContent).toContain("Test Song C"))
    return r
}

describe.each([false, true])("setlist history i18n (rtl=%s)", (rtl) => {
    afterEach(() => cleanup())

    it("loading and empty states", async () => {
        hist.entries = []
        const r = renderPseudo(<SetlistHistoryPanel setlistId="s1" onRestore={() => {}} onClose={() => {}} />, { rtl })
        if (rtl) expect(r.container.querySelector('[dir="rtl"]')).not.toBeNull()
        expectNoUntranslatedText(document.body) // loading
        await waitFor(() => expect(document.querySelector("p.italic")).not.toBeNull())
        expectNoUntranslatedText(document.body) // empty
    })

    it("entries with diffs, rename detail and the restore dialog", async () => {
        hist.entries = ENTRIES
        const r = await renderPanel(rtl)
        if (rtl) expect(r.container.querySelector('[dir="rtl"]')).not.toBeNull()
        expectNoUntranslatedText(document.body, { allow: DATA })
        const restore = Array.from(document.querySelectorAll("button")).filter((b) => b.querySelector("svg.lucide-rotate-ccw"))
        await act(async () => { fireEvent.click(restore[1]) })
        expect(document.querySelector('[role="alertdialog"]')).not.toBeNull()
        expectNoUntranslatedText(document.body, { allow: DATA })
    })
})

describe("matrix view i18n", () => {
    afterEach(() => {
        cleanup()
        vi.unstubAllGlobals()
    })

    const MATRIX = {
        columns: [
            { id: "c1", date: new Date(2026, 8, 1).toISOString() },
            { id: "c2", date: new Date(2099, 0, 1).toISOString(), context: { parasha: "Test Portion" } },
        ],
        rows: [{ id: "r1", label: "Test Slot", queries: [], type: "song" }],
        grid: { r1: { c1: { track: { title: "Test Song A", key: "G" } }, c2: { track: null } } },
    }

    it.each([false, true])("table renders through t() and fmt (rtl=%s)", async (rtl) => {
        vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => MATRIX })))
        const r = renderPseudo(<SetlistMatrixView />, { rtl })
        await waitFor(() => expect(document.querySelector("table")).not.toBeNull())
        if (rtl) expect(r.container.querySelector('[dir="rtl"]')).not.toBeNull()
        expectNoUntranslatedText(document.body, { allow: ["Test Portion", "Test Slot", "Test Song A", "G"] })
    })

    it("load failure message is translated", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) })))
        renderPseudo(<SetlistMatrixView />)
        await waitFor(() => expect(document.querySelector("[role=alert]")).not.toBeNull())
        expectNoUntranslatedText(document.body)
    })
})

describe("history English output is unchanged", () => {
    afterEach(() => cleanup())

    it("renders today's English", async () => {
        hist.entries = ENTRIES
        render(<SetlistHistoryPanel setlistId="s1" onRestore={() => {}} onClose={() => {}} />)
        await waitFor(() => expect(screen.getByText("Version History")).toBeDefined())
        await waitFor(() => expect(screen.getAllByText("by Test User").length).toBe(3))
        expect(screen.getByText("Published & notified")).toBeDefined()
        expect(screen.getByText("Tracks reordered")).toBeDefined()
        expect(screen.getByText("→ \"Test Setlist B\"")).toBeDefined()
        expect(screen.getAllByText("Oct 4, 3:15 PM").length).toBe(3)
        const restore = screen.getAllByText("Restore")
        await act(async () => { fireEvent.click(restore[1]) })
        expect(screen.getByText("This will replace the current track list with the snapshot from Renamed (Oct 4, 3:15 PM).")).toBeDefined()
    })
})
