import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { extractLoginChunkGraph } from '@/test-utils/per-route-bundle-size'

/**
 * Regression-guard for `/login`'s client-chunk import graph.
 *
 * Companion to `src/__tests__/login-bundle-size.test.ts`. That test
 * measures total KB across `rootMainFiles`; this test measures
 * MODULE PRESENCE in `/login`'s per-page preload chunk graph. The
 * two are orthogonal — a banned module can re-enter `/login` under
 * the KB budget (or get traded for a smaller one) without the
 * size test noticing.
 *
 * **What this test asserts.** For each entry in `FORBIDDEN_MODULES`,
 * walk the union of chunk files preloaded by `/login` on cold-load
 * (page chunk + resolved chunk-ID preload list) and FAIL if the
 * module's signature appears in any of them.
 *
 * **The list is append-only-and-deliberate.** Every entry below
 * represents a Daniel-ratified ban: a module the project structurally
 * decided does not belong in `/login`'s unauth import chain. When a
 * future bundle-diet lane lazy-imports a new module out of `/login`,
 * APPEND its signature here so the win is locked in.
 *
 * **Skip behaviour.** Only runs when the `/login` page chunk exists
 * post-build. Locally:
 *   ```
 *   rm -rf .next && npm run build
 *   npx vitest run src/__tests__/login-import-graph-regression.test.ts
 *   ```
 * The `rm -rf .next` is load-bearing — see
 * `[[feedback_bundle_size_stale_next_artifact]]` for the stale-artefact
 * failure mode this protocol prevents.
 */

interface ForbiddenModule {
    /** Human-readable name surfaced in the failure message. */
    name: string
    /**
     * Distinctive string literal(s) expected to appear inside the
     * minified chunk if the module is bundled in. Webpack's terser
     * pass strips package-path comments (e.g. `'@tanstack/react-query'`
     * does NOT survive in the chunk body), so prefer distinctive
     * exported identifiers whose names webpack preserves verbatim and
     * which other production modules do not share. The signature is a
     * union — ANY hit fails the guard. Cross-check uniqueness
     * empirically: search every chunk file for the candidate and
     * confirm only the target module's chunk matches.
     */
    signatures: string[]
    /** Short pointer to the commit that closed this entry's re-entry path. */
    closedBy: string
}

// APPEND-ONLY. Removing or weakening entries requires a Daniel-ratified
// decision logged in `.coord/shared/decisions.md`.
const FORBIDDEN_MODULES: ForbiddenModule[] = [
    {
        name: '@tanstack/react-query',
        // `QueryClientProvider` is the public API name webpack preserves
        // verbatim in chunk 5543-*.js; uniqueness verified at write-time —
        // no other production chunk in the build contains it. `QueryClient`
        // alone is a secondary cross-check; together they collapse the
        // signature-collision risk to near-zero.
        signatures: ['QueryClientProvider', 'QueryClient'],
        closedBy: '42b38044c — coder-5 react-query-lazy-import (hoisted QueryClientProvider out of root client-providers.tsx into (main)+perform-scoped layouts; dropped 15.4 KB chunk 5543-*.js from /login cold-load)',
    },
    {
        name: 'firebase/firestore',
        // `WebChannel` is the Firestore SDK's transport class name; webpack
        // preserves it verbatim in chunk `d94474cc-*.js` (the firestore SDK
        // chunk) and its cousin `1531-*.js`. Uniqueness verified at
        // write-time via signature scan across `.next/static/chunks/*.js`:
        // hits only in firestore SDK chunks themselves — does NOT appear in
        // any other production chunk. Other candidates (`initializeFirestore`,
        // `persistentLocalCache`) leak into chunk `1305-*.js` as JS identifier
        // strings from `src/lib/firebase.ts`'s dynamic-import destructure
        // (`const { initializeFirestore, persistentLocalCache, ... } = await
        // import("firebase/firestore")`), so they cannot serve as forbidden
        // signatures without false-positive on the current GREEN build.
        // See FINDINGS §6.7.
        signatures: ['WebChannel'],
        closedBy: '<filled-at-ship> — coder-1 firestore-lazy-import-refactor (Phase 1-4 caller migration + Option B auth-context + Option C-1 congregation-store; no eager firestore SDK symbols at module-top anywhere reachable from /login; the d94474cc + 1531 chunks remain in the build but are not in /login\'s per-route preload graph)',
    },
    // Future bundle-diet lanes APPEND here:
    //   { name: '@firebase/firestore', signatures: ['<distinctive-api-name>'], closedBy: '<sha> …' },
]

const NEXT_LOGIN_PAGE_DIR = '.next/static/chunks/app/login'
const buildPresent = existsSync(NEXT_LOGIN_PAGE_DIR)

describe.skipIf(!buildPresent)('/login client-chunk-graph regression guard', () => {
    it('does not preload any FORBIDDEN_MODULES on cold-load', () => {
        const graph = extractLoginChunkGraph()
        expect(graph, 'expected extractLoginChunkGraph() to find /login page chunk').not.toBeNull()
        const { chunks, moduleIds } = graph!
        expect(chunks.length, 'expected /login page chunk + ≥1 preload chunk').toBeGreaterThan(1)
        expect(moduleIds.length, 'expected /login page chunk to declare a preload list').toBeGreaterThan(0)

        const offenders: Array<{ module: string; closedBy: string; chunks: string[]; matchedSignature: string }> = []
        for (const forbidden of FORBIDDEN_MODULES) {
            for (const signature of forbidden.signatures) {
                const hits: string[] = []
                for (const chunkPath of chunks) {
                    const body = readFileSync(chunkPath, 'utf8')
                    if (body.includes(signature)) hits.push(basename(chunkPath))
                }
                if (hits.length > 0) {
                    offenders.push({
                        module: forbidden.name,
                        closedBy: forbidden.closedBy,
                        chunks: hits,
                        matchedSignature: signature,
                    })
                    break // one signature hit is enough; don't double-report the same module
                }
            }
        }

        if (offenders.length > 0) {
            const report = offenders
                .map(
                    (o) =>
                        `  ${o.module}\n` +
                        `    matched signature: ${o.matchedSignature}\n` +
                        `    re-entered via: ${o.chunks.join(', ')}\n` +
                        `    originally closed by: ${o.closedBy}`,
                )
                .join('\n')
            throw new Error(
                `/login client-chunk preload graph re-introduced banned modules.\n` +
                    `If this is intentional (Daniel-ratified), remove the entry from\n` +
                    `FORBIDDEN_MODULES in this test AND log the decision in\n` +
                    `.coord/shared/decisions.md. Otherwise, find the new top-level\n` +
                    `import that pulled this module back into the /login chain and\n` +
                    `lazy-import it behind an authed-only boundary (see commit ${FORBIDDEN_MODULES[0].closedBy.split(' — ')[0]} for the canonical pattern).\n\n` +
                    `Offenders:\n${report}`,
            )
        }

        expect(offenders).toEqual([])
    })
})
