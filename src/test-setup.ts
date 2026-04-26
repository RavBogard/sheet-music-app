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
