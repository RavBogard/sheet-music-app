import { describe, it, expect } from 'vitest'
import { transferSetlistSchema } from './validations'

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
