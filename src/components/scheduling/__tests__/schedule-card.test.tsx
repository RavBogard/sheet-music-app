import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import type { SchedulingAssignment } from "@/types/models"

// Mock cn utility
vi.mock("@/lib/utils", () => ({
    cn: (...args: (string | boolean | undefined | null)[]) =>
        args.filter(Boolean).join(" "),
}))

// Use vi.hoisted for variables referenced in mock factories
const { mockRespondToAssignment, mockToastSuccess, mockToastError } = vi.hoisted(() => ({
    mockRespondToAssignment: vi.fn(),
    mockToastSuccess: vi.fn(),
    mockToastError: vi.fn(),
}))

// Mock scheduling-firebase
vi.mock("@/lib/scheduling-firebase", () => ({
    respondToAssignment: (...args: unknown[]) => mockRespondToAssignment(...args),
}))

// Mock toast
vi.mock("sonner", () => ({
    toast: { success: mockToastSuccess, error: mockToastError },
}))

// Mock next/link
vi.mock("next/link", () => ({
    default: ({ children, href }: { children: React.ReactNode; href: string }) => (
        <a href={href}>{children}</a>
    ),
}))

import { ScheduleCard } from "../ScheduleCard"

const baseAssignment: SchedulingAssignment = {
    id: "assign-1",
    setlistId: "setlist-1",
    setlistName: "Shabbat Morning",
    eventDate: "2026-03-14T10:00:00Z",
    musicianUid: "user-1",
    musicianName: "Sarah",
    musicianEmail: "sarah@test.com",
    instrument: "Guitar",
    status: "pending",
    autoConfirmed: false,
    assignedBy: "admin-1",
    assignedByName: "Admin",
    assignedAt: "2026-03-10T00:00:00Z",
}

describe("ScheduleCard", () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    // --- Status badge rendering ---

    it("shows Pending badge with pulse for pending assignments", () => {
        render(<ScheduleCard assignment={baseAssignment} />)
        expect(screen.getByText("Pending")).toBeDefined()
    })

    it("shows Confirmed badge for confirmed assignments", () => {
        render(<ScheduleCard assignment={{ ...baseAssignment, status: "confirmed" }} />)
        expect(screen.getByText("Confirmed")).toBeDefined()
    })

    it("shows Auto-confirmed badge when autoConfirmed is true", () => {
        render(<ScheduleCard assignment={{ ...baseAssignment, status: "confirmed", autoConfirmed: true }} />)
        expect(screen.getByText("Auto-confirmed")).toBeDefined()
    })

    it("shows Declined badge for declined assignments", () => {
        render(<ScheduleCard assignment={{ ...baseAssignment, status: "declined" }} />)
        expect(screen.getByText("Declined")).toBeDefined()
    })

    // --- Data display ---

    it("displays setlist name", () => {
        render(<ScheduleCard assignment={baseAssignment} />)
        expect(screen.getByText("Shabbat Morning")).toBeDefined()
    })

    it("displays instrument when provided", () => {
        render(<ScheduleCard assignment={baseAssignment} />)
        expect(screen.getByText("Guitar")).toBeDefined()
    })

    it("displays formatted event date from string", () => {
        render(<ScheduleCard assignment={baseAssignment} />)
        // Should show formatted date like "Sat, Mar 14"
        expect(screen.getByText(/Mar/)).toBeDefined()
    })

    it("displays Date TBD when eventDate is null", () => {
        render(<ScheduleCard assignment={{ ...baseAssignment, eventDate: null }} />)
        expect(screen.getByText("Date TBD")).toBeDefined()
    })

    it("handles Firestore timestamp format", () => {
        const assignment = {
            ...baseAssignment,
            eventDate: { seconds: 1741953600 } as unknown as SchedulingAssignment["eventDate"],
        }
        render(<ScheduleCard assignment={assignment} />)
        // Should show a formatted date, not "Date TBD"
        expect(screen.queryByText("Date TBD")).toBeNull()
    })

    // --- Other musicians ---

    it("displays other musicians with status colors", () => {
        const others = [
            { name: "David", instrument: "Drums", status: "confirmed" },
            { name: "Rachel", status: "pending" },
        ]
        render(<ScheduleCard assignment={baseAssignment} otherMusicians={others} />)
        expect(screen.getByText(/David/)).toBeDefined()
        expect(screen.getByText(/Rachel/)).toBeDefined()
    })

    it("shows overflow indicator for >5 musicians", () => {
        const others = Array.from({ length: 7 }, (_, i) => ({
            name: `Musician ${i}`,
            status: "confirmed",
        }))
        render(<ScheduleCard assignment={baseAssignment} otherMusicians={others} />)
        expect(screen.getByText("+2 more")).toBeDefined()
    })

    // --- Accept/Decline buttons ---

    it("shows Accept and Decline buttons for pending status", () => {
        render(<ScheduleCard assignment={baseAssignment} />)
        expect(screen.getByRole("button", { name: /accept/i })).toBeDefined()
        expect(screen.getByRole("button", { name: /decline/i })).toBeDefined()
    })

    it("hides Accept/Decline buttons for confirmed status", () => {
        render(<ScheduleCard assignment={{ ...baseAssignment, status: "confirmed" }} />)
        expect(screen.queryByRole("button", { name: /accept/i })).toBeNull()
        expect(screen.queryByRole("button", { name: /decline/i })).toBeNull()
    })

    it("hides Accept/Decline buttons for declined status", () => {
        render(<ScheduleCard assignment={{ ...baseAssignment, status: "declined" }} />)
        expect(screen.queryByRole("button", { name: /accept/i })).toBeNull()
    })

    // --- Accept/Decline interactions ---

    it("calls respondToAssignment with accept action and shows success toast", async () => {
        mockRespondToAssignment.mockResolvedValue({ success: true })

        render(<ScheduleCard assignment={baseAssignment} />)
        fireEvent.click(screen.getByRole("button", { name: /accept/i }))

        await waitFor(() => {
            expect(mockRespondToAssignment).toHaveBeenCalledWith({
                assignmentId: "assign-1",
                action: "accept",
            })
        })

        await waitFor(() => {
            expect(mockToastSuccess).toHaveBeenCalledWith("Confirmed!")
        })
    })

    it("calls respondToAssignment with decline action", async () => {
        mockRespondToAssignment.mockResolvedValue({ success: true })

        render(<ScheduleCard assignment={baseAssignment} />)
        fireEvent.click(screen.getByRole("button", { name: /decline/i }))

        await waitFor(() => {
            expect(mockRespondToAssignment).toHaveBeenCalledWith({
                assignmentId: "assign-1",
                action: "decline",
            })
        })

        await waitFor(() => {
            expect(mockToastSuccess).toHaveBeenCalledWith("Declined")
        })
    })

    it("shows error toast on API failure", async () => {
        mockRespondToAssignment.mockRejectedValue(new Error("Network error"))

        render(<ScheduleCard assignment={baseAssignment} />)
        fireEvent.click(screen.getByRole("button", { name: /accept/i }))

        await waitFor(() => {
            expect(mockToastError).toHaveBeenCalledWith("Failed to respond")
        })
    })

    it("disables buttons during responding", async () => {
        // Never resolve to keep responding state active
        mockRespondToAssignment.mockReturnValue(new Promise(() => {}))

        render(<ScheduleCard assignment={baseAssignment} />)
        fireEvent.click(screen.getByRole("button", { name: /accept/i }))

        await waitFor(() => {
            const acceptBtn = screen.getByRole("button", { name: /accept/i })
            const declineBtn = screen.getByRole("button", { name: /decline/i })
            expect(acceptBtn.getAttribute("disabled")).not.toBeNull()
            expect(declineBtn.getAttribute("disabled")).not.toBeNull()
        })
    })

    // --- View Setlist link ---

    it("shows View Setlist link with correct href", () => {
        render(<ScheduleCard assignment={baseAssignment} />)
        const link = screen.getByText(/view setlist/i).closest("a")
        expect(link?.getAttribute("href")).toBe("/setlists/setlist-1")
    })
})
