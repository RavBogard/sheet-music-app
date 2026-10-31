import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { expectNoUntranslatedText, renderPseudo, renderWithI18n } from "@/test-utils/i18n"

/**
 * Phase 7 (lane A6): the app navigation renders every UI string through t().
 * DesktopHeader (incl. the user menu, the offline pill and the notification
 * bell), MobileTabBar (incl. the search popover) and the open MobileMenuDrawer
 * under the pseudo-locale; under qps-rtl the page is rtl and the drawer comes
 * from the start (right) side.
 */

const h = vi.hoisted(() => ({
    auth: {} as Record<string, unknown>,
    notifications: [] as unknown[],
}))

vi.mock("@/lib/auth-context", () => ({ useAuth: () => h.auth }))
vi.mock("next/navigation", () => ({
    usePathname: () => "/setlists",
    useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))
vi.mock("@/hooks/use-monitor-access", () => ({
    useMonitorAccess: () => ({ hasAccess: true, isAdmin: true, isSoundEngineer: false, hasBusAssigned: false, loading: false }),
}))
vi.mock("@/hooks/use-monitor-connection", () => ({ useMonitorConnection: () => ({ client: null }) }))
vi.mock("@/lib/congregation-store", () => ({ useCongregation: () => ({ shortName: "Test Band", logoUrl: "" }) }))
vi.mock("@/lib/library-store", () => ({
    useLibraryStore: (sel?: (s: { allFiles: unknown[] }) => unknown) => (sel ? sel({ allFiles: [] }) : { allFiles: [] }),
}))
vi.mock("@/lib/store", () => {
    const state = { setQueue: () => {}, gigModeActive: false }
    return {
        useMusicStore: Object.assign(
            (sel?: (s: Record<string, unknown>) => unknown) => (typeof sel === "function" ? sel(state) : state),
            { getState: () => state },
        ),
    }
})
vi.mock("@/hooks/use-library", () => ({ useLibrary: () => ({ refetch: () => {} }) }))
vi.mock("@/lib/notification-store", () => ({
    subscribeToNotifications: (_uid: string, cb: (n: unknown[]) => void) => {
        cb(h.notifications)
        return () => {}
    },
    markAsRead: async () => {},
    markAllAsRead: async () => {},
}))
vi.mock("@/build-info.json", () => ({ default: { version: "9.9.9", commit: "abcdef0123", builtAt: "" } }))
vi.mock("@/components/monitor/QuickMonitorPanel", () => ({ QuickMonitorPanel: () => null }))
vi.mock("@/lib/firebase", () => ({
    getDb: () => Promise.reject(new Error("no db in test")),
    auth: {},
    subscribeWithDb: () => () => {},
}))

import { DesktopHeader } from "@/components/nav/DesktopHeader"
import { MobileHeader } from "@/components/nav/MobileHeader"
import { MobileMenuDrawer } from "@/components/nav/MobileMenuDrawer"
import { MobileTabBar } from "@/components/nav/MobileTabBar"

beforeAll(() => {
    const g = globalThis as unknown as Record<string, unknown>
    if (typeof g.ResizeObserver !== "function") g.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
    const proto = Element.prototype as unknown as Record<string, unknown>
    for (const fn of ["scrollIntoView", "hasPointerCapture", "setPointerCapture", "releasePointerCapture"]) {
        if (typeof proto[fn] !== "function") proto[fn] = function () {}
    }
})
afterEach(() => {
    cleanup()
    h.notifications = []
})

/** Data on screen: the tenant name and its monogram, the user's name and email. */
const DATA = ["Test Band", "TB", "Fixture Person", "fixture@example.org", "Test Song A", "Test body"]

function signIn() {
    h.auth = {
        user: { uid: "u1", displayName: "Fixture Person", email: "fixture@example.org", photoURL: null },
        profile: null,
        role: "admin",
        loading: false,
        isMember: true,
        isMusician: true,
        isBandLeader: true,
        isAdmin: true,
        isPlatformOwner: true,
        signIn: () => {},
        signOut: () => {},
    }
}

describe("navigation under the pseudo-locale", () => {
    it("DesktopHeader: nav links, search, offline pill, notifications, user menu", async () => {
        signIn()
        h.notifications = [
            { id: "n1", type: "general", title: "Test Song A", body: "Test body", read: false, createdAt: { toDate: () => new Date(Date.now() - 5 * 60_000) } },
        ]
        const user = userEvent.setup()
        const r = renderPseudo(<DesktopHeader serverIsAuthed serverIsMember serverIsBandLeader serverIsPlatformOwner />)
        act(() => { window.dispatchEvent(new Event("offline")) })
        expect(r.container.textContent).toContain("⟦")
        expectNoUntranslatedText(r.container, { allow: DATA })

        // Notification dropdown (with the compact "5m ago" age).
        await user.click(r.container.querySelector("button[aria-label^='⟦Ñöţîƒîçáţîöñš']")!)
        expect(r.container.textContent).toContain("⟦5ɱ áĝö")
        expect(r.container.textContent).toContain("⟦Öƒƒļîñé")
        expectNoUntranslatedText(r.container, { allow: DATA })

        // User menu (portal).
        const menuButton = Array.from(r.container.querySelectorAll("button")).find((b) => (b.getAttribute("aria-label") ?? "").startsWith("⟦Ûšéŕ"))!
        await user.click(menuButton)
        await screen.findAllByRole("menuitem")
        expectNoUntranslatedText(document.body, { allow: DATA })
    })

    it("DesktopHeader signed out: Sign In", () => {
        h.auth = { user: null, profile: null, role: null, isMember: false, isBandLeader: false, isPlatformOwner: false, signIn: () => {}, signOut: () => {} }
        const r = renderPseudo(<DesktopHeader />)
        expectNoUntranslatedText(r.container, { allow: DATA })
    })

    it("MobileHeader + MobileTabBar (and the search popover)", async () => {
        signIn()
        const r = renderPseudo(
            <>
                <MobileHeader />
                <MobileTabBar serverIsAuthed />
            </>,
        )
        expectNoUntranslatedText(r.container, { allow: DATA })
        fireEvent.click(r.container.querySelector("nav button[aria-label^='⟦Šéáŕçĥ']")!)
        const input = await screen.findByRole("textbox")
        fireEvent.change(input, { target: { value: "zz" } })
        await waitFor(() => expect(document.body.textContent).toContain("⟦Ñö šöñĝš ƒöûñð"))
        expectNoUntranslatedText(document.body, { allow: DATA })
    })

    it("MobileMenuDrawer open", () => {
        signIn()
        renderPseudo(<MobileMenuDrawer open onOpenChange={() => {}} />)
        expect(screen.getAllByRole("link").length).toBeGreaterThan(3)
        expectNoUntranslatedText(document.body, { allow: DATA })
    })
})

describe("navigation under qps-rtl", () => {
    it("the header and tab bar render in an rtl page", () => {
        signIn()
        const r = renderPseudo(
            <>
                <DesktopHeader serverIsAuthed />
                <MobileTabBar serverIsAuthed />
            </>,
            { rtl: true },
        )
        expect(r.container.firstElementChild?.getAttribute("dir")).toBe("rtl")
        expectNoUntranslatedText(r.container, { allow: DATA })
    })

    it("the menu drawer slides in from the start side (right) on an rtl page, left on ltr", () => {
        signIn()
        const rtl = renderPseudo(<MobileMenuDrawer open onOpenChange={() => {}} />, { rtl: true })
        expect(rtl.container.firstElementChild?.getAttribute("dir")).toBe("rtl")
        const rtlSheet = document.body.querySelector("[role=dialog]")!
        expect(rtlSheet.className).toContain("right-0")
        expect(rtlSheet.className).not.toContain("left-0")
        cleanup()

        renderWithI18n(<MobileMenuDrawer open onOpenChange={() => {}} />)
        const ltrSheet = document.body.querySelector("[role=dialog]")!
        expect(ltrSheet.className).toContain("left-0")
    })
})

describe("English output is unchanged", () => {
    it("drawer version line, role badge and labels", () => {
        signIn()
        renderWithI18n(<MobileMenuDrawer open onOpenChange={() => {}} />)
        expect(screen.getByText("v9.9.9 · abcdef0")).toBeTruthy()
        expect(screen.getByText("ADMIN")).toBeTruthy()
        expect(screen.getByText("Navigation Menu")).toBeTruthy()
        expect(screen.getByRole("button", { name: /Log Out/ })).toBeTruthy()
    })
})
