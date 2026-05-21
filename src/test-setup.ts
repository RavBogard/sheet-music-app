/**
 * Global vitest setup. Loaded via vitest.config.ts `setupFiles`.
 *
 * jsdom doesn't ship `window.matchMedia`. Provide a "matches: false"
 * default — components that read `useMediaQuery('(pointer: coarse)')` get
 * the desktop / non-touch branch in tests by default. Tests that want to
 * verify coarse-pointer behavior should mock `@/hooks/use-media-query`
 * directly via `vi.mock(...)` to override per-case.
 */

import { vi } from 'vitest'

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
