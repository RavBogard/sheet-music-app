import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { OrgConfigSchema } from "@/lib/org/config-schema"
import { installFetch, summary } from "./helpers"

const push = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => "/platform/new" }))
vi.mock("@/lib/api-client", () => ({ apiFetch: (p: string, i?: RequestInit) => fetch(p, i) }))

import { buildCreateInput, NewTenantForm, validateNewTenant, type NewTenantValues } from "../NewTenantForm"

afterEach(() => { cleanup(); push.mockReset() })

const V: NewTenantValues = {
    orgId: "beth-shalom", name: "Temple Beth Shalom", shortName: "Beth Shalom", kind: "shul",
    language: "he", timeZone: "Asia/Jerusalem", subdomain: "beth-shalom", copyLiturgyFrom: "crc",
}

describe("New tenant: building the config", () => {
    it("the basics make a config the schema accepts", () => {
        const input = buildCreateInput(V)
        const r = OrgConfigSchema.safeParse({ id: V.orgId, ...input.config })
        expect(r.success).toBe(true)
        expect(input.subdomain).toBe("beth-shalom")
        expect(input.copyLiturgyFrom).toBe("crc")
        expect(input.config.locale).toMatchObject({ language: "he", direction: "rtl", timeZone: "Asia/Jerusalem" })
        expect(input.config.branding).toMatchObject({ shortName: "Beth Shalom", abbreviation: "BS", baseUrl: "https://beth-shalom.vercel.app" })
    })

    it("refuses a bad id, empty name and an unknown time zone", () => {
        const e = validateNewTenant({ ...V, orgId: "Beth Shalom", name: " ", timeZone: "Mars/Olympus" })
        expect(Object.keys(e).sort()).toEqual(["name", "orgId", "timeZone"])
    })
})

describe("New tenant form", () => {
    const fill = async (user: ReturnType<typeof userEvent.setup>) => {
        await user.type(screen.getByLabelText("Name"), "Temple Beth Shalom")
        await user.type(screen.getByLabelText("Tenant id"), "beth-shalom")
        await screen.findByRole("option", { name: "CRC" })
        await user.selectOptions(screen.getByLabelText("Copy liturgy frames and books from"), "crc")
    }

    it("Preview is a dry run; Create sends it for real and opens the tenant", async () => {
        const f = installFetch([
            ["GET", /^\/api\/platform\/tenants$/, () => ({ body: [summary({ orgId: "crc", name: "CRC" })] })],
            ["POST", /^\/api\/platform\/tenants$/, () => ({
                body: { dryRun: true, changed: true, before: null, after: null, diff: [], address: "beth-shalom.vercel.app", nextSteps: ["Invite the first admin"] },
            })],
        ])
        const user = userEvent.setup()
        render(<NewTenantForm />)
        await fill(user)
        expect((screen.getByLabelText("Default address") as HTMLInputElement).value).toBe("beth-shalom")
        await user.click(screen.getByRole("button", { name: "Preview" }))

        const preview = await screen.findByTestId("create-preview")
        expect(preview.textContent).toContain("beth-shalom.vercel.app")
        expect(preview.textContent).toContain("Invite the first admin")
        const posts = f.find("POST", /^\/api\/platform\/tenants$/)
        expect(posts[0].query.get("dryRun")).toBe("1")
        expect(posts[0].body).toMatchObject({ orgId: "beth-shalom", subdomain: "beth-shalom", copyLiturgyFrom: "crc" })
        expect(push).not.toHaveBeenCalled()

        await user.click(screen.getByRole("button", { name: "Create Temple Beth Shalom" }))
        await waitFor(() => expect(push).toHaveBeenCalledWith("/platform/tenants/beth-shalom"))
        expect(f.find("POST", /^\/api\/platform\/tenants$/)[1].query.get("dryRun")).toBe("0")
    })

    it("invalid input never reaches the route", async () => {
        const f = installFetch([["GET", /^\/api\/platform\/tenants$/, () => ({ body: [] })]])
        const user = userEvent.setup()
        render(<NewTenantForm />)
        await user.type(screen.getByLabelText("Tenant id"), "Bad Id")
        await user.click(screen.getByRole("button", { name: "Preview" }))
        expect(screen.getByLabelText("Name").getAttribute("aria-invalid")).toBe("true")
        expect(f.find("POST", /tenants/)).toHaveLength(0)
    })

    it("shows the route's error", async () => {
        installFetch([
            ["GET", /^\/api\/platform\/tenants$/, () => ({ body: [summary({ orgId: "crc", name: "CRC" })] })],
            ["POST", /^\/api\/platform\/tenants$/, () => ({ status: 409, body: { error: "orgs/beth-shalom already exists" } })],
        ])
        const user = userEvent.setup()
        render(<NewTenantForm />)
        await fill(user)
        await user.click(screen.getByRole("button", { name: "Preview" }))
        expect((await screen.findByRole("alert")).textContent).toBe("orgs/beth-shalom already exists")
    })
})
