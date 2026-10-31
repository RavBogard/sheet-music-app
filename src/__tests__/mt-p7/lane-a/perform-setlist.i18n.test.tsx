import { describe, it, expect, vi, beforeEach } from "vitest"
import { fireEvent } from "@testing-library/react"

import { renderPseudo, expectNoUntranslatedText } from "@/test-utils/i18n"
import type { SetlistTrack } from "@/types/models"
import type { QueueItem } from "@/lib/store"

/**
 * Multi-tenant phase 7, lane A2 — the Perform setlist view under the
 * pseudo-locales. Every UI string must come through t() (qps), the screen
 * must sit in an rtl wrapper under qps-rtl, and the rows must keep the order
 * they were given (Perform never re-sorts a setlist).
 *
 * Fixture data is fake (no liturgical text): song titles, a key, a page.
 */

// Same mocks as perform-cls.test.tsx (PublicSetlistListing's deps).
vi.mock("@/lib/firebase", () => ({ db: {}, auth: {}, googleProvider: {} }))
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
}))
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
    useParams: () => ({}),
}))
const mockUseAuth = vi.fn()
vi.mock("@/lib/auth-context", () => ({
    useAuth: () => mockUseAuth(),
    AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock("@/components/auth/QRSignIn", () => ({
    QRSignIn: () => <div data-testid="qr-signin">QR</div>,
}))
vi.mock("@/lib/setlist-firebase", () => ({
    createSetlistService: () => ({ subscribeToAllSetlists: vi.fn(() => vi.fn()) }),
}))
vi.mock("@/lib/firestore-helpers", () => ({
    toDate: (v: unknown) => (v ? new Date(v as string) : null),
}))

import { SetlistView } from "@/components/performance/SetlistView"
import { SetlistRow } from "@/components/performance/SetlistRow"
import { QueueRow } from "@/components/performance/SetlistDrawer"
import { PublicSetlistListing } from "@/components/performance/PublicSetlistListing"
import { PublicSetlistSkeleton } from "@/components/performance/PublicSetlistSkeleton"

// Deliberately NOT in alphabetical order, so a re-sort would show.
const TRACKS: SetlistTrack[] = [
    { id: "t-c", title: "Test Song C", type: "song", key: "G", bpm: 96, fileId: "file-c", liturgyRef: { book: "test-book", folio: 12 } } as SetlistTrack,
    { id: "t-a", title: "Test Song A", type: "prayer", fileId: "file-a" } as SetlistTrack,
    { id: "t-b", title: "Test Song B", type: "song", key: "D" } as SetlistTrack,
]
const TITLES = TRACKS.map((t) => t.title)

const FOLDED: SetlistTrack[] = [
    { id: "f-1", title: "Test Item One", type: "prayer", fixed: true, liturgyRef: { book: "test-book", folio: 3 } } as SetlistTrack,
    { id: "f-2", title: "Test Item Two", type: "prayer", fixed: true, liturgyRef: { book: "test-book", folio: 5 } } as SetlistTrack,
    { id: "f-3", title: "Test Song D", type: "song", key: "A", fileId: "file-d" } as SetlistTrack,
]

const viewProps = {
    currentTrackIndex: 0,
    defaultTransposition: 0,
    isPublicView: true,
    isLeader: false,
    onSongTap: vi.fn(),
    onLeaderSetPosition: vi.fn(),
}

function rowTitles(root: Element): string[] {
    // Each row's first title span, in DOM order.
    return Array.from(root.querySelectorAll("span"))
        .map((s) => s.textContent ?? "")
        .filter((txt) => /^Test Song [A-Z]$/.test(txt))
}

describe("Perform setlist view — pseudo-locale (qps)", () => {
    beforeEach(() => {
        mockUseAuth.mockReturnValue({ user: null, loading: false, signIn: vi.fn(), cachedUser: null })
    })

    it("SetlistView: every UI string comes through t()", () => {
        const r = renderPseudo(<SetlistView {...viewProps} tracks={TRACKS} serviceNotes={null} />)
        expectNoUntranslatedText(r.container, { allow: [...TITLES, "G", "D"] })
    })

    it("SetlistView empty state", () => {
        const r = renderPseudo(<SetlistView {...viewProps} tracks={[]} />)
        expectNoUntranslatedText(r.container)
        expect(r.container.textContent).toContain("⟦")
    })

    it("folded liturgy run (closed and opened) is translated", () => {
        const r = renderPseudo(<SetlistView {...viewProps} tracks={FOLDED} collapseLiturgy />)
        expectNoUntranslatedText(r.container, { allow: ["Test Song D", "A"] })
        fireEvent.click(r.container.querySelector("button[aria-expanded]")!)
        expectNoUntranslatedText(r.container, { allow: ["Test Song D", "Test Item One", "Test Item Two", "A"] })
    })

    it("SetlistRow: swap button, tonight note, BPM and page are translated", () => {
        const track = {
            ...TRACKS[0],
            tonight: { plannedTitle: "Test Song Z" },
        } as unknown as Parameters<typeof SetlistRow>[0]["track"]
        const r = renderPseudo(
            <SetlistRow
                track={track}
                index={0}
                isCurrentPosition
                defaultTransposition={0}
                isPublicView
                onSongTap={vi.fn()}
                isLeader
                onLeaderSetPosition={vi.fn()}
                onSwapTap={vi.fn()}
            />,
        )
        expectNoUntranslatedText(r.container, { allow: ["Test Song C", "G"] })
    })

    it("drawer QueueRow: type tag and open-chart label are translated", () => {
        const item = { name: "Test Song A", fileId: "file-a", type: "pdf", trackType: "prayer" } as QueueItem
        const r = renderPseudo(<QueueRow track={item} globalIndex={1} isCurrent={false} onOpen={vi.fn()} />)
        expectNoUntranslatedText(r.container, { allow: ["Test Song A"] })
    })

    it("PublicSetlistListing (signed out) and its skeleton", () => {
        const seed = [
            { id: "s-1", name: "Test Setlist One", eventDate: "2099-01-02T10:00:00Z", songCount: 1 },
            { id: "s-2", name: "Test Setlist Two", eventDate: "2099-01-09T10:00:00Z", songCount: 3 },
        ] as never
        const r = renderPseudo(<PublicSetlistListing initialSetlists={seed} />)
        expectNoUntranslatedText(r.container, {
            // Tenant brand name (branding data), fixture setlist names and the QR stub. Tenant vocabulary
            // (label(), orgString()) is pseudo-wrapped too (lane D).
            allow: ["Test Setlist One", "Test Setlist Two", "CRC Music"],
            ignoreSelector: "[data-testid=qr-signin]",
        })
        r.unmount()
        const s = renderPseudo(<PublicSetlistSkeleton cards={1} />)
        expectNoUntranslatedText(s.container)
    })
})

describe("Perform setlist view — right-to-left (qps-rtl)", () => {
    it("root wrapper is dir=rtl and rows keep their given order", () => {
        const r = renderPseudo(<SetlistView {...viewProps} tracks={TRACKS} />, { rtl: true })
        expect(r.container.firstElementChild?.getAttribute("dir")).toBe("rtl")
        expect(rowTitles(r.container)).toEqual(TITLES)
    })

    it("the open-chart chevron mirrors on rtl; physical classes are gone", () => {
        const r = renderPseudo(<SetlistView {...viewProps} tracks={TRACKS} currentTrackIndex={0} />, { rtl: true })
        const html = r.container.innerHTML
        expect(html).toMatch(/-scale-x-100/)
        expect(html).not.toMatch(/\b(text-right|text-left|border-l-4)\b/)
    })
})

describe("Perform setlist view — English output unchanged", () => {
    it("counts, page numbers and the liturgy fold read as before", async () => {
        const { renderWithI18n } = await import("@/test-utils/i18n")
        mockUseAuth.mockReturnValue({ user: null, loading: false, signIn: vi.fn(), cachedUser: null })
        const seed = [
            { id: "s-0", name: "Test Setlist Zero", eventDate: "2099-01-01T10:00:00Z", songCount: 0 },
            { id: "s-1", name: "Test Setlist One", eventDate: "2099-01-02T10:00:00Z", songCount: 1 },
            { id: "s-2", name: "Test Setlist Two", eventDate: "2099-01-09T10:00:00Z", songCount: 2 },
        ] as never
        const l = renderWithI18n(<PublicSetlistListing initialSetlists={seed} />)
        const counts = Array.from(l.container.querySelectorAll("[data-testid=upcoming-list] [data-testid=perform-card-song-count]")).map((s) => s.textContent)
        expect(counts).toEqual(["0 songs", "1 song", "2 songs"])
        l.unmount()

        const v = renderWithI18n(<SetlistView {...viewProps} tracks={FOLDED} collapseLiturgy />)
        const bar = v.container.querySelector("button[aria-expanded]")!
        expect(bar.textContent).toBe("2 liturgy rowspp. 3–5")
        fireEvent.click(bar)
        expect(bar.textContent).toBe("Hide 2 liturgy rowspp. 3–5")
        expect(v.container.textContent).toContain("p. 3")
    })
})
