import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, screen } from "@testing-library/react"

/**
 * Phase 7 i18n: every ScraperModal string comes through t(), and the chord
 * chart preview (verify step) keeps ltr on an rtl page.
 */

vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }))
vi.mock("@/lib/library-cache", () => ({ broadcastCacheInvalidation: vi.fn() }))
vi.mock("@/lib/api-client", () => ({ apiFetch: vi.fn() }))
vi.mock("@/lib/setlist-firebase", () => ({}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { renderPseudo, expectNoUntranslatedText } from "@/test-utils/i18n"
import type { Setlist } from "@/lib/setlist-firebase"
import { ScraperModal } from "../ScraperModal"

const SETLISTS = [{ id: "s1", name: "Test Setlist A" }] as unknown as Setlist[]
// The URL field's example placeholder is i18n-ignored in the component (a URL, not prose).
const DATA = ["https://tabs.ultimate-guitar.com/...","Test Song A", "Test Artist", "Test Song B", "Other Artist", "CRC Charts", "Shireinu", "Nava Tehilah", "Test Setlist A", "Find test song a"]

function stubFetch() {
    const fetchMock = vi.fn((url: string) => {
        if (url === "/api/charts/search") {
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ results: [{ title: "Test Song B", artist: "Other Artist", url: "https://example.com/b" }] }),
            })
        }
        return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ title: "Test Song A", artist: "Test Artist", content: "C G Am F" }),
        })
    })
    vi.stubGlobal("fetch", fetchMock)
}

async function walkAllSteps(rtl: boolean) {
    stubFetch()
    renderPseudo(<ScraperModal setlists={SETLISTS} />, { rtl })
    // Trigger (closed dialog).
    expectNoUntranslatedText(document.body, { allow: DATA })
    fireEvent.click(screen.getByRole("button"))

    // Search tab, empty chat.
    expectNoUntranslatedText(document.body, { allow: DATA })
    const chat = screen.getByRole("textbox")
    fireEvent.change(chat, { target: { value: "Find test song a" } })
    await act(async () => {
        fireEvent.keyDown(chat, { key: "Enter" })
    })
    // Chat bubbles + a result with its Import button + the fallback intro line.
    expect(screen.getByText("Test Song B")).toBeTruthy()
    expectNoUntranslatedText(document.body, { allow: DATA })

    // URL tab, then paste-text tab.
    const tabs = () => Array.from(document.querySelectorAll('[role="dialog"] button')).filter((b) => b.className.includes("flex-1 py-1.5"))
    fireEvent.click(tabs()[1])
    expectNoUntranslatedText(document.body, { allow: DATA })
    fireEvent.click(tabs()[2])
    expectNoUntranslatedText(document.body, { allow: DATA })

    fireEvent.change(document.querySelector('[role="dialog"] textarea')!, { target: { value: "C G Am F" } })
    const fetchButton = Array.from(document.querySelectorAll('[role="dialog"] button')).find((b) => b.className.includes("w-full"))!
    await act(async () => {
        fireEvent.click(fetchButton)
    })

    // Verify step: labels, section + setlist pickers, the chart preview.
    const preview = document.querySelector("[data-chart-preview]") as HTMLTextAreaElement
    expect(preview).not.toBeNull()
    expectNoUntranslatedText(document.body, { allow: [...DATA, "C G Am F"] })
    return preview
}

describe("ScraperModal i18n (pseudo-locale)", () => {
    afterEach(() => {
        cleanup()
        vi.unstubAllGlobals()
    })

    it("qps: every step's UI text comes through t()", async () => {
        const preview = await walkAllSteps(false)
        expect(preview.getAttribute("dir")).toBeNull()
    })

    it("qps-rtl: page is rtl, the chord chart preview stays ltr", async () => {
        const preview = await walkAllSteps(true)
        expect(document.querySelector('[dir="rtl"]')).not.toBeNull()
        expect(preview.getAttribute("dir")).toBe("ltr")
    })
})
