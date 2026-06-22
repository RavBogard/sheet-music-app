import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { LibraryFileRow } from "../LibraryFileRow"
import type { DriveFile } from "@/types/models"

// isFileCached is async + Dexie-backed; stub it so the row renders deterministically.
vi.mock("@/lib/cache-utils", () => ({
    isFileCached: vi.fn().mockResolvedValue(false),
}))

// Radix ContextMenu uses portals/pointer APIs; passthrough so we render the row.
vi.mock("@/components/ui/context-menu", () => ({
    ContextMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    ContextMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    ContextMenuContent: () => null,
    ContextMenuItem: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

const getCleanName = (n: string) =>
    n.replace(/\.(pdf|musicxml|xml|mxl)$/i, "").replace(/_/g, " ")

function makeChart(overrides: Partial<DriveFile> = {}): DriveFile {
    return {
        id: "upload-1",
        name: "Hashkivenu (Klepper-Freelander).pdf",
        mimeType: "application/pdf",
        metadata: { key: "Dm" },
        ...overrides,
    } as DriveFile
}

const noop = () => {}

describe("LibraryFileRow (v11.7-05 density + composer)", () => {
    beforeEach(() => vi.clearAllMocks())

    it("renders the title and composer as SEPARATE text (composer dimmed sub-label) — AC-3", () => {
        render(
            <LibraryFileRow
                item={makeChart()}
                onClick={noop}
                isDigitizing={false}
                isAdmin={false}
                getCleanName={getCleanName}
            />,
        )
        // Title without the parenthetical.
        expect(screen.getByText("Hashkivenu")).toBeDefined()
        // Composer as its own node.
        const composer = screen.getByText("Klepper-Freelander")
        expect(composer).toBeDefined()
        expect(composer.className).toContain("text-muted-foreground")
    })

    it("shows the key badge and recency at render (recency no longer sm-gated) — AC-3", () => {
        render(
            <LibraryFileRow
                item={makeChart()}
                onClick={noop}
                isDigitizing={false}
                isAdmin={false}
                getCleanName={getCleanName}
                usageInfo={{ lastUsedDate: "2026-01-31", totalUses: 4 }}
            />,
        )
        expect(screen.getByText("Dm")).toBeDefined()
        // formatUsageBadge → "Last: Jan 31 · 4×"
        expect(screen.getByText(/Last:/)).toBeDefined()
        // recency span must NOT carry the old hidden-on-mobile gate.
        expect(screen.getByText(/Last:/).className).not.toContain("hidden")
    })

    it("renders NO image/thumbnail (text-only) — AC-3 constraint", () => {
        const { container } = render(
            <LibraryFileRow
                item={makeChart()}
                onClick={noop}
                isDigitizing={false}
                isAdmin={false}
                getCleanName={getCleanName}
            />,
        )
        expect(container.querySelector("img")).toBeNull()
    })

    it("omits the composer node when the name has no parenthetical", () => {
        render(
            <LibraryFileRow
                item={makeChart({ id: "upload-2", name: "Adon Olam.pdf", metadata: {} })}
                onClick={noop}
                isDigitizing={false}
                isAdmin={false}
                getCleanName={getCleanName}
            />,
        )
        expect(screen.getByText("Adon Olam")).toBeDefined()
        // No dangling composer text.
        expect(screen.queryByText("Klepper-Freelander")).toBeNull()
    })

    it("keeps the interactive row a button with a min-h-11 (>=44px) tap floor — AC-2", () => {
        const { container } = render(
            <LibraryFileRow
                item={makeChart()}
                onClick={noop}
                isDigitizing={false}
                isAdmin={false}
                getCleanName={getCleanName}
            />,
        )
        const cell = container.querySelector(".list-cell")
        expect(cell).not.toBeNull()
        expect(cell!.className).toContain("min-h-11")
        // Title is no longer the oversized text-xl bold treatment.
        const title = screen.getByText("Hashkivenu")
        expect(title.className).toContain("font-medium")
        expect(title.className).not.toContain("text-xl")
    })
})
