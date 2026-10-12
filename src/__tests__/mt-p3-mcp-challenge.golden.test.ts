/**
 * Multi-tenant phase 3 — GOLDEN: the MCP 401 challenge on CRC/BL hosts.
 * Committed before the change; `resource_metadata` must stay byte-identical.
 */
import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/logger", () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))
vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: vi.fn(() => true),
    getFirestore: vi.fn(() => {
        throw new Error("no Firestore in the 401 path")
    }),
    getAuth: vi.fn(),
    getStorage: vi.fn(),
}))

import { buildMcpHandler } from "@/lib/mcp/build-handler"

const handler = buildMcpHandler("authoring", "/api")

describe("golden: /api/mcp unauthenticated challenge", () => {
    it.each([
        ["www.centralreform.live", "https://www.centralreform.live"],
        ["www.brotherslazaroff.live", "https://www.brotherslazaroff.live"],
        ["sheet-music-app.vercel.app", "https://sheet-music-app.vercel.app"],
    ])("%s", async (host, origin) => {
        const req = new Request("https://internal.vercel/api/mcp", {
            method: "POST",
            headers: {
                host,
                "x-forwarded-host": host,
                "x-forwarded-proto": "https",
                "content-type": "application/json",
                accept: "application/json, text/event-stream",
                "x-org-id": host.includes("brotherslazaroff") ? "brotherslazaroff" : "crc",
            },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
        })
        const res = await handler(req)
        expect(res.status).toBe(401)
        expect(res.headers.get("www-authenticate")).toBe(
            `Bearer error="invalid_token", error_description="No authorization provided", resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
        )
    })
})
