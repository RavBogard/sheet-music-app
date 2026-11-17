import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, screen } from "@testing-library/react"

/**
 * Multi-tenant phase 7 (lane C): every string /manage and /manage/templates
 * render of their own comes through t(). The admin
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
// Minimal Tabs: only the active panel is mounted.
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
