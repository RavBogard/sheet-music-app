import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

/**
 * v54-02-01 (Harness Fidelity Gate phase 1): SEPARATE vitest config for tests
 * that need the Firebase Local Emulator Suite. Opt-in only — invoked via
 * `npm run test:emulator` which wraps the run with `firebase emulators:exec`.
 *
 * Why a separate config (vs. globalSetup in main config): emulator startup
 * adds ~10-15s per run on a warm cache and downloads JARs on first run.
 * Including emulator tests in the default `vitest run` would make every
 * dev-loop iteration pay that cost. Tagged subset keeps the main suite fast.
 *
 * Glob: only files matching *.emulator.test.ts(x). Main config's include
 * uses src/**\/*.test.ts(x) — does NOT pick these up because the file
 * extension differs in the prefix.
 *
 * Env: FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST are set by
 * `firebase emulators:exec`; Node firebase-admin SDK auto-detects them
 * (no client-side initialization changes needed in tests).
 */
export default defineConfig({
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./src/test-setup.ts'],
        // Emulator round-trips can be ~5s on cold cache; cushion to 30s
        // so we don't paper over real perf regressions but don't flake on
        // first-run JAR downloads or CI cold-cache.
        testTimeout: 30000,
        include: [
            'src/**/*.emulator.test.ts',
            'src/**/*.emulator.test.tsx',
        ],
        env: {
            SKIP_ENV_VALIDATION: '1',
        },
    },
    resolve: {
        alias: {
            '@': resolve(__dirname, './src'),
            // v70-08-04 'server-only' is a Next.js bundler guard — runtime
            // throws in browser bundles. Vitest isn't a Next.js runtime, so
            // alias it to an empty stub for files (e.g. library-upload.ts)
            // that import it for compile-time safety.
            'server-only': resolve(__dirname, './src/test-stubs/server-only.ts'),
        },
    },
})
