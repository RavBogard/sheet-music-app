import fs from "node:fs"
import path from "node:path"

import { logger } from "@/lib/logger"
import { mcpAppsStableDomain } from "./mcp-apps-domain"

/**
 * MCP Apps — the chart drop-zone iframe resource.
 *
 * `open_chart_dropzone` carries `_meta.ui.resourceUri = DROPZONE_RESOURCE_URI`,
 * which tells Claude to fetch this resource and render its HTML in a sandboxed
 * iframe next to the conversation. The bundle itself is a single self-contained
 * HTML file (all CSS/JS inlined) produced by `npm run build:mcp-apps` and
 * CHECKED IN at `src/mcp-apps/dist/chart-dropzone.html`, so a Vercel deploy
 * needs no extra build step.
 *
 * That bundle is built by a sibling task and may legitimately not exist yet (or
 * may be missing from a deploy whose build step was skipped). A missing bundle
 * must not take the whole MCP server down at cold start, so `loadDropzoneHtml`
 * degrades to a placeholder page and logs a warn — every other tool keeps
 * working, and `import_drive_folder` / the CLI courier remain viable intake
 * paths.
 */

/** The `ui://` URI the tool's `_meta` points at and the resource registers as. */
export const DROPZONE_RESOURCE_URI = "ui://chart-dropzone/app.html"

/** Shown when the built bundle is absent — see the module header. */
const PLACEHOLDER_HTML =
    "<html><body>Dropzone bundle missing</body></html>"

/** Path under the repo root where the built single-file bundle lives. */
const BUNDLE_RELATIVE = ["src", "mcp-apps", "dist", "chart-dropzone.html"]

/**
 * Read the built drop-zone bundle from disk.
 *
 * Same two-candidate `process.cwd()` walk `route.ts` uses for
 * `.paul/AGENT-GUIDE.md`: Vercel and `next dev` both run from the Next.js
 * project root, but some tooling runs from the repository root one level up,
 * where the project lives under `sheet-music-app/`.
 */
export function loadDropzoneHtml(): string {
    try {
        const candidates = [
            path.join(process.cwd(), ...BUNDLE_RELATIVE),
            path.join(process.cwd(), "sheet-music-app", ...BUNDLE_RELATIVE),
        ]
        for (const p of candidates) {
            if (fs.existsSync(p)) return fs.readFileSync(p, "utf8")
        }
        logger.warn(
            "[mcp-apps] chart-dropzone bundle not found; serving placeholder",
            { candidates },
        )
    } catch (err) {
        logger.warn("[mcp-apps] failed to read chart-dropzone bundle", err)
    }
    return PLACEHOLDER_HTML
}

/**
 * UI metadata for the drop-zone app.
 *
 * - `csp.connectDomains` is the iframe's fetch allow-list. The app PUTs chart
 *   bytes straight to the signed Google Cloud Storage URLs the server minted,
 *   so `storage.googleapis.com` is mandatory; our own origin is added when
 *   known, for the polling fallback path.
 * - `domain` is the stable app origin (see `mcpAppsStableDomain`) so the GCS
 *   bucket's CORS rule can name one origin. Omitted when `MCP_PUBLIC_URL` is
 *   unset, because there is nothing stable to hash. DO NOT SET
 *   `MCP_PUBLIC_URL` in production: Claude derives the app's sandbox origin by
 *   hashing the CONNECTOR url, and our two tenants connect on two different
 *   hosts (centralreform.live / brotherslazaroff.live), so one pinned domain
 *   makes Claude refuse to render the drop zone for the other tenant. The
 *   bucket's CORS rule allows any origin, so nothing needs the hint — see
 *   docs/BATCH-INTAKE.md.
 *
 * NOTE on placement: per the MCP Apps spec, `csp` and `domain` are read from
 * the UI *resource*'s `_meta.ui` (the `resources/read` content item, with the
 * `resources/list` entry as fallback) and are explicitly ignored on a tool's
 * `_meta.ui` — the SDK types even declare `McpUiToolMeta.csp?: never`. So this
 * object is attached to the resource; the tool gets only `resourceUri`.
 */
export function dropzoneUiMeta(): {
    ui: {
        resourceUri: string
        csp: { connectDomains: string[] }
        domain?: string
    }
} {
    const publicUrl = process.env.MCP_PUBLIC_URL
    const connectDomains = ["https://storage.googleapis.com"]

    if (publicUrl) {
        try {
            connectDomains.push(new URL(publicUrl).origin)
        } catch {
            // Unparseable env value — the GCS entry alone is still correct.
        }
    }

    return {
        ui: {
            resourceUri: DROPZONE_RESOURCE_URI,
            csp: { connectDomains },
            ...(publicUrl ? { domain: mcpAppsStableDomain(publicUrl) } : {}),
        },
    }
}
