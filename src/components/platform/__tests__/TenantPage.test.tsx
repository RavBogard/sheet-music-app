import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { detail, dryResult, installFetch, polyfillDom, summary } from "./helpers"

vi.mock("@/lib/api-client", () => ({ apiFetch: (p: string, i?: RequestInit) => fetch(p, i) }))

import { TenantPage } from "../TenantPage"

beforeAll(polyfillDom)
afterEach(() => cleanup())

const T = /^\/api\/platform\/tenants\/mtprobe$/

function base(extra: Parameters<typeof installFetch>[0] = [], d = detail()) {
    return installFetch([
        ...extra,
        ["GET", T, () => ({ body: d })],
        ["GET", /^\/api\/platform\/tenants\/mtprobe\/members$/, () => ({ body: [] })],
        ["GET", /^\/api\/platform\/tenants\/mtprobe\/invites$/, () => ({ body: [] })],
        ["GET", /^\/api\/platform\/collections$/, () => ({ body: [] })],
        ["GET", /^\/api\/platform\/tenants$/, () => ({ body: [summary()] })],
    ])
}

const section = (name: string) => screen.getByRole("region", { name })
const loaded = () => screen.findByRole("heading", { name: "Probe Tenant" })

describe("Tenant page: Identity", () => {
    it("Save shows the dry-run diff; Apply sends the same patch for real and reloads", async () => {
        const f = base([["PATCH", T, (c) => ({ body: dryResult([{ path: "name", before: "Probe Tenant", after: "Probe Two" }], c.query.get("dryRun") === "1") })]])
        const user = userEvent.setup()
        render(<TenantPage orgId="mtprobe" />)
        await loaded()
        const id = section("Identity")
        const name = within(id).getByLabelText("Name")
        await user.clear(name)
        await user.type(name, "Probe Two")
        await user.click(within(id).getByRole("button", { name: "Save" }))

        const preview = await within(id).findByTestId("diff-preview")
        expect(within(preview).getByText("Probe Two")).toBeTruthy()
        const patches = f.find("PATCH", T)
        expect(patches).toHaveLength(1)
        expect(patches[0].query.get("dryRun")).toBe("1")
        expect(patches[0].body).toEqual({ patch: { name: "Probe Two" } })

        const gets = f.find("GET", T).length
        await user.click(within(preview).getByRole("button", { name: "Apply" }))
        await waitFor(() => expect(f.find("PATCH", T)).toHaveLength(2))
        expect(f.find("PATCH", T)[1].query.get("dryRun")).toBe("0")
        expect(f.find("PATCH", T)[1].body).toEqual(patches[0].body)
        await waitFor(() => expect(f.find("GET", T).length).toBeGreaterThan(gets))
    })

    it("schema errors stop the save and show under the field", async () => {
        const f = base()
        const user = userEvent.setup()
        render(<TenantPage orgId="mtprobe" />)
        await loaded()
        const id = section("Identity")
        await user.clear(within(id).getByLabelText("Short name"))
        await user.click(within(id).getByRole("button", { name: "Save" }))
        expect(within(id).getByLabelText("Short name").getAttribute("aria-invalid")).toBe("true")
        expect(f.find("PATCH", T)).toHaveLength(0)
    })

    it("a route error is shown", async () => {
        base([["PATCH", T, () => ({ status: 400, body: { error: "timeZone: not a zone" } })]])
        const user = userEvent.setup()
        render(<TenantPage orgId="mtprobe" />)
        await loaded()
        const id = section("Identity")
        await user.type(within(id).getByLabelText("Tagline"), "x")
        await user.click(within(id).getByRole("button", { name: "Save" }))
        expect((await within(id).findByRole("alert")).textContent).toBe("timeZone: not a zone")
    })
})

describe("Tenant page: Features and Status", () => {
    it("switches preview then apply", async () => {
        const F = /^\/api\/platform\/tenants\/mtprobe\/features$/
        const f = base([["POST", F, () => ({ body: dryResult([{ path: "mixer", before: false, after: true }]) })]])
        const user = userEvent.setup()
        render(<TenantPage orgId="mtprobe" />)
        await loaded()
        const s = section("Features")
        expect(within(s).getAllByRole("switch")).toHaveLength(6)
        await user.click(within(s).getByRole("switch", { name: "Mixer" }))
        await user.click(within(s).getByRole("button", { name: "Save features" }))
        await within(s).findByTestId("diff-preview")
        expect(f.find("POST", F)[0].query.get("dryRun")).toBe("1")
        expect((f.find("POST", F)[0].body as { features: { mixer: boolean } }).features.mixer).toBe(true)
        await user.click(within(s).getByRole("button", { name: "Apply" }))
        await waitFor(() => expect(f.find("POST", F)[1]?.query.get("dryRun")).toBe("0"))
    })

    it("suspending asks for confirmation naming the tenant", async () => {
        const S = /^\/api\/platform\/tenants\/mtprobe\/status$/
        const f = base([["POST", S, () => ({ body: dryResult([{ path: "status", before: "active", after: "suspended" }]) })]])
        const user = userEvent.setup()
        render(<TenantPage orgId="mtprobe" />)
        await loaded()
        const s = section("Status")
        await user.click(within(s).getByRole("button", { name: "Suspend tenant" }))
        await user.click(await within(s).findByRole("button", { name: "Suspend" }))
        const dialog = await screen.findByRole("alertdialog")
        expect(within(dialog).getByText("Suspend Probe Tenant?")).toBeTruthy()
        expect(f.find("POST", S)).toHaveLength(1)
        await user.click(within(dialog).getByRole("button", { name: "Suspend Probe Tenant" }))
        await waitFor(() => expect(f.find("POST", S)).toHaveLength(2))
        expect(f.find("POST", S)[1].query.get("dryRun")).toBe("0")
        expect(f.find("POST", S)[1].body).toEqual({ status: "suspended" })
    })
})

describe("Tenant page: Addresses", () => {
    const records = [{ type: "A", host: "@", name: "ex.org", value: "76.76.21.21", purpose: "bare" }]

    it("shows DNS records; Check again updates the chip", async () => {
        // The check records the new status on the tenant, so the reload after "live" reads it too.
        const d = detail({ domainStatus: { "ex.org": { apex: "ex.org", www: "www.ex.org", status: "waiting_for_dns", records, addedAt: 1, checkedAt: 1 } } })
        const f = base(
            [["GET", /^\/api\/platform\/tenants\/mtprobe\/domains\/ex\.org$/, () => {
                d.domainStatus = { "ex.org": { apex: "ex.org", www: "www.ex.org", status: "live", records, addedAt: 1, checkedAt: 2 } }
                return { body: { orgId: "mtprobe", apex: "ex.org", www: "www.ex.org", status: "live", records, instructions: "", primary: "www.ex.org" } }
            }]],
            d,
        )
        const user = userEvent.setup()
        render(<TenantPage orgId="mtprobe" />)
        await loaded()
        const s = section("Addresses")
        expect(within(s).getByText("Waiting for DNS")).toBeTruthy()
        expect(within(s).getByText("76.76.21.21")).toBeTruthy()
        await user.click(within(s).getByRole("button", { name: "Check again" }))
        expect(await within(section("Addresses")).findByText("Live")).toBeTruthy()
        expect(f.find("GET", /domains\/ex\.org/)).toHaveLength(1)
    })

    it("adds a custom domain and shows the steps", async () => {
        const D = /^\/api\/platform\/tenants\/mtprobe\/domains$/
        const f = base([["POST", D, () => ({
            body: { orgId: "mtprobe", apex: "new.org", www: "www.new.org", status: "waiting_for_dns", records, instructions: "1. Sign in to your registrar.", primary: "mtprobe.vercel.app" },
        })]])
        const user = userEvent.setup()
        render(<TenantPage orgId="mtprobe" />)
        await loaded()
        const s = section("Addresses")
        await user.type(within(s).getByLabelText("Add custom domain"), "new.org")
        await user.click(within(s).getByRole("button", { name: "Add domain" }))
        expect(await within(s).findByText("1. Sign in to your registrar.")).toBeTruthy()
        expect(f.find("POST", D)[0].body).toEqual({ domain: "new.org" })
    })
})

describe("Tenant page: People", () => {
    const members = [
        { uid: "u1", name: "Alex", email: "alex@x.org", role: "admin", soundEngineer: false, lastSeen: null },
        { uid: "u2", name: "Pat", email: null, role: "pending", soundEngineer: false, lastSeen: null },
    ]
    const M = /^\/api\/platform\/tenants\/mtprobe\/members$/

    it("role change previews then applies; remove confirms naming the tenant", async () => {
        const f = installFetch([
            ["GET", T, () => ({ body: detail() })],
            ["GET", M, () => ({ body: members })],
            ["POST", M, () => ({ body: dryResult([{ path: "role", before: "admin", after: "musician" }]) })],
            ["DELETE", M, () => ({ body: dryResult([{ path: "role", before: "admin", after: null }]) })],
            ["GET", /invites$/, () => ({ body: [] })],
            ["GET", /^\/api\/platform\/collections$/, () => ({ body: [] })],
            ["GET", /^\/api\/platform\/tenants$/, () => ({ body: [] })],
        ])
        const user = userEvent.setup()
        render(<TenantPage orgId="mtprobe" />)
        await screen.findByText("Alex")
        const s = section("People")
        expect(within(s).getByText("Pat")).toBeTruthy()

        await user.selectOptions(within(s).getByRole("combobox", { name: "Role for Alex" }), "musician")
        await within(s).findByTestId("diff-preview")
        expect(f.find("POST", M)[0]).toMatchObject({ body: { uid: "u1", role: "musician" } })
        expect(f.find("POST", M)[0].query.get("dryRun")).toBe("1")
        await user.click(within(s).getByRole("button", { name: "Apply" }))
        await waitFor(() => expect(f.find("POST", M)[1]?.query.get("dryRun")).toBe("0"))

        await user.click(within(section("People")).getAllByRole("button", { name: "Remove" })[0])
        const dialog = await screen.findByRole("alertdialog")
        expect(within(dialog).getByText("Remove Alex from Probe Tenant?")).toBeTruthy()
        expect(f.find("DELETE", M)[0].query.get("dryRun")).toBe("1")
        await user.click(within(dialog).getByRole("button", { name: "Remove" }))
        await waitFor(() => expect(f.find("DELETE", M)[1]?.query.get("dryRun")).toBe("0"))
        expect(f.find("DELETE", M)[1].body).toEqual({ uid: "u1" })
    })

    it("invite admin: preview, create, then the link to copy", async () => {
        const I = /^\/api\/platform\/tenants\/mtprobe\/invites$/
        const invite = { id: "i1", orgId: "mtprobe", email: "rabbi@x.org", role: "admin", link: "https://mtprobe.vercel.app/invite/tok", expiresAt: "2026-10-19T00:00:00Z" }
        const f = base([["POST", I, (c) => ({ body: { ...dryResult([{ path: "invite", before: null, after: "rabbi@x.org" }]), after: c.query.get("dryRun") === "0" ? invite : null } })]])
        const user = userEvent.setup()
        render(<TenantPage orgId="mtprobe" />)
        await loaded()
        const s = section("People")
        await user.type(within(s).getByLabelText("Invite admin"), "rabbi@x.org")
        await user.click(within(s).getByRole("button", { name: "Make invite link" }))
        await within(s).findByTestId("diff-preview")
        expect(f.find("POST", I)[0].body).toEqual({ email: "rabbi@x.org", role: "admin" })
        await user.click(within(s).getByRole("button", { name: "Create invite" }))
        expect(await within(s).findByText("https://mtprobe.vercel.app/invite/tok")).toBeTruthy()
    })
})

describe("Tenant page: Collections and View as", () => {
    it("assign previews then applies; unassign confirms naming the tenant", async () => {
        const cols = [
            { id: "nava", ownerOrgId: "nava", name: "nava", label: "Nava Tehila", visibility: "listed", sharedWith: ["mtprobe"], assignedTo: [] },
            { id: "core", ownerOrgId: "crc", name: "core", label: "CRC Core", visibility: "all", sharedWith: [], assignedTo: ["mtprobe"] },
            { id: "own", ownerOrgId: "mtprobe", name: "own", label: "Our charts", visibility: "private", sharedWith: [], assignedTo: [] },
        ]
        const C = /^\/api\/platform\/collections\/(nava|core)$/
        const f = installFetch([
            ["GET", T, () => ({ body: detail() })],
            ["GET", /members$/, () => ({ body: [] })],
            ["GET", /invites$/, () => ({ body: [] })],
            ["GET", /^\/api\/platform\/collections$/, () => ({ body: cols })],
            ["GET", /^\/api\/platform\/tenants$/, () => ({ body: [summary(), summary({ orgId: "crc", name: "CRC" })] })],
            ["POST", C, () => ({ body: dryResult([{ path: "assignedTo", before: [], after: ["mtprobe"] }]) })],
        ])
        const user = userEvent.setup()
        render(<TenantPage orgId="mtprobe" />)
        await screen.findByText("Nava Tehila")
        const s = section("Collections")
        expect(within(s).getByText("Our charts")).toBeTruthy()
        expect(within(s).getByText("From CRC")).toBeTruthy()

        await user.click(within(s).getByRole("button", { name: "Assign" }))
        await within(s).findByTestId("diff-preview")
        expect(f.find("POST", C)[0]).toMatchObject({ path: "/api/platform/collections/nava", body: { orgId: "mtprobe", assigned: true } })
        await user.click(within(s).getByRole("button", { name: "Apply" }))
        await waitFor(() => expect(f.find("POST", C)[1]?.query.get("dryRun")).toBe("0"))

        await user.click(within(section("Collections")).getByRole("button", { name: "Unassign" }))
        const dialog = await screen.findByRole("alertdialog")
        expect(within(dialog).getByText("Unassign CRC Core from Probe Tenant?")).toBeTruthy()
        await user.click(within(dialog).getByRole("button", { name: "Unassign" }))
        await waitFor(() => expect(f.find("POST", C).at(-1)).toMatchObject({ path: "/api/platform/collections/core", body: { assigned: false } }))
        expect(f.find("POST", C).at(-1)!.query.get("dryRun")).toBe("1")
    })

    it("owned collection sharing previews with the chosen tenants", async () => {
        const cols = [{ id: "own", ownerOrgId: "mtprobe", name: "own", label: "Our charts", visibility: "private", sharedWith: [], assignedTo: [] }]
        const f = installFetch([
            ["GET", T, () => ({ body: detail() })],
            ["GET", /members$/, () => ({ body: [] })],
            ["GET", /invites$/, () => ({ body: [] })],
            ["GET", /^\/api\/platform\/collections$/, () => ({ body: cols })],
            ["GET", /^\/api\/platform\/tenants$/, () => ({ body: [summary(), summary({ orgId: "crc", name: "CRC" })] })],
            ["PATCH", /^\/api\/platform\/collections\/own$/, () => ({ body: dryResult([{ path: "visibility", before: "private", after: "listed" }]) })],
        ])
        const user = userEvent.setup()
        render(<TenantPage orgId="mtprobe" />)
        await screen.findByText("Our charts")
        const s = section("Collections")
        await user.selectOptions(within(s).getByRole("combobox", { name: "Who can see Our charts" }), "listed")
        await user.click(within(s).getByRole("checkbox", { name: "CRC" }))
        await user.click(within(s).getByRole("button", { name: "Save sharing" }))
        await within(s).findByTestId("diff-preview")
        expect(f.find("PATCH", /collections\/own/)[0].body).toEqual({ visibility: "listed", sharedWith: ["crc"] })
    })

    it("view as: opens the address and shows a minted key once", async () => {
        const f = base([["POST", /^\/api\/platform\/view-bearer$/, () => ({ body: { token: "tok-123", tokenId: "t1", expiresAt: "2026-10-12T16:00:00Z" } })]])
        const user = userEvent.setup()
        render(<TenantPage orgId="mtprobe" />)
        await loaded()
        const s = section("View as this tenant")
        const open = within(s).getByRole("link", { name: /Open mtprobe.vercel.app/ })
        expect(open.getAttribute("href")).toBe("https://mtprobe.vercel.app")
        expect(open.getAttribute("target")).toBe("_blank")
        await user.selectOptions(within(s).getByRole("combobox", { name: "Key lasts" }), "15")
        await user.click(within(s).getByRole("button", { name: "Make view key" }))
        expect((await within(s).findByTestId("view-bearer")).textContent).toBe("tok-123")
        expect(f.find("POST", /view-bearer/)[0].body).toEqual({ orgId: "mtprobe", minutes: 15 })
        await user.click(within(s).getByRole("button", { name: "Hide" }))
        expect(within(s).queryByTestId("view-bearer")).toBeNull()
    })
})

describe("Tenant page: load error", () => {
    it("shows the error when the tenant cannot be read", async () => {
        installFetch([["GET", T, () => ({ status: 404, body: { error: "No such tenant" } })]])
        render(<TenantPage orgId="mtprobe" />)
        expect((await screen.findByRole("alert")).textContent).toBe("No such tenant")
    })
})
