import { vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Create a NextRequest for API route testing.
 */
export function makeReq(
    url: string,
    opts: {
        method?: string
        token?: string
        body?: Record<string, unknown>
        headers?: Record<string, string>
    } = {}
): NextRequest {
    const headers = new Headers()
    if (opts.token) headers.set('Authorization', `Bearer ${opts.token}`)
    if (opts.headers) {
        Object.entries(opts.headers).forEach(([k, v]) => headers.set(k, v))
    }

    const init: Record<string, unknown> = {
        method: opts.method || 'GET',
        headers,
    }
    if (opts.body) {
        headers.set('Content-Type', 'application/json')
        init.body = JSON.stringify(opts.body)
    }
    return new NextRequest(`http://localhost${url}`, init as never)
}

/** Mock rate-limit module — call vi.mock('@/lib/rate-limit', () => rateLimitMock) in test file */
export const rateLimitMock = {
    checkRateLimit: vi.fn(() => null),
}

/** Mock logger module — call vi.mock('@/lib/logger', () => loggerMock) in test file */
export const loggerMock = {
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}
