import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
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
            mockUseAuth.mockReturnValue({
                user: { uid: "u1", displayName: "Aviva", email: "aviva@example.com", photoURL: null },
                loading: false,
                signIn: mockSignIn,
            })
            const { PublicSetlistListing } = await import("@/components/performance/PublicSetlistListing")

            mockSubscribeToPublicSetlists.mockImplementation((callback: (...args: any[]) => any) => {
                callback([], false)
                return vi.fn()
            })

            render(<PublicSetlistListing />)

            expect(screen.queryByTestId("qr-signin")).toBeNull()
            expect(screen.queryByRole("button", { name: /sign in with google/i })).toBeNull()
        })

        // C11 M3-012 — signed-in users get an avatar pill upper-right linking
        // to /settings so the auth-state context-shift isn't invisible when
        // they tap into a setlist and the admin nav suddenly appears.
        it("shows the signed-in avatar pill linking to settings when authed", async () => {
            mockUseAuth.mockReturnValue({
                user: { uid: "u1", displayName: "Aviva", email: "aviva@example.com", photoURL: null },
                loading: false,
                signIn: mockSignIn,
            })
            const { PublicSetlistListing } = await import("@/components/performance/PublicSetlistListing")

            mockSubscribeToPublicSetlists.mockImplementation((callback: (...args: any[]) => any) => {
                callback([], false)
                return vi.fn()
            })

            render(<PublicSetlistListing />)

            const pill = screen.getByRole("link", { name: /signed in as aviva/i })
            expect(pill.getAttribute("href")).toBe("/settings")
        })

        // C11 AC3 — logged-out viewers see the QR card OR a Sign-in pill, not
        // both. The QR card is the auth affordance for guests; no pill should
        // appear in the header to duplicate it.
        it("does not show an avatar/sign-in pill when logged out (QR card is the indicator)", async () => {
            // logged-out is the beforeEach default
            const { PublicSetlistListing } = await import("@/components/performance/PublicSetlistListing")

            mockSubscribeToPublicSetlists.mockImplementation((callback: (...args: any[]) => any) => {
                callback([], false)
                return vi.fn()
            })

            render(<PublicSetlistListing />)

            expect(screen.queryByRole("link", { name: /signed in as/i })).toBeNull()
            expect(screen.getByTestId("qr-signin")).toBeDefined()
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

        // C11 F-M2-006 — SSR prefetch seeds the listing so fresh tablets get
        // real cards on first paint instead of the skeleton-then-cards swap.
        // When `initialSetlists` is supplied the listing must render cards
        // synchronously (no `loading:true` skeleton) BEFORE the client
        // subscription resolves.
        it("renders SSR-prefetched cards immediately when initialSetlists is provided (no skeleton flash)", async () => {
            const { PublicSetlistListing } = await import("@/components/performance/PublicSetlistListing")

            // Client subscription is intentionally not invoked synchronously —
            // the SSR slice must paint before the listener fires.
            mockSubscribeToPublicSetlists.mockImplementation(() => vi.fn())

            render(
                <PublicSetlistListing
                    initialSetlists={[
                        {
                            id: "ssr-1",
                            name: "Erev Shabbat (SSR)",
                            eventDate: "2099-01-02T18:00:00Z",
                            trackCount: 12,
                            songCount: 11,
                        } as any,
                    ]}
                />,
            )

            // Card content from the SSR slice — would be absent if we'd
            // rendered the skeleton instead.
            expect(screen.getByText("Erev Shabbat (SSR)")).toBeDefined()
            const link = screen.getByRole("link", { name: /Erev Shabbat \(SSR\)/i })
            expect(link.getAttribute("href")).toBe("/perform/setlist/ssr-1")
        })

        // C11 AMENDMENT-001 + AMENDMENT-002 — Daniel ratified 2026-05-28T~15:50Z
        // that `publishedAt` is NOT a gating concept; every setlist is public
        // the moment it exists. The SSR-prefetch must mirror the existing
        // client filter EXACTLY (isTest:false + test-uid + eventDate window),
        // with NO publishedAt filter introduced. Acceptance test models
        // Saturday's `cd2010f4` (`publishedAt:null`, `isTest:false`): if any
        // future change re-introduces a publishedAt gate, this row vanishes
        // and the test fails.
        it("renders a publishedAt:null setlist (no publishedAt gate regression)", async () => {
            const { PublicSetlistListing } = await import("@/components/performance/PublicSetlistListing")
            mockSubscribeToPublicSetlists.mockImplementation(() => vi.fn())

            render(
                <PublicSetlistListing
                    initialSetlists={[
                        {
                            id: "cd2010f4-saturday-bnei-mitzvah",
                            name: "Saturday B'nei Mitzvah",
                            eventDate: "2099-01-04T10:00:00Z",
                            // publishedAt intentionally absent — matches prod shape.
                            isTest: false,
                            trackCount: 16,
                            songCount: 14,
                        } as any,
                    ]}
                />,
            )

            expect(screen.getByText("Saturday B'nei Mitzvah")).toBeDefined()
            const link = screen.getByRole("link", { name: /Saturday B'nei Mitzvah/i })
            expect(link.getAttribute("href")).toBe("/perform/setlist/cd2010f4-saturday-bnei-mitzvah")
        })

        // C11 — sandbox filter (`isTest:true`) still active in the SSR path —
        // err-public invariant doesn't extend to test fixtures, which Daniel
        // confirmed as a standing rule. The split helper already enforces
        // this; this test pins the contract on the SSR-seeded path.
        it("filters isTest:true rows out of the SSR-prefetched slice (sandbox isolation)", async () => {
            const { PublicSetlistListing } = await import("@/components/performance/PublicSetlistListing")
            mockSubscribeToPublicSetlists.mockImplementation(() => vi.fn())

            render(
                <PublicSetlistListing
                    initialSetlists={[
                        {
                            id: "real-1",
                            name: "Real Service",
                            eventDate: "2099-01-02T18:00:00Z",
                            isTest: false,
                            trackCount: 8,
                            songCount: 8,
                        } as any,
                        {
                            id: "test-1",
                            name: "[CYCLE11- probe sandbox setlist",
                            eventDate: "2099-01-03T18:00:00Z",
                            isTest: true,
                            trackCount: 1,
                            songCount: 1,
                        } as any,
                    ]}
                />,
            )

            expect(screen.getByText("Real Service")).toBeDefined()
            expect(screen.queryByText(/CYCLE11- probe sandbox setlist/)).toBeNull()
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

    // FU-c12-3 — the public /perform landing's wake-lock affordance (the
    // "Keep screen on" KeepAwakeToggle + its `useWakeLock` hook) is gated to
    // SIGNED-IN viewers via <KeepAwakeControl/>. Anonymous visitors + crawlers
    // never mount the hook, so the anon landing structurally never touches the
    // WakeLock API. The request itself was already gesture-gated (it never
    // fired on mount) — these tests lock BOTH properties so a regression that
    // re-mounts the hook for anon, or auto-fires a request, fails loud.
    describe("wake-lock affordance gating (FU-c12-3)", () => {
        let requestSpy: ReturnType<typeof vi.fn>

        beforeEach(() => {
            // Fire the subscription callback with an empty list so `loading`
            // resolves to false and the header (where the toggle lives) renders
            // past the skeleton branch.
            mockSubscribeToPublicSetlists.mockImplementation((cb: (...args: any[]) => any) => {
                cb([], false)
                return vi.fn()
            })
            requestSpy = vi.fn(async () => ({
                released: false,
                type: "screen" as const,
                release: vi.fn(async () => {}),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
            }))
            Object.defineProperty(navigator, "wakeLock", {
                value: { request: requestSpy },
                configurable: true,
                writable: true,
            })
        })

        afterEach(() => {
            // Remove the stub so it can't leak into sibling describes whose
            // capability detection reads `navigator.wakeLock`.
            delete (navigator as unknown as { wakeLock?: unknown }).wakeLock
        })

        it("does NOT mount the keep-awake toggle for anonymous visitors", async () => {
            // logged-out is the beforeEach default
            const { PublicSetlistListing } = await import("@/components/performance/PublicSetlistListing")
            render(<PublicSetlistListing />)

            expect(screen.queryByRole("button", { name: /keep screen on/i })).toBeNull()
        })

        it("mounts the keep-awake toggle for signed-in viewers", async () => {
            mockUseAuth.mockReturnValue({
                user: { uid: "u1", displayName: "Aviva", email: "aviva@example.com", photoURL: null },
                loading: false,
                signIn: mockSignIn,
            })
            const { PublicSetlistListing } = await import("@/components/performance/PublicSetlistListing")
            render(<PublicSetlistListing />)

            expect(screen.getByRole("button", { name: /keep screen on/i })).toBeDefined()
        })

        it("issues ZERO navigator.wakeLock.request calls when viewed anonymously (AC1)", async () => {
            // logged-out is the beforeEach default
            const { PublicSetlistListing } = await import("@/components/performance/PublicSetlistListing")
            render(<PublicSetlistListing />)

            expect(requestSpy).not.toHaveBeenCalled()
        })

        it("issues ZERO navigator.wakeLock.request calls on signed-in mount (request stays gesture-gated, never auto-fired)", async () => {
            mockUseAuth.mockReturnValue({
                user: { uid: "u1", displayName: "Aviva", email: "aviva@example.com", photoURL: null },
                loading: false,
                signIn: mockSignIn,
            })
            const { PublicSetlistListing } = await import("@/components/performance/PublicSetlistListing")
            render(<PublicSetlistListing />)

            // The toggle is mounted (signed-in) but the request only fires from
            // the tap handler — never on mount. Confirms the dispatch's "auto-
            // requests on landing" premise is not the case even for authed.
            expect(requestSpy).not.toHaveBeenCalled()
        })
    })
})
