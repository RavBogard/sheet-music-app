/**
 * Tests for the IndexedDB library cache layer.
 * 
 * Since IndexedDB is not available in Node.js, these tests verify
 * the graceful degradation behavior (all functions return null/void
 * when window is undefined).
 */

import { describe, it, expect } from 'vitest'
import {
    getCachedLibrary,
    setCachedLibrary,
    getCachedTimestamp,
    clearLibraryCache,
} from './library-cache'

describe('Library Cache — Server-Side Graceful Degradation', () => {
    it('getCachedLibrary returns null when no window', async () => {
        const result = await getCachedLibrary()
        expect(result).toBeNull()
    })

    it('setCachedLibrary completes without error when no window', async () => {
        await expect(setCachedLibrary([], '2026-01-01')).resolves.toBeUndefined()
    })

    it('getCachedTimestamp returns null when no window', async () => {
        const result = await getCachedTimestamp()
        expect(result).toBeNull()
    })

    it('clearLibraryCache completes without error when no window', async () => {
        await expect(clearLibraryCache()).resolves.toBeUndefined()
    })
})
