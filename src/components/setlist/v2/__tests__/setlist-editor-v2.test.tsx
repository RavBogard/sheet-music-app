import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { SetlistTrack } from "@/types/models"

// Captured DnD handler
let capturedOnDragEnd: ((event: { active: { id: string }; over: { id: string } | null }) => void) | null = null

// Mock cn utility
vi.mock("@/lib/utils", () => ({
    cn: (...args: (string | boolean | undefined | null)[]) =>
        args.filter(Boolean).join(" "),
}))

// Mock music store
vi.mock("@/lib/store", () => ({
    useMusicStore: Object.assign(
        () => ({ setQueue: vi.fn() }),
        { getState: () => ({ setQueue: vi.fn() }) }
    ),
    FileType: {},
}))

// Mock auth
const mockUser = { uid: "user-1", displayName: "Test User", email: "test@test.com" }
vi.mock("@/lib/auth-context", () => ({
    useAuth: () => ({ user: mockUser, isAdmin: true, isBandLeader: true }),
}))

// Mock router
const mockPush = vi.fn()
const mockRefresh = vi.fn()
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}))

// Mock chat store
vi.mock("@/lib/chat-store", () => ({
    useChatStore: Object.assign(() => ({}), {
        getState: () => ({ open: vi.fn(), toggle: vi.fn() }),
    }),
}))

// Mock setlist logic hook
const mockSetlistLogic = {
    canEdit: true,
    isBandLeader: true,
    setlistId: "setlist-1",
    name: "Shabbat Service",
    setName: vi.fn(),
    tracks: [] as SetlistTrack[],
    isPublic: false,
    setIsPublic: vi.fn(),
    eventDate: null,
    setEventDate: vi.fn(),
    rabbi: "",
    setRabbi: vi.fn(),
    serviceNotes: "",
    setServiceNotes: vi.fn(),
    musicians: [],
    setMusicians: vi.fn(),
    saving: false,
    lastSaved: null,
    syncSetlist: vi.fn().mockResolvedValue(undefined),
    moveTrack: vi.fn(),
    updateTrack: vi.fn(),
    deleteTrack: vi.fn(),
    matchFile: vi.fn(),
    addSongsFromLibrary: vi.fn(),
    addServiceItem: vi.fn(),
    detectKeyForFile: vi.fn(),
    togglePublic: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    canUndo: false,
    canRedo: false,
    addToHistory: vi.fn(),
    setTracks: vi.fn(),
    restoreTracks: vi.fn(),
}
vi.mock("@/hooks/use-setlist-logic", () => ({
    useSetlistLogic: () => mockSetlistLogic,
}))

// Mock batch selection hook (controllable)
const mockBatchSelection = {
    selectMode: false,
    setSelectMode: vi.fn(),
    selectedIds: new Set<string>(),
    setSelectedIds: vi.fn(),
    toggleSelectId: vi.fn(),
    handleBatchDelete: vi.fn(),
    handleBatchDuplicate: vi.fn(),
    exitSelectMode: vi.fn(),
}
vi.mock("@/hooks/use-batch-selection", () => ({
    useBatchSelection: () => mockBatchSelection,
}))

// Mock @dnd-kit/core to capture onDragEnd
vi.mock("@dnd-kit/core", () => ({
    DndContext: ({ children, onDragEnd }: { children: React.ReactNode; onDragEnd: typeof capturedOnDragEnd }) => {
        capturedOnDragEnd = onDragEnd
        return <div data-testid="dnd-context">{children}</div>
    },
    closestCenter: vi.fn(),
    KeyboardSensor: vi.fn(),
    MouseSensor: vi.fn(),
    TouchSensor: vi.fn(),
    useSensor: vi.fn(),
    useSensors: vi.fn(() => []),
}))
vi.mock("@dnd-kit/sortable", () => ({
    SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    sortableKeyboardCoordinates: vi.fn(),
    verticalListSortingStrategy: {},
}))

// Mock useAddToSetlist hook
vi.mock("@/hooks/use-add-to-setlist", () => ({
    useAddToSetlist: () => ({
        isOpen: false,
        setIsOpen: vi.fn(),
        pendingSongs: [],
        editableSetlists: [],
        loading: false,
        searchQuery: "",
        setSearchQuery: vi.fn(),
        openForSongs: vi.fn(),
        addToSetlist: vi.fn(),
        canAddToSetlist: true,
    }),
}))

// Mock AddToSetlistSheet component
vi.mock("@/components/library/AddToSetlistSheet", () => ({
    AddToSetlistSheet: () => null,
}))

// Mock Firebase services
vi.mock("@/lib/setlist-firebase", () => ({
    createSetlistService: () => ({
        deleteSetlist: vi.fn(),
        duplicateSetlist: vi.fn(),
    }),
}))
vi.mock("@/lib/template-firebase", () => ({
    syncTemplateSlot: vi.fn(),
}))

// Mock validations
vi.mock("@/lib/validations", () => ({
    SERVICE_FLOW_TYPES: ["prayer", "reading", "transition"] as const,
}))

// Mock V2 sub-components
vi.mock("../SetlistTopBar", () => ({
    SetlistTopBar: ({ name, onUndo, onRedo, canUndo, canRedo, onPrint, overflowTrigger }: {
        name: string; onUndo: () => void; onRedo: () => void;
        canUndo: boolean; canRedo: boolean; onPrint: () => void; overflowTrigger: React.ReactNode
    }) => (
        <div data-testid="top-bar">
            {name}
            <button data-testid="undo-btn" onClick={onUndo} disabled={!canUndo}>Undo</button>
            <button data-testid="redo-btn" onClick={onRedo} disabled={!canRedo}>Redo</button>
            {onPrint && <button data-testid="print-btn" onClick={onPrint}>Print</button>}
            {overflowTrigger}
        </div>
    ),
}))
vi.mock("../OverflowMenu", () => ({
    OverflowMenu: () => <div data-testid="overflow-menu">Menu</div>,
}))
vi.mock("../SongRow", () => ({
    SongRow: ({ track }: { track: SetlistTrack }) => (
        <div data-testid="song-row">{track.title}</div>
    ),
}))
vi.mock("../DividerRow", () => ({
    DividerRow: ({ track }: { track: SetlistTrack }) => (
        <div data-testid="divider-row">{track.title}</div>
    ),
}))
vi.mock("../FlowRow", () => ({
    FlowRow: ({ track }: { track: SetlistTrack }) => (
        <div data-testid="flow-row">{track.title}</div>
    ),
}))
vi.mock("../TrackSheet", () => ({
    TrackSheet: () => null,
}))
vi.mock("../SwipeToDelete", () => ({
    SwipeToDelete: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock("../BatchActionBar", () => ({
    BatchActionBar: ({ selectedCount, onDelete, onDuplicate, onExitSelectMode }: {
        selectedCount: number; onDelete: () => void; onDuplicate: () => void; onExitSelectMode: () => void
    }) => (
        <div data-testid="batch-action-bar">
            <span data-testid="batch-count">{selectedCount}</span>
            <button data-testid="batch-delete-btn" onClick={onDelete}>Delete</button>
            <button data-testid="batch-duplicate-btn" onClick={onDuplicate}>Duplicate</button>
            <button data-testid="batch-exit-btn" onClick={onExitSelectMode}>Exit</button>
        </div>
    ),
}))
vi.mock("../AddBar", () => ({
    AddBar: ({ onAddSongs }: { onAddSongs: () => void }) => (
        <button data-testid="add-songs-btn" onClick={onAddSongs}>Add Songs</button>
    ),
}))
vi.mock("../MusicianPicker", () => ({
    MusicianPicker: () => <div data-testid="musician-picker" />,
}))
vi.mock("../SearchOverlay", () => ({
    SearchOverlay: () => null,
}))

// Mock shared components
vi.mock("../../PrintModal", () => ({
    PrintModal: () => null,
}))
vi.mock("../../SetlistDialogs", () => ({
    DeleteSetlistDialog: () => null,
    DuplicateSetlistDialog: () => null,
}))
vi.mock("../../SetlistHistoryPanel", () => ({
    SetlistHistoryPanel: () => null,
}))
vi.mock("../../modals/NamePrompt", () => ({
    NamePrompt: () => null,
}))
vi.mock("../../modals/AddSongsModal", () => ({
    AddSongsModal: () => null,
}))
vi.mock("../../modals/MatchFileModal", () => ({
    MatchFileModal: () => null,
}))

import { SetlistEditorV2 } from "../SetlistEditorV2"

const sampleTracks: SetlistTrack[] = [
    { id: "s1", title: "Ma Tovu", type: "song", fileId: "file-1", key: "D" },
    { id: "h1", title: "Kabbalat Shabbat", type: "header" },
    { id: "s2", title: "Shalom Aleichem", type: "song", fileId: "file-2", key: "Am" },
]

describe("SetlistEditorV2", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockSetlistLogic.tracks = []
        mockSetlistLogic.name = "Shabbat Service"
        mockSetlistLogic.canEdit = true
    })

    it("renders setlist name in top bar", () => {
        render(<SetlistEditorV2 setlistId="setlist-1" initialName="Shabbat Service" />)
        expect(screen.getByTestId("top-bar").textContent).toContain("Shabbat Service")
    })

    it("renders tracks when provided", () => {
        mockSetlistLogic.tracks = sampleTracks
        render(<SetlistEditorV2 setlistId="setlist-1" initialTracks={sampleTracks} />)

        expect(screen.getAllByTestId("song-row")).toHaveLength(2)
        expect(screen.getByTestId("divider-row").textContent).toContain("Kabbalat Shabbat")
    })

    it("renders empty state when no tracks", () => {
        vi.useFakeTimers()
        mockSetlistLogic.tracks = []
        render(<SetlistEditorV2 setlistId="setlist-1" />)

        vi.advanceTimersByTime(400) // empty state has 300ms debounce
        expect(screen.getByText("Empty setlist")).toBeDefined()
        vi.useRealTimers()
    })

    it("renders add songs button for authorized users", () => {
        mockSetlistLogic.tracks = sampleTracks
        render(<SetlistEditorV2 setlistId="setlist-1" />)
        expect(screen.getByTestId("add-songs-btn")).toBeDefined()
    })

    it("hides add bar when user cannot edit", () => {
        mockSetlistLogic.canEdit = false
        mockSetlistLogic.tracks = sampleTracks
        render(<SetlistEditorV2 setlistId="setlist-1" />)
        expect(screen.queryByTestId("add-songs-btn")).toBeNull()
    })

    // ── Drag-and-drop tests ──

    it("calls moveTrack when drag ends with different positions", () => {
        mockSetlistLogic.tracks = sampleTracks
        render(<SetlistEditorV2 setlistId="setlist-1" initialTracks={sampleTracks} />)

        expect(capturedOnDragEnd).not.toBeNull()
        capturedOnDragEnd!({ active: { id: "s1" }, over: { id: "s2" } })
        expect(mockSetlistLogic.moveTrack).toHaveBeenCalledWith("s1", "s2")
    })

    it("does not call moveTrack when dragging to same position", () => {
        mockSetlistLogic.tracks = sampleTracks
        render(<SetlistEditorV2 setlistId="setlist-1" initialTracks={sampleTracks} />)

        capturedOnDragEnd!({ active: { id: "s1" }, over: { id: "s1" } })
        expect(mockSetlistLogic.moveTrack).not.toHaveBeenCalled()
    })

    it("does not call moveTrack when drag ends with no over target", () => {
        mockSetlistLogic.tracks = sampleTracks
        render(<SetlistEditorV2 setlistId="setlist-1" initialTracks={sampleTracks} />)

        capturedOnDragEnd!({ active: { id: "s1" }, over: null })
        expect(mockSetlistLogic.moveTrack).not.toHaveBeenCalled()
    })

    // ── Batch selection tests ──

    it("shows BatchActionBar when selectMode is true", () => {
        mockBatchSelection.selectMode = true
        mockBatchSelection.selectedIds = new Set(["s1"])
        mockSetlistLogic.tracks = sampleTracks
        render(<SetlistEditorV2 setlistId="setlist-1" initialTracks={sampleTracks} />)

        expect(screen.getByTestId("batch-action-bar")).toBeDefined()
        expect(screen.getByTestId("batch-count").textContent).toBe("1")
        mockBatchSelection.selectMode = false
        mockBatchSelection.selectedIds = new Set()
    })

    it("hides AddBar when in select mode", () => {
        mockBatchSelection.selectMode = true
        mockSetlistLogic.tracks = sampleTracks
        render(<SetlistEditorV2 setlistId="setlist-1" initialTracks={sampleTracks} />)

        expect(screen.queryByTestId("add-songs-btn")).toBeNull()
        mockBatchSelection.selectMode = false
    })

    it("batch delete triggers handleBatchDelete", () => {
        mockBatchSelection.selectMode = true
        mockBatchSelection.selectedIds = new Set(["s1", "s2"])
        mockSetlistLogic.tracks = sampleTracks
        render(<SetlistEditorV2 setlistId="setlist-1" initialTracks={sampleTracks} />)

        fireEvent.click(screen.getByTestId("batch-delete-btn"))
        expect(mockBatchSelection.handleBatchDelete).toHaveBeenCalled()
        mockBatchSelection.selectMode = false
        mockBatchSelection.selectedIds = new Set()
    })

    it("batch duplicate triggers handleBatchDuplicate", () => {
        mockBatchSelection.selectMode = true
        mockBatchSelection.selectedIds = new Set(["s1"])
        mockSetlistLogic.tracks = sampleTracks
        render(<SetlistEditorV2 setlistId="setlist-1" initialTracks={sampleTracks} />)

        fireEvent.click(screen.getByTestId("batch-duplicate-btn"))
        expect(mockBatchSelection.handleBatchDuplicate).toHaveBeenCalled()
        mockBatchSelection.selectMode = false
        mockBatchSelection.selectedIds = new Set()
    })

    // ── Undo/Redo tests ──

    it("undo button is disabled when canUndo is false", () => {
        mockSetlistLogic.canUndo = false
        render(<SetlistEditorV2 setlistId="setlist-1" />)
        const undoBtn = screen.getByTestId("undo-btn") as HTMLButtonElement
        expect(undoBtn.disabled).toBe(true)
    })

    it("redo button is disabled when canRedo is false", () => {
        mockSetlistLogic.canRedo = false
        render(<SetlistEditorV2 setlistId="setlist-1" />)
        const redoBtn = screen.getByTestId("redo-btn") as HTMLButtonElement
        expect(redoBtn.disabled).toBe(true)
    })

    it("undo button calls undo when canUndo is true", () => {
        mockSetlistLogic.canUndo = true
        render(<SetlistEditorV2 setlistId="setlist-1" />)
        fireEvent.click(screen.getByTestId("undo-btn"))
        expect(mockSetlistLogic.undo).toHaveBeenCalled()
    })

    it("redo button calls redo when canRedo is true", () => {
        mockSetlistLogic.canRedo = true
        render(<SetlistEditorV2 setlistId="setlist-1" />)
        fireEvent.click(screen.getByTestId("redo-btn"))
        expect(mockSetlistLogic.redo).toHaveBeenCalled()
    })

    // ── Overflow menu ──

    it("renders overflow menu", () => {
        render(<SetlistEditorV2 setlistId="setlist-1" />)
        expect(screen.getByTestId("overflow-menu")).toBeDefined()
    })
})
