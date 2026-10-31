import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent } from "@testing-library/react"
import type { ComponentType } from "react"

import type { SetlistTrack } from "@/types/models"
import { expectNoUntranslatedText, renderPseudo, renderWithI18n } from "@/test-utils/i18n"

/**
 * Phase 7, lane A1 (Perform chrome): the chart toolbar, rehearsal audio bar
 * and song navigation render every UI string through t(), mirror on a
 * right-to-left page, and the chart area of the overlay stays left-to-right.
 * Mocks follow src/components/performance/__tests__/pdf-overlay.test.tsx.
 */

const mockStoreState = {
    setQueue: vi.fn(),
    queueIndex: 1,
    playbackQueue: [
        { id: "a", fileId: "file-a", name: "Test Song A", type: "pdf" },
        { id: "b", fileId: "file-b", name: "Test Song B", type: "pdf" },
        { id: "c", fileId: "file-c", name: "Test Song C", type: "pdf" },
    ] as Array<Record<string, unknown>>,
    aiState: { isEnabled: false, pageData: {}, scanningPages: [] as number[], error: null },
    setAiEnabled: vi.fn(),
    capoFret: null as number | null,
    transposition: 0,
    musicXmlKey: null,
    zoom: 1,
    setZoom: vi.fn(),
    fitMode: "width" as "width" | "page",
    setFitMode: vi.fn(),
    nextSong: vi.fn(),
    prevSong: vi.fn(),
    currentSetlistId: null,
    jumpToSong: vi.fn(),
}
vi.mock("@/lib/store", () => ({
    useMusicStore: Object.assign(
        (selector?: (s: Record<string, unknown>) => unknown) =>
            typeof selector === "function" ? selector(mockStoreState) : mockStoreState,
        { getState: () => mockStoreState },
    ),
    QueueItem: {},
}))
vi.mock("@/lib/library-store", () => ({
    useLibraryStore: (selector?: (s: { allFiles: unknown[] }) => unknown) =>
        typeof selector === "function" ? selector({ allFiles: [] }) : { allFiles: [] },
}))
vi.mock("@/hooks/use-monitor-access", () => ({ useMonitorAccess: () => ({ hasAccess: false }) }))
vi.mock("@/hooks/use-monitor-connection", () => ({ useMonitorConnection: () => {} }))
vi.mock("@/hooks/use-metronome", () => ({
    useMetronome: () => ({ isPlaying: false, togglePlay: vi.fn(), currentBpm: 100, setCurrentBpm: vi.fn(), isBeat: false }),
}))
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null, isAdmin: false, isBandLeader: false }) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), useParams: () => ({ id: "test-setlist" }) }))
vi.mock("@/lib/offline-idb", () => ({
    getFile: async () => null,
    hasFile: async () => true,
    putFile: async () => {},
    listFileIds: async () => [],
}))

// Owned by sibling lanes (setlist drawer, music viewers, monitor): stubbed
// with no text so the pseudo check sees only this lane's chrome.
vi.mock("@/components/performance/SetlistDrawer", () => ({ SetlistDrawer: () => null }))
vi.mock("@/components/music/TransposerMenu", () => ({ TransposerMenu: () => null }))
vi.mock("@/components/music/ChordEditBar", () => ({ ChordEditBar: () => null }))
vi.mock("@/components/monitor/QuickMonitorPanel", () => ({ QuickMonitorPanel: () => null }))
vi.mock("@/components/music/PDFViewer", () => ({
    PDFViewer: ({ url }: { url: string }) => <div data-testid="pdf-viewer" data-url={url} />,
}))
vi.mock("@/components/music/SmartScoreViewer", () => ({ SmartScoreViewer: () => <div data-testid="smart-score-viewer" /> }))
vi.mock("@/components/music/TextScoreViewer", () => ({ TextScoreViewer: () => <div data-testid="text-score-viewer" /> }))
vi.mock("@/components/music/ImageScoreViewer", () => ({ ImageScoreViewer: () => <div data-testid="image-score-viewer" /> }))
vi.mock("@/components/music/AudioViewer", () => ({ AudioViewer: () => <div data-testid="audio-viewer" /> }))
vi.mock("@/components/setlist/PrintModal", () => ({ PrintModal: () => null }))
vi.mock("next/dynamic", () => ({
    __esModule: true,
    default: (loader: () => Promise<Record<string, unknown>>) => {
        let resolved: unknown = null
        loader().then((mod) => {
            resolved = mod.default || mod
        })
        const DynamicWrapper = (props: Record<string, unknown>) => {
            if (!resolved) return null
            const C = resolved as ComponentType<Record<string, unknown>>
            return <C {...props} />
        }
        return DynamicWrapper
    },
}))

import { PerformanceToolbar } from "@/components/performance/PerformanceToolbar"
import { SongNavigation } from "@/components/performance/SongNavigation"
import { PDFOverlay } from "@/components/performance/PDFOverlay"

const wakeLock = { isActive: false, isSupported: true, onRequest: vi.fn(), onRelease: vi.fn() }
// Data / verbatim units the pseudo check must not flag.
const ALLOW = ["Test Song A", "Test Song B", "Test Song C", "BPM"]

beforeEach(() => {
    // jsdom has no media playback; audio elements pause on unmount.
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {})
    mockStoreState.queueIndex = 1
    mockStoreState.transposition = 0
    mockStoreState.capoFret = null
})

describe("PerformanceToolbar under the pseudo-locale", () => {
    it("qps: every visible string and label comes through t()", () => {
        const r = renderPseudo(<PerformanceToolbar onHome={vi.fn()} onPrintChart={async () => {}} wakeLock={wakeLock} />)
        expectNoUntranslatedText(r.container, { allow: ALLOW })
    })

    it("qps: capo label is translated, musical key text is not touched", () => {
        mockStoreState.capoFret = 2
        mockStoreState.transposition = 2
        const r = renderPseudo(<PerformanceToolbar onHome={vi.fn()} />)
        expectNoUntranslatedText(r.container, { allow: ALLOW })
    })

    it("qps-rtl: root wrapper is dir=rtl and the musical key label keeps ltr", () => {
        mockStoreState.transposition = 2
        const r = renderPseudo(<PerformanceToolbar onHome={vi.fn()} wakeLock={wakeLock} />, { rtl: true })
        expect(r.container.firstElementChild?.getAttribute("dir")).toBe("rtl")
        expectNoUntranslatedText(r.container, { allow: ALLOW })
        const label = r.getByTestId("transpose-trigger-desktop").querySelector("span.truncate")
        expect(label?.getAttribute("dir")).toBe("ltr")
    })

    it("en: English text and DOM direction attributes unchanged (CRC)", () => {
        const r = renderWithI18n(<PerformanceToolbar onHome={vi.fn()} />)
        expect(r.getAllByText("Exit").length).toBeGreaterThan(0)
        expect(r.getAllByLabelText("Zoom in").length).toBeGreaterThan(0)
        expect(r.getByTestId("transpose-trigger-desktop").querySelector("[dir]")).toBeNull()
    })
})

describe("SongNavigation follows the reading direction", () => {
    const chevrons = (root: Element) => [...root.querySelectorAll("button svg")]

    it("qps: translated, chevrons not mirrored", () => {
        const r = renderPseudo(<SongNavigation />)
        expectNoUntranslatedText(r.container, { allow: ALLOW })
        const icons = chevrons(r.container)
        expect(icons).toHaveLength(2)
        for (const i of icons) expect(i.getAttribute("class")).not.toMatch(/-scale-x-100/)
    })

    it("qps-rtl: chevrons carry the mirror class", () => {
        const r = renderPseudo(<SongNavigation />, { rtl: true })
        expect(r.container.firstElementChild?.getAttribute("dir")).toBe("rtl")
        const icons = chevrons(r.container)
        expect(icons).toHaveLength(2)
        for (const i of icons) expect(i.getAttribute("class")).toMatch(/-scale-x-100/)
    })

    it("en: unchanged text", () => {
        const r = renderWithI18n(<SongNavigation />)
        expect(r.getByText("Song 2 of 3")).toBeTruthy()
        expect(r.getByLabelText("Previous song")).toBeTruthy()
    })
})

describe("PDFOverlay: chrome mirrors, chart area stays ltr", () => {
    const tracks = [
        { id: "a", fileId: "file-a", title: "Test Song A", type: "song", mimeType: "application/pdf" },
        { id: "b", fileId: "file-b", title: "Test Song B", type: "song", mimeType: "application/pdf" },
    ] as unknown as SetlistTrack[]
    const chartArea = (root: Element) => root.querySelector(".flex-1.overflow-auto") as HTMLElement | null

    it("qps-rtl: the chart box is dir=ltr, the page is dir=rtl", () => {
        const r = renderPseudo(
            <PDFOverlay track={tracks[0]} tracks={tracks} currentIndex={0} onClose={vi.fn()} onNavigate={vi.fn()} isPublicView={false} />,
            { rtl: true },
        )
        expect(r.container.firstElementChild?.getAttribute("dir")).toBe("rtl")
        const area = chartArea(r.container)
        expect(area).not.toBeNull()
        expect(area!.getAttribute("dir")).toBe("ltr")
        expect(area!.querySelector("[data-testid=pdf-viewer]")).not.toBeNull()
    })

    it("en: no dir attribute on the chart box (CRC DOM unchanged)", () => {
        const r = renderWithI18n(
            <PDFOverlay track={tracks[0]} tracks={tracks} currentIndex={0} onClose={vi.fn()} onNavigate={vi.fn()} isPublicView={false} />,
        )
        expect(chartArea(r.container)!.hasAttribute("dir")).toBe(false)
    })
})
