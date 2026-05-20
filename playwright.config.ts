import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: process.env.CI ? 'github' : 'html',
    timeout: 30_000,

    use: {
        baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
    },

    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'mobile-chrome',
            use: { ...devices['Pixel 5'] },
        },
        // ipad-uat-harness lane: the band runs Perform mode on 6× standard
        // 11" iPads (10th/11th gen, ~10.9"), whose portrait CSS viewport is
        // 820×1180 @ deviceScaleFactor 2. Playwright ships no exact descriptor
        // for it, so spread a WebKit base (Safari's real engine — closest to
        // iOS without hardware; gives the WebKit UA + hasTouch + scale) and
        // OVERRIDE the viewport to the real 820×1180. The viewport override is
        // the load-bearing part; the base descriptor is only there for the
        // engine/UA/touch/scale. Portrait is the primary orientation (music
        // stand); landscape variant added for the cheap second axis.
        {
            name: 'ipad-webkit',
            use: {
                ...devices['iPad Pro 11'],
                viewport: { width: 820, height: 1180 },
            },
        },
        {
            name: 'ipad-webkit-landscape',
            use: {
                ...devices['iPad Pro 11 landscape'],
                viewport: { width: 1180, height: 820 },
            },
        },
    ],

    // Set PLAYWRIGHT_USE_REMOTE=1 to skip the local dev server entirely
    // and point PLAYWRIGHT_BASE_URL at a deployed origin (e.g. prod).
    // Used by the F-023 UAT which runs against www.centralreform.live.
    webServer: process.env.PLAYWRIGHT_USE_REMOTE
        ? undefined
        : {
              command: process.env.CI ? 'npx next start' : 'npm run dev',
              url: 'http://localhost:3000',
              reuseExistingServer: !process.env.CI,
              timeout: 120_000,
          },
})
