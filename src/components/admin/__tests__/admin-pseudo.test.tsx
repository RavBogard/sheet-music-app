import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react"

import { expectNoUntranslatedText, renderPseudo } from "@/test-utils/i18n"

/**
 * Multi-tenant phase 7 (lane C): the admin People and Library surfaces render
 * every visible string through t() — under the pseudo-locale nothing but the
 * fixture data (names, emails, file names) may show unwrapped — and the
 * right-to-left pseudo-locale puts the page in dir="rtl".
 */

const h = vi.hoisted(() => ({
    auth: { user: { uid: "admin-uid" }, role: "admin", isAdmin: true, isBandLeader: true } as Record<string, unknown>,
    apiFetch: vi.fn(),
}))

vi.mock("@/lib/auth-context", () => ({ useAuth: () => h.auth }))
vi.mock("@/lib/users-firebase", () => ({
    fetchTenantPeople: vi.fn(),
    updateUserRole: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock("@/lib/api-client", () => ({ apiFetch: h.apiFetch }))
vi.mock("@/lib/library-cache", () => ({ clearLibraryCache: vi.fn().mockResolvedValue(undefined), broadcastCacheInvalidation: vi.fn() }))
vi.mock("@/lib/org/use-feature", () => ({ useFeature: () => true }))
vi.mock("@/lib/firebase", () => ({ getDb: vi.fn().mockResolvedValue({}) }))
vi.mock("firebase/firestore", () => ({
    collection: vi.fn(),
    query: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    getDocs: vi.fn().mockResolvedValue({
        empty: false,
        docs: [{
            data: () => ({
                startedAt: "2026-10-01T10:00:00Z",
                completedAt: new Date(Date.now() - 3 * 86400_000).toISOString(),
                status: "completed",
                stats: { totalScanned: 42, added: 2, updated: 1, copyErrors: 1 },
            }),
        }],
    }),
}))

import { PeopleSection } from "../PeopleSection"
import { LibraryDataSection } from "../LibraryDataSection"
import { LibrarySyncCard } from "../library/LibrarySyncCard"
import { fetchTenantPeople } from "@/lib/users-firebase"

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

const p = (uid: string, displayName: string, role: string, extra: Record<string, unknown> = {}) => ({
    uid, displayName, email: `${uid}@example.com`, photoURL: null, role,
    soundEngineer: false, canUpload: false, musicianProfile: null,
    createdAt: "2026-09-01T12:00:00Z", lastLoginAt: null, addedAt: null, requestedAt: null,
    ...extra,
})

const PEOPLE = [
    p("admin-uid", "Me", "admin"),
    p("u1", "Alex", "musician", { soundEngineer: true }),
    p("u2", "Pat", "pending"),
    p("u3", "Sam", "denied"),
    p("u4", "Jo", "band_leader"),
]
const PEOPLE_DATA = [...PEOPLE.flatMap((x) => [x.displayName, x.email]), "M", "A", "P", "S", "J"]

beforeEach(() => {
    vi.mocked(fetchTenantPeople).mockResolvedValue({ tenant: "crc", people: PEOPLE, pendingCount: 1 } as never)
    h.auth = { user: { uid: "admin-uid" }, role: "admin", isAdmin: true, isBandLeader: true }
    h.apiFetch.mockReset()
})
afterEach(() => cleanup())

describe("phase 7: admin People under the pseudo-locale", () => {
    it("the people list, filters, badges, request controls and bulk bar are all translated", async () => {
        const r = renderPseudo(<PeopleSection />)
        await screen.findByText("Alex")
        // Select everyone to show the bulk-action bar too.
        const boxes = r.container.querySelectorAll('input[type="checkbox"]')
        fireEvent.click(boxes[1])
        expectNoUntranslatedText(r.container, { allow: PEOPLE_DATA })
    })

    it("qps-rtl puts the surface in a right-to-left context", async () => {
        const r = renderPseudo(<PeopleSection />, { rtl: true })
        await screen.findByText("Alex")
        const rtlRoot = r.container.querySelector('[dir="rtl"]')
        expect(rtlRoot).not.toBeNull()
        expect(rtlRoot!.textContent).toContain("Alex")
        expectNoUntranslatedText(r.container, { allow: PEOPLE_DATA })
    })
})

describe("phase 7: admin Library under the pseudo-locale", () => {
    it("sync status, archived songs and their dates are translated", async () => {
        h.apiFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ files: [{ id: "f1", name: "Some_Song.pdf", archivedAt: new Date(Date.now() - 86400_000 * 14).toISOString() }] }),
        })
        const r = renderPseudo(<LibraryDataSection />)
        await waitFor(() => expect(r.container.querySelector("h3")).not.toBeNull())
        fireEvent.click(screen.getAllByRole("button").find((b) => b.querySelector("h3"))!)
        await screen.findByText("Some Song")
        expectNoUntranslatedText(r.container, { allow: ["Some Song"] })
    })

    it("the sync card's result (counts, copy errors, what changed) is translated", async () => {
        h.apiFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ stats: { totalScanned: 10, added: 1, updated: 2, copiedToStorage: 3, copyErrors: 2, copyFailedFiles: ["bad.pdf"], addedFiles: ["new.pdf"] } }),
        })
        const r = renderPseudo(<LibrarySyncCard />)
        fireEvent.click(screen.getByRole("button"))
        await waitFor(() => expect(r.container.querySelector("details")).not.toBeNull())
        expectNoUntranslatedText(r.container, { allow: ["bad.pdf", "new.pdf"] })
    })
})
