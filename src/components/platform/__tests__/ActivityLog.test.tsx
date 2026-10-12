import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { installFetch, summary } from "./helpers"

vi.mock("@/lib/api-client", () => ({ apiFetch: (p: string, i?: RequestInit) => fetch(p, i) }))

import { ActivityLog } from "../ActivityLog"

afterEach(() => cleanup())

const row = (id: string, orgId: string | null, via: "console" | "claude") => ({
    id, at: "2026-10-12T15:00:00.000Z", actorUid: "po", actorEmail: "daniel@example.org", via,
    action: "set_tenant_features", orgId, before: { mixer: false }, after: { mixer: true },
})

describe("Platform activity", () => {
    it("lists audit rows and filters by tenant", async () => {
        const f = installFetch([
            ["GET", /^\/api\/platform\/tenants$/, () => ({ body: [summary()] })],
            ["GET", /^\/api\/platform\/activity$/, (c) => ({
                body: c.query.get("orgId") === "mtprobe" ? [row("a2", "mtprobe", "console")] : [row("a1", "mtprobe", "claude"), row("a3", null, "console")],
            })],
        ])
        const user = userEvent.setup()
        render(<ActivityLog />)
        expect(await screen.findByText("Claude")).toBeTruthy()
        expect(screen.getByText("Platform")).toBeTruthy()
        expect(f.find("GET", /activity/)[0].query.get("limit")).toBe("100")

        await user.click(screen.getAllByRole("button", { name: "Details" })[0])
        expect(screen.getByText(/"mixer": true/)).toBeTruthy()

        await screen.findByRole("option", { name: "Probe Tenant" })
        await user.selectOptions(screen.getByRole("combobox", { name: "Tenant" }), "mtprobe")
        await waitFor(() => expect(f.find("GET", /activity/).at(-1)!.query.get("orgId")).toBe("mtprobe"))
        await waitFor(() => expect(screen.queryByText("Claude")).toBeNull())
        expect(screen.getByText("Console")).toBeTruthy()
    })

    it("shows the route's error", async () => {
        installFetch([
            ["GET", /^\/api\/platform\/tenants$/, () => ({ body: [] })],
            ["GET", /^\/api\/platform\/activity$/, () => ({ status: 500, body: { error: "Audit read failed" } })],
        ])
        render(<ActivityLog />)
        expect((await screen.findByRole("alert")).textContent).toBe("Audit read failed")
    })
})
