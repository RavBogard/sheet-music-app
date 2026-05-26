import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { SetlistTrack } from "@/types/models"

// Mock SmartScoreViewer before dynamic mock (so dynamic loader can resolve it)
vi.mock("@/components/music/SmartScoreViewer", () => ({
    SmartScoreViewer: ({ url }: { url: string }) => (
        <div data-testid="smart-score-viewer" data-url={url}>MusicXML Viewer</div>
    ),
}))

// audio-viewer-f7: mock AudioViewer so the dispatch test can assert
// routing without exercising the real <audio> element / IDB.
vi.mock("@/components/music/AudioViewer", () => ({
    AudioViewer: ({ fileId, title }: { fileId: string; title?: string }) => (
        <div data-testid="audio-viewer" data-file-id={fileId}>
            {title}
        </div>
    ),
}))

// Mock PDFViewer module
vi.mock("@/components/music/PDFViewer", () => ({
    PDFViewer: ({ url, trackName }: { url: string; trackName?: string }) => (
        <div data-testid="pdf-viewer" data-url={url}>
            {trackName}
        </div>
    ),
}))

// Mock TextScoreViewer for the dispatch tests so we can assert routing
// without exercising the real fetch / offline-idb resolve.
vi.mock("@/components/music/TextScoreViewer", () => ({
    TextScoreViewer: ({ fileId }: { fileId: string }) => (
        <div data-testid="text-score-viewer" data-file-id={fileId}>Text Viewer</div>
    ),
}))

// Mock ImageScoreViewer for the dispatch tests.
vi.mock("@/components/music/ImageScoreViewer", () => ({
    ImageScoreViewer: ({ url, alt }: { url: string; alt?: string }) => (
        <div data-testid="image-score-viewer" data-url={url}>{alt}</div>
    ),
}))

// Mock next/dynamic to synchronously resolve the loader
vi.mock("next/dynamic", () => ({
    __esModule: true,
    default: (loader: () => Promise<{ default?: unknown; [key: string]: unknown }>) => {
        // Resolve the module synchronously for testing
        let resolved: unknown = null
        loader().then((mod: { default?: unknown; [key: string]: unknown }) => {
            resolved = mod.default || mod
        })
        // In test environment, promises resolve synchronously in the mock chain
        // Return a wrapper that renders the resolved component
        const DynamicWrapper = (props: Record<string, unknown>) => {
            if (!resolved) return null
            const Component = resolved as React.ComponentType<Record<string, unknown>>
            return <Component {...props} />
        }
        DynamicWrapper.displayName = "DynamicWrapper"
        return DynamicWrapper
    },
}))

// Mock QuickMonitorPanel as stub
vi.mock("@/components/monitor/QuickMonitorPanel", () => ({
    QuickMonitorPanel: () => <div data-testid="monitor-panel">Monitor</div>,
}))

// Mock cn utility
vi.mock("@/lib/utils", () => ({
    cn: (...args: (string | boolean | undefined | null)[]) =>
        args.filter(Boolean).join(" "),
}))

// Mock the music store used by PDFOverlay and PerformanceToolbar
const mockStoreState = {
    setQueue: vi.fn(),
    queueIndex: 0,
    playbackQueue: [],
    aiState: { isEnabled: false, pageData: {}, scanningPages: [], error: null },
    setAiEnabled: vi.fn(),
    capoFret: null,
    transposition: 0,
    zoom: 1,
    setZoom: vi.fn(),
    currentSetlistId: null,
    jumpToSong: vi.fn(),
}
vi.mock("@/lib/store", () => ({
    useMusicStore: Object.assign(
        (selectorOrUndefined?: (s: Record<string, unknown>) => unknown) => {
            if (typeof selectorOrUndefined === "function") return selectorOrUndefined(mockStoreState)
            return mockStoreState
        },
        { getState: () => mockStoreState }
    ),
    QueueItem: {},
}))

// audio-render-type-discriminator: PDFOverlay now reads the libraryRow
// (not just `mimeType`) via `useLibraryStore`. The dispatch tests below
// drive scenarios that exercise libraryRow.mimeType + libraryRow.name —
// mock the store with a mutable `allFiles` array so each test can stage
// the row it needs without poking the real zustand store.
const mockLibraryState: { allFiles: { id: string; name: string; mimeType: string }[] } = {
    allFiles: [],
}
vi.mock("@/lib/library-store", () => ({
    useLibraryStore: (selector?: (s: typeof mockLibraryState) => unknown) =>
        typeof selector === "function" ? selector(mockLibraryState) : mockLibraryState,
}))

// Mock hooks used by PerformanceToolbar
vi.mock("@/hooks/use-monitor-access", () => ({ useMonitorAccess: () => ({ hasAccess: false }) }))
vi.mock("@/hooks/use-monitor-connection", () => ({ useMonitorConnection: () => {} }))
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null, isAdmin: false, isBandLeader: false }) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), useParams: () => ({ id: 'test-setlist' }) }))
vi.mock("@/lib/live-session-firebase", () => ({ subscribeToLiveSessions: () => () => {} }))

// Mock sub-components of PerformanceToolbar
vi.mock("@/components/music/TransposerMenu", () => ({
    TransposerMenu: () => <div>Transposer</div>,
}))
vi.mock("@/components/music/ChordEditBar", () => ({
    ChordEditBar: () => null,
}))
vi.mock("@/components/performance/MetronomeControl", () => ({
    MetronomeControl: () => <div>Metronome</div>,
}))
vi.mock("@/components/performance/SongNavigation", () => ({
    SongNavigation: () => <div data-testid="song-nav">Nav</div>,
}))
vi.mock("@/components/performance/SetlistDrawer", () => ({
    SetlistDrawer: () => <div>Drawer</div>,
}))

// Mock PrintModal which is rendered conditionally
vi.mock("@/components/setlist/PrintModal", () => ({
    PrintModal: () => <div data-testid="print-modal">Print Modal</div>,
}))

import { PDFOverlay } from "../PDFOverlay"

const songA: SetlistTrack = {
    id: "song-a",
    title: "Ma Tovu",
    key: "D",
    bpm: 120,
    type: "song",
    fileId: "file-a",
}

const prayer: SetlistTrack = {
    id: "prayer-1",
    title: "Opening Prayer",
    type: "prayer",
}

const songB: SetlistTrack = {
    id: "song-b",
    title: "Shalom Aleichem",
    key: "Am",
    bpm: 100,
    type: "song",
    fileId: "file-b",
}

const header: SetlistTrack = {
    id: "header-1",
    title: "Kabbalat Shabbat",
    type: "header",
}

const songNoFile: SetlistTrack = {
    id: "song-c",
    title: "Untitled Song",
    type: "song",
    // No fileId -- should be skipped by prev/next
}

const allTracks = [songA, prayer, songB, header, songNoFile]

describe("PDFOverlay", () => {
    const defaultProps = {
        track: songA,
        tracks: allTracks,
        currentIndex: 0,
        onClose: vi.fn(),
        onNavigate: vi.fn(),
        isPublicView: false,
    }

    beforeEach(() => {
        vi.clearAllMocks()
        mockLibraryState.allFiles = []
    })

    it("renders PDFViewer with correct URL", async () => {
        render(<PDFOverlay {...defaultProps} />)
        // fileUrl resolves asynchronously now (cached-blob-first; on a cache miss
        // it falls back to the network URL) — await the resolved viewer.
        const viewer = await screen.findByTestId("pdf-viewer")
        expect(viewer.getAttribute("data-url")).toBe("/api/drive/file/file-a")
    })

    it("renders the full PerformanceToolbar", () => {
        render(<PDFOverlay {...defaultProps} />)
        // PerformanceToolbar renders mobile + desktop layouts (both visible in jsdom)
        expect(screen.getAllByTestId("song-nav").length).toBeGreaterThanOrEqual(1)
    })

    it("renders Exit button from PerformanceToolbar", () => {
        render(<PDFOverlay {...defaultProps} />)
        // Mobile + desktop layouts each render an Exit button
        expect(screen.getAllByText("Exit").length).toBeGreaterThanOrEqual(1)
    })

    describe("queue building file type detection", () => {
        it('assigns type "pdf" for a regular file', () => {
            render(<PDFOverlay {...defaultProps} track={songA} tracks={[songA]} />)
            expect(mockStoreState.setQueue).toHaveBeenCalled()
            const queueItems = mockStoreState.setQueue.mock.calls[0][0]
            expect(queueItems[0].type).toBe("pdf")
        })

        it('assigns type "musicxml" for a track with db- prefix fileId', () => {
            const dbTrack: SetlistTrack = {
                id: "mxml-1",
                title: "DB MusicXML",
                type: "song",
                fileId: "db-abc123",
            }
            render(<PDFOverlay {...defaultProps} track={dbTrack} tracks={[dbTrack]} />)
            expect(mockStoreState.setQueue).toHaveBeenCalled()
            const queueItems = mockStoreState.setQueue.mock.calls[0][0]
            expect(queueItems[0].type).toBe("musicxml")
        })

        it('assigns type "musicxml" for a track with .musicxml extension', () => {
            const mxmlTrack: SetlistTrack = {
                id: "mxml-2",
                title: "MusicXML File",
                type: "song",
                fileId: "song.musicxml",
            }
            render(<PDFOverlay {...defaultProps} track={mxmlTrack} tracks={[mxmlTrack]} />)
            expect(mockStoreState.setQueue).toHaveBeenCalled()
            const queueItems = mockStoreState.setQueue.mock.calls[0][0]
            expect(queueItems[0].type).toBe("musicxml")
        })

        it('assigns type "musicxml" for a track with .xml extension', () => {
            const xmlTrack: SetlistTrack = {
                id: "mxml-3",
                title: "XML File",
                type: "song",
                fileId: "song.xml",
            }
            render(<PDFOverlay {...defaultProps} track={xmlTrack} tracks={[xmlTrack]} />)
            expect(mockStoreState.setQueue).toHaveBeenCalled()
            const queueItems = mockStoreState.setQueue.mock.calls[0][0]
            expect(queueItems[0].type).toBe("musicxml")
        })

        it('assigns type "musicxml" for a track with .mxl extension', () => {
            const mxlTrack: SetlistTrack = {
                id: "mxml-4",
                title: "MXL File",
                type: "song",
                fileId: "song.mxl",
            }
            render(<PDFOverlay {...defaultProps} track={mxlTrack} tracks={[mxlTrack]} />)
            expect(mockStoreState.setQueue).toHaveBeenCalled()
            const queueItems = mockStoreState.setQueue.mock.calls[0][0]
            expect(queueItems[0].type).toBe("musicxml")
        })
    })

    describe("file-type branching", () => {
        const songMxml: SetlistTrack = {
            id: "song-mxml",
            title: "Test Score",
            type: "song",
            fileId: "db-test123",
        }

        it("renders SmartScoreViewer for musicxml queue items", async () => {
            mockStoreState.playbackQueue = [
                { name: "Test Score", fileId: "db-test123", type: "musicxml", setlistIndex: 0 },
            ] as never[]
            mockStoreState.queueIndex = 0
            render(
                <PDFOverlay
                    {...defaultProps}
                    track={songMxml}
                    tracks={[songMxml]}
                    currentIndex={0}
                />
            )
            // fileUrl resolves async (cached-blob-first) — await the viewer.
            expect(await screen.findByTestId("smart-score-viewer")).toBeTruthy()
            expect(screen.queryByTestId("pdf-viewer")).toBeNull()
        })

        it("renders PDFViewer for pdf queue items", async () => {
            mockStoreState.playbackQueue = [
                { name: "Ma Tovu", fileId: "file-a", type: "pdf", setlistIndex: 0 },
            ] as never[]
            mockStoreState.queueIndex = 0
            render(
                <PDFOverlay
                    {...defaultProps}
                    track={songA}
                    tracks={[songA]}
                    currentIndex={0}
                />
            )
            expect(await screen.findByTestId("pdf-viewer")).toBeTruthy()
            expect(screen.queryByTestId("smart-score-viewer")).toBeNull()
        })

        it("does not render SmartScoreViewer for pdf queue items", () => {
            mockStoreState.playbackQueue = [
                { name: "Ma Tovu", fileId: "file-a", type: "pdf", setlistIndex: 0 },
            ] as never[]
            mockStoreState.queueIndex = 0
            render(
                <PDFOverlay
                    {...defaultProps}
                    track={songA}
                    tracks={[songA]}
                    currentIndex={0}
                />
            )
            expect(screen.queryByTestId("smart-score-viewer")).toBeNull()
        })

        it("does not render PDFViewer for musicxml queue items", () => {
            mockStoreState.playbackQueue = [
                { name: "Test Score", fileId: "db-test123", type: "musicxml", setlistIndex: 0 },
            ] as never[]
            mockStoreState.queueIndex = 0
            render(
                <PDFOverlay
                    {...defaultProps}
                    track={songMxml}
                    tracks={[songMxml]}
                    currentIndex={0}
                />
            )
            expect(screen.queryByTestId("pdf-viewer")).toBeNull()
        })

        // audio-viewer-f7 (2026-05-24): a track bonded to a .mp3 fileId
        // must route to AudioViewer, NOT PDFViewer. Before F7 the same
        // input surfaced as a "Failed to load PDF" 404 (the Yizkor "Adon
        // Olam" failure mode). Detection is extension-based here because
        // toQueueItem's FileType union doesn't include 'audio' yet (out
        // of scope per dispatch — separate lane owns track-type detection).
        it("renders AudioViewer for a .mp3 fileId and NOT PDFViewer", async () => {
            const audioTrack: SetlistTrack = {
                id: "song-audio",
                title: "Adon Olam",
                type: "song",
                fileId: "12JfLCHytM5q59btBQ05sz-V_SurQmUoT.mp3",
            }
            mockStoreState.playbackQueue = [
                { name: "Adon Olam", fileId: audioTrack.fileId!, type: "pdf", setlistIndex: 0 },
            ] as never[]
            mockStoreState.queueIndex = 0
            render(
                <PDFOverlay
                    {...defaultProps}
                    track={audioTrack}
                    tracks={[audioTrack]}
                    currentIndex={0}
                />
            )
            const audio = await screen.findByTestId("audio-viewer")
            expect(audio.getAttribute("data-file-id")).toBe(
                "12JfLCHytM5q59btBQ05sz-V_SurQmUoT.mp3",
            )
            expect(screen.queryByTestId("pdf-viewer")).toBeNull()
        })

        it("renders AudioViewer when track.fileName ends in an audio extension", async () => {
            const audioTrack: SetlistTrack = {
                id: "song-audio-fn",
                title: "Hashkiveinu",
                type: "song",
                fileId: "upload-abc-123",
                fileName: "hashkiveinu-cantor.m4a",
            }
            mockStoreState.playbackQueue = [
                { name: "Hashkiveinu", fileId: audioTrack.fileId!, type: "pdf", setlistIndex: 0 },
            ] as never[]
            mockStoreState.queueIndex = 0
            render(
                <PDFOverlay
                    {...defaultProps}
                    track={audioTrack}
                    tracks={[audioTrack]}
                    currentIndex={0}
                />
            )
            const audio = await screen.findByTestId("audio-viewer")
            expect(audio.getAttribute("data-file-id")).toBe("upload-abc-123")
            expect(screen.queryByTestId("pdf-viewer")).toBeNull()
        })
    })

    // audio-render-type-discriminator (2026-05-26): the dispatch now goes
    // through `resolveViewerKind`, which reads libraryRow signals BEFORE
    // track signals. Cover the priority tiers + the Adon Olam regressions
    // + the explicit "unknown" fallback so any future tweak to the
    // resolver surfaces here.
    describe("viewer-dispatch via resolveViewerKind", () => {
        it("Adon Olam regression — upload-{uuid} + libraryRow.mimeType='audio/mpeg' → AudioViewer (was: PDFViewer 404)", async () => {
            const t: SetlistTrack = {
                id: "song-adon",
                title: "Adon Olam",
                type: "song",
                fileId: "upload-c7c8-aaaa-bbbb",
            }
            mockLibraryState.allFiles = [
                { id: t.fileId!, name: "", mimeType: "audio/mpeg" },
            ]
            render(<PDFOverlay {...defaultProps} track={t} tracks={[t]} currentIndex={0} />)
            const audio = await screen.findByTestId("audio-viewer")
            expect(audio.getAttribute("data-file-id")).toBe(t.fileId)
            expect(screen.queryByTestId("pdf-viewer")).toBeNull()
        })

        it("Adon Olam regression — upload-{uuid} + libraryRow.name='Adon Olam.mp3' → AudioViewer", async () => {
            const t: SetlistTrack = {
                id: "song-adon-name",
                title: "Adon Olam",
                type: "song",
                fileId: "upload-c7c8-aaaa-cccc",
            }
            mockLibraryState.allFiles = [
                { id: t.fileId!, name: "Adon Olam.mp3", mimeType: "" },
            ]
            render(<PDFOverlay {...defaultProps} track={t} tracks={[t]} currentIndex={0} />)
            const audio = await screen.findByTestId("audio-viewer")
            expect(audio.getAttribute("data-file-id")).toBe(t.fileId)
            expect(screen.queryByTestId("pdf-viewer")).toBeNull()
        })

        it("priority-1 — libraryRow.mimeType beats track-side fileId extension", async () => {
            // track.fileId says .pdf, library_index says audio → audio wins.
            const t: SetlistTrack = {
                id: "song-priority",
                title: "Mislabeled Bond",
                type: "song",
                fileId: "looks-like-a-pdf.pdf",
            }
            mockLibraryState.allFiles = [
                { id: t.fileId!, name: "actual-cantor-take.mp3", mimeType: "audio/mpeg" },
            ]
            render(<PDFOverlay {...defaultProps} track={t} tracks={[t]} currentIndex={0} />)
            expect(await screen.findByTestId("audio-viewer")).toBeTruthy()
            expect(screen.queryByTestId("pdf-viewer")).toBeNull()
        })

        it("priority-2 — libraryRow.name rescues octet-stream MusicXML (mimetype weak link)", async () => {
            // application/octet-stream falls through to filename; .musicxml
            // ext on the library_index row wins → SmartScoreViewer renders.
            const t: SetlistTrack = {
                id: "song-mxml-octet",
                title: "Hashiveinu",
                type: "song",
                fileId: "upload-mxml-aaa",
            }
            mockLibraryState.allFiles = [
                { id: t.fileId!, name: "hashiveinu.musicxml", mimeType: "application/octet-stream" },
            ]
            render(<PDFOverlay {...defaultProps} track={t} tracks={[t]} currentIndex={0} />)
            expect(await screen.findByTestId("smart-score-viewer")).toBeTruthy()
            expect(screen.queryByTestId("pdf-viewer")).toBeNull()
        })

        it("text bond — libraryRow.mimeType='text/plain' → TextScoreViewer", async () => {
            const t: SetlistTrack = {
                id: "song-text",
                title: "Scraped Chart",
                type: "song",
                fileId: "upload-text-aaa",
            }
            mockLibraryState.allFiles = [
                { id: t.fileId!, name: "scraped.txt", mimeType: "text/plain" },
            ]
            render(<PDFOverlay {...defaultProps} track={t} tracks={[t]} currentIndex={0} />)
            const text = await screen.findByTestId("text-score-viewer")
            expect(text.getAttribute("data-file-id")).toBe(t.fileId)
            expect(screen.queryByTestId("pdf-viewer")).toBeNull()
        })

        it("image bond — libraryRow.mimeType='image/png' → ImageScoreViewer", async () => {
            const t: SetlistTrack = {
                id: "song-img",
                title: "Scanned Chart",
                type: "song",
                fileId: "upload-img-aaa",
            }
            mockLibraryState.allFiles = [
                { id: t.fileId!, name: "scan.png", mimeType: "image/png" },
            ]
            render(<PDFOverlay {...defaultProps} track={t} tracks={[t]} currentIndex={0} />)
            expect(await screen.findByTestId("image-score-viewer")).toBeTruthy()
            expect(screen.queryByTestId("pdf-viewer")).toBeNull()
        })

        it("positively-unrecognized libraryRow.name ext → 'unknown' fallback UI (NOT PDFViewer, NOT blank)", () => {
            const t: SetlistTrack = {
                id: "song-weird",
                title: "Weird Bond",
                type: "song",
                fileId: "upload-weird-aaa",
            }
            mockLibraryState.allFiles = [
                { id: t.fileId!, name: "resume.docx", mimeType: "" },
            ]
            render(<PDFOverlay {...defaultProps} track={t} tracks={[t]} currentIndex={0} />)
            expect(screen.getByTestId("viewer-unknown-fallback")).toBeTruthy()
            expect(screen.queryByTestId("pdf-viewer")).toBeNull()
            expect(screen.queryByTestId("audio-viewer")).toBeNull()
            expect(screen.getByTestId("viewer-unknown-fallback").textContent).toMatch(/can't render/i)
        })

        it("bare Drive ID with no signals → still PDFViewer (legacy default preserved; no false 'unknown')", async () => {
            // The Drive-bond happy path that pre-dates mimeType persistence.
            // libraryRow may not be hydrated yet; no extension on the id;
            // dispatch must keep rendering through PDFViewer.
            const t: SetlistTrack = {
                id: "legacy-drive",
                title: "Legacy Drive Chart",
                type: "song",
                fileId: "1AbCdEfGhIjKlMnOpQrStUvWxYz", // Drive ID shape
            }
            // No library row staged → undefined libraryRow.
            render(<PDFOverlay {...defaultProps} track={t} tracks={[t]} currentIndex={0} />)
            expect(await screen.findByTestId("pdf-viewer")).toBeTruthy()
            expect(screen.queryByTestId("viewer-unknown-fallback")).toBeNull()
        })
    })
})
