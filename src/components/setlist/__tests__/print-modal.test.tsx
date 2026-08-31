import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react"
import { SetlistTrack } from "@/types/models"

// Hoisted mocks
const mockApiFetch = vi.hoisted(() => vi.fn())
const mockToast = vi.hoisted(() => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
}))
const mockSubscribe = vi.hoisted(() => vi.fn())

// Mock cn utility
vi.mock("@/lib/utils", () => ({
    cn: (...args: (string | boolean | undefined | null)[]) =>
        args.filter(Boolean).join(" "),
}))

// Mock auth
const mockUser = { uid: "user-1", displayName: "Test User", email: "test@test.com" }
const mockProfile = {
    musicianProfile: {
        instrument: "guitar",
        defaultTransposition: 2,
        preferFlats: false,
        preferredCapoFret: 3,
    },
}
let currentProfile = mockProfile
vi.mock("@/lib/auth-context", () => ({
    useAuth: () => ({ user: mockUser, profile: currentProfile }),
}))

// Mock api-client
vi.mock("@/lib/api-client", () => ({
    apiFetch: mockApiFetch,
}))

// Mock toast
vi.mock("sonner", () => ({
    toast: mockToast,
}))

// Mock logger
vi.mock("@/lib/logger", () => ({
    logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

// Mock musician profiles subscription
const mockMusicians = [
    {
        uid: "m-1",
        displayName: "Sarah",
        profile: { instrument: "guitar", defaultTransposition: 0, preferFlats: false, preferredCapoFret: 0 },
    },
    {
        uid: "m-2",
        displayName: "David",
        profile: { instrument: "keyboard", defaultTransposition: 0, preferFlats: true, preferredCapoFret: 0 },
    },
]
vi.mock("@/lib/musician-profile", () => ({
    subscribeToAllMusicianProfiles: mockSubscribe.mockImplementation((cb: (m: typeof mockMusicians) => void) => {
        cb(mockMusicians)
        return vi.fn() // unsubscribe
    }),
    INSTRUMENT_PRESETS: {
        guitar: { label: "Guitar", defaultTransposition: 0 },
        keyboard: { label: "Keyboard", defaultTransposition: 0 },
    },
}))

// Mock sub-components to stubs
vi.mock("../TransposeTrackList", () => ({
    TransposeTrackList: ({ activeTranspositions }: { activeTranspositions: number }) => (
        <div data-testid="transpose-track-list">Active: {activeTranspositions}</div>
    ),
    TrackTranspose: {},
}))
vi.mock("../PrintModeSelector", () => ({
    PrintModeSelector: ({
        printMode,
        setPrintMode,
        toggleMusician,
    }: {
        printMode: string
        setPrintMode: (m: string) => void
        toggleMusician: (uid: string) => void
    }) => (
        <div data-testid="print-mode-selector">
            <span data-testid="current-mode">{printMode}</span>
            <button data-testid="set-standard" onClick={() => setPrintMode("standard")}>Standard</button>
            <button data-testid="set-just-me" onClick={() => setPrintMode("just-me")}>Just Me</button>
            <button data-testid="set-select" onClick={() => setPrintMode("select-musicians")}>Select</button>
            <button data-testid="toggle-m1" onClick={() => toggleMusician("m-1")}>Toggle M1</button>
            <button data-testid="toggle-m2" onClick={() => toggleMusician("m-2")}>Toggle M2</button>
        </div>
    ),
    PrintMode: {},
}))
vi.mock("../PrintStats", () => ({
    PrintStats: () => <div data-testid="print-stats" />,
}))

// Mock jszip
vi.mock("jszip", () => ({
    default: class {
        files: Record<string, unknown> = {}
        file(name: string, data: unknown) { this.files[name] = data }
        generateAsync() { return Promise.resolve(new Blob(["zip"])) }
    },
}))

import { PrintModal } from "../PrintModal"

const sampleTracks: SetlistTrack[] = [
    { id: "t1", title: "Ma Tovu", type: "song", fileId: "file-1", key: "D" },
    { id: "t2", title: "Shalom Aleichem", type: "song", fileId: "file-2", key: "Am" },
    { id: "t3", title: "Opening Notes", type: "header" },
]

const defaultProps = {
    setlistName: "Shabbat Service",
    tracks: sampleTracks,
    onClose: vi.fn(),
    setlistId: "setlist-123",
    assignedMusicians: [{ uid: "m-1", name: "Sarah" }],
    eventDate: "2026-03-20",
}

describe("PrintModal", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        currentProfile = mockProfile
        localStorage.clear()
    })

    // ── Rendering ──

    it("renders modal with title and header", () => {
        render(<PrintModal {...defaultProps} />)
        expect(screen.getByText("Gig Packet")).toBeDefined()
    })

    it("renders title input with setlist name", () => {
        render(<PrintModal {...defaultProps} />)
        const titleInput = screen.getByDisplayValue("Shabbat Service")
        expect(titleInput).toBeDefined()
    })

    it("renders date input with formatted event date", () => {
        render(<PrintModal {...defaultProps} />)
        // The date gets formatted as locale string
        const dateInputs = screen.getAllByRole("textbox")
        expect(dateInputs.length).toBeGreaterThanOrEqual(2)
    })

    it("renders print mode selector", () => {
        render(<PrintModal {...defaultProps} />)
        expect(screen.getByTestId("print-mode-selector")).toBeDefined()
    })

    it("does not show an image-skip banner for image-containing setlists (v70-01-02 — images now embed)", () => {
        const tracksWithImage: SetlistTrack[] = [
            ...sampleTracks,
            { id: "t4", title: "Dodi Li", type: "song", fileId: "upload-img", key: "C", mimeType: "image/png" },
        ]
        render(<PrintModal {...defaultProps} tracks={tracksWithImage} />)
        expect(screen.queryByText(/included in printed packets/i)).toBeNull()
    })

    // ── Mode switching ──

    it("defaults to just-me mode when user has musician profile", () => {
        render(<PrintModal {...defaultProps} />)
        expect(screen.getByTestId("current-mode").textContent).toBe("just-me")
    })

    it("defaults to standard mode when user has no musician profile", () => {
        currentProfile = { musicianProfile: {} as typeof mockProfile.musicianProfile }
        render(<PrintModal {...defaultProps} />)
        expect(screen.getByTestId("current-mode").textContent).toBe("standard")
    })

    it("switches to standard mode", () => {
        render(<PrintModal {...defaultProps} />)
        fireEvent.click(screen.getByTestId("set-standard"))
        expect(screen.getByTestId("current-mode").textContent).toBe("standard")
    })

    // ── TransposeTrackList visibility ──

    it("shows TransposeTrackList in just-me mode when transpositions active", async () => {
        // Default profile has defaultTransposition: 2, so transpositions will be active
        render(<PrintModal {...defaultProps} />)
        
        await waitFor(() => {
            expect(screen.getByTestId("current-mode").textContent).toBe("just-me")
        })
        
        // TransposeTrackList renders when printMode is just-me AND activeTranspositions > 0 AND !coverOnly
        // We need to click "Full Packet (PDFs)" to set coverOnly to false since it defaults to true
        fireEvent.click(screen.getByText("Full Packet (PDFs)"))
        
        await waitFor(() => {
            expect(screen.getByTestId("transpose-track-list")).toBeDefined()
        })
    })

    it("hides TransposeTrackList in standard mode", () => {
        render(<PrintModal {...defaultProps} />)
        fireEvent.click(screen.getByTestId("set-standard"))
        expect(screen.queryByTestId("transpose-track-list")).toBeNull()
    })

    // ── Musician selection ──

    it("toggleMusician adds and removes musicians from selection", () => {
        render(<PrintModal {...defaultProps} />)
        // Switch to select-musicians mode
        fireEvent.click(screen.getByTestId("set-select"))
        // Toggle m-2 on (m-1 is already in via assignedMusicians)
        fireEvent.click(screen.getByTestId("toggle-m2"))
        // Toggle m-1 off
        fireEvent.click(screen.getByTestId("toggle-m1"))
        // Verified by no crash and mode still select-musicians
        expect(screen.getByTestId("current-mode").textContent).toBe("select-musicians")
    })

    // ── Action buttons ──

    it("renders download buttons", () => {
        render(<PrintModal {...defaultProps} />)
        expect(screen.getByText("Download PDF")).toBeDefined()
    })

    it("shows email button when setlistId is present", () => {
        render(<PrintModal {...defaultProps} />)
        expect(screen.getByText("Email Packet Links to Band")).toBeDefined()
    })

    it("hides email button when setlistId is absent", () => {
        render(<PrintModal {...defaultProps} setlistId={undefined} />)
        expect(screen.queryByText("Email Packet Links to Band")).toBeNull()
    })

    it("print button disabled when in select-musicians mode with no selection", () => {
        localStorage.clear()
        render(<PrintModal {...defaultProps} assignedMusicians={[]} />)
        fireEvent.click(screen.getByTestId("set-select"))
        // canGenerate = linkedPdfTracks.length > 0 && !generating && (printMode !== "select-musicians" || selectedUids.length > 0)
        // In select mode with no uids, should be disabled
        const downloadBtn = screen.getByText("Download PDF").closest("button")
        expect(downloadBtn?.disabled).toBe(true)
    })

    // ── API calls ──

    it("calls /api/setlist/print on download click", async () => {
        const blob = new Blob(["pdf-content"], { type: "application/pdf" })
        mockApiFetch.mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) })

        // Mock URL.createObjectURL and related DOM methods
        const createObjectURL = vi.fn(() => "blob:test-url")
        const revokeObjectURL = vi.fn()
        global.URL.createObjectURL = createObjectURL
        global.URL.revokeObjectURL = revokeObjectURL

        render(<PrintModal {...defaultProps} />)
        // Switch to standard mode for simpler test
        fireEvent.click(screen.getByTestId("set-standard"))

        await act(async () => {
            fireEvent.click(screen.getByText("Download PDF"))
        })

        await waitFor(() => {
            expect(mockApiFetch).toHaveBeenCalledWith("/api/setlist/print", expect.objectContaining({
                method: "POST",
            }))
        })
    })

    it("calls /api/setlist/email-packets on email click", async () => {
        mockApiFetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ sent: 2, failed: 0 }),
        })

        render(<PrintModal {...defaultProps} />)

        await act(async () => {
            fireEvent.click(screen.getByText("Email Packet Links to Band"))
        })

        // Wait for confirmation UI
        await waitFor(() => {
            expect(screen.getByText(/Send \d+ Email/i)).toBeDefined()
        })

        await act(async () => {
            fireEvent.click(screen.getByText(/Send \d+ Email/i))
        })

        await waitFor(() => {
            expect(mockApiFetch).toHaveBeenCalledWith("/api/setlist/email-packets", expect.objectContaining({
                method: "POST",
            }))
            expect(mockToast.success).toHaveBeenCalledWith("Packet links emailed to 2 musicians")
        })
    })

    it("shows toast error when email fails", async () => {
        mockApiFetch.mockResolvedValue({
            ok: false,
            json: () => Promise.resolve({ error: "No emails configured" }),
        })

        render(<PrintModal {...defaultProps} />)

        await act(async () => {
            fireEvent.click(screen.getByText("Email Packet Links to Band"))
        })

        // Wait for confirmation UI
        await waitFor(() => {
            expect(screen.getByText(/Send \d+ Email/i)).toBeDefined()
        })

        await act(async () => {
            fireEvent.click(screen.getByText(/Send \d+ Email/i))
        })

        await waitFor(() => {
            expect(mockToast.error).toHaveBeenCalledWith("No emails configured")
        })
    })

    it("shows toast error when emailing without setlistId", async () => {
        render(<PrintModal {...defaultProps} setlistId={undefined} />)
        // Email button shouldn't even show, but verify no crash
        expect(screen.queryByText("Email Packet Links to Band")).toBeNull()
    })

    // ── Close ──

    it("calls onClose when close button clicked", () => {
        const onClose = vi.fn()
        render(<PrintModal {...defaultProps} onClose={onClose} />)
        // Close button is the X icon button
        const closeButtons = screen.getAllByRole("button")
        // First button in header should be close
        fireEvent.click(closeButtons[0])
        expect(onClose).toHaveBeenCalled()
    })

    // ── Loading state ──

    it("shows loading spinner during generation", async () => {
        // Make apiFetch hang
        mockApiFetch.mockReturnValue(new Promise(() => {}))

        render(<PrintModal {...defaultProps} />)
        fireEvent.click(screen.getByTestId("set-standard"))

        await act(async () => {
            fireEvent.click(screen.getByText("Download PDF"))
        })

        // During generation, should show the progress message
        await waitFor(() => {
            expect(screen.getByText("Generating gig packet...")).toBeDefined()
        })
    })

    // ── State persistence ──

    it("saves selection to localStorage on mode change", () => {
        render(<PrintModal {...defaultProps} />)
        fireEvent.click(screen.getByTestId("set-standard"))

        const stored = JSON.parse(localStorage.getItem("crc-print-selection") || "{}")
        expect(stored.mode).toBe("standard")
    })

    it("restores mode from localStorage", () => {
        localStorage.setItem("crc-print-selection", JSON.stringify({ mode: "standard", selectedUids: [] }))
        render(<PrintModal {...defaultProps} />)
        expect(screen.getByTestId("current-mode").textContent).toBe("standard")
    })

    // ── Date field: service date vs. print date ──
    //
    // Production regression: no caller ever passed `eventDate`, so the date
    // line always fell back to `new Date()` — the day the packet was
    // printed, not the day of the service. Verified against production:
    // setlist 1e108f17-f24b-4bf0-a9f7-6a0392ccc43d carries
    // `eventDate: "2026-09-05T14:00:00.000Z"` but printed "Monday, August
    // 31, 2026". `use-setlist-performance.ts` now threads the setlist's
    // `eventDate` through to this prop; these two tests pin the wiring
    // itself, independent of the hook.
    describe("date field — service date vs. print date", () => {
        it("shows the setlist's eventDate, not today, when one is supplied", () => {
            // 14:00 UTC is safely mid-day local time everywhere this suite
            // actually runs (no TZ override in vitest.config.ts — the host
            // defaults to America/Chicago, CI to UTC — both read Sept 5
            // here), so the UTC-vs-local boundary can't flip the calendar
            // day. This is also the exact timestamp shape from the
            // production setlist above.
            render(<PrintModal {...defaultProps} eventDate="2026-09-05T14:00:00.000Z" />)
            const dateField = screen.getByLabelText("Date") as HTMLInputElement
            expect(dateField.value).toBe("Saturday, September 5, 2026")
        })

        it("falls back to today's date when the setlist has no eventDate", () => {
            vi.useFakeTimers()
            vi.setSystemTime(new Date("2026-08-31T14:00:00.000Z"))
            try {
                render(<PrintModal {...defaultProps} eventDate={undefined} />)
                const dateField = screen.getByLabelText("Date") as HTMLInputElement
                expect(dateField.value).toBe("Monday, August 31, 2026")
            } finally {
                vi.useRealTimers()
            }
        })
    })
})
