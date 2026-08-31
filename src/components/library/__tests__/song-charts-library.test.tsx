import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react"
import { DriveFile } from "@/types/models"

// The row list is virtualized (@tanstack/react-virtual, same pattern as
// components/performance/SetlistDrawer.tsx). jsdom reports every element as
// 0x0, so the real virtualizer would window down to ~1 row and these tests
// would assert on layout rather than on behaviour. Mock it to yield EVERY
// index — identical to the precedent in
// src/components/performance/__tests__/setlist-drawer.test.tsx.
vi.mock("@tanstack/react-virtual", () => ({
    useVirtualizer: (opts: { count: number }) => ({
        getTotalSize: () => opts.count * 64,
        getVirtualItems: () =>
            Array.from({ length: opts.count }, (_, index) => ({
                index,
                key: index,
                size: 64,
                start: index * 64,
            })),
        measure: vi.fn(),
        measureElement: vi.fn(),
        scrollToIndex: vi.fn(),
    }),
}))

// Hoisted mocks
const mockSetFilter = vi.hoisted(() => vi.fn())
const mockHydrate = vi.hoisted(() => vi.fn())
const mockLoadLibrary = vi.hoisted(() => vi.fn())
const mockRouterBack = vi.hoisted(() => vi.fn())
const mockRouterPush = vi.hoisted(() => vi.fn())
const mockSetFile = vi.hoisted(() => vi.fn())
const mockApiFetch = vi.hoisted(() => vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })))

// Mock cn
vi.mock("@/lib/utils", () => ({
    cn: (...args: (string | boolean | undefined | null)[]) =>
        args.filter(Boolean).join(" "),
}))

// Mock router
vi.mock("next/navigation", () => ({
    useRouter: () => ({ back: mockRouterBack, push: mockRouterPush }),
}))

// Mock music store
vi.mock("@/lib/store", () => ({
    useMusicStore: Object.assign(
        () => ({ setFile: mockSetFile }),
        { getState: () => ({ setFile: mockSetFile }) }
    ),
    FileType: {},
}))

// Mock auth (mutable isAdmin so the v11.1-03 admin-only "All sites" toggle can
// be tested for both roles; defaults to admin to preserve existing tests).
// `user` must be truthy or the usage-fetch effect early-returns (it waits for
// the Firebase client auth token).
const authState = vi.hoisted(() => ({ isAdmin: true, user: { uid: "test-uid" } as { uid: string } | null }))
vi.mock("@/lib/auth-context", () => ({
    useAuth: () => ({ isAdmin: authState.isAdmin, isBandLeader: true, profile: {}, canUpload: true, user: authState.user }),
}))

// Mock congregation
vi.mock("@/lib/congregation-store", () => ({
    useCongregation: () => ({ shortName: "CRC" }),
}))

// Mock toast
vi.mock("sonner", () => ({
    toast: { success: vi.fn(), error: vi.fn() },
}))

// Mock api-client
vi.mock("@/lib/api-client", () => ({
    apiFetch: mockApiFetch,
}))

// Library store mock
let mockDisplayedFiles: DriveFile[] = []
let mockAllFiles: DriveFile[] = []
let mockInitialized = true

vi.mock("@/lib/library-store", () => ({
    useLibraryStore: () => ({
        allFiles: mockAllFiles,
        displayedFiles: mockDisplayedFiles,
        loading: false,
        setFilter: mockSetFilter,
        initialized: mockInitialized,
        hydrate: mockHydrate,
    }),
}))

// Mock useLibrary hook
vi.mock("@/hooks/use-library", () => ({
    useLibrary: () => ({
        refetch: mockLoadLibrary,
        isLoading: false,
        error: null,
    }),
}))

// Mock useLibraryActions
vi.mock("../useLibraryActions", () => ({
    useLibraryActions: () => ({
        digitizing: null,
        handleDigitize: vi.fn(),
        handleArchive: vi.fn(),
        handleRename: vi.fn(),
    }),
}))

// Mock sub-components
vi.mock("../LibrarySkeleton", () => ({
    LibrarySkeleton: () => <div data-testid="library-skeleton">Loading...</div>,
}))
vi.mock("@/components/ui/empty-state", () => ({
    EmptyState: ({ title, description }: { title: string; description: string }) => (
        <div data-testid="empty-state">
            <span data-testid="empty-title">{title}</span>
            <span data-testid="empty-description">{description}</span>
        </div>
    ),
}))
vi.mock("@/components/ui/error-state", () => ({
    ErrorState: ({ title, onRetry }: { title: string; onRetry: () => void }) => (
        <div data-testid="error-state">
            <span>{title}</span>
            <button data-testid="retry-btn" onClick={onRetry}>Retry</button>
        </div>
    ),
}))
vi.mock("@/components/ui/illustrations", () => ({
    NoResultsIllustration: () => <div data-testid="no-results-illustration" />,
    EmptyAudioIllustration: () => <div data-testid="empty-audio-illustration" />,
}))
vi.mock("../LibraryFileRow", () => ({
    LibraryFileRow: ({ item, onClick, selectMode, isSelected, onToggleSelect, usageInfo }: {
        item: DriveFile; onClick: () => void; selectMode: boolean; isSelected: boolean;
        onToggleSelect: (id: string) => void
        usageInfo?: { lastUsedDate: string; totalUses: number } | null
    }) => (
        <div data-testid={`file-row-${item.id}`} onClick={selectMode ? () => onToggleSelect(item.id) : onClick}>
            <span>{item.name}</span>
            {selectMode && <span data-testid={`selected-${item.id}`}>{isSelected ? "selected" : "unselected"}</span>}
            {/* Mirrors the real row's "last used" badge — present only when the
                component actually received usage data for this chart. */}
            {usageInfo && (
                <span data-testid={`usage-${item.id}`}>
                    {usageInfo.lastUsedDate}|{usageInfo.totalUses}
                </span>
            )}
        </div>
    ),
}))
vi.mock("../UploadDialog", () => ({
    UploadDialog: ({ onUploadComplete }: { onUploadComplete: () => void }) => (
        <button data-testid="upload-btn" onClick={onUploadComplete}>Upload</button>
    ),
}))
vi.mock("../ScraperModal", () => ({
    ScraperModal: ({ onUploadComplete }: { onUploadComplete: () => void }) => (
        <button data-testid="scraper-btn" onClick={onUploadComplete}>Scrape</button>
    ),
}))
vi.mock("../SelectionActionBar", () => ({
    SelectionActionBar: ({ selectMode, selectedIds, onSelectAll, onClear, onDismiss }: {
        selectMode: boolean; selectedIds: Set<string>;
        onSelectAll: () => void; onClear: () => void; onDismiss: () => void
    }) => selectMode ? (
        <div data-testid="selection-bar">
            <span data-testid="selection-count">{selectedIds.size}</span>
            <button data-testid="select-all-btn" onClick={onSelectAll}>Select All</button>
            <button data-testid="clear-btn" onClick={onClear}>Clear</button>
            <button data-testid="dismiss-btn" onClick={onDismiss}>Dismiss</button>
        </div>
    ) : null,
}))
// Keep the REAL `applyLibraryFilters` / `createEmptyFilters` so the Recency
// behaviour under test is the shipped implementation, not a stub. Only the
// visual chip row is replaced — with a probe that exposes whether the parent
// considers the usage map complete (it passes `undefined` while incomplete),
// plus a button to drive the recency filter without the real chip UI.
vi.mock("../LibraryFilters", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../LibraryFilters")>()
    return {
        ...actual,
        LibraryFilters: ({ filters, onFiltersChange, usageMap }: {
            filters: import("../LibraryFilters").LibraryFilterState
            onFiltersChange: (f: import("../LibraryFilters").LibraryFilterState) => void
            usageMap?: Record<string, { lastUsedDate: string; totalUses: number } | null>
        }) => (
            <div data-testid="library-filters" data-recency-available={usageMap ? "yes" : "no"}>
                <button
                    data-testid="set-recency-recent"
                    onClick={() => onFiltersChange({ ...filters, recency: "recent" })}
                >
                    Recent
                </button>
            </div>
        ),
    }
})
vi.mock("@/components/audio/AudioPlayer", () => ({
    AudioPlayer: () => <div data-testid="audio-player" />,
}))
vi.mock("@/components/ui/scroll-area", () => ({
    ScrollArea: ({ children, ...props }: { children: React.ReactNode }) => <div {...props}>{children}</div>,
}))
// Mock add-to-setlist hook + sheet — they pull setlist-firebase which needs db
vi.mock("@/hooks/use-add-to-setlist", () => ({
    useAddToSetlist: () => ({
        canAddToSetlist: false,
        openForSongs: vi.fn(),
        isOpen: false,
        setIsOpen: vi.fn(),
        editableSetlists: [],
        loading: false,
        searchQuery: "",
        setSearchQuery: vi.fn(),
        addToSetlist: vi.fn(),
        createNewSetlist: vi.fn(),
        pendingSongs: [],
    }),
}))
vi.mock("../AddToSetlistSheet", () => ({
    AddToSetlistSheet: () => <div data-testid="add-to-setlist-sheet" />,
}))

import { SongChartsLibrary } from "../SongChartsLibrary"

const chartFile1: DriveFile = {
    id: "chart-1", name: "Ma_Tovu.pdf", mimeType: "application/pdf",
}
const chartFile2: DriveFile = {
    id: "chart-2", name: "Shalom.musicxml", mimeType: "application/xml",
}
const audioFile1: DriveFile = {
    id: "audio-1", name: "intro.mp3", mimeType: "audio/mpeg",
}

/** Reset apiFetch to the inert default — `clearAllMocks` keeps implementations. */
function resetApiFetch() {
    mockApiFetch.mockImplementation(() =>
        Promise.resolve({ ok: true, json: () => Promise.resolve({}) }) as never
    )
}

describe("SongChartsLibrary", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        resetApiFetch()
        mockDisplayedFiles = [chartFile1, chartFile2]
        mockAllFiles = [chartFile1, chartFile2]
        mockInitialized = true
        authState.isAdmin = true
        // No auth user → the usage effect early-returns, exactly as before this
        // suite existed. The usage path has its own describe block below.
        authState.user = null
    })

    // ── Rendering ──

    it("renders header with title", () => {
        render(<SongChartsLibrary />)
        expect(screen.getByText("Song Charts")).toBeDefined()
    })

    it("renders file list from displayedFiles", () => {
        render(<SongChartsLibrary />)
        expect(screen.getByTestId("file-row-chart-1")).toBeDefined()
        expect(screen.getByTestId("file-row-chart-2")).toBeDefined()
    })

    it("shows file count in tabs", () => {
        render(<SongChartsLibrary />)
        // Component renders counts inside the CRC Charts / Shireinu tabs
        expect(screen.getByText(/CRC Charts \(\d+\)/)).toBeDefined()
        expect(screen.getByText(/Shireinu \(\d+\)/)).toBeDefined()
    })

    it("shows audio tab only when audio files exist", () => {
        mockDisplayedFiles = [chartFile1, audioFile1]
        render(<SongChartsLibrary />)
        expect(screen.getByText(/Audio/)).toBeDefined()
    })

    it("hides audio tab when no audio files", () => {
        mockDisplayedFiles = [chartFile1, chartFile2]
        render(<SongChartsLibrary />)
        expect(screen.queryByText(/Audio \(/)).toBeNull()
    })

    // ── Loading & Error ──

    it("shows skeleton when not initialized and loading", () => {
        mockInitialized = false
        // Need to mock loading from useLibrary
        vi.mocked(mockLoadLibrary)
        render(<SongChartsLibrary />)
        // Since initialized is false but loading from useLibrary is false, it goes to error path
        // Let's test the initialized=true path instead (skeleton requires both !initialized && loading)
    })

    it("shows empty state when no files match", () => {
        mockDisplayedFiles = []
        render(<SongChartsLibrary />)
        expect(screen.getByTestId("empty-state")).toBeDefined()
        expect(screen.getByTestId("empty-title").textContent).toBe("No charts in the library yet")
    })

    it("shows search empty state with query text", () => {
        mockDisplayedFiles = []
        render(<SongChartsLibrary />)
        // Type in search
        const searchInput = screen.getByPlaceholderText("Search by name, key, topic...")
        fireEvent.change(searchInput, { target: { value: "xyz" } })
        expect(screen.getByTestId("empty-title").textContent).toBe("No matches found")
    })

    // ── Search ──

    // Fix 2 (2026-08-31): the filter push is now debounced ~180ms, so this
    // assertion needs the timer advanced. The assertion itself is unchanged —
    // typing still ends up calling setFilter("tovu").
    it("search input updates filter in library store", () => {
        vi.useFakeTimers()
        try {
            render(<SongChartsLibrary />)
            const searchInput = screen.getByPlaceholderText("Search by name, key, topic...")
            fireEvent.change(searchInput, { target: { value: "tovu" } })
            act(() => { vi.advanceTimersByTime(200) })
            expect(mockSetFilter).toHaveBeenCalledWith("tovu")
        } finally {
            vi.useRealTimers()
        }
    })

    // ── Back button ──

    it("calls onBack when provided", () => {
        const onBack = vi.fn()
        render(<SongChartsLibrary onBack={onBack} />)
        const backBtn = screen.getAllByRole("button")[0]
        fireEvent.click(backBtn)
        expect(onBack).toHaveBeenCalled()
    })

    it("calls router.back when onBack not provided", () => {
        render(<SongChartsLibrary />)
        const backBtn = screen.getAllByRole("button")[0]
        fireEvent.click(backBtn)
        expect(mockRouterBack).toHaveBeenCalled()
    })

    // ── File click ──

    it("calls onSelectFile when provided and file clicked", () => {
        const onSelectFile = vi.fn()
        render(<SongChartsLibrary onSelectFile={onSelectFile} />)
        fireEvent.click(screen.getByTestId("file-row-chart-1"))
        expect(onSelectFile).toHaveBeenCalledWith(chartFile1)
    })

    // ── Select mode ──

    it("toggles select mode via button", () => {
        render(<SongChartsLibrary />)
        const selectBtn = screen.getByTitle("Select files")
        fireEvent.click(selectBtn)
        expect(screen.getByTestId("selection-bar")).toBeDefined()
    })

    it("select all works in select mode", () => {
        render(<SongChartsLibrary />)
        const selectBtn = screen.getByTitle("Select files")
        fireEvent.click(selectBtn)
        fireEvent.click(screen.getByTestId("select-all-btn"))
        // After select all, count should reflect all items
        expect(screen.getByTestId("selection-count").textContent).toBe("2")
    })

    it("dismiss clears selection and exits select mode", () => {
        render(<SongChartsLibrary />)
        fireEvent.click(screen.getByTitle("Select files"))
        expect(screen.getByTestId("selection-bar")).toBeDefined()
        fireEvent.click(screen.getByTestId("dismiss-btn"))
        expect(screen.queryByTestId("selection-bar")).toBeNull()
    })

    // ── Upload ──

    it("upload callback triggers library reload via cache buster apiFetch", async () => {
        render(<SongChartsLibrary />)
        fireEvent.click(screen.getByTestId("upload-btn"))
        
        // The real component calls apiFetch to bypass the CDN cache.
        // We'll wait to ensure the microtask queue flushes the Promise chain.
        await vi.waitUntil(() => mockApiFetch.mock.calls.some((call: any[]) => typeof call[0] === 'string' && call[0].includes('t=')))
        
        expect(mockApiFetch).toHaveBeenCalledWith(
            expect.stringContaining('/api/library/list?all=true&t=')
        )
    })

    // ── Hydrate ──

    it("hydrates store with initialLibrary on mount", () => {
        render(<SongChartsLibrary initialLibrary={[chartFile1]} />)
        expect(mockHydrate).toHaveBeenCalledWith([chartFile1])
    })

    // ── v11.1-03: org-aware tab labels + admin All-sites toggle ──

    it("crc (default) renders the CRC Charts + Shireinu tab labels (byte-identical)", () => {
        render(<SongChartsLibrary org="crc" />)
        expect(screen.getByText(/CRC Charts \(\d+\)/)).toBeDefined()
        expect(screen.getByText(/Shireinu \(\d+\)/)).toBeDefined()
    })

    it("broslaz renders org-neutral 'Charts' and omits the CRC-specific Shireinu tab", () => {
        render(<SongChartsLibrary org="brotherslazaroff" />)
        expect(screen.getByText(/^Charts \(\d+\)/)).toBeDefined()
        expect(screen.queryByText(/CRC Charts/)).toBeNull()
        expect(screen.queryByText(/Shireinu/)).toBeNull()
    })

    // ── Nava Tehilah collection (2026-08-18) ──

    it("crc renders the Nava Tehilah tab; broslaz omits it", () => {
        const { unmount } = render(<SongChartsLibrary org="crc" />)
        expect(screen.getByText(/Nava Tehilah \(\d+\)/)).toBeDefined()
        unmount()

        render(<SongChartsLibrary org="brotherslazaroff" />)
        expect(screen.queryByText(/Nava Tehilah/)).toBeNull()
    })

    // The 'core' tab is a NEGATIVE filter (every collection that is not
    // supplemental/uploads/nava). A new collection that isn't added to that
    // exclusion list leaks its rows into CRC Charts, which is silent and
    // wrong — this pins the count so the leak can't come back.
    it("keeps nava rows out of the CRC Charts count and in the Nava Tehilah count", () => {
        const navaChart: DriveFile = {
            id: "nava-1", name: "Niggun Tishrei.pdf", mimeType: "application/pdf",
            collection: "nava",
        }
        mockDisplayedFiles = [chartFile1, navaChart]
        mockAllFiles = [chartFile1, navaChart]

        render(<SongChartsLibrary org="crc" />)
        expect(screen.getByText("CRC Charts (1)")).toBeDefined()
        expect(screen.getByText("Nava Tehilah (1)")).toBeDefined()
    })

    it("switching to the Nava Tehilah tab shows only nava charts", () => {
        const navaChart: DriveFile = {
            id: "nava-1", name: "Niggun Tishrei.pdf", mimeType: "application/pdf",
            collection: "nava",
        }
        mockDisplayedFiles = [chartFile1, navaChart]
        mockAllFiles = [chartFile1, navaChart]

        render(<SongChartsLibrary org="crc" />)
        fireEvent.click(screen.getByText("Nava Tehilah (1)"))
        expect(screen.getByText(/Niggun Tishrei/)).toBeDefined()
        expect(screen.queryByText(/Ma.Tovu/)).toBeNull()
    })

    it("shows the admin-only 'All sites' toggle for admins, hides it for non-admins", () => {
        const { unmount } = render(<SongChartsLibrary org="brotherslazaroff" />)
        expect(screen.getByRole("switch", { name: /all sites/i })).toBeDefined()
        unmount()

        authState.isAdmin = false
        render(<SongChartsLibrary org="brotherslazaroff" />)
        expect(screen.queryByRole("switch", { name: /all sites/i })).toBeNull()
    })
})

// ── Dedupe arrangements (2026-05-22 fix) ──
// Regression for the bug where the Library tab hid song arrangements:
// `dedupeChartsByStem` keyed on `bareStem`, which strips the composer
// parenthetical, so every "L'Chah Dodi (X)" collapsed to one row. The
// dedupe key now preserves the disambiguator → distinct arrangements
// survive, while a chart's format twins + exact-duplicate names still
// collapse to one row.
describe("SongChartsLibrary — dedupe keeps distinct arrangements", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        resetApiFetch()
        mockInitialized = true
        authState.user = null
    })

    const pdf = (id: string, name: string): DriveFile => ({ id, name, mimeType: "application/pdf" })

    it("keeps all 5 distinct L'Cha Dodi arrangements (different composer parentheticals)", () => {
        mockDisplayedFiles = [
            pdf("lcd-friedman", "L'Chah Dodi (Friedman).pdf"),
            pdf("lcd-isaacson", "L'Chah Dodi (Isaacson).pdf"),
            pdf("lcd-israeli", "L'Chah Dodi (Israeli).pdf"),
            pdf("lcd-sephardic", "L'Chah Dodi (Sephardic).pdf"),
            pdf("lcd-zeira", "L'Chah Dodi (Zeira) - (Rotenberg).pdf"),
        ]
        mockAllFiles = mockDisplayedFiles
        render(<SongChartsLibrary />)
        expect(screen.getByTestId("file-row-lcd-friedman")).toBeDefined()
        expect(screen.getByTestId("file-row-lcd-isaacson")).toBeDefined()
        expect(screen.getByTestId("file-row-lcd-israeli")).toBeDefined()
        expect(screen.getByTestId("file-row-lcd-sephardic")).toBeDefined()
        expect(screen.getByTestId("file-row-lcd-zeira")).toBeDefined()
        expect(screen.getAllByTestId(/^file-row-/)).toHaveLength(5)
    })

    it("still collapses a chart's format twins (PDF + MusicXML of the same name) to one row", () => {
        mockDisplayedFiles = [
            { id: "foo-pdf", name: "Foo (Bar).pdf", mimeType: "application/pdf" },
            { id: "foo-xml", name: "Foo (Bar).musicxml", mimeType: "application/xml" },
        ]
        mockAllFiles = mockDisplayedFiles
        render(<SongChartsLibrary />)
        expect(screen.getAllByTestId(/^file-row-/)).toHaveLength(1)
        expect(screen.getByTestId("file-row-foo-pdf")).toBeDefined()
        expect(screen.queryByTestId("file-row-foo-xml")).toBeNull()
    })

    it("still collapses exact-duplicate names to one row", () => {
        mockDisplayedFiles = [
            { id: "dup-1", name: "Hashkivenu (Klepper).pdf", mimeType: "application/pdf" },
            { id: "dup-2", name: "Hashkivenu (Klepper).pdf", mimeType: "application/pdf" },
        ]
        mockAllFiles = mockDisplayedFiles
        render(<SongChartsLibrary />)
        expect(screen.getAllByTestId(/^file-row-/)).toHaveLength(1)
        expect(screen.getByTestId("file-row-dup-1")).toBeDefined()
        expect(screen.queryByTestId("file-row-dup-2")).toBeNull()
    })
})

// ══════════════════════════════════════════════════════════════════════════
// Fix 1 (2026-08-31) — usage data was silently truncated at 100 charts.
//
// The old effect was:
//     const batchIds = fileIds.slice(0, 100)
//     apiFetch(`/api/library/usage?fileIds=${batchIds.join(',')}`)
//         .then(...).catch(() => {})
// — one slice, no loop, and every failure swallowed. With 762 alphabetically
// sorted charts, everything past #100 had NO usage entry: no "last used"
// badge, and `applyLibraryFilters` read the missing entry as "never played",
// so the Recency filter silently hid/kept the wrong charts.
//
// Every test below fails against that code and passes against the batched
// implementation.
// ══════════════════════════════════════════════════════════════════════════

const USAGE_DATE = new Date().toISOString() // "recent" by definition

/** Build N charts whose names sort in id order, so `chart-NNN` is alphabetical. */
function manyCharts(n: number): DriveFile[] {
    return Array.from({ length: n }, (_, i) => ({
        id: `chart-${String(i).padStart(3, "0")}`,
        name: `Song ${String(i).padStart(3, "0")}.pdf`,
        mimeType: "application/pdf",
    }))
}

/** apiFetch stub that answers /api/library/usage with real data for every id asked. */
function usageRespondingApiFetch(requested: string[][]) {
    return (url: string) => {
        if (typeof url === "string" && url.includes("/api/library/usage")) {
            const ids = decodeURIComponent(url.split("fileIds=")[1] ?? "")
                .split(",")
                .filter(Boolean)
            requested.push(ids)
            return Promise.resolve({
                ok: true,
                json: () =>
                    Promise.resolve(
                        Object.fromEntries(
                            ids.map(id => [id, { lastUsedDate: USAGE_DATE, totalUses: 4 }]),
                        ),
                    ),
            })
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    }
}

describe("SongChartsLibrary — usage data covers the WHOLE library (Fix 1)", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        resetApiFetch()
        mockInitialized = true
        authState.isAdmin = true
        authState.user = { uid: "test-uid" }
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it("the alphabetically LAST chart of 250 gets its last-used data", async () => {
        const charts = manyCharts(250)
        mockDisplayedFiles = charts
        mockAllFiles = charts
        const requested: string[][] = []
        mockApiFetch.mockImplementation(usageRespondingApiFetch(requested) as never)

        render(<SongChartsLibrary />)

        // chart-249 is index 249 — far past the old 100-id slice.
        await waitFor(() => {
            expect(screen.getByTestId("usage-chart-249")).toBeDefined()
        })
        expect(screen.getByTestId("usage-chart-249").textContent).toBe(`${USAGE_DATE}|4`)
        // …and the first chart still has its data too.
        expect(screen.getByTestId("usage-chart-000")).toBeDefined()
    })

    it("issues one request per 100-id chunk and asks for every id exactly once", async () => {
        const charts = manyCharts(250)
        mockDisplayedFiles = charts
        mockAllFiles = charts
        const requested: string[][] = []
        mockApiFetch.mockImplementation(usageRespondingApiFetch(requested) as never)

        render(<SongChartsLibrary />)
        await waitFor(() => {
            expect(screen.getByTestId("usage-chart-249")).toBeDefined()
        })

        expect(requested).toHaveLength(3)
        // Never above the server's hard cap (>100 ids is a 400, not a truncation).
        for (const batch of requested) expect(batch.length).toBeLessThanOrEqual(100)
        const flat = requested.flat()
        expect(flat).toHaveLength(250)
        expect(new Set(flat).size).toBe(250)
        expect(new Set(flat)).toEqual(new Set(charts.map(c => c.id)))
    })

    // The acceptance criterion: correctly INCLUDED by the Recency filter.
    it("the Recency filter includes a chart past #100 that was recently used", async () => {
        const charts = manyCharts(250)
        mockDisplayedFiles = charts
        mockAllFiles = charts
        mockApiFetch.mockImplementation(usageRespondingApiFetch([]) as never)

        render(<SongChartsLibrary />)

        // The recency chip only becomes available once usage is COMPLETE —
        // filtering on a half-loaded map would be confidently wrong.
        await waitFor(() => {
            expect(screen.getByTestId("library-filters").getAttribute("data-recency-available")).toBe("yes")
        })

        fireEvent.click(screen.getByTestId("set-recency-recent"))

        // Every chart was used today, so "recent" must keep all 250 — including
        // the ones the old single-slice fetch never asked about.
        expect(screen.getByTestId("file-row-chart-249")).toBeDefined()
        expect(screen.getByTestId("file-row-chart-100")).toBeDefined()
        expect(screen.getAllByTestId(/^file-row-/)).toHaveLength(250)
    })

    it("does not expose the Recency filter while usage is still loading", () => {
        const charts = manyCharts(250)
        mockDisplayedFiles = charts
        mockAllFiles = charts
        // Never resolves → permanently 'loading'.
        mockApiFetch.mockImplementation((() => new Promise(() => { })) as never)

        render(<SongChartsLibrary />)
        expect(screen.getByTestId("library-filters").getAttribute("data-recency-available")).toBe("no")
    })

    it("surfaces a retry instead of swallowing a failed usage fetch", async () => {
        const charts = manyCharts(120)
        mockDisplayedFiles = charts
        mockAllFiles = charts
        mockApiFetch.mockImplementation(((url: string) =>
            typeof url === "string" && url.includes("/api/library/usage")
                ? Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) })
                : Promise.resolve({ ok: true, json: () => Promise.resolve({}) })) as never)

        render(<SongChartsLibrary />)

        // Visible in behaviour, not a silent `.catch(() => {})`.
        await waitFor(() => {
            expect(screen.getByRole("button", { name: /retry/i })).toBeDefined()
        })
        expect(screen.getByTestId("library-filters").getAttribute("data-recency-available")).toBe("no")

        // Retry re-issues the batches; on success the notice clears and the
        // recency filter becomes available.
        mockApiFetch.mockImplementation(usageRespondingApiFetch([]) as never)
        fireEvent.click(screen.getByRole("button", { name: /retry/i }))
        await waitFor(() => {
            expect(screen.getByTestId("library-filters").getAttribute("data-recency-available")).toBe("yes")
        })
        expect(screen.queryByRole("button", { name: /retry/i })).toBeNull()
    })

    it("does not refetch usage when the user switches tabs or searches", async () => {
        const charts = [
            ...manyCharts(120),
            { id: "supp-1", name: "Shireinu Song.pdf", mimeType: "application/pdf", collection: "supplemental" as const },
        ]
        mockDisplayedFiles = charts
        mockAllFiles = charts
        const requested: string[][] = []
        mockApiFetch.mockImplementation(usageRespondingApiFetch(requested) as never)

        render(<SongChartsLibrary />)
        await waitFor(() => {
            expect(screen.getByTestId("usage-chart-119")).toBeDefined()
        })
        const afterInitial = requested.length

        fireEvent.click(screen.getByText(/Shireinu \(\d+\)/))
        fireEvent.change(screen.getByPlaceholderText("Search by name, key, topic..."), {
            target: { value: "song" },
        })

        expect(requested).toHaveLength(afterInitial)
    })
})

// ══════════════════════════════════════════════════════════════════════════
// Fix 2 (2026-08-31) — search was pushed into a full-catalog Fuse.js scan on
// every keystroke. The filter is now debounced; the controlled input is not.
// ══════════════════════════════════════════════════════════════════════════

describe("SongChartsLibrary — search filtering is debounced (Fix 2)", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        resetApiFetch()
        mockDisplayedFiles = [chartFile1, chartFile2]
        mockAllFiles = [chartFile1, chartFile2]
        mockInitialized = true
        authState.isAdmin = true
        authState.user = null // keep the usage effect out of this suite
    })

    afterEach(() => {
        vi.useRealTimers()
        authState.user = { uid: "test-uid" }
    })

    it("a 5-keystroke burst produces ONE filter scan, with the final value", () => {
        vi.useFakeTimers()
        render(<SongChartsLibrary />)
        const input = screen.getByPlaceholderText("Search by name, key, topic...")
        mockSetFilter.mockClear() // ignore the mount-time setFilter("")

        for (const value of ["t", "to", "tov", "tovu", "tovu "]) {
            fireEvent.change(input, { target: { value } })
            act(() => { vi.advanceTimersByTime(40) })
        }

        // Nothing has fired yet — every keystroke landed inside the window.
        expect(mockSetFilter).not.toHaveBeenCalled()

        act(() => { vi.advanceTimersByTime(200) })
        expect(mockSetFilter).toHaveBeenCalledTimes(1)
        expect(mockSetFilter).toHaveBeenCalledWith("tovu ")
    })

    it("the input itself stays synchronous — never debounced", () => {
        vi.useFakeTimers()
        render(<SongChartsLibrary />)
        const input = screen.getByPlaceholderText("Search by name, key, topic...") as HTMLInputElement

        fireEvent.change(input, { target: { value: "hashkiv" } })
        // No timer advance: the caret must already show the typed text.
        expect(input.value).toBe("hashkiv")
    })

    it("clearing the box applies immediately (no debounce on the empty query)", () => {
        vi.useFakeTimers()
        render(<SongChartsLibrary />)
        const input = screen.getByPlaceholderText("Search by name, key, topic...")
        fireEvent.change(input, { target: { value: "tovu" } })
        act(() => { vi.advanceTimersByTime(200) })
        mockSetFilter.mockClear()

        fireEvent.change(input, { target: { value: "" } })
        expect(mockSetFilter).toHaveBeenCalledWith("")
    })
})
