import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, cleanup } from "@testing-library/react"
import type { DriveFile } from "@/types/models"

/**
 * Multi-tenant phase 1 golden (lane 3, surface 1): the "CRC Charts" label and
 * "CRC" badge on the library surfaces that were never tenant-aware. At
 * e0ad18b4 these showed CRC's text to Brothers Lazaroff too; BL keeps it.
 */

const libraryState = vi.hoisted(() => ({ allFiles: [] as DriveFile[] }))
vi.mock("@/lib/library-store", () => ({
    useLibraryStore: () => ({ allFiles: libraryState.allFiles }),
}))
vi.mock("@/hooks/use-library", () => ({ useLibrary: () => ({}) }))
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { uid: "u1" } }) }))
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }))
vi.mock("@/lib/library-cache", () => ({ broadcastCacheInvalidation: vi.fn() }))
vi.mock("@/lib/api-client", () => ({ apiFetch: vi.fn() }))
vi.mock("@/lib/setlist-firebase", () => ({}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/lib/cache-utils", () => ({ isFileCached: vi.fn().mockResolvedValue(false) }))
vi.mock("@/components/ui/context-menu", () => ({
    ContextMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    ContextMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    ContextMenuContent: () => null,
    ContextMenuItem: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

import { OrgProvider } from "@/lib/org/org-context"
import { codeOrgConfig } from "@/lib/org/config-code"
import { clearPrimedOrgConfigs } from "@/lib/org/config-cache"
import { SearchOverlay } from "../SearchOverlay"
import { UploadDialog } from "../UploadDialog"
import { ScraperModal } from "../ScraperModal"
import { LibraryFileRow } from "../LibraryFileRow"

const ORGS = ["crc", "brotherslazaroff"] as const

function inOrg(orgId: string, ui: React.ReactNode) {
    return render(
        <OrgProvider orgId={orgId} config={codeOrgConfig(orgId)}>
            {ui}
        </OrgProvider>,
    )
}

const searchFiles: DriveFile[] = [
    { id: "s-core", name: "Adon_Olam.pdf", mimeType: "application/pdf" },
    { id: "s-up", name: "Barchu.pdf", mimeType: "application/pdf", collection: "uploads" },
    { id: "s-supp", name: "Kiddush.pdf", mimeType: "application/pdf", collection: "supplemental" },
    { id: "s-nava", name: "Lecha.pdf", mimeType: "application/pdf", collection: "nava" },
]

function optionTexts(select: HTMLSelectElement): Array<[string, string]> {
    return Array.from(select.options).map((o) => [o.value, o.textContent ?? ""])
}

const GOLDEN_SECTION_OPTIONS: Array<[string, string]> = [
    ["crc", "CRC Charts"],
    ["supplemental", "Shireinu"],
    ["nava", "Nava Tehilah"],
    ["uploads", "Uploads"],
]

describe("P1 golden: never-tenant-aware library labels (crc + brotherslazaroff)", () => {
    beforeEach(() => {
        clearPrimedOrgConfigs()
        libraryState.allFiles = searchFiles
    })
    afterEach(() => {
        cleanup()
        clearPrimedOrgConfigs()
    })

    for (const org of ORGS) {
        it(`${org}: SearchOverlay collection toggle and row badges`, () => {
            inOrg(org, <SearchOverlay isOpen onClose={() => {}} onSelect={() => {}} />)
            const group = screen.getByRole("group", { name: "Library collection" })
            expect(Array.from(group.querySelectorAll("button")).map((b) => b.textContent)).toEqual([
                "CRC Charts",
                "Shireinu",
                "Nava Tehilah",
            ])
            const badge = (name: string) => screen.getByText(name).nextElementSibling?.textContent
            expect(badge("Adon Olam")).toBe("CRC")
            expect(badge("Barchu")).toBe("CRC")
            expect(badge("Kiddush")).toBe("Shireinu")
            expect(badge("Lecha")).toBe("Nava Tehilah")
        })

        it(`${org}: UploadDialog library section options`, () => {
            inOrg(org, <UploadDialog />)
            fireEvent.click(screen.getByRole("button", { name: /upload/i }))
            const input = document.querySelector('input[type="file"]') as HTMLInputElement
            fireEvent.change(input, { target: { files: [new File(["x"], "song.pdf", { type: "application/pdf" })] } })
            const select = document.getElementById("upload-collection") as HTMLSelectElement
            expect(optionTexts(select)).toEqual(GOLDEN_SECTION_OPTIONS)
            expect(select.value).toBe("uploads")
        })

        it(`${org}: ScraperModal library section options`, async () => {
            const fetchMock = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ title: "T", artist: "A", content: "C" }),
            })
            vi.stubGlobal("fetch", fetchMock)
            try {
                inOrg(org, <ScraperModal />)
                fireEvent.click(screen.getByRole("button", { name: /add song/i }))
                fireEvent.click(screen.getByRole("button", { name: "Paste Text" }))
                fireEvent.change(screen.getByPlaceholderText(/Paste the messy webpage text/), { target: { value: "C G Am F" } })
                await act(async () => {
                    fireEvent.click(screen.getByRole("button", { name: "Fetch Chart" }))
                })
                const select = document.getElementById("scraper-collection") as HTMLSelectElement
                expect(optionTexts(select)).toEqual(GOLDEN_SECTION_OPTIONS)
                expect(select.value).toBe("uploads")
            } finally {
                vi.unstubAllGlobals()
            }
        })

        it(`${org}: LibraryFileRow badges`, () => {
            const badges = (collection?: DriveFile["collection"]) => {
                const item = { id: "r", name: "Zemer.pdf", mimeType: "application/pdf", collection } as DriveFile
                const { unmount } = inOrg(
                    org,
                    <LibraryFileRow item={item} onClick={() => {}} isDigitizing={false} isAdmin={false} getCleanName={(n) => n.replace(/\.pdf$/, "")} />,
                )
                const found = ["CRC", "Shireinu", "Nava Tehilah"].filter((t) => screen.queryByText(t) !== null)
                unmount()
                return found
            }
            expect(badges(undefined)).toEqual(["CRC"])
            expect(badges("core")).toEqual(["CRC"])
            expect(badges("uploads")).toEqual(["CRC"])
            expect(badges("supplemental")).toEqual(["Shireinu"])
            expect(badges("nava")).toEqual(["Nava Tehilah"])
        })
    }
})

// ── Multi-tenant phase 1 (lane 3): a third tenant gets its own names ──
describe("P1 tenant-driven: library labels for a third tenant", () => {
    beforeEach(() => {
        clearPrimedOrgConfigs()
        libraryState.allFiles = searchFiles
    })
    afterEach(() => {
        cleanup()
        clearPrimedOrgConfigs()
    })

    it("SearchOverlay, UploadDialog and LibraryFileRow use its core label and badge", async () => {
        const { primeTestOrg } = await import("@/lib/org/__tests__/test-org-config")
        const cfg = primeTestOrg()
        const { unmount } = inOrg("testshul", <SearchOverlay isOpen onClose={() => {}} onSelect={() => {}} />)
        const group = screen.getByRole("group", { name: "Library collection" })
        expect(group.querySelector("button")?.textContent).toBe("Our Charts")
        expect(screen.getByText("Adon Olam").nextElementSibling?.textContent).toBe("TST")
        unmount()

        render(
            <OrgProvider orgId="testshul" config={cfg}>
                <UploadDialog />
            </OrgProvider>,
        )
        fireEvent.click(screen.getByRole("button", { name: /upload/i }))
        const input = document.querySelector('input[type="file"]') as HTMLInputElement
        fireEvent.change(input, { target: { files: [new File(["x"], "song.pdf", { type: "application/pdf" })] } })
        const select = document.getElementById("upload-collection") as HTMLSelectElement
        expect(select.options[0].textContent).toBe("Our Charts")
        cleanup()

        render(
            <OrgProvider orgId="testshul" config={cfg}>
                <LibraryFileRow
                    item={{ id: "r", name: "Zemer.pdf", mimeType: "application/pdf" } as DriveFile}
                    onClick={() => {}}
                    isDigitizing={false}
                    isAdmin={false}
                    getCleanName={(n) => n.replace(/\.pdf$/, "")}
                />
            </OrgProvider>,
        )
        expect(screen.getByText("TST")).toBeDefined()
        expect(screen.queryByText("CRC")).toBeNull()
    })
})
