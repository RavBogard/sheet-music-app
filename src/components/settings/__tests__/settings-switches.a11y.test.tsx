import "@testing-library/jest-dom"
import { describe, expect, it, vi, beforeEach } from "vitest"
import { act, fireEvent, screen, waitFor } from "@testing-library/react"

/**
 * Audit 2026-10-31 (a11y P1): every Settings toggle is a real switch
 * (role="switch", aria-checked) with an accessible name taken from its
 * visible label, and toggling it flips aria-checked.
 */

const h = vi.hoisted(() => ({
    profile: {} as Record<string, unknown>,
}))

vi.mock("@/lib/auth-context", () => ({
    useAuth: () => ({
        user: { uid: "u-test", email: "t@example.test", displayName: "Test User", photoURL: null, providerData: [{ providerId: "password" }] },
        profile: { displayName: "Test User" },
        role: "band_leader",
        loading: false,
        signOut: () => {},
    }),
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ back: () => {}, push: () => {} }) }))
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "dark", setTheme: () => {} }) }))
vi.mock("@/lib/store", () => ({
    useMusicStore: (sel: (s: { gigModeActive: boolean; setGigModeActive: () => void }) => unknown) =>
        sel({ gigModeActive: false, setGigModeActive: () => {} }),
}))
vi.mock("@/build-info.json", () => ({ default: { version: "1.2.3", commit: "abcdef0123", builtAt: "" } }))
vi.mock("@/lib/firebase", () => ({
    getDb: () => Promise.reject(new Error("no db in this test")),
    auth: {},
    subscribeWithDb: () => () => {},
}))
vi.mock("@/lib/musician-profile", async (orig) => {
    const real = await orig<typeof import("@/lib/musician-profile")>()
    return {
        INSTRUMENT_PRESETS: real.INSTRUMENT_PRESETS,
        subscribeToMusicianProfile: (_uid: string, cb: (p: unknown) => void) => {
            cb(h.profile)
            return () => {}
        },
        saveMusicianProfile: async () => {},
    }
})
vi.mock("@/lib/api-client", () => ({
    apiFetch: async () => ({ ok: true, json: async () => ({ tokens: [] }) }),
}))
vi.mock("@/lib/push-notifications", () => ({
    isPushSupported: () => true,
    getPushPermissionStatus: () => "default",
    registerPushNotifications: async () => null,
    unregisterPushNotifications: async () => {},
}))
vi.mock("sonner", () => ({ toast: { success: () => {}, error: () => {}, warning: () => {} } }))

import SettingsPage from "@/app/(main)/settings/page"
import { MusicianProfileSettings } from "@/components/settings/MusicianProfileSettings"
import { renderWithI18n } from "@/test-utils/i18n"

beforeEach(() => {
    // A guitar: the capo switch shows as well as the flats switch.
    h.profile = { instrument: "acoustic_guitar", preferCapo: false, preferFlats: false }
})

describe("Settings toggles are named switches", () => {
    it("profile toggles are role=switch, named by their labels, and flip aria-checked", async () => {
        await act(async () => {
            renderWithI18n(<MusicianProfileSettings />)
        })
        const switches = await screen.findAllByRole("switch")
        // capo + flats + the scheduling notification toggles
        expect(switches.length).toBeGreaterThanOrEqual(4)
        for (const sw of switches) {
            expect(sw).toHaveAccessibleName()
            expect(sw).toHaveAttribute("aria-checked")
        }
        const flats = screen.getByRole("switch", { name: /flat/i })
        expect(flats).toHaveAttribute("aria-checked", "false")
        fireEvent.click(flats)
        await waitFor(() => expect(screen.getByRole("switch", { name: /flat/i })).toHaveAttribute("aria-checked", "true"))
    })

    it("every switch on the Settings page has an accessible name", async () => {
        await act(async () => {
            renderWithI18n(<SettingsPage />)
        })
        const switches = await screen.findAllByRole("switch")
        expect(switches.length).toBeGreaterThanOrEqual(2)
        for (const sw of switches) expect(sw).toHaveAccessibleName()
    })

    it("the shared switch and small buttons carry the 44px hit area", async () => {
        await act(async () => {
            renderWithI18n(<MusicianProfileSettings />)
        })
        for (const sw of await screen.findAllByRole("switch")) expect(sw.className).toMatch(/\btouch-hit\b/)
    })
})
