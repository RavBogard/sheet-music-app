import { afterEach, describe, expect, it, vi } from "vitest"
import { act, screen } from "@testing-library/react"
import type { SchedulingAssignment } from "@/types/models"

import { expectNoUntranslatedText, renderPseudo, renderWithI18n } from "@/test-utils/i18n"

/**
 * Phase 7 (lane A7): the schedule page and the assignment card render every
 * string through t() and dates through fmt. Fixture names (services,
 * musicians, instruments) are data and are allowed.
 */

const data = vi.hoisted(() => ({
    assignments: [] as unknown[],
    setlists: [] as Array<{ id: string; name: string; eventDate: unknown }>,
}))
vi.mock("@/lib/scheduling-firebase", () => ({
    respondToAssignment: vi.fn(async () => ({ success: true })),
    subscribeToAllUpcomingAssignments: (_org: string, cb: (d: unknown[]) => void) => {
        cb(data.assignments)
        return () => {}
    },
    subscribeToUpcomingSetlists: (_org: string, cb: (d: unknown[]) => void) => {
        cb(data.setlists)
        return () => {}
    },
}))
vi.mock("@/lib/auth-context", () => ({
    useAuth: () => ({ user: { uid: "user-1" }, isBandLeader: true }),
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ back: vi.fn(), push: vi.fn() }) }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("next/link", () => ({
    default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => (
        <a href={href} className={className}>
            {children}
        </a>
    ),
}))
vi.mock("@/components/calendar/UnifiedCalendar", () => ({ UnifiedCalendar: () => <div data-testid="calendar" /> }))

import SchedulePage from "@/app/(main)/schedule/page"
import { ScheduleCard } from "@/components/scheduling/ScheduleCard"

const base: SchedulingAssignment = {
    id: "a1",
    setlistId: "s1",
    setlistName: "Test Service A",
    eventDate: "2026-03-14T10:00:00Z",
    musicianUid: "user-1",
    musicianName: "Test Player One",
    musicianEmail: "one@example.test",
    instrument: "Guitar",
    status: "pending",
    autoConfirmed: false,
    assignedBy: "admin-1",
    assignedByName: "Admin",
    assignedAt: "2026-03-10T00:00:00Z",
} as SchedulingAssignment

const others = [
    { name: "Test Player Two", instrument: "Bass", status: "confirmed" },
    { name: "Test Player Three", status: "pending" },
    { name: "P4", status: "pending" },
    { name: "P5", status: "pending" },
    { name: "P6", status: "pending" },
    { name: "P7", status: "pending" },
]

const DATA = ["Test Service A", "Test Service B", "Test Player One", "Test Player Two", "Guitar", "Bass", "Test Player Three", "P4", "P5", "P6"]

describe("ScheduleCard (pseudo-locale)", () => {
    it("pending card with other musicians and +N more", () => {
        const r = renderPseudo(<ScheduleCard assignment={base} otherMusicians={others} />)
        expectNoUntranslatedText(r.container, { allow: DATA })
        // The musician-with-instrument pill comes through t() with the data inside.
        expect(r.container.textContent).toContain("Test Player Two")
    })

    it("confirmed / auto-confirmed / declined badges, no date", () => {
        for (const a of [
            { ...base, status: "confirmed" as const },
            { ...base, status: "confirmed" as const, autoConfirmed: true },
            { ...base, status: "declined" as const, eventDate: null },
        ]) {
            const r = renderPseudo(<ScheduleCard assignment={a} />)
            expectNoUntranslatedText(r.container, { allow: DATA })
            r.unmount()
        }
    })

    it("qps-rtl: root is rtl and the 'View Setlist' chevron mirrors", () => {
        const r = renderPseudo(<ScheduleCard assignment={base} />, { rtl: true })
        expect(r.container.firstElementChild!.getAttribute("dir")).toBe("rtl")
        expect(r.container.querySelector("a svg")!.getAttribute("class")).toMatch(/-scale-x-100/)
        expectNoUntranslatedText(r.container, { allow: DATA })
    })

    it("English is unchanged", () => {
        renderWithI18n(<ScheduleCard assignment={base} otherMusicians={others} />)
        expect(screen.getByText("Test Player Two (Bass)")).toBeTruthy()
        expect(screen.getByText("+1 more")).toBeTruthy()
        expect(screen.getByText("Sat, Mar 14")).toBeTruthy()
        expect(document.querySelector("a svg")!.getAttribute("class")).not.toMatch(/scale-x/)
    })
})

describe("schedule page (pseudo-locale)", () => {
    afterEach(() => {
        data.assignments = []
        data.setlists = []
    })

    function seed() {
        data.assignments = [
            base,
            { ...base, id: "a2", musicianUid: "user-2", musicianName: "Test Player Two", instrument: "Bass", status: "confirmed" },
            { ...base, id: "a3", musicianUid: "user-3", musicianName: "Test Player Three", instrument: undefined, status: "declined" },
        ]
        data.setlists = [
            { id: "s1", name: "Test Service A", eventDate: "2026-03-14T10:00:00Z" },
            { id: "s2", name: "Test Service B", eventDate: null },
        ]
    }

    it("services view: header, stats, service sections, status pills, unassigned service", async () => {
        seed()
        const r = renderPseudo(<SchedulePage />)
        await act(async () => {})
        expectNoUntranslatedText(r.container, { allow: DATA })
    })

    it("empty state", async () => {
        const r = renderPseudo(<SchedulePage />)
        await act(async () => {})
        expectNoUntranslatedText(r.container)
    })

    // Consistency pass: the page head has no back button any more (the tab
    // bar is the way out), so there is no chevron to mirror.
    it("qps-rtl: root is rtl", async () => {
        seed()
        const r = renderPseudo(<SchedulePage />, { rtl: true })
        await act(async () => {})
        expect(r.container.firstElementChild!.getAttribute("dir")).toBe("rtl")
        expectNoUntranslatedText(r.container, { allow: DATA })
    })

    it("English is unchanged (stats, pill, dates, TBD)", async () => {
        seed()
        const r = renderWithI18n(<SchedulePage />)
        await act(async () => {})
        const text = r.container.textContent ?? ""
        expect(text).toContain("1confirmed")
        expect(text).toContain("1pending")
        expect(text).toContain("Sat, Mar 14")
        expect(text).toContain("TBD")
        expect(text).toContain("No musicians assigned yet")
        expect(screen.getByText("declined")).toBeTruthy()
    })
})
