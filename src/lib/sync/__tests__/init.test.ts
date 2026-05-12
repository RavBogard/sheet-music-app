import { describe, expect, it } from 'vitest'

import { checkUpdatePrecondition } from '../init'

/**
 * T1.3 (2026-05-12) — unit tests for the precondition helper that the
 * production Firestore adapter uses. The pre-T1.3 inline guard had a
 * `remoteMs !== undefined && remoteMs !== expectedMs` short-circuit that
 * silently passed when local expected a stamp but remote had none —
 * silent LWW on pre-stamp legacy data. These tests lock the corrected
 * semantics in.
 */
describe('checkUpdatePrecondition', () => {
    it('no expectation + no remote stamp → pass (no precondition)', () => {
        expect(checkUpdatePrecondition(undefined, undefined)).toBeNull()
    })

    it('no expectation + remote stamp → pass (first write semantics)', () => {
        expect(checkUpdatePrecondition(undefined, 1000)).toBeNull()
    })

    it('expected stamp matches remote → pass', () => {
        expect(checkUpdatePrecondition(1000, 1000)).toBeNull()
    })

    it('expected stamp differs from remote → fail', () => {
        const err = checkUpdatePrecondition(1000, 2000)
        expect(err).not.toBeNull()
        expect(err).toContain('1000')
        expect(err).toContain('2000')
    })

    /** The bug-of-record. Pre-T1.3 this returned null (silent LWW). */
    it('expected stamp set + remote stamp undefined → FAIL (regression for silent LWW)', () => {
        const err = checkUpdatePrecondition(1000, undefined)
        expect(err).not.toBeNull()
        expect(err).toContain('1000')
        expect(err).toContain('undefined')
    })

    it('expected stamp 0 + remote 0 → pass (zero is a valid stamp)', () => {
        expect(checkUpdatePrecondition(0, 0)).toBeNull()
    })

    it('expected stamp 0 + remote undefined → fail', () => {
        const err = checkUpdatePrecondition(0, undefined)
        expect(err).not.toBeNull()
    })
})
