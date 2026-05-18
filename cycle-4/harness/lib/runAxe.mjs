/**
 * Cycle-5 C5B-META-001 + C5A-META-003 — inline axe-core injection.
 *
 * Production CSP on centralreform.live blocks cross-origin script injection,
 * so the canonical Playwright pattern of `page.addScriptTag({url: cdnUrl})`
 * fails in cowork harness runs. Workaround: read the locally-installed
 * `axe-core/axe.min.js` source from disk and inject as inline `content`.
 * Inline scripts evade the `script-src` directive even under strict CSP
 * because Playwright injects with the page's own origin (it's a same-origin
 * `<script>` element with no external src).
 *
 * Defense-in-depth: pair `chromium.launch({bypassCSP:true})` at browser
 * setup time. This module documents the requirement; the harness driver
 * is the actual place to pass that arg.
 *
 *   import { chromium } from "playwright"
 *   import { runAxe } from "./lib/runAxe.mjs"
 *
 *   const browser = await chromium.launch({ bypassCSP: true })
 *   const page = await browser.newPage()
 *   await page.goto("https://centralreform.live/library")
 *   const result = await runAxe(page, "library-route")
 *   console.log(result.violations.length, "violations")
 *
 * The resolved axe-core path walks up from this module so the harness works
 * from either the canonical `sheet-music-app/` checkout or a sibling
 * worktree.
 */

import { promises as fs } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Find the `axe-core/axe.min.js` source on disk. Walks up from the harness
 * module looking for a `node_modules/axe-core/axe.min.js` file at each
 * level. Throws a descriptive error if axe-core isn't installed.
 *
 * @returns {Promise<string>} absolute path to axe.min.js
 */
async function resolveAxeSource() {
    const candidates = []
    let dir = __dirname
    // Walk up at most 6 levels (cycle-4/harness/lib → sheet-music-app → repo
    // root + a couple of git-worktree siblings). Stops at filesystem root.
    for (let i = 0; i < 6; i++) {
        candidates.push(path.join(dir, "node_modules", "axe-core", "axe.min.js"))
        const parent = path.dirname(dir)
        if (parent === dir) break
        dir = parent
    }
    for (const candidate of candidates) {
        try {
            await fs.access(candidate)
            return candidate
        } catch {
            // try next
        }
    }
    throw new Error(
        `runAxe: could not find axe-core/axe.min.js. Searched:\n  ${candidates.join(
            "\n  ",
        )}\nRun cycle-4/harness/install-harness.sh first.`,
    )
}

let _axeSrcCache = null

async function loadAxeSource() {
    if (_axeSrcCache) return _axeSrcCache
    const axePath = await resolveAxeSource()
    _axeSrcCache = await fs.readFile(axePath, "utf8")
    return _axeSrcCache
}

/**
 * @typedef {Object} AxeRunResult
 * @property {string} surface
 * @property {string} url
 * @property {Array<object>} violations
 * @property {Array<object>} passes
 * @property {Array<object>} incomplete
 * @property {Array<object>} inapplicable
 * @property {string} runAt — ISO timestamp the sweep completed
 */

/**
 * Run an axe-core sweep against the current page. Returns the raw axe result
 * augmented with `surface` (caller-supplied label) and `url` (page.url()).
 *
 * Usage assumes Playwright `page`; the only `page` methods called are
 * `addScriptTag({content})`, `evaluate()`, and `url()` so any Playwright
 * version since 1.x works. Does NOT navigate or wait — caller is responsible
 * for ensuring the page is in the state it wants probed.
 *
 * @param {import('playwright').Page} page
 * @param {string} surface  - free-form label for grouping ("library-route",
 *                            "perform-setlist-bar-mitzvah", etc.)
 * @returns {Promise<AxeRunResult>}
 */
export async function runAxe(page, surface) {
    if (!page) throw new Error("runAxe: page is required")
    if (!surface) throw new Error("runAxe: surface label is required")
    const axeSrc = await loadAxeSource()
    // Inject — `content` not `url` because CSP would block the latter under
    // strict `script-src`. Idempotent: if `axe` is already on window we skip
    // the re-inject so callers can `runAxe(page, ...)` repeatedly on the same
    // page after DOM mutations.
    const alreadyInjected = await page.evaluate(
        () => typeof (window /** @type {any} */).axe !== "undefined",
    )
    if (!alreadyInjected) {
        await page.addScriptTag({ content: axeSrc })
    }
    const axeResult = await page.evaluate(async () => {
        // eslint-disable-next-line no-undef
        return await window.axe.run(document, {
            resultTypes: ["violations", "passes", "incomplete", "inapplicable"],
        })
    })
    return {
        surface,
        url: page.url(),
        violations: axeResult.violations,
        passes: axeResult.passes,
        incomplete: axeResult.incomplete,
        inapplicable: axeResult.inapplicable,
        runAt: new Date().toISOString(),
    }
}
