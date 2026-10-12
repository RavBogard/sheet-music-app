import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from "vitest"
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import React from "react"

/**
 * Multi-tenant phase 2: a People row speaks for ONE tenant (the host).
 *  - the role select sets the role in that tenant (set-role with `tenant`);
 *  - a request (`pending`) is approved with a role (default Member) or declined (`denied`);
 *  - "Remove from {tenant}" ends the membership here (set-role newRole:null) after a confirmation;
 *  - the old CRC / BL / Both band-access select is gone.
 */

vi.mock("@/lib/users-firebase", () => ({ updateUserRole: vi.fn().mockResolvedValue(undefined) }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { UserRow } from "./UserRow"
import { updateUserRole } from "@/lib/users-firebase"
import { OrgContext } from "@/lib/org/org-context"

const mockUpdateUserRole = updateUserRole as unknown as Mock

// Radix Select + AlertDialog need these jsdom shims to mount/open.
beforeAll(() => {
    const g = globalThis as unknown as Record<string, unknown>
    if (typeof g.ResizeObserver !== "function") {
        g.ResizeObserver = class {
            observe() {}
            unobserve() {}
            disconnect() {}
        }
    }
    const proto = Element.prototype as unknown as Record<string, unknown>
    for (const fn of ["scrollIntoView", "hasPointerCapture", "setPointerCapture", "releasePointerCapture"]) {
        if (typeof proto[fn] !== "function") proto[fn] = function () {}
    }
})

const person = (over: Record<string, unknown> = {}) => ({
    uid: "m1",
    displayName: "Alex",
    email: "alex@example.com",
    photoURL: null,
    role: "musician",
    soundEngineer: false,
    canUpload: false,
    musicianProfile: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastLoginAt: null,
    addedAt: null,
    requestedAt: null,
    ...over,
})

function renderRow(viewerRole: string, user = person(), org = "crc", onChanged = vi.fn()) {
    render(
        React.createElement(
            OrgContext.Provider,
            { value: org },
            <UserRow
                user={user as never}
                currentUserUid="admin-uid"
                currentUserRole={viewerRole}
                onChanged={onChanged}
            />,
        ),
    )
    return { onChanged }
}

beforeEach(() => mockUpdateUserRole.mockClear())
afterEach(() => cleanup())

describe("UserRow per-tenant role (multi-tenant P2)", () => {
    it("has no CRC / BL / Both band-access control any more", () => {
        renderRow("admin")
        expect(screen.queryByLabelText(/Band access/)).toBeNull()
        expect(screen.queryByText("CRC + BL")).toBeNull()
    })

    it("the role select sets the role in the host tenant", async () => {
        const user = userEvent.setup({ pointerEventsCheck: 0 })
        const { onChanged } = renderRow("admin", person(), "brotherslazaroff")

        await user.click(screen.getAllByLabelText("Role for Alex")[0])
        await user.click(await screen.findByRole("option", { name: "Band Leader" }))
        await user.click(await screen.findByRole("button", { name: "Change Role" }))

        await waitFor(() => expect(mockUpdateUserRole).toHaveBeenCalledTimes(1))
        expect(mockUpdateUserRole).toHaveBeenCalledWith("m1", "band_leader", { tenant: "brotherslazaroff" })
        expect(onChanged).toHaveBeenCalled()
    })

    it("role options are capped at the viewer's role in this tenant", async () => {
        const user = userEvent.setup({ pointerEventsCheck: 0 })
        renderRow("band_leader", person({ role: "member" }))
        await user.click(screen.getAllByLabelText("Role for Alex")[0])
        expect(await screen.findByRole("option", { name: "Band Leader" })).toBeTruthy()
        expect(screen.queryByRole("option", { name: "Admin" })).toBeNull()
    })
})

describe("UserRow requests (multi-tenant P2)", () => {
    const pending = () => person({ uid: "p1", displayName: "Pat", role: "pending" })

    it("approve defaults to Member", async () => {
        const user = userEvent.setup({ pointerEventsCheck: 0 })
        renderRow("admin", pending())
        await user.click(screen.getAllByRole("button", { name: "Approve Pat as Member" })[0])
        await waitFor(() => expect(mockUpdateUserRole).toHaveBeenCalledWith("p1", "member", { tenant: "crc" }))
    })

    it("approve as another role", async () => {
        const user = userEvent.setup({ pointerEventsCheck: 0 })
        renderRow("admin", pending())
        await user.click(screen.getAllByLabelText("Approve Pat as")[0])
        await user.click(await screen.findByRole("option", { name: "Musician" }))
        await user.click(screen.getAllByRole("button", { name: "Approve Pat as Musician" })[0])
        await waitFor(() => expect(mockUpdateUserRole).toHaveBeenCalledWith("p1", "musician", { tenant: "crc" }))
    })

    it("decline sets denied", async () => {
        const user = userEvent.setup({ pointerEventsCheck: 0 })
        renderRow("admin", pending())
        await user.click(screen.getAllByRole("button", { name: "Decline Pat" })[0])
        await waitFor(() => expect(mockUpdateUserRole).toHaveBeenCalledWith("p1", "denied", { tenant: "crc" }))
    })

    it("band leaders see no approve/decline controls (the role route is admin-only)", () => {
        renderRow("band_leader", pending())
        expect(screen.queryByRole("button", { name: /Approve Pat/ })).toBeNull()
        expect(screen.queryByRole("button", { name: "Decline Pat" })).toBeNull()
    })

    it("a declined person shows as Denied", () => {
        renderRow("admin", person({ role: "denied" }))
        expect(screen.getAllByText("Denied").length).toBeGreaterThan(0)
    })
})

describe("UserRow remove from tenant (multi-tenant P2)", () => {
    it("asks first, then sets newRole null for this tenant", async () => {
        const user = userEvent.setup({ pointerEventsCheck: 0 })
        renderRow("admin", person(), "brotherslazaroff")

        await user.click(screen.getAllByRole("button", { name: "Remove Alex from Brothers Lazaroff" })[0])
        expect(mockUpdateUserRole).not.toHaveBeenCalled()
        expect(await screen.findByText("Remove from Brothers Lazaroff?")).toBeTruthy()
        await user.click(await screen.findByRole("button", { name: "Remove from Brothers Lazaroff" }))

        await waitFor(() => expect(mockUpdateUserRole).toHaveBeenCalledWith("m1", null, { tenant: "brotherslazaroff" }))
    })

    it("is not offered to band leaders or on your own row", () => {
        renderRow("band_leader")
        expect(screen.queryByRole("button", { name: /Remove Alex from/ })).toBeNull()
        cleanup()
        render(
            <UserRow user={person({ uid: "admin-uid" }) as never} currentUserUid="admin-uid" currentUserRole="admin" />,
        )
        expect(screen.queryByRole("button", { name: /Remove Alex from/ })).toBeNull()
    })
})
