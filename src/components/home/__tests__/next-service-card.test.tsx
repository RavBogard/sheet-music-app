// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"

describe("NextServiceCard", () => {
    const mockOnPerform = vi.fn()

    const mockSetlist = {
        id: "setlist-1",
        name: "Shabbat Morning Service",
        date: "2026-03-07T00:00:00Z",
        eventDate: "2026-03-14T10:00:00Z",
        tracks: [
            { id: "t1", title: "Song 1", type: "song" as const },
            { id: "t2", title: "Song 2", type: "song" as const },
        ],
        trackCount: 2,
        isPublic: true,
        musicians: [
            { name: "Sarah", email: "sarah@test.com", instrument: "Guitar" },
            { name: "David", email: "david@test.com", instrument: "Drums" },
        ],
    }

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it("renders service date, setlist name, and Perform button", async () => {
        const { NextServiceCard } = await import("@/components/home/NextServiceCard")

        render(
            <NextServiceCard
                setlist={mockSetlist as any}
                onPerform={mockOnPerform}
            />
        )

        expect(screen.getByText("Shabbat Morning Service")).toBeDefined()
        expect(screen.getByRole("button", { name: /perform/i })).toBeDefined()
    })

    it("renders musician names when available", async () => {
        const { NextServiceCard } = await import("@/components/home/NextServiceCard")

        render(
            <NextServiceCard
                setlist={mockSetlist as any}
                onPerform={mockOnPerform}
            />
        )

        expect(screen.getByText("Sarah")).toBeDefined()
        expect(screen.getByText("David")).toBeDefined()
    })

    it("shows most recent past setlist with Practice label", async () => {
        const { NextServiceCard } = await import("@/components/home/NextServiceCard")

        render(
            <NextServiceCard
                setlist={mockSetlist as any}
                onPerform={mockOnPerform}
                isPastSetlist={true}
            />
        )

        // Button should say "Practice" not "Perform"
        expect(screen.getByRole("button", { name: /practice/i })).toBeDefined()
        // Should show "Recent" label
        expect(screen.getByText(/recent/i)).toBeDefined()
    })

    it("has a single prominent action button", async () => {
        const { NextServiceCard } = await import("@/components/home/NextServiceCard")

        render(
            <NextServiceCard
                setlist={mockSetlist as any}
                onPerform={mockOnPerform}
            />
        )

        // Should have exactly one button
        const buttons = screen.getAllByRole("button")
        expect(buttons.length).toBe(1)

        // Click should call onPerform
        fireEvent.click(buttons[0])
        expect(mockOnPerform).toHaveBeenCalledTimes(1)
    })
})
