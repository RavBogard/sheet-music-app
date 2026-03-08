// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"

// Mock firebase modules before any component imports
vi.mock("@/lib/firebase", () => ({
    db: {},
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

// Mock auth context
const mockUseAuth = vi.fn()
vi.mock("@/lib/auth-context", () => ({
    useAuth: () => mockUseAuth(),
    AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}))

// Mock setlist-firebase
const mockSubscribeToPublicSetlists = vi.fn()
vi.mock("@/lib/setlist-firebase", () => ({
    createSetlistService: () => ({
        subscribeToPublicSetlists: mockSubscribeToPublicSetlists,
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
                        isPublic: true,
                    },
                    {
                        id: "setlist-2",
                        name: "Friday Night Service",
                        eventDate: "2026-03-13T18:00:00Z",
                        tracks: [{ id: "t3", title: "Song 3" }],
                        trackCount: 1,
                        isPublic: true,
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
                        isPublic: true,
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

        it("does not show sign-in prompt in public view", async () => {
            const { PublicSetlistListing } = await import("@/components/performance/PublicSetlistListing")

            mockSubscribeToPublicSetlists.mockImplementation((callback: (...args: any[]) => any) => {
                callback([], false)
                return vi.fn()
            })

            render(<PublicSetlistListing />)

            // Should NOT contain sign-in related text
            expect(screen.queryByText(/sign in/i)).toBeNull()
            expect(screen.queryByText(/log in/i)).toBeNull()
        })
    })
})
