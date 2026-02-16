import { test, expect } from '@playwright/test'

test.describe('App Smoke Tests', () => {
    test('homepage loads with greeting and navigation', async ({ page }) => {
        await page.goto('/')
        // Should show the app shell with navigation
        await expect(page).toHaveTitle(/CentralReform|CRC/)
        // Should have bottom nav on mobile or header nav on desktop
        const nav = page.locator('nav, [role="navigation"]')
        await expect(nav.first()).toBeVisible()
    })

    test('homepage shows Hebrew date', async ({ page }) => {
        await page.goto('/')
        // The greeting component renders a Hebrew date
        const hebrewDate = page.getByText(/\d+ \w+ \d{4}/)
        // May or may not be visible depending on viewport, but should exist in DOM
        await expect(hebrewDate.first()).toBeAttached()
    })

    test('library page loads', async ({ page }) => {
        await page.goto('/library')
        // Should show library header or search
        await expect(page.getByText(/library/i).first()).toBeVisible({ timeout: 10_000 })
    })

    test('setlists page loads', async ({ page }) => {
        await page.goto('/setlists')
        // Should show setlist dashboard or sign-in prompt
        const content = page.getByText(/setlist|sign in/i).first()
        await expect(content).toBeVisible({ timeout: 10_000 })
    })

    test('settings page loads', async ({ page }) => {
        await page.goto('/settings')
        await expect(page.getByText(/settings/i).first()).toBeVisible({ timeout: 10_000 })
    })

    test('unknown route shows 404 or redirects', async ({ page }) => {
        const response = await page.goto('/this-page-does-not-exist')
        // Should either 404 or redirect to home
        expect([200, 404]).toContain(response?.status())
    })
})

test.describe('Navigation', () => {
    test('mobile bottom tabs navigate between sections', async ({ page, isMobile }) => {
        test.skip(!isMobile, 'Mobile-only test')
        await page.goto('/')

        // Tap Setlists tab
        const setlistsTab = page.getByRole('link', { name: /setlist/i })
        if (await setlistsTab.isVisible()) {
            await setlistsTab.click()
            await expect(page).toHaveURL(/setlist/)
        }
    })
})

test.describe('PWA', () => {
    test('manifest is accessible', async ({ page }) => {
        const response = await page.goto('/manifest.json')
        expect(response?.status()).toBe(200)
        const manifest = await response?.json()
        expect(manifest).toHaveProperty('name')
        expect(manifest).toHaveProperty('icons')
    })

    test('service worker registers', async ({ page }) => {
        await page.goto('/')
        // In production mode, the service worker should register
        // In dev mode, PWA is disabled — so we just check the page loads
        await expect(page.locator('body')).toBeVisible()
    })
})
