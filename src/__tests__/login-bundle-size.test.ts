import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Regression watchdog for the unauthenticated client JavaScript payload.
 *
 * Cycle-5 finding C5B-011 measured the unauth `/login` bundle at ~1247 KB
 * raw across ~22 chunks. The lane's nominal target is <500 KB raw / <200
 * KB gzipped, but that requires a structural refactor — `src/lib/firebase.ts`
 * eagerly imports `firebase/firestore` at module top (~236 KB of the
 * baseline) which any unauth import path drags in. That refactor is
 * deferred to a dedicated follow-up phase.
 *
 * This test enforces the WEAKER but immediately useful guarantee: the
 * shared client JS that every page (authed or not) loads on first paint
 * does not silently regress past today's baseline. CI fails if the sum
 * of `rootMainFiles` in `.next/build-manifest.json` exceeds the budget.
 * Tune the budget DOWN as bundle-diet phases land.
 *
 * Why rootMainFiles and not the per-page HTML: cycle-5-fixes-1-sec
 * landed per-request CSP nonces in `src/proxy.ts`, which switched
 * `/login` from a static prerender (`.next/server/app/login.html`) to
 * dynamic SSR — the static HTML no longer exists post-build. The
 * `rootMainFiles` list (loaded by every route, authed or not) is the
 * stable artifact. It's a subset of the previous /login measurement
 * (the static HTML also pre-referenced async client chunks), so the
 * budget here is correspondingly smaller — when the dynamic-import
 * follow-up phase trims authed-only imports out of the rootMainFiles
 * chain, this budget should drop with it.
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
