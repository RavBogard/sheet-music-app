import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { measureRoutePayload } from '@/test-utils/per-route-bundle-size'

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
 *   - THIS test (/login full cold-start payload): rootMainFiles +
 *     polyfills + the chunks reachable from /login's PER-ROUTE preload
 *     graph (parsed from the webpack-runtime `e.O(0, [<ids>], …)`
 *     directive at the bottom of `.next/static/chunks/app/login/page-<hash>.js`).
 *     This is what the browser actually downloads on cold-load —
 *     including any firestore/react-query/etc chunks if they re-enter
 *     /login's import chain.
 *
 * **Methodology history (2026-05-26).** The first version of this test
 * regex-extracted every `<hash>-<hash>.js` reference from
 * `.next/server/app/login/page_client-reference-manifest.js`. That
 * manifest is Next.js's GLOBALLY AGGREGATED client-module registry,
 * NOT a per-route preload list. References from sibling `(main)`-area
 * components (`authed-query-provider`, `Footer`, `LazyClientComponents`,
 * `PageTransition`, `AppNavigation`, `DashboardClient`) got pulled
 * into the /login total, inflating the measurement to ~1600 KB vs the
 * actual ~735 KB cold-start payload (per coder-1's empirical measurement
 * after the `firestore-lazy-import-refactor` ship `d04f21c4`).
 *
 * This refactor (`bundle-size-test-methodology-fix` lane, coder-2,
 * 2026-05-26) replaces that regex with the same per-route graph walker
 * `login-import-graph-regression.test.ts` already uses — single source
 * of truth in `src/test-utils/per-route-bundle-size.ts`.
 *
 * Why both: the rootMainFiles test catches generic vendor drift but
 * silently misses gains from page-graph lazy-import refactors
 * (firestore lazy, react-query lazy in authed-only layouts, etc.).
 * THIS test catches those gains as regressions go DOWN, and catches
 * future code that drags new modules into /login's preload graph as
 * regressions go UP.
 *
 * Build hygiene: ALWAYS `rm -rf .next && npm run build` before
 * quoting this test as evidence of a regression. Stale manifests
 * produce arbitrarily wrong totals — see
 * `[[feedback_bundle_size_stale_next_artifact]]`.
 *
 * Skip behavior: only runs when both `build-manifest.json` and the
 * /login page chunk exist post-build. Locally:
 *   ```
 *   rm -rf .next && SKIP_ENV_VALIDATION=1 npm run build
 *   npx vitest run src/__tests__/login-full-payload-size.test.ts
 *   ```
 */

// Tune DOWN as bundle-diet phases land. NEVER tune up without a
// matching follow-up phase to claw back the regression.
//
// Baseline (2026-05-26, post `firestore-lazy-import-refactor` `d04f21c4`,
// measured by coder-1's empirical per-route preload walk): 735.4 KB
// across 11 chunks at /login.
//
// Budget: 778_240 bytes = 760 KB (~3.4% headroom over 735.4 KB).
// Headroom intentionally tight — this is the cold-start payload band
// iPads pay on shul WiFi, and we want any future regression caught at
// the lane that introduced it rather than swallowed under a fat budget.
const RAW_BUDGET_BYTES = 778_240 // 760 KB

const NEXT_DIR = join(process.cwd(), '.next')
const BUILD_MANIFEST = join(NEXT_DIR, 'build-manifest.json')
const LOGIN_PAGE_DIR = join(NEXT_DIR, 'static', 'chunks', 'app', 'login')

const buildPresent = existsSync(BUILD_MANIFEST) && existsSync(LOGIN_PAGE_DIR)

describe.skipIf(!buildPresent)('full /login cold-start payload size', () => {
    it(`stays under ${(RAW_BUDGET_BYTES / 1024).toFixed(0)} KB raw across rootMainFiles + /login per-route preload graph`, () => {
        const measurement = measureRoutePayload('login')
        expect(measurement, 'expected measureRoutePayload(login) to resolve post-build').not.toBeNull()
        const { totalBytes, chunks } = measurement!

        expect(
            chunks.length,
            'expected rootMainFiles + /login preload graph to list at least one chunk',
        ).toBeGreaterThan(0)

        // Sanity guard against stale-manifest contamination
        // ([[feedback_bundle_size_stale_next_artifact]]): under the
        // correct per-route methodology /login resolves to ~11-15 chunks,
        // not 30+; if we see an inflated count the build is stale.
        expect(
            chunks.length,
            'unusual chunk count — likely a stale `.next/` artifact; `rm -rf .next && npm run build` first',
        ).toBeLessThan(40)

        if (totalBytes > RAW_BUDGET_BYTES) {
            const report = chunks
                .map(
                    ({ chunk, bytes, root }) =>
                        `  ${(bytes / 1024).toFixed(1).padStart(7)} KB  ${
                            root ? '[ROOT]' : '[extra]'
                        }  ${chunk}`,
                )
                .join('\n')
            throw new Error(
                `/login full cold-start payload exceeded budget.\n` +
                    `  total raw: ${(totalBytes / 1024).toFixed(1)} KB across ${chunks.length} chunks\n` +
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
