import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

/**
 * Multi-tenant phase 4: the Platform link shows for the platform owner only,
 * in the desktop profile menu and the mobile drawer. Everyone else's nav is
 * unchanged.
 */

const h = vi.hoisted(() => ({ auth: {} as Record<string, unknown> }))

vi.mock("@/lib/auth-context", () => ({ useAuth: () => h.auth }))
vi.mock("next/navigation", () => ({ usePathname: () => "/setlists", useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/hooks/use-monitor-access", () => ({ useMonitorAccess: () => ({ hasAccess: false }) }))
vi.mock("@/lib/congregation-store", () => ({ useCongregation: () => ({}) }))
vi.mock("@/lib/library-store", () => ({ useLibraryStore: () => ({ allFiles: [] }) }))
vi.mock("@/lib/store", () => ({ useMusicStore: () => ({ setQueue: vi.fn() }) }))
vi.mock("@/hooks/use-library", () => ({ useLibrary: () => ({}) }))
vi.mock("@/components/nav/NotificationBell", () => ({ NotificationBell: () => null }))
vi.mock("@/components/nav/OrgLogo", () => ({ OrgLogo: () => null }))
vi.mock("@/build-info.json", () => ({ default: { version: "test", commit: "x", builtAt: "" } }))

import { MobileMenuDrawer } from "../MobileMenuDrawer"
import { DesktopHeader } from "../DesktopHeader"

beforeAll(() => {
    const g = globalThis as unknown as Record<string, unknown>
    if (typeof g.ResizeObserver !== "function") g.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
    const proto = Element.prototype as unknown as Record<string, unknown>
    for (const fn of ["scrollIntoView", "hasPointerCapture", "setPointerCapture", "releasePointerCapture"]) {
        if (typeof proto[fn] !== "function") proto[fn] = function () {}
    }
})
afterEach(() => cleanup())

const signedIn = (extra: Record<string, unknown>) => ({
    user: { uid: "u", displayName: "Dan", email: "d@x.org", photoURL: null },
    profile: null, role: "admin", isMember: true, isBandLeader: true, isPlatformOwner: false,
    signIn: vi.fn(), signOut: vi.fn(), ...extra,
})

describe("Platform nav link", () => {
    it("mobile drawer: shown for the platform owner", () => {
        h.auth = signedIn({ isPlatformOwner: true })
        render(<MobileMenuDrawer open onOpenChange={() => {}} />)
        expect(screen.getByRole("link", { name: /Platform/ }).getAttribute("href")).toBe("/platform")
        expect(screen.getByRole("link", { name: /Manage/ })).toBeTruthy()
    })

    it("mobile drawer: hidden for a tenant admin", () => {
        h.auth = signedIn({ isPlatformOwner: false })
        render(<MobileMenuDrawer open onOpenChange={() => {}} />)
        expect(screen.queryByRole("link", { name: /Platform/ })).toBeNull()
        expect(screen.getByRole("link", { name: /Manage/ })).toBeTruthy()
    })

    it("desktop menu: shown for the platform owner (server flag or token)", async () => {
        h.auth = signedIn({ isPlatformOwner: false })
        const user = userEvent.setup()
        render(<DesktopHeader serverIsPlatformOwner />)
        await user.click(screen.getByRole("button", { name: "User menu" }))
        expect((await screen.findByRole("menuitem", { name: /Platform/ })).getAttribute("href")).toBe("/platform")
    })

    it("desktop menu: hidden for everyone else", async () => {
        h.auth = signedIn({ isPlatformOwner: false })
        const user = userEvent.setup()
        render(<DesktopHeader serverIsBandLeader />)
        await user.click(screen.getByRole("button", { name: "User menu" }))
        await screen.findByRole("menuitem", { name: /Manage/ })
        expect(screen.queryByRole("menuitem", { name: /Platform/ })).toBeNull()
    })
})
