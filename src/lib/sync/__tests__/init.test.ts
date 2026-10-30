import { describe, expect, it, vi } from 'vitest'

import { checkUpdatePrecondition, stampTrackOrgForCommit, touchesDerivedTrackField } from '../init'

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

/**
 * Multi-tenant phase 2 - the commit-time layer of track orgId stamping: a
 * track that reaches the outbox without orgId (parent not in Dexie, or queued
 * by a pre-P2 bundle) is stamped from the Firestore parent setlist.
 */
describe('stampTrackOrgForCommit', () => {
    const read = (exists: boolean, orgId?: unknown) =>
        vi.fn(async (_id: string) => (exists ? { exists: true, orgId } : { exists: false }))

    it('stamps an unstamped track from its parent setlist', async () => {
        const r = read(true, 'brotherslazaroff')
        const out = await stampTrackOrgForCommit('tracks', { setlistId: 's1', title: 'x' }, r)
        expect(out).toEqual({ setlistId: 's1', title: 'x', orgId: 'brotherslazaroff' })
        expect(r).toHaveBeenCalledWith('s1')
    })

    it('parent without orgId -> crc', async () => {
        expect((await stampTrackOrgForCommit('tracks', { setlistId: 's1' }, read(true))).orgId).toBe('crc')
    })

    it('keeps an existing orgId and does not read the parent', async () => {
        const r = read(true, 'crc')
        const p = { setlistId: 's1', orgId: 'brotherslazaroff' }
        expect(await stampTrackOrgForCommit('tracks', p, r)).toBe(p)
        expect(r).not.toHaveBeenCalled()
    })

    it('missing parent or a failed read leaves the payload unchanged', async () => {
        const p = { setlistId: 's1' }
        expect(await stampTrackOrgForCommit('tracks', p, read(false))).toBe(p)
        expect(await stampTrackOrgForCommit('tracks', p, vi.fn(async () => { throw new Error('offline') }))).toBe(p)
    })

    it('other collections are untouched', async () => {
        const r = read(true, 'brotherslazaroff')
        const p = { setlistId: 's1' }
        expect(await stampTrackOrgForCommit('setlists', p, r)).toBe(p)
        expect(r).not.toHaveBeenCalled()
    })
})

describe('touchesDerivedTrackField', () => {
    it('re-derives the parent setlist only for a track type or chart change', () => {
        expect(touchesDerivedTrackField({ type: 'header' })).toBe(true)
        expect(touchesDerivedTrackField({ fileId: 'c', songId: 'c' })).toBe(true)
        expect(touchesDerivedTrackField({ key: 'F', notes: 'slow' })).toBe(false)
    })
})
