import type { BrowserContext, Page } from '@playwright/test'

import { loginAsTestUser, signInWebSdk } from './auth'

/** Rows in the device's local songs table (the pickers' data). */
export function localSongCount(page: Page): Promise<number> {
    return page.evaluate(
        () =>
            new Promise<number>((res) => {
                const r = indexedDB.open('crc-local')
                r.onsuccess = () => {
                    try {
                        const c = r.result.transaction('songs', 'readonly').objectStore('songs').count()
                        c.onsuccess = () => res(c.result)
                        c.onerror = () => res(0)
                    } catch {
                        res(0)
                    }
                }
                r.onerror = () => res(0)
            }),
    )
}

/**
 * Open a setlist's editor signed in the way a real iPad is: cookie session
 * AND Web-SDK session, both in place before the page's songs listener starts.
 *
 * Signing the Web SDK in after the editor has mounted leaves its songs
 * listener denied for good (Firestore ends a listener on permission-denied),
 * and reloading the editor raises a sync conflict. So: sign in on /library,
 * reload it once, then open the editor — and if the local songs table still
 * has not filled, sign in again and retry (the harness's session restore is
 * not always ready in time). Returns false when it never fills; callers skip,
 * because that is a harness failure, not a product result.
 */
export async function openSetlistEditorSignedIn(
    page: Page,
    context: BrowserContext,
    baseURL: string,
    bearer: string,
    setlistId: string,
): Promise<boolean> {
    await loginAsTestUser(context, baseURL, bearer)
    await page.goto('/library', { waitUntil: 'domcontentloaded' })
    const { customToken } = await loginAsTestUser(context, baseURL, bearer)
    const web = await signInWebSdk(page, customToken ?? '', { required: false })
    if (!web.signedIn) return false
    await page.waitForLoadState('load', { timeout: 10_000 }).catch(() => {})
    await page.waitForTimeout(3000)
    await page.reload({ waitUntil: 'load' })
    await page.waitForTimeout(3000)

    for (let attempt = 0; attempt < 3; attempt++) {
        await page.goto(`/setlists/${setlistId}`, { waitUntil: 'domcontentloaded' })
        for (let i = 0; i < 15; i++) {
            await page.waitForTimeout(1000)
            if ((await localSongCount(page)) > 0) return true
        }
        const again = await loginAsTestUser(context, baseURL, bearer)
        await signInWebSdk(page, again.customToken ?? '', { required: false })
        await page.waitForTimeout(2000)
    }
    return false
}
