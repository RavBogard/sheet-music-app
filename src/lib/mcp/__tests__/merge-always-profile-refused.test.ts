import { describe, it, expect, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: () => undefined,
    getFirestore: () => ({
        collection: () => ({
            doc: (id: string) => ({
                get: async () => ({ exists: true, id, data: () => ({ orgId: "crc", kind: "profile", tracks: [] }) }),
            }),
        }),
    }),
}))
vi.mock("@/lib/mcp/server-tracks-write", () => ({ assertEditor: async () => ({ ok: true }) }))

import { mergeAlwaysRowsIntoTemplate } from "../tools/template-always-rows"

describe("merge_always_rows_into_template and profiles (MCP-17)", () => {
    it("refuses a profile doc in the dry run, as the real write does", async () => {
        const out = await mergeAlwaysRowsIntoTemplate("u1", { templateId: "profile__crc__shir_shabbat", family: "friday_night", dryRun: true })
        expect(JSON.stringify(out)).toContain("template_not_found")
        expect(out).toMatchObject({ ok: false })
    })
})
