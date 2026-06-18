import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, act } from "@testing-library/react"

// WS-31 regression: the QR phone page must distinguish a not-yet-registered
// session (HTTP 404 → bounded retry while still "Checking session…") from a
// genuinely expired/used one (HTTP 410 → immediate "expired"), and fall to
// "expired" only after a 404 persists past the recovery window.

const mockPush = vi.hoisted(() => vi.fn())
vi.mock("next/navigation", () => ({
    useParams: () => ({ code: "ABC123" }),
    useRouter: () => ({ push: mockPush }),
}))

// Phone user is signed OUT in these tests, so the "ready" state renders the
// "Sign In with Google" screen (auto-approve does not fire without a user).
vi.mock("@/lib/auth-context", () => ({
    useAuth: () => ({ user: null, signIn: vi.fn(), loading: false }),
}))

vi.mock("@/lib/firebase", () => ({ auth: { currentUser: null } }))
vi.mock("@/lib/org/org-context", () => ({ useOrg: () => "crc" }))
vi.mock("@/lib/org/branding", () => ({
    getOrgBranding: () => ({ shortName: "CRC" }),
}))
vi.mock("@/lib/logger", () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

import QRApprovePage from "../page"

/** Returns a fetch mock that yields the given statuses in order, repeating the
 *  last one for any further calls. */
function fetchReturning(statuses: number[]) {
    let i = 0
    return vi.fn(() => {
        const status = statuses[Math.min(i, statuses.length - 1)]
        i += 1
        return Promise.resolve({
            status,
            ok: status >= 200 && status < 300,
            json: () => Promise.resolve({}),
        }) as unknown as Promise<Response>
    })
}

describe("QR approve page — session validity (WS-31)", () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })
    afterEach(() => {
        vi.runOnlyPendingTimers()
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    it("recovers to ready when an early scan (404) is followed by registration (200)", async () => {
        const fetchMock = fetchReturning([404, 200])
        vi.stubGlobal("fetch", fetchMock)

        render(<QRApprovePage />)
        // First check → 404 (not registered yet): page stays on "Checking session…".
        await act(async () => {
            await vi.advanceTimersByTimeAsync(0)
        })
        expect(screen.getByText(/Checking session/i)).toBeTruthy()

        // After the ~1s retry, registration has landed (200) → "ready".
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1200)
        })
        expect(screen.getByText(/Sign In with Google/i)).toBeTruthy()
        expect(screen.queryByText(/code expired/i)).toBeNull()
        // At least two checks happened (the retry fired).
        expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2)
    })

    it("shows expired immediately on 410 (genuinely expired/used) with no retry", async () => {
        const fetchMock = fetchReturning([410])
        vi.stubGlobal("fetch", fetchMock)

        render(<QRApprovePage />)
        await act(async () => {
            await vi.advanceTimersByTimeAsync(0)
        })
        expect(screen.getByRole("heading", { name: /sign-in code expired/i })).toBeTruthy()

        // No retry scheduled for a 410.
        await act(async () => {
            await vi.advanceTimersByTimeAsync(6000)
        })
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it("falls to expired when 404 persists past the recovery window", async () => {
        const fetchMock = fetchReturning([404])
        vi.stubGlobal("fetch", fetchMock)

        render(<QRApprovePage />)
        // Drive the full retry window.
        await act(async () => {
            await vi.advanceTimersByTimeAsync(7000)
        })
        expect(screen.getByRole("heading", { name: /sign-in code expired/i })).toBeTruthy()
        // Retried a bounded number of times (>1, not infinite).
        expect(fetchMock.mock.calls.length).toBeGreaterThan(1)
        expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(6)
    })
})
