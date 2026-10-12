import { describe, expect, it, vi } from "vitest"
import * as Tools from "../tools"
import { registerPlatformTools } from "../platform/tools"
import { READ_TOOLS, WRITE_TOOLS } from "../tool-access"
import { forSurface } from "../surfaces"

/**
 * Multi-tenant phase 4: every registered MCP tool is classified READ or WRITE
 * (explicitly, never by name), and a read-only "view as" bearer reaches READ
 * tools only — enforced once, in the registration wrapper.
 */

function captureAll(): string[] {
    const names: string[] = []
    const server = {
        registerTool(name: string) {
            names.push(name)
        },
        registerResource() {},
        registerPrompt() {},
    } as never
    for (const [k, fn] of Object.entries(Tools)) {
        if (k.startsWith("register") && typeof fn === "function") (fn as (s: unknown) => void)(server)
    }
    registerPlatformTools(server)
    return names
}

describe("tool classification", () => {
    const all = captureAll()

    it("captures the whole registry (guards against a vacuous pass)", () => {
        expect(all.length).toBeGreaterThan(150)
    })

    it("every registered tool is READ or WRITE", () => {
        const unclassified = all.filter((n) => !READ_TOOLS.has(n) && !WRITE_TOOLS.has(n))
        expect(unclassified).toEqual([])
    })

    it("no tool is both", () => {
        expect([...READ_TOOLS].filter((n) => WRITE_TOOLS.has(n))).toEqual([])
    })

    it("the lists name no tool that does not exist", () => {
        const registered = new Set(all)
        expect([...READ_TOOLS, ...WRITE_TOOLS].filter((n) => !registered.has(n))).toEqual([])
    })

    it("tools that look like reads but write are classified as writes", () => {
        for (const t of ["verify_setlist_charts", "propose_liturgy_bindings", "propose_service_frame", "generate_gig_packet", "propose_setlist_changes"])
            expect(WRITE_TOOLS.has(t), t).toBe(true)
    })
})

describe("read-only bearer gate (forSurface)", () => {
    function setup() {
        const handlers = new Map<string, (...a: unknown[]) => unknown>()
        const server = {
            registerTool(name: string, _config: unknown, handler: (...a: unknown[]) => unknown) {
                handlers.set(name, handler)
            },
        }
        const s = forSurface(server as never, "authoring")
        const write = vi.fn(async () => ({ content: [{ type: "text", text: "wrote" }] }))
        const read = vi.fn(async () => ({ content: [{ type: "text", text: "read" }] }))
        const noArgs = vi.fn(async () => ({ content: [] }))
        s.registerTool("create_setlist", {} as never, write as never)
        s.registerTool("list_setlists", {} as never, read as never)
        s.registerTool("notify_band", {} as never, noArgs as never)
        return { handlers, write, read, noArgs }
    }
    const viewAs = { authInfo: { extra: { uid: "po", orgId: "nava", kind: "view_as" } } }
    const normal = { authInfo: { extra: { uid: "po", orgId: "crc", kind: null } } }

    it("refuses a write tool for a view-as bearer, without calling it", async () => {
        const { handlers, write } = setup()
        const r = (await handlers.get("create_setlist")!({ name: "x" }, viewAs)) as { isError?: boolean; content: Array<{ text: string }> }
        expect(r.isError).toBe(true)
        expect(JSON.parse(r.content[0].text).error.machine_code).toBe("read_only_token")
        expect(write).not.toHaveBeenCalled()
    })

    it("refuses a handler registered without an input schema too (extra is its only argument)", async () => {
        const { handlers, noArgs } = setup()
        const r = (await handlers.get("notify_band")!(viewAs)) as { isError?: boolean }
        expect(r.isError).toBe(true)
        expect(noArgs).not.toHaveBeenCalled()
    })

    it("lets a view-as bearer read", async () => {
        const { handlers, read } = setup()
        await handlers.get("list_setlists")!({}, viewAs)
        expect(read).toHaveBeenCalledOnce()
    })

    it("an ordinary bearer writes as before", async () => {
        const { handlers, write } = setup()
        await handlers.get("create_setlist")!({ name: "x" }, normal)
        expect(write).toHaveBeenCalledOnce()
    })

    it("readOnly: true on the extra also counts", async () => {
        const { handlers, write } = setup()
        const r = (await handlers.get("create_setlist")!({}, { authInfo: { extra: { uid: "po", readOnly: true } } })) as { isError?: boolean }
        expect(r.isError).toBe(true)
        expect(write).not.toHaveBeenCalled()
    })
})
