import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Regression watchdog for the SHARED rootMainFiles client JavaScript
 * chain (loaded by every route, authed or not, on first paint).
 *
 * Companion file `login-full-payload-size.test.ts` measures the full
 * /login cold-start payload (rootMainFiles + the chunks listed in
 * `/login/page_client-reference-manifest.js` — i.e. everything the
 * browser actually downloads on a fresh /login visit). Use that test
 * to track the band-iPad cold-start cost; use THIS test to track the
 * baseline that affects every page.
 *
 * History note (corrected 2026-05-26 by `bundle-diet-firestore-lazy-import`
 * Phase 0 measurement): the original comment here claimed
 * `src/lib/firebase.ts` eagerly imports `firebase/firestore` at module
 * top contributing "~236 KB of the baseline." That was inferred from a
 * chunk size, not measured — direct grep of every rootMainFiles chunk
 * for `initializeFirestore`/`Firestore`/`persistentLocalCache`/
 * `WebChannel`/`GoogleAuthProvider` signatures returns ZERO matches.
 * The firestore SDK lives in its own chunk (`d94474cc-*.js`, ~236 KB
 * on disk) that is referenced by `/login/page_client-reference-manifest.js`
 * — meaning it preloads on cold /login — but is NOT in rootMainFiles.
 * The companion `login-full-payload-size.test.ts` is the metric that
 * actually catches a firestore lazy-import savings; this test will
 * NOT shrink when that refactor lands. See
 * `.paul/research/bundle-diet-firestore-lazy-import/FINDINGS.md`
 * for the full measurement trail.
 *
 * Why rootMainFiles and not the per-page HTML: cycle-5-fixes-1-sec
 * landed per-request CSP nonces in `src/proxy.ts`, which switched
 * `/login` from a static prerender (`.next/server/app/login.html`) to
 * dynamic SSR — the static HTML no longer exists post-build. The
 * `rootMainFiles` list is the stable always-loaded artifact.
 *
 * Build hygiene: ALWAYS `rm -rf .next && npm run build` before
 * quoting any bundle-size measurement (per the build-hygiene rule from
 * `4cc575444` FINDINGS — stale build-manifest.json can produce
 * arbitrarily inflated totals).
 *
 * Skip behavior: only runs when `.next/build-manifest.json` exists
 * (post-build). Locally: `npm run build` then
 * `npx vitest run src/__tests__/login-bundle-size.test.ts`.
 */

// Tune DOWN as bundle-diet phases land. NEVER tune up without a
// matching follow-up phase to claw back the regression. Current
// baseline (post cycle-5-fixes wave): ~528 KB total — React framework
// vendor chunk (3794) + react-dom (4bd1b696) + polyfills + webpack +
// main-app entry. Headroom: ~10% for incidental package upgrades.
const RAW_BUDGET_BYTES = 593_920 // 580 KB

const NEXT_DIR = join(process.cwd(), '.next')
const BUILD_MANIFEST = join(NEXT_DIR, 'build-manifest.json')

const buildPresent = existsSync(BUILD_MANIFEST)

describe.skipIf(!buildPresent)('shared client JS rootMainFiles size', () => {
    it(`stays under ${(RAW_BUDGET_BYTES / 1024).toFixed(0)} KB raw across all rootMainFiles chunks`, () => {
        const manifest = JSON.parse(readFileSync(BUILD_MANIFEST, 'utf8')) as {
            rootMainFiles?: string[]
            polyfillFiles?: string[]
        }
        const rootMainFiles = manifest.rootMainFiles ?? []
        const polyfillFiles = manifest.polyfillFiles ?? []
        const chunks = Array.from(new Set([...rootMainFiles, ...polyfillFiles]))

        expect(chunks.length, 'expected build-manifest to list at least one rootMainFile').toBeGreaterThan(0)

        let totalBytes = 0
        const sizes: Array<{ chunk: string; bytes: number }> = []
        for (const chunk of chunks) {
            const abs = join(NEXT_DIR, chunk)
            if (!existsSync(abs)) continue
            const { size } = statSync(abs)
            totalBytes += size
            sizes.push({ chunk, bytes: size })
        }

        if (totalBytes > RAW_BUDGET_BYTES) {
            const report = sizes
                .sort((a, b) => b.bytes - a.bytes)
                .map(({ chunk, bytes }) =>
                    `  ${(bytes / 1024).toFixed(1).padStart(7)} KB  ${chunk}`,
                )
                .join('\n')
            throw new Error(
                `Shared rootMainFiles client JS exceeded budget.\n` +
                    `  total raw: ${(totalBytes / 1024).toFixed(1)} KB\n` +
                    `  budget:    ${(RAW_BUDGET_BYTES / 1024).toFixed(1)} KB\n` +
                    `  chunks:\n${report}\n` +
                    `If this regression is intentional (Daniel-approved), tune ` +
                    `RAW_BUDGET_BYTES in this test. Otherwise, find the new ` +
                    `import that pulled extra modules into the unauth path ` +
                    `and lazy-import it.`,
            )
        }

        expect(totalBytes).toBeLessThanOrEqual(RAW_BUDGET_BYTES)
    })
})
