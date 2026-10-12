import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

/**
 * Multi-tenant phase 1 golden (lane 3, surface 4): the template editor's
 * "Only For" hint names a rabbi slot key. At e0ad18b4 it was CRC's
 * `daniel_karen` for every tenant.
 */
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { uid: "u1" } }) }))
vi.mock("@/lib/template-firebase", () => ({ saveCustomTemplate: vi.fn(), deleteCustomTemplate: vi.fn() }))
vi.mock("@/components/library/SearchOverlay", () => ({ SearchOverlay: () => null }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { OrgProvider } from "@/lib/org/org-context"
import { codeOrgConfig } from "@/lib/org/config-code"
import { clearPrimedOrgConfigs } from "@/lib/org/config-cache"
import { TemplateEditor } from "../TemplateEditor"

function onlyForPlaceholder(orgId: string, config = codeOrgConfig(orgId)): string {
    render(
        <OrgProvider orgId={orgId} config={config}>
            <TemplateEditor
                templateKey="friday_night"
                defaultSlots={[{ label: "Zemer", type: "song", queries: [] }]}
                customSlots={null}
            />
        </OrgProvider>,
    )
    fireEvent.click(screen.getByText("Zemer"))
    const input = screen.getByText("Only For (comma-sep)").parentElement!.querySelector("input")!
    return input.placeholder
}

describe("P1 golden: TemplateEditor rabbi-slot hint", () => {
    afterEach(() => {
        cleanup()
        clearPrimedOrgConfigs()
    })

    for (const org of ["crc", "brotherslazaroff"]) {
        it(`${org}: "e.g., daniel_karen"`, () => {
            expect(onlyForPlaceholder(org)).toBe("e.g., daniel_karen")
        })
    }
})

// ── Multi-tenant phase 1 (lane 3): the hint names the tenant's own slot ──
describe("P1 tenant-driven: TemplateEditor rabbi-slot hint", () => {
    afterEach(() => {
        cleanup()
        clearPrimedOrgConfigs()
    })

    it("a third tenant's first rabbi slot key", async () => {
        const { primeTestOrg } = await import("@/lib/org/__tests__/test-org-config")
        const cfg = primeTestOrg({
            liturgy: { ...codeOrgConfig("crc")!.liturgy, rabbiSlots: [{ key: "rav_cohen", label: "Rav Cohen", match: ["cohen"] }] },
        })
        expect(onlyForPlaceholder("testshul", cfg)).toBe("e.g., rav_cohen")
    })
})
