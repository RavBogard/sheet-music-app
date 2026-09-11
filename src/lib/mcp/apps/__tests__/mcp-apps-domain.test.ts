import { afterEach, describe, expect, it, vi } from "vitest"
import crypto from "node:crypto"
import path from "node:path"

/**
 * `node:fs` is faked with a path-keyed map so the two-candidate lookup in
 * `loadDropzoneHtml` can be driven without writing files into the repo — the
 * real dist bundle is built by a sibling task and may legitimately be absent.
 */
const fakeFs = { files: new Map<string, string>(), warnings: [] as unknown[] }
vi.mock("node:fs", () => ({
    default: {
        existsSync: (p: string) => fakeFs.files.has(p),
        readFileSync: (p: string) => fakeFs.files.get(p) ?? "",
    },
    existsSync: (p: string) => fakeFs.files.has(p),
    readFileSync: (p: string) => fakeFs.files.get(p) ?? "",
}))
vi.mock("@/lib/logger", () => ({
    logger: {
        warn: (...args: unknown[]) => fakeFs.warnings.push(args),
        error: () => {},
        info: () => {},
        log: () => {},
        debug: () => {},
    },
}))

import { mcpAppsStableDomain } from "../mcp-apps-domain"
import {
    DROPZONE_RESOURCE_URI,
    dropzoneUiMeta,
    loadDropzoneHtml,
} from "../dropzone-resource"

/**
 * The stable app origin Claude serves the dropzone iframe from is derived
 * from the connector URL, so an external API (here: the GCS signed-PUT host)
 * can allow-list one origin per deployment. The formula is fixed by the host,
 * not by us — pin it against a literal recomputation so a refactor that
 * changes the hash slice is caught here rather than by a CORS failure in
 * production.
 */
describe("mcpAppsStableDomain", () => {
    it("is sha256(url) hex sliced to 32 chars under claudemcpcontent.com", () => {
        expect(mcpAppsStableDomain("https://example.com/mcp")).toBe(
            "c3d80a4ed901ee05b21755a88273b4a4.claudemcpcontent.com",
        )
    })

    it("matches an independent recomputation for any url", () => {
        for (const url of [
            "https://centralreform.live/api/mcp",
            "http://localhost:3000/api/mcp",
            "",
        ]) {
            const expected =
                crypto.createHash("sha256").update(url).digest("hex").slice(0, 32) +
                ".claudemcpcontent.com"
            expect(mcpAppsStableDomain(url)).toBe(expected)
        }
    })

    it("is stable across calls and differs between urls", () => {
        const a = mcpAppsStableDomain("https://a.example/mcp")
        const b = mcpAppsStableDomain("https://b.example/mcp")
        expect(a).toBe(mcpAppsStableDomain("https://a.example/mcp"))
        expect(a).not.toBe(b)
    })
})

describe("dropzoneUiMeta", () => {
    const original = process.env.MCP_PUBLIC_URL

    afterEach(() => {
        if (original === undefined) delete process.env.MCP_PUBLIC_URL
        else process.env.MCP_PUBLIC_URL = original
    })

    it("always allows the signed-PUT host and points at the dropzone resource", () => {
        delete process.env.MCP_PUBLIC_URL
        const meta = dropzoneUiMeta()
        expect(meta.ui.resourceUri).toBe(DROPZONE_RESOURCE_URI)
        expect(meta.ui.csp.connectDomains).toEqual([
            "https://storage.googleapis.com",
        ])
        expect(meta.ui.domain).toBeUndefined()
    })

    it("adds our own origin and a stable domain when MCP_PUBLIC_URL is set", () => {
        process.env.MCP_PUBLIC_URL = "https://centralreform.live/api/mcp"
        const meta = dropzoneUiMeta()
        expect(meta.ui.csp.connectDomains).toEqual([
            "https://storage.googleapis.com",
            "https://centralreform.live",
        ])
        expect(meta.ui.domain).toBe(
            mcpAppsStableDomain("https://centralreform.live/api/mcp"),
        )
    })

    it("ignores an unparseable MCP_PUBLIC_URL rather than throwing", () => {
        process.env.MCP_PUBLIC_URL = "not a url"
        const meta = dropzoneUiMeta()
        expect(meta.ui.csp.connectDomains).toEqual([
            "https://storage.googleapis.com",
        ])
        expect(meta.ui.domain).toBe(mcpAppsStableDomain("not a url"))
    })
})

describe("loadDropzoneHtml", () => {
    afterEach(() => {
        fakeFs.files.clear()
        fakeFs.warnings.length = 0
    })

    it("returns placeholder HTML and warns when the bundle is missing", () => {
        const html = loadDropzoneHtml()
        expect(html).toContain("Dropzone bundle missing")
        expect(fakeFs.warnings.length).toBeGreaterThan(0)
    })

    it("returns the bundle from the first candidate path that exists", () => {
        fakeFs.files.set(
            path.join(process.cwd(), "src", "mcp-apps", "dist", "chart-dropzone.html"),
            "<html><body>real bundle</body></html>",
        )
        expect(loadDropzoneHtml()).toBe("<html><body>real bundle</body></html>")
        expect(fakeFs.warnings).toHaveLength(0)
    })

    it("falls back to the sheet-music-app-prefixed candidate", () => {
        fakeFs.files.set(
            path.join(
                process.cwd(),
                "sheet-music-app",
                "src",
                "mcp-apps",
                "dist",
                "chart-dropzone.html",
            ),
            "<html><body>nested bundle</body></html>",
        )
        expect(loadDropzoneHtml()).toBe("<html><body>nested bundle</body></html>")
    })
})
