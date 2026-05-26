import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'

/**
 * Per-route preload-graph extractor + bundle-size summer for app-router
 * cold-start regression guards.
 *
 * Single source of truth shared by:
 *   - `src/__tests__/login-bundle-size.test.ts` (rootMainFiles slice, orthogonal)
 *   - `src/__tests__/login-full-payload-size.test.ts` (full cold-start payload)
 *   - `src/__tests__/login-import-graph-regression.test.ts` (module-presence guard)
 *
 * **Why this exists (2026-05-26).** The first iteration of
 * `login-full-payload-size.test.ts` regex-extracted every
 * `<hash>-<hash>.js` string from
 * `.next/server/app/login/page_client-reference-manifest.js`. That
 * manifest is Next.js's GLOBALLY AGGREGATED client-module registry, NOT
 * a per-route preload list — references from sibling `(main)` components
 * (`authed-query-provider`, `Footer`, `LazyClientComponents`,
 * `PageTransition`, `AppNavigation`, `DashboardClient`) all got pulled
 * into the `/login` total. Result: ~1600 KB reported vs the actual
 * ~735 KB cold-start payload (per coder-1's empirical measurement at
 * `d04f21c4` after the firestore-lazy-import refactor landed).
 *
 * This module replaces that regex with the per-route preload-graph walk
 * already used by `login-import-graph-regression.test.ts`: parse the
 * webpack-runtime `e.O(0, [<ids>], …)` directive emitted at the bottom
 * of `.next/static/chunks/app/<route>/page-<hash>.js`, resolve each
 * numeric ID to its chunk file under `.next/static/chunks/`, and sum
 * sizes (union with rootMainFiles + polyfills, deduped).
 *
 * **Build hygiene.** Per `[[feedback_bundle_size_stale_next_artifact]]`
 * every caller MUST `rm -rf .next && SKIP_ENV_VALIDATION=1 npm run build`
 * before invoking this module for a verdict. A stale `.next/` produces a
 * stale graph and a misleading PASS/FAIL.
 *
 * **Skip behaviour.** Callers should guard with `existsSync` on the
 * artefacts they need (`.next/build-manifest.json` for size summing;
 * `.next/static/chunks/app/<route>/` for graph extraction) so the
 * suite is GREEN when nothing has been built.
 */

const NEXT_DIR = join(process.cwd(), '.next')
const STATIC_CHUNKS_DIR = join(NEXT_DIR, 'static', 'chunks')
const BUILD_MANIFEST = join(NEXT_DIR, 'build-manifest.json')

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

export interface RoutePayloadMeasurement {
    /** Total bytes across the deduped union below. */
    totalBytes: number
    /**
     * Per-chunk breakdown, sorted descending by size. `root` is true
     * for chunks pulled in via `build-manifest.json#rootMainFiles` or
     * `polyfillFiles` (i.e. loaded on every route).
     */
    chunks: Array<{ chunk: string; bytes: number; root: boolean }>
    /** Resolved page-graph from `extractPageChunkGraph` (or null if the page chunk is absent). */
    graph: PageChunkGraph | null
    /** rootMainFiles + polyfillFiles raw paths (relative to `.next/`). */
    rootChunkPaths: string[]
}

/**
 * Build the chunk graph for `/login`. Returns `null` if the post-build
 * artefact is absent.
 */
export function extractLoginChunkGraph(): PageChunkGraph | null {
    return extractPageChunkGraph('login')
}

/**
 * Build the chunk graph for an arbitrary app-router route segment.
 *
 * For `/foo` pass `'foo'`; for `/foo/bar` pass `'foo/bar'` (the helper
 * concatenates onto `.next/static/chunks/app/`).
 */
export function extractPageChunkGraph(route: string): PageChunkGraph | null {
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
 * Measure the FULL cold-start client-JS payload for `route`:
 * rootMainFiles + polyfills + the route's per-page preload graph,
 * unioned and deduped.
 *
 * Returns `null` if either `build-manifest.json` or the page chunk for
 * `route` is absent — callers should skip the assertion in that case.
 *
 * Use the returned `chunks` breakdown for failure reports (sorted
 * descending by size, with a `root` flag distinguishing always-loaded
 * vendor chunks from route-specific ones).
 */
export function measureRoutePayload(route: string): RoutePayloadMeasurement | null {
    if (!existsSync(BUILD_MANIFEST)) return null
    const graph = extractPageChunkGraph(route)
    if (!graph) return null

    const manifest = JSON.parse(readFileSync(BUILD_MANIFEST, 'utf8')) as {
        rootMainFiles?: string[]
        polyfillFiles?: string[]
    }
    const rootMainFiles = manifest.rootMainFiles ?? []
    const polyfillFiles = manifest.polyfillFiles ?? []
    const rootChunkPaths = Array.from(new Set([...rootMainFiles, ...polyfillFiles]))
    const rootSet = new Set(rootChunkPaths.map((p) => basename(p)))

    // Union: rootMainFiles + polyfills + per-route preload chunks. Root
    // entries are stored as `.next/`-relative (`static/chunks/...`); graph
    // entries are absolute paths under `.next/`. We dedupe by basename to
    // catch the case where a chunk appears in BOTH sets (e.g. the
    // framework webpack-runtime chunk).
    const seenBasenames = new Set<string>()
    const breakdown: Array<{ chunk: string; bytes: number; root: boolean }> = []

    const pushIfNew = (abs: string, displayPath: string, root: boolean) => {
        const b = basename(abs)
        if (seenBasenames.has(b)) return
        if (!existsSync(abs)) return
        seenBasenames.add(b)
        const { size } = statSync(abs)
        breakdown.push({ chunk: displayPath, bytes: size, root })
    }

    for (const rel of rootChunkPaths) {
        pushIfNew(join(NEXT_DIR, rel), rel, true)
    }
    for (const abs of graph.chunks) {
        // graph chunks are absolute paths under STATIC_CHUNKS_DIR; rewrite
        // to `.next/`-relative for nicer report output.
        const rel = abs.startsWith(NEXT_DIR + (process.platform === 'win32' ? '\\' : '/'))
            ? abs.slice(NEXT_DIR.length + 1).replace(/\\/g, '/')
            : abs
        pushIfNew(abs, rel, rootSet.has(basename(abs)))
    }

    breakdown.sort((a, b) => b.bytes - a.bytes)
    const totalBytes = breakdown.reduce((sum, entry) => sum + entry.bytes, 0)
    return { totalBytes, chunks: breakdown, graph, rootChunkPaths }
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
