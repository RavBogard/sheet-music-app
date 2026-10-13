import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, screen } from "@testing-library/react"

/**
 * Multi-tenant phase 7 (lane C): every string /manage, /manage/templates and
 * /manage/library-review render of their own comes through t(). The admin
 * section components each tab hosts are another directory's (they are mocked
 * out here and tested there); this covers the manage pages' own chrome.
 */
vi.mock("next/navigation", () => ({ useRouter: () => ({ back: vi.fn(), push: vi.fn() }) }))
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { uid: "u1" }, isBandLeader: true, loading: false }) }))
vi.mock("@/hooks/use-library", () => ({ useLibrary: () => ({ refetch: vi.fn() }) }))
vi.mock("@/lib/library-store", () => ({ useLibraryStore: (sel: (s: { allFiles: unknown[] }) => unknown) => sel({ allFiles: [] }) }))
vi.mock("@/lib/org/use-feature", () => ({ useFeature: () => true }))
vi.mock("@/components/admin/PeopleSection", () => ({ PeopleSection: () => null }))
vi.mock("@/components/admin/LibraryDataSection", () => ({ LibraryDataSection: () => null }))
vi.mock("@/components/admin/people/AccessAuditLog", () => ({ AccessAuditLog: () => null }))
vi.mock("@/components/admin/SoundSystemSection", () => ({ SoundSystemSection: () => null }))
vi.mock("@/components/admin/TemplatesSection", () => ({ TemplatesSection: () => null }))
vi.mock("@/components/library/DuplicateScanner", () => ({ DuplicateScanner: () => null }))
vi.mock("@/components/library/PDFHealthScanner", () => ({ PDFHealthScanner: () => null }))
vi.mock("@/components/library/SearchOverlay", () => ({ SearchOverlay: () => null }))
vi.mock("@/lib/template-firebase", () => ({ saveCustomTemplate: vi.fn(), deleteCustomTemplate: vi.fn() }))
vi.mock("@/lib/api-client", () => ({ apiFetch: vi.fn() }))
// Minimal Tabs: only the active panel is mounted. (Radix keeps the old panel for
// one more render on a switch, which LibraryReviewClient's ReviewSplit cannot
// survive with another tab's rows — a pre-existing quirk, not under test here.)
vi.mock("@/components/ui/tabs", async () => {
    const React = await import("react")
    type Ctx = { value: string; set: (v: string) => void }
    const C = React.createContext<Ctx>({ value: "", set: () => {} })
    function Tabs({ value, defaultValue, onValueChange, children }: { value?: string; defaultValue?: string; onValueChange?: (v: string) => void; children: React.ReactNode }) {
        const [inner, setInner] = React.useState(defaultValue ?? "")
        const v = value ?? inner
        const set = (n: string) => {
            setInner(n)
            onValueChange?.(n)
        }
        return <C.Provider value={{ value: v, set }}>{children}</C.Provider>
    }
    const TabsList = ({ children }: { children: React.ReactNode }) => <div role="tablist">{children}</div>
    function TabsTrigger({ value, children }: { value: string; children: React.ReactNode }) {
        const ctx = React.useContext(C)
        return (
            <button role="tab" aria-selected={ctx.value === value} onMouseDown={() => ctx.set(value)}>
                {children}
            </button>
        )
    }
    function TabsContent({ value, children }: { value: string; children: React.ReactNode }) {
        return React.useContext(C).value === value ? <div role="tabpanel">{children}</div> : null
    }
    return { Tabs, TabsList, TabsTrigger, TabsContent }
})
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }))

import { expectNoUntranslatedText, renderPseudo, renderWithI18n } from "@/test-utils/i18n"
import ManageClient from "../ManageClient"
import TemplatesPage from "../templates/page"
import { TemplateEditor } from "../templates/TemplateEditor"
import LibraryReviewClient from "../library-review/LibraryReviewClient"
import type { ReviewQueueResult } from "@/lib/library/review-queue"

afterEach(() => cleanup())

function selectTab(name: RegExp) {
    const tab = screen.getByRole("tab", { name })
    act(() => {
        fireEvent.mouseDown(tab, { button: 0, ctrlKey: false })
        fireEvent.focus(tab)
    })
}

describe("phase 7: /manage chrome is translated", () => {
    it("every tab of ManageClient renders only catalogue text (pseudo-locale)", () => {
        const r = renderPseudo(<ManageClient serverIsAdmin />)
        expectNoUntranslatedText(r.container)
        expect(screen.getAllByRole("tab")).toHaveLength(4)
        for (const tab of [/Ļîƀŕ/, /Šöûñð/, /Áûðîţ/, /Þéöþļé/]) {
            selectTab(tab)
            expectNoUntranslatedText(r.container)
        }
        // The Library tab's own box was rendered at some point.
        selectTab(/Ļîƀŕ/)
        expect(r.container.textContent).toContain("⟦Ļîƀŕáŕý Ţööļš")
    })

    it("qps-rtl renders right to left", () => {
        const r = renderPseudo(<ManageClient serverIsAdmin={false} />, { rtl: true })
        expect(r.container.querySelector('[dir="rtl"]')).not.toBeNull()
        expectNoUntranslatedText(r.container)
    })

    it("English is unchanged", () => {
        renderWithI18n(<ManageClient serverIsAdmin />)
        expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("Manage")
        expect(screen.getByText("Band management, library, and sound system")).toBeTruthy()
        expect(screen.getByRole("tab", { name: /People/ })).toBeTruthy()
        expect(screen.getByRole("tab", { name: /Audit/ })).toBeTruthy()
    })
})

describe("phase 7: /manage/templates is translated", () => {
    it("the page shell (pseudo-locale)", () => {
        const r = renderPseudo(<TemplatesPage />)
        expectNoUntranslatedText(r.container)
    })

    it("TemplateEditor with a linked slot expanded (pseudo-locale)", () => {
        const r = renderPseudo(
            <TemplateEditor
                templateKey="friday_night"
                defaultSlots={[]}
                customSlots={[
                    { label: "Zemer", type: "song", queries: ["zemer"], fileId: "f1", fileName: "Zemer Chart", pageNumber: 4, defaultPerformer: "Cantor" },
                    { label: "Opening", type: "reading", queries: [] },
                ]}
            />,
        )
        fireEvent.click(screen.getByText("Zemer"))
        expectNoUntranslatedText(r.container, {
            // Data: slot labels, chart name, search terms, performer, the template's label.
            allow: ["Zemer", "Opening", "Zemer Chart", "zemer", "Cantor", /^Friday/],
            ignoreSelector: "h2",
        })
    })

    it("TemplateEditor English is unchanged", () => {
        renderWithI18n(
            <TemplateEditor templateKey="friday_night" defaultSlots={[{ label: "Zemer", type: "song", queries: [] }]} customSlots={null} />,
        )
        expect(screen.getByText("1 slots")).toBeTruthy()
        expect(screen.getByText("Default")).toBeTruthy()
        expect(screen.getByText("song")).toBeTruthy()
        fireEvent.click(screen.getByText("Zemer"))
        expect(screen.getByText("Search Queries (comma-separated)")).toBeTruthy()
        expect(screen.getByPlaceholderText("e.g., shema, sh'ma")).toBeTruthy()
    })
})

const QUEUE: ReviewQueueResult = {
    aiReview: [
        {
            rowId: "r1",
            title: "Song One",
            collection: "core",
            mimeType: "application/pdf",
            sizeBytes: 2048,
            source: "drive-sync",
            subfolder: "folder123456789",
            suggestion: {
                is_chart: true,
                confidence: 0.6,
                suggested_title: "Song One (Arr)",
                suggested_collection: null,
                collection_disagrees_with_folder: true,
                suggested_key: "G",
                suggested_bpm: 90,
                suggested_lead: null,
                suggested_tags: [],
                duplicate_candidates: ["r2"],
                concerns: ["blurry scan"],
                review_required: true,
            },
            triggers: ["low_confidence", "collection_disagrees_with_folder", "duplicate_candidates", "review_required", "is_chart_false"],
            current: { title: "Song One", collection: "core" },
            duplicateCandidates: [{ rowId: "r2", title: "Song One Copy", collection: "uploads" }],
            enrichmentRanAt: null,
        },
    ],
    aiFailed: [{ rowId: "f1", title: "Broken", collection: "core", mimeType: "application/pdf", sizeBytes: 1, lastError: "timeout", attempts: 3, exhaustedAt: null }],
    importFailures: [
        {
            driveFileId: "d1", driveName: "scan.pdf", driveMimeType: "application/pdf", parents: null, md5Checksum: null,
            status: "failed", errorMessage: "bad pdf", attemptCount: 2, firstSeenAt: "", lastAttemptAt: "",
        },
    ],
    totals: { aiReview: 1, aiFailed: 1, importFailures: 1 },
    config: { autoApplyEnabled: false, threshold: 0.7, aiProviderConfigured: true },
}

// Data the queue shows as-is: titles, collection ids, mime short names, ids,
// error prose from the server, keyboard keys, numbers and sizes.
const QUEUE_DATA = [
    "Song One", "Song One (Arr)", "Song One Copy", "(uploads)", "core", "pdf", "G", "Broken", "timeout", "scan.pdf",
    "bad pdf", "failed", "blurry scan", "r1", "uploads", "GEMINI_API_KEY", /^drive-sync/, /^\d/,
]

/**
 * Sentences with elements inside (key caps, code) go through interpolateNodes,
 * which pseudo-wraps every text piece, so the per-node check covers them too.
 */
function expectQueueTranslated(root: HTMLElement) {
    expectNoUntranslatedText(root, { allow: QUEUE_DATA, ignoreSelector: "code, kbd, option" })
}

describe("phase 7: /manage/library-review is translated", () => {
    it("AI Review tab, selected row expanded (pseudo-locale)", () => {
        const r = renderPseudo(<LibraryReviewClient initial={QUEUE} initialError={null} />)
        fireEvent.click(screen.getByText("Song One", { selector: "span" }))
        expectQueueTranslated(r.container)
        expect(r.container.textContent).toContain("⟦Çáļîƀŕáţîöñ")
    })

    it("edit form (pseudo-locale)", () => {
        const r = renderPseudo(<LibraryReviewClient initial={QUEUE} initialError={null} />)
        fireEvent.click(screen.getByText("Song One", { selector: "span" }))
        act(() => {
            fireEvent.keyDown(window, { key: "e" })
        })
        expectQueueTranslated(r.container)
    })

    it("AI Failed and Import Failures tabs, and the empty states (pseudo-locale)", () => {
        const r = renderPseudo(<LibraryReviewClient initial={QUEUE} initialError={null} />)
        for (const [key, shown] of [["2", "Broken"], ["3", "scan.pdf"]]) {
            act(() => {
                fireEvent.keyDown(window, { key })
            })
            expect(r.container.textContent).toContain(shown)
            expectQueueTranslated(r.container)
        }
        cleanup()
        const empty = { ...QUEUE, aiReview: [], aiFailed: [], importFailures: [], config: { ...QUEUE.config, aiProviderConfigured: false } }
        const e = renderPseudo(<LibraryReviewClient initial={empty} initialError={null} />)
        for (const key of ["1", "2", "3"]) {
            act(() => {
                fireEvent.keyDown(window, { key })
            })
            expectQueueTranslated(e.container)
        }
    })

    it("English is unchanged", () => {
        renderWithI18n(<LibraryReviewClient initial={{ ...QUEUE, config: { ...QUEUE.config, autoApplyEnabled: true } }} initialError={null} />)
        expect(screen.getByText("Library Review")).toBeTruthy()
        expect(screen.getByText("Auto-apply on.")).toBeTruthy()
        expect(screen.getByText("low-conf")).toBeTruthy()
        expect(screen.getByRole("textbox", { name: "Filter review queue" }).getAttribute("placeholder")).toBe("Filter…  ( / )")
        expect(document.body.textContent).toContain("Only rows tripping a review trigger land here. Threshold: 0.70.")
        expect(document.body.textContent).toContain("Select a row (or press Enter) to inspect the AI suggestion.")
    })
})
