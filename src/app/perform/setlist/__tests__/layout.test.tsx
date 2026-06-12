/**
 * v11.5-01 (H4) regression — CRC branding leak on the broslaz Perform-setlist
 * route. Covers stress cell **B4** in
 * `.paul/research/STRESS-TEST-PROMPT-2026-06-RUN3.md`.
 *
 * `SetlistPerformLayout` is an async SERVER component that resolves the host org
 * from the `x-org-id` header and threads branding into `<AppNavigation>`. We
 * render it as a JSX tree (NOT mounted) and assert on the AppNavigation
 * element's props — the same server-component-prop approach as
 * `src/app/perform/__tests__/page.test.tsx`. AppNavigation is stubbed so its
 * heavy client-import chain (useAuth / Firestore / wake-lock) never loads;
 * `coerceOrgId` + `getOrgBranding` are the REAL implementations (we exercise the
 * true host→branding resolution, not a mock of it).
 *
 * Pre-fix this layout rendered <AppNavigation/> with NO props, so the desktop +
 * mobile headers fell back to the congregation-store CRC default ("CRC Music" +
 * "/logo.jpg") on every host — a CRC branding leak on broslaz.
 */
import { describe, it, expect, vi } from "vitest"
import { getOrgBranding } from "@/lib/org/branding"

// Mutable per-case host header. The mock reads it live at call time (the layout
// calls `await headers()` on every render), so reassigning between cases works.
let mockOrgHeader: string | null = "crc"
vi.mock("next/headers", () => ({
    headers: async () => new Headers(mockOrgHeader ? { "x-org-id": mockOrgHeader } : {}),
}))

// Stub the nav island — it imports useAuth / Firestore / wake-lock. We only need
// to read the branding props the server layout feeds into it.
vi.mock("@/components/nav/AppNavigation", () => ({
    AppNavigation: () => null,
}))

type NavProps = {
    serverOrgShortName?: string
    serverLogoUrl?: string
    serverWordmarkUrl?: string
}

// The layout returns `<><AppNavigation .../>{children}</>` — a Fragment whose
// children array is [navElement, children]. Pull the nav element's props.
async function renderAndGetNavProps(): Promise<NavProps> {
    const { default: SetlistPerformLayout } = await import("../layout")
    const tree = (await SetlistPerformLayout({ children: null })) as {
        props: { children: Array<{ props: NavProps }> }
    }
    return tree.props.children[0].props
}

describe("perform/setlist/layout.tsx — H4 host-branding regression (stress cell B4)", () => {
    it("AC-1: broslaz host → BL branding props, never CRC (anti-leak)", async () => {
        mockOrgHeader = "brotherslazaroff"
        const props = await renderAndGetNavProps()
        const bl = getOrgBranding("brotherslazaroff")

        // Resolves the real BL branding trio.
        expect(props.serverOrgShortName).toBe(bl.shortName)
        expect(props.serverLogoUrl).toBe(bl.logoUrl)
        expect(props.serverWordmarkUrl).toBe(bl.wordmarkUrl)

        // Concrete BL values (guards against the trio silently going empty).
        expect(props.serverOrgShortName).toBe("Brothers Lazaroff")
        expect(props.serverWordmarkUrl).toBe("/brands/brotherslazaroff/wordmark.png")

        // The H4 anti-leak assertion: the CRC default must NOT be what the
        // header falls back to on a broslaz request.
        expect(props.serverOrgShortName).not.toBe("CRC Music")
        expect(props.serverLogoUrl).not.toBe("/logo.jpg")
    })

    it("AC-2a: crc host → crc branding (byte-identical default)", async () => {
        mockOrgHeader = "crc"
        const props = await renderAndGetNavProps()
        const crc = getOrgBranding("crc")

        expect(props.serverOrgShortName).toBe(crc.shortName) // "CRC Music"
        expect(props.serverLogoUrl).toBe(crc.logoUrl) // "/logo.jpg"
        expect(props.serverWordmarkUrl).toBe(crc.wordmarkUrl) // ""
    })

    it("AC-2b: absent x-org-id header → crc branding (legacy/default fallback)", async () => {
        mockOrgHeader = null
        const props = await renderAndGetNavProps()
        const crc = getOrgBranding("crc")

        // coerceOrgId(null) → DEFAULT_ORG_ID (crc): same trio as an explicit crc host.
        expect(props.serverOrgShortName).toBe(crc.shortName)
        expect(props.serverLogoUrl).toBe(crc.logoUrl)
        expect(props.serverWordmarkUrl).toBe(crc.wordmarkUrl)
    })
})
