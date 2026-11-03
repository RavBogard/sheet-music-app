import { describe, expect, it, vi } from 'vitest'

const redirect = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({
    permanentRedirect: (to: string) => {
        redirect(to)
        throw new Error('NEXT_REDIRECT')
    },
    notFound: () => {
        throw new Error('NEXT_NOT_FOUND')
    },
}))

import ListenRedirect from '../page'

describe('/listen/[id]', () => {
    it('permanently redirects to /rehearse/[id]', async () => {
        await expect(ListenRedirect({ params: Promise.resolve({ id: 'abc_1-2' }) })).rejects.toThrow('NEXT_REDIRECT')
        expect(redirect).toHaveBeenCalledWith('/rehearse/abc_1-2')
    })

    it('a malformed id is a 404, not a redirect', async () => {
        redirect.mockClear()
        await expect(ListenRedirect({ params: Promise.resolve({ id: '../x' }) })).rejects.toThrow('NEXT_NOT_FOUND')
        expect(redirect).not.toHaveBeenCalled()
    })
})
