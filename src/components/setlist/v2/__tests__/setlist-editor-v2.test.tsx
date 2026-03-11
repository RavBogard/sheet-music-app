import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { SetlistTrack } from "@/types/models"

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

// Mock batch selection hook
vi.mock("@/hooks/use-batch-selection", () => ({
    useBatchSelection: () => ({
        selectMode: false,
        setSelectMode: vi.fn(),
        selectedIds: new Set(),
        setSelectedIds: vi.fn(),
        toggleSelectId: vi.fn(),
        handleBatchDelete: vi.fn(),
        handleBatchDuplicate: vi.fn(),
        exitSelectMode: vi.fn(),
    }),
}))

// Mock Firebase services
vi.mock("@/lib/setlist-firebase", () => ({
    createSetlistService: () => ({
        deleteSetlist: vi.fn(),
        copyToPersonal: vi.fn(),
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
    SetlistTopBar: ({ name }: { name: string }) => (
        <div data-testid="top-bar">{name}</div>
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
    BatchActionBar: () => null,
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
})
