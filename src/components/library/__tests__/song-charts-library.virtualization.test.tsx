/**
 * Fix 3 (2026-08-31) — the library row list is virtualized.
 *
 * Unlike song-charts-library.test.tsx (which mocks @tanstack/react-virtual so
 * every row renders and behaviour can be asserted), this file runs the REAL
 * virtualizer. Its whole job is to prove that windowing actually happens:
 * with 400 charts in the store, the DOM must NOT contain 400 rows.
 *
 * Against the pre-fix `combinedItems.map()` it renders all 400 — 400 Radix
 * ContextMenus and 400 `isFileCached()` IndexedDB effects, which is what made
 * the page crawl on an 11" iPad.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { DriveFile } from "@/types/models"

// jsdom has no ResizeObserver; the virtualizer's measureElement needs one.
class ResizeObserverStub {
    observe(): void { }
    unobserve(): void { }
    disconnect(): void { }
}
; (globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver =
    ResizeObserverStub

// jsdom reports every element as 0x0, which would collapse the virtualizer's
// window to nothing and let a "fewer rows rendered" assertion pass vacuously.
// Give it a realistic geometry instead: an ~11" iPad viewport (800px tall) and
// 64px rows — the row wrappers are the elements carrying `data-index`.
// virtual-core sizes the scroll element from offsetWidth/offsetHeight and each
// row from getBoundingClientRect, so both need shimming.
const VIEWPORT_H = 800
const ROW_H = 64
const isRow = (el: Element) => el.hasAttribute?.("data-index")
Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get(this: HTMLElement) { return isRow(this) ? ROW_H : VIEWPORT_H },
})
Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get() { return 700 },
})
Element.prototype.getBoundingClientRect = function (this: Element) {
    const height = isRow(this) ? ROW_H : VIEWPORT_H
    return {
        x: 0, y: 0, top: 0, left: 0, right: 700, bottom: height,
        width: 700, height, toJSON: () => ({}),
    } as DOMRect
}

const mockSetFilter = vi.hoisted(() => vi.fn())
const mockHydrate = vi.hoisted(() => vi.fn())
const mockApiFetch = vi.hoisted(() =>
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })),
)

vi.mock("@/lib/utils", () => ({
    cn: (...args: (string | boolean | undefined | null)[]) => args.filter(Boolean).join(" "),
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ back: vi.fn(), push: vi.fn() }) }))
vi.mock("@/lib/store", () => ({
    useMusicStore: Object.assign(() => ({ setFile: vi.fn() }), { getState: () => ({ setFile: vi.fn() }) }),
    FileType: {},
}))
// No auth user → the usage effect stays out of this file's way.
vi.mock("@/lib/auth-context", () => ({
    useAuth: () => ({ isAdmin: false, isBandLeader: false, profile: {}, canUpload: false, user: null }),
}))
vi.mock("@/lib/congregation-store", () => ({ useCongregation: () => ({ shortName: "CRC" }) }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/lib/api-client", () => ({ apiFetch: mockApiFetch }))

let mockFiles: DriveFile[] = []
vi.mock("@/lib/library-store", () => ({
    useLibraryStore: () => ({
        allFiles: mockFiles,
        displayedFiles: mockFiles,
        loading: false,
        setFilter: mockSetFilter,
        initialized: true,
        hydrate: mockHydrate,
    }),
}))
vi.mock("@/hooks/use-library", () => ({
    useLibrary: () => ({ refetch: vi.fn(), isLoading: false, error: null }),
}))
vi.mock("../useLibraryActions", () => ({
    useLibraryActions: () => ({
        digitizing: null, handleDigitize: vi.fn(), handleArchive: vi.fn(), handleRename: vi.fn(),
    }),
}))
vi.mock("../LibrarySkeleton", () => ({ LibrarySkeleton: () => <div /> }))
vi.mock("@/components/ui/empty-state", () => ({ EmptyState: () => <div data-testid="empty-state" /> }))
vi.mock("@/components/ui/error-state", () => ({ ErrorState: () => <div /> }))
vi.mock("@/components/ui/illustrations", () => ({
    NoResultsIllustration: () => <div />, EmptyAudioIllustration: () => <div />,
}))
vi.mock("../LibraryFileRow", () => ({
    LibraryFileRow: ({ item }: { item: DriveFile }) => (
        <div data-testid={`file-row-${item.id}`}>{item.name}</div>
    ),
}))
vi.mock("../UploadDialog", () => ({ UploadDialog: () => <div /> }))
vi.mock("../ScraperModal", () => ({ ScraperModal: () => <div /> }))
vi.mock("../SelectionActionBar", () => ({ SelectionActionBar: () => null }))
vi.mock("../LibraryFilters", () => ({
    LibraryFilters: () => <div data-testid="library-filters" />,
    applyLibraryFilters: (files: DriveFile[]) => files,
    createEmptyFilters: () => ({ keys: new Set(), topics: new Set(), recency: "all" }),
}))
vi.mock("@/components/audio/AudioPlayer", () => ({ AudioPlayer: () => <div /> }))
// Reproduce the real ScrollArea's viewport slot — the virtualizer locates its
// scroll element by `[data-slot="scroll-area-viewport"]`, so a mock without it
// would not exercise the real lookup.
vi.mock("@/components/ui/scroll-area", () => ({
    ScrollArea: ({ children, ...props }: { children: React.ReactNode }) => (
        <div {...props}>
            <div data-slot="scroll-area-viewport">{children}</div>
        </div>
    ),
}))
vi.mock("@/hooks/use-add-to-setlist", () => ({
    useAddToSetlist: () => ({
        canAddToSetlist: false, openForSongs: vi.fn(), isOpen: false, setIsOpen: vi.fn(),
        editableSetlists: [], loading: false, searchQuery: "", setSearchQuery: vi.fn(),
        addToSetlist: vi.fn(), createNewSetlist: vi.fn(), pendingSongs: [],
    }),
}))
vi.mock("../AddToSetlistSheet", () => ({ AddToSetlistSheet: () => <div /> }))

import { SongChartsLibrary } from "../SongChartsLibrary"

const CHART_COUNT = 400
const charts: DriveFile[] = Array.from({ length: CHART_COUNT }, (_, i) => ({
    id: `chart-${String(i).padStart(3, "0")}`,
    name: `Song ${String(i).padStart(3, "0")}.pdf`,
    mimeType: "application/pdf",
}))

describe("SongChartsLibrary — row list is virtualized (Fix 3)", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockFiles = charts
    })

    it("mounts only a window of rows, never all 400", () => {
        render(<SongChartsLibrary />)
        const rendered = screen.queryAllByTestId(/^file-row-/)
        // The pre-fix `combinedItems.map()` rendered exactly CHART_COUNT rows.
        expect(rendered.length).toBeLessThan(CHART_COUNT)
        // …and it really is a window, not an empty/broken list: an 800px
        // viewport over 64px rows is ~13 rows plus 10 overscan either side.
        expect(rendered.length).toBeGreaterThan(5)
        expect(screen.queryByTestId("empty-state")).toBeNull()
        // The window starts at the top of the list.
        expect(screen.getByTestId("file-row-chart-000")).toBeDefined()
    })

    it("reserves the full scroll height so the scrollbar still reflects 400 rows", () => {
        const { container } = render(<SongChartsLibrary />)
        const spacer = container.querySelector<HTMLElement>('div[style*="position: relative"]')
        expect(spacer).not.toBeNull()
        // Height is driven by the virtualizer's total size, not by mounted rows.
        expect(parseInt(spacer!.style.height, 10)).toBeGreaterThan(CHART_COUNT * 40)
    })

    it("renders a short list in full — windowing must not hide small libraries", () => {
        mockFiles = charts.slice(0, 3)
        render(<SongChartsLibrary />)
        expect(screen.getByTestId("file-row-chart-000")).toBeDefined()
        expect(screen.getByTestId("file-row-chart-001")).toBeDefined()
        expect(screen.getByTestId("file-row-chart-002")).toBeDefined()
    })
})
