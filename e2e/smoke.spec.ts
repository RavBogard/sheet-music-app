import { test, expect } from '@playwright/test'

/**
 * Smoke tests that run in CI without real Firebase credentials.
 * The app requires authentication, so we can only test:
 * - The app shell loads (Next.js renders without crashing)
 * - Static assets are served (manifest, etc.)
 * - Routes return valid HTTP responses (not 500s)
 */

test.describe('App Shell', () => {
    test('homepage returns 200 and renders', async ({ page }) => {
        const response = await page.goto('/')
        expect(response?.status()).toBe(200)
        await expect(page.locator('body')).toBeVisible()
    })

    test('app routes return valid responses (not 500)', async ({ page }) => {
        for (const path of ['/', '/library', '/setlists', '/settings']) {
            const response = await page.goto(path)
            expect(response?.status(), `${path} should not 500`).not.toBe(500)
        }
    })

    test('unknown route returns 404', async ({ page }) => {
        const response = await page.goto('/this-page-does-not-exist')
        expect(response?.status()).toBe(404)
    })
})

test.describe('Static Assets', () => {
    test('manifest.json is accessible and valid', async ({ page }) => {
        const response = await page.goto('/manifest.json')
        expect(response?.status()).toBe(200)
        const manifest = await response?.json()
        expect(manifest).toHaveProperty('name')
        expect(manifest).toHaveProperty('icons')
    })
})

test.describe('Build Integrity', () => {
    test('page loads without chunk errors', async ({ page }) => {
        const consoleErrors: string[] = []
        page.on('console', msg => {
            if (msg.type() === 'error') consoleErrors.push(msg.text())
        })

        await page.goto('/')
        await page.waitForTimeout(2000)

        // Filter out expected errors (Firebase auth without real credentials)
        const chunkErrors = consoleErrors.filter(e =>
            e.includes('ChunkLoadError') ||
            e.includes('Loading chunk') ||
            e.includes('Unexpected token')
        )
        expect(chunkErrors).toHaveLength(0)
    })
})
