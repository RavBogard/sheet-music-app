import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Regression watchdog for the FULL /login cold-start client JavaScript
 * payload — what a band iPad actually downloads when visiting /login
 * with an empty cache on shul WiFi.
 *
 * Companion to `login-bundle-size.test.ts`. The two tests measure
 * different things:
 *
 *   - `login-bundle-size.test.ts` (rootMainFiles only): the shared
 *     always-loaded chunks that affect every route. Tracks baseline
 *     vendor weight (React, react-dom, polyfills, webpack runtime,
 *     main-app entry). Blind to anything page-specific.
 *
 *   - THIS test (/login full payload): rootMainFiles + the chunks
 *     listed in `.next/server/app/login/page_client-reference-manifest.js`,
 *     deduped. This is the actual cold-start cost of /login —
 *     including the firestore SDK chunk (`d94474cc-*.js`, ~230 KB
 *     today) and the React Query / Sentry / framework infrastructure
 *     that ride along.
 *
 * Why both: the rootMainFiles test catches generic vendor drift but
 * silently misses gains from page-graph lazy-import refactors
 * (firestore lazy, react-query lazy in authed-only layouts, etc.).
 * THIS test catches those gains as regressions go DOWN, and catches
 * future code that drags new modules into the /login graph as
 * regressions go UP.
 *
 * Origin of this test: `bundle-diet-firestore-lazy-import` Phase 0
 * (2026-05-26) measured /login cold-start at ~1615 KB across 37
 * chunks at base SHA `59e0448c7`, of which:
 *   - 533.9 KB is the rootMainFiles + polyfills slice (the existing
 *     `login-bundle-size.test.ts` budget — passes with 46 KB headroom)
 *   - 1081.8 KB is the /login-extras slice (chunks page_client-reference-
 *     manifest references, including the 230.9 KB firestore SDK chunk)
 *
 * The deferred firestore-lazy-import refactor (separate ~4-6h lane,
 * not this one) should knock the ~230 KB firestore chunk out of
 * /login's preload graph, bringing this total to ~1385 KB. When it
 * lands, tune the budget DOWN to ~1500 KB (10% headroom over the new
 * baseline).
 *
 * Build hygiene: ALWAYS `rm -rf .next && npm run build` before
 * quoting this test as evidence of a regression. Stale manifests
 * (`.next/server/app/login/page_client-reference-manifest.js`
 * referencing chunks from a prior build) produce arbitrarily wrong
 * totals because the byte-counting loop walks the union of stale
 * references + fresh chunks on disk.
 *
 * Skip behavior: only runs when both the build-manifest.json and the
 * /login page_client-reference-manifest.js exist (post-build).
 * Locally: `npm run build` then
 * `npx vitest run src/__tests__/login-full-payload-size.test.ts`.
 */

// Tune DOWN as bundle-diet phases land — particularly the deferred
// firestore-lazy-import refactor which should drop ~230 KB. NEVER tune
// up without a matching follow-up phase to claw back the regression.
//
// Historical baseline at 59e0448c7 (post `refactor(client-providers): hoist
// QueryClientProvider into authed-only layouts`): ~1615 KB / 37 chunks under
// the original 1800 KB budget.
//
// 2026-05-26 budget step-down to 1700 KB after the `firestore-lazy-import-refactor`
// lane (coder-1, base `9d8a75d7d`): Phase 1-4 caller migration + Option B
// (auth-context dynamic-import users-firebase) + Option C-1 (congregation-store
// dynamic-import `doc`/`onSnapshot`) all shipped. Current measurement under
// this test's regex-extract methodology: 1600.3 KB / 37 chunks. Budget tuned
// to ~6% above that (1700 KB) to lock any future regression at this test's
// measurement granularity.
//
// IMPORTANT — measurement caveat (see FINDINGS §6, 2026-05-26): this test
// reads `.next/server/app/login/page_client-reference-manifest.js` which is
// Next.js's GLOBALLY AGGREGATED client-module registry, NOT a per-route
// preload list. It systematically over-counts by ~120% (real /login cold-start
// preload is ~729 KB deduped per the per-route `e.O(0, [...])` directive in
// the page chunk; this test reports ~1600 KB). The architectural cleanup the
// `firestore-lazy-import-refactor` lane shipped IS real (no eager firestore
// SDK symbols at module-top anywhere) but invisible to this test by design.
// The companion test `login-import-graph-regression.test.ts` uses the
// CORRECT per-route methodology via `extractLoginChunkGraph()` — that's
// where future bundle-diet lanes should lock module-presence wins.
//
// A separate methodology-fix lane (supervisor-scoped) will replace this test
// with a per-route SSR-preload reader; until then, the budget below is
// pinned at the over-counted measurement granularity for defense-in-depth.
const RAW_BUDGET_BYTES = 1_740_800 // 1700 KB (~6% headroom over 1600.3 KB)

const NEXT_DIR = join(process.cwd(), '.next')
const BUILD_MANIFEST = join(NEXT_DIR, 'build-manifest.json')
const LOGIN_CLIENT_MANIFEST = join(
    NEXT_DIR,
    'server/app/login/page_client-reference-manifest.js',
)

const buildPresent =
    existsSync(BUILD_MANIFEST) && existsSync(LOGIN_CLIENT_MANIFEST)

describe.skipIf(!buildPresent)('full /login cold-start payload size', () => {
    it(`stays under ${(RAW_BUDGET_BYTES / 1024).toFixed(0)} KB raw across rootMainFiles + /login client chunks`, () => {
        const buildManifest = JSON.parse(
            readFileSync(BUILD_MANIFEST, 'utf8'),
        ) as {
            rootMainFiles?: string[]
            polyfillFiles?: string[]
        }
        const rootMainFiles = buildManifest.rootMainFiles ?? []
        const polyfillFiles = buildManifest.polyfillFiles ?? []

        // Extract chunk filenames referenced by /login's client-reference-
        // manifest. The manifest is a serialized JS object literal; chunk
        // filenames follow the `<hash>-<hash>.js` convention emitted by
        // Next.js's chunk splitter (e.g. `3794-bce20c8ec8cabe66.js`,
        // `d94474cc-e7ba7be0e0bdd8e0.js`, etc.).
        //
        // We regex-extract candidates and then filter to only those that
        // actually exist in `.next/static/chunks/` — the manifest also
        // references module IDs, route paths, and other strings that
        // happen to look chunk-like.
        const loginManifestSrc = readFileSync(LOGIN_CLIENT_MANIFEST, 'utf8')
        const chunkCandidates = Array.from(
            new Set(loginManifestSrc.match(/[a-zA-Z0-9_-]+-[a-z0-9]+\.js/g) ?? []),
        )
        const loginChunks = chunkCandidates
            .map((c) => `static/chunks/${c}`)
            .filter((p) => existsSync(join(NEXT_DIR, p)))

        // Union: rootMainFiles + polyfills + /login client chunks, deduped.
        // This is the set of JS files the browser downloads on first
        // /login visit with an empty cache.
        const chunks = Array.from(
            new Set([...rootMainFiles, ...polyfillFiles, ...loginChunks]),
        )

        expect(
            chunks.length,
            'expected rootMainFiles + /login client manifest to list at least one chunk',
        ).toBeGreaterThan(0)

        // Sanity guard against stale-manifest contamination
        // ([[feedback_bundle_size_stale_next_artifact]]): if either
        // manifest references >100 chunk-shaped strings we likely have
        // a non-deterministic union — flag it rather than silently
        // pretending to measure.
        expect(
            chunks.length,
            'unusual chunk count — likely a stale `.next/` artifact; `rm -rf .next && npm run build` first',
        ).toBeLessThan(100)

        let totalBytes = 0
        const sizes: Array<{ chunk: string; bytes: number; root: boolean }> = []
        const rootSet = new Set([...rootMainFiles, ...polyfillFiles])
        for (const chunk of chunks) {
            const abs = join(NEXT_DIR, chunk)
            if (!existsSync(abs)) continue
            const { size } = statSync(abs)
            totalBytes += size
            sizes.push({ chunk, bytes: size, root: rootSet.has(chunk) })
        }

        if (totalBytes > RAW_BUDGET_BYTES) {
            const report = sizes
                .sort((a, b) => b.bytes - a.bytes)
                .map(
                    ({ chunk, bytes, root }) =>
                        `  ${(bytes / 1024).toFixed(1).padStart(7)} KB  ${
                            root ? '[ROOT]' : '[extra]'
                        }  ${chunk}`,
                )
                .join('\n')
            throw new Error(
                `/login full cold-start payload exceeded budget.\n` +
                    `  total raw: ${(totalBytes / 1024).toFixed(1)} KB across ${sizes.length} chunks\n` +
                    `  budget:    ${(RAW_BUDGET_BYTES / 1024).toFixed(1)} KB\n` +
                    `  chunks:\n${report}\n` +
                    `If this regression is intentional (Daniel-approved), tune ` +
                    `RAW_BUDGET_BYTES in this test. Otherwise, find the new ` +
                    `import that pulled extra modules into the /login client ` +
                    `graph and lazy-import it (dynamic import / async chunk).`,
            )
        }

        expect(totalBytes).toBeLessThanOrEqual(RAW_BUDGET_BYTES)
    })
})
