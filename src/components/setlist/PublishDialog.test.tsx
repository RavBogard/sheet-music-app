import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from "vitest"
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { PublishDialog } from "./PublishDialog"
import type { SetlistMusician } from "@/types/models"

/**
 * v11.4-01 (D8 item 2): the PublishDialog recipient picker governs ALL
 * channels (in-app + push + email), not just email. These assert:
 *  - default: all assigned musicians selected → posted to every channel (AC-5)
 *  - deselecting a musician removes them from BOTH `musicians[]` (in-app/push)
 *    AND `emailRecipients[]` (email) — they receive nothing (AC-4)
 *  - an empty selection disables the Publish button (AC-4)
 * No real send channel is hit — `apiFetch` is mocked (publish/notify is a
 * STOP-gate: no real fan-out in tests).
 */

// Mock the authenticated fetch wrapper so the real module (and its
// `@/lib/firebase` client import) never loads, and we can assert the body.
vi.mock("@/lib/api-client", () => ({ apiFetch: vi.fn() }))
vi.mock("sonner", () => ({
    toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}))
vi.mock("@/lib/logger", () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

import { apiFetch } from "@/lib/api-client"

const mockApiFetch = apiFetch as unknown as Mock

// Radix Dialog uses a few DOM APIs jsdom doesn't implement. Shim them so the
// dialog mounts + traps focus without throwing.
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
        if (typeof proto[fn] !== "function") {
            proto[fn] = function () {}
        }
    }
})

const MUSICIANS: SetlistMusician[] = [
    { name: "Alex", email: "alex@example.com", uid: "u-alex", instrument: "Guitar" },
    { name: "Bob", email: "bob@example.com", uid: "u-bob", instrument: "Bass" },
    { name: "Cara", email: "cara@example.com", uid: "u-cara" },
]

function renderDialog(overrides: Partial<React.ComponentProps<typeof PublishDialog>> = {}) {
    return render(
        <PublishDialog
            isOpen
            onClose={vi.fn()}
            setlistId="set-1"
            setlistName="Shabbat Morning"
            songCount={5}
            musicians={MUSICIANS}
            {...overrides}
        />,
    )
}

function okResponse() {
    return {
        ok: true,
        json: async () => ({
            success: true,
            wasAlreadyPublic: false,
            notified: 3,
            musicianCount: 3,
            emailed: 3,
            emailTargets: 3,
            usageRecorded: 5,
        }),
    } as unknown as Response
}

function postedBody() {
    const call = mockApiFetch.mock.calls.find((c) => c[0] === "/api/setlist/publish")
    if (!call) throw new Error("apiFetch was not called for /api/setlist/publish")
    return JSON.parse((call[1] as { body: string }).body) as {
        musicians: SetlistMusician[]
        emailRecipients: { name: string; email: string; uid?: string }[]
    }
}

beforeEach(() => {
    mockApiFetch.mockReset()
    mockApiFetch.mockResolvedValue(okResponse())
})

afterEach(() => cleanup())

describe("PublishDialog recipient picker (v11.4-01 D8 item 2)", () => {
    it("AC-5: default = all musicians selected → posts every musician on all channels", async () => {
        const user = userEvent.setup()
        renderDialog()

        expect(screen.getByText("3 musicians assigned")).toBeInTheDocument()
        await user.click(screen.getByRole("button", { name: "Publish & Notify" }))

        await waitFor(() => expect(mockApiFetch).toHaveBeenCalled())
        const body = postedBody()
        expect(body.musicians).toHaveLength(3)
        expect(body.emailRecipients).toHaveLength(3)
        expect(body.musicians.map((m) => m.name).sort()).toEqual(["Alex", "Bob", "Cara"])
    })

    it("AC-4: deselecting a musician removes them from musicians[] AND emailRecipients[]", async () => {
        const user = userEvent.setup()
        renderDialog()

        // Deselect Bob (role=checkbox toggles selection).
        const bob = screen.getByRole("checkbox", { name: "Notify Bob" })
        expect(bob).toHaveAttribute("aria-checked", "true")
        await user.click(bob)
        expect(bob).toHaveAttribute("aria-checked", "false")
        expect(screen.getByText(/2 will be notified/)).toBeInTheDocument()

        await user.click(screen.getByRole("button", { name: "Publish & Notify" }))
        await waitFor(() => expect(mockApiFetch).toHaveBeenCalled())

        const body = postedBody()
        expect(body.musicians.map((m) => m.name).sort()).toEqual(["Alex", "Cara"])
        expect(body.musicians.some((m) => m.name === "Bob")).toBe(false)
        expect(body.emailRecipients.some((m) => m.name === "Bob")).toBe(false)
    })

    it("AC-4: deselecting everyone disables the Publish button (no implicit send)", async () => {
        const user = userEvent.setup()
        renderDialog()

        for (const name of ["Notify Alex", "Notify Bob", "Notify Cara"]) {
            await user.click(screen.getByRole("checkbox", { name }))
        }

        expect(screen.getByText(/No one selected/)).toBeInTheDocument()
        const publishBtn = screen.getByRole("button", { name: "Select at least one" })
        expect(publishBtn).toBeDisabled()

        await user.click(publishBtn)
        expect(mockApiFetch).not.toHaveBeenCalled()
    })
})
