import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, screen } from "@testing-library/react"

import { expectNoUntranslatedText, renderPseudo, renderWithI18n } from "@/test-utils/i18n"

/**
 * Phase 7 (lane A7): the invitation page (/invite/<token>) and the phone-side
 * QR approval page (/qr/<code>) render every string through t(). The token
 * lookup is a mocked fetch.
 *
 * A sentence with a bold value in it (an email, a person's name) is split
 * around the value, so under the pseudo-locale its two halves are "⟦…" and
 * "…⟧" text nodes: OPEN_HALF / CLOSE_HALF allow exactly those.
 */
const OPEN_HALF = /^\s*⟦[^⟧]*$/
const CLOSE_HALF = /^[^⟦]*⟧\s*$/

const auth = vi.hoisted(() => ({
    user: null as null | { uid: string; email: string; displayName: string },
}))
vi.mock("@/lib/auth-context", () => ({
    useAuth: () => ({ user: auth.user, loading: false, signIn: vi.fn() }),
}))
vi.mock("next/navigation", () => ({
    useParams: () => ({ token: "tok-1", code: "ABC123" }),
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock("@/lib/firebase", () => ({
    auth: { currentUser: { getIdToken: async () => "id-token" } },
}))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import InvitePage from "@/app/invite/[token]/page"
import QRApprovePage from "@/app/qr/[code]/page"

const PEEK = { orgId: "testorg", tenantName: "Test Band", role: "band_leader", email: "invitee@example.test", status: "open" }

function stubFetch(get: { status: number; body?: unknown }, post: { status: number; body?: unknown } = { status: 200, body: {} }) {
    vi.stubGlobal(
        "fetch",
        vi.fn(async (_url: string, init?: { method?: string }) => {
            const r = init?.method && init.method !== "GET" ? post : get
            return { status: r.status, ok: r.status >= 200 && r.status < 300, json: async () => r.body ?? {} }
        }),
    )
}

async function flush() {
    await act(async () => {
        await new Promise((r) => setTimeout(r, 0))
    })
}

describe("invite page (pseudo-locale)", () => {
    beforeEach(() => {
        auth.user = null
    })
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it("signed out: invitation heading, instruction, Google button", async () => {
        stubFetch({ status: 200, body: PEEK })
        const r = renderPseudo(<InvitePage />)
        await flush()
        expect(r.getByRole("heading").textContent).toContain("Test Band")
        expectNoUntranslatedText(r.container, { allow: [PEEK.email, OPEN_HALF, CLOSE_HALF, /Test Band/] })
    })

    it("signed in: accept, then the success screen", async () => {
        auth.user = { uid: "u1", email: "invitee@example.test", displayName: "Invitee" }
        stubFetch({ status: 200, body: PEEK })
        const r = renderPseudo(<InvitePage />)
        await flush()
        expectNoUntranslatedText(r.container, { allow: [PEEK.email, OPEN_HALF, CLOSE_HALF, /Test Band/] })
        await act(async () => {
            fireEvent.click(r.getByRole("button"))
        })
        await flush()
        expect(r.getByRole("heading").textContent).toMatch(/^⟦/)
        expectNoUntranslatedText(r.container, { allow: [/Test Band/] })
    })

    it("an expired invitation", async () => {
        stubFetch({ status: 200, body: { ...PEEK, status: "expired" } })
        const r = renderPseudo(<InvitePage />)
        await flush()
        expectNoUntranslatedText(r.container)
    })

    it("qps-rtl: root is rtl", async () => {
        stubFetch({ status: 404 })
        const r = renderPseudo(<InvitePage />, { rtl: true })
        await flush()
        expect(r.container.firstElementChild!.getAttribute("dir")).toBe("rtl")
        expectNoUntranslatedText(r.container)
    })

    it("English is unchanged (role sentence, bold email)", async () => {
        stubFetch({ status: 200, body: PEEK })
        const r = renderWithI18n(<InvitePage />)
        await flush()
        expect(screen.getByRole("heading").textContent).toBe("You've been invited to join Test Band as a band leader.")
        expect(r.container.textContent).toContain("Sign in with the Google account for invitee@example.test to accept.")
        expect(screen.getByText("invitee@example.test").tagName).toBe("SPAN")
    })
})

describe("QR approval page (pseudo-locale)", () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it("signed in, approved: success text with the bold name", async () => {
        auth.user = { uid: "u1", email: "player@example.test", displayName: "Test Player" }
        stubFetch({ status: 200, body: {} })
        const r = renderPseudo(<QRApprovePage />)
        await flush()
        await flush()
        expectNoUntranslatedText(r.container, { allow: ["Test Player", OPEN_HALF, CLOSE_HALF] })
    })

    it("expired code names the tenant", async () => {
        auth.user = null
        stubFetch({ status: 410 })
        const r = renderPseudo(<QRApprovePage />, { rtl: true })
        await flush()
        expect(r.container.firstElementChild!.getAttribute("dir")).toBe("rtl")
        expectNoUntranslatedText(r.container, { allow: [/CRC Music/] })
    })

    it("English is unchanged (signed-in success)", async () => {
        auth.user = { uid: "u1", email: "player@example.test", displayName: "Test Player" }
        stubFetch({ status: 200, body: {} })
        const r = renderWithI18n(<QRApprovePage />)
        await flush()
        await flush()
        expect(r.container.textContent).toContain("The iPad is now signed in as Test Player. You can close this page.")
    })
})
