// @vitest-environment node
/**
 * Multi-tenant phase 4 — GOLDEN: the MCP `instructions` CRC's connector is
 * served. Written against the unchanged code (one agent guide for everyone) and
 * kept through the per-tenant guide: a CRC token must still get the captured
 * text byte-for-byte. The capture file is `serverInfo=<json>\n<instructions>\n`
 * (scripts/dev/golden-http-capture.mjs); only CRLF is normalised (the repo
 * stores LF, a Windows checkout has CRLF).
 */
import fs from "node:fs"
import path from "node:path"
import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/logger", () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))
vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: vi.fn(() => false),
    getFirestore: vi.fn(() => {
        throw new Error("no Firestore in the initialize path")
    }),
    getAuth: vi.fn(),
    getStorage: vi.fn(),
}))
vi.mock("@/lib/mcp/auth", () => ({
    verifyBearer: vi.fn(async () => ({
        uid: "golden-crc-user",
        tokenId: "tok-golden",
        parentTokenId: null,
        orgId: "crc",
        kind: null,
        allowedTools: null,
    })),
}))

import { buildMcpHandler } from "@/lib/mcp/build-handler"
import { readInitialize } from "@/lib/mcp/__tests__/helpers/mcp-rpc"

const GOLDEN = path.join(
    process.cwd(),
    "docs/planning/2026-10-12-multitenant/golden/http-before/crc/mcp_instructions.txt",
)

function goldenCapture(): { serverInfo: unknown; instructions: string } {
    const raw = fs.readFileSync(GOLDEN, "utf8").replace(/\r\n/g, "\n")
    const nl = raw.indexOf("\n")
    const first = raw.slice(0, nl)
    expect(first.startsWith("serverInfo=")).toBe(true)
    const rest = raw.slice(nl + 1)
    expect(rest.endsWith("\n")).toBe(true)
    return { serverInfo: JSON.parse(first.slice("serverInfo=".length)), instructions: rest.slice(0, -1) }
}

describe("golden: CRC's served MCP instructions", () => {
    it("a crc token on www.centralreform.live gets the captured instructions byte-for-byte", async () => {
        const handler = buildMcpHandler("authoring", "/api")
        const init = await readInitialize(handler, { host: "www.centralreform.live", orgHeader: "crc" })
        const golden = goldenCapture()
        expect(init.serverInfo).toEqual(golden.serverInfo)
        expect(typeof init.instructions).toBe("string")
        expect((init.instructions as string).replace(/\r\n/g, "\n")).toBe(golden.instructions)
    })
})
