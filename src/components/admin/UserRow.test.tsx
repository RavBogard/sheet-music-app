import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from "vitest"
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

/**
 * v11.4-04 (D8 item 5): the admin "Band access" tri-state control is now shown
 * on EVERY non-pending row (not just leaders). Asserts:
 *  - AC-1: the control + badge render for a musician row (admin viewer); hidden for a non-admin.
 *  - AC-2: setting a musician to "Both" posts orgIds ['crc','brotherslazaroff'] via updateUserRole
 *    (which set-role writes to the user doc + Auth claim in lockstep).
 */

vi.mock("@/lib/users-firebase", () => ({ updateUserRole: vi.fn().mockResolvedValue(undefined) }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock("@/lib/notification-store", () => ({ notifyRoleChanged: vi.fn().mockResolvedValue(undefined) }))

import { UserRow } from "./UserRow"
import { updateUserRole } from "@/lib/users-firebase"

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const musician: any = {
    uid: "m1",
    displayName: "Alex",
    email: "alex@example.com",
    role: "musician",
    soundEngineer: false,
}

function renderRow(currentUserRole: string) {
    return render(
        <UserRow
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            user={musician as any}
            currentUserUid="admin-uid"
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            currentUserRole={currentUserRole as any}
        />,
    )
}

beforeEach(() => mockUpdateUserRole.mockClear())
afterEach(() => cleanup())

describe("UserRow Band-access control (v11.4-04)", () => {
    it("AC-1: shows the Band-access control + badge for a musician row when viewed by an admin", () => {
        renderRow("admin")
        // Desktop + mobile both render the control → at least one present.
        expect(screen.getAllByLabelText(/Band access for Alex/).length).toBeGreaterThan(0)
        // Default (no orgIds) → CRC badge.
        expect(screen.getAllByText("CRC").length).toBeGreaterThan(0)
    })

    it("AC-1 (negative): a non-admin viewer sees no Band-access control", () => {
        renderRow("musician")
        expect(screen.queryByLabelText(/Band access for Alex/)).toBeNull()
    })

    it("AC-2: setting Band access to 'Both' posts orgIds ['crc','brotherslazaroff']", async () => {
        const user = userEvent.setup({ pointerEventsCheck: 0 })
        renderRow("admin")

        // Open the first Band-access select and choose "Both".
        const trigger = screen.getAllByLabelText(/Band access for Alex/)[0]
        await user.click(trigger)
        const both = await screen.findByRole("option", { name: "Both" })
        await user.click(both)

        // Confirm in the dialog.
        const confirm = await screen.findByRole("button", { name: "Update access" })
        await user.click(confirm)

        await waitFor(() => expect(mockUpdateUserRole).toHaveBeenCalledTimes(1))
        expect(mockUpdateUserRole).toHaveBeenCalledWith("m1", "musician", [
            "crc",
            "brotherslazaroff",
        ])
    })
})
