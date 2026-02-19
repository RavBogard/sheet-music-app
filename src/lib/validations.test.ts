import { describe, it, expect } from 'vitest'
import { transferSetlistSchema, createSetlistSchema, updateRoleSchema } from './validations'

describe('transferSetlistSchema', () => {
    it('accepts valid transfer data', () => {
        const result = transferSetlistSchema.safeParse({
            setlistId: 'abc123',
            newOwnerEmail: 'user@example.com'
        })
        expect(result.success).toBe(true)
    })

    it('rejects empty setlistId', () => {
        const result = transferSetlistSchema.safeParse({
            setlistId: '',
            newOwnerEmail: 'user@example.com'
        })
        expect(result.success).toBe(false)
    })

    it('rejects missing setlistId', () => {
        const result = transferSetlistSchema.safeParse({
            newOwnerEmail: 'user@example.com'
        })
        expect(result.success).toBe(false)
    })

    it('rejects invalid email', () => {
        const result = transferSetlistSchema.safeParse({
            setlistId: 'abc123',
            newOwnerEmail: 'not-an-email'
        })
        expect(result.success).toBe(false)
    })

    it('rejects missing email', () => {
        const result = transferSetlistSchema.safeParse({
            setlistId: 'abc123'
        })
        expect(result.success).toBe(false)
    })
})

describe('createSetlistSchema', () => {
    it('accepts valid setlist data', () => {
        const result = createSetlistSchema.safeParse({
            name: 'Shabbat Morning',
            tracks: []
        })
        expect(result.success).toBe(true)
    })

    it('accepts setlist with tracks and isPublic', () => {
        const result = createSetlistSchema.safeParse({
            name: 'Friday Night',
            tracks: [{ title: 'Lecha Dodi' }],
            isPublic: true
        })
        expect(result.success).toBe(true)
    })

    it('rejects empty name', () => {
        const result = createSetlistSchema.safeParse({
            name: '',
            tracks: []
        })
        expect(result.success).toBe(false)
    })

    it('rejects missing name', () => {
        const result = createSetlistSchema.safeParse({
            tracks: []
        })
        expect(result.success).toBe(false)
    })

    it('rejects missing tracks', () => {
        const result = createSetlistSchema.safeParse({
            name: 'Test'
        })
        expect(result.success).toBe(false)
    })

    it('isPublic is optional', () => {
        const result = createSetlistSchema.safeParse({
            name: 'Test',
            tracks: []
        })
        expect(result.success).toBe(true)
    })
})

describe('updateRoleSchema', () => {
    it('accepts valid role update', () => {
        const result = updateRoleSchema.safeParse({
            targetUserId: 'uid123',
            newRole: 'member'
        })
        expect(result.success).toBe(true)
    })

    it.each(['admin', 'band_leader', 'musician', 'member', 'pending'] as const)(
        'accepts role: %s',
        (role) => {
            const result = updateRoleSchema.safeParse({
                targetUserId: 'uid123',
                newRole: role
            })
            expect(result.success).toBe(true)
        }
    )

    it('rejects invalid role', () => {
        const result = updateRoleSchema.safeParse({
            targetUserId: 'uid123',
            newRole: 'superadmin'
        })
        expect(result.success).toBe(false)
    })

    it('rejects missing targetUserId', () => {
        const result = updateRoleSchema.safeParse({
            newRole: 'member'
        })
        expect(result.success).toBe(false)
    })

    it('rejects missing role', () => {
        const result = updateRoleSchema.safeParse({
            targetUserId: 'uid123'
        })
        expect(result.success).toBe(false)
    })
})
