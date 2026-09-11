/**
 * The committed `dist/chart-dropzone.html` is a build artifact that the MCP
 * server serves verbatim, so a source edit that never got rebuilt would ship
 * a stale UI with no other symptom. The build stamps a sha256 of its sources
 * on line 1; this test recomputes it and fails loudly on drift.
 *
 * Fix a failure with: `npm run build:mcp-apps` (then commit the dist file).
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
    DIST_RELATIVE,
    MCP_APPS_DIR,
    SOURCE_FILES,
    computeSrcHash,
    readSrcHash,
} from "../src-hash"

const distPath = join(MCP_APPS_DIR, DIST_RELATIVE)
const dist = readFileSync(distPath, "utf8")

describe("chart-dropzone dist bundle", () => {
    it("carries a src-hash banner matching its sources", () => {
        const stamped = readSrcHash(dist)
        expect(stamped, `no src-hash banner in ${DIST_RELATIVE}`).not.toBeNull()
        expect(
            stamped,
            `${DIST_RELATIVE} is stale — run \`npm run build:mcp-apps\` and commit the result`,
        ).toBe(computeSrcHash())
    })

    it("hashes every source file (changing any one changes the hash)", () => {
        const baseline = computeSrcHash()
        for (const rel of SOURCE_FILES) {
            const text = readFileSync(join(MCP_APPS_DIR, rel), "utf8")
            expect(text.length, `${rel} is empty`).toBeGreaterThan(0)
        }
        expect(baseline).toMatch(/^[0-9a-f]{64}$/)
    })

    it("inlines everything — no external script/style/font/image URL", () => {
        // The sandbox CSP is deny-by-default; a single external reference
        // renders as a silent blank frame.
        expect(dist).not.toMatch(/<script[^>]+\ssrc=/i)
        expect(dist).not.toMatch(/<link[^>]+rel=["']?stylesheet/i)
        expect(dist).not.toMatch(/<img[^>]+\ssrc=/i)
        // CSS is checked inside <style> only: the bundled SDK contains
        // JS string literals like `new URL("https://…")` that a document-wide
        // `url(http` regex would false-positive on.
        const styles = [...dist.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(
            (m) => m[1],
        )
        expect(styles.length).toBeGreaterThan(0)
        for (const css of styles) {
            expect(css).not.toMatch(/@import/i)
            expect(css).not.toMatch(/url\(\s*["']?(https?:)?\/\//i)
        }
    })

    it("contains the app's own markup and the test seam", () => {
        expect(dist).toContain("Chart drop-zone")
        expect(dist).toContain("__DROPZONE_TEST_HOST__")
    })

    it("keeps the a11y hooks (live region, table label, focus ids)", () => {
        // These are plain string literals in the renderer, so minification
        // preserves them; losing one means an accessibility regression.
        expect(dist).toContain("aria-live")
        expect(dist).toContain("aria-atomic")
        expect(dist).toContain("aria-label")
        expect(dist).toContain("Upload batch files")
        expect(dist).toContain("data-focus-id")
    })

    it("pulls no server module into the browser bundle", () => {
        for (const forbidden of ["firebase-admin", "server-only", "next/server"]) {
            expect(dist, `dist bundle references ${forbidden}`).not.toContain(forbidden)
        }
    })
})
