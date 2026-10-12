import { afterEach, describe, expect, it, vi } from "vitest"
import { renderHook } from "@testing-library/react"
import type { ReactNode } from "react"

/**
 * Multi-tenant phase 1 golden (lane 3, surface 5): the service types the
 * creation wizard offers. At e0ad18b4 every tenant got the whole template
 * catalogue, in catalogue order.
 */
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { uid: "u1" } }) }))
vi.mock("@/lib/setlist-firebase", () => ({
    createSetlistService: () => ({ createSetlist: vi.fn(), findLastMatchingService: vi.fn().mockResolvedValue(null), cloneSetlist: vi.fn() }),
}))
vi.mock("@/lib/scheduling-firebase", () => ({ assignMusicians: vi.fn() }))
vi.mock("@/lib/library-store", () => ({ useLibraryStore: { getState: () => ({ allFiles: [] }) } }))
vi.mock("@/lib/template-firebase", () => ({ useCustomTemplates: () => ({ overrides: {} }) }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), loading: vi.fn(), dismiss: vi.fn() } }))

import { OrgProvider } from "@/lib/org/org-context"
import { codeOrgConfig } from "@/lib/org/config-code"
import { clearPrimedOrgConfigs } from "@/lib/org/config-cache"
import type { OrgConfig } from "@/lib/org/config-schema"
import { useCreationWizard } from "@/hooks/use-creation-wizard"

const GOLDEN_KEYS = [
    "friday_night",
    "shir_shabbat",
    "shabbat_morning",
    "bnei_mitzvah_saturday",
    "havdalah_bnei_mitzvah",
    "rosh_hashanah_evening",
    "rosh_hashanah_morning",
    "yom_kippur_kol_nidre",
    "yom_kippur_morning",
    "yom_kippur_afternoon",
    "sukkot",
    "simchat_torah",
    "passover",
    "shavuot",
]

function keysFor(orgId: string, config: OrgConfig | null = codeOrgConfig(orgId)): string[] {
    const wrapper = ({ children }: { children: ReactNode }) => (
        <OrgProvider orgId={orgId} config={config}>
            {children}
        </OrgProvider>
    )
    const { result } = renderHook(() => useCreationWizard(), { wrapper })
    return result.current.templateKeys
}

describe("P1 golden: creation wizard service types", () => {
    afterEach(() => clearPrimedOrgConfigs())

    for (const org of ["crc", "brotherslazaroff"]) {
        it(`${org}: the whole template catalogue`, () => {
            expect(keysFor(org)).toEqual(GOLDEN_KEYS)
        })
    }
})

// ── Multi-tenant phase 1 (lane 3): a third tenant's own service types ──
describe("P1 tenant-driven: creation wizard service types", () => {
    afterEach(() => clearPrimedOrgConfigs())

    it("offers only the tenant's service types, in its order", async () => {
        const { primeTestOrg } = await import("@/lib/org/__tests__/test-org-config")
        const cfg = primeTestOrg({
            liturgy: {
                ...codeOrgConfig("crc")!.liturgy,
                serviceTypes: [
                    { key: "shabbat_morning", label: "Shacharit", defaultStart: "" },
                    { key: "friday_night", label: "Kabbalat Shabbat", defaultStart: "" },
                ],
            },
        })
        expect(keysFor("testshul", cfg)).toEqual(["shabbat_morning", "friday_night"])
    })
})
