import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("@/components/platform/api", () => ({
    platformApi: { mintPlatformToken: vi.fn(async () => ({ id: "t1", token: "crl_plat_abc" })) },
    errorText: (e: unknown) => String(e),
}))

import { PlatformKeyCard } from "@/components/platform/PlatformKeyCard"
import { platformApi } from "@/components/platform/api"

describe("PlatformKeyCard (multi-tenant phase 4)", () => {
    it("mints a platform key and shows it once", async () => {
        render(<PlatformKeyCard />)
        expect(screen.getByText(/api\/platform\/mcp/)).toBeTruthy()
        await userEvent.click(screen.getByRole("button", { name: /Make platform key/ }))
        expect(await screen.findByTestId("platform-key")).toHaveProperty("textContent", "crl_plat_abc")
        expect(platformApi.mintPlatformToken).toHaveBeenCalledWith("Platform (Claude)")
    })
})
