/**
 * Build config for the MCP App bundles.
 *
 *   npm run build:mcp-apps   ->  src/mcp-apps/dist/chart-dropzone.html
 *
 * `vite-plugin-singlefile` inlines every script and stylesheet, because the
 * MCP Apps sandbox serves the resource with a deny-by-default CSP: any
 * external script/style/font/image URL silently fails and the user gets a
 * blank frame. The output is committed so the MCP server can serve the
 * `ui://chart-dropzone/app.html` resource without a build step; the
 * `<!-- src-hash: … -->` banner this config stamps is what
 * `__tests__/dist-freshness.test.ts` checks it against.
 */

import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig, type Plugin } from "vite"
import { viteSingleFile } from "vite-plugin-singlefile"
import { computeSrcHash } from "./src-hash"

const here = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(here, "chart-dropzone")
const outDir = resolve(here, "dist")

/**
 * Rename Vite's `app.html` to the resource-shaped `chart-dropzone.html` and
 * stamp the source hash on line 1.
 */
function srcHashBanner(): Plugin {
    return {
        name: "crc:src-hash-banner",
        enforce: "post",
        // generateBundle (not closeBundle): renaming the asset here is what
        // makes Vite write `chart-dropzone.html` in the first place, instead
        // of writing `app.html` and renaming it behind Vite's back. Runs after
        // vite:singlefile, which is also `post` but registered first.
        generateBundle(_options, bundle) {
            const entry = Object.keys(bundle).find((k) => k.endsWith(".html"))
            if (!entry) throw new Error("no html asset in the bundle")
            const asset = bundle[entry]
            if (asset.type !== "asset") throw new Error(`${entry} is not an asset`)
            asset.fileName = "chart-dropzone.html"
            asset.source = `<!-- src-hash: ${computeSrcHash()} -->\n${String(asset.source)}`
            delete bundle[entry]
            bundle["chart-dropzone.html"] = asset
        },
    }
}

export default defineConfig({
    root: appRoot,
    base: "./",
    // `src/mcp-apps/dist` holds nothing but this build's output, and it lives
    // outside `root`, so Vite needs the explicit opt-in to empty it.
    build: {
        outDir,
        emptyOutDir: true,
        assetsInlineLimit: Number.MAX_SAFE_INTEGER,
        rollupOptions: { input: resolve(appRoot, "app.html") },
        target: "es2020",
    },
    resolve: {
        alias: { "@": resolve(here, "..") },
    },
    plugins: [viteSingleFile(), srcHashBanner()],
})
