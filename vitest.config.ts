import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

// Strip Node `#!`-shebangs from local `.mjs`/`.cjs`/`.js` source before
// Vite's transform pipeline runs esbuild on them. esbuild flags `#!` as
// `SyntaxError: Invalid or unexpected token` when invoked as a transformer
// (Node strips shebangs at runtime, but Vite never delegates to Node for
// in-test loads). Without this, any `.test.ts` that imports a CLI-style
// script (e.g. `scripts/supervisor-prod-bearer.mjs`) fails to load with
// the error surfacing at the importer's line. The shebang is replaced
// in-place (not deleted) so the source line count — and any downstream
// stack-frame line numbers — stay stable. `enforce: 'pre'` runs us before
// Vite's built-in esbuild transform plugin sees the source.
const stripShebangPlugin = {
    name: 'crc:strip-shebang',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
        if (!/\.[mc]?js(\?|$)/.test(id)) return null
        if (!code.startsWith('#!')) return null
        return { code: code.replace(/^#![^\n]*/, '//-shebang-stripped'), map: null }
    },
}

export default defineConfig({
    plugins: [stripShebangPlugin],
    test: {
        environment: 'jsdom',
        globals: true,
        // Global jsdom shims (window.matchMedia for useMediaQuery
        // consumers — defaults to matches:false so tests render the
        // desktop branch unless they explicitly mock useMediaQuery).
        setupFiles: ['./src/test-setup.ts'],
        // 10s default timeout. The 5s default tipped over under parallel
        // pressure once v50-05 grid tests were added (transform queue grew),
        // surfacing a fake-clock race in engine.test.ts AC-4 that passes
        // standalone in ~600ms. 10s leaves plenty of headroom without
        // masking real perf regressions.
        // 2026-05-24: 10s also tipped over (suite grew to ~250 files);
        // bumped to 30s per .paul/research/parallel-load-flakes/FINDINGS.md.
        // hookTimeout added explicit — route-auth.test.ts beforeAll loads.
        testTimeout: 30000,
        hookTimeout: 30000,
        include: [
            'src/**/*.test.ts',
            'src/**/*.test.tsx',
            'bridge/src/**/*.test.ts',
            'scripts/**/*.test.ts',
            // Cycle-5 C5B-META-001: cowork harness lives outside src/.
            // `.mjs` because the harness ships as Node ESM (Playwright-driven).
            // Tests here mock the Playwright `page` so no real browser is
            // launched in the default suite.
            'cycle-4/harness/**/*.test.mjs',
        ],
        // v54-02-01: emulator tests opt-in only via vitest.emulator.config.ts
        // (`npm run test:emulator`). They require Java + a running Firebase
        // Local Emulator Suite, so they MUST NOT run as part of the default
        // `vitest run` flow. Vitest's `*.test.ts` glob also matches
        // `*.emulator.test.ts`, so this exclude is required to keep the
        // main suite emulator-free.
        exclude: [
            '**/node_modules/**',
            '**/dist/**',
            '**/.next/**',
            '**/*.emulator.test.ts',
            '**/*.emulator.test.tsx',
        ],
        env: {
            // Skip @t3-oss/env-nextjs validation — tests don't need real Firebase creds
            SKIP_ENV_VALIDATION: '1',
        },
    },
    resolve: {
        alias: {
            '@': resolve(__dirname, './src'),
            // The `server-only` package throws outside a React Server
            // environment (incl. vitest jsdom). Alias it to a no-op so modules
            // guarded with `import 'server-only'` are testable. (v70-08-04)
            'server-only': resolve(__dirname, './src/test-server-only-stub.ts'),
        },
    },
})
