/**
 * Unit tests for the load-adjusted timing helpers.
 *
 * Covers:
 *   - `LOAD_FACTOR` defaults to 1.5 when the env var is unset.
 *   - Env override accepts positive finite numbers.
 *   - Invalid env values (NaN / negative / zero / non-numeric) fall back
 *     to the default.
 *   - `loadAdjusted(ms)` returns `Math.ceil(ms × LOAD_FACTOR)`.
 *   - `loadAdjustedDelay(ms)` resolves after at least the scaled delay
 *     (real wall-clock — small absolute timing assertion, not a baseline
 *     race).
 *
 * The module reads `process.env.VITEST_LOAD_FACTOR` once at module load,
 * so each test that exercises a different env value does so via
 * `vi.stubEnv` + `vi.resetModules` + dynamic re-import (the pattern
 * established by use-wake-lock flag-gated tests; see
 * `[[feedback_probe_harness_prod_flag]]` lineage).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('load-adjusted-timing', () => {
    beforeEach(() => {
        vi.resetModules()
    })

    afterEach(() => {
        vi.unstubAllEnvs()
        vi.resetModules()
    })

    it('defaults LOAD_FACTOR to 1.5 when env var is unset', async () => {
        vi.stubEnv('VITEST_LOAD_FACTOR', '')
        const mod = await import('../load-adjusted-timing')
        expect(mod.LOAD_FACTOR).toBe(1.5)
    })

    it('honors VITEST_LOAD_FACTOR=2 override', async () => {
        vi.stubEnv('VITEST_LOAD_FACTOR', '2')
        const mod = await import('../load-adjusted-timing')
        expect(mod.LOAD_FACTOR).toBe(2)
    })

    it('honors fractional VITEST_LOAD_FACTOR=1.25 override', async () => {
        vi.stubEnv('VITEST_LOAD_FACTOR', '1.25')
        const mod = await import('../load-adjusted-timing')
        expect(mod.LOAD_FACTOR).toBe(1.25)
    })

    it('falls back to 1.5 when env value is non-numeric', async () => {
        vi.stubEnv('VITEST_LOAD_FACTOR', 'banana')
        const mod = await import('../load-adjusted-timing')
        expect(mod.LOAD_FACTOR).toBe(1.5)
    })

    it('falls back to 1.5 when env value is negative', async () => {
        vi.stubEnv('VITEST_LOAD_FACTOR', '-2')
        const mod = await import('../load-adjusted-timing')
        expect(mod.LOAD_FACTOR).toBe(1.5)
    })

    it('falls back to 1.5 when env value is zero', async () => {
        vi.stubEnv('VITEST_LOAD_FACTOR', '0')
        const mod = await import('../load-adjusted-timing')
        expect(mod.LOAD_FACTOR).toBe(1.5)
    })

    it('loadAdjusted ceil-multiplies by LOAD_FACTOR', async () => {
        vi.stubEnv('VITEST_LOAD_FACTOR', '1.5')
        const mod = await import('../load-adjusted-timing')
        expect(mod.loadAdjusted(100)).toBe(150)
        expect(mod.loadAdjusted(8_000)).toBe(12_000)
        // ceil: 1200 * 1.5 = 1800; 121 * 1.5 = 181.5 → 182
        expect(mod.loadAdjusted(1200)).toBe(1800)
        expect(mod.loadAdjusted(121)).toBe(182)
    })

    it('loadAdjustedDelay resolves after at least the scaled delay (LOAD=2)', async () => {
        vi.stubEnv('VITEST_LOAD_FACTOR', '2')
        const mod = await import('../load-adjusted-timing')
        const start = Date.now()
        await mod.loadAdjustedDelay(40) // expects ≥80ms
        const elapsed = Date.now() - start
        // ≥80 with a generous setTimeout-undershoot tolerance for jsdom +
        // node timer drift on slow CI; we only assert the LOWER bound so
        // a slow runner that pads further still passes.
        expect(elapsed).toBeGreaterThanOrEqual(70)
    })
})
