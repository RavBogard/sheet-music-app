import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

// vitest + the project's tsconfig resolve `.mjs` imports natively (and the
// config strips the shebang before esbuild sees it).
import {
    EXT_TO_MIME,
    extOf,
    parseArgs,
    parseEnvText,
    parseMcpResponse,
    planFiles,
    renderTable,
    resolveBearer,
    unwrapToolResult,
} from "../upload-batch.mjs"

const FIXTURES = resolve(process.cwd(), "e2e/fixtures")

type Plan = {
    accepted: Array<{ path: string; fileName: string; mimeType: string; sizeBytes: number }>
    rejected: Array<{ path: string; fileName: string; reason: string }>
}

// ─── planFiles against the real fixture directory ────────────────────────────

describe("planFiles (e2e/fixtures)", () => {
    it("expands a directory and accepts exactly the supported charts", async () => {
        const plan: Plan = await planFiles([FIXTURES])
        expect(plan.accepted.map((f) => f.fileName)).toEqual([
            "chart-one.pdf",
            "chart-two.pdf",
        ])
        expect(plan.accepted.every((f) => f.mimeType === "application/pdf")).toBe(true)
        expect(plan.accepted.every((f) => f.sizeBytes > 0)).toBe(true)
    })

    it("rejects the unsupported extension with a reason, not an error", async () => {
        const plan: Plan = await planFiles([FIXTURES])
        expect(plan.rejected).toEqual([
            expect.objectContaining({
                fileName: "unsupported.rtf",
                reason: "unsupported_type",
            }),
        ])
    })

    it("skips dotfiles when expanding a directory", async () => {
        const plan: Plan = await planFiles([FIXTURES])
        const names = [...plan.accepted, ...plan.rejected].map((f) => f.fileName)
        expect(names.some((n) => n.startsWith("."))).toBe(false)
    })

    it("accepts a single explicitly-named file", async () => {
        const plan: Plan = await planFiles([join(FIXTURES, "chart-one.pdf")])
        expect(plan.accepted).toHaveLength(1)
        expect(plan.rejected).toHaveLength(0)
    })

    it("reports a missing path as rejected: not_found", async () => {
        const plan: Plan = await planFiles([join(FIXTURES, "nope.pdf")])
        expect(plan.accepted).toHaveLength(0)
        expect(plan.rejected[0].reason).toBe("not_found")
    })

    it("returns empty lists for no paths", async () => {
        expect(await planFiles([])).toEqual({ accepted: [], rejected: [] })
    })
})

// ─── planFiles edge cases against a scratch tree ─────────────────────────────

describe("planFiles (scratch tree)", () => {
    let dir: string

    beforeAll(async () => {
        dir = await mkdtemp(join(tmpdir(), "upload-batch-"))
        await writeFile(join(dir, "Good.musicxml"), "<score/>")
        await writeFile(join(dir, "Empty.pdf"), "")
        await writeFile(join(dir, "Huge.pdf"), Buffer.alloc(26 * 1024 * 1024))
        await mkdir(join(dir, "nested"))
        await writeFile(join(dir, "nested", "Deep.pdf"), "deep")
    })

    afterAll(async () => {
        await rm(dir, { recursive: true, force: true })
    })

    it("expands ONE level only — a nested directory's files are not uploaded", async () => {
        const plan: Plan = await planFiles([dir])
        const names = [...plan.accepted, ...plan.rejected].map((f) => f.fileName)
        expect(names).not.toContain("Deep.pdf")
    })

    it("resolves mime from the extension table", async () => {
        const plan: Plan = await planFiles([join(dir, "Good.musicxml")])
        expect(plan.accepted[0].mimeType).toBe(
            "application/vnd.recordare.musicxml+xml",
        )
    })

    it("rejects a zero-byte file as `empty`", async () => {
        const plan: Plan = await planFiles([join(dir, "Empty.pdf")])
        expect(plan.rejected[0].reason).toBe("empty")
    })

    it("rejects a file over the 25 MB cap as `too_large`", async () => {
        const plan: Plan = await planFiles([join(dir, "Huge.pdf")])
        expect(plan.rejected[0].reason).toBe("too_large")
    })
})

// ─── the small pure helpers around it ────────────────────────────────────────

describe("extOf / EXT_TO_MIME", () => {
    it("lowercases and includes the dot", () => {
        expect(extOf("Chart.PDF")).toBe(".pdf")
    })
    it("returns '' for an extensionless name and for a dotfile", () => {
        expect(extOf("README")).toBe("")
        expect(extOf(".gitignore")).toBe("")
    })
    it("mirrors the source-of-truth table's chart extensions", () => {
        // If this drifts from src/lib/library/chart-file-types.ts the server
        // simply rejects the file — but the CLI should not be the reason.
        expect(EXT_TO_MIME[".pdf"]).toBe("application/pdf")
        expect(EXT_TO_MIME[".mxl"]).toBe("application/vnd.recordare.musicxml")
        expect(Object.keys(EXT_TO_MIME)).toHaveLength(12)
    })
})

describe("parseArgs", () => {
    it("separates paths from flags", () => {
        const a = parseArgs(["a.pdf", "--collection", "core", "b.pdf", "--dry-run"])
        expect(a.paths).toEqual(["a.pdf", "b.pdf"])
        expect(a.collection).toBe("core")
        expect(a.dryRun).toBe(true)
    })
    it("defaults the endpoint to production", () => {
        expect(parseArgs(["a.pdf"]).endpoint).toBe("https://centralreform.live/api/mcp")
    })
    it("accepts --flag=value form", () => {
        const a = parseArgs(["--endpoint=https://x/api/mcp", "--bearer=tok"])
        expect(a.endpoint).toBe("https://x/api/mcp")
        expect(a.bearer).toBe("tok")
    })
})

describe("resolveBearer", () => {
    it("prefers --bearer", async () => {
        expect(await resolveBearer("flagtok", { env: { MCP_BEARER: "envtok" } })).toBe(
            "flagtok",
        )
    })
    it("falls back to MCP_BEARER", async () => {
        expect(await resolveBearer(undefined, { env: { MCP_BEARER: "envtok" } })).toBe(
            "envtok",
        )
    })
    it("falls back to SUPERVISOR_PROD_BEARER in .env.local", async () => {
        const got = await resolveBearer(undefined, {
            env: {},
            readFile: async () => "SUPERVISOR_PROD_BEARER=crl_live_abc\n",
        })
        expect(got).toBe("crl_live_abc")
    })
    it("returns undefined when nothing supplies one", async () => {
        const got = await resolveBearer(undefined, {
            env: {},
            readFile: async () => {
                throw new Error("ENOENT")
            },
        })
        expect(got).toBeUndefined()
    })
})

describe("parseEnvText", () => {
    it("parses KEY=VALUE and strips paired quotes", () => {
        expect(parseEnvText('A=1\nB="two"\n# c\n')).toEqual({ A: "1", B: "two" })
    })
})

describe("parseMcpResponse", () => {
    it("parses application/json", () => {
        expect(parseMcpResponse("application/json", '{"a":1}')).toEqual({ a: 1 })
    })
    it("parses SSE framing, last data: line wins", () => {
        expect(
            parseMcpResponse("text/event-stream", 'data: {"a":1}\n\ndata: {"a":2}\n\n'),
        ).toEqual({ a: 2 })
    })
    it("returns null on garbage", () => {
        expect(parseMcpResponse("application/json", "nope")).toBeNull()
    })
})

describe("unwrapToolResult", () => {
    it("prefers structuredContent", () => {
        expect(
            unwrapToolResult({
                structuredContent: { ok: true, batchId: "ub-1" },
                content: [{ type: "text", text: "{}" }],
            }),
        ).toEqual({ ok: true, batchId: "ub-1" })
    })
    it("falls back to the JSON text block", () => {
        expect(
            unwrapToolResult({ content: [{ type: "text", text: '{"ok":true}' }] }),
        ).toEqual({ ok: true })
    })
    it("wraps non-JSON prose as an error payload", () => {
        expect(unwrapToolResult({ content: [{ type: "text", text: "boom" }] })).toEqual({
            ok: false,
            error: { message: "boom" },
        })
    })
})

describe("renderTable", () => {
    it("pads every column but the last", () => {
        const out = renderTable([
            ["file", "status", "detail"],
            ["a.pdf", "imported", "file-1"],
        ])
        expect(out.split("\n")[0]).toBe("file   status    detail")
    })
    it("returns '' for no rows", () => {
        expect(renderTable([])).toBe("")
    })
})
