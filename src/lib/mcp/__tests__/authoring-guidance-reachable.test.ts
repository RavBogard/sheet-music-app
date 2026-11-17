// @vitest-environment node
/**
 * The authoring agent is told only about steps it can take. CRC's agent guide
 * (served as the MCP `instructions`) and the authoring tools' descriptions
 * must not send it to an ops-surface tool (flag_bond, review_flagged_bonds)
 * or to the retired family baton board. notify_band's description must match
 * the code: a real send with no `recipients` refuses (recipients_required).
 */
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }))
vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: vi.fn(() => false),
    getFirestore: vi.fn(() => {
        throw new Error("no Firestore here")
    }),
    getAuth: vi.fn(),
    getStorage: vi.fn(),
}))
vi.mock("@/lib/mcp/auth", () => ({
    verifyBearer: vi.fn(async () => ({ uid: "guide-user", tokenId: "tok", parentTokenId: null, orgId: "crc", kind: null, allowedTools: null })),
}))
vi.mock("@/lib/org/access", () => ({ listTenantMembers: vi.fn(async () => []) }))
vi.mock("@/lib/org/get-org-config", async () => {
    const { codeOrgConfig } = await import("@/lib/org/config-code")
    return { getOrgConfig: vi.fn(async (orgId: string) => codeOrgConfig(orgId)) }
})

import { buildMcpHandler } from "@/lib/mcp/build-handler"
import { notifyRecommendation } from "@/lib/mcp/tools/preview-publish"
import { listTools, readInitialize } from "./helpers/mcp-rpc"

const UNREACHABLE = ["flag_bond", "review_flagged_bonds"]

describe("authoring guidance names only reachable steps", () => {
    const authoring = buildMcpHandler("authoring", "/api")

    it("CRC's instructions name no ops-only bond tool and no baton board", async () => {
        const init = await readInitialize(authoring, { orgHeader: "crc" })
        const text = init.instructions as string
        for (const name of UNREACHABLE) expect(text).not.toContain(name)
        expect(text).not.toContain("STATUS.md")
        expect(text).not.toMatch(/baton board/i)
    })

    it("the ops-only bond tools are not on the authoring surface", async () => {
        const tools = await listTools(authoring, { orgHeader: "crc" })
        const names = tools.map((t) => t.name)
        for (const name of UNREACHABLE) expect(names).not.toContain(name)
    })

    it("preview_notify_band and notify_band descriptions point at no ops-only tool", async () => {
        const tools = await listTools(authoring, { orgHeader: "crc" })
        for (const toolName of ["preview_notify_band", "notify_band"]) {
            const t = tools.find((x) => x.name === toolName)
            expect(t, toolName).toBeDefined()
            for (const name of UNREACHABLE) expect(t!.description).not.toContain(name)
        }
    })

    it("notify_band's description says a send without recipients is refused", async () => {
        const tools = await listTools(authoring, { orgHeader: "crc" })
        const d = tools.find((x) => x.name === "notify_band")!.description
        expect(d).toContain("recipients_required")
        expect(d).not.toMatch(/By default, recipients are every active/)
    })
})

describe("notifyRecommendation", () => {
    const clean = { missingCount: 0, shortcutUnresolvedCount: 0, unbondedSongCount: 0 }

    it("send when nothing needs the author", () => {
        expect(notifyRecommendation(clean)).toBe("send")
    })

    it("review_first when a song row has no chart", () => {
        expect(notifyRecommendation({ ...clean, unbondedSongCount: 1 })).toBe("review_first")
    })

    it("hard_block on a missing or unresolved-shortcut chart, over review_first", () => {
        expect(notifyRecommendation({ ...clean, missingCount: 1, unbondedSongCount: 2 })).toBe("hard_block")
        expect(notifyRecommendation({ ...clean, shortcutUnresolvedCount: 1 })).toBe("hard_block")
    })
})
