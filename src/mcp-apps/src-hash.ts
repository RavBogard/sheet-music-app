/**
 * Source-hash bookkeeping for the committed MCP App bundles.
 *
 * `src/mcp-apps/dist/chart-dropzone.html` is a BUILD ARTIFACT that is
 * nevertheless committed — the MCP server serves it as the `ui://chart-dropzone/app.html`
 * resource, so it has to exist at runtime without a build step. To stop it
 * silently drifting from its sources, the Vite build stamps a
 * `<!-- src-hash: <sha256> -->` banner on line 1 and
 * `__tests__/dist-freshness.test.ts` recomputes the same hash and compares.
 *
 * Node-only (fs/crypto): imported by `vite.config.ts` and by the unit test,
 * never by the browser bundle.
 */

import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/** Absolute path of `src/mcp-apps`. */
export const MCP_APPS_DIR = dirname(fileURLToPath(import.meta.url))

/**
 * Every file whose content the dist bundle is derived from, relative to
 * {@link MCP_APPS_DIR}. Order is load-bearing (it is part of the hash input),
 * so keep the list sorted and append nothing out of order.
 */
export const SOURCE_FILES = [
    "chart-dropzone/app.html",
    "chart-dropzone/app.ts",
    "chart-dropzone/styles.css",
] as const

/** The committed build output, relative to {@link MCP_APPS_DIR}. */
export const DIST_RELATIVE = "dist/chart-dropzone.html"

/** Matches the banner the build writes on line 1 of the dist file. */
export const SRC_HASH_RE = /^<!-- src-hash: ([0-9a-f]{64}) -->/

/**
 * sha256 over `<relative path>\n<contents>\n` for each source file, in
 * {@link SOURCE_FILES} order. CRLF is normalized to LF first so the hash is
 * identical on a Windows checkout with `core.autocrlf=true` and on CI.
 */
export function computeSrcHash(root: string = MCP_APPS_DIR): string {
    const hash = createHash("sha256")
    for (const rel of SOURCE_FILES) {
        const text = readFileSync(join(root, rel), "utf8").replace(/\r\n/g, "\n")
        hash.update(rel)
        hash.update("\n")
        hash.update(text)
        hash.update("\n")
    }
    return hash.digest("hex")
}

/** The hash stamped into `html`, or null when the banner is missing. */
export function readSrcHash(html: string): string | null {
    const m = SRC_HASH_RE.exec(html.replace(/^﻿/, ""))
    return m ? m[1] : null
}
