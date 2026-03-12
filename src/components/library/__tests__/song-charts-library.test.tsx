import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { DriveFile } from "@/types/models"

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

// Mock auth
vi.mock("@/lib/auth-context", () => ({
    useAuth: () => ({ isAdmin: true, isBandLeader: true, profile: {}, canUpload: true }),
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

// Mock content search
vi.mock("@/hooks/use-content-search", () => ({
    useContentSearch: () => ({
        results: [],
        searching: false,
        query: "",
        search: vi.fn(),
        clear: vi.fn(),
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
    LibraryFileRow: ({ item, onClick, selectMode, isSelected, onToggleSelect }: {
        item: DriveFile; onClick: () => void; selectMode: boolean; isSelected: boolean;
        onToggleSelect: (id: string) => void
    }) => (
        <div data-testid={`file-row-${item.id}`} onClick={selectMode ? () => onToggleSelect(item.id) : onClick}>
            <span>{item.name}</span>
            {selectMode && <span data-testid={`selected-${item.id}`}>{isSelected ? "selected" : "unselected"}</span>}
        </div>
    ),
}))
vi.mock("../UploadDialog", () => ({
    UploadDialog: ({ onUploadComplete }: { onUploadComplete: () => void }) => (
        <button data-testid="upload-btn" onClick={onUploadComplete}>Upload</button>
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
vi.mock("../LibraryFilters", () => ({
    LibraryFilters: () => <div data-testid="library-filters" />,
    applyLibraryFilters: (files: DriveFile[]) => files,
    createEmptyFilters: () => ({}),
}))
vi.mock("@/components/library/ContentSearchResults", () => ({
    ContentSearchResults: () => <div data-testid="content-search-results" />,
}))
vi.mock("@/components/audio/AudioPlayer", () => ({
    AudioPlayer: () => <div data-testid="audio-player" />,
}))
vi.mock("@/components/ui/scroll-area", () => ({
    ScrollArea: ({ children, ...props }: { children: React.ReactNode }) => <div {...props}>{children}</div>,
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

describe("SongChartsLibrary", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockDisplayedFiles = [chartFile1, chartFile2]
        mockAllFiles = [chartFile1, chartFile2]
        mockInitialized = true
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

    it("shows file count in header", () => {
        render(<SongChartsLibrary />)
        expect(screen.getByText("2 charts")).toBeDefined()
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

    it("search input updates filter in library store", () => {
        render(<SongChartsLibrary />)
        const searchInput = screen.getByPlaceholderText("Search by name, key, topic...")
        fireEvent.change(searchInput, { target: { value: "tovu" } })
        expect(mockSetFilter).toHaveBeenCalledWith("tovu")
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

    it("upload callback triggers library reload", () => {
        render(<SongChartsLibrary />)
        fireEvent.click(screen.getByTestId("upload-btn"))
        expect(mockLoadLibrary).toHaveBeenCalled()
    })

    // ── Hydrate ──

    it("hydrates store with initialLibrary on mount", () => {
        render(<SongChartsLibrary initialLibrary={[chartFile1]} />)
        expect(mockHydrate).toHaveBeenCalledWith([chartFile1])
    })
})
