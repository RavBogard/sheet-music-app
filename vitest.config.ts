import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
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
        testTimeout: 10000,
        include: [
            'src/**/*.test.ts',
            'src/**/*.test.tsx',
            'bridge/src/**/*.test.ts',
            'scripts/**/*.test.ts',
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
