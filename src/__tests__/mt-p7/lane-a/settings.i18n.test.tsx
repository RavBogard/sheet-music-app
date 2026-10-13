import { describe, expect, it, vi, beforeEach } from "vitest"
import { act, waitFor } from "@testing-library/react"

/**
 * Phase 7 (lane A4): the Settings page and its cards render every UI string
 * through t() (pseudo-locale check) and lay out under dir="rtl".
 */

const h = vi.hoisted(() => ({
    profile: {} as Record<string, unknown>,
    permission: "denied" as NotificationPermission,
}))

vi.mock("@/lib/auth-context", () => ({
    useAuth: () => ({
        user: {
            uid: "u-test",
            email: "test.user@example.test",
            displayName: "Test User",
            photoURL: null,
            providerData: [{ providerId: "password" }],
        },
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
vi.mock("firebase/auth", async (orig) => ({
    ...(await orig<typeof import("firebase/auth")>()),
    reauthenticateWithCredential: async () => {},
    updatePassword: async () => {},
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
    apiFetch: async () => ({
        ok: true,
        json: async () => ({
            tokens: [
                { id: "tok-1", label: "Test Token A", createdAt: Date.UTC(2026, 8, 1, 12), lastUsedAt: null },
                { id: "tok-2", label: "Test Token B", createdAt: Date.UTC(2026, 8, 2, 12), lastUsedAt: Date.UTC(2026, 9, 1, 12) },
            ],
        }),
    }),
}))
vi.mock("@/lib/push-notifications", () => ({
    isPushSupported: () => true,
    getPushPermissionStatus: () => h.permission,
    registerPushNotifications: async () => null,
    unregisterPushNotifications: async () => {},
}))
vi.mock("sonner", () => ({ toast: { success: () => {}, error: () => {}, warning: () => {} } }))

import SettingsPage from "@/app/(main)/settings/page"
import { MusicianProfileSettings } from "@/components/settings/MusicianProfileSettings"
import { McpAccessSettings } from "@/components/settings/McpAccessSettings"
import { expectNoUntranslatedText, renderPseudo, renderWithI18n } from "@/test-utils/i18n"

// Data shown on screen (not UI text).
const DATA = ["Test User", "test.user@example.test", "Test Token A", "Test Token B"]
// The instrument nudge is one translated sentence split around a <strong>
// phrase, so its two halves carry only the opening / closing pseudo marker.
const SPLIT_SENTENCE = [/^[^⟦⟧]*⟦[^⟧]*$/, /^[^⟦]*⟧[^⟦⟧]*$/]

async function renderPage(rtl = false) {
    let r!: ReturnType<typeof renderPseudo>
    await act(async () => {
        r = renderPseudo(<SettingsPage />, { rtl })
    })
    await waitFor(() => expect(r.container.textContent).toContain("Test Token A"))
    return r
}

beforeEach(() => {
    h.profile = {}
    h.permission = "denied"
})

describe("Settings page under the pseudo-locale", () => {
    it("every visible string comes through t() (page + all cards)", async () => {
        const r = await renderPage()
        // The cards are there (sanity): password card, nudge, push blocked hint, tokens.
        expect(r.container.querySelector("#current-password")).not.toBeNull()
        expect(r.container.querySelector("strong")).not.toBeNull()
        expectNoUntranslatedText(r.container, { allow: [...DATA, ...SPLIT_SENTENCE] })
    })

    it("musician profile with an instrument, capo and calendar feed is fully translated", async () => {
        h.profile = { instrument: "bb_trumpet", preferCapo: true, calendarFeedToken: "feed-token" }
        let r!: ReturnType<typeof renderPseudo>
        await act(async () => {
            r = renderPseudo(<MusicianProfileSettings />)
        })
        expectNoUntranslatedText(r.container, { allow: DATA })
        h.profile = { instrument: "acoustic_guitar", preferCapo: true }
        r.unmount()
        await act(async () => {
            r = renderPseudo(<MusicianProfileSettings />)
        })
        expectNoUntranslatedText(r.container, { allow: DATA })
    })

    it("qps-rtl: the page renders under dir=rtl", async () => {
        const r = await renderPage(true)
        expect(r.container.firstElementChild?.getAttribute("dir")).toBe("rtl")
        expectNoUntranslatedText(r.container, { allow: [...DATA, ...SPLIT_SENTENCE] })
    })
})

describe("Settings English output unchanged", () => {
    it("keeps today's English text", async () => {
        h.profile = { instrument: "bb_trumpet" }
        let r!: ReturnType<typeof renderWithI18n>
        await act(async () => {
            r = renderWithI18n(<SettingsPage />)
        })
        await waitFor(() => expect(r.container.textContent).toContain("Test Token A"))
        const text = r.container.textContent ?? ""
        for (const s of [
            "Settings",
            "Profile and preferences",
            "BAND LEADER",
            "Live Gig Mode",
            "Bb Trumpet",
            "+2 semitones",
            "Sounds a whole step lower",
            "Prefer flats (Bb) over sharps (A#)",
            "Notifications are blocked by your browser. Open your browser's notification settings to allow them.",
            "Created Sep 1, 2026 · Last used —",
            "v1.2.3 • abcdef0",
        ]) {
            expect(text).toContain(s)
        }
        expect(r.container.querySelector('[aria-label="Revoke Test Token A"]')).not.toBeNull()
    })

    it("instrument nudge keeps the bold phrase inside one sentence", async () => {
        let r!: ReturnType<typeof renderWithI18n>
        await act(async () => {
            r = renderWithI18n(<MusicianProfileSettings />)
        })
        const p = r.container.querySelector("strong")!.parentElement!
        expect(p.textContent).toBe("Set your instrument below to get automatically transposed charts in your key and personalized printout PDFs.")
        expect(p.querySelector("strong")!.textContent).toBe("automatically transposed charts")
    })

    it("token dates match toLocaleDateString", async () => {
        let r!: ReturnType<typeof renderWithI18n>
        await act(async () => {
            r = renderWithI18n(<McpAccessSettings />)
        })
        await waitFor(() => expect(r.container.textContent).toContain("Test Token B"))
        const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }
        const expected = `Created ${new Date(Date.UTC(2026, 8, 2, 12)).toLocaleDateString("en-US", opts)} · Last used ${new Date(Date.UTC(2026, 9, 1, 12)).toLocaleDateString("en-US", opts)}`
        expect(r.container.textContent).toContain(expected)
    })
})
