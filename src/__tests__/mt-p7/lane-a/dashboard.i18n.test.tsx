import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, renderHook } from "@testing-library/react"
import type { ReactNode } from "react"

import { expectNoUntranslatedText, I18nTestProviders, renderPseudo, renderWithI18n } from "@/test-utils/i18n"

/**
 * Phase 7 (lane A5): the dashboard, the home next-service card, the dashboard
 * widgets, the calendar and the (main) error screen render every string
 * through t() and every date through fmt (which the pseudo-locale also wraps).
 * Fixture setlist names / song titles are data and are allowed. The greeting
 * (src/lib/greeting) is real: it comes through t() too (lane D).
 */

const state = vi.hoisted(() => ({
    auth: {} as Record<string, unknown>,
    setlists: [] as unknown[],
    tasks: [] as unknown[],
}))

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }))
vi.mock("next/link", () => ({
    default: ({ children, href, className, onClick }: { children: ReactNode; href: string; className?: string; onClick?: () => void }) => (
        <a href={href} className={className} onClick={onClick}>
            {children}
        </a>
    ),
}))
vi.mock("@/lib/auth-context", () => ({ useAuth: () => state.auth }))
vi.mock("@/lib/setlist-firebase", () => ({
    createSetlistService: () => ({
        subscribeToAllSetlists: (cb: (s: unknown[], fromCache: boolean) => void) => {
            cb(state.setlists, false)
            return () => {}
        },
    }),
}))
vi.mock("@/lib/congregation-store", () => ({ useCongregation: () => ({ shortName: "CRC", logoUrl: "" }) }))
vi.mock("@/components/auth/QRSignIn", () => ({ QRSignIn: () => <div data-testid="qr" /> }))
vi.mock("@/components/nav/OrgLogo", () => ({ OrgLogo: () => <span data-testid="org-logo" /> }))
vi.mock("@/lib/local/schema", () => ({ getDb: () => ({ outbox: { toArray: async () => [] } }) }))
vi.mock("@/components/people/NudgeAdminButton", () => ({ NudgeAdminButton: () => <span data-testid="nudge" /> }))
vi.mock("@/components/ui/illustrations", () => ({ PendingAccountIllustration: () => <svg data-testid="illus" /> }))
vi.mock("@/lib/users-firebase", () => ({ markWelcomeModalViewed: vi.fn() }))
vi.mock("@/lib/cache-utils", () => ({ isFileCached: async (id: string) => id === "f1", cacheSetlistFiles: vi.fn() }))
vi.mock("@/lib/firebase", () => ({
    getDb: vi.fn(async () => ({})),
    subscribeWithDb: (setup: (db: unknown) => (() => void) | void) => {
        const u = setup({})
        return typeof u === "function" ? u : () => {}
    },
}))
vi.mock("firebase/firestore", async (orig) => ({
    ...(await orig<typeof import("firebase/firestore")>()),
    collection: vi.fn(),
    query: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    doc: vi.fn(),
    updateDoc: vi.fn(),
    onSnapshot: (_q: unknown, cb: (snap: { docs: Array<{ id: string; data: () => unknown }> }) => void) => {
        cb({ docs: state.tasks.map((d, i) => ({ id: `task-${i}`, data: () => d })) })
        return () => {}
    },
}))
vi.mock("@/hooks/use-calendar-data", () => ({
    useCalendarData: () => {
        const now = new Date()
        const key = new Date(now.getFullYear(), now.getMonth(), 15).toISOString().split("T")[0]
        const dayMap = new Map([[key, { setlists: [{ id: "c1", name: "Test Calendar Setlist" }], assignmentsBySetlist: new Map() }]])
        return { dayMap, loading: false }
    },
}))

import DashboardClient from "@/app/(main)/DashboardClient"
import MainError from "@/app/(main)/error"
import { NextServiceCard } from "@/components/home/NextServiceCard"
import { HeroCard } from "@/components/dashboard/HeroCard"
import { UpcomingTimeline } from "@/components/dashboard/UpcomingTimeline"
import { OnboardingCard } from "@/components/dashboard/OnboardingCard"
import { CompactSetlistRow } from "@/components/dashboard/CompactSetlistRow"
import { CommandRow } from "@/components/dashboard/CommandRow"
import { WhatsChangedBanner } from "@/components/dashboard/WhatsChangedBanner"
import { PrepRecommendations } from "@/components/dashboard/PrepRecommendations"
import { TaskCards } from "@/components/dashboard/TaskCards"
import { UnifiedCalendar } from "@/components/calendar/UnifiedCalendar"
import { CalendarDayCell } from "@/components/calendar/CalendarDayCell"
import { useGridKeyboard } from "@/hooks/use-grid-keyboard"

const DAY = 86_400_000
const inDays = (n: number) => new Date(Date.now() + n * DAY).toISOString()
const DATA = ["Test Setlist A", "Test Setlist B", "Test Song A", "Test Song B", "CRC", "Test Player", "Test Task", "Test Calendar Setlist"]

const setlistA = { id: "s1", name: "Test Setlist A", eventDate: inDays(3), trackCount: 2, songCount: 2, fileIds: ["f1", "f2"], musicians: [{ name: "Test Player" }] }
const setlistB = { id: "s2", name: "Test Setlist B", eventDate: inDays(-7), trackCount: 1, songCount: 1 }

function prepItem(setlist: typeof setlistA, daysUntil: number, extra: Record<string, unknown> = {}) {
    return {
        setlist,
        prep: { total: 2, viewed: 1, percent: 50 },
        daysUntil,
        hoursUntil: daysUntil * 24,
        isNew: true,
        dateStr: "",
        urgencyLabel: null,
        viewedFileIds: new Set(["f1"]),
        localTracks: [
            { id: "t1", title: "Test Song A", fileId: "f1", type: "song", key: "G" },
            { id: "t2", title: "Test Song B", fileId: "f2", type: "song" },
        ],
        ...extra,
    } as never
}

afterEach(() => cleanup())

describe("DashboardClient (pseudo-locale)", () => {
    it("signed-in member with an upcoming service: hero, onboarding, no raw text", async () => {
        state.auth = { user: { uid: "u1", displayName: "Test Player" }, profile: { musicianProfile: {}, viewedWelcomeModal: false }, role: "musician", isMember: true, isBandLeader: true, loading: false, signIn: vi.fn() }
        state.setlists = [setlistA, setlistB]
        const r = renderPseudo(<DashboardClient serverGreeting={null} serverShortName="CRC" serverLogoUrl="" serverUid="u1" />)
        await act(async () => {})
        expect(r.container.textContent).toContain("Test Setlist A")
        expectNoUntranslatedText(r.container, { allow: DATA })
    })

    it("signed-out visitor with only past setlists: recent list + sign-in box", async () => {
        state.auth = { user: null, profile: null, role: null, isMember: false, isBandLeader: false, loading: false, signIn: vi.fn() }
        state.setlists = [setlistB]
        const r = renderPseudo(<DashboardClient serverGreeting={null} serverShortName="CRC" serverLogoUrl="" />)
        await act(async () => {})
        expect(r.container.querySelector("[data-testid=qr]")).toBeTruthy()
        expectNoUntranslatedText(r.container, { allow: DATA })
    })

    it("empty state with the diagnostic line", async () => {
        state.auth = { user: null, profile: null, role: null, isMember: false, isBandLeader: false, loading: true, signIn: vi.fn() }
        state.setlists = []
        const r = renderPseudo(<DashboardClient serverGreeting={null} serverShortName="CRC" serverLogoUrl="" />)
        await act(async () => {})
        expectNoUntranslatedText(r.container, { allow: DATA })
    })

    it("qps-rtl: the root wrapper is rtl", async () => {
        state.auth = { user: { uid: "u1", displayName: "Test Player" }, profile: null, role: "musician", isMember: true, isBandLeader: false, loading: false, signIn: vi.fn() }
        state.setlists = [setlistA]
        const r = renderPseudo(<DashboardClient serverGreeting={null} serverShortName="CRC" serverLogoUrl="" serverUid="u1" />, { rtl: true })
        await act(async () => {})
        expect(r.container.firstElementChild!.getAttribute("dir")).toBe("rtl")
        expectNoUntranslatedText(r.container, { allow: DATA })
    })
})

describe("dashboard widgets (pseudo-locale)", () => {
    it("HeroCard, timeline, banners, rows, command row, tasks", async () => {
        state.tasks = [{ title: "Test Task", status: "todo", setlistName: "Test Setlist A", eventDate: inDays(2) }]
        state.auth = { user: { uid: "u1" } }
        const items = [prepItem(setlistA, 0), prepItem({ ...setlistA, id: "s3", name: "Test Setlist B", eventDate: inDays(1) }, 1), prepItem({ ...setlistA, id: "s4", eventDate: inDays(3) }, 3)]
        const r = renderPseudo(
            <div>
                <HeroCard setlist={setlistA as never} prep={null} onClick={() => {}} onPerform={() => {}} />
                <HeroCard setlist={{ ...setlistA, eventDate: new Date(Date.now() + 2 * 3_600_000).toISOString() } as never} prep={items[0]} onClick={() => {}} onPerform={() => {}} />
                <UpcomingTimeline items={items} />
                <WhatsChangedBanner items={items} />
                <WhatsChangedBanner items={[items[0]]} />
                <PrepRecommendations items={[prepItem(setlistA, 0), prepItem(setlistA, 1), prepItem(setlistA, 2)]} />
                <CompactSetlistRow setlist={setlistA as never} />
                <CommandRow isMember isBandLeader isLoggedIn />
                <TaskCards />
            </div>,
        )
        await act(async () => {})
        // Expand one timeline row so the track list is checked too.
        fireEvent.click(r.getAllByRole("button", { name: /⟦/ }).find((b) => b.closest(".overflow-hidden") && b.getAttribute("aria-label"))!)
        expectNoUntranslatedText(r.container, { allow: [...DATA, "G"] })
    })

    it("OnboardingCard (pending and approved) and NextServiceCard (upcoming and past)", () => {
        const r = renderPseudo(
            <div>
                <OnboardingCard role="pending" isMember={false} profile={null} congregationShortName="CRC" userId="u1" />
                <OnboardingCard role="musician" isMember profile={{ musicianProfile: {} }} congregationShortName="CRC" userId="u1" />
                <NextServiceCard setlist={setlistA as never} onPerform={() => {}} onEdit={() => {}} isBandLeader />
                <NextServiceCard setlist={setlistB as never} onPerform={() => {}} onEdit={() => {}} isPastSetlist isBandLeader />
            </div>,
        )
        expectNoUntranslatedText(r.container, { allow: DATA })
    })

    it("qps-rtl: chevrons that mean next/open are mirrored", () => {
        const r = renderPseudo(<CompactSetlistRow setlist={setlistA as never} />, { rtl: true })
        expect(r.container.firstElementChild!.getAttribute("dir")).toBe("rtl")
        expect(r.container.querySelector("svg.-scale-x-100")).toBeTruthy()
    })
})

describe("calendar and error screen (pseudo-locale)", () => {
    it("UnifiedCalendar (planning) with legend, weekdays, month label and a day cell", () => {
        const r = renderPseudo(<UnifiedCalendar mode="planning" onCreateSetlist={() => {}} />)
        expectNoUntranslatedText(r.container, { allow: DATA })
        // Empty Friday/Saturday placeholders and the "none" coverage marker.
        const cell = renderPseudo(
            <CalendarDayCell
                date={new Date(2026, 9, 10)}
                dateKey="2026-10-10"
                dayData={{ setlists: [{ id: "x", name: "Test Setlist A" }], assignmentsBySetlist: new Map() } as never}
                mode="planning"
                isToday={false}
                isPast={false}
                onSelectSetlist={() => {}}
            />,
        )
        expectNoUntranslatedText(cell.container, { allow: DATA })
        const empty = renderPseudo(
            <CalendarDayCell date={new Date(2026, 9, 9)} dateKey="2026-10-09" dayData={undefined} mode="planning" isToday={false} isPast={false} onSelectSetlist={() => {}} onCreateSetlist={() => {}} />,
        )
        expectNoUntranslatedText(empty.container, { allow: DATA })
    })

    it("English weekday headers and month label are unchanged", () => {
        const { container } = renderWithI18n(<UnifiedCalendar mode="viewer" />)
        const wide = [...container.querySelectorAll(".grid-cols-7 .hidden")].map((e) => e.textContent)
        const narrow = [...container.querySelectorAll('.grid-cols-7 [class="sm:hidden"]')].map((e) => e.textContent)
        expect(wide).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"])
        expect(narrow).toEqual(["S", "M", "T", "W", "T", "F", "S"])
        const now = new Date()
        expect(container.querySelector("h2")!.textContent).toBe(new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString("en-US", { month: "long", year: "numeric" }))
    })

    it("qps-rtl: calendar root is rtl and month arrows are mirrored", () => {
        const r = renderPseudo(<UnifiedCalendar mode="viewer" />, { rtl: true })
        expect(r.container.firstElementChild!.getAttribute("dir")).toBe("rtl")
        expect(r.container.querySelectorAll("button svg.-scale-x-100").length).toBe(2)
    })

    it("(main) error screen", () => {
        const r = renderPseudo(<MainError error={Object.assign(new Error("boom"), {})} reset={() => {}} />)
        // error.message is shown verbatim inside <pre> (skipped by the checker).
        expectNoUntranslatedText(r.container)
    })
})

describe("use-grid-keyboard follows the reading direction", () => {
    function setup(lang: "en" | "qps-rtl") {
        const wrapper = ({ children }: { children: ReactNode }) => <I18nTestProviders lang={lang}>{children}</I18nTestProviders>
        const hook = renderHook(() => useGridKeyboard({ rowCount: 1, editableColIds: ["a", "b", "c"] }), { wrapper })
        act(() => hook.result.current.handleCellFocus(0, "b"))
        return hook
    }
    const key = (k: string) => ({ key: k, preventDefault: () => {} }) as unknown as KeyboardEvent

    it("ltr: ArrowRight → next column, ArrowLeft → previous (unchanged)", () => {
        const h = setup("en")
        act(() => void h.result.current.handleCellKeyDown(key("ArrowRight"), 0, "b"))
        expect(h.result.current.focusedCell?.colId).toBe("c")
        act(() => void h.result.current.handleCellKeyDown(key("ArrowLeft"), 0, "c"))
        expect(h.result.current.focusedCell?.colId).toBe("b")
    })

    it("rtl: ArrowLeft → next column (visually left), ArrowRight → previous", () => {
        const h = setup("qps-rtl")
        act(() => void h.result.current.handleCellKeyDown(key("ArrowLeft"), 0, "b"))
        expect(h.result.current.focusedCell?.colId).toBe("c")
        act(() => void h.result.current.handleCellKeyDown(key("ArrowRight"), 0, "c"))
        expect(h.result.current.focusedCell?.colId).toBe("b")
    })
})
