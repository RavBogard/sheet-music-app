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
