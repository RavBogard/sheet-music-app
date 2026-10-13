import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, screen } from "@testing-library/react"

import { expectNoUntranslatedText, renderPseudo, renderWithI18n } from "@/test-utils/i18n"

/**
 * Phase 7 (lane A7): /login's client form, the shared-device QR sign-in it
 * reveals, and /auth-error render every string through t().
 */

const auth = vi.hoisted(() => ({ signIn: vi.fn(async () => {}), user: null as null | { uid: string }, loading: false }))
vi.mock("@/lib/auth-context", () => ({
    useAuth: () => ({ user: auth.user, loading: auth.loading, signIn: auth.signIn, signOut: vi.fn() }),
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }))
vi.mock("@/lib/firebase", () => ({ auth: { currentUser: null } }))
vi.mock("firebase/auth", () => ({ signInWithCustomToken: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import LoginClient from "@/app/login/LoginClient"
import { QRSignIn } from "@/components/auth/QRSignIn"
import AuthErrorPage from "@/app/auth-error/page"

describe("login (pseudo-locale)", () => {
    beforeEach(() => {
        auth.signIn.mockReset()
        auth.signIn.mockImplementation(async () => {})
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => ({ status: 200, ok: true, json: async () => ({ status: "pending" }) })),
        )
    })
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it("LoginClient: button, divider, set-up-device button", () => {
        const r = renderPseudo(<LoginClient />)
        expectNoUntranslatedText(r.container)
        expect(r.container.textContent).toContain("⟦")
    })

    it("LoginClient: sign-in failure message", async () => {
        auth.signIn.mockImplementation(async () => {
            throw new Error("popup closed")
        })
        const r = renderPseudo(<LoginClient />)
        await act(async () => {
            fireEvent.click(r.getAllByRole("button")[0])
        })
        expect(r.getByRole("alert").textContent).toMatch(/^⟦/)
        expectNoUntranslatedText(r.container)
    })

    it("LoginClient with the QR sign-in revealed (countdown included)", async () => {
        const r = renderPseudo(<LoginClient />)
        await act(async () => {
            fireEvent.click(r.getAllByRole("button")[1])
        })
        expect(r.container.querySelector("svg")).toBeTruthy()
        expectNoUntranslatedText(r.container)
    })

    it("QRSignIn error state", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => ({ status: 503, ok: false, json: async () => ({}) })))
        const r = renderPseudo(<QRSignIn />)
        await act(async () => {})
        expectNoUntranslatedText(r.container)
    })

    it("auth-error page", () => {
        const r = renderPseudo(<AuthErrorPage />)
        expectNoUntranslatedText(r.container)
    })

    it("qps-rtl: root is rtl", () => {
        const r = renderPseudo(<LoginClient />, { rtl: true })
        expect(r.container.firstElementChild!.getAttribute("dir")).toBe("rtl")
        expectNoUntranslatedText(r.container)
    })

    it("English is unchanged", () => {
        renderWithI18n(<LoginClient />)
        expect(screen.getByText("Sign in with Google")).toBeTruthy()
        expect(screen.getByText("Set up this device — sign in with phone")).toBeTruthy()
    })
})
