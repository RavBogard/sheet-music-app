import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

// vitest + the project's tsconfig resolve `.mjs` imports natively (and the
// config strips the shebang before esbuild sees it).
import {
    EXT_TO_MIME,
    McpSession,
    extOf,
    parseArgs,
    parseEnvText,
    parseMcpResponse,
    planFiles,
    renderTable,
    resolveBearer,
    unwrapToolResult,
    zipMintedItems,
} from "../upload-batch.mjs"

const FIXTURES = resolve(process.cwd(), "e2e/fixtures")

type Plan = {
    accepted: Array<{
        path: string
        baseName: string
        fileName: string
        mimeType: string
        sizeBytes: number
    }>
    rejected: Array<{ path: string; baseName: string; fileName: string; reason: string }>
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

// ─── same basename in two directories: plan + mapping ────────────────────────

describe("same basename in two directories", () => {
    let root: string

    beforeAll(async () => {
        root = await mkdtemp(join(tmpdir(), "upload-batch-dup-"))
        await mkdir(join(root, "friday"))
        await mkdir(join(root, "shabbat"))
        await writeFile(join(root, "friday", "Adon Olam.pdf"), "FRIDAY-BYTES")
        await writeFile(join(root, "shabbat", "Adon Olam.pdf"), "SHABBAT-BYTES-LONGER")
    })

    afterAll(async () => {
        await rm(root, { recursive: true, force: true })
    })

    it("keeps both files, each with its own path, and uniquifies the upload name", async () => {
        const plan: Plan = await planFiles([
            join(root, "friday", "Adon Olam.pdf"),
            join(root, "shabbat", "Adon Olam.pdf"),
        ])
        expect(plan.accepted).toHaveLength(2)
        expect(plan.accepted.map((f) => f.baseName)).toEqual([
            "Adon Olam.pdf",
            "Adon Olam.pdf",
        ])
        expect(plan.accepted.map((f) => f.fileName)).toEqual([
            "Adon Olam.pdf",
            "Adon Olam (2).pdf",
        ])
        // The two entries point at DIFFERENT files on disk.
        expect(plan.accepted[0].path).not.toBe(plan.accepted[1].path)
        expect(plan.accepted[0].sizeBytes).not.toBe(plan.accepted[1].sizeBytes)
    })

    it("suffixes a third collision as (3), preserving the extension", async () => {
        const plan: Plan = await planFiles([
            join(root, "friday", "Adon Olam.pdf"),
            join(root, "shabbat", "Adon Olam.pdf"),
            join(root, "friday", "Adon Olam.pdf"),
        ])
        expect(plan.accepted.map((f) => f.fileName)).toEqual([
            "Adon Olam.pdf",
            "Adon Olam (2).pdf",
            "Adon Olam (3).pdf",
        ])
    })

    it("each minted URL is paired with its OWN source path (the bug this fixes)", async () => {
        const plan: Plan = await planFiles([
            join(root, "friday", "Adon Olam.pdf"),
            join(root, "shabbat", "Adon Olam.pdf"),
        ])
        // What the server returns, in request order.
        const minted = [
            { itemId: "it-1", fileName: "Adon Olam.pdf", uploadUrl: "https://sign/1" },
            { itemId: "it-2", fileName: "Adon Olam (2).pdf", uploadUrl: "https://sign/2" },
        ]

        const pairs = zipMintedItems(plan.accepted, minted, [])
        expect(pairs).toHaveLength(2)
        expect(pairs[0].planned.path).toBe(join(root, "friday", "Adon Olam.pdf"))
        expect(pairs[1].planned.path).toBe(join(root, "shabbat", "Adon Olam.pdf"))
        // Distinct URLs AND distinct sources — no file uploaded twice, none skipped.
        expect(new Set(pairs.map((p) => p.item.uploadUrl)).size).toBe(2)
        expect(new Set(pairs.map((p) => p.planned.path)).size).toBe(2)
    })
})

// ─── zipMintedItems ──────────────────────────────────────────────────────────

describe("zipMintedItems", () => {
    const group = [
        { fileName: "a.pdf", path: "/a.pdf" },
        { fileName: "b.rtf", path: "/b.rtf" },
        { fileName: "c.pdf", path: "/c.pdf" },
    ]

    it("skips the entries the server rejected and keeps the rest aligned", () => {
        const minted = [
            { itemId: "it-a", fileName: "a.pdf" },
            { itemId: "it-c", fileName: "c.pdf" },
        ]
        const rejected = [{ fileName: "b.rtf", reason: "unsupported_type" }]
        const pairs = zipMintedItems(group, minted, rejected)
        expect(pairs.map((p) => [p.planned.path, p.item.itemId])).toEqual([
            ["/a.pdf", "it-a"],
            ["/c.pdf", "it-c"],
        ])
    })

    it("throws rather than upload when the server returns items out of order", () => {
        const minted = [
            { itemId: "it-c", fileName: "c.pdf" },
            { itemId: "it-a", fileName: "a.pdf" },
        ]
        expect(() => zipMintedItems([group[0], group[2]], minted, [])).toThrow(
            /out of order/,
        )
    })

    it("throws when fewer items come back than were requested", () => {
        expect(() =>
            zipMintedItems(group, [{ itemId: "it-a", fileName: "a.pdf" }], []),
        ).toThrow(/fewer items/)
    })

    it("throws when more items come back than were requested", () => {
        const minted = [
            { itemId: "it-a", fileName: "a.pdf" },
            { itemId: "it-x", fileName: "a.pdf" },
        ]
        expect(() => zipMintedItems([group[0]], minted, [])).toThrow(
            /more than were requested/,
        )
    })

    it("returns [] for an empty group", () => {
        expect(zipMintedItems([], [], [])).toEqual([])
    })
})

// ─── McpSession ──────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200) {
    return {
        status,
        headers: {
            get: (h: string) => (h === "content-type" ? "application/json" : null),
        },
        text: async () => JSON.stringify(body),
    } as unknown as Response
}

describe("McpSession.call", () => {
    it("returns the structuredContent payload on success", async () => {
        const session = new McpSession("https://x/api/mcp", "tok", async () =>
            jsonResponse({
                jsonrpc: "2.0",
                id: 1,
                result: { structuredContent: { ok: true, batchId: "ub-1" } },
            }),
        )
        await expect(session.call("open_chart_dropzone", {})).resolves.toEqual({
            ok: true,
            batchId: "ub-1",
        })
    })

    it("throws with message AND hint when the result is isError", async () => {
        const session = new McpSession("https://x/api/mcp", "tok", async () =>
            jsonResponse({
                jsonrpc: "2.0",
                id: 1,
                result: {
                    isError: true,
                    structuredContent: {
                        ok: false,
                        error: {
                            machine_code: "queue_unavailable",
                            message: "could not queue",
                        },
                        hint: "a cron retries the queue every 10 minutes",
                    },
                },
            }),
        )
        await expect(session.call("commit_upload_batch", {})).rejects.toThrow(
            /commit_upload_batch refused: could not queue — a cron retries the queue every 10 minutes/,
        )
    })

    it("throws on payload.ok === false even when isError is absent", async () => {
        const session = new McpSession("https://x/api/mcp", "tok", async () =>
            jsonResponse({
                jsonrpc: "2.0",
                id: 1,
                result: {
                    structuredContent: { ok: false, error: { message: "forbidden_role" } },
                },
            }),
        )
        await expect(session.call("open_chart_dropzone", {})).rejects.toThrow(
            /open_chart_dropzone refused: forbidden_role/,
        )
    })

    it("throws on a non-200 and on a JSON-RPC envelope error", async () => {
        const http500 = new McpSession("https://x/api/mcp", "tok", async () =>
            jsonResponse({}, 500),
        )
        await expect(http500.call("get_upload_batch", {})).rejects.toThrow(/HTTP 500/)

        const rpcErr = new McpSession("https://x/api/mcp", "tok", async () =>
            jsonResponse({
                jsonrpc: "2.0",
                id: 1,
                error: { code: -32601, message: "nope" },
            }),
        )
        await expect(rpcErr.call("get_upload_batch", {})).rejects.toThrow(/JSON-RPC error/)
    })
})

describe("McpSession.initialize", () => {
    it("sends notifications/initialized after initialize, with no id", async () => {
        const sent: Array<Record<string, unknown>> = []
        const session = new McpSession("https://x/api/mcp", "tok", async (_url: string, init: RequestInit) => {
            sent.push(JSON.parse((init as { body: string }).body))
            return jsonResponse({ jsonrpc: "2.0", id: 1, result: {} })
        })

        await session.initialize()

        expect(sent).toHaveLength(2)
        expect(sent[0].method).toBe("initialize")
        expect(sent[1].method).toBe("notifications/initialized")
        expect(sent[1]).not.toHaveProperty("id")
    })

    it("carries a returned mcp-session-id onto later calls", async () => {
        const headersSeen: Array<Record<string, string>> = []
        const session = new McpSession("https://x/api/mcp", "tok", async (_url: string, init: RequestInit) => {
            headersSeen.push((init as { headers: Record<string, string> }).headers)
            return {
                status: 200,
                headers: {
                    get: (h: string) =>
                        h === "content-type"
                            ? "application/json"
                            : h === "mcp-session-id"
                              ? "sess-42"
                              : null,
                },
                text: async () =>
                    JSON.stringify({
                        jsonrpc: "2.0",
                        id: 1,
                        result: { structuredContent: { ok: true } },
                    }),
            } as unknown as Response
        })

        await session.initialize()
        await session.call("get_upload_batch", {})

        expect(headersSeen[0]["mcp-session-id"]).toBeUndefined()
        expect(headersSeen.at(-1)?.["mcp-session-id"]).toBe("sess-42")
    })

    it("does not fail the run when the notification itself errors", async () => {
        let n = 0
        const session = new McpSession("https://x/api/mcp", "tok", async () => {
            n += 1
            if (n === 1) return jsonResponse({ jsonrpc: "2.0", id: 1, result: {} })
            throw new Error("ECONNRESET")
        })
        await expect(session.initialize()).resolves.toBeUndefined()
    })
})
