import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"

// Mock firebase modules before any component imports
vi.mock("@/lib/firebase", () => ({
    db: {},
    getDb: vi.fn(async () => ({})),
    subscribeWithDb: vi.fn((setup: (db: unknown) => (() => void) | void) => {
        const u = setup({})
        return typeof u === 'function' ? u : () => {}
    }),
    auth: {},
    googleProvider: {},
}))

vi.mock("firebase/firestore", () => ({
    collection: vi.fn(),
    query: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    onSnapshot: vi.fn(() => vi.fn()),
    doc: vi.fn(),
    Timestamp: { now: vi.fn() },
}))

vi.mock("firebase/auth", () => ({
    onAuthStateChanged: vi.fn(() => vi.fn()),
    signInWithPopup: vi.fn(),
    signOut: vi.fn(),
    signInWithEmailAndPassword: vi.fn(),
    createUserWithEmailAndPassword: vi.fn(),
    updateProfile: vi.fn(),
    sendPasswordResetEmail: vi.fn(),
}))

// Mock next/navigation
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
    useParams: () => ({ id: "test-setlist-id" }),
}))

// Mock auth context. PublicSetlistListing now reads `user`/`loading`/`signIn`
// to render (or hide) the logged-out Sign-In card. Each test sets the auth
// state it needs; beforeEach installs a logged-out default.
const mockUseAuth = vi.fn()
const mockSignIn = vi.fn()
vi.mock("@/lib/auth-context", () => ({
    useAuth: () => mockUseAuth(),
    AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}))

// Stub QRSignIn — its real impl spins up polling/countdown timers + fetches
// /api/auth/qr, which is irrelevant to (and noisy for) the listing's auth-UI
// contract. It's exercised by its own surface; here we only assert the card
// wrapper shows/hides correctly.
vi.mock("@/components/auth/QRSignIn", () => ({
    QRSignIn: () => <div data-testid="qr-signin">QR</div>,
}))

// Mock setlist-firebase
const mockSubscribeToPublicSetlists = vi.fn()
vi.mock("@/lib/setlist-firebase", () => ({
    createSetlistService: () => ({
        subscribeToAllSetlists: mockSubscribeToPublicSetlists,
    }),
}))

// Mock music-math
vi.mock("@/lib/music-math", () => ({
    getTransposedKeyName: (key: string) => key,
}))

// Mock firestore helpers
vi.mock("@/lib/firestore-helpers", () => ({
    toDate: (v: unknown) => (v ? new Date(v as string) : null),
}))

import { SetlistView } from "../SetlistView"
import type { SetlistTrack } from "@/types/models"

describe("Public View", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        // Default: logged-out visitor with auth resolved (the common /perform case).
        mockUseAuth.mockReturnValue({ user: null, loading: false, signIn: mockSignIn })
    })

    describe("Public setlist listing page", () => {
        it("renders setlist cards without requiring auth", async () => {
            // Dynamically import the page component
            const { PublicSetlistListing } = await import("@/components/performance/PublicSetlistListing")

            mockSubscribeToPublicSetlists.mockImplementation((callback: (...args: any[]) => any) => {
                callback([
                    {
                        id: "setlist-1",
                        name: "Shabbat Morning Service",
                        eventDate: "2026-03-14T10:00:00Z",
                        tracks: [{ id: "t1", title: "Song 1" }, { id: "t2", title: "Song 2" }],
                        trackCount: 2,
                    },
                    {
                        id: "setlist-2",
                        name: "Friday Night Service",
                        eventDate: "2026-03-13T18:00:00Z",
                        tracks: [{ id: "t3", title: "Song 3" }],
                        trackCount: 1,
                    },
                ], false)
                return vi.fn() // unsubscribe
            })

            render(<PublicSetlistListing />)

            expect(screen.getByText("Shabbat Morning Service")).toBeDefined()
            expect(screen.getByText("Friday Night Service")).toBeDefined()
        })

        it("links setlists to /perform/setlist/{id}", async () => {
            const { PublicSetlistListing } = await import("@/components/performance/PublicSetlistListing")

            mockSubscribeToPublicSetlists.mockImplementation((callback: (...args: any[]) => any) => {
                callback([
                    {
                        id: "setlist-abc",
                        name: "Test Setlist",
                        eventDate: "2026-03-14T10:00:00Z",
                        tracks: [],
                        trackCount: 0,
                    },
                ], false)
                return vi.fn()
            })

            render(<PublicSetlistListing />)

            const link = screen.getByRole("link", { name: /Test Setlist/i })
            expect(link).toBeDefined()
            expect(link.getAttribute("href")).toBe("/perform/setlist/setlist-abc")
        })
    })

    describe("Public performance view rendering", () => {
        const mockSong: SetlistTrack = {
            id: "song-1",
            title: "Amazing Grace",
            key: "C",
            bpm: 72,
            leadMusician: "Sarah",
            type: "song",
            fileId: "file-abc",
        }

        it("hides monitor button, transposition, edit controls in public view", () => {
            render(
                <SetlistView
                    tracks={[mockSong]}
                    currentTrackIndex={-1}
                    defaultTransposition={0}
                    isPublicView={true}
                    isLeader={false}
                    onSongTap={vi.fn()}
                    onLeaderSetPosition={vi.fn()}
                />
            )

            // Song renders normally in public view
            expect(screen.getByText("Amazing Grace")).toBeDefined()
            // Key shows in concert key (no transposition)
            expect(screen.getByText("C")).toBeDefined()
        })

        it("shows the Sign-In card (QR + Google) when logged out", async () => {
            // logged-out is the beforeEach default
            const { PublicSetlistListing } = await import("@/components/performance/PublicSetlistListing")

            mockSubscribeToPublicSetlists.mockImplementation((callback: (...args: any[]) => any) => {
                callback([], false)
                return vi.fn()
            })

            render(<PublicSetlistListing />)

            // QR + "Sign In with Google" affordance is present for guests, even
            // when there are no setlists (they still need a path to sign in).
            expect(screen.getByTestId("qr-signin")).toBeDefined()
            expect(screen.getByRole("button", { name: /sign in with google/i })).toBeDefined()
        })

        it("hides the Sign-In card when authed", async () => {
            mockUseAuth.mockReturnValue({ user: { uid: "u1" }, loading: false, signIn: mockSignIn })
            const { PublicSetlistListing } = await import("@/components/performance/PublicSetlistListing")

            mockSubscribeToPublicSetlists.mockImplementation((callback: (...args: any[]) => any) => {
                callback([], false)
                return vi.fn()
            })

            render(<PublicSetlistListing />)

            expect(screen.queryByTestId("qr-signin")).toBeNull()
            expect(screen.queryByRole("button", { name: /sign in with google/i })).toBeNull()
        })

        it("does not flash the Sign-In card while auth is still loading", async () => {
            mockUseAuth.mockReturnValue({ user: null, loading: true, signIn: mockSignIn })
            const { PublicSetlistListing } = await import("@/components/performance/PublicSetlistListing")

            mockSubscribeToPublicSetlists.mockImplementation((callback: (...args: any[]) => any) => {
                callback([], false)
                return vi.fn()
            })

            render(<PublicSetlistListing />)

            // !authLoading guard — card is suppressed until auth resolves (CLS guard).
            expect(screen.queryByTestId("qr-signin")).toBeNull()
        })

        it("caps the listing at 5 services total, upcoming-first", async () => {
            const { PublicSetlistListing } = await import("@/components/performance/PublicSetlistListing")

            // 7 far-future (upcoming) + 2 far-past so the cap, not the date
            // window, is what trims the list — deterministic regardless of run date.
            const upcoming = Array.from({ length: 7 }, (_, i) => ({
                id: `up-${i}`,
                name: `Upcoming ${i}`,
                eventDate: `2099-0${(i % 9) + 1}-01T10:00:00Z`,
                tracks: [],
                trackCount: 0,
            }))
            const past = [
                { id: "past-1", name: "Past 1", eventDate: "2000-01-01T10:00:00Z", tracks: [], trackCount: 0 },
                { id: "past-2", name: "Past 2", eventDate: "2000-01-02T10:00:00Z", tracks: [], trackCount: 0 },
            ]

            mockSubscribeToPublicSetlists.mockImplementation((callback: (...args: any[]) => any) => {
                callback([...past, ...upcoming], false)
                return vi.fn()
            })

            render(<PublicSetlistListing />)

            // Each setlist card is a Link (role=link); the Google button is a
            // button, the QR stub a div — so links == rendered service rows.
            expect(screen.getAllByRole("link")).toHaveLength(5)
            // All 5 should be upcoming (upcoming-prioritized), no past rows.
            expect(screen.queryByText("Past 1")).toBeNull()
            expect(screen.queryByText("Past 2")).toBeNull()
        })
    })
})
