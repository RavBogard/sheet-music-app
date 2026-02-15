import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('logger', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
    })

    it('always logs errors regardless of environment', async () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const { logger } = await import('./logger')
        logger.error('test error')
        expect(spy).toHaveBeenCalledWith('test error')
    })

    it('exports all expected methods', async () => {
        const { logger } = await import('./logger')
        expect(typeof logger.log).toBe('function')
        expect(typeof logger.warn).toBe('function')
        expect(typeof logger.error).toBe('function')
        expect(typeof logger.info).toBe('function')
        expect(typeof logger.debug).toBe('function')
    })

    it('error passes through multiple arguments', async () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const { logger } = await import('./logger')
        logger.error('msg', { detail: 123 }, 'extra')
        expect(spy).toHaveBeenCalledWith('msg', { detail: 123 }, 'extra')
    })
})
