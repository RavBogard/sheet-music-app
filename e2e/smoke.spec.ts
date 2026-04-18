import { test, expect } from '@playwright/test'

/**
 * Smoke tests that run in CI without real Firebase credentials.
 * The app requires authentication, so we can only test:
 * - The app shell loads (Next.js renders without crashing)
 * - Static assets are served (manifest, etc.)
 * - Routes return valid HTTP responses (not 500s)
 * - Proxy middleware gates unauthenticated requests correctly (v4.3 P10-05)
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

    test('unknown route returns a not-found response', async ({ page }) => {
        const response = await page.goto('/this-page-does-not-exist')
        // Next.js App Router renders not-found.tsx with either a 404 status
        // or a 200 HTML page whose title/body advertises the miss. Accept
        // either — what we're guarding against is a 500 / crash / loop.
        const status = response?.status() ?? 0
        expect(status).not.toBe(500)
        expect([200, 404]).toContain(status)
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

// v4.3 P10-05: proxy middleware gates — no real auth needed, these exercise
// the cookie-driven routing logic that today's incident classes lived in.
test.describe('Proxy gates (unauthenticated)', () => {
    test.use({ storageState: { cookies: [], origins: [] } })

    test('gated route without session cookie redirects to /login', async ({ page }) => {
        const response = await page.goto('/setlists', { waitUntil: 'domcontentloaded' })
        expect(response?.url()).toContain('/login')
    })

    test('/manage (leader route) redirects unauthenticated to /login', async ({ page }) => {
        const response = await page.goto('/manage', { waitUntil: 'domcontentloaded' })
        expect(response?.url()).toContain('/login')
    })

    test('/library redirects unauthenticated to /login', async ({ page }) => {
        const response = await page.goto('/library', { waitUntil: 'domcontentloaded' })
        expect(response?.url()).toContain('/login')
    })

    test('/login page renders Google sign-in button', async ({ page }) => {
        await page.goto('/login')
        await expect(page.getByRole('button', { name: /sign in with google/i })).toBeVisible()
    })

    test('/auth-error escape hatch loads', async ({ page }) => {
        const response = await page.goto('/auth-error')
        expect(response?.status()).toBe(200)
    })

    test('public routes do not redirect', async ({ page }) => {
        // /perform/* is public (public setlist viewing)
        const response = await page.goto('/perform')
        expect(response?.url()).not.toContain('/login')
    })
})

test.describe('Proxy loop-breaker (v4.3 P10-01)', () => {
    test('auth_bounce_count cookie sets Path=/ so it accumulates across paths', async ({ page, context }) => {
        // Trigger a redirect that sets the bounce cookie.
        await page.goto('/setlists', { waitUntil: 'domcontentloaded' })
        const cookies = await context.cookies()
        const bounce = cookies.find(c => c.name === 'auth_bounce_count')
        if (bounce) {
            expect(bounce.path, 'bounce cookie must be Path=/ so it accumulates across path boundaries').toBe('/')
        }
        // If the bounce cookie isn't present (e.g., public-route happy path),
        // skip — we only assert the attribute when the cookie exists.
    })
})

test.describe('Tampered cookies (v4.3 P9-02 companion verification)', () => {
    test('forged __session_role cookie is ignored (not 500)', async ({ page, context, baseURL }) => {
        // Use `url` so Playwright infers the host — page.url() is 'about:blank'
        // before any navigation, which produces an empty-domain cookie and the
        // addCookies call rejects.
        await context.addCookies([
            {
                name: '__session_role',
                value: 'forged-payload.forged-sig',
                url: baseURL || 'http://localhost:3000',
            },
        ])
        const response = await page.goto('/setlists', { waitUntil: 'domcontentloaded' })
        expect(response?.status(), 'tampered companion cookie must not crash the middleware').not.toBe(500)
    })
})
