import { describe, expect, it } from 'vitest'
import {
    collectionIdOf,
    includedFor,
    inLibraryOf,
    isOwnedBy,
    isSharedWith,
    notOwnerMessage,
    ownerOnlyStamp,
    sameStamp,
    stampForCollection,
    storageVisibleTo,
    visibleTo,
} from '@/lib/library/visibility'

describe('visibility.ts (multi-tenant phase 5)', () => {
    const legacy = { orgId: 'crc', collection: 'nava' }
    const unstamped = { title: 'no org' }
    const shared = { orgId: 'nava', collection: 'nava', visibleToOrgs: ['nava', 'crc'], libraryOrgs: ['nava'] }
    const assigned = { orgId: 'nava', collection: 'nava', visibleToOrgs: ['nava', 'crc'], libraryOrgs: ['nava', 'crc'] }

    it('a row without phase-5 fields is visible to, owned by and in the library of its owner only', () => {
        for (const org of ['crc', 'brotherslazaroff', 'nava']) {
            const own = org === 'crc'
            expect(isOwnedBy(legacy, org)).toBe(own)
            expect(visibleTo(legacy, org)).toBe(own)
            expect(inLibraryOf(legacy, org)).toBe(own)
            expect(includedFor(legacy, org, true)).toBe(own)
            expect(visibleTo(unstamped, org)).toBe(own) // missing orgId is crc
        }
    })

    it('shared rows are visible but not owned; only assigned rows join the default library', () => {
        expect(visibleTo(shared, 'crc')).toBe(true)
        expect(isOwnedBy(shared, 'crc')).toBe(false)
        expect(inLibraryOf(shared, 'crc')).toBe(false)
        expect(isSharedWith(shared, 'crc')).toBe(true)
        expect(includedFor(shared, 'crc', false)).toBe(false)
        expect(includedFor(shared, 'crc', true)).toBe(true)
        expect(inLibraryOf(assigned, 'crc')).toBe(true)
        expect(visibleTo(assigned, 'brotherslazaroff')).toBe(false)
        // libraryOrgs never grants more than visibleToOrgs
        expect(inLibraryOf({ orgId: 'nava', libraryOrgs: ['nava', 'crc'], visibleToOrgs: ['nava'] }, 'crc')).toBe(false)
    })

    it('collectionIdOf: stamped id wins, else owner + legacy collection (unknown/missing = core)', () => {
        expect(collectionIdOf({ ...legacy, collectionId: 'x__y' })).toBe('x__y')
        expect(collectionIdOf(legacy)).toBe('crc__nava')
        expect(collectionIdOf({ orgId: 'brotherslazaroff' })).toBe('brotherslazaroff__core')
        expect(collectionIdOf({ orgId: 'crc', collection: 'weird' })).toBe('crc__core')
        expect(collectionIdOf(unstamped)).toBe('crc__core')
    })

    it('stampForCollection: private / listed / all, owner first, assigned joins the library', () => {
        const base = { ownerOrgId: 'nava', sharedWith: ['crc'], assignedTo: [] as string[] }
        expect(stampForCollection('nava__nava', { ...base, visibility: 'private' }, [])).toEqual({
            collectionId: 'nava__nava', visibleToOrgs: ['nava'], libraryOrgs: ['nava'],
        })
        expect(stampForCollection('nava__nava', { ...base, visibility: 'listed' }, []).visibleToOrgs).toEqual(['nava', 'crc'])
        expect(stampForCollection('nava__nava', { ...base, visibility: 'listed', assignedTo: ['crc', 'crc'] }, [])).toEqual({
            collectionId: 'nava__nava', visibleToOrgs: ['nava', 'crc'], libraryOrgs: ['nava', 'crc'],
        })
        expect(stampForCollection('nava__nava', { ...base, visibility: 'private', assignedTo: ['zz'] }, []).visibleToOrgs).toEqual(['nava', 'zz'])
        expect(
            stampForCollection('nava__nava', { ...base, visibility: 'all' }, ['brotherslazaroff', 'crc', 'nava']).visibleToOrgs,
        ).toEqual(['nava', 'brotherslazaroff', 'crc'])
    })

    it('owner-only stamp, storage csv, idempotence check and the refusal wording', () => {
        const s = ownerOnlyStamp(legacy)
        expect(s).toEqual({ collectionId: 'crc__nava', visibleToOrgs: ['crc'], libraryOrgs: ['crc'] })
        expect(sameStamp({ ...legacy, ...s }, s)).toBe(true)
        expect(sameStamp(legacy, s)).toBe(false)
        expect(storageVisibleTo(['nava', 'crc'])).toBe('nava,crc')
        expect(notOwnerMessage('Lakh Amar Libi', 'Nava Tehila')).toBe(
            'Lakh Amar Libi belongs to Nava Tehila; you can use it but not change it.',
        )
    })
})
