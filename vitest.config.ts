import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
    test: {
        environment: 'jsdom',
        globals: true,
        include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'bridge/src/**/*.test.ts'],
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
