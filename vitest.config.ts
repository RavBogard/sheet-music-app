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
        env: {
            // Skip @t3-oss/env-nextjs validation — tests don't need real Firebase creds
            SKIP_ENV_VALIDATION: '1',
        },
    },
    resolve: {
        alias: {
            '@': resolve(__dirname, './src'),
        },
    },
})
