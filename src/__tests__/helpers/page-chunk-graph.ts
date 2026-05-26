import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Per-page chunk-graph extraction helper for app-router bundle-diet
 * regression guards.
 *
 * Companion to `src/__tests__/login-bundle-size.test.ts`. That test
 * measures total KB across `rootMainFiles`; this helper exposes the
 * MODULE-PRESENCE shape that lets a regression guard fail when a
 * named-and-banned module re-enters a route's preload chunk graph
 * (even if the total KB delta stays under the existing budget).
 *
 * **Manifest shape.** App-router pages emit a per-page client chunk
 * at `.next/static/chunks/app/<route>/page-<hash>.js`. The bottom
 * of that chunk ends with the webpack-runtime preload directive:
 *
 *   …,e=>{e.O(0,[7153,5563,8409,9304,8754,7737,…,3794,7358],()=>e(e.s=46427)),_N_E=e.O()}]);
 *                     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
 *                     numeric chunk-IDs the page module waits on
 *                     before its top-level body executes
 *
 * Each chunk-ID resolves to a file `static/chunks/<id>-<hash>.js`.
 * Some IDs don't have a matching file (framework-merged / empty /
 * sourcemap-only); those are dropped from the resolved set — a guard
 * can only assert about chunks it can actually read.
 *
 * **Manifest read order.** Per `[[feedback_bundle_size_stale_next_artifact]]`
 * the caller MUST run `rm -rf .next && npm run build` before invoking
 * this helper for any verdict. A stale `.next/` produces a stale
 * chunk-graph and a misleading PASS/FAIL.
 */

const NEXT_DIR = join(process.cwd(), '.next')
const STATIC_CHUNKS_DIR = join(NEXT_DIR, 'static', 'chunks')

export interface PageChunkGraph {
    /**
     * Absolute paths to every chunk file that contributes to the
     * page's first-paint preload set: the page-chunk itself plus
     * every resolvable chunk in the page-chunk's `e.O(0, [ids], …)`
     * preload list. Deduped.
     */
    chunks: string[]
    /**
     * Numeric chunk-IDs parsed out of the page-chunk's `e.O(0, [ids], …)`
     * preload directive, as strings (e.g. `"5543"`). Includes IDs that
     * did not resolve to a chunk file — useful when a forbidden module
     * is known by its chunk-ID prefix.
     */
    moduleIds: string[]
}

/**
 * Build the chunk graph for `/login`.
 *
 * Returns `null` if the post-build artefact is absent — callers should
 * skip the assertion in that case (no build → no verdict).
 */
export function extractLoginChunkGraph(): PageChunkGraph | null {
    return extractPageChunkGraph('login')
}

/**
 * Build the chunk graph for an arbitrary app-router route segment.
 * Internal — `extractLoginChunkGraph` is the V1 public surface; future
 * bundle-diet lanes can promote this to `export` once they verify their
 * page chunk follows the same `e.O(0, [...])` preload-list shape.
 */
function extractPageChunkGraph(route: string): PageChunkGraph | null {
    const pageDir = join(STATIC_CHUNKS_DIR, 'app', route)
    if (!existsSync(pageDir)) return null
    const pageFile = readdirSync(pageDir).find(
        (f) => f.startsWith('page-') && f.endsWith('.js'),
    )
    if (!pageFile) return null
    const pagePath = join(pageDir, pageFile)
    const pageContent = readFileSync(pagePath, 'utf8')

    const moduleIds = parsePreloadIds(pageContent)
    const allChunkFiles = existsSync(STATIC_CHUNKS_DIR)
        ? readdirSync(STATIC_CHUNKS_DIR).filter((f) => f.endsWith('.js'))
        : []
    const resolved: string[] = [pagePath]
    for (const id of moduleIds) {
        const match = allChunkFiles.find((f) => f.startsWith(`${id}-`))
        if (match) resolved.push(join(STATIC_CHUNKS_DIR, match))
    }
    const chunks = Array.from(new Set(resolved))
    return { chunks, moduleIds }
}

/**
 * Parse the `e.O(0, [<ids>], …)` preload directive from a page chunk's
 * minified body. Returns an empty array if no directive is found (e.g.
 * a non-app-router page-chunk shape).
 */
function parsePreloadIds(pageContent: string): string[] {
    const match = pageContent.match(/e\.O\(0,\s*\[([0-9,\s]+)\]/)
    if (!match) return []
    return match[1]
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
}
