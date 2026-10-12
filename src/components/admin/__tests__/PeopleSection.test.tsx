import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from "vitest"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

/**
 * Multi-tenant phase 2: /manage People reads the host tenant's people through
 * GET /api/tenant/people (mocked here at fetchTenantPeople), shows requests,
 * and approves / declines / removes per tenant, reading the list again after
 * each change.
 */

const h = vi.hoisted(() => ({
    auth: { user: { uid: "admin-uid" }, role: "admin", isAdmin: true, isBandLeader: true } as Record<string, unknown>,
}))

vi.mock("@/lib/auth-context", () => ({ useAuth: () => h.auth }))
vi.mock("@/lib/users-firebase", () => ({
    fetchTenantPeople: vi.fn(),
    updateUserRole: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { PeopleSection } from "../PeopleSection"
import { fetchTenantPeople, updateUserRole } from "@/lib/users-firebase"

const mockFetch = fetchTenantPeople as unknown as Mock
const mockUpdate = updateUserRole as unknown as Mock

beforeAll(() => {
    const g = globalThis as unknown as Record<string, unknown>
    if (typeof g.ResizeObserver !== "function") {
        g.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
    }
    const proto = Element.prototype as unknown as Record<string, unknown>
    for (const fn of ["scrollIntoView", "hasPointerCapture", "setPointerCapture", "releasePointerCapture"]) {
        if (typeof proto[fn] !== "function") proto[fn] = function () {}
    }
})

const p = (uid: string, displayName: string, role: string) => ({
    uid, displayName, email: `${uid}@example.com`, photoURL: null, role,
    soundEngineer: false, canUpload: false, musicianProfile: null,
    createdAt: null, lastLoginAt: null, addedAt: null, requestedAt: null,
})

const PEOPLE = [
    p("admin-uid", "Me", "admin"),
    p("u1", "Alex", "musician"),
    p("u2", "Pat", "pending"),
    p("u3", "Sam", "pending"),
]

beforeEach(() => {
    mockFetch.mockReset()
    mockFetch.mockResolvedValue({ tenant: "crc", people: PEOPLE, pendingCount: 2 })
    mockUpdate.mockClear()
    h.auth = { user: { uid: "admin-uid" }, role: "admin", isAdmin: true, isBandLeader: true }
})
afterEach(() => cleanup())

describe("PeopleSection (multi-tenant P2)", () => {
    it("lists the tenant's people from the people route and counts requests", async () => {
        render(<PeopleSection />)
        expect(await screen.findByText("Alex")).toBeTruthy()
        expect(mockFetch).toHaveBeenCalledTimes(1)
        expect(screen.getByText("2 pending requests")).toBeTruthy()
    })

    it("the Requests filter shows only people waiting for approval", async () => {
        const user = userEvent.setup({ pointerEventsCheck: 0 })
        render(<PeopleSection />)
        await screen.findByText("Alex")
        await user.click(screen.getByRole("button", { name: "Requests" }))
        expect(screen.queryByText("Alex")).toBeNull()
        expect(screen.getByText("Pat")).toBeTruthy()
        expect(screen.getByText("Sam")).toBeTruthy()
    })

    it("approve and decline call set-role for this tenant and read the list again", async () => {
        const user = userEvent.setup({ pointerEventsCheck: 0 })
        render(<PeopleSection />)
        await screen.findByText("Pat")

        await user.click(screen.getAllByRole("button", { name: "Approve Pat as Member" })[0])
        await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith("u2", "member", { tenant: "crc" }))
        await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2))

        await user.click(screen.getAllByRole("button", { name: "Decline Sam" })[0])
        await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith("u3", "denied", { tenant: "crc" }))
        await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(3))
    })

    it("remove from the tenant confirms, then sets newRole null", async () => {
        const user = userEvent.setup({ pointerEventsCheck: 0 })
        render(<PeopleSection />)
        await screen.findByText("Alex")
        await user.click(screen.getAllByRole("button", { name: "Remove Alex from CRC Music" })[0])
        const dialog = await screen.findByRole("alertdialog")
        await user.click(within(dialog).getByRole("button", { name: "Remove from CRC Music" }))
        await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith("u1", null, { tenant: "crc" }))
    })

    it("bulk actions pass the tenant", async () => {
        const user = userEvent.setup({ pointerEventsCheck: 0 })
        render(<PeopleSection />)
        await screen.findByText("Alex")
        const boxes = screen.getAllByRole("checkbox")
        await user.click(boxes[2]) // Alex (0 = select all, 1 = Me)
        await user.click(screen.getByRole("button", { name: /Make Musician/ }))
        await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith("u1", "musician", { tenant: "crc" }))
    })

    it("a failed read (below band leader) shows an empty list, not an error", async () => {
        mockFetch.mockRejectedValueOnce(new Error("Forbidden"))
        render(<PeopleSection />)
        expect(await screen.findByText("No registered users yet.")).toBeTruthy()
    })

    it("renders nothing for people below band leader", () => {
        h.auth = { user: { uid: "x" }, role: "musician", isAdmin: false, isBandLeader: false }
        const { container } = render(<PeopleSection />)
        expect(container.innerHTML).toBe("")
        expect(mockFetch).not.toHaveBeenCalled()
    })
})
