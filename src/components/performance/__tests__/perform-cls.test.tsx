import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"

/**
 * v11.3-04-02 (BUG-2) — CLS regression for the /perform public listing.
 *
 * Covers the web-vitals `/perform` CLS cell (field p75 baseline 0.200 /
 * synthetic iPad 0.187 → target < 0.1). Root cause: the anon QR sign-in card
 * mounted only on `!user && !authLoading`, i.e. AFTER client auth resolved,
 * inserting ~380px ABOVE the Upcoming/Past list sections post-paint and
 * shifting them down. Fix: reserve the card's slot DURING authLoading whenever
 * we expect an anon visitor (`!cachedUser`), so the lists render at their final
 * position and the real card swaps into the reserved space with zero shift —
 * WITHOUT regressing authed returners (`cachedUser` present → no reserve, so
 * their no-card layout is unchanged and never collapse-shifts).
 *
 * jsdom can't measure pixel layout, so these tests pin the structural
 * invariant that produces CLS-zero: (a) reserved slot present for expected-anon
 * during load, (b) NO reserve for expected-authed during load (no new shift),
 * (c) the reserved slot is replaced by — not appended above — the real card on
 * anon resolve. The synthetic 820×1180 layout-shift<0.1 check is the manual
 * field-equivalent (characterization doc § 2 recipe).
 */

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
}))

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
    useParams: () => ({}),
}))

const mockUseAuth = vi.fn()
const mockSignIn = vi.fn()
vi.mock("@/lib/auth-context", () => ({
    useAuth: () => mockUseAuth(),
    AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}))

// Stub QRSignIn — the reserved-slot skeleton is deliberately NOT the real
// QRSignIn (no polling/fetch fires during authLoading). The stub lets us
// distinguish "real card mounted" (qr-signin testid) from "reserved slot"
// (signin-reserve testid).
vi.mock("@/components/auth/QRSignIn", () => ({
    QRSignIn: () => <div data-testid="qr-signin">QR</div>,
}))

const mockSubscribe = vi.fn()
vi.mock("@/lib/setlist-firebase", () => ({
    createSetlistService: () => ({ subscribeToAllSetlists: mockSubscribe }),
}))

vi.mock("@/lib/firestore-helpers", () => ({
    toDate: (v: unknown) => (v ? new Date(v as string) : null),
}))

describe("/perform CLS — sign-in card slot reservation (BUG-2, web-vitals /perform CLS cell)", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        // Two upcoming services so the list sections are present and would be
        // the thing pushed down by a late card mount.
        mockSubscribe.mockImplementation((cb: (...args: any[]) => any) => {
            cb(
                [
                    { id: "up-1", name: "Shabbat Morning", eventDate: "2099-01-02T10:00:00Z", trackCount: 5, songCount: 5 },
                    { id: "up-2", name: "Erev Shabbat", eventDate: "2099-01-03T18:00:00Z", trackCount: 7, songCount: 7 },
                ],
                false,
            )
            return vi.fn()
        })
    })

    it("reserves the sign-in card slot during authLoading for an expected-anon visitor (no prior cachedUser)", async () => {
        mockUseAuth.mockReturnValue({ user: null, loading: true, signIn: mockSignIn, cachedUser: null })
        const { PublicSetlistListing } = await import("@/components/performance/PublicSetlistListing")
        render(<PublicSetlistListing />)

        // Slot reserved (height held) so the lists below don't move when the
        // real card mounts; the real card is NOT shown yet (no flash).
        expect(screen.getByTestId("signin-reserve")).toBeDefined()
        expect(screen.queryByTestId("qr-signin")).toBeNull()
        // The lists are already present at their final position.
        expect(screen.getByText("Shabbat Morning")).toBeDefined()
    })

    it("does NOT reserve the slot during authLoading for an expected-authed returner (cachedUser present) — no new collapse-shift", async () => {
        mockUseAuth.mockReturnValue({
            user: null,
            loading: true,
            signIn: mockSignIn,
            cachedUser: { uid: "u1", displayName: "Aviva" },
        })
        const { PublicSetlistListing } = await import("@/components/performance/PublicSetlistListing")
        render(<PublicSetlistListing />)

        // Authed-returner layout is unchanged from before the fix: no card, no
        // reserve → nothing above the lists to later collapse and shift them.
        expect(screen.queryByTestId("signin-reserve")).toBeNull()
        expect(screen.queryByTestId("qr-signin")).toBeNull()
        expect(screen.getByText("Shabbat Morning")).toBeDefined()
    })

    it("swaps the reserved slot for the real card on anon resolve (replace, not append-above)", async () => {
        mockUseAuth.mockReturnValue({ user: null, loading: false, signIn: mockSignIn, cachedUser: null })
        const { PublicSetlistListing } = await import("@/components/performance/PublicSetlistListing")
        render(<PublicSetlistListing />)

        // Real card present, reserved placeholder gone — the card occupies the
        // slot the placeholder held, so the lists do not move.
        expect(screen.getByTestId("qr-signin")).toBeDefined()
        expect(screen.queryByTestId("signin-reserve")).toBeNull()
        expect(screen.getByRole("button", { name: /sign in with google/i })).toBeDefined()
    })
})
