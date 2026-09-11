import { beforeEach, describe, expect, it, vi } from "vitest"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"

/**
 * create_chart — behavior contract.
 *
 * The tool exists so Claude can file a chart it wrote, on its own, from any
 * chat. These tests pin what a regression would silently break:
 *   - preview renders a PNG and writes NOTHING
 *   - commit renders a PDF, files it, stores the source, bonds when asked
 *   - a revision mints a new id, moves every bond, archives the old row
 *   - permission / rate-limit / validation refusals come back as envelopes
 */

const m = vi.hoisted(() => ({
    roles: { role: "band_leader", canUpload: true, email: "d@x" } as { role: string | undefined; canUpload: boolean; email: string },
    rateLimit: vi.fn(async () => null as null | { error: string; retryAfterSec: number }),
    processChartUpload: vi.fn(),
    swapChart: vi.fn(),
    findRefs: vi.fn(),
    markStatus: vi.fn(),
    applySongMetadata: vi.fn(async () => ({ found: true })),
    stampOrg: vi.fn(async () => undefined),
    docs: new Map<string, Record<string, unknown>>(),
    sets: [] as Array<{ path: string; data: Record<string, unknown> }>,
}))

vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: () => true,
    getFirestore: () => ({
        collection: (name: string) => ({
            doc: (id: string) => ({
                get: async () => {
                    const d = m.docs.get(`${name}/${id}`)
                    return { exists: Boolean(d), id, data: () => d }
                },
                set: async (data: Record<string, unknown>) => {
                    m.sets.push({ path: `${name}/${id}`, data })
                },
            }),
        }),
    }),
}))
vi.mock("@/lib/rate-limit", () => ({ checkUserRateLimit: (...a: unknown[]) => m.rateLimit(...(a as [])) }))
vi.mock("@/lib/mcp/tools/uploader-roles", async (orig) => {
    const real = await orig<typeof import("@/lib/mcp/tools/uploader-roles")>()
    return { ...real, loadUploader: async () => m.roles }
})
vi.mock("@/lib/library-upload", () => ({
    processChartUpload: (...a: unknown[]) => m.processChartUpload(...(a as [])),
}))
vi.mock("@/lib/mcp/tools/library-upload", () => ({
    uploadFailureEnvelope: (r: { error: string }) => ({ ok: false, error: { machine_code: "upload_failed", message: r.error } }),
}))
vi.mock("@/lib/mcp/tools/song-metadata", () => ({ applySongMetadata: (...a: unknown[]) => m.applySongMetadata(...(a as [])) }))
vi.mock("@/lib/mcp/tools/setlist-write", () => ({ swapChart: (...a: unknown[]) => m.swapChart(...(a as [])) }))
vi.mock("@/lib/mcp/tools/setlists", () => ({ findSetlistsReferencingChart: (...a: unknown[]) => m.findRefs(...(a as [])) }))
vi.mock("@/lib/mcp/tools/mark-chart-status", () => ({ markChartStatus: (...a: unknown[]) => m.markStatus(...(a as [])) }))
vi.mock("@/lib/mcp/org-context", async (orig) => {
    const real = await orig<typeof import("@/lib/mcp/org-context")>()
    return { ...real, stampOrg: (...a: unknown[]) => m.stampOrg(...(a as [])) }
})

import { createChart, type CreateChartArgs } from "@/lib/mcp/tools/authored-chart"
import { registerAuthoredChartTools, toToolResult } from "@/lib/mcp/tools/register-authored-chart"
import { MODEH_ANI_SAMPLE } from "@/lib/chart-render/house-chart-html"

const PNG = Buffer.from("89504e470d0a1a0a", "hex")
const PDF = Buffer.from("%PDF-1.7 fake")

function renderOk() {
    return vi.fn(async (_html: string, format: "pdf" | "png") =>
        format === "png"
            ? { bytes: PNG, mimeType: "image/png", pageCount: 1, renderMs: 900 }
            : { bytes: PDF, mimeType: "application/pdf", pageCount: 1, renderMs: 1200 },
    )
}

const chartArgs = (over: Partial<CreateChartArgs> = {}): CreateChartArgs => ({
    mode: "preview",
    source: { kind: "chart", chart: MODEH_ANI_SAMPLE },
    ...over,
})

beforeEach(() => {
    m.roles = { role: "band_leader", canUpload: true, email: "d@x" }
    m.rateLimit.mockReset().mockResolvedValue(null)
    m.processChartUpload.mockReset().mockResolvedValue({ ok: true, fileId: "upload-new", title: "Modeh Ani", collection: "uploads" })
    m.swapChart.mockReset().mockResolvedValue({ ok: true, track: {} })
    m.findRefs.mockReset().mockResolvedValue({ ok: true, fileId: "upload-old", songId: null, setlists: [], count: 0, danglingTracksIgnored: 0 })
    m.markStatus.mockReset().mockResolvedValue({ fileId: "upload-old", name: "Modeh Ani", fromStatus: "active", toStatus: "archived" })
    m.applySongMetadata.mockClear()
    m.stampOrg.mockClear()
    m.docs.clear()
    m.sets.length = 0
})

describe("create_chart preview", () => {
    it("renders a PNG of the house-style HTML and writes nothing", async () => {
        const render = renderOk()
        const r = await createChart("u1", chartArgs(), "crc", { render })
        expect(r).toMatchObject({ ok: true, mode: "preview", title: "Modeh Ani", pageCount: 1 })
        expect((r as { imagePng?: Buffer }).imagePng).toEqual(PNG)
        expect(render).toHaveBeenCalledTimes(1)
        expect(render.mock.calls[0][1]).toBe("png")
        expect(render.mock.calls[0][0]).toContain("<h1>Modeh Ani</h1>")
        expect(m.processChartUpload).not.toHaveBeenCalled()
        expect(m.sets).toEqual([])
    })
    it("musicxml preview returns metadata only, no render call", async () => {
        const render = renderOk()
        const r = await createChart(
            "u1",
            { mode: "preview", title: "Lead", source: { kind: "musicxml", musicxml: "<?xml version='1.0'?><score-partwise></score-partwise>".padEnd(60, " ") } },
            "crc",
            { render },
        )
        expect(r).toMatchObject({ ok: true, mode: "preview", kind: "musicxml", pageCount: null })
        expect(render).not.toHaveBeenCalled()
    })
    it("surfaces a render failure as a rich envelope", async () => {
        const render = vi.fn(async () => ({ ok: false as const, status: 504, machineCode: "render_timeout", message: "slow" }))
        const r = await createChart("u1", chartArgs(), "crc", { render })
        expect(r).toMatchObject({ ok: false, error: { machine_code: "render_timeout" } })
    })
    it("the tool result carries the image as an MCP image content block", async () => {
        const r = await createChart("u1", chartArgs(), "crc", { render: renderOk() })
        const out = toToolResult(r)
        expect(out.isError).toBe(false)
        expect(out.content[0]).toEqual({ type: "image", data: PNG.toString("base64"), mimeType: "image/png" })
        expect(JSON.parse((out.content[1] as { text: string }).text)).not.toHaveProperty("imagePng")
    })
})

describe("create_chart commit", () => {
    it("renders a PDF, files it, stamps org, stores the authored source, and bonds when asked", async () => {
        const render = renderOk()
        const r = await createChart(
            "u1",
            chartArgs({ mode: "commit", key: "Cm", bondTo: { setlistId: "s1", trackId: "t1" } }),
            "crc",
            { render },
        )
        expect(r).toMatchObject({ ok: true, mode: "commit", fileId: "upload-new", mimeType: "application/pdf", pageCount: 1, revisionOf: null })
        expect(render.mock.calls[0][1]).toBe("pdf")
        const upload = m.processChartUpload.mock.calls[0][0] as Record<string, unknown>
        expect(upload).toMatchObject({ mimeType: "application/pdf", title: "Modeh Ani", originalFileName: "modeh_ani.pdf", uploaderUid: "u1", key: "Cm" })
        expect(upload.buffer).toEqual(PDF)
        expect(m.stampOrg).toHaveBeenCalledWith(expect.anything(), "upload-new", "crc")
        const src = m.sets.find((s) => s.path === "library_index/upload-new")
        expect(src?.data).toMatchObject({ authoredBy: "u1", authoredKind: "chart", pageCount: 1 })
        expect(m.applySongMetadata).toHaveBeenCalled()
        expect(m.swapChart).toHaveBeenCalledWith("u1", { setlistId: "s1", trackId: "t1", newSongId: "upload-new" }, "crc")
        expect((r as { bonded: unknown[] }).bonded).toEqual([{ setlistId: "s1", trackId: "t1" }])
    })
    it("a failed bond does not fail the commit — it is a warning", async () => {
        m.swapChart.mockResolvedValue({ ok: false, error: { machine_code: "row_not_found", message: "no such row" } })
        const r = await createChart("u1", chartArgs({ mode: "commit", bondTo: { setlistId: "s1", trackId: "nope" } }), "crc", { render: renderOk() })
        expect(r).toMatchObject({ ok: true, bonded: [] })
        expect((r as { warnings: string[] }).warnings[0]).toMatch(/NOT bonded/)
    })
    it("text source is filed as text/plain in the save_scraped_chart payload shape", async () => {
        const r = await createChart("u1", { mode: "commit", title: "Oseh Shalom", source: { kind: "text", content: "C  G\nOseh shalom", artist: "Trad" } }, "crc", { render: renderOk() })
        expect(r).toMatchObject({ ok: true, mimeType: "text/plain" })
        const upload = m.processChartUpload.mock.calls[0][0] as { buffer: Buffer; originalFileName: string }
        expect(upload.buffer.toString("utf8")).toBe("Oseh Shalom\nTrad\n\nC  G\nOseh shalom")
        expect(upload.originalFileName).toBe("oseh_shalom.txt")
    })
    it("maps an upload failure through uploadFailureEnvelope", async () => {
        m.processChartUpload.mockResolvedValue({ ok: false, error: "duplicate_similar" })
        const r = await createChart("u1", chartArgs({ mode: "commit" }), "crc", { render: renderOk() })
        expect(r).toMatchObject({ ok: false, error: { machine_code: "upload_failed" } })
    })
})

describe("create_chart revisions", () => {
    beforeEach(() => {
        m.docs.set("library_index/upload-old", { orgId: "crc", authoredBy: "u1", collection: "supplemental", name: "Modeh Ani" })
        m.findRefs.mockResolvedValue({
            ok: true, fileId: "upload-old", songId: null, count: 2, danglingTracksIgnored: 0,
            setlists: [
                { setlistId: "s1", trackId: "t1", name: "RH Day 1" },
                { setlistId: "s2", trackId: "t9", name: "RH Day 2" },
            ],
        })
    })
    it("mints a new id, forces past dedupe, moves every bond, archives the old row", async () => {
        const r = await createChart("u1", chartArgs({ mode: "commit", revisionOf: "upload-old" }), "crc", { render: renderOk() })
        expect(r).toMatchObject({ ok: true, fileId: "upload-new", revisionOf: "upload-old", rebondedFromPrevious: 2, previousArchived: true })
        const upload = m.processChartUpload.mock.calls[0][0] as Record<string, unknown>
        expect(upload.force).toBe(true)
        expect(upload.collection).toBe("supplemental") // inherited from the previous row
        expect(m.swapChart).toHaveBeenCalledTimes(2)
        expect(m.markStatus).toHaveBeenCalledWith("u1", expect.objectContaining({ fileId: "upload-old", toStatus: "archived", canonicalFileId: "upload-new", force: true }), "crc")
        const src = m.sets.find((s) => s.path === "library_index/upload-new")
        expect(src?.data).toMatchObject({ revisionOf: "upload-old" })
    })
    it("does not bond twice when bondTo is one of the rows already moved", async () => {
        const r = await createChart("u1", chartArgs({ mode: "commit", revisionOf: "upload-old", bondTo: { setlistId: "s1", trackId: "t1" } }), "crc", { render: renderOk() })
        expect(m.swapChart).toHaveBeenCalledTimes(2)
        expect((r as { bonded: unknown[] }).bonded).toHaveLength(2)
    })
    it("refuses a revision of a chart in another org, or by a non-author musician", async () => {
        m.docs.set("library_index/upload-old", { orgId: "broslaz", authoredBy: "u1" })
        const other = await createChart("u1", chartArgs({ mode: "commit", revisionOf: "upload-old" }), "crc", { render: renderOk() })
        expect(other).toMatchObject({ ok: false, error: { machine_code: "row_not_found" } })

        m.docs.set("library_index/upload-old", { orgId: "crc", authoredBy: "someone-else" })
        m.roles = { role: "musician", canUpload: true, email: "m@x" }
        const notMine = await createChart("u2", chartArgs({ mode: "commit", revisionOf: "upload-old" }), "crc", { render: renderOk() })
        expect(notMine).toMatchObject({ ok: false, error: { machine_code: "forbidden" } })
        expect(m.processChartUpload).not.toHaveBeenCalled()
    })
    it("unknown revisionOf → row_not_found before anything is rendered", async () => {
        const render = renderOk()
        const r = await createChart("u1", chartArgs({ mode: "commit", revisionOf: "upload-ghost" }), "crc", { render })
        expect(r).toMatchObject({ ok: false, error: { machine_code: "row_not_found" } })
        expect(render).not.toHaveBeenCalled()
    })
})

describe("create_chart refusals", () => {
    it("rejects a missing/invalid mode and never defaults it", async () => {
        const r = await createChart("u1", { ...chartArgs(), mode: undefined as unknown as "preview" }, "crc", { render: renderOk() })
        expect(r).toMatchObject({ ok: false, error: { machine_code: "invalid_argument" } })
    })
    it("rejects a user without upload permission", async () => {
        m.roles = { role: undefined, canUpload: false, email: "v@x" }
        const r = await createChart("v", chartArgs(), "crc", { render: renderOk() })
        expect(r).toMatchObject({ ok: false })
    })
    it("applies the upload rate limit for non-trusted roles and bypasses it for leaders", async () => {
        m.roles = { role: "musician", canUpload: true, email: "m@x" }
        await createChart("mu", chartArgs(), "crc", { render: renderOk() })
        expect(m.rateLimit).toHaveBeenLastCalledWith("mu", "upload", { bypass: false })
        m.roles = { role: "admin", canUpload: true, email: "a@x" }
        await createChart("ad", chartArgs(), "crc", { render: renderOk() })
        expect(m.rateLimit).toHaveBeenLastCalledWith("ad", "upload", { bypass: true })
    })
    it("musicxml without a score root is rejected", async () => {
        const r = await createChart("u1", { mode: "preview", title: "x", source: { kind: "musicxml", musicxml: "<notes>".padEnd(60, "x") } }, "crc", { render: renderOk() })
        expect(r).toMatchObject({ ok: false, error: { machine_code: "invalid_argument" } })
    })
})

describe("registration", () => {
    it("registers create_chart with the two-step contract in its description and an explicit mode enum", () => {
        const captured: Record<string, { description: string; inputSchema: Record<string, { safeParse: (v: unknown) => { success: boolean } }> }> = {}
        const server = {
            registerTool: (name: string, config: (typeof captured)[string]) => {
                captured[name] = config
            },
        } as unknown as McpServer
        registerAuthoredChartTools(server)
        const t = captured.create_chart
        expect(t).toBeDefined()
        expect(t.description).toMatch(/preview/)
        expect(t.description).toMatch(/ONLY when the user says/)
        expect(t.inputSchema.mode.safeParse("commit").success).toBe(true)
        expect(t.inputSchema.mode.safeParse(undefined).success).toBe(false)
        expect(t.inputSchema.source.safeParse({ kind: "chart", chart: MODEH_ANI_SAMPLE }).success).toBe(true)
        expect(t.inputSchema.source.safeParse({ kind: "pdf", data: "..." }).success).toBe(false)
    })
})
