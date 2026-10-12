import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { installFetch, summary } from "./helpers"

vi.mock("@/lib/api-client", () => ({ apiFetch: (p: string, i?: RequestInit) => fetch(p, i) }))

import { TenantsList } from "../TenantsList"

afterEach(() => cleanup())

describe("Platform tenants list", () => {
    it("shows one row per tenant with address, status, members and features", async () => {
        installFetch([["GET", /^\/api\/platform\/tenants$/, () => ({
            body: [
                summary(),
                summary({ orgId: "bl", name: "Brothers Lazaroff", status: "suspended", primaryAddress: "www.brotherslazaroff.live", pendingCount: 0, memberCount: 5, featuresOn: [] }),
            ],
        })]])
        render(<TenantsList />)
        const link = await screen.findByRole("link", { name: "Probe Tenant" })
        expect(link.getAttribute("href")).toBe("/platform/tenants/mtprobe")
        expect(screen.getByRole("link", { name: "mtprobe.vercel.app" }).getAttribute("href")).toBe("https://mtprobe.vercel.app")
        expect(screen.getByText("+1 waiting")).toBeTruthy()
        expect(screen.getByText("Perform mode")).toBeTruthy()
        expect(screen.getByText("Suspended")).toBeTruthy()
        expect(screen.getByText("None")).toBeTruthy()
        expect(screen.getByRole("link", { name: /New tenant/ }).getAttribute("href")).toBe("/platform/new")
    })

    it("shows the route's error", async () => {
        installFetch([["GET", /^\/api\/platform\/tenants$/, () => ({ status: 403, body: { error: "Only the platform owner" } })]])
        render(<TenantsList />)
        expect((await screen.findByRole("alert")).textContent).toBe("Only the platform owner")
    })
})
