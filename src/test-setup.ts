/**
 * Global vitest setup. Loaded via vitest.config.ts `setupFiles`.
 *
 * jsdom doesn't ship `window.matchMedia`. Provide a "matches: false"
 * default — components that read `useMediaQuery('(pointer: coarse)')` get
 * the desktop / non-touch branch in tests by default. Tests that want to
 * verify coarse-pointer behavior should mock `@/hooks/use-media-query`
 * directly via `vi.mock(...)` to override per-case.
 */

import { beforeEach, vi } from 'vitest'
import { setMockMembershipRole } from '@/test-stubs/tenant-claims'

// SEC-02: the mocked membership role (test-stubs/tenant-claims) never carries
// over from one test to the next; a test that wants one calls mockAuth.
beforeEach(() => setMockMembershipRole(null))

if (typeof window !== 'undefined' && !window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: vi.fn((query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            addListener: vi.fn(),
            removeListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })),
    })
}

// jsdom's Blob omits arrayBuffer()/text(); real browsers + the band's iPad WebKit
// implement them, and offline-idb's WebKit-safe storage path calls blob.arrayBuffer().
// Polyfill via FileReader so unit tests exercise the real code path. (Node's own
// Blob HAS these, so the guard skips the polyfill in node-env tests.)
if (typeof Blob !== 'undefined' && typeof Blob.prototype.arrayBuffer !== 'function') {
    Object.defineProperty(Blob.prototype, 'arrayBuffer', {
        configurable: true,
        value(this: Blob) {
            return new Promise<ArrayBuffer>((resolve, reject) => {
                const fr = new FileReader()
                fr.onload = () => resolve(fr.result as ArrayBuffer)
                fr.onerror = () => reject(fr.error)
                fr.readAsArrayBuffer(this)
            })
        },
    })
}
if (typeof Blob !== 'undefined' && typeof Blob.prototype.text !== 'function') {
    Object.defineProperty(Blob.prototype, 'text', {
        configurable: true,
        value(this: Blob) {
            return new Promise<string>((resolve, reject) => {
                const fr = new FileReader()
                fr.onload = () => resolve(String(fr.result))
                fr.onerror = () => reject(fr.error)
                fr.readAsText(this)
            })
        },
    })
}

// Multi-tenant phase 7: prime the i18n message cache (every language) so a
// component rendered without <I18nProvider> shows English from the real
// catalogue, exactly as it does in the app.
import '@/i18n/catalogues'
