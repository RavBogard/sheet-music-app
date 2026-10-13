// @vitest-environment node
/**
 * Multi-tenant phase 6 GOLDEN — the MCP tool lists, sorted, as they were
 * BEFORE the feature flags were enforced (captured on master 96e937d6 + the
 * phase 6 contract commit, which changes no behaviour):
 *   - authoring list for a crc token and a brotherslazaroff token
 *   - the ops list (one handler, not dispatched by tenant)
 *
 * After phase 6: crc and ops identical; BL = before minus ONLY the tools of
 * features BL does not use (P6-BL-FLAGS.md), listed in BL_DROPPED_P6. (The
 * fixture was written, and this test passed with BL equal to it, on the
 * unchanged code at 530beb83.)
 *
 * Regenerate (only before the change): P6_WRITE_GOLDEN=1 npx vitest run <this file>
 */
import fs from "node:fs"
import path from "node:path"
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
const state = vi.hoisted(() => ({ orgId: "crc" as string }))
vi.mock("@/lib/mcp/auth", () => ({
    verifyBearer: vi.fn(async () => ({ uid: "golden-user", tokenId: "tok", parentTokenId: null, orgId: state.orgId, kind: null, allowedTools: null })),
}))
vi.mock("@/lib/org/access", () => ({ listTenantMembers: vi.fn(async () => []) }))
vi.mock("@/lib/org/get-org-config", async () => {
    const { codeOrgConfig } = await import("@/lib/org/config-code")
    return { getOrgConfig: vi.fn(async (orgId: string) => codeOrgConfig(orgId)) }
})

import { buildMcpHandler } from "@/lib/mcp/build-handler"
import { listToolNames } from "./helpers/mcp-rpc"

/** The tools phase 6 removes from BL's authoring list, by feature. */
export const BL_DROPPED_P6 = [
    // mixer (CRC-only; the 7 bridge_* recovery tools are on ops, not authoring)
    "list_monitor_buses",
    "get_mix",
    "get_matrix",
    "set_send_level",
    "set_send_mute",
    "set_bus_fader",
    "set_matrix_fader",
    "set_matrix_mute",
    "get_command_status",
    "assign_monitor_bus",
    "unassign_monitor_bus",
    "get_bridge_health",
    // driveInbox
    "get_chart_inbox",
    "sync_chart_inbox",
]

export const P6_GOLDEN_PATH = path.join(__dirname, "fixtures", "p6-tool-lists-before.json")

const authoring = buildMcpHandler("authoring", "/api")
const ops = buildMcpHandler("ops", "/api/ops")

async function lists() {
    state.orgId = "crc"
    const crc = (await listToolNames(authoring, { orgHeader: "crc" })).slice().sort()
    state.orgId = "brotherslazaroff"
    const brotherslazaroff = (await listToolNames(authoring, { host: "www.brotherslazaroff.live", orgHeader: "brotherslazaroff" })).slice().sort()
    state.orgId = "crc"
    const opsList = (await listToolNames(ops, { orgHeader: "crc", path: "/api/ops/mcp" })).slice().sort()
    return { crc, brotherslazaroff, ops: opsList }
}

describe("phase 6 golden: MCP tool lists", () => {
    it("crc and ops are exactly the captured lists", async () => {
        const now = await lists()
        if (process.env.P6_WRITE_GOLDEN === "1") {
            fs.writeFileSync(P6_GOLDEN_PATH, JSON.stringify(now, null, 2) + "\n")
        }
        const golden = JSON.parse(fs.readFileSync(P6_GOLDEN_PATH, "utf8")) as typeof now
        expect(now.crc).toEqual(golden.crc)
        expect(now.ops).toEqual(golden.ops)
        // Phase 6: BL = today's list minus ONLY the tools of the features BL
        // does not use (P6-BL-FLAGS.md): mixer (its 12 authoring tools) and
        // driveInbox. Nothing else may differ.
        const blDropped = new Set(BL_DROPPED_P6)
        expect(now.brotherslazaroff).toEqual(golden.brotherslazaroff.filter((t) => !blDropped.has(t)))
        for (const t of BL_DROPPED_P6) expect(golden.brotherslazaroff, t).toContain(t)
    })
})
