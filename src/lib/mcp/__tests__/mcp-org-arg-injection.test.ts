import { describe, expect, it } from "vitest"

import {
    registerReadTools,
    registerWriteTools,
    registerMonitorTools,
    registerChartUploadTools,
    registerRosterTools,
    registerObservabilityTools,
} from "../tools"

/**
 * v11-06-02 (close-gate audit) — no argument-injection escape.
 *
 * The MCP caller's tenant is resolved at the route from the verified bearer
 * (orgFrom(extra)) and passed to every tool handler. A tool that ALSO accepted
 * a caller-suppliable `org`/`orgId`/`tenant` INPUT would let a caller select a
 * tenant via args, escaping the bearer-derived wall. This test enumerates every
 * registered MCP tool's inputSchema and asserts NONE exposes such a key —
 * locking the invariant so a future tool can't silently add one.
 *
 * Pure registry introspection (no Firestore) — the register* entrypoints only
 * call server.registerTool; handlers are recorded, never invoked.
 */
describe("v11-06-02 no-arg-injection: no MCP tool accepts a caller-suppliable org selector", () => {
    const ORG_KEY = /^(org|orgId|orgIds|tenant|tenantId)$/i

    type Captured = { name: string; inputSchema: Record<string, unknown> | undefined }

    function captureTools(): Captured[] {
        const captured: Captured[] = []
        // Minimal capturing mock — the register* fns only call registerTool.
        const mockServer = {
            registerTool(
                name: string,
                config: { inputSchema?: Record<string, unknown> },
                _handler: unknown,
            ) {
                captured.push({ name, inputSchema: config?.inputSchema })
            },
            // defensive no-ops in case any entrypoint grows another call shape
            registerResource() {},
            registerPrompt() {},
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any

        registerReadTools(mockServer)
        registerWriteTools(mockServer)
        registerMonitorTools(mockServer)
        registerChartUploadTools(mockServer)
        registerRosterTools(mockServer)
        registerObservabilityTools(mockServer)
        return captured
    }

    it("AC-3: registration captures a non-trivial set of tools (guards against vacuous pass)", () => {
        const tools = captureTools()
        expect(tools.length).toBeGreaterThan(50)
        // every captured entry must have a name
        expect(tools.every((t) => typeof t.name === "string" && t.name.length > 0)).toBe(true)
    })

    it("AC-3: NO tool inputSchema exposes an org/orgId/orgIds/tenant key", () => {
        const tools = captureTools()
        const offenders: string[] = []
        for (const t of tools) {
            if (!t.inputSchema || typeof t.inputSchema !== "object") continue
            for (const key of Object.keys(t.inputSchema)) {
                if (ORG_KEY.test(key)) offenders.push(`${t.name}.${key}`)
            }
        }
        // If this fails, a tool lets a caller select their tenant via args — a
        // real cross-tenant escape vector. Fix = remove the arg; force orgFrom(extra).
        expect(offenders).toEqual([])
    })
})
