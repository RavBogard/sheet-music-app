import { describe, expect, it } from "vitest"
import type { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { registerMonitorTools } from "@/lib/mcp/tools"

/**
 * F-4 (R-13) regression — monitor write-tool schema bounds.
 *
 * The 2026-05-21 mixer audit found `busIndex` + `channelIndex` Zod max was
 * 9007199254740991 (effectively unbounded), so a client never rejected an
 * out-of-range bus/channel before the round-trip — `matrixIndex` was already
 * tight (1-6). The fix caps `channelIndex` ≤ 32 (X32 input bank) and
 * `busIndex` ≤ 5 ([1..5] monitor buses).
 *
 * REPRO (audit `repro_F4_schema_holes`):
 *   schema_for set_bus_fader  → busIndex.maximum < 1000   (was 9e15)
 *   schema_for set_send_level → channelIndex.maximum == 32 (was 9e15)
 *
 * We assert via `safeParse` (the behavioral contract the finding cares about —
 * "reject out-of-range in 0ms, client-side") which is stable across zod
 * versions; the deployed `tools/list` check confirms the literal JSON-schema
 * `maximum` post-deploy.
 */

type Shape = Record<string, z.ZodTypeAny>

function captureMonitorSchemas(): Record<string, Shape> {
    const captured: Record<string, Shape> = {}
    const mockServer = {
        registerTool: (name: string, config: { inputSchema?: Shape }) => {
            captured[name] = config.inputSchema ?? {}
        },
    } as unknown as McpServer
    registerMonitorTools(mockServer)
    return captured
}

describe("monitor tool schemas — F-4 bounds", () => {
    const schemas = captureMonitorSchemas()

    it("set_send_level: channelIndex capped at 32, busIndex capped at 5", () => {
        const s = schemas["set_send_level"]
        expect(s.channelIndex.safeParse(32).success).toBe(true)
        expect(s.channelIndex.safeParse(33).success).toBe(false)
        expect(s.channelIndex.safeParse(9007199254740991).success).toBe(false)
        expect(s.busIndex.safeParse(5).success).toBe(true)
        expect(s.busIndex.safeParse(6).success).toBe(false)
    })

    it("set_send_mute: channelIndex capped at 32, busIndex capped at 5", () => {
        const s = schemas["set_send_mute"]
        expect(s.channelIndex.safeParse(32).success).toBe(true)
        expect(s.channelIndex.safeParse(33).success).toBe(false)
        expect(s.busIndex.safeParse(6).success).toBe(false)
    })

    it("set_bus_fader: busIndex capped (REPRO: maximum < 1000)", () => {
        const s = schemas["set_bus_fader"]
        expect(s.busIndex.safeParse(5).success).toBe(true)
        expect(s.busIndex.safeParse(1000).success).toBe(false)
        expect(s.busIndex.safeParse(9007199254740991).success).toBe(false)
    })

    it("get_mix: busIndex capped at 5 but still optional", () => {
        const s = schemas["get_mix"]
        expect(s.busIndex.safeParse(undefined).success).toBe(true)
        expect(s.busIndex.safeParse(5).success).toBe(true)
        expect(s.busIndex.safeParse(6).success).toBe(false)
    })

    it("matrix bounds unchanged (already tight 1-6)", () => {
        expect(schemas["set_matrix_fader"].matrixIndex.safeParse(6).success).toBe(
            true,
        )
        expect(schemas["set_matrix_fader"].matrixIndex.safeParse(7).success).toBe(
            false,
        )
        expect(schemas["get_matrix"].matrixIndex.safeParse(7).success).toBe(false)
    })

    it("still accepts valid in-range writes (no over-tightening)", () => {
        const s = schemas["set_send_level"]
        expect(s.busIndex.safeParse(1).success).toBe(true)
        expect(s.channelIndex.safeParse(1).success).toBe(true)
        expect(s.level.safeParse(0.5).success).toBe(true)
    })
})
